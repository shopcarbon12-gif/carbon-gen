import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken, runShopifyGraphql } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";
import { isRequestAuthed } from "@/lib/auth";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2026-01").trim();
export const SEO_META_NAMESPACE = "carbon_seo";
export const SEO_META_KEY = "optimized_at";

function normalizeShop(value: string) {
  const v = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v) ? v : "";
}
async function getAccessToken(shop: string) {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  featuredImage?: { url?: string } | null;
  optimized?: { value?: string } | null;
}
interface Page {
  products: { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

export async function GET(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const shop = normalizeShop(String(req.nextUrl.searchParams.get("shop") || ""));
    if (!shop) return NextResponse.json({ error: "Missing or invalid shop." }, { status: 400 });
    const target = Math.max(10, Math.min(Number(req.nextUrl.searchParams.get("target")) || 100, 200));
    const after: string | null = String(req.nextUrl.searchParams.get("after") || "").trim() || null;

    const token = await getAccessToken(shop);
    if (!token) return NextResponse.json({ error: "Shop not connected." }, { status: 401 });

    const query = `
      query BulkList($first: Int!, $after: String) {
        products(first: $first, after: $after, sortKey: TITLE) {
          nodes {
            id
            title
            handle
            featuredImage { url }
            optimized: metafield(namespace: "${SEO_META_NAMESPACE}", key: "${SEO_META_KEY}") { value }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`;

    // Collect up to `target` products that HAVE an image, paging internally.
    const out: Array<{ id: string; title: string; handle: string; image: string | null; optimizedAt: string | null }> = [];
    let hasNextPage = false;
    let endCursor: string | null = after;
    for (let i = 0; i < 8 && out.length < target; i += 1) {
      const result: { ok: boolean; status: number; errors: unknown; data: Page | null } =
        await runShopifyGraphql<Page>({ shop, token, query, variables: { first: 250, after: endCursor }, apiVersion: API_VERSION });
      if (!result.ok || result.errors) {
        if (out.length) break;
        return NextResponse.json({ error: "Shopify GraphQL error", details: result.errors }, { status: result.status === 429 ? 429 : 400 });
      }
      const nodes = result.data?.products?.nodes || [];
      for (const n of nodes) {
        const img = n.featuredImage?.url || "";
        if (!img) continue; // products WITH pictures only
        out.push({ id: n.id, title: n.title || "", handle: n.handle || "", image: img, optimizedAt: n.optimized?.value || null });
        if (out.length >= target) break;
      }
      const pi = result.data?.products?.pageInfo;
      hasNextPage = Boolean(pi?.hasNextPage);
      endCursor = pi?.endCursor || null;
      if (!hasNextPage) break;
    }

    return NextResponse.json({ products: out, pageInfo: { hasNextPage, endCursor } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Bulk list failed" }, { status: 500 });
  }
}
