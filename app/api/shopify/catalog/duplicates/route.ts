import { NextRequest, NextResponse } from "next/server";
import { getShopifyAdminToken, normalizeShopDomain, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

async function getToken(shop: string): Promise<string | null> {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  const envToken = getShopifyAdminToken(shop);
  return envToken || null;
}

type ProductNode = {
  id: string;
  title: string;
  status: string;
  variantsCount?: { count?: number };
  hasOnlyDefaultVariant?: boolean;
  productType?: string;
  vendor?: string;
  descriptionHtml?: string;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawShop = String(searchParams.get("shop") || "").trim();
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) {
      return NextResponse.json({ ok: false, error: "Missing shop" }, { status: 400 });
    }
    const token = await getToken(shop);
    if (!token) {
      return NextResponse.json({ ok: false, error: "No token" }, { status: 401 });
    }

    const allProducts: ProductNode[] = [];
    let cursor: string | null = null;
    const MAX_PAGES = 80;

    for (let page = 0; page < MAX_PAGES; page++) {
      const afterClause: string = cursor ? `, after: "${cursor}"` : "";
      const res = await runShopifyGraphql<{
        products?: {
          edges: Array<{ node: ProductNode; cursor: string }>;
          pageInfo: { hasNextPage: boolean };
        };
      }>({
        shop,
        token,
        query: `query {
          products(first: 250, query: "status:active"${afterClause}) {
            edges {
              node {
                id
                title
                status
                variantsCount { count }
                hasOnlyDefaultVariant
                productType
                vendor
                descriptionHtml
              }
              cursor
            }
            pageInfo { hasNextPage }
          }
        }`,
        variables: {},
        apiVersion: API_VERSION,
      });

      if (!res.ok || !res.data?.products) break;

      const edges = res.data.products.edges;
      for (const edge of edges) {
        if (edge.node.status === "ACTIVE") {
          allProducts.push(edge.node);
        }
      }
      cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
      if (!res.data.products.pageInfo.hasNextPage) break;
    }

    const titleMap = new Map<string, ProductNode[]>();
    for (const p of allProducts) {
      const key = (p.title || "").trim().toLowerCase();
      if (!key) continue;
      const arr = titleMap.get(key) || [];
      arr.push(p);
      titleMap.set(key, arr);
    }

    const duplicates: Array<{
      title: string;
      count: number;
      products: Array<{
        id: string;
        variants: number;
        productType: string;
        vendor: string;
        hasDescription: boolean;
      }>;
    }> = [];

    for (const [, products] of titleMap) {
      if (products.length < 2) continue;
      duplicates.push({
        title: products[0].title,
        count: products.length,
        products: products.map((p) => ({
          id: p.id,
          variants: p.variantsCount?.count ?? (p.hasOnlyDefaultVariant ? 1 : 0),
          productType: p.productType || "",
          vendor: p.vendor || "",
          hasDescription: !!(p.descriptionHtml && p.descriptionHtml.trim().length > 0),
        })),
      });
    }

    duplicates.sort((a, b) => b.count - a.count);

    return NextResponse.json({
      ok: true,
      totalActiveProducts: allProducts.length,
      duplicateGroups: duplicates.length,
      totalDuplicateProducts: duplicates.reduce((sum, d) => sum + d.count, 0),
      duplicates,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
