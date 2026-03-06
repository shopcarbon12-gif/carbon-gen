import { NextRequest, NextResponse } from "next/server";
import { getShopifyAdminToken, normalizeShopDomain, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

async function getToken(shop: string): Promise<string | null> {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { shop?: string; titles?: string[] };
    const rawShop = String(body.shop || "").trim();
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) return NextResponse.json({ ok: false, error: "Missing shop" }, { status: 400 });
    const token = await getToken(shop);
    if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 401 });

    const titles = body.titles || [];
    const results: Array<{
      searchTitle: string;
      found: Array<{ id: string; title: string; status: string; variants: number }>;
    }> = [];

    for (const t of titles) {
      const escaped = t.replace(/"/g, '\\"');
      const res = await runShopifyGraphql<{
        products?: {
          edges: Array<{
            node: { id: string; title: string; status: string; variantsCount?: { count?: number } };
          }>;
        };
      }>({
        shop,
        token,
        query: `query { products(first: 10, query: "title:'${escaped}'") { edges { node { id title status variantsCount { count } } } } }`,
        variables: {},
        apiVersion: API_VERSION,
      });

      const edges = res.data?.products?.edges || [];
      const found = edges.map((edge: { node: { id: string; title: string; status: string; variantsCount?: { count?: number } } }) => ({
        id: edge.node.id,
        title: edge.node.title,
        status: edge.node.status,
        variants: edge.node.variantsCount?.count ?? 0,
      }));

      results.push({ searchTitle: t, found });
    }

    const archived = results.flatMap((r) =>
      r.found.filter((f) => f.status === "ARCHIVED").map((f) => ({ searchTitle: r.searchTitle, ...f }))
    );

    return NextResponse.json({
      ok: true,
      searched: titles.length,
      totalArchived: archived.length,
      archived,
      allResults: results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
