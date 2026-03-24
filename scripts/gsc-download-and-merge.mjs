/**
 * After MCP downloads: combine all gsc-downloads/*.csv into gsc-404-all.txt
 * Usage: node scripts/gsc-download-and-merge.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp-404-report");
const downloadsDir = path.join(reportDir, "gsc-downloads");

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

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  console.log("Created", downloadsDir, "- no files to merge yet");
  process.exit(0);
}

for (const f of fs.readdirSync(downloadsDir)) {
  const fp = path.join(downloadsDir, f);
  if (!fs.statSync(fp).isFile()) continue;
  if (!/\.(csv|txt)$/i.test(f)) continue;
  const content = fs.readFileSync(fp, "utf8");
  const lines = content.split("\n");
  const header = lines[0]?.toLowerCase().includes("url") ? 1 : 0;
  for (let i = header; i < lines.length; i++) {
    const m = lines[i].match(/https?:\/\/[^\s,]+/);
    if (m) addUrl(m[0]);
  }
}

const outPath = path.join(reportDir, "gsc-404-all.txt");
fs.writeFileSync(outPath, urls.join("\n") || "(none)", "utf8");
console.log("Merged", urls.length, "unique URLs from", downloadsDir, "→", outPath);
