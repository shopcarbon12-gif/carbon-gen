#!/usr/bin/env node
/**
 * Initialize local Postgres schema.
 * Run after starting local Postgres (Docker or native).
 * Usage: node scripts/init-local-db.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const url =
  process.env.COOLIFY_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";

async function main() {
  const pool = new Pool({ connectionString: url });
  try {
    const schemaPath = join(process.cwd(), "scripts", "sql_schema.sql");
    const sql = readFileSync(schemaPath, "utf8");
    await pool.query(sql);
    console.log("Schema applied.");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
main();
