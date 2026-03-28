/**
 * Write a .txt mirror (full pretty JSON body) for an existing scan JSON.
 * Usage:
 *   node scripts/export-theme-scan-json-to-txt.mjs
 *   node scripts/export-theme-scan-json-to-txt.mjs reports/shopify-theme-asset-scan-2026-03-28T03-37-43-229Z.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

let jsonPath = process.argv[2];
if (!jsonPath) {
  const dir = path.join(root, "reports");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("shopify-theme-asset-scan-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) {
    console.error("No shopify-theme-asset-scan-*.json in reports/");
    process.exit(1);
  }
  jsonPath = path.join(dir, files[0]);
} else if (!path.isAbsolute(jsonPath)) {
  jsonPath = path.join(root, jsonPath);
}

const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const ranAt = report.generated_at || new Date().toISOString();
const txtPath = jsonPath.replace(/\.json$/i, ".txt");
const txtBody = [
  "SHOPIFY THEME ASSET SCAN — FULL REPORT (TXT mirror of JSON)",
  `Generated: ${ranAt}`,
  `Source JSON: ${jsonPath}`,
  "",
  "=".repeat(72),
  "",
  JSON.stringify(report, null, 2),
  "",
].join("\n");
fs.writeFileSync(txtPath, txtBody, "utf8");
console.log("Wrote:", txtPath);
