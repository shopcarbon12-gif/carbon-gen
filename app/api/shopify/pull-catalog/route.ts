import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";
import {
  upsertCartCatalogParents,
  type StagingParent,
  type StagingVariant,
  type SyncStatus,
} from "@/lib/shopifyCartStaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API_VERSION =
  (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
const MAX_PAGES = 40;
const PAGE_SIZE = 50;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function parseNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(normalizeText(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

async function getTokenForShop(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();

  const dbToken = !error ? normalizeText(data?.access_token) : "";
  if (dbToken) return dbToken;

  const envToken = getShopifyAdminToken(shop);
  if (envToken) return envToken;

  return null;
}

async function resolveFallbackShop() {
  const envShop = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "";
  if (envShop) return envShop;

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("shopify_tokens")
      .select("shop")
      .order("installed_at", { ascending: false })
      .limit(1);
    if (Array.isArray(data) && data.length > 0) {
      return normalizeShopDomain(normalizeText(data[0]?.shop) || "") || "";
    }
  } catch {
    // fallback
  }
  return "";
}

const FULL_CATALOG_QUERY = `
  query FullCatalog($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          status
          productType
          vendor
          publishedAt
          featuredImage {
            url
          }
          images(first: 4) {
            nodes {
              url
            }
          }
          variants(first: 100) {
            nodes {
              id
              sku
              barcode
              price
              compareAtPrice
              title
              selectedOptions {
                name
                value
              }
              image {
                url
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type ShopifyVariantNode = {
  id?: string;
  sku?: string;
  barcode?: string;
  price?: string;
  compareAtPrice?: string;
  title?: string;
  selectedOptions?: Array<{ name?: string; value?: string }>;
  image?: { url?: string };
};

type ShopifyProductNode = {
  id?: string;
  title?: string;
  handle?: string;
  status?: string;
  productType?: string;
  vendor?: string;
  publishedAt?: string;
  featuredImage?: { url?: string };
  images?: { nodes?: Array<{ url?: string }> };
  variants?: { nodes?: ShopifyVariantNode[] };
};

function extractOptionValue(variant: ShopifyVariantNode, optionName: string): string {
  if (!Array.isArray(variant.selectedOptions)) return "";
  const match = variant.selectedOptions.find(
    (opt) => normalizeText(opt.name).toLowerCase() === optionName.toLowerCase()
  );
  return normalizeText(match?.value);
}


function shopifyGidToNumericId(gid: string) {
  const match = normalizeText(gid).match(/\/(\d+)$/);
  return match ? match[1] : normalizeText(gid);
}

function transformProduct(product: ShopifyProductNode): StagingParent | null {
  const id = normalizeText(product.id);
  if (!id) return null;

  const parentId = shopifyGidToNumericId(id);
  const variants = Array.isArray(product.variants?.nodes)
    ? product.variants.nodes : [];

  const firstImage =
    normalizeText(product.featuredImage?.url) ||
    normalizeText(product.images?.nodes?.[0]?.url);

  const stagingVariants: StagingVariant[] = variants.map((v, index) => {
    const variantId = normalizeText(v.id)
      ? shopifyGidToNumericId(normalizeText(v.id))
      : `${parentId}-v-${index}`;

    return {
      id: variantId,
      parentId,
      sku: normalizeText(v.sku),
      upc: normalizeText(v.barcode),
      sellerSku: "",
      cartId: variantId,
      stock: null,
      stockByLocation: [],
      price: parseNumber(v.price),
      color: extractOptionValue(v, "Color"),
      size: extractOptionValue(v, "Size"),
      image: normalizeText(v.image?.url) || firstImage || "",
      status: "PROCESSED" as SyncStatus,
      error: null,
      shopifyMatched: true,
    };
  });

  const firstPrice = stagingVariants.find((v) => v.price !== null)?.price ?? null;
  const firstSku = stagingVariants.find((v) => v.sku)?.sku || normalizeText(product.handle);

  return {
    id: parentId,
    title: normalizeText(product.title) || normalizeText(product.handle),
    category: normalizeText(product.productType),
    brand: normalizeText(product.vendor),
    sku: firstSku,
    stock: null,
    price: firstPrice,
    variations: stagingVariants.length,
    image: firstImage || "",
    status: "PROCESSED" as SyncStatus,
    processedCount: stagingVariants.length,
    pendingCount: 0,
    errorCount: 0,
    variants: stagingVariants,
    error: null,
  };
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedShop = normalizeShopDomain(normalizeText(body?.shop) || "") || "";
    const shop = requestedShop || (await resolveFallbackShop());

    if (!shop) {
      return NextResponse.json(
        { error: "No Shopify shop configured. Connect a shop first." },
        { status: 400 }
      );
    }

    const token = await getTokenForShop(shop);
    if (!token) {
      return NextResponse.json(
        { error: `Shop ${shop} is not connected or token is missing.` },
        { status: 401 }
      );
    }

    let allProducts: StagingParent[] = [];
    let cursor: string | null = null;
    let pagesFetched = 0;

    while (pagesFetched < MAX_PAGES) {
      const resp: Response = await fetch(
        `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          body: JSON.stringify({
            query: FULL_CATALOG_QUERY,
            variables: { first: PAGE_SIZE, after: cursor },
          }),
          cache: "no-store",
        }
      );

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        console.error("[pull-catalog] Shopify API error:", resp.status, JSON.stringify(json?.errors || json).slice(0, 1000));
        return NextResponse.json(
          {
            error: `Shopify API error (${resp.status})`,
            details: json?.errors || json,
          },
          { status: resp.status >= 400 && resp.status < 500 ? resp.status : 502 }
        );
      }

      if (Array.isArray(json?.errors) && json.errors.length > 0) {
        console.error("[pull-catalog] Shopify GraphQL errors:", JSON.stringify(json.errors).slice(0, 1000));
        return NextResponse.json(
          { error: "Shopify GraphQL error", details: json.errors },
          { status: 400 }
        );
      }

      const edges = json?.data?.products?.edges || [];
      const pageInfo = json?.data?.products?.pageInfo || {};

      for (const edge of edges) {
        const node = edge?.node as ShopifyProductNode | undefined;
        if (!node) continue;
        const parent = transformProduct(node);
        if (parent) allProducts.push(parent);
      }

      pagesFetched += 1;

      if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
      cursor = pageInfo.endCursor;
    }

    if (allProducts.length === 0) {
      return NextResponse.json({
        ok: true,
        shop,
        pulled: 0,
        message: "No products found in Shopify catalog.",
      });
    }

    const result = await upsertCartCatalogParents(shop, allProducts);

    return NextResponse.json({
      ok: true,
      shop,
      pulled: allProducts.length,
      totalVariants: allProducts.reduce((sum, p) => sum + p.variants.length, 0),
      upserted: result.data.upserted,
      warning: result.warning || "",
      message: `Successfully pulled ${allProducts.length} products from Shopify.`,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error:
          normalizeText((e as { message?: string } | null)?.message) ||
          "Failed to pull Shopify catalog.",
      },
      { status: 500 }
    );
  }
}
