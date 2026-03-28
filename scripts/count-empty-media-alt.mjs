import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const envLocal = join(root, "..", ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal });
else dotenv.config();

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const API = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

const Q = `
  query P($first: Int!, $after: String) {
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

async function main() {
  let cursor = null;
  let pages = 0;
  let empty = 0;
  let total = 0;
  const samples = [];

  while (pages < 200) {
    pages += 1;
    const r = await fetch(`https://${shop}/admin/api/${API}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: Q, variables: { first: 50, after: cursor } }),
    });
    const j = await r.json();
    if (j.errors) {
      console.error(j.errors);
      process.exit(1);
    }
    const conn = j.data.products;
    for (const e of conn.edges || []) {
      const n = e.node;
      let idx = 0;
      for (const m of n.media?.nodes || []) {
        if (!m?.id) continue;
        idx += 1;
        total += 1;
        const cur = String(m.alt || "").trim() || String(m.image?.altText || "").trim();
        if (!cur) {
          empty += 1;
          if (samples.length < 25) {
            samples.push({
              productTitle: n.title,
              productHandle: n.handle,
              photoIndex: idx,
              mediaId: m.id,
              imageUrl: String(m.image?.url || "").slice(0, 120),
            });
          }
        }
      }
    }
    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  console.log(JSON.stringify({ pages, mediaImagesScanned: total, emptyAltCount: empty, samples }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
