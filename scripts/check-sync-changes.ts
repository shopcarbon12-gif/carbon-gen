import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";

async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT sync_id, parent_id, product_title, variant_sku, field, old_value, new_value
     FROM shopify_cart_sync_changes
     WHERE field = 'stock'
     ORDER BY changed_at DESC
     LIMIT 50`
  );

  const syncIds = new Set<string>();
  for (const row of rows) {
    syncIds.add(row.sync_id);
    console.log(
      `[${row.sync_id.slice(0, 8)}] ${row.product_title} | ${row.variant_sku} | ${row.field} | old=${row.old_value} -> new=${row.new_value}`
    );
  }

  console.log(`\nUnique sync runs: ${syncIds.size}`);
  console.log(`Total stock changes: ${rows.length}`);

  // Count distinct products affected
  const products = new Set(rows.map((r: { parent_id: string }) => r.parent_id));
  console.log(`Distinct products affected: ${products.size}`);

  await pool.end();
}

main().catch(console.error);
