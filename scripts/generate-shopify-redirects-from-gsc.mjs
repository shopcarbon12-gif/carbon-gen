/**
 * Generate Shopify redirects CSV from GSC 404 export.
 * Shopify import: Settings → Domains → Manage → Redirects → Import.
 *
 * Format: Path (from), Target (to)
 * - /collections/X/products/Y → /products/Y
 * - /products/handle → /collections/all (deleted/renamed)
 * - Query strings stripped
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const inputPath = process.argv[2] || path.join(root, "tmp-404-report", "gsc-stale.txt");
const outputPath = path.join(root, "tmp-404-report", "shopify-redirects-import.csv");

if (!fs.existsSync(inputPath)) {
  console.error("Input not found:", inputPath);
  console.error("Run: node scripts/compare-gsc-failures.mjs tmp-404-report/gsc-404-export.txt");
  process.exit(1);
}

const lines = fs.readFileSync(inputPath, "utf8").split("\n").filter(Boolean);
const redirects = [];

for (const line of lines) {
  const m = line.match(/https?:\/\/shopcarbon\.com(\/[^\s]+)/);
  if (!m) continue;
  let from = m[1].split("?")[0].replace(/\/$/, "") || "/";
  let to;

  const prodMatch = from.match(/\/products\/([^/?#]+)$/);
  const collMatch = from.match(/\/collections\/[^/]+\/products\//);
  const localeMatch = from.match(/^\/([a-z]{2,3})\/(?:products|collections|blogs|pages)/);
  const locale = localeMatch ? `/${localeMatch[1]}` : "";
  if (collMatch && prodMatch) {
    to = `${locale}/products/${prodMatch[1]}`;
  } else if (prodMatch) {
    to = `${locale}/collections/all`;
  } else {
    to = `${locale}/collections/all`;
  }
  if (from === to) continue;
  redirects.push({ from, to });
}

const seen = new Set();
const unique = redirects.filter((r) => {
  const k = r.from;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const csv = "Path,Target\n" + unique.map((r) => `${r.from},${r.to}`).join("\n");
fs.writeFileSync(outputPath, csv, "utf8");
console.log("Wrote", outputPath);
console.log("Redirects:", unique.length);
console.log("");
console.log("Import in Shopify: Settings → Domains → Manage → URL redirects → Import redirect list");
