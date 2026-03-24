/**
 * Save GSC URLs from browser_run_code JSON output to a batch file.
 * Filters URLs by pattern and cleans them.
 * Usage: node scripts/save-gsc-batch-from-json.mjs <filterPattern> <batchName> [jsonFile]
 * Example: node scripts/save-gsc-batch-from-json.mjs "/es/" "es" -
 * If jsonFile is "-", reads from stdin (one JSON array per line).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const batchesDir = path.join(root, "tmp-404-report", "gsc-batches");

function cleanUrl(url) {
  return (url || "")
    .trim()
    .replace(/[\u200e\u200f\u200b-\u200d\ufeff\ue04d\ue89e\ue8b6]/g, "")
    .split("?")[0]
    .replace(/\/$/, "");
}

const filterPattern = process.argv[2]; // e.g. "/es/"
const batchName = process.argv[3];     // e.g. "es"
const input = process.argv[4] || "-";   // file path or "-" for stdin

if (!filterPattern || !batchName) {
  console.error("Usage: node scripts/save-gsc-batch-from-json.mjs <filterPattern> <batchName> [jsonFile]");
  process.exit(1);
}

const pattern = new RegExp(filterPattern.replace(/\//g, "\\/"));
let arr = [];

if (input === "-") {
  const stdin = fs.readFileSync(0, "utf8");
  const lines = stdin.trim().split("\n");
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) arr = arr.concat(parsed);
    } catch (_) {}
  }
} else if (fs.existsSync(input)) {
  const raw = fs.readFileSync(input, "utf8");
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) arr = JSON.parse(m[0]);
  }
}

if (!Array.isArray(arr)) arr = [];

const urls = arr
  .map(cleanUrl)
  .filter((u) => u && u.startsWith("https://shopcarbon.com") && pattern.test(u));

fs.mkdirSync(batchesDir, { recursive: true });
const outPath = path.join(batchesDir, `batch-${batchName}.txt`);
fs.writeFileSync(outPath, urls.map((u) => `404 ${u}`).join("\n"), "utf8");
console.log(`Saved ${urls.length} URLs → ${outPath}`);
