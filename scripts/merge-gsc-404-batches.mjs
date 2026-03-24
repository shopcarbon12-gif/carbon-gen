/**
 * Merge GSC 404 batch files into one deduplicated list.
 * Input: tmp-404-report/gsc-batches/*.txt or *.csv, plus gsc-404-export.txt
 * Output: tmp-404-report/gsc-404-all.txt
 *
 * Usage: node scripts/merge-gsc-404-batches.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp-404-report");
const batchesDir = path.join(reportDir, "gsc-batches");

const seen = new Set();
const urls = [];

function addUrl(url) {
  const u = (url || "").trim().replace(/[\u200e\u200f]/g, "").split("?")[0];
  if (!u || !u.startsWith("https://shopcarbon.com")) return;
  const key = u.replace(/\/$/, "");
  if (seen.has(key)) return;
  seen.add(key);
  urls.push(`404 ${key}`);
}

// Existing export + batch-all
const mainExport = path.join(reportDir, "gsc-404-export.txt");
const batchAll = path.join(batchesDir, "batch-all.txt");
if (fs.existsSync(mainExport)) {
  for (const line of fs.readFileSync(mainExport, "utf8").split("\n")) {
    const m = line.match(/https?:\/\/[^\s]+/);
    if (m) addUrl(m[0]);
  }
}

// Batch files
if (fs.existsSync(batchesDir)) {
  for (const f of fs.readdirSync(batchesDir)) {
    const fp = path.join(batchesDir, f);
    if (!fs.statSync(fp).isFile()) continue;
    const content = fs.readFileSync(fp, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/https?:\/\/[^\s,]+/);
      if (m) addUrl(m[0]);
    }
  }
}

// GSC export CSV (from MCP Download CSV)
const gscExportDir = path.join(reportDir, "gsc-export");
const tableCsv = path.join(gscExportDir, "Table.csv");
if (fs.existsSync(tableCsv)) {
  const lines = fs.readFileSync(tableCsv, "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/https?:\/\/[^\s,]+/);
    if (m) addUrl(m[0]);
  }
}

const outPath = path.join(reportDir, "gsc-404-all.txt");
fs.writeFileSync(outPath, urls.join("\n") || "(none)", "utf8");
console.log("Merged", urls.length, "unique URLs →", outPath);
