import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

const TABLE = "shopify_cart_config";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function resolveShop(raw: string | null | undefined) {
  const requested = normalizeShopDomain(normalizeText(raw) || "") || "";
  if (requested) return requested;
  return normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "__default__";
}

export async function loadConfig(shop: string): Promise<Record<string, unknown>> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(TABLE)
      .select("config")
      .eq("shop", shop)
      .maybeSingle();

    if (error) throw error;

    if (data?.config && typeof data.config === "object") {
      return data.config as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export type SyncToggles = {
  lsSyncEnabled: boolean;
  shopifySyncEnabled: boolean;
  /** When false, the 15-min cron skips. Manual push/remove/pull still work if shopifySyncEnabled is on. */
  shopifyAutoSyncEnabled: boolean;
};

export type ProductUpdateRules = {
  productName: boolean;
  description: boolean;
  urlHandle: boolean;
  price: boolean;
  comparePrice: boolean;
  costPrice: boolean;
  barcode: boolean;
  productType: boolean;
  vendor: boolean;
  weight: boolean;
  tags: boolean;
  styleAttributes: boolean;
  variantOptions: boolean;
};

const DEFAULT_SYNC_TOGGLES: SyncToggles = {
  lsSyncEnabled: true,
  shopifySyncEnabled: true,
  shopifyAutoSyncEnabled: false,
};

/** Load sync toggles from cart config. LS/Shopify sync default to true; auto-sync defaults to OFF for safety. */
export async function loadSyncToggles(shop: string): Promise<SyncToggles> {
  const config = await loadConfig(shop);
  const section = config?.syncToggles as Record<string, unknown> | undefined;
  if (!section || typeof section !== "object") {
    return DEFAULT_SYNC_TOGGLES;
  }
  return {
    lsSyncEnabled: section.lsSyncEnabled !== false,
    shopifySyncEnabled: section.shopifySyncEnabled !== false,
    shopifyAutoSyncEnabled: section.shopifyAutoSyncEnabled === true,
  };
}

/**
 * Safety gates for destructive sync operations.
 * ALL default to OFF — the sync will only read/update, never delete or archive,
 * until the user explicitly enables each one from the config page.
 */
export type DestructiveSyncRules = {
  /** Archive Shopify products whose variants are NOT in Cart Inventory */
  archiveProductsNotInCart: boolean;
  /** Delete Shopify variants when they disappear from Lightspeed */
  deleteVariantsFromShopify: boolean;
  /** Archive entire Shopify products when their LS matrix is deleted/empty */
  archiveOnMatrixRemoval: boolean;
  /** Create new Shopify products for unlinked Cart Inventory items */
  createNewProducts: boolean;
  /** Add missing variants to existing Shopify products */
  addVariantsToExisting: boolean;
};

const DEFAULT_DESTRUCTIVE_RULES: DestructiveSyncRules = {
  archiveProductsNotInCart: false,
  deleteVariantsFromShopify: false,
  archiveOnMatrixRemoval: false,
  createNewProducts: false,
  addVariantsToExisting: false,
};

export async function loadDestructiveSyncRules(shop: string): Promise<DestructiveSyncRules> {
  const config = await loadConfig(shop);
  const section = config?.destructiveSyncRules as Record<string, unknown> | undefined;
  if (!section || typeof section !== "object") {
    return DEFAULT_DESTRUCTIVE_RULES;
  }
  return {
    archiveProductsNotInCart: section.archiveProductsNotInCart === true,
    deleteVariantsFromShopify: section.deleteVariantsFromShopify === true,
    archiveOnMatrixRemoval: section.archiveOnMatrixRemoval === true,
    createNewProducts: section.createNewProducts === true,
    addVariantsToExisting: section.addVariantsToExisting === true,
  };
}

const DEFAULT_UPDATE_RULES: ProductUpdateRules = {
  productName: false,
  description: false,
  urlHandle: false,
  price: false,
  comparePrice: false,
  costPrice: false,
  barcode: false,
  productType: false,
  vendor: false,
  weight: false,
  tags: false,
  styleAttributes: false,
  variantOptions: false,
};

/** Load product update rules from cart config. All default to false (don't update). */
export async function loadProductUpdateRules(shop: string): Promise<ProductUpdateRules> {
  const config = await loadConfig(shop);
  const section = config?.productUpdateRules as Record<string, unknown> | undefined;
  if (!section || typeof section !== "object") {
    return DEFAULT_UPDATE_RULES;
  }
  return {
    productName: section.productName === true,
    description: section.description === true,
    urlHandle: section.urlHandle === true,
    price: section.price === true,
    comparePrice: section.comparePrice === true,
    costPrice: section.costPrice === true,
    barcode: section.barcode === true,
    productType: section.productType === true,
    vendor: section.vendor === true,
    weight: section.weight === true,
    tags: section.tags === true,
    styleAttributes: section.styleAttributes === true,
    variantOptions: section.variantOptions === true,
  };
}
