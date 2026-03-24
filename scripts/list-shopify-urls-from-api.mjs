/**
 * List all storefront URLs from Shopify Admin API (products, collections, pages, blogs, articles).
 * Use this as "canonical" list - URLs not here may be 404.
 * Output: tmp-404-report/canonical-urls.txt
 *
 * Env: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_STOREFRONT_BASE_URL
 */

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
const DEFAULT_LOCALES = "default,es,pt,fr,de,he,ar,ru,ro,it,nl,pl,tr,ja,ko,zh,af,ak,am,as,az,be,bm,bn,bs,eu,hy,sq,fil";
const _loc = (process.env.SHOPIFY_LOCALES || DEFAULT_LOCALES).split(",").map((s) => s.trim().toLowerCase());
const locales = [...new Set(_loc.map((s) => (s === "default" || s === "" ? "" : s)))];

if (!shop || !token) {
  console.error("Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN");
  process.exit(1);
}

const apiBase = `https://${shop}/admin/api/2025-01`;
const headers = { Accept: "application/json", "X-Shopify-Access-Token": token };

async function fetchAll(endpoint, key) {
  const out = [];
  let url = `${apiBase}/${endpoint}?limit=250`;
  while (url) {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${JSON.stringify(json)}`);
    const arr = json[key] || [];
    out.push(...arr);
    const link = res.headers.get("link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return out;
}

function addUrl(urls, path) {
  for (const loc of locales) {
    const prefix = loc ? `/${loc}` : "";
    urls.add(`${baseUrl}${prefix}${path}`);
  }
}

async function main() {
  const urls = new Set();
  addUrl(urls, "/");

  // Products
  const products = (await fetchAll("products.json", "products"))
    .filter((p) => p.status === "active" && p.published_at);
  products.forEach((p) => addUrl(urls, `/products/${encodeURIComponent(p.handle)}`));

  // Collections (custom + smart)
  const [custom, smart] = await Promise.all([
    fetchAll("custom_collections.json", "custom_collections"),
    fetchAll("smart_collections.json", "smart_collections"),
  ]);
  [...custom, ...smart].filter((c) => c.published_at).forEach((c) =>
    addUrl(urls, `/collections/${encodeURIComponent(c.handle)}`)
  );

  // Pages
  const pages = (await fetchAll("pages.json", "pages")).filter((p) => p.published_at && p.handle);
  pages.forEach((p) => addUrl(urls, `/pages/${encodeURIComponent(p.handle)}`));

  // Blogs & Articles
  const blogs = await fetchAll("blogs.json", "blogs");
  for (const b of blogs) {
    addUrl(urls, `/blogs/${encodeURIComponent(b.handle)}`);
    const arts = (await fetchAll(`blogs/${b.id}/articles.json`, "articles")).filter((a) => a.published_at);
    arts.forEach((a) => addUrl(urls, `/blogs/${encodeURIComponent(b.handle)}/${encodeURIComponent(a.handle)}`));
  }

  const list = [...urls].sort();
  const outDir = path.join(root, "tmp-404-report");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "canonical-urls.txt"), list.join("\n"), "utf8");
  console.log("Wrote tmp-404-report/canonical-urls.txt");
  console.log("Total URLs from Admin API (locales:", locales.join(" ") || "default", "):", list.length);
  console.log("  Products:", products.length);
  console.log("  Collections:", custom.length + smart.length);
  console.log("  Pages:", pages.length);
  console.log("  Blogs:", blogs.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
