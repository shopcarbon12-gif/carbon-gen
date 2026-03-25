/**
 * Remove Carbon Assist from live theme: strip render + optional snippet delete.
 * Uses .env.local SHOPIFY_ADMIN_ACCESS_TOKEN + SHOPIFY_SHOP_DOMAIN
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocal = join(__dirname, "..", ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal });
else dotenv.config();

const shop = process.env.SHOPIFY_SHOP_DOMAIN || "30e7d3.myshopify.com";
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const THEME_ID = "146033770748";
const API_VER = "2025-01";
const SNIPPET_KEY = "snippets/carbon-accessibility-widget.liquid";

if (!token) {
  console.error("Missing SHOPIFY_ADMIN_ACCESS_TOKEN");
  process.exit(1);
}

const base = `https://${shop}/admin/api/${API_VER}/themes/${THEME_ID}`;

async function getAsset(key) {
  const u = new URL(`${base}/assets.json`);
  u.searchParams.set("asset[key]", key);
  const r = await fetch(u, { headers: { "X-Shopify-Access-Token": token } });
  if (!r.ok) return { ok: false, status: r.status, text: await r.text() };
  const j = await r.json();
  return { ok: true, value: j.asset?.value ?? "" };
}

async function putAsset(key, value) {
  const r = await fetch(`${base}/assets.json`, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ asset: { key, value } }),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, text };
  return { ok: true };
}

async function deleteAsset(key) {
  const u = new URL(`${base}/assets.json`);
  u.searchParams.set("asset[key]", key);
  const r = await fetch(u, {
    method: "DELETE",
    headers: { "X-Shopify-Access-Token": token },
  });
  if (r.status === 404) return { ok: true, skipped: true };
  if (!r.ok) return { ok: false, status: r.status, text: await r.text() };
  return { ok: true };
}

function stripWidgetFromThemeLiquid(body) {
  let out = body;
  out = out.replace(/\n\s*\{\%\s*render\s+['"]carbon-accessibility-widget['"]\s*\%\}\s*\n/g, "\n");
  out = out.replace(/\{\%\s*render\s+['"]carbon-accessibility-widget['"]\s*\%\}/g, "");
  out = out.replace(
    /<script[^>]*src=["']https?:\/\/app\.shopcarbon\.com\/accessibility\/widget[^"']*["'][^>]*>\s*<\/script>/gi,
    ""
  );
  return out;
}

const theme = await getAsset("layout/theme.liquid");
if (!theme.ok) {
  console.error("GET theme.liquid failed", theme);
  process.exit(1);
}

const next = stripWidgetFromThemeLiquid(theme.value);
if (next === theme.value) {
  console.log("theme.liquid: no carbon-accessibility-widget render or inline script found");
} else {
  const put = await putAsset("layout/theme.liquid", next);
  if (!put.ok) {
    console.error("PUT theme.liquid failed", put);
    process.exit(1);
  }
  console.log("OK: removed widget from layout/theme.liquid");
}

const del = await deleteAsset(SNIPPET_KEY);
if (!del.ok) {
  console.warn("DELETE snippet (optional):", del);
} else if (del.skipped) {
  console.log("Snippet already absent");
} else {
  console.log("OK: deleted", SNIPPET_KEY);
}
