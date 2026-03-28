/**
 * Push carbon-overflow-x-fix snippet + {% render %} in layout/theme.liquid <head>.
 * Env: SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_SHOP_DOMAIN (.env.local)
 */
import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
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

const snippetPath = join(__dirname, "..", "shopify", "snippets", "carbon-overflow-x-fix.liquid");
const snippet = readFileSync(snippetPath, "utf8");
const renderLine = "\n{% render 'carbon-overflow-x-fix' %}\n";

const putSnippet = await putAsset("snippets/carbon-overflow-x-fix.liquid", snippet);
if (!putSnippet.ok) {
  console.error("PUT snippet failed", putSnippet);
  process.exit(1);
}
console.log("OK: snippets/carbon-overflow-x-fix.liquid");

const theme = await getAsset("layout/theme.liquid");
if (!theme.ok) {
  console.error("GET theme.liquid failed", theme);
  process.exit(1);
}

let body = theme.value;
if (body.includes("carbon-overflow-x-fix")) {
  console.log("Skip theme.liquid: carbon-overflow-x-fix already referenced");
  process.exit(0);
}

const needle = "</head>";
const idx = body.lastIndexOf(needle);
if (idx === -1) {
  console.error("No </head> in theme.liquid");
  process.exit(1);
}

body = body.slice(0, idx) + renderLine + body.slice(idx);
const putTheme = await putAsset("layout/theme.liquid", body);
if (!putTheme.ok) {
  console.error("PUT theme.liquid failed", putTheme);
  process.exit(1);
}
console.log("OK: layout/theme.liquid (render before </head>)");
