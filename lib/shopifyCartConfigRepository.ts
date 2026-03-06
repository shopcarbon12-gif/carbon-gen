import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";

type DbMode = "sql";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function hasCoolifySqlHint() {
  return Boolean(
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
      (process.env.COOLIFY_DATABASE_URL_FILE || "").trim() ||
      (process.env.DATABASE_URL_FILE || "").trim() ||
      process.env.COOLIFY_FQDN
  );
}

function getDbMode(): DbMode {
  const hasSql = hasSqlDatabaseConfigured();
  if (!hasSql && !hasCoolifySqlHint()) {
    throw new Error("SQL database is not configured.");
  }
  return "sql";
}

let _sqlTableEnsured = false;

async function ensureSqlTable() {
  if (_sqlTableEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS shopify_cart_config (
      shop TEXT PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  _sqlTableEnsured = true;
}

export async function loadShopifyCartConfig(shop: string): Promise<Record<string, unknown>> {
  const safeShop = normalizeText(shop);
  if (!safeShop) return {};
  getDbMode();
  await ensureSqlTable();
  const rows = await sqlQuery<{ config: unknown }>(
    `SELECT config FROM shopify_cart_config WHERE shop = $1 LIMIT 1`,
    [safeShop]
  );
  const config = rows[0]?.config;
  return config && typeof config === "object" ? (config as Record<string, unknown>) : {};
}

export async function upsertShopifyCartConfig(
  shop: string,
  config: Record<string, unknown>
): Promise<void> {
  const safeShop = normalizeText(shop);
  if (!safeShop) throw new Error("Invalid shop.");
  getDbMode();
  await ensureSqlTable();
  await sqlQuery(
    `INSERT INTO shopify_cart_config (shop, config, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (shop) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
    [safeShop, JSON.stringify(config || {})]
  );
}
