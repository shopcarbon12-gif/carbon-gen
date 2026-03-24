/**
 * Compare failed URLs (from GSC or failed-urls.txt) against canonical list.
 * Helps identify: stale URLs (not in canonical = deleted, need redirect) vs valid URLs (in canonical = investigate).
 *
 * Usage:
 *   node scripts/compare-gsc-failures.mjs                    # uses tmp-404-report/failed-urls.txt
 *   node scripts/compare-gsc-failures.mjs path/to/urls.txt    # custom file (one URL per line)
 *
 * Input file format: one URL per line. Status prefix optional (e.g. "404 https://..." or just "https://...")
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const inputPath = process.argv[2] || path.join(root, "tmp-404-report", "failed-urls.txt");
const canonicalPath = path.join(root, "tmp-404-report", "canonical-urls.txt");

if (!fs.existsSync(canonicalPath)) {
  console.error("Run first: node scripts/list-shopify-urls-from-api.mjs");
  process.exit(1);
}
if (!fs.existsSync(inputPath)) {
  console.error("Input not found:", inputPath);
  console.error("Create a file with one URL per line, or run check-urls-404.mjs first.");
  process.exit(1);
}

const canonicalRaw = fs.readFileSync(canonicalPath, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const canonical = new Set(canonicalRaw.map((u) => u.replace(/\/$/, "")));
const canonicalWithSlash = new Set(canonicalRaw.map((u) => (u.endsWith("/") ? u : u + "/")));

const lines = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "").split("\n").filter(Boolean);
const failed = lines.map((line) => {
  const m = line.match(/^(\d+)\s+(.+)$/) || [null, null, line];
  return { raw: line, url: (m[2] || line).trim().replace(/\/$/, ""), status: m[1] };
});

const stale = [];
const valid = [];

function inCanonical(url) {
  const u = url.replace(/\/$/, "");
  return canonical.has(u) || canonicalWithSlash.has(u + "/");
}

for (const f of failed) {
  if (inCanonical(f.url)) valid.push(f);
  else stale.push(f);
}

console.log("--- STALE (not in canonical, likely deleted/renamed) ---");
console.log("Action: add 301 redirects or remove from internal links\n");
stale.slice(0, 50).forEach((f) => console.log(f.raw));
if (stale.length > 50) console.log("... and", stale.length - 50, "more");

console.log("\n--- VALID (in canonical, might be temporary failure) ---");
console.log("Action: verify manually or re-check later\n");
valid.slice(0, 30).forEach((f) => console.log(f.raw));
if (valid.length > 30) console.log("... and", valid.length - 30, "more");

console.log("\nSummary: Stale:", stale.length, "| Valid:", valid.length);

const outDir = path.join(root, "tmp-404-report");
fs.writeFileSync(
  path.join(outDir, "gsc-stale.txt"),
  stale.map((f) => f.raw).join("\n") || "(none)",
  "utf8"
);
fs.writeFileSync(
  path.join(outDir, "gsc-valid.txt"),
  valid.map((f) => f.raw).join("\n") || "(none)",
  "utf8"
);
console.log("\nWrote tmp-404-report/gsc-stale.txt");
console.log("Wrote tmp-404-report/gsc-valid.txt");
