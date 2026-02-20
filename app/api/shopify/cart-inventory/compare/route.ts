import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listCartCatalogParents } from "@/lib/shopifyCartStaging";
import { getRecentStageAddParentIds } from "@/lib/shopifyCartSyncLog";
import {
  getRecentStageAddSessions,
  extractParentIdsFromStageAddSession,
} from "@/lib/shopifySyncSessionUndo";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function resolveFallbackShop(availableShops: string[]) {
  const envShop =
    normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "";
  return envShop || availableShops[0] || "";
}

async function getAvailableShops(): Promise<string[]> {
  let dbShops: string[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("shop,installed_at")
      .order("installed_at", { ascending: false })
      .limit(100);
    if (!error && Array.isArray(data)) {
      dbShops = data
        .map((row) =>
          normalizeShopDomain(
            normalizeText((row as { shop?: string } | null)?.shop) || ""
          )
        )
        .filter((shop): shop is string => Boolean(shop));
    }
  } catch {
    // fallback when Supabase unavailable
  }
  const out = new Set<string>(dbShops);
  const envShop =
    normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "");
  if (envShop) out.add(envShop);
  return Array.from(out);
}

/**
 * GET /api/shopify/cart-inventory/compare?shop=xxx
 * Returns Cart Inventory items that were NOT part of the last queue sync from LS inventory.
 * Uses undo session history: the last stage-add session records which parent IDs were synced.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const availableShops = await getAvailableShops();
    const requestedShop =
      normalizeShopDomain(normalizeText(searchParams.get("shop")) || "") || "";
    const shop = requestedShop || resolveFallbackShop(availableShops);

    const listed = await listCartCatalogParents(shop);
    const allCartRows = listed.data;
    const totalCartCount = allCartRows.length;

    let idsInLastSync = await getRecentStageAddParentIds(shop, 10);
    if (idsInLastSync.size < 1) {
      const recentSessions = getRecentStageAddSessions(shop, 10);
      for (const session of recentSessions) {
        for (const id of extractParentIdsFromStageAddSession(session)) {
          idsInLastSync.add(id);
        }
      }
    }

    if (idsInLastSync.size < 1) {
      return NextResponse.json({
        ok: true,
        shop,
        rows: [],
        lastSyncCount: 0,
        totalCartCount,
        notInLastSyncCount: 0,
        hasLastSync: false,
        message:
          "No recent queue sync found. Queue items from the Inventory page first, then use Compare.",
      });
    }

    const lastSyncCount = idsInLastSync.size;

    const notInLastSync = allCartRows.filter(
      (row) => !idsInLastSync.has(normalizeLower(row.id))
    );
    return NextResponse.json({
      ok: true,
      shop,
      rows: notInLastSync,
      lastSyncCount,
      totalCartCount,
      notInLastSyncCount: notInLastSync.length,
      hasLastSync: true,
      lastSyncNote: `Last sync: ${lastSyncCount} product(s) queued from Inventory.`,
    });
  } catch (e: unknown) {
    const message =
      normalizeText((e as { message?: string } | null)?.message) ||
      "Unable to fetch compare data.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
