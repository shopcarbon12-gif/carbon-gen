/**
 * Phase 6 — Image Sync Orchestrator
 * Pushes Shopify product images to Lightspeed items/matrices.
 * Only runs when POS Config → imageSyncSettings.pushShopifyImagesToLS is ON.
 */
import {
  type ImageSyncSettings,
  type ImageSyncResult,
  syncImagesToLsItem,
  syncImagesToLsMatrix,
} from "@/lib/lightspeedImageSync";
import { lsGet } from "@/lib/lightspeedApi";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  listCartCatalogParents,
  type StagingParent,
} from "@/lib/shopifyCartStaging";
import {
  getShopifyAdminToken,
  runShopifyGraphql,
  getShopifyConfig,
  normalizeShopDomain,
} from "@/lib/shopify";

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

interface ShopifyProductImages {
  productImages: string[];
  variantImages: Map<string, string>; // variantGid -> imageUrl
}

async function getShopifyToken(shop: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("shopify_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();
    const dbToken = normalizeText(data?.access_token);
    if (dbToken) return dbToken;
  } catch { /* fallback */ }
  return getShopifyAdminToken(shop) || null;
}

async function fetchShopifyProductImages(
  shop: string,
  token: string,
  productGid: string,
): Promise<ShopifyProductImages> {
  const result: ShopifyProductImages = {
    productImages: [],
    variantImages: new Map(),
  };

  const { apiVersion } = getShopifyConfig("https://placeholder.com");
  const query = `{
    product(id: "${productGid}") {
      media(first: 20) {
        edges {
          node {
            ... on MediaImage {
              image { url }
            }
          }
        }
      }
      variants(first: 100) {
        edges {
          node {
            id
            image { url }
          }
        }
      }
    }
  }`;

  const res = await runShopifyGraphql<{
    product?: {
      media?: { edges: { node: { image?: { url: string } | null } }[] };
      variants?: { edges: { node: { id: string; image?: { url: string } | null } }[] };
    };
  }>({ shop, token, query, apiVersion });

  if (!res.ok || !res.data?.product) return result;

  const product = res.data.product;
  if (product.media?.edges) {
    for (const edge of product.media.edges) {
      if (edge.node.image?.url) result.productImages.push(edge.node.image.url);
    }
  }
  if (product.variants?.edges) {
    for (const edge of product.variants.edges) {
      if (edge.node.image?.url) {
        result.variantImages.set(edge.node.id, edge.node.image.url);
      }
    }
  }

  return result;
}

function extractShopifyProductGid(parent: StagingParent): string | null {
  for (const v of parent.variants) {
    const cartId = normalizeText(v.cartId);
    if (!cartId) continue;
    if (cartId.includes("~")) {
      const productId = cartId.split("~")[0];
      return `gid://shopify/Product/${productId}`;
    }
  }
  return null;
}

function extractShopifyVariantGid(cartId: string): string | null {
  const c = normalizeText(cartId);
  if (!c) return null;
  if (c.startsWith("gid://shopify/ProductVariant/")) return c;
  if (c.includes("~")) {
    const variantId = c.split("~")[1];
    return variantId ? `gid://shopify/ProductVariant/${variantId}` : null;
  }
  return null;
}

interface LSItemBasic {
  itemID: string;
  itemMatrixID: string;
  customSku: string;
  systemSku: string;
}

async function fetchLsItemsForMatrix(matrixId: string): Promise<LSItemBasic[]> {
  try {
    const res = await lsGet<{ Item?: LSItemBasic | LSItemBasic[] }>("Item", {
      itemMatrixID: matrixId,
      limit: 100,
    });
    if (!res?.Item) return [];
    return Array.isArray(res.Item) ? res.Item : [res.Item];
  } catch {
    return [];
  }
}

function matchVariantToLsItem(
  variant: StagingParent["variants"][0],
  lsItems: LSItemBasic[],
): string | null {
  const vSku = normalizeText(variant.sku).toLowerCase();
  const vUpc = normalizeText(variant.upc).toLowerCase();
  const vSellerSku = normalizeText(variant.sellerSku).toLowerCase();

  for (const lsi of lsItems) {
    const lsCustom = normalizeText(lsi.customSku).toLowerCase();
    const lsSystem = normalizeText(lsi.systemSku).toLowerCase();
    if (vSku && (lsCustom === vSku || lsSystem === vSku)) return lsi.itemID;
    if (vSellerSku && (lsCustom === vSellerSku || lsSystem === vSellerSku)) return lsi.itemID;
    if (vUpc && (lsCustom === vUpc || lsSystem === vUpc)) return lsi.itemID;
  }
  return null;
}

function collectStagingImageUrls(parent: StagingParent): ShopifyProductImages {
  const result: ShopifyProductImages = { productImages: [], variantImages: new Map() };
  const seen = new Set<string>();

  const parentImg = normalizeText(parent.image);
  if (parentImg && !seen.has(parentImg)) {
    result.productImages.push(parentImg);
    seen.add(parentImg);
  }

  for (const v of parent.variants) {
    const vImg = normalizeText(v.image);
    if (vImg && !seen.has(vImg)) {
      result.productImages.push(vImg);
      seen.add(vImg);
    }
    if (vImg) {
      const variantGid = extractShopifyVariantGid(v.cartId);
      if (variantGid) result.variantImages.set(variantGid, vImg);
    }
  }

  return result;
}

export interface ImageSyncRunResult {
  totalParents: number;
  processed: number;
  skipped: number;
  matrixResults: ImageSyncResult[];
  itemResults: ImageSyncResult[];
  errors: string[];
}

