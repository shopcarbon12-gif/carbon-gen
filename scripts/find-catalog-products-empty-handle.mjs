/**
 * Lists catalog products where `handle` is missing/blank — the case that caused
 * empty "()" in Studio/Gemini Shopify Push titles before the UI fix.
 *
 * Uses SHOPIFY_SHOP_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN from .env / .env.local.
 * Does not print secrets.
 *
 * Usage: node scripts/find-catalog-products-empty-handle.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim().toLowerCase();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const API_VERSION = (process.env.SHOPIFY_API_VERSION || "2025-01").trim();

const BASE_CATALOG_FILTER = "status:active -status:unlisted published_status:published";

function isAllowedProduct(node) {
  const status = String(node?.status || "").trim().toUpperCase();
  const publishedAt = String(node?.publishedAt || "").trim();
  return status === "ACTIVE" && Boolean(publishedAt);
}

function normalizeHandle(h) {
  return String(h ?? "").trim();
}

async function main() {
  if (!shop || !token) {
    console.error("Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN in env.");
    process.exit(1);
  }

  const query = `
    query ScanCatalog($query: String!, $first: Int!, $after: String) {
      products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            status
            publishedAt
          }
        }
      }
    }
  `;

  const missing = [];
  let after = null;
  let pages = 0;
  const maxPages = 40;

  while (pages < maxPages) {
    pages += 1;
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query,
        variables: { query: BASE_CATALOG_FILTER, first: 100, after },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || Array.isArray(json?.errors)) {
      console.error("GraphQL error:", res.status, JSON.stringify(json?.errors || json).slice(0, 500));
      process.exit(1);
    }

    const edges = json?.data?.products?.edges || [];
    for (const edge of edges) {
      const node = edge?.node;
      if (!node || !isAllowedProduct(node)) continue;
      const h = normalizeHandle(node.handle);
      if (!h) {
        missing.push({
          id: String(node.id || ""),
          title: String(node.title || "").trim() || "(no title)",
        });
      }
    }

    const pageInfo = json?.data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }

  console.log(`Shop: ${shop}`);
  console.log(`Scanned up to ${pages} page(s) of catalog (filter: published active).`);
  console.log(`Products with empty/missing handle: ${missing.length}`);
  if (missing.length) {
    for (const row of missing) {
      console.log(`- ${row.title}  (${row.id})`);
    }
  } else {
    console.log(
      "None found. Shopify normally always provides a handle; the UI fix was defensive for empty API fields."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
