/**
 * Fill "Lightspeed" column (D) on the Elior matched workbook using Lightspeed catalog.
 * For each data row, reads the handle from column B first (column A is usually
 * numeric score in matching elior); falls back to C (sample_url) then A if not
 * a pure number. Takes the first two hyphen tokens, searches Lightspeed rows
 * (description, SKUs, etc.), then sums qtyTotal for all variants sharing the same
 * itemMatrixId (parent matrix). Writes qty to column D; yellow if match and qty > 0,
 * red if no match or qty 0.
 *
 * Sheet names tried: "matching elior", "elior matched" (case-insensitive).
 *
 * Catalog source (first that works):
 *   1. LS_CATALOG_JSON path — JSON file: { "rows": [ { itemMatrixId, description, customSku, systemSku, qtyTotal, ... } ] }
 *   2. INTERNAL_APP_URL (default http://127.0.0.1:3000) — GET /api/lightspeed/catalog with cursor paging
 *
 * Env: load .env.local / .env (for nothing required if using JSON snapshot only)
 *
 * Usage:
 *   node scripts/elior-xlsx-lightspeed-matrix-qty.mjs [input.xlsx] [output.xlsx]
 *
 * Defaults:
 *   input:  tmp-404-report/matching elior.matched.xlsx
 *   output: same as input (overwrite)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const YELLOW = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFCC" } };
const RED = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };

const COL_HANDLE = 2;
const COL_LIGHTSPEED = 4;

function cellToString(val) {
  if (val == null) return "";
  if (typeof val === "object" && val !== null && "text" in val) return String(val.text ?? "");
  if (typeof val === "object" && val !== null && "result" in val) return cellToString(val.result);
  return String(val);
}

function handleFromRowText(t) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const p = new URL(s).pathname.replace(/\/$/, "");
      const m = p.match(/\/products\/([^/]+)$/);
      if (m) return decodeURIComponent(m[1]);
    } catch {
      /* ignore */
    }
  }
  return s;
}

function firstTwoTokens(handle) {
  const parts = String(handle || "")
    .split("-")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length < 2) return [parts[0] || null, null];
  return [parts[0], parts[1]];
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function haystackForRow(row) {
  return norm(
    [
      row.description,
      row.customSku,
      row.systemSku,
      row.itemId,
      row.upc,
      row.ean,
      row.color,
      row.size,
    ].join(" ")
  );
}

function tokensMatchHaystack(w1l, w2l, hay) {
  if (!w1l || !w2l) return false;
  if (hay.includes(`${w1l}-${w2l}`) || hay.includes(`${w1l}${w2l}`)) return true;
  return hay.includes(w1l) && hay.includes(w2l);
}

function findFirstMatchingRow(catalogRows, w1, w2) {
  const w1l = norm(w1);
  const w2l = norm(w2);
  if (!w1l || !w2l) return null;
  for (const row of catalogRows) {
    const hay = haystackForRow(row);
    if (tokensMatchHaystack(w1l, w2l, hay)) return row;
  }
  return null;
}

function sumMatrixQty(catalogRows, matrixId) {
  const mid = String(matrixId ?? "").trim();
  if (!mid || mid === "0") return null;
  let sum = 0;
  let any = false;
  for (const row of catalogRows) {
    if (String(row.itemMatrixId ?? "").trim() !== mid) continue;
    const q = row.qtyTotal;
    if (q != null && Number.isFinite(Number(q))) {
      sum += Number(q);
      any = true;
    }
  }
  if (!any) return 0;
  return Number(sum.toFixed(2));
}

/** Matrix parent qty (sum variants); if no matrix, use the matched row qty. */
function qtyForMatch(catalogRows, hit) {
  const mid = String(hit.itemMatrixId ?? "").trim();
  if (mid && mid !== "0") {
    const s = sumMatrixQty(catalogRows, mid);
    return s == null ? 0 : s;
  }
  const q = hit.qtyTotal;
  if (q != null && Number.isFinite(Number(q))) return Number(Number(q).toFixed(2));
  return 0;
}

async function loadCatalogRowsFromJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const j = JSON.parse(raw);
  const rows = j.rows ?? j;
  if (!Array.isArray(rows)) throw new Error("JSON must be { rows: [...] } or an array");
  return rows;
}