export async function loadImageSyncSettings(posConfigKey?: string): Promise<ImageSyncSettings> {
  const defaults: ImageSyncSettings = {
    pushShopifyImagesToLS: false,
    deleteExistingLSImages: false,
  };
  try {
    const supabase = getSupabaseAdmin();
    const key = normalizeText(posConfigKey) || normalizeText(process.env.LS_ACCOUNT_ID) || "default";
    const { data } = await supabase
      .from("lightspeed_pos_config")
      .select("config")
      .eq("id", key)
      .maybeSingle();
    if (data?.config && typeof data.config === "object") {
      const cfg = data.config as Record<string, unknown>;
      const is = cfg.imageSyncSettings as Partial<ImageSyncSettings> | undefined;
      if (is) return { ...defaults, ...is };
    }
  } catch { /* use defaults */ }
  return defaults;
}

/**
 * Main entry: run image sync for all Cart Inventory products that are matched to LS.
 * Returns detailed results. Does NOT run if the toggle is OFF.
 */
export async function runImageSync(
  shop: string,
  opts?: { dryRun?: boolean; parentIds?: string[]; settingsOverride?: Partial<ImageSyncSettings> },
): Promise<ImageSyncRunResult> {
  const result: ImageSyncRunResult = {
    totalParents: 0,
    processed: 0,
    skipped: 0,
    matrixResults: [],
    itemResults: [],
    errors: [],
  };

  const dbSettings = await loadImageSyncSettings();
  const settings: ImageSyncSettings = { ...dbSettings, ...opts?.settingsOverride };
  if (!settings.pushShopifyImagesToLS) {
    result.errors.push("Image sync is disabled in POS Config.");
    return result;
  }

  const normalizedShop = normalizeShopDomain(shop);
  if (!normalizedShop) {
    result.errors.push("Invalid shop domain.");
    return result;
  }

  const token = await getShopifyToken(normalizedShop);
  if (!token) {
    result.errors.push("Shopify token not found.");
    return result;
  }

  const cartData = await listCartCatalogParents(normalizedShop);
  let parents = cartData.data.filter((p) =>
    p.id.toLowerCase().startsWith("matrix:") || p.id.toLowerCase().startsWith("sku:")
  );

  if (opts?.parentIds?.length) {
    const allowed = new Set(opts.parentIds.map((id) => id.toLowerCase()));
    parents = parents.filter((p) => allowed.has(p.id.toLowerCase()));
  }

  result.totalParents = parents.length;
  console.log(`[image-sync] Starting for ${parents.length} parents (dryRun=${opts?.dryRun ?? false})`);

  for (const parent of parents) {
    try {
      const productGid = extractShopifyProductGid(parent);

      let shopifyImages: ShopifyProductImages = { productImages: [], variantImages: new Map() };
      if (productGid) {
        shopifyImages = await fetchShopifyProductImages(normalizedShop, token, productGid);
      }

      if (shopifyImages.productImages.length === 0) {
        const stagingUrls = collectStagingImageUrls(parent);
        if (stagingUrls.productImages.length > 0) {
          shopifyImages = stagingUrls;
          console.log(`[image-sync] ${parent.title}: Using ${stagingUrls.productImages.length} staging image(s) (Shopify media returned 0)`);
        }
      }

      if (shopifyImages.productImages.length === 0) {
        result.skipped++;
        continue;
      }

      if (opts?.dryRun) {
        result.processed++;
        continue;
      }

      const isMatrix = parent.id.toLowerCase().startsWith("matrix:");
      const matrixId = isMatrix ? parent.id.replace(/^matrix:/i, "") : null;

      if (matrixId) {
        const matrixResult = await syncImagesToLsMatrix({
          itemMatrixID: matrixId,
          shopifyImageUrls: shopifyImages.productImages,
          productTitle: parent.title,
          deleteFirst: settings.deleteExistingLSImages,
        });
        result.matrixResults.push(matrixResult);

        const lsItems = await fetchLsItemsForMatrix(matrixId);
        for (const variant of parent.variants) {
          const variantGid = extractShopifyVariantGid(variant.cartId);
          const variantImageUrl = variantGid
            ? shopifyImages.variantImages.get(variantGid)
            : null;

          if (!variantImageUrl) continue;

          const lsItemId = matchVariantToLsItem(variant, lsItems);
          if (!lsItemId) continue;

          const itemResult = await syncImagesToLsItem({
            itemID: lsItemId,
            shopifyImageUrls: [variantImageUrl],
            productTitle: `${parent.title} - ${variant.color} ${variant.size}`.trim(),
            deleteFirst: settings.deleteExistingLSImages,
          });
          result.itemResults.push(itemResult);
        }
      } else {
        const skuId = parent.id.replace(/^sku:/i, "");
        if (parent.variants.length > 0 && parent.variants[0].cartId) {
          const v = parent.variants[0];
          const imageUrl = normalizeText(v.image) || shopifyImages.productImages[0];
          if (imageUrl) {
            try {
              const lsRes = await lsGet<{ Item?: LSItemBasic | LSItemBasic[] }>("Item", {
                customSku: skuId,
                limit: 1,
              });
              const lsItem = lsRes?.Item
                ? Array.isArray(lsRes.Item) ? lsRes.Item[0] : lsRes.Item
                : null;
              if (lsItem) {
                const itemResult = await syncImagesToLsItem({
                  itemID: lsItem.itemID,
                  shopifyImageUrls: [imageUrl],
                  productTitle: parent.title,
                  deleteFirst: settings.deleteExistingLSImages,
                });
                result.itemResults.push(itemResult);
              }
            } catch { /* skip standalone lookup failures */ }
          }
        }
      }

      result.processed++;
    } catch (err) {
      result.errors.push(`${parent.title} (${parent.id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[image-sync] Done. Processed: ${result.processed}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);
  return result;
}
