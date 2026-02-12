import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";

const API_VERSION =
  (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  barcodes: string[];
  images: Array<{ id: string; url: string; altText: string }>;
};

function toCatalogProducts(json: any): CatalogProduct[] {
  return (
    json?.data?.products?.edges?.map((edge: any) => ({
      id: edge?.node?.id,
      title: edge?.node?.title,
      handle: edge?.node?.handle,
      barcodes: Array.from(
        new Set(
          (edge?.node?.variants?.nodes || [])
            .map((variant: any) => String(variant?.barcode || "").trim())
            .filter((barcode: string) => barcode.length > 0)
        )
      ),
      images: (edge?.node?.images?.nodes || [])
        .map((img: any) => ({
          id: img?.id,
          url: img?.url,
          altText: img?.altText || "",
        }))
        .filter((img: any) => img?.url),
    })) || []
  );
}

function normalizeQuery(q: string) {
  return String(q || "").trim().toLowerCase();
}

function matchesQuery(product: CatalogProduct, q: string) {
  const query = normalizeQuery(q);
  if (!query) return true;
  const haystacks = [
    String(product.title || "").toLowerCase(),
    String(product.handle || "").toLowerCase(),
    ...(product.barcodes || []).map((v) => String(v || "").toLowerCase()),
  ];
  return haystacks.some((v) => v.includes(query));
}

async function getTokenCandidates(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();

  const dbToken = !error ? String(data?.access_token || "").trim() : "";
  const envToken = getShopifyAdminToken(shop);
  const tokens: Array<{ token: string; source: "db" | "env_token" }> = [];

  if (dbToken) tokens.push({ token: dbToken, source: "db" });
  if (envToken && envToken !== dbToken) {
    tokens.push({ token: envToken, source: "env_token" });
  }
  return tokens;
}

async function fetchCatalogWithToken(shop: string, token: string, q: string | null) {
  const query = `
    query ProductCatalog($query: String) {
      products(first: 100, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            handle
            variants(first: 50) {
              nodes {
                barcode
              }
            }
            images(first: 8) {
              nodes {
                id
                url
                altText
              }
            }
          }
        }
      }
    }
  `;

  try {
    const resp = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables: { query: q || null } }),
      cache: "no-store",
    });
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return {
        ok: false as const,
        status: resp.status,
        details: json?.errors || json,
      };
    }

    if (Array.isArray(json?.errors) && json.errors.length) {
      return {
        ok: false as const,
        status: 400,
        details: json.errors,
      };
    }

    return {
      ok: true as const,
      status: 200,
      products: toCatalogProducts(json),
    };
  } catch (e: any) {
    return {
      ok: false as const,
      status: 500,
      details: e?.message || "Catalog fetch failed",
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawShop = String(searchParams.get("shop") || "");
    const shop = normalizeShopDomain(rawShop) || "";
    const q = String(searchParams.get("q") || "").trim();

    if (!shop) {
      return NextResponse.json({ error: "Missing or invalid shop." }, { status: 400 });
    }

    const candidates = await getTokenCandidates(shop);
    if (!candidates.length) {
      return NextResponse.json({ error: "Shop not connected." }, { status: 401 });
    }

    let lastFailure: any = null;
    for (const candidate of candidates) {
      const attempt = await fetchCatalogWithToken(shop, candidate.token, q || null);
      if (!attempt.ok) {
        lastFailure = attempt;
        continue;
      }

      let products = attempt.products;
      // Shopify query syntax can be strict; fallback to broad fetch + local contains filter.
      if (q && products.length === 0) {
        const broad = await fetchCatalogWithToken(shop, candidate.token, null);
        if (broad.ok) {
          products = broad.products.filter((product) => matchesQuery(product, q));
        }
      }

      return NextResponse.json({ products, source: candidate.source });
    }

    return NextResponse.json(
      {
        error: "Shop not connected or token invalid.",
        details: lastFailure?.details || null,
      },
      { status: 401 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Catalog fetch failed" }, { status: 500 });
  }
}