async function loadCatalogRowsFromApi(baseUrl) {
  const origin = baseUrl.replace(/\/$/, "");
  const out = [];
  let cursor = null;
  for (let page = 0; page < 500; page++) {
    const u = new URL(`${origin}/api/lightspeed/catalog`);
    u.searchParams.set("all", "true");
    u.searchParams.set("pageSize", "20000");
    u.searchParams.set("includeNoStock", "true");
    u.searchParams.set("shops", "all");
    if (cursor) u.searchParams.set("catalogCursor", cursor);

    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error(`Catalog API not JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok || j.error) {
      throw new Error(j.error || `Catalog HTTP ${res.status}`);
    }
    out.push(...(j.rows || []));
    if (!j.hasMoreCatalog || !j.nextCatalogCursor) break;
    cursor = j.nextCatalogCursor;
  }
  return out;
}

function pickSheet(wb) {
  const names = wb.worksheets.map((w) => w.name);
  const want = ["matching elior", "elior matched"];
  for (const n of want) {
    const found = wb.worksheets.find((w) => w.name.toLowerCase() === n);
    if (found) return found;
  }
  const fuzzy = wb.worksheets.find((w) => /elior/i.test(w.name));
  if (fuzzy) return fuzzy;
  throw new Error(`No sheet found. Have: ${names.join(", ")}`);
}

function textForSearch(ws, rowIndex) {
  const prefer = [COL_HANDLE, 3, 1];
  for (const c of prefer) {
    const t = cellToString(ws.getCell(rowIndex, c).value).trim();
    if (!t) continue;
    if (c === 1 && /^\d+(\.\d+)?$/.test(t)) continue;
    return t;
  }
  return "";
}

async function main() {
  const inPath =
    process.argv[2] || path.join(root, "tmp-404-report", "matching elior.matched.xlsx");
  const outPath = process.argv[3] || inPath;

  if (!fs.existsSync(inPath)) {
    console.error("Missing:", inPath);
    process.exit(1);
  }

  const jsonPath = String(process.env.LS_CATALOG_JSON || "").trim();
  const baseUrl = String(process.env.INTERNAL_APP_URL || "http://127.0.0.1:3000").trim();

  let catalogRows;
  if (jsonPath && fs.existsSync(jsonPath)) {
    console.log("Loading catalog from LS_CATALOG_JSON:", jsonPath);
    catalogRows = await loadCatalogRowsFromJson(path.isAbsolute(jsonPath) ? jsonPath : path.join(root, jsonPath));
  } else {
    const snap = path.join(root, "tmp-404-report", "lightspeed-catalog-snapshot.json");
    if (fs.existsSync(snap)) {
      console.log("Loading catalog from tmp:", path.relative(root, snap));
      catalogRows = await loadCatalogRowsFromJson(snap);
    } else {
      console.log("Fetching catalog from", baseUrl, "(set LS_CATALOG_JSON or add tmp-404-report/lightspeed-catalog-snapshot.json to avoid)");
      try {
        catalogRows = await loadCatalogRowsFromApi(baseUrl);
      } catch (e) {
        console.error(String(e?.message || e));
        console.error("\nStart Next dev (npm run dev) or export catalog JSON:");
        console.error('  { "rows": [ ... rows from /api/lightspeed/catalog ... ] }');
        process.exit(1);
      }
    }
  }

  console.log("Catalog rows:", catalogRows.length);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inPath);
  const ws = pickSheet(wb);

  ws.getCell(1, COL_LIGHTSPEED).value = "Lightspeed";

  let yellow = 0;
  let red = 0;
  const lastRow = Math.max(ws.actualRowCount || 2, ws.rowCount || 2);

  for (let r = 2; r <= lastRow; r++) {
    const rawText = textForSearch(ws, r);
    const handle = handleFromRowText(rawText);
    const [w1, w2] = firstTwoTokens(handle);
    const cell = ws.getCell(r, COL_LIGHTSPEED);

    if (!w1 || !w2) {
      cell.value = "—";
      cell.fill = RED;
      red++;
      continue;
    }

    const hit = findFirstMatchingRow(catalogRows, w1, w2);
    if (!hit) {
      cell.value = "—";
      cell.fill = RED;
      red++;
      continue;
    }

    const qn = qtyForMatch(catalogRows, hit);
    cell.value = qn;

    if (qn > 0) {
      cell.fill = YELLOW;
      yellow++;
    } else {
      cell.fill = RED;
      red++;
    }
  }

  await wb.xlsx.writeFile(outPath);
  console.log("Wrote", outPath);
  console.log("Lightspeed column: yellow (match, qty>0):", yellow, "| red (no match or qty 0):", red);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
