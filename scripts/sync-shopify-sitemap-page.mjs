/**
 * Points the store "Sitemap" page at theme template page.carbon-sitemap.json (section: carbon-sitemap-page).
 * Theme must include sections/carbon-sitemap-page.liquid, snippets/carbon-sitemap-links.liquid,
 * templates/page.carbon-sitemap.json (upload via Edit code or Theme Kit).
 *
 * Requires in .env / .env.local:
 *   SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...  (read_content, write_content)
 *
 * Optional:
 *   SHOPIFY_SITEMAP_PAGE_ID=123456789       (skip lookup by handle)
 *   SHOPIFY_SITEMAP_PAGE_HANDLE=sitemap     (default)
 *   SHOPIFY_CREATE_SITEMAP_PAGE=true        (create page if missing)
 *   SHOPIFY_API_VERSION=2025-01
 *   SHOPIFY_STOREFRONT_BASE_URL=https://www.shopcarbon.com   (printed at end only)
 */

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
const pageHandle = (process.env.SHOPIFY_SITEMAP_PAGE_HANDLE || "sitemap").trim().toLowerCase();
const explicitId = (process.env.SHOPIFY_SITEMAP_PAGE_ID || "").trim();
const createIfMissing =
  String(process.env.SHOPIFY_CREATE_SITEMAP_PAGE || "")
    .trim()
    .toLowerCase() === "true";
const storefrontBase = (
  process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://www.shopcarbon.com"
).replace(/\/$/, "");

if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
  console.error(
    "Set SHOPIFY_SHOP_DOMAIN to your myshopify.com hostname (e.g. shopcarbon1.myshopify.com)."
  );
  process.exit(1);
}
if (!token) {
  console.error("Set SHOPIFY_ADMIN_ACCESS_TOKEN (Custom app with read_content, write_content).");
  process.exit(1);
}

const base = `https://${shop}/admin/api/${apiVersion}`;

async function fetchPages() {
  const out = [];
  let url = `${base}/pages.json?limit=250`;
  while (url) {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Shopify-Access-Token": token },
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("Bad JSON listing pages", res.status, text.slice(0, 200));
      process.exit(1);
    }
    if (!res.ok) {
      console.error("List pages failed", res.status, json);
      process.exit(1);
    }
    const pages = Array.isArray(json.pages) ? json.pages : [];
    out.push(...pages);
    const link = res.headers.get("link");
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return out;
}

function findPageId(pages) {
  const h = pageHandle;
  const match = pages.find((p) => String(p.handle || "").toLowerCase() === h);
  return match?.id ?? null;
}

let pageId = explicitId ? Number(explicitId) : null;
if (!pageId || Number.isNaN(pageId)) {
  console.log(`Looking up page handle "${pageHandle}"...`);
  const pages = await fetchPages();
  pageId = findPageId(pages);
}

if (!pageId) {
  if (!createIfMissing) {
    console.error(
      `No page with handle "${pageHandle}". Set SHOPIFY_SITEMAP_PAGE_ID or SHOPIFY_CREATE_SITEMAP_PAGE=true.`
    );
    process.exit(1);
  }
  console.log(`Creating page handle "${pageHandle}" with template carbon-sitemap...`);
  const createRes = await fetch(`${base}/pages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      page: {
        title: "Sitemap",
        handle: pageHandle,
        body_html: "<!-- Content comes from theme section carbon-sitemap-page -->",
        published: true,
        template_suffix: "carbon-sitemap",
      },
    }),
  });
  const createText = await createRes.text();
  let createJson;
  try {
    createJson = JSON.parse(createText);
  } catch {
    console.error("Create page bad response", createRes.status, createText.slice(0, 300));
    process.exit(1);
  }
  if (!createRes.ok) {
    console.error("Create page failed", createRes.status, createJson);
    process.exit(1);
  }
  pageId = createJson.page?.id;
  if (!pageId) {
    console.error("Create page missing id", createJson);
    process.exit(1);
  }
  console.log("Created page id:", pageId);
}

const putUrl = `${base}/pages/${pageId}.json`;
const putRes = await fetch(putUrl, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Shopify-Access-Token": token,
  },
  body: JSON.stringify({
    page: {
      id: Number(pageId),
      title: "Sitemap",
      body_html: "<!-- Content comes from theme section carbon-sitemap-page -->",
      template_suffix: "carbon-sitemap",
    },
  }),
});

const putText = await putRes.text();
let putJson;
try {
  putJson = JSON.parse(putText);
} catch {
  putJson = { raw: putText };
}

if (!putRes.ok) {
  console.error("Shopify API error", putRes.status, putJson);
  process.exit(1);
}

console.log("OK — sitemap page updated:", putJson?.page?.title, "| id:", putJson?.page?.id);
console.log(`Template: carbon-sitemap (requires theme files on live theme)`);
console.log(`Verify: ${storefrontBase}/pages/${putJson?.page?.handle || pageHandle}`);
