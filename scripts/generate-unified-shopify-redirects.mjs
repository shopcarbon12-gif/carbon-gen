/**
 * Build one Shopify redirects CSV from 404-all-merged + catalog matcher output:
 *   - Every URL whose product handle matched (product-404-redirects-suggested.csv)
 *     → redirect to current catalog product URL for THAT request's locale.
 *   - Every other URL (unmatched product handles, non-product paths, odd URLs)
 *     → redirect to /[locale]/collections/all (same pattern as generate-shopify-redirects-from-gsc.mjs).
 *
 * Reads:
 *   tmp-404-report/404-all-merged.txt
 *   tmp-404-report/product-404-redirects-suggested.csv
 *
 * Writes:
 *   tmp-404-report/shopify-redirects-unified.csv
 *   tmp-404-report/shopify-redirects-unified-summary.txt
 *
 * Env (optional): SHOPIFY_STOREFRONT_BASE_URL, SHOPIFY_LOCALES (same as matcher)
 *
 * Usage: node scripts/generate-unified-shopify-redirects.mjs [404-all-merged.txt] [suggested.csv] [out.csv]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

let storeBase = (process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://shopcarbon.com").replace(/\/$/, "");
if (!/^https?:\/\//i.test(storeBase)) storeBase = `https://${storeBase}`;
const storeHost = new URL(storeBase).hostname.replace(/^www\./i, "");

const DEFAULT_LOCALES =
  "default,es,pt,fr,de,he,ar,ru,ro,it,nl,pl,tr,ja,ko,zh,af,ak,am,as,az,be,bm,bn,bs,eu,hy,sq,fil";
const _loc = (process.env.SHOPIFY_LOCALES || DEFAULT_LOCALES).split(",").map((s) => s.trim().toLowerCase());
const localeSet = new Set(_loc.map((s) => (s === "default" || s === "" ? "" : s)).filter(Boolean));

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

function cleanUrlLine(line) {
  const s = line.replace(/^404\s+/i, "").trim();
  const m = s.match(/https?:\/\/[^\s]+/);
  let u = m ? m[0] : s;
  u = u.replace(/[\u200e\u200f\ufeff\u200d]/g, "").replace(/[\u0080-\uFFFF]+$/u, "").trim();
  try {
    return new URL(u).href.split("?")[0].replace(/\/$/, "");
  } catch {
    return u;
  }
}

function extractProductHandleFromPathname(pathname) {
  const p = String(pathname || "").replace(/\/$/, "");
  const m = p.match(/\/products\/([^/]+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function extractLocalePrefix(pathname) {
  const m = pathname.match(/^\/([a-z]{2,3})\//);
  if (!m) return "";
  if (localeSet.has(m[1])) return `/${m[1]}`;
  return "";
}

function buildProductTarget(localePrefix, catalogHandle) {
  return `${localePrefix}/products/${catalogHandle}`.replace(/\/\//g, "/") || `/products/${catalogHandle}`;
}

function buildAllCollectionTarget(localePrefix) {
  const s = `${localePrefix}/collections/all`.replace(/\/\//g, "/");
  return s.startsWith("/") ? s : `/${s}`;
}

function isOurHost(hostname) {
  const h = String(hostname || "").replace(/^www\./i, "").toLowerCase();
  return h === storeHost.toLowerCase();
}

/**
 * old 404 handle -> canonical catalog handle (from matcher Target column)
 */
function loadMatchedHandleMap(suggestedPath) {
  const text = fs.readFileSync(suggestedPath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return new Map();
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const iPath = header.indexOf("Path");
  const iTarget = header.indexOf("Target");
  if (iPath < 0 || iTarget < 0) {
    throw new Error("suggested CSV needs Path and Target columns");
  }
  const map = new Map();
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    const pathRaw = (cols[iPath] ?? "").replace(/^"|"$/g, "").trim();
    const targetRaw = (cols[iTarget] ?? "").replace(/^"|"$/g, "").trim();
    const oldHandle = extractProductHandleFromPathname(pathRaw);
    const catalogHandle = extractProductHandleFromPathname(targetRaw);
    if (!oldHandle || !catalogHandle) continue;
    const key = oldHandle.toLowerCase();
    if (!map.has(key)) map.set(key, catalogHandle);
  }
  return map;
}

