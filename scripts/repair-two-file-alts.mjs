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

const query = `
  mutation RepairFileAlts($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        ... on MediaImage {
          id
          alt
        }
      }
      userErrors {
        message
      }
    }
  }
`;

const files = [
  { id: "gid://shopify/MediaImage/33267635519740", alt: "Carbon Jeans logo lockup — brand asset" },
  { id: "gid://shopify/MediaImage/33504442482940", alt: "Men tank top" },
];

const res = await fetch(`https://${shop}/admin/api/${API}/graphql.json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  },
  body: JSON.stringify({ query, variables: { files } }),
});
console.log(await res.text());
