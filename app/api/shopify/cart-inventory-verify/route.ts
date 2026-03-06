import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed, isCronAuthed } from "@/lib/auth";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import {
  listCartCatalogParents,
  type StagingParent,
  type StagingVariant,
} from "@/lib/shopifyCartStaging";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

function norm(v: unknown) {
  return String(v ?? "").trim();
}
function normLower(v: unknown) {
  return norm(v).toLowerCase();
}

function toVariantGid(cartId: string): string {
  const c = norm(cartId);
  if (!c) return "";
  if (c.startsWith("gid://")) return c;
  const numericPart = c.includes("~") ? c.split("~")[1] || c : c;
  return `gid://shopify/ProductVariant/${numericPart}`;
}

async function getToken(shop: string): Promise<string | null> {
  const dbToken = await getShopifyAccessToken(shop);
  if (dbToken) return dbToken;
  return getShopifyAdminToken(shop) || null;
}

type ShopifyVariantNode = {
  id: string;
  sku?: string;
  barcode?: string;
  inventoryQuantity?: number;
  inventoryItem?: { id: string };
  product?: {
    id: string;
    title: string;
    status: string;
  };
} | null;

type VariantIssue = {
  parentTitle: string;
  parentId: string;
  variantSku: string;
  variantUpc: string;
  cartId: string;
  cartStock: number | null;
  issue: string;
  shopifySku?: string;
  shopifyBarcode?: string;
  shopifyQty?: number;
  shopifyProductStatus?: string;
  shopifyProductTitle?: string;
};

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req) && !isCronAuthed(req)) {
    const url = new URL(req.url);
    const secret = (process.env.CRON_SECRET || "").trim();
    if (!secret || url.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawShop = norm(searchParams.get("shop"));
    const shop =
      normalizeShopDomain(rawShop) ||
      normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "");
    if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400 });
    const token = await getToken(shop);
    if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });

    const cart = await listCartCatalogParents(shop);
    const parents = cart.data;

    const variantMap = new Map<
      string,
      { parent: StagingParent; variant: StagingVariant }[]
    >();
    let totalVariants = 0;
    let variantsWithCartId = 0;
    let variantsWithoutCartId = 0;

    for (const parent of parents) {
      for (const v of parent.variants) {
        totalVariants++;
        const gid = toVariantGid(v.cartId);
        if (!gid) {
          variantsWithoutCartId++;
          continue;
        }
        variantsWithCartId++;
        const existing = variantMap.get(gid) || [];
        existing.push({ parent, variant: v });
        variantMap.set(gid, existing);
      }
    }

    const uniqueGids = Array.from(variantMap.keys());
    const BATCH = 50;
    const shopifyData = new Map<
      string,
      {
        sku: string;
        barcode: string;
        qty: number;
        productId: string;
        productTitle: string;
        productStatus: string;
        inventoryItemId: string;
      }
    >();

    for (let i = 0; i < uniqueGids.length; i += BATCH) {
      const chunk = uniqueGids.slice(i, i + BATCH);
      const gidList = chunk.map((g) => `"${g}"`).join(",");
      const res = await runShopifyGraphql<{
        nodes?: Array<ShopifyVariantNode>;
      }>({
        shop,
        token,
        query: `query { nodes(ids: [${gidList}]) { ... on ProductVariant { id sku barcode inventoryQuantity inventoryItem { id } product { id title status } } } }`,
        variables: {},
        apiVersion: API_VERSION,
      });
      if (!res.ok) continue;
      for (const node of res.data?.nodes || []) {
        if (!node?.id) continue;
        shopifyData.set(node.id, {
          sku: norm(node.sku),
          barcode: norm(node.barcode),
          qty: node.inventoryQuantity ?? 0,
          productId: norm(node.product?.id),
          productTitle: norm(node.product?.title),
          productStatus: normLower(node.product?.status),
          inventoryItemId: norm(node.inventoryItem?.id),
        });
      }

      if (i + BATCH < uniqueGids.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const issues: VariantIssue[] = [];
    let variantsValid = 0;
    let variantsNotFoundInShopify = 0;
    let variantsPointingToArchived = 0;
    let variantsSkuMismatch = 0;
    let variantsBarcodeMismatch = 0;
    let variantsQtyMismatch = 0;
    let variantsDuplicateCartId = 0;
    let variantsQtyMatch = 0;

    // Pre-compute the effective pushed quantity per GID (MAX of all cart variants sharing that GID)
    const effectiveQtyPerGid = new Map<string, number>();
    for (const [gid, entries] of variantMap.entries()) {
      let maxQty = 0;
      for (const { variant } of entries) {
        const q = typeof variant.stock === "number" && Number.isFinite(variant.stock)
          ? Math.max(0, Math.round(variant.stock))
          : 0;
        if (q > maxQty) maxQty = q;
      }
      effectiveQtyPerGid.set(gid, maxQty);
    }

    const qtyCheckedGids = new Set<string>();

    for (const [gid, entries] of variantMap.entries()) {
      const isDuplicate = entries.length > 1;
      if (isDuplicate) {
        variantsDuplicateCartId += entries.length - 1;
      }

      const shopData = shopifyData.get(gid);

      for (const { parent, variant } of entries) {
        const base = {
          parentTitle: parent.title,
          parentId: parent.id,
          variantSku: norm(variant.sku),
          variantUpc: norm(variant.upc),
          cartId: norm(variant.cartId),
          cartStock: variant.stock,
        };

        if (!shopData) {
          variantsNotFoundInShopify++;
          issues.push({ ...base, issue: "VARIANT_NOT_FOUND_IN_SHOPIFY" });
          continue;
        }

        if (shopData.productStatus === "archived" || shopData.productStatus === "draft") {
          variantsPointingToArchived++;
          issues.push({
            ...base,
            issue: `POINTS_TO_${shopData.productStatus.toUpperCase()}_PRODUCT`,
            shopifySku: shopData.sku, shopifyBarcode: shopData.barcode,
            shopifyQty: shopData.qty, shopifyProductStatus: shopData.productStatus,
            shopifyProductTitle: shopData.productTitle,
          });
          continue;
        }

        // SKU check: only flag if this is a 1:1 mapping (not a duplicate cartId)
        const cartSku = normLower(variant.sku) || normLower(parent.sku);
        const shopSku = normLower(shopData.sku);
        const skuOk = !cartSku || !shopSku || shopSku.includes(cartSku) || cartSku.includes(shopSku);

        if (!skuOk && !isDuplicate) {
          variantsSkuMismatch++;
          issues.push({
            ...base, issue: "SKU_MISMATCH",
            shopifySku: shopData.sku, shopifyBarcode: shopData.barcode,
            shopifyQty: shopData.qty, shopifyProductStatus: shopData.productStatus,
            shopifyProductTitle: shopData.productTitle,
          });
        }

        // Barcode check: only for 1:1 mappings
        const cartUpc = normLower(variant.upc);
        const shopBarcode = normLower(shopData.barcode);
        if (cartUpc && shopBarcode && cartUpc !== shopBarcode && !isDuplicate) {
          variantsBarcodeMismatch++;
          issues.push({
            ...base, issue: "BARCODE_MISMATCH",
            shopifySku: shopData.sku, shopifyBarcode: shopData.barcode,
            shopifyQty: shopData.qty, shopifyProductStatus: shopData.productStatus,
            shopifyProductTitle: shopData.productTitle,
          });
        }

        // Qty check: once per unique GID, using the effective qty (MAX) that the push would use
        if (!qtyCheckedGids.has(gid)) {
          qtyCheckedGids.add(gid);
          const effectiveCartQty = effectiveQtyPerGid.get(gid) ?? 0;
          const shopQty = shopData.qty;

          if (effectiveCartQty !== shopQty) {
            variantsQtyMismatch++;
            issues.push({
              ...base,
              issue: "QTY_MISMATCH",
              cartStock: effectiveCartQty,
              shopifySku: shopData.sku, shopifyBarcode: shopData.barcode,
              shopifyQty: shopData.qty, shopifyProductStatus: shopData.productStatus,
              shopifyProductTitle: shopData.productTitle,
            });
          } else {
            variantsQtyMatch++;
          }
        }

        if (shopData.productStatus === "active") {
          variantsValid++;
        }
      }
    }

    // Count products with duplicate cartIds (multiple cart variants → same Shopify variant)
    let productsWithDuplicateCartIds = 0;
    const parentDupCheck = new Map<string, Set<string>>();
    for (const [gid, entries] of variantMap.entries()) {
      if (entries.length > 1) {
        for (const { parent } of entries) {
          const s = parentDupCheck.get(parent.id) || new Set();
          s.add(gid);
          parentDupCheck.set(parent.id, s);
        }
      }
    }
    for (const [, gids] of parentDupCheck) {
      if (gids.size > 0) productsWithDuplicateCartIds++;
    }

    const noCartIdVariants: Array<{
      parentTitle: string;
      parentId: string;
      variantSku: string;
      variantUpc: string;
      cartStock: number | null;
    }> = [];
    for (const parent of parents) {
      for (const v of parent.variants) {
        if (!norm(v.cartId)) {
          noCartIdVariants.push({
            parentTitle: parent.title,
            parentId: parent.id,
            variantSku: norm(v.sku),
            variantUpc: norm(v.upc),
            cartStock: v.stock,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        totalParents: parents.length,
        totalVariants,
        variantsWithCartId,
        variantsWithoutCartId,
        uniqueShopifyVariantsLinked: uniqueGids.length,
        variantsFoundInShopify: shopifyData.size,
        variantsNotFoundInShopify,
        variantsPointingToArchived,
        variantsValid,
        variantsSkuMismatch,
        variantsBarcodeMismatch,
        variantsQtyMatch,
        variantsQtyMismatch,
        variantsDuplicateCartId,
        productsWithDuplicateCartIds,
      },
      issues: issues.slice(0, 200),
      issuesCount: issues.length,
      noCartIdSample: noCartIdVariants.slice(0, 50),
      noCartIdCount: noCartIdVariants.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
