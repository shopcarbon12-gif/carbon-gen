import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";
import { isRequestAuthed } from "@/lib/auth";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2026-01").trim();

function normalizeShop(value: string) {
  const v = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v) ? v : "";
}

async function getAccessToken(shop: string) {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

interface CollNode {
  id?: string;
  title?: string;
  handle?: string;
  ruleSet?: { rules?: Array<{ column?: string }> } | null;
  productsCount?: { count?: number } | null;
}
interface CollPage {
  collections: { nodes: CollNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

export async function GET(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const shop = normalizeShop(String(req.nextUrl.searchParams.get("shop") || ""));
    if (!shop) return NextResponse.json({ error: "Missing or invalid shop." }, { status: 400 });

    const token = await getAccessToken(shop);
    if (!token) return NextResponse.json({ error: "Shop not connected." }, { status: 401 });

    const query = `
      query CollectionsPage($first: Int!, $after: String) {
        collections(first: $first, after: $after, sortKey: TITLE) {
          nodes { id title handle productsCount { count } ruleSet { rules { column } } }
          pageInfo { hasNextPage endCursor }
        }
      }`;

    const out: Array<{ id: string; title: string; handle: string; smart: boolean; productsCount: number }> = [];
    let after: string | null = null;
    // Up to ~1000 collections (4 pages) — plenty for almost any store.
    for (let page = 0; page < 4; page += 1) {
      const result: { ok: boolean; status: number; errors: unknown; data: CollPage | null } =
        await runShopifyGraphql<CollPage>({
          shop, token, query, variables: { first: 250, after }, apiVersion: API_VERSION,
        });
      if (!result.ok || result.errors) {
        if (out.length) break; // partial is fine
        return NextResponse.json(
          { error: "Shopify GraphQL error", details: result.errors },
          { status: result.status === 429 ? 429 : 400 }
        );
      }
      const nodes = result.data?.collections?.nodes || [];
      for (const n of nodes) {
        const id = String(n.id || "");
        if (!id) continue;
        out.push({
          id,
          title: String(n.title || ""),
          handle: String(n.handle || ""),
          smart: Array.isArray(n.ruleSet?.rules) && (n.ruleSet?.rules?.length || 0) > 0,
          productsCount: Number(n.productsCount?.count || 0),
        });
      }
      const pi = result.data?.collections?.pageInfo;
      if (!pi?.hasNextPage) break;
      after = pi.endCursor;
    }

    return NextResponse.json({ collections: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list collections" }, { status: 500 });
  }
}
