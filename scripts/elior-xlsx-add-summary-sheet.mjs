/**
 * Adds or replaces worksheet "Summary" on matching elior.matched.xlsx with counts.
 *
 * Usage: node scripts/elior-xlsx-add-summary-sheet.mjs [path.xlsx]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function pickDataSheet(wb) {
  const found = wb.worksheets.find((w) => /matching elior/i.test(w.name));
  if (found) return found;
  return wb.worksheets.find((w) => /elior/i.test(w.name));
}

function computeStats(ws) {
  let total = 0;
  let dash = 0;
  let qty0 = 0;
  let qtyPos = 0;
  let redirect = 0;
  let both = 0;
  const last = Math.max(ws.actualRowCount || 2, ws.rowCount || 2);

  for (let r = 2; r <= last; r++) {
    const b = ws.getCell(r, 2).value;
    if (b == null || String(b).trim() === "") continue;
    total++;

    const d = ws.getCell(r, 4).value;
    const e = String(ws.getCell(r, 5).value ?? "").trim();
    const ds = String(d ?? "").trim();
    const dn = typeof d === "number" ? d : Number(ds);
    const hasR = /^https?:/i.test(e);
    if (hasR) redirect++;

    if (ds === "—") {
      dash++;
      continue;
    }
    if (Number.isFinite(dn)) {
      if (dn > 0) qtyPos++;
      else if (dn === 0) qty0++;
    }
    if (Number.isFinite(dn) && dn > 0 && hasR) both++;
  }

  return { total, dash, qty0, qtyPos, redirect, both };
}

async function main() {
  const xlsxPath =
    process.argv[2] || path.join(root, "tmp-404-report", "matching elior.matched.xlsx");
  if (!fs.existsSync(xlsxPath)) {
    console.error("Missing:", xlsxPath);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const dataWs = pickDataSheet(wb);
  if (!dataWs) {
    console.error("No matching elior sheet found.");
    process.exit(1);
  }

  const s = computeStats(dataWs);
  const pct = (n) => (s.total ? ((100 * n) / s.total).toFixed(1) : "0.0");

  const idx = wb.worksheets.findIndex((w) => /^summary$/i.test(w.name));
  if (idx >= 0) wb.removeWorksheet(wb.worksheets[idx].id);

  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF4472C4" } } });
  sum.getColumn(1).width = 44;
  sum.getColumn(2).width = 14;
  sum.getColumn(3).width = 10;

  const rows = [
    ["Elior matched workbook — link / match summary", "", ""],
    ["Generated (UTC)", new Date().toISOString(), ""],
    ["", "", ""],
    ["Metric", "Count", "% of total rows"],
    ["Total rows (column B has handle_404)", s.total, "100%"],
    ["Column E — redirect URL filled (Shopify)", s.redirect, `${pct(s.redirect)}%`],
    ["Column D — Lightspeed: no catalog match (—)", s.dash, `${pct(s.dash)}%`],
    ["Column D — Lightspeed qty = 0", s.qty0, `${pct(s.qty0)}%`],
    ["Column D — Lightspeed qty > 0", s.qtyPos, `${pct(s.qtyPos)}%`],
    ["Both: Lightspeed qty > 0 AND redirect URL", s.both, `${pct(s.both)}%`],
    ["", "", ""],
    [
      "Note",
      "A short verified list (e.g. 13 rows in a screenshot) is a subset. Compare its row count to “Total rows” above.",
      "",
    ],
  ];

  rows.forEach((cells, i) => {
    const row = sum.getRow(i + 1);
    cells.forEach((val, j) => {
      row.getCell(j + 1).value = val;
    });
  });

  sum.getRow(1).font = { bold: true, size: 14 };
  sum.getRow(4).font = { bold: true };

  let outPath = xlsxPath;
  try {
    await wb.xlsx.writeFile(outPath);
  } catch (e) {
    if (e?.code === "EBUSY" || /EBUSY|locked/i.test(String(e?.message))) {
      outPath = xlsxPath.replace(/\.xlsx$/i, ".with-summary.xlsx");
      console.warn("Original file locked (close Excel). Writing:", outPath);
      await wb.xlsx.writeFile(outPath);
    } else {
      throw e;
    }
  }

  const txtPath = path.join(root, "tmp-404-report", "elior-match-summary.txt");
  fs.writeFileSync(
    txtPath,
    [
      `Total rows: ${s.total}`,
      `Redirect URL (col E): ${s.redirect} (${pct(s.redirect)}%)`,
      `Lightspeed qty > 0 (col D): ${s.qtyPos} (${pct(s.qtyPos)}%)`,
      `Both qty>0 + redirect: ${s.both} (${pct(s.both)}%)`,
      `Lightspeed no match (—): ${s.dash}`,
      `Lightspeed qty 0: ${s.qty0}`,
    ].join("\n"),
    "utf8"
  );

  console.log("Updated", outPath);
  console.log(fs.readFileSync(txtPath, "utf8"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
