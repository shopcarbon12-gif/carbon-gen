/**
 * Saves full Lightspeed catalog rows to tmp-404-report/lightspeed-catalog-snapshot.json
 * for offline use (e.g. elior:lightspeed-qty without running dev during fill).
 *
 * Requires: Next dev on INTERNAL_APP_URL (default http://127.0.0.1:3000)
 *
 * Usage: node scripts/dump-lightspeed-catalog-snapshot.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const baseUrl = String(process.env.INTERNAL_APP_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const outPath = path.join(root, "tmp-404-report", "lightspeed-catalog-snapshot.json");

async function main() {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 500; page++) {
    const u = new URL(`${baseUrl}/api/lightspeed/catalog`);
    u.searchParams.set("all", "true");
    u.searchParams.set("pageSize", "20000");
    u.searchParams.set("includeNoStock", "true");
    u.searchParams.set("shops", "all");
    if (cursor) u.searchParams.set("catalogCursor", cursor);

    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(300_000),
    });
    const text = await res.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error(`Not JSON (${res.status}): ${text.slice(0, 300)}`);
    }
    if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
    out.push(...(j.rows || []));
    console.log("Page", page + 1, "rows", j.rows?.length || 0, "total", out.length);
    if (!j.hasMoreCatalog || !j.nextCatalogCursor) break;
    cursor = j.nextCatalogCursor;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ rows: out }), "utf8");
  console.log("Wrote", outPath, "count:", out.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
