/**
 * Remove Google AdSense snippets from the live Shopify theme via Admin REST API.
 *
 * Env: .env.local — SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN
 * Optional: SHOPIFY_THEME_ID (numeric) to target a non-main theme
 * Optional: SHOPIFY_API_VERSION (default 2025-01)
 *
 * Requires token scope: read_themes, write_themes (or legacy theme asset access).
 *
 * Usage:
 *   node scripts/remove-adsense-from-shopify-theme.mjs
 *   node scripts/remove-adsense-from-shopify-theme.mjs --dry-run
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocal = join(__dirname, "..", ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal });
else dotenv.config();

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
const dryRun = process.argv.includes("--dry-run");

if (!shop || !token) {
  console.error("Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN (.env.local)");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const base = `https://${shop}/admin/api/${apiVersion}`;
const headers = {
  "X-Shopify-Access-Token": token,
  "Content-Type": "application/json",
};

function stripAdsense(value) {
  let out = value;
  let rounds = 0;
  const patterns = [
    // Standard async loader (known shopcarbon pattern)
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

  const r = await fetch(`${base}/themes.json`, { headers: { "X-Shopify-Access-Token": token } });
  if (!r.ok) throw new Error(`GET themes.json ${r.status} ${await r.text()}`);
  const j = await r.json();
  const main = (j.themes || []).find((t) => t.role === "main");
  if (!main?.id) throw new Error("No main theme found");
  return String(main.id);
}

async function listAssetKeys(themeId) {
  const r = await fetch(`${base}/themes/${themeId}/assets.json`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  if (!r.ok) throw new Error(`GET assets list ${r.status} ${await r.text()}`);
  const j = await r.json();
  return (j.assets || []).map((a) => a.key).filter(Boolean);
}

async function getAsset(themeId, key, retries = 4) {
  const u = new URL(`${base}/themes/${themeId}/assets.json`);
  u.searchParams.set("asset[key]", key);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(u, { headers: { "X-Shopify-Access-Token": token } });
    if (r.status === 429 && attempt < retries) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!r.ok) return { ok: false, status: r.status, text: await r.text() };
    const j = await r.json();
    return { ok: true, value: j.asset?.value ?? "" };
  }
  return { ok: false, status: 429, text: "rate limited" };
}

async function putAsset(themeId, key, value) {
  const r = await fetch(`${base}/themes/${themeId}/assets.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, text };
  return { ok: true };
}

const themeId = await getMainThemeId();
console.log("Shop:", shop, "| Main theme id:", themeId, dryRun ? "(dry-run)" : "");

const keys = await listAssetKeys(themeId);
const liquidKeys = keys.filter((k) => k.endsWith(".liquid"));
console.log("Scanning", liquidKeys.length, "Liquid assets for AdSense…");

let updated = 0;
for (const key of liquidKeys) {
  await sleep(250);
  const got = await getAsset(themeId, key);
  if (!got.ok) {
    console.warn("SKIP (GET failed):", key, got.status);
    continue;
  }
  if (!hasAdsenseSignals(got.value)) continue;

  const { value: next, changed, rounds } = stripAdsense(got.value);
  if (!changed) {
    console.warn("HAS signals but strip regex did not change:", key, "(manual cleanup may be needed)");
    continue;
  }
  if (hasAdsenseSignals(next)) {
    console.warn("Partial strip — still has AdSense signals:", key);
  }

  console.log("PATCH:", key, "| pattern passes:", rounds);
  if (!dryRun) {
    const put = await putAsset(themeId, key, next);
    if (!put.ok) {
      console.error("PUT failed", key, put.status, put.text?.slice(0, 500));
      process.exit(1);
    }
  }
  updated++;
}

console.log(updated ? `Done. ${dryRun ? "Would update" : "Updated"} ${updated} file(s).` : "No AdSense found in Liquid assets (check GTM or an app).");

if (updated === 0 && !dryRun) {
  console.log(
    "\nIf storefront still loads AdSense, remove the tag in Google Tag Manager or uninstall the injecting app, then run: node scripts/verify-storefront-no-adsense.mjs"
  );
}
