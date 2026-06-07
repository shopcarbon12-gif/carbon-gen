import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";
import { isRequestAuthed } from "@/lib/auth";
import { scoreAll } from "@/lib/seo/deterministic";
import type { ProductContext, SeoFields } from "@/lib/seo/types";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2026-01").trim();

function normalizeShop(value: string) {
  const v = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v) ? v : "";
}

function toProductGid(productId: string) {
  const id = String(productId || "").trim();
  if (!id) return "";
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

async function getAccessToken(shop: string) {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  const fallback = getShopifyAdminToken(shop);
  return fallback || null;
}

const PRODUCT_FIELDS = `
  id
  title
  handle
  descriptionHtml
  productType
  vendor
  tags
  onlineStoreUrl
  seo { title description }
  priceRangeV2 { minVariantPrice { amount currencyCode } }
  media(first: 50) {
    nodes { ... on MediaImage { id image { url altText } } }
  }
  variants(first: 50) { nodes { id sku barcode price } }
`;

interface AuditProduct {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[] | null;
  onlineStoreUrl: string | null;
  seo: { title: string | null; description: string | null } | null;
  priceRangeV2?: { minVariantPrice?: { amount?: string; currencyCode?: string } };
  media?: { nodes: Array<{ id?: string; image?: { url?: string; altText?: string | null } }> };
  variants?: { nodes: Array<{ id: string; sku?: string | null; barcode?: string | null; price?: string | null }> };
}

export async function POST(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const shop = normalizeShop(String(body?.shop || ""));
    const handle = String(body?.handle || "").trim();
    const productId = toProductGid(String(body?.productId || ""));

    if (!shop) return NextResponse.json({ error: "Missing or invalid shop." }, { status: 400 });
    if (!handle && !productId) {
      return NextResponse.json({ error: "Provide handle or productId." }, { status: 400 });
    }

    const token = await getAccessToken(shop);
    if (!token) return NextResponse.json({ error: "Shop not connected." }, { status: 401 });

    const query = handle
      ? `query Audit($handle: String!) { productByHandle(handle: $handle) { ${PRODUCT_FIELDS} } }`
      : `query Audit($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`;
    const variables = handle ? { handle } : { id: productId };

    const result = await runShopifyGraphql<{ product?: AuditProduct; productByHandle?: AuditProduct }>({
      shop,
      token,
      query,
      variables,
      apiVersion: API_VERSION,
    });

    if (!result.ok || result.errors) {
      return NextResponse.json(
        { error: "Shopify GraphQL error", details: result.errors || result.data },
        { status: result.status === 429 ? 429 : 400 }
      );
    }

    const product = result.data?.productByHandle || result.data?.product;
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });

    const mediaNodes = (product.media?.nodes || []).filter((n) => n && n.id);
    const variantNodes = product.variants?.nodes || [];

    const fields: SeoFields = {
      title: product.title || "",
      seoTitle: product.seo?.title || "",
      metaDescription: product.seo?.description || "",
      handle: product.handle || "",
      bodyHtml: product.descriptionHtml || "",
      tags: product.tags || [],
      productType: product.productType || "",
      vendor: product.vendor || "",
      imageAlts: mediaNodes.map((n) => ({
        id: String(n.id || ""),
        url: String(n.image?.url || ""),
        altText: String(n.image?.altText || ""),
      })),
    };

    const context: ProductContext = {
      productId: product.id,
      handle: product.handle || "",
      title: product.title || "",
      productType: product.productType || "",
      vendor: product.vendor || "",
      tags: product.tags || [],
      price: product.priceRangeV2?.minVariantPrice?.amount || undefined,
      currency: product.priceRangeV2?.minVariantPrice?.currencyCode || undefined,
      variantSkus: variantNodes.map((v) => String(v.sku || "")).filter(Boolean).slice(0, 10),
      barcodes: variantNodes.map((v) => String(v.barcode || "")).filter(Boolean).slice(0, 10),
      imageCount: mediaNodes.length,
      onlineStoreUrl: product.onlineStoreUrl || undefined,
    };

    const scorecard = scoreAll(fields);

    return NextResponse.json({
      product: { id: product.id, title: product.title, onlineStoreUrl: product.onlineStoreUrl },
      current: fields,
      context,
      scorecard,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SEO audit failed" }, { status: 500 });
  }
}
