/**
 * Persists "last sync" metadata so Compare works across server instances.
 * Stage-add sessions are stored in memory (undo) and optionally in Supabase.
 * Compare reads from Supabase first; if empty, falls back to in-memory sessions.
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

const TABLE = "shopify_cart_sync_log";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toShopKey(shop: string) {
  return normalizeShopDomain(normalizeText(shop)) || normalizeText(shop).toLowerCase() || "";
}

function tryGetSupabase() {
  try {
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/**
 * Log a stage-add batch so Compare can find it later.
 * Call this after each successful stage-add chunk.
 */
export async function logStageAdd(shop: string, parentIds: string[]): Promise<void> {
  const shopKey = toShopKey(shop);
  if (!shopKey || parentIds.length < 1) return;

  const ids = Array.from(new Set(parentIds.map((id) => normalizeText(id)).filter(Boolean)));
  if (ids.length < 1) return;

  const supabase = tryGetSupabase();
  if (!supabase) return;

  await supabase.from(TABLE).insert({
    shop: shopKey,
    action: "stage-add",
    parent_ids: ids,
    created_at: new Date().toISOString(),
  });
}

/**
 * Get all parent IDs that were part of recent stage-add operations (within last N minutes).
 * Used by Compare to determine which cart items came from the last queue sync.
 */
export async function getRecentStageAddParentIds(
  shop: string,
  withinMinutes = 10
): Promise<Set<string>> {
  const shopKey = toShopKey(shop);
  if (!shopKey) return new Set();

  const supabase = tryGetSupabase();
  if (!supabase) return new Set();

  const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from(TABLE)
    .select("parent_ids, created_at")
    .eq("shop", shopKey)
    .eq("action", "stage-add")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !Array.isArray(data)) return new Set();

  const ids = new Set<string>();
  for (const row of data) {
    const arr = row?.parent_ids;
    if (!Array.isArray(arr)) continue;
    for (const id of arr) {
      const n = normalizeText(id);
      if (n) ids.add(normalizeLower(n));
    }
  }
  return ids;
}
