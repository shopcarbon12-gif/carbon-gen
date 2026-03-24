/**
 * Build carbon HTML sitemap child pages from live Shopify Admin API data only.
 * Does not use SEOAnt, theme output, or storefront scraping — products/collections/blogs/articles/pages
 * are read from the Admin REST API so lists match your catalog when you run this.
 *
 * Creates or updates Shopify Pages by handle, then writes admin URL map for Playwright.
 *
 * Prereq: delete old html-sitemap-* pages in Admin if you are replacing them (frees handles).
 *
 * Env (.env / .env.local):
 *   SHOPIFY_SHOP_DOMAIN=shopcarbon1.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
 *   SHOPIFY_STOREFRONT_BASE_URL=https://shopcarbon.com   (canonical links in HTML)
 * Optional:
 *   SHOPIFY_API_VERSION=2025-01
 *   SHOPIFY_ADMIN_STORE_SLUG=shopcarbon1   (for admin.shopify.com URLs; else derived from shop domain)
 *
 * Scopes: read_products, read_content, write_content
 *
 * Usage:
 *   node scripts/rebuild-shopify-html-sitemap-children.mjs              # build + upsert pages
 *   node scripts/rebuild-shopify-html-sitemap-children.mjs --build-only # only write tmp-sitemap-clean/*.html
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
let BASE = (
  process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://shopcarbon.com"
).replace(/\/$/, "");
if (!/^https?:\/\//i.test(BASE)) BASE = `https://${BASE}`;

const buildOnly = process.argv.includes("--build-only");

const outDir = path.join(root, "tmp-sitemap-clean");
fs.mkdirSync(outDir, { recursive: true });

const CARBON_STYLES = `<style>
.carbon-html-sitemap-row { margin-bottom: 2.1rem; }
.carbon-html-sitemap-row a { color: inherit; }
.carbon-html-sitemap-row > h3 { margin-bottom: 12px; }
.carbon-html-sitemap-row > ul {
  margin-left: 0; margin-bottom: 4px; columns: 3; -webkit-columns: 3;
}
.carbon-html-sitemap-row > ul > li {
  margin-bottom: 4px; max-width: 250px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; list-style: inside;
}
.rte .carbon-html-sitemap-row > ul > li > a,
.rte .carbon-html-sitemap-row > li > a { border-bottom: unset; }
@media only screen and (max-width: 600px) {
  .carbon-html-sitemap-row > ul { columns: 2; -webkit-columns: 2; }
  .carbon-html-sitemap-row > ul > li { font-size: 16px; }
}
@media only screen and (max-width: 360px) {
  .carbon-html-sitemap-row > ul { columns: 1; -webkit-columns: 1; }
}
</style>`;

const SITEMAP_PAGE_HANDLES = new Set([
  "html-sitemap",
  "html-sitemap-products",
  "html-sitemap-collections",
  "html-sitemap-blogs",
  "html-sitemap-articles",
  "html-sitemap-pages",
]);

function adminStoreSlug() {
  const e = (process.env.SHOPIFY_ADMIN_STORE_SLUG || "").trim();
  if (e) return e;
  const m = shop.match(/^([a-z0-9-]+)\.myshopify\.com$/i);
  return m ? m[1] : "";
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapRow(h3, lis) {
  const items = lis.length
    ? lis.map((li) => `<li>${li}</li>`).join("\n")
    : "<li><em>No items</em></li>";
  return `${CARBON_STYLES}\n<div class="carbon-html-sitemap-row">\n<h3>${escText(h3)}</h3>\n<ul>\n${items}\n</ul>\n</div>\n`;
}

if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
  console.error(
    "Set SHOPIFY_SHOP_DOMAIN to your myshopify.com hostname (e.g. shopcarbon1.myshopify.com)."
  );
  process.exit(1);
}
if (!token) {
  console.error(
    "Set SHOPIFY_ADMIN_ACCESS_TOKEN (read_products, read_content, write_content)."
  );
  process.exit(1);
}

const apiBase = `https://${shop}/admin/api/${apiVersion}`;
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Shopify-Access-Token": token,
};

const getHeaders = {
  Accept: "application/json",
  "X-Shopify-Access-Token": token,
};

async function fetchAllPagesJson(firstUrl, arrayKey) {
  const out = [];
  let url = firstUrl;
  while (url) {
    const res = await fetch(url, { headers: getHeaders });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Bad JSON ${res.status} ${url} ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(`${arrayKey} list ${res.status}: ${JSON.stringify(json)}`);
    }
    const chunk = Array.isArray(json[arrayKey]) ? json[arrayKey] : [];
    out.push(...chunk);
    const link = res.headers.get("link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return out;
}

const products = (
  await fetchAllPagesJson(`${apiBase}/products.json?limit=250`, "products")
)
  .filter((p) => p.status === "active" && p.published_at)
  .sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), undefined, {
      sensitivity: "base",
    })
  );

const [customCols, smartCols] = await Promise.all([
  fetchAllPagesJson(`${apiBase}/custom_collections.json?limit=250`, "custom_collections"),
  fetchAllPagesJson(`${apiBase}/smart_collections.json?limit=250`, "smart_collections"),
]);
const collections = [...customCols, ...smartCols]
  .filter((c) => c.published_at)
  .sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), undefined, {
      sensitivity: "base",
    })
  );

const blogs = (
  await fetchAllPagesJson(`${apiBase}/blogs.json?limit=250`, "blogs")
).sort((a, b) =>
  String(a.title || "").localeCompare(String(b.title || ""), undefined, {
    sensitivity: "base",
  })
);

const articles = [];
for (const blog of blogs) {
  const bid = blog.id;
  const bhandle = blog.handle || String(bid);
  const list = await fetchAllPagesJson(
    `${apiBase}/blogs/${bid}/articles.json?limit=250`,
    "articles"
  );
  for (const a of list) {
    if (!a.published_at) continue;
    articles.push({
      blogHandle: bhandle,
      handle: a.handle,
      title: a.title || a.handle,
    });
  }
}
articles.sort((a, b) =>
  String(a.title).localeCompare(String(b.title), undefined, { sensitivity: "base" })
);

const allPages = await fetchAllPagesJson(`${apiBase}/pages.json?limit=250`, "pages");
const storefrontPages = allPages
  .filter(
    (p) =>
      p.published_at &&
      p.handle &&
      !SITEMAP_PAGE_HANDLES.has(String(p.handle))
  )
  .sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""), undefined, {
      sensitivity: "base",
    })
  );

const productLis = products.map((p) => {
  const href = `${BASE}/products/${encodeURIComponent(p.handle)}`;
  return `<a href="${escAttr(href)}">${escText(p.title || p.handle)}</a>`;
});

const collectionLis = collections.map((c) => {
  const href = `${BASE}/collections/${encodeURIComponent(c.handle)}`;
  return `<a href="${escAttr(href)}">${escText(c.title || c.handle)}</a>`;
});

const blogLis = blogs.map((b) => {
  const href = `${BASE}/blogs/${encodeURIComponent(b.handle)}`;
  return `<a href="${escAttr(href)}">${escText(b.title || b.handle)}</a>`;
});

const articleLis = articles.map((a) => {
  const href = `${BASE}/blogs/${encodeURIComponent(a.blogHandle)}/${encodeURIComponent(a.handle)}`;
  return `<a href="${escAttr(href)}">${escText(a.title)}</a>`;
});

const pageLis = storefrontPages.map((p) => {
  const href = `${BASE}/pages/${encodeURIComponent(p.handle)}`;
  return `<a href="${escAttr(href)}">${escText(p.title || p.handle)}</a>`;
});

const files = {
  "html-sitemap-products.html": wrapRow("Products", productLis),
  "html-sitemap-collections.html": wrapRow("Collections", collectionLis),
  "html-sitemap-blogs.html": wrapRow("Blogs", blogLis),
  "html-sitemap-articles.html": wrapRow("Blog Posts", articleLis),
  "html-sitemap-pages.html": wrapRow("Pages", pageLis),
};

for (const [name, body] of Object.entries(files)) {
  const fp = path.join(outDir, name);
  fs.writeFileSync(fp, body, "utf8");
  console.log("Wrote", name, Buffer.byteLength(body, "utf8"), "bytes");
}

if (buildOnly) {
  console.log("Build-only: skipped Shopify page create/update.");
  process.exit(0);
}

async function listAllPagesForUpsert() {
  return fetchAllPagesJson(`${apiBase}/pages.json?limit=250`, "pages");
}

async function postPage(pagePayload) {
  const res = await fetch(`${apiBase}/pages.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({ page: pagePayload }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`POST page: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.page;
}

async function putPage(id, pagePayload) {
  const res = await fetch(`${apiBase}/pages/${id}.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ page: { id: Number(id), ...pagePayload } }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`PUT page ${id}: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.page;
}

const pageSpecs = [
  {
    key: "products",
    handle: "html-sitemap-products",
    title: "html sitemap products",
    file: "html-sitemap-products.html",
  },
  {
    key: "collections",
    handle: "html-sitemap-collections",
    title: "html sitemap collections",
    file: "html-sitemap-collections.html",
  },
  {
    key: "blogs",
    handle: "html-sitemap-blogs",
    title: "html sitemap blogs",
    file: "html-sitemap-blogs.html",
  },
  {
    key: "articles",
    handle: "html-sitemap-articles",
    title: "html sitemap articles",
    file: "html-sitemap-articles.html",
  },
  {
    key: "pages",
    handle: "html-sitemap-pages",
    title: "html sitemap pages",
    file: "html-sitemap-pages.html",
  },
];

const existingPages = await listAllPagesForUpsert();
const byHandle = new Map(
  existingPages.map((p) => [String(p.handle || "").toLowerCase(), p])
);

const slug = adminStoreSlug();
if (!slug) {
  console.error(
    "Could not derive admin store slug. Set SHOPIFY_ADMIN_STORE_SLUG (e.g. shopcarbon1)."
  );
  process.exit(1);
}

const urlMap = { store: slug, pages: {} };

for (const spec of pageSpecs) {
  const body_html = fs.readFileSync(path.join(outDir, spec.file), "utf8").trim();
  const prev = byHandle.get(spec.handle);
  let saved;
  if (prev?.id) {
    console.log("PUT", spec.handle, "id", prev.id);
    saved = await putPage(prev.id, {
      title: spec.title,
      handle: spec.handle,
      body_html,
      published: true,
    });
  } else {
    console.log("POST create", spec.handle);
    saved = await postPage({
      title: spec.title,
      handle: spec.handle,
      body_html,
      published: true,
    });
  }
  const id = saved?.id;
  if (!id) throw new Error("Missing page id after save");
  urlMap.pages[spec.key] = {
    id,
    handle: spec.handle,
    url: `https://admin.shopify.com/store/${slug}/pages/${id}`,
    storefrontUrl: `${BASE}/pages/${spec.handle}`,
  };
  console.log("OK", spec.handle, "→", urlMap.pages[spec.key].storefrontUrl);
}

const mapPath = path.join(outDir, "html-sitemap-admin-urls.json");
fs.writeFileSync(mapPath, JSON.stringify(urlMap, null, 2), "utf8");
console.log("Wrote", mapPath);
console.log("Regenerate Playwright payloads: node scripts/gen-playwright-sitemap-code.mjs all");
console.log("Rebuild hub merge body (after storefront serves children): npm run shopify:build-html-sitemap");
