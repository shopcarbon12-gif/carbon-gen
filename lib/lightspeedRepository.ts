import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";

type DbMode = "sql";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
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

let _tablesEnsured = false;

async function ensureSqlTables() {
  if (_tablesEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS lightspeed_pos_config (
      id TEXT PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS shopify_order_sync_log (
      id BIGSERIAL PRIMARY KEY,
      shopify_order_id BIGINT UNIQUE NOT NULL,
      shopify_order_name TEXT,
      ls_sale_id TEXT,
      status TEXT,
      error_message TEXT,
      processed_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS customer_ls_history (
      shopify_email TEXT PRIMARY KEY,
      ls_customer_id TEXT,
      sales_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      synced_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  _tablesEnsured = true;
}

export async function loadLightspeedPosConfig(
  id: string
): Promise<Record<string, unknown> | null> {
  const key = normalizeText(id);
  if (!key) return null;
  getDbMode();

  await ensureSqlTables();
  const rows = await sqlQuery<{ config: unknown }>(
    `SELECT config FROM lightspeed_pos_config WHERE id = $1 LIMIT 1`,
    [key]
  );
  const config = rows[0]?.config;
  return config && typeof config === "object" ? (config as Record<string, unknown>) : null;
}

export async function upsertLightspeedPosConfig(
  id: string,
  config: Record<string, unknown>
): Promise<void> {
  const key = normalizeText(id);
  if (!key) throw new Error("Invalid POS config key.");
  getDbMode();

  await ensureSqlTables();
  await sqlQuery(
    `INSERT INTO lightspeed_pos_config (id, config, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
    [key, JSON.stringify(config || {})]
  );
}

export async function getOrderSyncRecord(shopifyOrderId: number): Promise<{
  id: string | null;
  status: string | null;
  lsSaleId: string | null;
}> {
  if (!Number.isFinite(shopifyOrderId)) return { id: null, status: null, lsSaleId: null };
  getDbMode();
  await ensureSqlTables();
  const rows = await sqlQuery<{ id: string | number; status: string | null; ls_sale_id: string | null }>(
    `SELECT id,status,ls_sale_id FROM shopify_order_sync_log WHERE shopify_order_id = $1 LIMIT 1`,
    [shopifyOrderId]
  );
  const row = rows[0];
  return {
    id: normalizeText(row?.id) || null,
    status: normalizeText(row?.status) || null,
    lsSaleId: normalizeText(row?.ls_sale_id) || null,
  };
}

export async function insertOrderProcessing(shopifyOrderId: number, shopifyOrderName: string): Promise<void> {
  const orderName = normalizeText(shopifyOrderName);
  getDbMode();
  await ensureSqlTables();
  await sqlQuery(
    `INSERT INTO shopify_order_sync_log (shopify_order_id, shopify_order_name, status, processed_at)
     VALUES ($1,$2,'processing',now())`,
    [shopifyOrderId, orderName]
  );
}

export async function upsertOrderSyncRecord(input: {
  shopifyOrderId: number;
  shopifyOrderName: string;
  lsSaleId: string | null;
  status: string;
  errorMessage?: string | null;
}): Promise<void> {
  const row = {
    shopifyOrderId: input.shopifyOrderId,
    shopifyOrderName: normalizeText(input.shopifyOrderName),
    lsSaleId: normalizeText(input.lsSaleId) || null,
    status: normalizeText(input.status),
    errorMessage: normalizeText(input.errorMessage) || null,
  };
  getDbMode();
  await ensureSqlTables();
  await sqlQuery(
    `INSERT INTO shopify_order_sync_log
      (shopify_order_id, shopify_order_name, ls_sale_id, status, error_message, processed_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (shopify_order_id) DO UPDATE SET
      shopify_order_name = EXCLUDED.shopify_order_name,
      ls_sale_id = EXCLUDED.ls_sale_id,
      status = EXCLUDED.status,
      error_message = EXCLUDED.error_message,
      processed_at = now()`,
    [row.shopifyOrderId, row.shopifyOrderName, row.lsSaleId, row.status, row.errorMessage]
  );
}

export async function updateOrderCancelledStatus(
  shopifyOrderId: number,
  data: { status?: string; errorMessage?: string | null }
): Promise<void> {
  const status = normalizeText(data.status) || "cancelled";
  const errorMessage = normalizeText(data.errorMessage) || null;
  getDbMode();
  await ensureSqlTables();
  await sqlQuery(
    `UPDATE shopify_order_sync_log
     SET status = $2, error_message = $3, processed_at = now()
     WHERE shopify_order_id = $1`,
    [shopifyOrderId, status, errorMessage]
  );
}

export async function getCustomerLsHistory(shopifyEmail: string): Promise<{
  salesJson: unknown[];
  syncedAt: string | null;
}> {
  const email = normalizeLower(shopifyEmail);
  if (!email) return { salesJson: [], syncedAt: null };
  getDbMode();
  await ensureSqlTables();
  const rows = await sqlQuery<{ sales_json: unknown; synced_at: string | null }>(
    `SELECT sales_json, synced_at FROM customer_ls_history WHERE shopify_email = $1 LIMIT 1`,
    [email]
  );
  return {
    salesJson: Array.isArray(rows[0]?.sales_json) ? (rows[0]?.sales_json as unknown[]) : [],
    syncedAt: normalizeText(rows[0]?.synced_at) || null,
  };
}

export async function upsertCustomerLsHistory(input: {
  shopifyEmail: string;
  lsCustomerId: string;
  salesJson: unknown[];
}): Promise<void> {
  const email = normalizeLower(input.shopifyEmail);
  const customerId = normalizeText(input.lsCustomerId);
  const salesJson = Array.isArray(input.salesJson) ? input.salesJson : [];
  if (!email || !customerId) return;

  getDbMode();
  await ensureSqlTables();
  await sqlQuery(
    `INSERT INTO customer_ls_history (shopify_email, ls_customer_id, sales_json, synced_at)
     VALUES ($1,$2,$3::jsonb,now())
     ON CONFLICT (shopify_email) DO UPDATE SET
       ls_customer_id = EXCLUDED.ls_customer_id,
       sales_json = EXCLUDED.sales_json,
       synced_at = now()`,
    [email, customerId, JSON.stringify(salesJson)]
  );
}
