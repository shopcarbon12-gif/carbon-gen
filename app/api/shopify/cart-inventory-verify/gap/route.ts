import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed, isCronAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
} from "@/lib/shopify";
import {
  listCartCatalogParents,
} from "@/lib/shopifyCartStaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

function norm(v: unknown) {
  return String(v ?? "").trim();
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
  return getShopifyAdminToken(shop) || null;
}

function extractProductId(cartId: string): string | null {
  const c = norm(cartId);
  if (!c) return null;
  if (c.includes("~")) return c.split("~")[0];
  const gidMatch = c.match(/ProductVariant\/(\d+)/);
  if (gidMatch) return `variant:${gidMatch[1]}`;
  if (/^\d+$/.test(c)) return `variant:${c}`;
  return null;
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req) && !isCronAuthed(req)) {
    const url = new URL(req.url);
    const secret = (process.env.CRON_SECRET || "").trim();
    if (!secret || url.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawShop = norm(searchParams.get("shop"));
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400 });
    const token = await getToken(shop);
    if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

    const cart = await listCartCatalogParents(shop);
    const parents = cart.data;

    const variantIdsNeedingLookup: string[] = [];
    const parentProductMap = new Map<string, Set<string>>();

    for (const p of parents) {
      const productIds = new Set<string>();
      for (const v of p.variants || []) {
        const cid = norm(v.cartId);
        if (!cid) continue;
        if (cid.includes("~")) {
          productIds.add(cid.split("~")[0]);
        } else {
          const gidMatch = cid.match(/ProductVariant\/(\d+)/);
          const vid = gidMatch ? gidMatch[1] : /^\d+$/.test(cid) ? cid : null;
          if (vid) variantIdsNeedingLookup.push(vid);
        }
      }
      parentProductMap.set(p.id, productIds);
    }

    const variantToProduct = new Map<string, string>();
    if (variantIdsNeedingLookup.length) {
      const unique = Array.from(new Set(variantIdsNeedingLookup));
      for (let i = 0; i < unique.length; i += 50) {
        const batch = unique.slice(i, i + 50);
        const gids = batch.map((id) => `"gid://shopify/ProductVariant/${id}"`).join(",");
        const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({
            query: `{ nodes(ids: [${gids}]) { ... on ProductVariant { id product { id } } } }`,
          }),
        });
        const json = await res.json();
        const nodes = json?.data?.nodes || [];
        for (const n of nodes) {
          if (!n?.id || !n?.product?.id) continue;
          const vid = n.id.replace("gid://shopify/ProductVariant/", "");
          const pid = n.product.id.replace("gid://shopify/Product/", "");
          variantToProduct.set(vid, pid);
        }
        if (i + 50 < unique.length) await new Promise((r) => setTimeout(r, 200));
      }
    }

    for (const p of parents) {
      const set = parentProductMap.get(p.id)!;
      for (const v of p.variants || []) {
        const cid = norm(v.cartId);
        if (!cid || cid.includes("~")) continue;
        const gidMatch = cid.match(/ProductVariant\/(\d+)/);
        const vid = gidMatch ? gidMatch[1] : /^\d+$/.test(cid) ? cid : null;
        if (vid) {
          const pid = variantToProduct.get(vid);
          if (pid) set.add(pid);
        }
      }
    }

    const shopifyProductToParents = new Map<string, { parentId: string; title: string }[]>();
    for (const p of parents) {
      const set = parentProductMap.get(p.id)!;
      Array.from(set).forEach((pid) => {
        const arr = shopifyProductToParents.get(pid) || [];
        arr.push({ parentId: p.id, title: p.title || p.id });
        shopifyProductToParents.set(pid, arr);
      });
    }

    const duplicates: { shopifyProductId: string; cartParents: { parentId: string; title: string }[] }[] = [];
    for (const [pid, arr] of Array.from(shopifyProductToParents.entries())) {
      if (arr.length > 1) duplicates.push({ shopifyProductId: pid, cartParents: arr });
    }

    const parentsWithNoShopifyProduct: { parentId: string; title: string; variantCount: number; hasCartId: boolean }[] = [];
    for (const p of parents) {
      const set = parentProductMap.get(p.id)!;
      if (set.size === 0) {
        const hasAnyCartId = (p.variants || []).some((v) => norm(v.cartId));
        parentsWithNoShopifyProduct.push({
          parentId: p.id,
          title: p.title || p.id,
          variantCount: (p.variants || []).length,
          hasCartId: hasAnyCartId,
        });
      }
    }

    const uniqueShopifyProducts = new Set<string>();
    Array.from(parentProductMap.values()).forEach((set) => {
      Array.from(set).forEach((pid) => uniqueShopifyProducts.add(pid));
    });

    return NextResponse.json({
      ok: true,
      cartParentCount: parents.length,
      uniqueShopifyProductsMapped: uniqueShopifyProducts.size,
      gap: parents.length - uniqueShopifyProducts.size,
      parentsWithNoShopifyProduct,
      parentsWithNoShopifyProductCount: parentsWithNoShopifyProduct.length,
      duplicateMappings: duplicates,
      duplicateMappingsCount: duplicates.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
