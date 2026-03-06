/**
 * Persists "last sync" metadata so Compare works across server instances.
 * Uses SQL (Postgres) persistence for cross-instance consistency.
 */

import { sqlQuery, ensureSqlReady, hasSqlDatabaseConfigured } from "@/lib/sqlDb";
import { normalizeShopDomain } from "@/lib/shopify";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toShopKey(shop: string) {
  return normalizeShopDomain(normalizeText(shop)) || normalizeText(shop).toLowerCase() || "";
}

async function trySql(): Promise<boolean> {
  try {
    if (!hasSqlDatabaseConfigured()) return false;
    await ensureSqlReady();
    return true;
  } catch {
    return false;
  }
}

/**
 * Log a stage-add batch so Compare can find it later.
 */
export async function logStageAdd(shop: string, parentIds: string[]): Promise<void> {
  const shopKey = toShopKey(shop);
  if (!shopKey || parentIds.length < 1) return;

  const ids = Array.from(new Set(parentIds.map((id) => normalizeText(id)).filter(Boolean)));
  if (ids.length < 1) return;

  if (!(await trySql())) return;

  try {
    await sqlQuery(
      `INSERT INTO shopify_cart_sync_log (shop, action, parent_ids, created_at)
       VALUES ($1, $2, $3, $4)`,
      [shopKey, "stage-add", JSON.stringify(ids), new Date().toISOString()]
    );
  } catch (err) {
    console.warn("[sync-log] Failed to log stage-add:", (err as Error)?.message);
  }
}

/**
 * Get all parent IDs that were part of recent stage-add operations (within last N minutes).
 */
export async function getRecentStageAddParentIds(
  shop: string,
  withinMinutes = 10
): Promise<Set<string>> {
  const shopKey = toShopKey(shop);
  if (!shopKey) return new Set();

  if (!(await trySql())) return new Set();

  try {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();

    const rows = await sqlQuery<{ parent_ids: string | string[] }>(
      `SELECT parent_ids FROM shopify_cart_sync_log
       WHERE shop = $1 AND action = $2 AND created_at >= $3
       ORDER BY created_at DESC
       LIMIT 50`,
      [shopKey, "stage-add", cutoff]
    );

    const ids = new Set<string>();
    for (const row of rows) {
      const arr = typeof row.parent_ids === "string" ? JSON.parse(row.parent_ids) : row.parent_ids;
      if (!Array.isArray(arr)) continue;
      for (const id of arr) {
        const n = normalizeText(id);
        if (n) ids.add(normalizeLower(n));
      }
    }
    return ids;
  } catch (err) {
    console.warn("[sync-log] Failed to read recent stage-adds:", (err as Error)?.message);
    return new Set();
  }
}
