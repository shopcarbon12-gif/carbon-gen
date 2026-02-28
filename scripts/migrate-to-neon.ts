/**
 * One-time migration: Copy staging data from Supabase → Neon.
 * Run with: npx tsx scripts/migrate-to-neon.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { Pool, neon } from "@neondatabase/serverless";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const NEON_URL = (process.env.NEON_DATABASE_URL || "").trim();

if (!SUPABASE_URL || !SUPABASE_KEY || !NEON_URL) {
  console.error("Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEON_DATABASE_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const pool = new Pool({ connectionString: NEON_URL });
const sql = neon(NEON_URL);

async function ensureTables() {
  console.log("Ensuring Neon tables exist...");
  const { ensureNeonTables } = await import("../lib/neonDb");
  await ensureNeonTables();
  console.log("Tables ready.");
}

async function migrateStaging() {
  console.log("\n--- Migrating shopify_cart_inventory_staging ---");
  const PAGE = 500;
  let offset = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from("shopify_cart_inventory_staging")
      .select("*")
      .range(offset, offset + PAGE - 1)
      .order("updated_at", { ascending: true });

    if (error) {
      console.error("Supabase staging read error:", error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      await pool.query(
        `INSERT INTO shopify_cart_inventory_staging
           (shop, parent_id, parent_sku, title, category, brand, stock, price, image, description, status, error_message, variants, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (shop, parent_id) DO UPDATE SET
           parent_sku = EXCLUDED.parent_sku,
           title = EXCLUDED.title,
           category = EXCLUDED.category,
           brand = EXCLUDED.brand,
           stock = EXCLUDED.stock,
           price = EXCLUDED.price,
           image = EXCLUDED.image,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           error_message = EXCLUDED.error_message,
           variants = EXCLUDED.variants,
           updated_at = EXCLUDED.updated_at`,
        [
          row.shop || "",
          row.parent_id || "",
          row.parent_sku || "",
          row.title || "",
          row.category || "",
          row.brand || "",
          row.stock ?? null,
          row.price ?? null,
          row.image || "",
          row.description || null,
          row.status || "PENDING",
          row.error_message || null,
          JSON.stringify(row.variants || []),
          row.created_at || new Date().toISOString(),
          row.updated_at || new Date().toISOString(),
        ]
      );
    }

    total += data.length;
    console.log(`  Copied ${total} staging rows so far...`);
    offset += PAGE;
  }

  console.log(`Staging migration complete: ${total} rows total.`);
}

async function migrateSyncLog() {
  console.log("\n--- Migrating shopify_cart_sync_log ---");
  const { data, error } = await supabase
    .from("shopify_cart_sync_log")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1000);

  if (error) {
    if (error.code === "42P01") {
      console.log("  Table does not exist in Supabase. Skipping.");
      return;
    }
    console.error("Supabase sync_log read error:", error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log("  No sync log rows to migrate.");
    return;
  }

  for (const row of data) {
    await pool.query(
      `INSERT INTO shopify_cart_sync_log (shop, action, parent_ids, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [row.shop, row.action || "stage-add", JSON.stringify(row.parent_ids || []), row.created_at]
    );
  }
  console.log(`Sync log migration complete: ${data.length} rows.`);
}

async function migrateSyncActivity() {
  console.log("\n--- Migrating shopify_cart_sync_activity ---");
  const { data, error } = await supabase
    .from("shopify_cart_sync_activity")
    .select("*")
    .order("synced_at", { ascending: true })
    .limit(1000);

  if (error) {
    if (error.code === "42P01") {
      console.log("  Table does not exist in Supabase. Skipping.");
      return;
    }
    console.error("Supabase sync_activity read error:", error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log("  No sync activity rows to migrate.");
    return;
  }

  for (const row of data) {
    await pool.query(
      `INSERT INTO shopify_cart_sync_activity
         (id, shop, synced_at, items_checked, items_updated, variants_added, variants_deleted, products_archived, errors, error_details, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING`,
      [
        row.id, row.shop, row.synced_at,
        row.items_checked || 0, row.items_updated || 0,
        row.variants_added || 0, row.variants_deleted || 0,
        row.products_archived || 0, row.errors || 0,
        row.error_details || null, row.duration_ms || 0,
      ]
    );
  }
  console.log(`Sync activity migration complete: ${data.length} rows.`);
}

async function migrateSyncChanges() {
  console.log("\n--- Migrating shopify_cart_sync_changes ---");
  const { data, error } = await supabase
    .from("shopify_cart_sync_changes")
    .select("*")
    .order("changed_at", { ascending: true })
    .limit(5000);

  if (error) {
    if (error.code === "42P01") {
      console.log("  Table does not exist in Supabase. Skipping.");
      return;
    }
    console.error("Supabase sync_changes read error:", error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log("  No sync changes rows to migrate.");
    return;
  }

  for (const row of data) {
    await pool.query(
      `INSERT INTO shopify_cart_sync_changes
         (id, sync_id, parent_id, product_title, variant_sku, field, old_value, new_value, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [
        row.id, row.sync_id, row.parent_id,
        row.product_title || null, row.variant_sku || null,
        row.field, row.old_value || null, row.new_value || null,
        row.changed_at,
      ]
    );
  }
  console.log(`Sync changes migration complete: ${data.length} rows.`);
}

async function verifyCounts() {
  console.log("\n--- Verification ---");
  const staging = await pool.query("SELECT count(*) AS cnt FROM shopify_cart_inventory_staging");
  console.log(`  Neon staging rows: ${staging.rows[0].cnt}`);

  const syncLog = await pool.query("SELECT count(*) AS cnt FROM shopify_cart_sync_log");
  console.log(`  Neon sync_log rows: ${syncLog.rows[0].cnt}`);

  const activity = await pool.query("SELECT count(*) AS cnt FROM shopify_cart_sync_activity");
  console.log(`  Neon sync_activity rows: ${activity.rows[0].cnt}`);

  const changes = await pool.query("SELECT count(*) AS cnt FROM shopify_cart_sync_changes");
  console.log(`  Neon sync_changes rows: ${changes.rows[0].cnt}`);
}

async function main() {
  try {
    await ensureTables();
    await migrateStaging();
    await migrateSyncLog();
    await migrateSyncActivity();
    await migrateSyncChanges();
    await verifyCounts();
    console.log("\nMigration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
