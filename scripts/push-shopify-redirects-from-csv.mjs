/**
 * Push redirects from shopify-redirects-import.csv to Shopify via Admin API.
 * Requires: read_content, write_content (or content) scope.
 *
 * Usage: node scripts/push-shopify-redirects-from-csv.mjs [csvPath]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const csvPath = process.argv[2] || path.join(root, "tmp-404-report", "shopify-redirects-import.csv");

if (!shop || !token) {
  console.error("Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN");
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error("CSV not found:", csvPath);
  process.exit(1);
}

const apiBase = `https://${shop}/admin/api/2025-01`;
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-Shopify-Access-Token": token,
};

const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
const lines = text.split("\n").filter(Boolean);
const rows = lines.slice(1).map((l) => {
  const [pathCol, targetCol] = l.split(",").map((s) => s.trim());
  return { path: pathCol || "", target: targetCol || "" };
}).filter((r) => r.path && r.target && r.path !== r.target);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("Pushing", rows.length, "redirects (rate-limited: 2/sec)...");

let ok = 0;
let fail = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  try {
    const res = await fetch(`${apiBase}/redirects.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ redirect: { path: r.path, target: r.target } }),
    });
    const json = await res.json();
    if (res.ok) {
      ok++;
    } else {
      fail++;
      if (fail <= 5) console.warn("Failed:", r.path, "->", r.target, json?.errors || res.status);
    }
  } catch (e) {
    fail++;
    if (fail <= 5) console.warn("Error:", r.path, e.message);
  }
  await sleep(550);
  if (i % 50 === 0 && i > 0) process.stdout.write(".");
}

console.log("\nDone. Created:", ok, "| Failed:", fail);
