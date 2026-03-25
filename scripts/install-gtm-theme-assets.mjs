/**
 * Push carbon-gtm-head/body snippets and patch layout/theme.liquid via Admin API.
 * Reads SHOPIFY_SHOP_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN from .env.local
 *
 * Usage: node scripts/install-gtm-theme-assets.mjs [theme_id]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");
const env = fs.readFileSync(envPath, "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.+)$`, "m"));
  return m ? m[1].trim() : "";
};

const shop = get("SHOPIFY_SHOP_DOMAIN");
const token = get("SHOPIFY_ADMIN_ACCESS_TOKEN");
const themeId = process.argv[2] || "146033770748";
const GTM_ID = "GTM-WHVPQVSC";

if (!shop || !token) {
  console.error("Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

const api = `https://${shop}/admin/api/2025-01`;
const headers = {
  "X-Shopify-Access-Token": token,
  "Content-Type": "application/json",
};

async function getAsset(key) {
  const u = `${api}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`;
  const r = await fetch(u, { headers: { "X-Shopify-Access-Token": token } });
  if (!r.ok) throw new Error(`GET ${key} ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.asset?.value ?? "";
}

async function putAsset(key, value) {
  const r = await fetch(`${api}/themes/${themeId}/assets.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ asset: { key, value } }),
  });
  if (!r.ok) throw new Error(`PUT ${key} ${r.status} ${await r.text()}`);
}

function patchThemeLiquid(src) {
  if (src.includes("carbon-gtm-head")) {
    return { src, changed: false, reason: "already has carbon-gtm-head" };
  }

  const assignLine = `{%- assign gtm_container_id = '${GTM_ID}' -%}`;
  const headRender = `{% render 'carbon-gtm-head', gtm_container_id: gtm_container_id %}`;
  const bodyRender = `{% render 'carbon-gtm-body', gtm_container_id: gtm_container_id %}`;

  let out = src;

  // Insert assign + head render before content_for_header (first occurrence)
  const cfh = "{{ content_for_header }}";
  const idx = out.indexOf(cfh);
  if (idx === -1) {
    return { src, changed: false, reason: "content_for_header not found" };
  }
  const headBlock = `\n\t${assignLine}\n\t${headRender}\n\t`;
  out = out.slice(0, idx) + headBlock + out.slice(idx);

  // After first <body ...> tag closing >, insert body render (once)
  const bodyRe = /<body[^>]*>/i;
  const bm = bodyRe.exec(out);
  if (!bm) {
    return { src, changed: false, reason: "<body> not found" };
  }
  const insAt = bm.index + bm[0].length;
  const bodyBlock = `\n${bodyRender}\n`;
  out = out.slice(0, insAt) + bodyBlock + out.slice(insAt);

  return { src: out, changed: true, reason: "patched" };
}

const headSnip = fs.readFileSync(path.join(root, "shopify/snippets/carbon-gtm-head.liquid"), "utf8");
const bodySnip = fs.readFileSync(path.join(root, "shopify/snippets/carbon-gtm-body.liquid"), "utf8");

console.log("Theme", themeId, "shop", shop);

await putAsset("snippets/carbon-gtm-head.liquid", headSnip);
console.log("Wrote snippets/carbon-gtm-head.liquid");

await putAsset("snippets/carbon-gtm-body.liquid", bodySnip);
console.log("Wrote snippets/carbon-gtm-body.liquid");

const liquid = await getAsset("layout/theme.liquid");
const { src: next, changed, reason } = patchThemeLiquid(liquid);
console.log("theme.liquid patch:", reason);

if (changed) {
  await putAsset("layout/theme.liquid", next);
  console.log("Saved layout/theme.liquid");
} else {
  console.log("No theme.liquid change:", reason);
}