function normalizeFromPath(pathname) {
  let s = String(pathname || "").trim();
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.replace(/\/+/g, "/");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

function main() {
  const mergedPath =
    process.argv[2] || path.join(root, "tmp-404-report", "404-all-merged.txt");
  const suggestedPath =
    process.argv[3] || path.join(root, "tmp-404-report", "product-404-redirects-suggested.csv");
  const outCsv =
    process.argv[4] || path.join(root, "tmp-404-report", "shopify-redirects-unified.csv");

  if (!fs.existsSync(mergedPath)) {
    console.error("Missing:", mergedPath);
    process.exit(1);
  }
  if (!fs.existsSync(suggestedPath)) {
    console.error("Missing:", suggestedPath);
    console.error("Run: npm run match:404-products");
    process.exit(1);
  }

  const matchedByHandle = loadMatchedHandleMap(suggestedPath);
  console.log("Matched handles (catalog):", matchedByHandle.size);

  const lines = fs.readFileSync(mergedPath, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const urls = [...new Set(lines.map(cleanUrlLine))];

  /** @type {Map<string, { target: string, kind: 'product' | 'all' }>} */
  const rules = new Map();
  let skippedHost = 0;
  let skippedNoPath = 0;

  for (const urlStr of urls) {
    let u;
    try {
      u = new URL(urlStr);
    } catch {
      skippedNoPath++;
      continue;
    }
    if (!isOurHost(u.hostname)) {
      skippedHost++;
      continue;
    }

    const pathname = normalizeFromPath(u.pathname);
    if (!pathname || pathname === "/") continue;

    const loc = extractLocalePrefix(pathname);
    const handle = extractProductHandleFromPathname(pathname);
    const key = pathname.toLowerCase();

    let target;
    let kind;
    if (handle) {
      const catalog = matchedByHandle.get(handle.toLowerCase());
      if (catalog) {
        target = buildProductTarget(loc, catalog);
        kind = "product";
      } else {
        target = buildAllCollectionTarget(loc);
        kind = "all";
      }
    } else {
      target = buildAllCollectionTarget(loc);
      kind = "all";
    }

    if (pathname === target || pathname.toLowerCase() === target.toLowerCase()) continue;

    const prev = rules.get(key);
    if (!prev) {
      rules.set(key, { target, kind });
    } else if (prev.kind === "all" && kind === "product") {
      rules.set(key, { target, kind });
    }
  }

  let rulesToProduct = 0;
  let rulesToAll = 0;
  for (const v of rules.values()) {
    if (v.kind === "product") rulesToProduct++;
    else rulesToAll++;
  }

  const rows = [...rules.entries()]
    .map(([from, { target }]) => ({ from, target }))
    .sort((a, b) => a.from.localeCompare(b.from));

  const csvLines = ["Path,Target", ...rows.map((r) => `${r.from},${r.target}`)];
  fs.mkdirSync(path.dirname(outCsv), { recursive: true });
  const body = csvLines.join("\n");
  fs.writeFileSync(outCsv, body, "utf8");

  const importMirror = path.join(root, "tmp-404-report", "shopify-redirects-import.csv");
  fs.writeFileSync(importMirror, body, "utf8");

  const summaryPath = outCsv.replace(/\.csv$/i, "-summary.txt");
  const summary = [
    `Source URLs (unique): ${urls.length}`,
    `Skipped (bad URL): ${skippedNoPath}`,
    `Skipped (other host): ${skippedHost}`,
    `Redirect rules written: ${rows.length}`,
    `  → to catalog product (matched handle): ${rulesToProduct}`,
    `  → to collections/all (unmatched / non-product): ${rulesToAll}`,
    `Unique matched handles in map: ${matchedByHandle.size}`,
    ``,
    `Output: ${path.relative(root, outCsv)}`,
    `Also mirrored: tmp-404-report/shopify-redirects-import.csv (for npm run push:shopify-redirects)`,
    `Import in Shopify: Settings → Domains → URL redirects → Import`,
    ``,
    `Note: Re-run after refreshing 404-all-merged.txt and npm run match:404-products.`,
  ].join("\n");
  fs.writeFileSync(summaryPath, summary, "utf8");

  console.log(summary);
}

main();
