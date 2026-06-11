#!/usr/bin/env node
/**
 * Build COOLIFY_DATABASE_URL from Coolify API.
 * Run: node scripts/coolify-db-url.mjs [PASSWORD]
 * Password: get from Coolify → Projects → CARBON APP → postgresql-database → Connection
 * If omitted, prints template with YOUR_PASSWORD placeholder.
 */
const COOLIFY_HOST = "152.53.210.171";
const DB_PORT = 55432;
const DB_USER = "postgres";
const DB_NAME = "postgres";

const password = process.argv[2] || "YOUR_PASSWORD";
const encoded = encodeURIComponent(password);
const url = `postgresql://${DB_USER}:${encoded}@${COOLIFY_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require`;

console.log(url);
if (password === "YOUR_PASSWORD") {
  console.error("\nTo get password: Coolify → Projects → CARBON APP → postgresql-database → Connection");
  console.error("Then run: node scripts/coolify-db-url.mjs YOUR_ACTUAL_PASSWORD");
}
