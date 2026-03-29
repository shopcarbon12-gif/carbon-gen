/**
 * Creates or updates the Meta "data deletion instructions" storefront page via Admin REST API.
 *
 * Requires in .env / .env.local:
 *   SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...  (read_content, write_content)
 *
 * Optional:
 *   SHOPIFY_API_VERSION=2025-01
 *
 * Source HTML: shopify/meta-data-deletion-shopify-admin.html (single `.page-width.rte` root div).
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const root = process.cwd();
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();
const HANDLE = "facebook-data-deletion";

if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
  console.error(
    "Set SHOPIFY_SHOP_DOMAIN to your myshopify.com hostname (e.g. carbon-xxxxx.myshopify.com).",
  );
  process.exit(1);
}
if (!token) {
  console.error("Set SHOPIFY_ADMIN_ACCESS_TOKEN (Custom app with read_content, write_content).");
  process.exit(1);
}

const htmlPath = path.join(root, "shopify", "meta-data-deletion-shopify-admin.html");
const raw = fs.readFileSync(htmlPath, "utf8");
const start = raw.indexOf('<div class="page-width rte">');
if (start < 0) {
  console.error('Could not find <div class="page-width rte"> in meta-data-deletion-shopify-admin.html');
  process.exit(1);
}
const close = raw.indexOf("</div>", start);
const body_html = raw.slice(start, close + 6);

const base = `https://${shop}/admin/api/${apiVersion}`;

async function findExistingPageId() {
  let url = `${base}/pages.json?limit=250`;
  while (url) {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "X-Shopify-Access-Token": token },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`List pages ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const hit = (json.pages || []).find((p) => p.handle === HANDLE);
    if (hit) return hit.id;
    const link = res.headers.get("link");
    const m = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return null;
}

const existingId = await findExistingPageId();

const pagePayload = {
  title: "Facebook & Instagram data deletion",
  handle: HANDLE,
  body_html,
  published: true,
  template_suffix: null,
};

let res;
if (existingId) {
  res = await fetch(`${base}/pages/${existingId}.json`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ page: { id: existingId, ...pagePayload } }),
  });
} else {
  res = await fetch(`${base}/pages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ page: pagePayload }),
  });
}

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

if (!res.ok) {
  console.error("Shopify API error", res.status, json);
  process.exit(1);
}

const p = json.page;
console.log("OK — page:", p?.title, "| handle:", p?.handle, "| id:", p?.id);
console.log("Public URL: https://shopcarbon.com/pages/" + HANDLE);
console.log("Set this URL in Meta → App settings → Basic → User data deletion (instructions).");
