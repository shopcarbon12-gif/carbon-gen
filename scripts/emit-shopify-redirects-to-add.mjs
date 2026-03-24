/**
 * From product-404-redirects-suggested.csv (after match:404-products + Shopify export),
 * writes import-friendly CSVs:
 *
 *   shopify-redirects-to-add.csv
 *     → Path + Target only for shopify_vs_suggested === "no_rule"
 *     → These are the URLs that are NOT in shopify-redirects-export yet — safe to import as NEW redirects.
 *
 *   shopify-redirects-target-differs.csv
 *     → Rows where Shopify already has a redirect but target ≠ suggestion (already_differs).
 *     → Do NOT bulk-import as new (path exists). Update or delete+recreate in Shopify Admin.
 *
 * Requires: tmp-404-report/product-404-redirects-suggested.csv with column shopify_vs_suggested
 * (run npm run match:404-products after shopify-redirects-export.csv is in place).
 *
 * Usage: node scripts/emit-shopify-redirects-to-add.mjs [suggested.csv]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp-404-report");

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function csvCell(s) {
  const t = String(s ?? "");
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function main() {
  const suggestedPath =
    process.argv[2] || path.join(reportDir, "product-404-redirects-suggested.csv");
  if (!fs.existsSync(suggestedPath)) {
    console.error("Missing:", suggestedPath);
    console.error("Run: npm run match:404-products (with shopify-redirects-export.csv present).");
    process.exit(1);
  }

  const lines = fs.readFileSync(suggestedPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const iPath = header.indexOf("Path");
  const iTarget = header.indexOf("Target");
  const iVs = header.indexOf("shopify_vs_suggested");
  const iShopTo = header.indexOf("shopify_redirect_to");

  if (iPath < 0 || iTarget < 0) {
    console.error("CSV must have Path and Target columns.");
    process.exit(1);
  }
  if (iVs < 0) {
    console.error("Missing shopify_vs_suggested. Re-run: npm run match:404-products");
    process.exit(1);
  }

  const toAdd = [];
  const differs = [];
  let same = 0;
  let noExport = 0;

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    const p = (cols[iPath] ?? "").replace(/^"|"$/g, "");
    const t = (cols[iTarget] ?? "").replace(/^"|"$/g, "");
    const vs = (cols[iVs] ?? "").replace(/^"|"$/g, "").trim();
    const shopTo = iShopTo >= 0 ? (cols[iShopTo] ?? "").replace(/^"|"$/g, "").trim() : "";

    if (!p || !t) continue;

    if (vs === "no_rule") toAdd.push({ path: p, target: t });
    else if (vs === "already_differs") differs.push({ path: p, target: t, shopifyTarget: shopTo });
    else if (vs === "already_same") same++;
    else if (vs === "no_export") noExport++;
  }

  const outAdd = path.join(reportDir, "shopify-redirects-to-add.csv");
  const outDiff = path.join(reportDir, "shopify-redirects-target-differs.csv");

  const addLines = [
    "Path,Target",
    ...toAdd.map((r) => `${csvCell(r.path)},${csvCell(r.target)}`),
  ];
  fs.writeFileSync(outAdd, addLines.join("\n"), "utf8");

  const diffLines = [
    "Path,Target_suggested,shopify_current_target",
    ...differs.map((r) =>
      [csvCell(r.path), csvCell(r.target), csvCell(r.shopifyTarget)].join(",")
    ),
  ];
  fs.writeFileSync(outDiff, diffLines.join("\n"), "utf8");

  const summaryPath = path.join(reportDir, "shopify-redirects-emit-summary.txt");
  fs.writeFileSync(
    summaryPath,
    [
      `Import NEW redirects only from: ${path.basename(outAdd)} (Shopify Admin → URL redirects → Import).`,
      `Do NOT import ${path.basename(outDiff)} as new rules — paths already exist; edit targets in Admin.`,
      ``,
      `Source: ${path.relative(root, suggestedPath)}`,
      `Rows to ADD (no_rule): ${toAdd.length} → ${path.basename(outAdd)}`,
      `Rows to UPDATE in Admin (already_differs): ${differs.length} → ${path.basename(outDiff)}`,
      `Already correct (already_same): ${same}`,
      noExport ? `WARNING: no_export rows were present (${noExport}) — copy shopify-redirects-export.csv and re-run match:404-products` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "utf8"
  );

  console.log("Wrote", outAdd, "rows:", toAdd.length);
  console.log("Wrote", outDiff, "rows:", differs.length);
  console.log("already_same (skip):", same);
  if (noExport) console.warn("no_export rows present — refresh Shopify redirect export and re-run match:404-products");
  console.log("Summary:", summaryPath);
}

main();
