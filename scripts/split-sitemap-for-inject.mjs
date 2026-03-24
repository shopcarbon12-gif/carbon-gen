/**
 * Splits tmp-sitemap-clean/*.html into JSON chunk arrays for Playwright evaluate injection.
 * Run: node scripts/split-sitemap-for-inject.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "tmp-sitemap-clean");
const CHUNK = Number(process.env.SITEMAP_INJECT_CHUNK || 25000);

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
for (const f of files) {
  const full = fs.readFileSync(path.join(dir, f), "utf8");
  const chunks = [];
  for (let i = 0; i < full.length; i += CHUNK) {
    chunks.push(full.slice(i, i + CHUNK));
  }
  const out = path.join(dir, f.replace(".html", ".chunks.json"));
  fs.writeFileSync(out, JSON.stringify(chunks), "utf8");
  console.log(f, "chunks", chunks.length, out);
}
