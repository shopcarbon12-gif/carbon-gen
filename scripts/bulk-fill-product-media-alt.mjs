/**
 * Fill empty Shopify product MediaImage alt text (metadata-based, not vision).
 * Env: .env.local — SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, optional SHOPIFY_API_VERSION
 *
 * Usage:
 *   node scripts/bulk-fill-product-media-alt.mjs           # apply + write tmp/product-media-alt-report.json
 *   node scripts/bulk-fill-product-media-alt.mjs --dry-run
 *   node scripts/bulk-fill-product-media-alt.mjs --limit=100
 */
import dotenv from "dotenv";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal });
else dotenv.config();

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
const DRY = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const PRODUCT_LIMIT = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 0) : 0;

const MAX_ALT = 120;

function norm(s) {
  return typeof s === "string" ? s.trim() : "";
}

function toMediaGid(id) {
  const raw = norm(id);
  if (!raw) return "";
  if (raw.startsWith("gid://")) return raw;
  const n = raw.match(/\d+/)?.[0];
  return n ? `gid://shopify/MediaImage/${n}` : "";
}

function buildAlt(productTitle, photoIndex) {
  const suffix = ` — product photo ${photoIndex}`;
  const t = norm(productTitle) || "Product";
  let base = `${t}${suffix}`;
  if (base.length <= MAX_ALT) return base;
  const budget = MAX_ALT - suffix.length - 3;
  const short = (budget > 8 ? t.slice(0, budget).trimEnd() : t.slice(0, 8)) + "...";
  return `${short}${suffix}`.slice(0, MAX_ALT);
}

async function gql(query, variables) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON Shopify response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.errors?.length) {
    throw new Error(JSON.stringify(json.errors || json, null, 2));
  }
  return json.data;
}

const PRODUCTS_QUERY = `
  query ProductsMediaPage($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          media(first: 50) {
            nodes {
              ... on MediaImage {
                id
                alt
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
`;

const UPDATE_MUTATION = `
  mutation ProductUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media {
        ... on MediaImage {
          id
          alt
        }
      }
      mediaUserErrors {
        field
        message
      }
    }
  }
`;

async function main() {
  if (!shop || !token) {
    console.error("Need SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN");
    process.exit(1);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    shop,
    dryRun: DRY,
    updatedProducts: 0,
    updatedMediaCount: 0,
    skippedProductsNoWork: 0,
    errors: [],
    rows: [],
  };

  let cursor = null;
  let pages = 0;
  const PAGE = 50;
  let productsSeen = 0;

  while (pages < 500) {
    pages += 1;
    console.error(`[alt-fill] fetching products page ${pages}…`);
    const data = await gql(PRODUCTS_QUERY, { first: PAGE, after: cursor });
    const conn = data?.products;
    if (!conn) break;

    for (const edge of conn.edges || []) {
      if (PRODUCT_LIMIT && productsSeen >= PRODUCT_LIMIT) break;
      const node = edge?.node;
      if (!node?.id) continue;
      productsSeen += 1;
      const title = norm(node.title);
      const handle = norm(node.handle);
      const mediaNodes = (node.media?.nodes || []).filter((m) => m && m.id && m.image);

      let photoIndex = 0;
      const updates = [];
      for (const m of mediaNodes) {
        photoIndex += 1;
        const current = norm(m.alt) || norm(m.image?.altText);
        if (current.length > 0) continue;
        const newAlt = buildAlt(title, photoIndex);
        updates.push({
          mediaId: m.id,
          imageUrl: norm(m.image?.url || "").slice(0, 200),
          previousAlt: norm(m.alt) || norm(m.image?.altText) || null,
          newAlt,
        });
      }

      if (!updates.length) {
        report.skippedProductsNoWork += 1;
        continue;
      }

      if (!DRY) {
        const media = updates.map((u) => ({
          id: toMediaGid(u.mediaId),
          alt: newAltSlice(u.newAlt),
        }));
        try {
          const upd = await gql(UPDATE_MUTATION, { productId: node.id, media });
          const errs = upd?.productUpdateMedia?.mediaUserErrors || [];
          if (errs.length) {
            report.errors.push({ productId: node.id, handle, messages: errs.map((e) => e.message) });
            continue;
          }
        } catch (e) {
          report.errors.push({ productId: node.id, handle, messages: [String(e)] });
          continue;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      report.updatedProducts += 1;
      if (report.updatedProducts % 25 === 0) {
        console.error(`[alt-fill] updated ${report.updatedProducts} products (${report.updatedMediaCount} images)…`);
      }
      for (const u of updates) {
        report.updatedMediaCount += 1;
        report.rows.push({
          productTitle: title,
          productHandle: handle,
          productId: node.id,
          mediaId: u.mediaId,
          imageUrl: u.imageUrl,
          previousAlt: u.previousAlt,
          newAlt: u.newAlt,
        });
      }
    }

    if (PRODUCT_LIMIT && productsSeen >= PRODUCT_LIMIT) break;
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo?.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }

  const outDir = join(root, "tmp");
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* exists */
  }
  const outPath = join(outDir, "product-media-alt-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(DRY ? "DRY RUN — no API writes." : "Applied updates to Shopify.");
  console.log(`Report: ${outPath}`);
  console.log(JSON.stringify({ updatedProducts: report.updatedProducts, updatedMediaCount: report.updatedMediaCount, errors: report.errors.length }, null, 2));
}

function newAltSlice(s) {
  return norm(s).slice(0, MAX_ALT) || null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
