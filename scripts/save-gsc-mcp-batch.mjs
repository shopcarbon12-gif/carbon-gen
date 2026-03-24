/**
 * Parse MCP browser_run_code output and save to gsc batch/export.
 * Usage: node scripts/save-gsc-mcp-batch.mjs <mcp-output-file> [batch-name]
 * Example: node scripts/save-gsc-mcp-batch.mjs "C:\...\agent-tools\xxx.txt" root
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp-404-report");
const batchesDir = path.join(reportDir, "gsc-batches");

function cleanUrl(url) {
  return (url || "")
    .trim()
    .replace(/[\u200e\u200f\u200b-\u200d\ufeff\ue04d\ue89e\ue8b6]/g, "")
    .split("?")[0]
    .replace(/\/$/, "");
}

const inputPath = process.argv[2];
const batchName = process.argv[3] || "root";

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error("Usage: node scripts/save-gsc-mcp-batch.mjs <mcp-output-file> [batch-name]");
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, "utf8");
// MCP output format: line 2 has the JSON string
const lines = raw.split("\n");
const jsonLine = lines.find((l) => l.startsWith('"') && l.includes("https://"));
if (!jsonLine) {
  console.error("Could not find JSON line in output");
  process.exit(1);
}

let arr;
try {
  const parsed = JSON.parse(jsonLine);
  arr = Array.isArray(parsed) ? parsed : JSON.parse(parsed);
} catch (e1) {
  try {
    arr = JSON.parse(JSON.parse(jsonLine));
  } catch (e2) {
    console.error("Failed to parse JSON:", e1.message);
    process.exit(1);
  }
}
if (!Array.isArray(arr)) {
  console.error("Parsed result is not an array:", typeof arr);
  process.exit(1);
}

const urls = arr
  .map(cleanUrl)
  .filter((u) => u && u.startsWith("https://shopcarbon.com"));

fs.mkdirSync(batchesDir, { recursive: true });

if (batchName === "root") {
  const outPath = path.join(reportDir, "gsc-404-export.txt");
  fs.writeFileSync(outPath, urls.map((u) => `404 ${u}`).join("\n"), "utf8");
  console.log("Saved", urls.length, "URLs →", outPath);
} else {
  const outPath = path.join(batchesDir, `batch-${batchName}.txt`);
  fs.writeFileSync(outPath, urls.map((u) => `404 ${u}`).join("\n"), "utf8");
  console.log("Saved", urls.length, "URLs →", outPath);
}
