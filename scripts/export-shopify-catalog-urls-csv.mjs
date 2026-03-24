/**
 * Export every storefront URL for the shop: products (active + archived + draft),
 * collections, pages, blogs, articles — one CSV row per URL × locale.
 *
 * Env: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_STOREFRONT_BASE_URL
 * Optional: SHOPIFY_LOCALES (comma list, same as list-shopify-urls)
 *
 * Output: tmp-404-report/shopify-catalog-urls-all.csv
 *
 * Usage: node scripts/export-shopify-catalog-urls-csv.mjs
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
let storeBase = (process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://shopcarbon.com").replace(/\/$/, "");
if (!/^https?:\/\//i.test(storeBase)) storeBase = `https://${storeBase}`;
const origin = new URL(storeBase).origin;

const DEFAULT_LOCALES =
  "default,es,pt,fr,de,he,ar,ru,ro,it,nl,pl,tr,ja,ko,zh,af,ak,am,as,az,be,bm,bn,bs,eu,hy,sq,fil";
const _loc = (process.env.SHOPIFY_LOCALES || DEFAULT_LOCALES).split(",").map((s) => s.trim().toLowerCase());
const locales = [...new Set(_loc.map((s) => (s === "default" || s === "" ? "" : s)))];

if (!shop || !token) {
  console.error("Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN");
  process.exit(1);
}

const apiBase = `https://${shop}/admin/api/2025-01`;
const headers = { Accept: "application/json", "X-Shopify-Access-Token": token };

function csvCell(s) {
  const t = String(s ?? "");
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

async function fetchAll(endpoint, arrayKey) {
  const out = [];
  let url = `${apiBase}/${endpoint}?limit=250`;
  while (url) {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(`${endpoint}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
    const arr = json[arrayKey] || [];
    out.push(...arr);
    const link = res.headers.get("link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return out;
}

async function fetchProductsAllStatuses() {
  const statuses = ["active", "archived", "draft"];
  const byId = new Map();
  for (const status of statuses) {
    const out = [];
    let url = `${apiBase}/products.json?limit=250&status=${status}`;
    while (url) {
      const res = await fetch(url, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(`products ${status}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
      out.push(...(json.products || []));
      const link = res.headers.get("link");
      const next = link?.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
    for (const p of out) {
      if (!p?.id) continue;
      byId.set(p.id, { ...p, status: p.status || status });
    }
  }
  return [...byId.values()];
}

function pathForLocale(localePrefix, pathname) {
  return `${origin}${localePrefix}${pathname}`.replace(/([^:])\/\//g, "$1/");
}

function rowsForPath(pathname, baseRow) {
  const r = [];
  for (const loc of locales) {
    const prefix = loc ? `/${loc}` : "";
    r.push({
      ...baseRow,
      locale: loc || "default",
      url: pathForLocale(prefix, pathname),
    });
  }
  return r;
}

async function main() {
  console.log("Fetching products (active + archived + draft)...");
  const products = await fetchProductsAllStatuses();
  console.log("  Products total:", products.length);

  console.log("Fetching collections...");
  const [custom, smart] = await Promise.all([
    fetchAll("custom_collections.json", "custom_collections"),
    fetchAll("smart_collections.json", "smart_collections"),
  ]);
  const collections = [...custom, ...smart];
  console.log("  Collections:", collections.length);

  console.log("Fetching pages...");
  const pages = await fetchAll("pages.json", "pages");
  console.log("  Pages:", pages.length);

  console.log("Fetching blogs & articles...");
  const blogs = await fetchAll("blogs.json", "blogs");
  const articlesByBlog = [];
  for (const b of blogs) {
    const arts = await fetchAll(`blogs/${b.id}/articles.json`, "articles");
    articlesByBlog.push({ blog: b, articles: arts });
  }
  const articleCount = articlesByBlog.reduce((n, x) => n + x.articles.length, 0);
  console.log("  Blogs:", blogs.length, "| Articles:", articleCount);

  const rows = [];

  rows.push({
    resource_type: "home",
    resource_id: "",
    handle: "",
    title: "",
    shopify_status: "",
    published_at: "",
    locale: "default",
    url: `${origin}/`,
  });
  for (const loc of locales) {
    if (!loc) continue;
    rows.push({
      resource_type: "home",
      resource_id: "",
      handle: "",
      title: "",
      shopify_status: "",
      published_at: "",
      locale: loc,
      url: `${origin}/${loc}/`,
    });
  }

  for (const p of products) {
    if (!p.handle) continue;
    const pathname = `/products/${encodeURIComponent(p.handle)}`;
    rows.push(
      ...rowsForPath(pathname, {
        resource_type: "product",
        resource_id: String(p.id),
        handle: p.handle,
        title: (p.title || "").replace(/\r?\n/g, " "),
        shopify_status: p.status || "",
        published_at: p.published_at || "",
      })
    );
  }

  for (const c of collections) {
    if (!c.handle) continue;
    const pathname = `/collections/${encodeURIComponent(c.handle)}`;
    rows.push(
      ...rowsForPath(pathname, {
        resource_type: "collection",
        resource_id: String(c.id),
        handle: c.handle,
        title: (c.title || "").replace(/\r?\n/g, " "),
        shopify_status: c.published_at ? "published" : "unpublished",
        published_at: c.published_at || "",
      })
    );
  }

  for (const p of pages) {
    if (!p.handle) continue;
    const pathname = `/pages/${encodeURIComponent(p.handle)}`;
    rows.push(
      ...rowsForPath(pathname, {
        resource_type: "page",
        resource_id: String(p.id),
        handle: p.handle,
        title: (p.title || "").replace(/\r?\n/g, " "),
        shopify_status: p.published_at ? "published" : "unpublished",
        published_at: p.published_at || "",
      })
    );
  }

  for (const b of blogs) {
    if (!b.handle) continue;
    const pathname = `/blogs/${encodeURIComponent(b.handle)}`;
    rows.push(
      ...rowsForPath(pathname, {
        resource_type: "blog",
        resource_id: String(b.id),
        handle: b.handle,
        title: (b.title || "").replace(/\r?\n/g, " "),
        shopify_status: "",
        published_at: "",
      })
    );
  }

  for (const { blog, articles } of articlesByBlog) {
    if (!blog.handle) continue;
    for (const a of articles) {
      if (!a.handle) continue;
      const pathname = `/blogs/${encodeURIComponent(blog.handle)}/${encodeURIComponent(a.handle)}`;
      rows.push(
        ...rowsForPath(pathname, {
          resource_type: "article",
          resource_id: String(a.id),
          handle: a.handle,
          title: (a.title || "").replace(/\r?\n/g, " "),
          shopify_status: a.published_at ? "published" : "unpublished",
          published_at: a.published_at || "",
        })
      );
    }
  }

  const header =
    "url,resource_type,resource_id,handle,title,shopify_status,published_at,locale";
  const lines = [
    header,
    ...rows.map((r) =>
      [
        r.url,
        r.resource_type,
        r.resource_id,
        r.handle,
        r.title,
        r.shopify_status,
        r.published_at,
        r.locale,
      ].map(csvCell).join(",")
    ),
  ];

  const outDir = path.join(root, "tmp-404-report");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "shopify-catalog-urls-all.csv");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");

  console.log("\nWrote", outPath);
  console.log("Total CSV rows (excl. header):", rows.length);
  console.log("Locales:", locales.length ? locales.join(", ") : "default only");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
