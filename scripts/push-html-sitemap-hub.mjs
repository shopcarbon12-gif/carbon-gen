/**
 * Creates or updates the html-sitemap hub page from tmp-body.html.
 * Run `npm run shopify:build-html-sitemap` first to generate tmp-body.html.
 *
 * Env: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION (optional)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
config({ path: path.join(rootDir, ".env.local") });
config({ path: path.join(rootDir, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
const storefrontBase = (
  process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://shopcarbon.com"
).replace(/\/$/, "");

if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
  console.error("Set SHOPIFY_SHOP_DOMAIN (e.g. 30e7d3.myshopify.com).");
  process.exit(1);
}
if (!token) {
  console.error("Set SHOPIFY_ADMIN_ACCESS_TOKEN.");
  process.exit(1);
}

const bodyPath = path.join(rootDir, "tmp-body.html");
if (!fs.existsSync(bodyPath)) {
  console.error("tmp-body.html not found. Run: npm run shopify:build-html-sitemap");
  process.exit(1);
}

const body_html = fs.readFileSync(bodyPath, "utf8").trim();
const base = `https://${shop}/admin/api/${apiVersion}`;
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-Shopify-Access-Token": token,
};

async function fetchPages() {
  const out = [];
  let url = `${base}/pages.json?limit=250`;
  while (url) {
    const res = await fetch(url, { headers: { Accept: "application/json", "X-Shopify-Access-Token": token } });
    const json = await res.json();
    if (!res.ok) throw new Error(`List pages: ${res.status} ${JSON.stringify(json)}`);
    out.push(...(json.pages || []));
    const link = res.headers.get("link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return out;
}

const pages = await fetchPages();
const hub = pages.find((p) => String(p.handle || "").toLowerCase() === "html-sitemap");

if (hub?.id) {
  const put = await fetch(`${base}/pages/${hub.id}.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      page: { id: hub.id, title: "HTML Sitemap", handle: "html-sitemap", body_html, published: true },
    }),
  });
  const putJson = await put.json();
  if (!put.ok) throw new Error(`PUT page: ${put.status} ${JSON.stringify(putJson)}`);
  console.log("OK — html-sitemap hub updated, id:", hub.id);
} else {
  const post = await fetch(`${base}/pages.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      page: { title: "HTML Sitemap", handle: "html-sitemap", body_html, published: true },
    }),
  });
  const postJson = await post.json();
  if (!post.ok) throw new Error(`POST page: ${post.status} ${JSON.stringify(postJson)}`);
  console.log("OK — html-sitemap hub created, id:", postJson.page?.id);
}

console.log("Verify:", storefrontBase + "/pages/html-sitemap");
