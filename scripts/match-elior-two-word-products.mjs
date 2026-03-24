/**
 * Builds an .xlsx with sheets "matching elior" + "all products".
 * For each data row, takes the first hyphen token from column B (handle_404)
 * and finds a catalog product whose handle contains that token as a whole
 * `-` segment. Writes the matched storefront URL into column E (redirect to:)
 * and fills the cell green. No yellow tier.
 *
 * Inputs:
 *   tmp-404-report/matching elior.csv
 *   tmp-404-report/shopify-catalog-urls-all.csv (product rows, locale=default)
 *
 * Output:
 *   tmp-404-report/matching elior.matched.xlsx
 *
 * Usage:
 *   node scripts/match-elior-two-word-products.mjs [matching.csv] [catalog.csv] [out.xlsx]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const GREEN = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };

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

function productHandleFromUrl(url) {
  const u = String(url || "").toLowerCase();
  const m = u.match(/\/products\/([^/?#]+)/);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

function firstToken(handle) {
  const parts = String(handle || "")
    .split("-")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0] ? parts[0].toLowerCase() : null;
}

function segmentSet(handleLower) {
  return new Set(handleLower.split("-").filter(Boolean));
}

/** True if the first query token appears as a whole `-` segment in the catalog handle. */
function firstWordMatches(queryHandle, catalogHandleLower) {
  const w1l = firstToken(queryHandle);
  if (!w1l) return false;
  return segmentSet(catalogHandleLower).has(w1l);
}

function findCatalogUrl(queryHandle, catalogRows) {
  for (const { url, handle } of catalogRows) {
    if (firstWordMatches(queryHandle, handle)) return { url };
  }
  return { url: null };
}

function loadCatalog(catalogPath) {
  const text = fs.readFileSync(catalogPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const iUrl = header.indexOf("url");
  const iType = header.indexOf("resource_type");
  const iLocale = header.indexOf("locale");
  if (iUrl < 0 || iType < 0) {
    throw new Error(`Catalog CSV missing url/resource_type header: ${catalogPath}`);
  }
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    if (cols[iType] !== "product") continue;
    if (iLocale >= 0 && cols[iLocale] !== "default") continue;
    const url = cols[iUrl];
    const handle = productHandleFromUrl(url);
    if (!handle || !url) continue;
    rows.push({ url, handle });
  }
  return rows;
}

async function main() {
  const matchCsv =
    process.argv[2] || path.join(root, "tmp-404-report", "matching elior.csv");
  const catalogCsv =
    process.argv[3] || path.join(root, "tmp-404-report", "shopify-catalog-urls-all.csv");
  const outXlsx =
    process.argv[4] || path.join(root, "tmp-404-report", "matching elior.matched.xlsx");

  if (!fs.existsSync(matchCsv)) {
    console.error("Missing:", matchCsv);
    process.exit(1);
  }
  if (!fs.existsSync(catalogCsv)) {
    console.error("Missing catalog CSV. Run: npm run shopify:export-catalog-urls-csv");
    console.error("Expected:", catalogCsv);
    process.exit(1);
  }

  const catalogRows = loadCatalog(catalogCsv);
  console.log("Catalog product URLs (default locale):", catalogRows.length);

  const matchText = fs.readFileSync(matchCsv, "utf8");
  const matchLines = matchText.split(/\r?\n/).filter((l) => l.length > 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = "carbon-gen";

  const ws = wb.addWorksheet("matching elior");
  const headers = parseCsvLine(matchLines[0]);
  headers.forEach((h, c) => {
    ws.getCell(1, c + 1).value = h;
  });

  const colB = 2;
  const colE = 5;
  let greenN = 0;
  let noneN = 0;

  for (let r = 1; r < matchLines.length; r++) {
    const cols = parseCsvLine(matchLines[r]);
    for (let c = 0; c < headers.length; c++) {
      ws.getCell(r + 1, c + 1).value = cols[c] ?? "";
    }
    const handle404 = cols[colB - 1] ?? "";
    const { url } = findCatalogUrl(handle404, catalogRows);
    const cell = ws.getCell(r + 1, colE);
    if (url) {
      cell.value = url;
      cell.fill = GREEN;
      greenN++;
    } else {
      noneN++;
    }
  }

  const wsProducts = wb.addWorksheet("all products");
  wsProducts.getCell("A1").value = "url";
  for (let i = 0; i < catalogRows.length; i++) {
    wsProducts.getCell(i + 2, 1).value = catalogRows[i].url;
  }

  await wb.xlsx.writeFile(outXlsx);
  console.log("Wrote", outXlsx);
  console.log("Filled redirect (green, first-token segment match):", greenN, "| no match:", noneN);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
