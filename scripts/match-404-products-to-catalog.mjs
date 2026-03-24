/**
 * Map 404 URLs to current Shopify products by matching URL handle/slug to product titles/handles.
 *
 * Reads: tmp-404-report/404-all-merged.txt
 * Env: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_STOREFRONT_BASE_URL
 * Optional: SHOPIFY_REDIRECTS_EXPORT_CSV — Shopify "URL redirects" export CSV; also checks
 *   tmp-404-report/shopify-redirects-export.csv. When present, matched rows include current
 *   Shopify redirect target vs suggested target.
 *
 * Outputs:
 *   tmp-404-report/product-404-match-report.txt
 *   tmp-404-report/product-404-redirects-suggested.csv  (Path, Target, score, reason, shopify_redirect_to, shopify_vs_suggested)
 *   tmp-404-report/shopify-redirects-to-add.csv  (Path, Target for rows with no Shopify rule yet — via emit-shopify-redirects-to-add.mjs)
 *   tmp-404-report/product-404-unmatched.csv  (product URLs with no confident catalog match)
 *
 * Usage: node scripts/match-404-products-to-catalog.mjs [--min-score 0.55]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
let baseUrl = (process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://shopcarbon.com").replace(/\/$/, "");
if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;

const DEFAULT_LOCALES =
  "default,es,pt,fr,de,he,ar,ru,ro,it,nl,pl,tr,ja,ko,zh,af,ak,am,as,az,be,bm,bn,bs,eu,hy,sq,fil";
const _loc = (process.env.SHOPIFY_LOCALES || DEFAULT_LOCALES).split(",").map((s) => s.trim().toLowerCase());
const localeSet = new Set(_loc.map((s) => (s === "default" || s === "" ? "" : s)).filter(Boolean));

const minScoreArg = process.argv.indexOf("--min-score");
const MIN_SCORE = minScoreArg >= 0 ? parseFloat(process.argv[minScoreArg + 1]) || 0.55 : 0.55;

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

function extractProductHandle(urlStr) {
  try {
    const p = new URL(urlStr).pathname.replace(/\/$/, "");
    const m1 = p.match(/\/products\/([^/]+)$/);
    if (m1) return decodeURIComponent(m1[1]);
    return null;
  } catch {
    return null;
  }
}

function extractLocalePrefix(pathname) {
  const m = pathname.match(/^\/([a-z]{2,3})\//);
  if (!m) return "";
  if (localeSet.has(m[1])) return `/${m[1]}`;
  return "";
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tokenSet(s) {
  return new Set(
    slugify(s)
      .split("-")
      .filter((t) => t.length > 1 || /^\d+$/.test(t))
  );
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function stripHandleSuffix(handle) {
  return handle.replace(/-[0-9a-f]{1,4}$/i, "");
}

function parseRedirectCsvLine(line) {
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

/** Same normalization as compare-shopify-redirects-export.mjs */
function normalizeRedirectPath(p) {
  let s = String(p ?? "").trim().replace(/^["']|["']$/g, "");
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.replace(/\/+/g, "/");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

/**
 * @returns {{ map: Map<string, string> | null, sourcePath: string, ruleCount: number }}
 */
function loadShopifyRedirectsExport() {
  const envPath = String(process.env.SHOPIFY_REDIRECTS_EXPORT_CSV || "").trim();
  const candidates = [
    envPath && (path.isAbsolute(envPath) ? envPath : path.join(root, envPath)),
    path.join(root, "tmp-404-report", "shopify-redirects-export.csv"),
  ].filter(Boolean);
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length < 2) continue;
    const header = parseRedirectCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    let iFrom = header.indexOf("redirect from");
    let iTo = header.indexOf("redirect to");
    if (iFrom < 0) iFrom = 0;
    if (iTo < 0) iTo = 1;
    const map = new Map();
    for (let li = 1; li < lines.length; li++) {
      const cols = parseRedirectCsvLine(lines[li]);
      const fromN = normalizeRedirectPath(cols[iFrom] ?? "");
      const toN = normalizeRedirectPath(cols[iTo] ?? "");
      if (!fromN || fromN === "/") continue;
      map.set(fromN, toN);
    }
    return { map, sourcePath: filePath, ruleCount: map.size };
  }
  return { map: null, sourcePath: "", ruleCount: 0 };
}

function enrichMatchedWithShopifyRedirects(report, shopifyMap) {
  for (const r of report) {
    if (!r.matched) continue;
    let fromPath = (r.pathname || "").trim();
    if (!fromPath) {
      try {
        fromPath = new URL(r.old).pathname;
      } catch {
        fromPath = "";
      }
    }
    const fromNorm = normalizeRedirectPath(fromPath);
    const targetNorm = normalizeRedirectPath(r.targetPath);
    if (!shopifyMap) {
      r.shopifyRedirectTo = "";
      r.shopifyVsSuggested = "no_export";
      continue;
    }
    const shopifyTo = shopifyMap.get(fromNorm);
    if (shopifyTo === undefined) {
      r.shopifyRedirectTo = "";
      r.shopifyVsSuggested = "no_rule";
    } else {
      r.shopifyRedirectTo = shopifyTo;
      r.shopifyVsSuggested = shopifyTo === targetNorm ? "already_same" : "already_differs";
    }
  }
}

async function fetchAllProducts() {
  const apiBase = `https://${shop}/admin/api/2025-01`;
  const headers = { Accept: "application/json", "X-Shopify-Access-Token": token };
  const out = [];
  let url = `${apiBase}/products.json?limit=250&status=active`;
  while (url) {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(`products: ${res.status} ${JSON.stringify(json)}`);
    out.push(...(json.products || []).filter((p) => p.published_at));
    const link = res.headers.get("link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return out;
}

function bestProductMatch(handle, products) {
  const hRaw = handle.toLowerCase();
  const hStripped = stripHandleSuffix(hRaw);
  const tokensFromHandle = tokenSet(hStripped.replace(/-/g, " "));
  const slugFromHandle = slugify(hStripped.replace(/-/g, " "));

  let best = { score: 0, product: null, reason: "" };

  for (const p of products) {
    const ph = (p.handle || "").toLowerCase();
    if (ph === hRaw || ph === hStripped) {
      return { score: 1, product: p, reason: "handle_exact" };
    }
    const titleSlug = slugify(p.title || "");
    if (titleSlug && titleSlug === slugFromHandle) {
      const sc = 0.98;
      if (sc > best.score) best = { score: sc, product: p, reason: "title_slug_exact" };
    } else if (titleSlug && slugFromHandle && (titleSlug.includes(slugFromHandle) || slugFromHandle.includes(titleSlug))) {
      const shorter = Math.min(titleSlug.length, slugFromHandle.length);
      const longer = Math.max(titleSlug.length, slugFromHandle.length);
      const sc = 0.75 + 0.2 * (shorter / longer);
      if (sc > best.score) best = { score: sc, product: p, reason: "title_slug_partial" };
    }
    const titleTokens = tokenSet(p.title || "");
    const jac = jaccard(tokensFromHandle, titleTokens);
    if (jac > best.score) best = { score: jac, product: p, reason: "token_jaccard" };
  }

  return best;
}

function buildTargetPath(localePrefix, productHandle) {
  return `${localePrefix}/products/${productHandle}`.replace(/\/\//g, "/") || `/products/${productHandle}`;
}

async function main() {
  if (!shop || !token) {
    console.error("Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN");
    process.exit(1);
  }

  const mergedPath = path.join(root, "tmp-404-report", "404-all-merged.txt");
  if (!fs.existsSync(mergedPath)) {
    console.error("Missing", mergedPath);
    process.exit(1);
  }

  const lines = fs.readFileSync(mergedPath, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const urls = [...new Set(lines.map(cleanUrlLine))];

  console.log("Fetching active published products from Shopify...");
  const products = await fetchAllProducts();
  console.log("Catalog products:", products.length);

  const productUrls = [];
  for (const u of urls) {
    const h = extractProductHandle(u);
    if (h) productUrls.push({ url: u, handle: h });
  }

  const uniqueByHandle = new Map();
  for (const row of productUrls) {
    if (!uniqueByHandle.has(row.handle)) uniqueByHandle.set(row.handle, row.url);
  }

  console.log("\nTotal lines in merge file:", lines.length);
  console.log("Unique cleaned URLs:", urls.length);
  console.log("URLs with /products/ in path:", productUrls.length);
  console.log("Unique product handles in 404 list:", uniqueByHandle.size);

  const report = [];
  let matched = 0;
  let highConfidence = 0;

  for (const [handle, sampleUrl] of uniqueByHandle) {
    const { score, product, reason } = bestProductMatch(handle, products);
    let pathname = "";
    try {
      pathname = new URL(sampleUrl).pathname;
    } catch {}
    const locPrefix = extractLocalePrefix(pathname);

    if (score >= MIN_SCORE && product) {
      matched++;
      if (score >= 0.85) highConfidence++;
      const targetPath = buildTargetPath(locPrefix, product.handle);
      report.push({
        old: sampleUrl,
        pathname,
        handle404: handle,
        targetPath,
        score: Number(score.toFixed(4)),
        reason,
        title: product.title,
        newHandle: product.handle,
        matched: true,
      });
    } else {
      report.push({
        old: sampleUrl,
        pathname,
        handle404: handle,
        targetPath: "",
        score: Number(score.toFixed(4)),
        reason: "no_match",
        title: "",
        newHandle: "",
        matched: false,
      });
    }
  }

  const redirectExport = loadShopifyRedirectsExport();
  if (redirectExport.map) {
    console.log(
      "Shopify redirects export:",
      redirectExport.ruleCount,
      "rules from",
      path.relative(root, redirectExport.sourcePath) || redirectExport.sourcePath
    );
  } else {
    console.log(
      "No Shopify redirects export (optional): set SHOPIFY_REDIRECTS_EXPORT_CSV or add tmp-404-report/shopify-redirects-export.csv"
    );
  }
  enrichMatchedWithShopifyRedirects(report, redirectExport.map);

  const matchedRows = report.filter((r) => r.matched);
  let shopifySame = 0;
  let shopifyDiffers = 0;
  let shopifyNoRule = 0;
  let shopifyNoExport = 0;
  for (const r of matchedRows) {
    if (r.shopifyVsSuggested === "already_same") shopifySame++;
    else if (r.shopifyVsSuggested === "already_differs") shopifyDiffers++;
    else if (r.shopifyVsSuggested === "no_rule") shopifyNoRule++;
    else shopifyNoExport++;
  }

  const outDir = path.join(root, "tmp-404-report");
  fs.mkdirSync(outDir, { recursive: true });

  const unmatched = report.filter((r) => !r.matched);
  const fixedReport = [
    `Total lines in 404-all-merged.txt: ${lines.length}`,
    `Unique URLs: ${urls.length}`,
    `URLs containing /products/: ${productUrls.length}`,
    `Unique broken product handles: ${uniqueByHandle.size}`,
    `Matched to current catalog (score >= ${MIN_SCORE}): ${matched}`,
    `High confidence (score >= 0.85): ${highConfidence}`,
    `Unmatched handles: ${unmatched.length}`,
    redirectExport.map
      ? `Shopify redirect export: ${redirectExport.ruleCount} rules (${path.basename(redirectExport.sourcePath)})`
      : "Shopify redirect export: (none — matched rows show shopify_vs_suggested=no_export)",
    `Among matched: shopify already_same=${shopifySame} | already_differs=${shopifyDiffers} | no_rule=${shopifyNoRule} | no_export=${shopifyNoExport}`,
    "",
    "--- Matched: score | reason | old_handle | new_handle | title | sample_url | shopify_redirect_to | shopify_vs_suggested ---",
    ...report
      .filter((r) => r.matched)
      .map(
        (r) =>
          `${r.score}\t${r.reason}\t${r.handle404}\t${r.newHandle}\t${(r.title || "").replace(/\t/g, " ")}\t${r.old}\t${r.shopifyRedirectTo || ""}\t${r.shopifyVsSuggested}`
      ),
    "",
    "--- First 150 unmatched ---",
    ...unmatched.slice(0, 150).map((r) => `${r.handle404}\tbest_score=${r.score}\t${r.old}`),
    unmatched.length > 150 ? `\n... +${unmatched.length - 150} more unmatched` : "",
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "product-404-match-report.txt"), fixedReport, "utf8");

  const csvLines = ["Path,Target,score,reason,shopify_redirect_to,shopify_vs_suggested"];
  for (const r of report.filter((x) => x.matched)) {
    const fromPath = r.pathname || (() => {
      try {
        return new URL(r.old).pathname;
      } catch {
        return "";
      }
    })();
    const sTo = (r.shopifyRedirectTo || "").replace(/"/g, '""');
    const sVs = (r.shopifyVsSuggested || "").replace(/"/g, '""');
    csvLines.push(
      `"${fromPath.replace(/"/g, '""')}","${r.targetPath.replace(/"/g, '""')}",${r.score},${r.reason},"${sTo}","${sVs}"`
    );
  }
  fs.writeFileSync(path.join(outDir, "product-404-redirects-suggested.csv"), csvLines.join("\n"), "utf8");

  function csvCell(s) {
    const t = String(s ?? "");
    if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
  }
  const unmatchedCsv = [
    "best_match_score,handle_404,sample_url",
    ...unmatched.map((r) => [r.score, r.handle404, r.old].map(csvCell).join(",")),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "product-404-unmatched.csv"), unmatchedCsv, "utf8");

  console.log("\n=== Summary (product URLs only) ===");
  console.log("Unique broken product handles:", uniqueByHandle.size);
  console.log("Matched to a current product:", matched, `(${((100 * matched) / uniqueByHandle.size || 0).toFixed(1)}%)`);
  console.log("Of all", lines.length, "lines in file, only", productUrls.length, "rows reference /products/");
  console.log("\nWrote tmp-404-report/product-404-match-report.txt");
  console.log("Wrote tmp-404-report/product-404-redirects-suggested.csv");
  console.log("Wrote tmp-404-report/product-404-unmatched.csv (" + unmatched.length + " data rows)");

  const emitScript = path.join(__dirname, "emit-shopify-redirects-to-add.mjs");
  if (fs.existsSync(emitScript)) {
    const er = spawnSync(process.execPath, [emitScript], { cwd: root, stdio: "inherit" });
    if (er.status !== 0) {
      console.warn("emit-shopify-redirects-to-add exited", er.status, "(run: npm run redirects:emit-to-add)");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
