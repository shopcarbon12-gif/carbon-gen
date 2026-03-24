/**
 * Pushes title + body + default page template from shopify/accessibility-statement-shopify-admin.html via Admin REST API.
 *
 * Requires in .env / .env.local:
 *   SHOPIFY_SHOP_DOMAIN=your-store.myshopify.com
 *   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
 *
 * Optional:
 *   SHOPIFY_ACCESSIBILITY_PAGE_ID=129944682748
 *   SHOPIFY_API_VERSION=2025-01
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const root = process.cwd();
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const pageId = (process.env.SHOPIFY_ACCESSIBILITY_PAGE_ID || "129944682748").trim();
const apiVersion = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();

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

const htmlPath = path.join(root, "shopify", "accessibility-statement-shopify-admin.html");
const raw = fs.readFileSync(htmlPath, "utf8");
const start = raw.indexOf('<div class="page-width rte">');
if (start < 0) {
  console.error("Could not find <div class=\"page-width rte\"> in accessibility-statement-shopify-admin.html");
  process.exit(1);
}
const close = raw.lastIndexOf("</div>");
const body_html = raw.slice(start, close + 6);

const url = `https://${shop}/admin/api/${apiVersion}/pages/${pageId}.json`;
const res = await fetch(url, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Shopify-Access-Token": token,
  },
  body: JSON.stringify({
    page: {
      id: Number(pageId),
      title: "Accessibility statement",
      body_html,
      // Use default page template so `body_html` renders. `carbon-accessibility` uses a section that can
      // diverge from Admin content until the live theme file matches the repo.
      template_suffix: null,
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
  console.error("Shopify API error", res.status, json);
  process.exit(1);
}

console.log("OK — page updated:", json?.page?.title, "| id:", json?.page?.id);
console.log("Verify storefront: https://www.shopcarbon.com/pages/accessibility");
