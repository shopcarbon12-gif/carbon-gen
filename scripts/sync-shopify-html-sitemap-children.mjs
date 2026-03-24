/**
 * Removes SEOAnt markup from child HTML sitemap Shopify pages (full lists preserved).
 * Fetches live storefront HTML, strips legacy row + style + powered-by, applies carbon-html-sitemap-row + CSS.
 *
 * Page IDs below go stale if you delete/recreate pages. Prefer:
 *   npm run shopify:rebuild-html-sitemap-children
 * (builds from Admin API + upserts by handle; writes html-sitemap-admin-urls.json).
 *
 * Requires .env / .env.local:
 *   SHOPIFY_SHOP_DOMAIN=shopcarbon1.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...  (read_content, write_content)
 *
 * Optional: SHOPIFY_API_VERSION=2025-01
 *           SHOPIFY_STOREFRONT_BASE_URL=https://shopcarbon.com
 *           SHOPIFY_HTML_SITEMAP_USE_LOCAL=1 — read body from tmp-sitemap-clean/html-sitemap-*.html
 *             (skips storefront fetch; use when files are already carbon-clean)
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
const BASE = (
  process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://shopcarbon.com"
).replace(/\/$/, "");

const useLocalBodies =
  String(process.env.SHOPIFY_HTML_SITEMAP_USE_LOCAL || "").trim() === "1";
const localBodiesDir = path.join(root, "tmp-sitemap-clean");

/** Admin page IDs (from storefront __st rid / Pages URL). */
const CHILD_PAGES = [
  {
    id: 128071303420,
    storefrontPath: "/pages/html-sitemap-products",
    localFile: "html-sitemap-products.html",
  },
  {
    id: 128071336188,
    storefrontPath: "/pages/html-sitemap-collections",
    localFile: "html-sitemap-collections.html",
  },
  {
    id: 128071368956,
    storefrontPath: "/pages/html-sitemap-blogs",
    localFile: "html-sitemap-blogs.html",
  },
  {
    id: 128071401724,
    storefrontPath: "/pages/html-sitemap-articles",
    localFile: "html-sitemap-articles.html",
  },
  {
    id: 128071434492,
    storefrontPath: "/pages/html-sitemap-pages",
    localFile: "html-sitemap-pages.html",
  },
];

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

const LEGACY_STYLE_ANCHOR = "\n                            <style>";

function sliceFirstRow(html) {
  const seoant = '<div class="seoant-html-sitemap-row">';
  const carbon = '<div class="carbon-html-sitemap-row">';
  let start = html.indexOf(seoant);
  const fromSeoant = start !== -1;
  if (!fromSeoant) {
    start = html.indexOf(carbon);
  }
  if (start === -1) {
    throw new Error(
      "Missing sitemap row (seoant or carbon); page HTML may have changed."
    );
  }
  const styleIdx = html.indexOf(LEGACY_STYLE_ANCHOR, start);
  if (styleIdx !== -1) {
    return html.slice(start, styleIdx).trim();
  }
  if (!fromSeoant) {
    const ulClose = html.indexOf("</ul>", start);
    if (ulClose === -1) {
      throw new Error(
        "Carbon sitemap row but no </ul> and no legacy style anchor."
      );
    }
    const divClose = html.indexOf("</div>", ulClose);
    if (divClose === -1) {
      throw new Error("Carbon sitemap row missing closing </div> after list.");
    }
    return html.slice(start, divClose + 6).trim();
  }
  throw new Error(
    "Seoant row found but no legacy style anchor; page HTML may have changed."
  );
}

function toCarbonRow(html) {
  return html.replace(/seoant-html-sitemap-row/g, "carbon-html-sitemap-row");
}

function cleanBodyFromStorefrontHtml(html) {
  return `${CARBON_STYLES}\n${toCarbonRow(sliceFirstRow(html))}\n`;
}

async function fetchStorefrontHtml(pathname) {
  const url = BASE + pathname;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
  console.error(
    "Set SHOPIFY_SHOP_DOMAIN to your myshopify.com hostname (e.g. shopcarbon1.myshopify.com)."
  );
  process.exit(1);
}
if (!token) {
  console.error(
    "Set SHOPIFY_ADMIN_ACCESS_TOKEN (Custom app with read_content, write_content)."
  );
  process.exit(1);
}

const apiBase = `https://${shop}/admin/api/${apiVersion}`;
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-Shopify-Access-Token": token,
};

async function getPage(id) {
  const res = await fetch(`${apiBase}/pages/${id}.json`, { headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GET page ${id}: bad JSON ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`GET page ${id}: ${res.status} ${JSON.stringify(json)}`);
  return json.page;
}

async function putPage(id, title, body_html) {
  const res = await fetch(`${apiBase}/pages/${id}.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      page: {
        id: Number(id),
        title,
        body_html,
      },
    }),
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

for (const { id, storefrontPath, localFile } of CHILD_PAGES) {
  let body_html;
  if (useLocalBodies) {
    const fp = path.join(localBodiesDir, localFile);
    if (!fs.existsSync(fp)) {
      throw new Error(
        `SHOPIFY_HTML_SITEMAP_USE_LOCAL=1 but missing file: ${fp}`
      );
    }
    body_html = fs.readFileSync(fp, "utf8").trim();
    console.log("Local body", localFile, "| bytes", Buffer.byteLength(body_html, "utf8"));
  } else {
    console.log("Fetching storefront", storefrontPath);
    const raw = await fetchStorefrontHtml(storefrontPath);
    body_html = cleanBodyFromStorefrontHtml(raw);
  }
  const page = await getPage(id);
  const title = page.title || "Sitemap";
  console.log(
    "PUT",
    id,
    title,
    "| body bytes",
    Buffer.byteLength(body_html, "utf8")
  );
  await putPage(id, title, body_html);
  console.log("OK", storefrontPath);
}

console.log("All child HTML sitemap pages updated.");
console.log("Verify:", BASE + CHILD_PAGES[0].storefrontPath, "(and siblings)");
