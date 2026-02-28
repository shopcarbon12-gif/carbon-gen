import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
const BASE_FILTER = "status:active";

type CountResult = number | { count?: number } | null;

async function fetchCount(
  shop: string,
  token: string,
  queryFilter: string
): Promise<number | null> {
  const query = `query ProductCount($query: String) { productsCount(query: $query, limit: null) { count } }`;
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables: { query: queryFilter } }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { productsCount?: CountResult } };
  const raw = json?.data?.productsCount;
  const count =
    typeof raw === "number"
      ? raw
      : raw && typeof raw === "object" && typeof raw.count === "number"
        ? raw.count
        : null;
  return count != null && Number.isFinite(count) ? count : null;
}

async function getToken(shop: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();
  const dbToken = String(data?.access_token || "").trim();
  if (dbToken) return dbToken;
  const envToken = getShopifyAdminToken(shop);
  return envToken || null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawShop = String(searchParams.get("shop") || "").trim();
    const shop = normalizeShopDomain(rawShop) || normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) {
      return NextResponse.json({ ok: false, error: "Missing or invalid shop.", productCount: null }, { status: 400 });
    }
    const token = await getToken(shop);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Shop not connected.", productCount: null }, { status: 401 });
    }
    const breakdown = String(searchParams.get("breakdown") || "").toLowerCase() === "1" || searchParams.get("breakdown") === "true";
    if (breakdown) {
      const [published, draft, archived] = await Promise.all([
        fetchCount(shop, token, "status:active published_status:published"),
        fetchCount(shop, token, "status:draft"),
        fetchCount(shop, token, "status:archived"),
      ]);
      const productCount = published ?? 0;
      return NextResponse.json({
        ok: true,
        productCount,
        shop,
        filter: "status:active",
        breakdown: {
          published: published ?? 0,
          draft: draft ?? 0,
          archived: archived ?? 0,
          total: (published ?? 0) + (draft ?? 0) + (archived ?? 0),
        },
        hint: "If draft is high and you pushed recently, check Cart Config > Product Status (post as Invisible).",
      });
    }
    const productCount = await fetchCount(shop, token, BASE_FILTER);
    return NextResponse.json({
      ok: true,
      productCount,
      shop,
      filter: "status:active",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, productCount: null }, { status: 500 });
  }
}
