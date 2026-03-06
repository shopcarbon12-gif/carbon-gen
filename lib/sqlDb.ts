import { Pool } from "pg";
import fs from "node:fs";

let _pool: Pool | null = null;
let _tablesEnsured = false;
let _ensureReadyInFlight: Promise<void> | null = null;

function readFirstExistingFile(paths: string[]) {
  for (const p of paths) {
    const filePath = String(p || "").trim();
    if (!filePath) continue;
    try {
      if (fs.existsSync(filePath)) {
        const value = fs.readFileSync(filePath, "utf8").trim();
        if (value) return value;
      }
    } catch {
      // Ignore unreadable files and continue fallback chain.
    }
  }
  return "";
}

function resolveSqlConnectionString(): string {
  const fromFile = readFirstExistingFile([
    process.env.DATABASE_URL_FILE || "",
    process.env.COOLIFY_DATABASE_URL_FILE || "",
    "/app/.coolify-database-url",
  ]);
  if (fromFile) return fromFile;
  return (
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
    (process.env.POSTGRES_URL || "").trim() ||
    (process.env.DATABASE_URL || "").trim()
  );
}

export function hasSqlDatabaseConfigured(): boolean {
  return Boolean(resolveSqlConnectionString());
}

function getPool(): Pool {
  if (_pool) return _pool;
  const url = resolveSqlConnectionString();
  if (!url) throw new Error("Missing SQL connection string (COOLIFY_DATABASE_URL/POSTGRES_URL/DATABASE_URL)");
  _pool = new Pool({ connectionString: url });
  return _pool;
}

/** Run a single parameterized query and return rows. */
export async function sqlQuery<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool();
  const { rows } = await pool.query(query, params);
  return rows as T[];
}

/** Initialize the tables we need in SQL. Safe to call multiple times. */
export async function ensureSqlTables(): Promise<void> {
  const pool = getPool();
  await pool.query(`
      CREATE TABLE IF NOT EXISTS shopify_cart_inventory_staging (
        shop TEXT NOT NULL,
        parent_id TEXT NOT NULL,
        parent_sku TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        brand TEXT NOT NULL DEFAULT '',
        stock DOUBLE PRECISION,
        price DOUBLE PRECISION,
        image TEXT NOT NULL DEFAULT '',
        description TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        error_message TEXT,
        variants JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (shop, parent_id)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_staging_shop ON shopify_cart_inventory_staging(shop)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_staging_updated ON shopify_cart_inventory_staging(shop, updated_at DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopify_cart_sync_log (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        shop TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'stage-add',
        parent_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sync_log_shop ON shopify_cart_sync_log(shop, created_at DESC)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_sync_log_shop_action_created ON shopify_cart_sync_log(shop, action, created_at DESC)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_staging_shop_parent_updated ON shopify_cart_inventory_staging(shop, parent_id, updated_at DESC)`
  );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopify_cart_sync_activity (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        shop TEXT NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        items_checked INT NOT NULL DEFAULT 0,
        items_updated INT NOT NULL DEFAULT 0,
        variants_added INT NOT NULL DEFAULT 0,
        variants_deleted INT NOT NULL DEFAULT 0,
        products_archived INT NOT NULL DEFAULT 0,
        errors INT NOT NULL DEFAULT 0,
        error_details TEXT,
        duration_ms INT NOT NULL DEFAULT 0
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shopify_cart_sync_changes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        sync_id UUID REFERENCES shopify_cart_sync_activity(id) ON DELETE CASCADE,
        parent_id TEXT NOT NULL,
        product_title TEXT,
        variant_sku TEXT,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lightspeed_sales_sync_state (
        id INT PRIMARY KEY DEFAULT 1,
        last_sync_time TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT single_row CHECK (id = 1)
      )
    `);
}

/** Call once at app startup or first use to guarantee tables exist. */
export async function ensureSqlReady(): Promise<void> {
  if (_tablesEnsured) return;
  if (_ensureReadyInFlight) {
    await _ensureReadyInFlight;
    return;
  }
  _ensureReadyInFlight = (async () => {
    await ensureSqlTables();
    _tablesEnsured = true;
  })();
  try {
    await _ensureReadyInFlight;
  } finally {
    _ensureReadyInFlight = null;
  }
}
