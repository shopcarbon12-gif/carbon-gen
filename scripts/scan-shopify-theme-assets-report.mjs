/**
 * Scan main theme Liquid assets via Admin REST API; log every HTTP 429 with full request URL;
 * classify assets (failed / unchanged / would strip / changed this run).
 *
 * Env: .env.local — SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN
 * Optional: SHOPIFY_THEME_ID, SHOPIFY_API_VERSION
 *
 * Usage:
 *   node scripts/scan-shopify-theme-assets-report.mjs
 *   node scripts/scan-shopify-theme-assets-report.mjs --apply-adsense-strip   # also PUT stripped files
 *
 * Output: reports/shopify-theme-asset-scan-<timestamp>.json
 */
import dotenv from "dotenv";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal });
else dotenv.config();

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
const applyStrip = process.argv.includes("--apply-adsense-strip");

if (!shop || !token) {
  console.error("Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN (.env.local)");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = `https://${shop}/admin/api/${apiVersion}`;
const readHeaders = { "X-Shopify-Access-Token": token };
const writeHeaders = {
  "X-Shopify-Access-Token": token,
  "Content-Type": "application/json",
};

function stripAdsense(value) {
  let out = value;
  let rounds = 0;
  const patterns = [
    /\r?\n?\s*<script\b[^>]*\bsrc=["']https?:\/\/pagead2\.googlesyndication\.com\/[^"']+["'][^>]*>\s*<\/script>\s*/gi,
    /\r?\n?\s*<script\b[^>]*googlesyndication\.com[^>]*>[\s\S]*?<\/script>\s*/gi,
    /\r?\n?\s*<script\b[^>]*>[\s\S]*?adsbygoogle[\s\S]*?<\/script>\s*/gi,
    /\r?\n?\s*<ins\b[^>]*\bclass=["'][^"']*adsbygoogle[^"']*["'][^>]*>[\s\S]*?<\/ins>\s*/gi,
    /\r?\n?\s*\(adsbygoogle\s*=\s*window\.adsbygoogle\s*\|\|\s*\[\]\)\.push\([^)]*\)\s*;?\s*/gi,
  ];
  for (const re of patterns) {
    const next = out.replace(re, "\n");
    if (next !== out) rounds++;
    out = next;
  }
  out = out.replace(/\n{3,}/g, "\n\n");
  return { value: out, changed: out !== value, rounds };
}

function hasAdsenseSignals(s) {
  return (
    /pagead2\.googlesyndication\.com/i.test(s) ||
    /adsbygoogle\.js/i.test(s) ||
    /ca-pub-5784149318086469/i.test(s) ||
    /\badsbygoogle\b/i.test(s)
  );
}

async function getMainThemeId() {
  const envId = String(process.env.SHOPIFY_THEME_ID || "").trim();
  if (envId && /^\d+$/.test(envId)) return envId;
  const r = await fetch(`${base}/themes.json`, { headers: readHeaders });
  if (!r.ok) throw new Error(`GET themes.json ${r.status} ${await r.text()}`);
  const j = await r.json();
  const main = (j.themes || []).find((t) => t.role === "main");
  if (!main?.id) throw new Error("No main theme found");
  return String(main.id);
}

async function listAssetKeys(themeId) {
  const r = await fetch(`${base}/themes/${themeId}/assets.json`, { headers: readHeaders });
  if (!r.ok) throw new Error(`GET assets list ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (j.assets || []).map((a) => a.key).filter(Boolean);
}

/**
 * GET theme asset; log every 429 with full URL; retry with Retry-After or backoff.
 */
async function getAssetLogged(themeId, key, http429Events, retries = 6) {
  const u = new URL(`${base}/themes/${themeId}/assets.json`);
  u.searchParams.set("asset[key]", key);
  const requestUrl = u.href;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(u, { headers: readHeaders });
    const retryAfterHdr = r.headers.get("retry-after");
    const callLimit = r.headers.get("x-shopify-shop-api-call-limit");

    if (r.status === 429) {
      http429Events.push({
        request_url: requestUrl,
        asset_key: key,
        attempt: attempt + 1,
        retry_after_header: retryAfterHdr,
        x_shopify_shop_api_call_limit: callLimit,
        at: new Date().toISOString(),
      });
      if (attempt < retries) {
        let waitMs = 2000 * (attempt + 1);
        if (retryAfterHdr) {
          const sec = parseFloat(retryAfterHdr);
          if (!Number.isNaN(sec)) waitMs = Math.max(waitMs, Math.ceil(sec * 1000));
        }
        await sleep(waitMs);
        continue;
      }
      return {
        ok: false,
        status: 429,
        text: await r.text(),
        request_url: requestUrl,
      };
    }

    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        text: await r.text(),
        request_url: requestUrl,
      };
    }
    const j = await r.json();
    return { ok: true, value: j.asset?.value ?? "", request_url: requestUrl };
  }
  return { ok: false, status: 429, text: "exhausted retries", request_url: requestUrl };
}

async function putAssetLogged(themeId, key, value, http429Events, retries = 6) {
  const putUrl = `${base}/themes/${themeId}/assets.json`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(putUrl, {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify({ asset: { key, value } }),
    });
    const retryAfterHdr = r.headers.get("retry-after");
    if (r.status === 429) {
      http429Events.push({
        request_url: putUrl,
        asset_key: key,
        method: "PUT",
        attempt: attempt + 1,
        retry_after_header: retryAfterHdr,
        at: new Date().toISOString(),
      });
      if (attempt < retries) {
        let waitMs = 2500 * (attempt + 1);
        if (retryAfterHdr) {
          const sec = parseFloat(retryAfterHdr);
          if (!Number.isNaN(sec)) waitMs = Math.max(waitMs, Math.ceil(sec * 1000));
        }
        await sleep(waitMs);
        continue;
      }
      return { ok: false, status: 429, text: await r.text() };
    }
    if (!r.ok) return { ok: false, status: r.status, text: await r.text() };
    return { ok: true };
  }
  return { ok: false, status: 429, text: "PUT exhausted retries" };
}

const ranAt = new Date().toISOString();
const themeId = await getMainThemeId();
const http429Events = [];
const liquidKeys = (await listAssetKeys(themeId)).filter((k) => k.endsWith(".liquid"));

const assets_get_failed = [];
const assets_unchanged_no_adsense = [];
const assets_with_adsense_strip_would_noop = [];
const assets_would_strip_or_partial = [];
const assets_changed_this_run = [];

const delayMs = Number(process.env.SHOPIFY_THEME_SCAN_DELAY_MS || 400);

for (const key of liquidKeys) {
  await sleep(delayMs);
  const got = await getAssetLogged(themeId, key, http429Events);
  if (!got.ok) {
    assets_get_failed.push({
      asset_key: key,
      final_status: got.status,
      request_url: got.request_url,
    });
    continue;
  }

  if (!hasAdsenseSignals(got.value)) {
    assets_unchanged_no_adsense.push(key);
    continue;
  }

  const { value: next, changed, rounds } = stripAdsense(got.value);
  if (!changed) {
    assets_with_adsense_strip_would_noop.push({
      asset_key: key,
      note: "Contains AdSense-like markers but regex did not remove (manual review).",
    });
    continue;
  }

  const partial = hasAdsenseSignals(next);
  assets_would_strip_or_partial.push({
    asset_key: key,
    strip_pattern_passes: rounds,
    partial_strip_still_has_signals: partial,
  });

  if (applyStrip) {
    await sleep(delayMs);
    const put = await putAssetLogged(themeId, key, next, http429Events);
    if (!put.ok) {
      assets_get_failed.push({
        asset_key: key,
        phase: "PUT_after_strip",
        final_status: put.status,
        detail: String(put.text || "").slice(0, 300),
      });
    } else {
      assets_changed_this_run.push(key);
    }
  }
}

const unique429Urls = [...new Set(http429Events.map((e) => e.request_url))];

const report = {
  generated_at: ranAt,
  shop,
  theme_id: themeId,
  api_version: apiVersion,
  apply_adsense_strip: applyStrip,
  delay_ms_between_requests: delayMs,
  liquid_assets_scanned: liquidKeys.length,
  summary: {
    http_429_event_count: http429Events.length,
    http_429_unique_request_urls: unique429Urls.length,
    get_failed: assets_get_failed.length,
    unchanged_no_adsense: assets_unchanged_no_adsense.length,
    adsense_regex_noop: assets_with_adsense_strip_would_noop.length,
    would_strip_or_partial: assets_would_strip_or_partial.length,
    changed_this_run: assets_changed_this_run.length,
  },
  http_429_events: http429Events,
  http_429_unique_request_urls: unique429Urls,
  assets_changed_this_run,
  assets_unchanged_no_adsense,
  assets_get_failed,
  assets_with_adsense_strip_would_noop,
  assets_would_strip_or_partial,
  notes: [
    "assets_unchanged_no_adsense: GET succeeded; no AdSense substring markers (or already clean).",
    "assets_would_strip_or_partial: would be modified by stripAdsense(); with --apply-adsense-strip these are PUT unless PUT fails.",
    "http_429_events: only events from this run (retries may produce multiple rows per asset). Increase SHOPIFY_THEME_SCAN_DELAY_MS if you see 429.",
  ],
};

const slug = ranAt.replace(/[:.]/g, "-");
const outDir = join(root, "reports");
fs.mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `shopify-theme-asset-scan-${slug}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

const txtPath = outPath.replace(/\.json$/i, ".txt");
const txtBody = [
  "SHOPIFY THEME ASSET SCAN — FULL REPORT (TXT mirror of JSON)",
  `Generated: ${ranAt}`,
  `JSON path: ${outPath}`,
  "",
  "=".repeat(72),
  "",
  JSON.stringify(report, null, 2),
  "",
].join("\n");
fs.writeFileSync(txtPath, txtBody, "utf8");

console.log("Report JSON:", outPath);
console.log("Report TXT: ", txtPath);
console.log(JSON.stringify(report.summary, null, 2));
