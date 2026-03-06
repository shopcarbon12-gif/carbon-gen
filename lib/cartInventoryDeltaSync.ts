/**
 * Delta sync engine: LS → Cart Inventory → Shopify.
 * Fetches only items changed since last sync (via timeStamp filter),
 * updates Cart Inventory, then pushes changes to Shopify.
 * Also handles removed items/matrices and new variants (on a slower cadence).
 */
import { lsGet } from "@/lib/lightspeedApi";
import { upsertShopifyCartConfig } from "@/lib/shopifyCartConfigRepository";
import {
  listCartCatalogParents,
  upsertCartCatalogParents,
  removeCartCatalogParents,
  type StagingParent,
  type StagingVariant,
} from "@/lib/shopifyCartStaging";
import { loadConfig, loadProductUpdateRules, loadDestructiveSyncRules } from "@/lib/shopifyCartConfig";
import { runCartPushAll } from "@/lib/cartInventoryPush";
import {
  getShopifyAdminToken,
  runShopifyGraphql,
} from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

const LS_PAGE_SIZE = 100;
const LS_MAX_DELTA_PAGES = 50;
const FULL_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const FULL_CHECK_BATCH_SIZE = parseInt(process.env.FULL_CHECK_BATCH_SIZE || "10", 10);
const SALE_TRIGGER_PARENT_BATCH_SIZE = parseInt(process.env.SALE_TRIGGER_PARENT_BATCH_SIZE || "2", 10);
const SALE_ITEM_LOOKUP_CONCURRENCY = parseInt(process.env.SALE_ITEM_LOOKUP_CONCURRENCY || "6", 10);

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const out: R[] = new Array(items.length);
  let index = 0;
  const run = async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await worker(items[current], current);
    }
  };
  const workers = Array.from({ length: Math.min(safeLimit, items.length) }, () => run());
  await Promise.all(workers);
  return out;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

type LSItem = {
  itemID: string;
  itemMatrixID: string;
  customSku: string;
  systemSku: string;
  EAN: string;
  upc: string;
  description: string;
  manufacturerSku: string;
  defaultCost: string;
  avgCost: string;
  Prices?: { ItemPrice?: Array<{ amount: string; useType: string }> | { amount: string; useType: string } };
  ItemShops?: { ItemShop?: Array<{ qoh: string; shopID: string }> | { qoh: string; shopID: string } };
  Category?: { name?: string; fullPathName?: string };
  Manufacturer?: { name?: string };
  timeStamp: string;
  archived?: string | boolean;
  ItemAttributes?: { attribute1?: string; attribute2?: string; attribute3?: string };
};

type LSItemResponse = {
  Item?: LSItem | LSItem[];
  "@attributes"?: { count?: string };
};

type LSSaleLine = {
  itemID?: string;
  Item?: { itemID?: string };
};

type LSSale = {
  saleID?: string;
  completeTime?: string;
  timeStamp?: string;
  completed?: string | boolean;
  voided?: string | boolean;
  SaleLines?: { SaleLine?: LSSaleLine | LSSaleLine[] };
};

type LSSaleResponse = {
  Sale?: LSSale | LSSale[];
};

type FieldChange = {
  parentId: string;
  productTitle: string;
  variantSku: string;
  field: string;
  oldValue: string;
  newValue: string;
};

export type DeltaSyncResult = {
  ok: boolean;
  itemsChecked: number;
  itemsUpdated: number;
  variantsAdded: number;
  variantsDeleted: number;
  productsArchived: number;
  errors: number;
  errorDetails: string[];
  durationMs: number;
  pushed?: number;
  changes: FieldChange[];
};

function getDefaultPrice(item: LSItem): number | null {
  const prices = item.Prices?.ItemPrice;
  if (!prices) return null;
  const arr = Array.isArray(prices) ? prices : [prices];
  const defaultPrice = arr.find((p) => normalizeText(p.useType) === "Default");
  const amount = parseFloat(normalizeText(defaultPrice?.amount || arr[0]?.amount));
  return Number.isFinite(amount) ? amount : null;
}

function getTotalQoh(item: LSItem): number {
  const shops = item.ItemShops?.ItemShop;
  if (!shops) return 0;
  const arr = Array.isArray(shops) ? shops : [shops];
  return arr.reduce((sum, s) => {
    const shopId = normalizeText(s.shopID);
    if (!shopId || shopId === "0") return sum;
    return sum + (parseInt(normalizeText(s.qoh), 10) || 0);
  }, 0);
}

function getCategory(item: LSItem): string {
  return normalizeText(item.Category?.fullPathName || item.Category?.name).replace(/\\/g, " >> ");
}

function getBrand(item: LSItem): string {
  return normalizeText(item.Manufacturer?.name);
}

function getColor(item: LSItem): string {
  return normalizeText(item.ItemAttributes?.attribute1);
}

function getSize(item: LSItem): string {
  return normalizeText(item.ItemAttributes?.attribute2);
}

async function saveConfig(shop: string, config: Record<string, unknown>) {
  await upsertShopifyCartConfig(shop, config);
}

async function fetchChangedItems(since: string): Promise<LSItem[]> {
  const allItems: LSItem[] = [];
  let offset = 0;

  for (let page = 0; page < LS_MAX_DELTA_PAGES; page++) {
    const query: Record<string, string | number> = {
      load_relations: '["Category","Manufacturer","ItemShops","ItemAttributes"]',
      limit: LS_PAGE_SIZE,
      offset,
      orderby: "timeStamp",
      orderby_desc: 1,
    };
    if (since) {
      query.timeStamp = `>,${since}`;
    }

    const res = await lsGet<LSItemResponse>("Item", query);
    const items = res?.Item;
    if (!items) break;

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length === 0) break;

    allItems.push(...arr);
    if (arr.length < LS_PAGE_SIZE) break;
    offset += LS_PAGE_SIZE;
  }

  return allItems;
}

async function fetchItemsForMatrix(matrixId: string): Promise<LSItem[]> {
  const allItems: LSItem[] = [];
  let offset = 0;

  for (let page = 0; page < 20; page++) {
    const res = await lsGet<LSItemResponse>("Item", {
      itemMatrixID: matrixId,
      load_relations: '["Category","Manufacturer","ItemShops","ItemAttributes"]',
      limit: LS_PAGE_SIZE,
      offset,
    });
    const items = res?.Item;
    if (!items) break;

    const arr = Array.isArray(items) ? items : [items];
    if (arr.length === 0) break;
    allItems.push(...arr);
    if (arr.length < LS_PAGE_SIZE) break;
    offset += LS_PAGE_SIZE;
  }

  return allItems;
}

async function fetchItemsForStandaloneSku(sku: string): Promise<LSItem[]> {
  const needle = normalizeLower(sku);
  if (!needle) return [];

  const queries: Array<Record<string, string | number>> = [
    {
      customSku: sku,
      load_relations: '["Category","Manufacturer","ItemShops","ItemAttributes"]',
      limit: LS_PAGE_SIZE,
      offset: 0,
    },
    {
      systemSku: sku,
      load_relations: '["Category","Manufacturer","ItemShops","ItemAttributes"]',
      limit: LS_PAGE_SIZE,
      offset: 0,
    },
    {
      customSku: `~,${sku}`,
      load_relations: '["Category","Manufacturer","ItemShops","ItemAttributes"]',
      limit: LS_PAGE_SIZE,
      offset: 0,
    },
    {
      systemSku: `~,${sku}`,
      load_relations: '["Category","Manufacturer","ItemShops","ItemAttributes"]',
      limit: LS_PAGE_SIZE,
      offset: 0,
    },
  ];

  const dedup = new Map<string, LSItem>();
  for (const query of queries) {
    const res = await lsGet<LSItemResponse>("Item", query);
    const items = res?.Item;
    const arr = Array.isArray(items) ? items : items ? [items] : [];
    for (const item of arr) {
      const itemId = normalizeText(item.itemID);
      if (!itemId) continue;
      const lsSku = normalizeLower(normalizeText(item.customSku) || normalizeText(item.systemSku));
      if (lsSku !== needle) continue;
      dedup.set(itemId, item);
    }
    if (dedup.size > 0) break;
  }

  return Array.from(dedup.values());
}

async function fetchRecentSales(since: string): Promise<LSSale[]> {
  const query: Record<string, string | number> = {
    limit: "200",
    orderby: "completeTime",
    orderby_desc: 1,
    load_relations: '["SaleLines","SaleLines.Item"]',
    completed: "true",
  };

  // Try server-side time filtering first; fallback to client-side below.
  if (since) query.completeTime = `>,${since}`;

  try {
    const res = await lsGet<LSSaleResponse>("Sale", query);
    const salesRaw = res?.Sale;
    const arr = Array.isArray(salesRaw) ? salesRaw : salesRaw ? [salesRaw] : [];
    if (!since) return arr;
    return arr.filter((sale) => {
      if (sale.voided === true || normalizeText(sale.voided).toLowerCase() === "true") return false;
      const t = Date.parse(normalizeText(sale.completeTime) || normalizeText(sale.timeStamp));
      const s = Date.parse(since);
      if (!Number.isFinite(t) || !Number.isFinite(s)) return true;
      return t > s;
    });
  } catch {
    const fallback = await lsGet<LSSaleResponse>("Sale", {
      limit: "200",
      orderby: "completeTime",
      orderby_desc: 1,
      load_relations: '["SaleLines","SaleLines.Item"]',
      completed: "true",
    });
    const salesRaw = fallback?.Sale;
    const arr = Array.isArray(salesRaw) ? salesRaw : salesRaw ? [salesRaw] : [];
    if (!since) return arr;
    const s = Date.parse(since);
    return arr.filter((sale) => {
      if (sale.voided === true || normalizeText(sale.voided).toLowerCase() === "true") return false;
      const t = Date.parse(normalizeText(sale.completeTime) || normalizeText(sale.timeStamp));
      if (!Number.isFinite(t) || !Number.isFinite(s)) return false;
      return t > s;
    });
  }
}

function extractItemIdsFromSales(sales: LSSale[]): string[] {
  const ids = new Set<string>();
  for (const sale of sales) {
    const lines = sale.SaleLines?.SaleLine;
    const arr = Array.isArray(lines) ? lines : lines ? [lines] : [];
    for (const line of arr) {
      const itemId = normalizeText(line?.itemID || line?.Item?.itemID);
      if (itemId) ids.add(itemId);
    }
  }
  return Array.from(ids);
}

async function fetchItemById(itemId: string): Promise<LSItem | null> {
  const id = normalizeText(itemId);
  if (!id) return null;
  try {
    const res = await lsGet<LSItemResponse>("Item", {
      itemID: id,
      load_relations: '["Category","Manufacturer","ItemShops","ItemAttributes"]',
      limit: 1,
    });
    const row = Array.isArray(res?.Item) ? res.Item[0] : res?.Item;
    return row || null;
  } catch {
    return null;
  }
}

function buildVariantFromLS(item: LSItem, parentId: string): StagingVariant {
  const sku = normalizeText(item.customSku) || normalizeText(item.systemSku);
  return {
    id: `ls-${normalizeText(item.itemID)}`,
    parentId,
    sku,
    upc: normalizeText(item.upc) || normalizeText(item.EAN),
    sellerSku: "",
    cartId: "",
    stock: getTotalQoh(item),
    stockByLocation: [],
    price: getDefaultPrice(item),
    comparePrice: null,
    costPrice: parseFloat(normalizeText(item.defaultCost)) || null,
    weight: null,
    weightUnit: "kg",
    color: getColor(item),
    size: getSize(item),
    image: "",
    status: "PENDING",
    error: null,
  };
}

function cartParentIdForMatrix(matrixId: string): string {
  return `matrix:${normalizeLower(matrixId)}`;
}

function cartParentIdForItem(item: LSItem): string {
  const matrixId = normalizeText(item.itemMatrixID);
  if (matrixId && matrixId !== "0") return cartParentIdForMatrix(matrixId);
  const sku = normalizeText(item.customSku) || normalizeText(item.systemSku);
  if (sku) return `sku:${normalizeLower(sku)}`;
  return "";
}

async function getShopifyToken(shop: string): Promise<string | null> {
  try {
    const dbToken = await getShopifyAccessToken(shop);
    if (dbToken) return dbToken;
  } catch { /* fallback */ }
  return getShopifyAdminToken(shop) || null;
}

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

async function archiveShopifyProduct(shop: string, token: string, productGid: string): Promise<boolean> {
  const res = await runShopifyGraphql<{
    productUpdate?: { product?: { id: string }; userErrors?: Array<{ message: string }> };
  }>({
    shop,
    token,
    query: `mutation productUpdate($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { id }
        userErrors { message }
      }
    }`,
    variables: { product: { id: productGid, status: "ARCHIVED" } },
    apiVersion: API_VERSION,
  });
  return res.ok && !res.data?.productUpdate?.userErrors?.length;
}

async function deleteShopifyVariant(shop: string, token: string, productGid: string, variantGid: string): Promise<boolean> {
  const res = await runShopifyGraphql<{
    productVariantsBulkDelete?: { product?: { id: string }; userErrors?: Array<{ message: string }> };
  }>({
    shop,
    token,
    query: `mutation productVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
      productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
        product { id }
        userErrors { message }
      }
    }`,
    variables: { productId: productGid, variantsIds: [variantGid] },
    apiVersion: API_VERSION,
  });
  return res.ok && !res.data?.productVariantsBulkDelete?.userErrors?.length;
}

async function lookupShopifyProductForVariant(
  shop: string,
  token: string,
  cartId: string
): Promise<{ productGid: string; variantGid: string } | null> {
  const variantGid = cartId.startsWith("gid://")
    ? cartId
    : `gid://shopify/ProductVariant/${cartId}`;
  const res = await runShopifyGraphql<{
    productVariant?: { id: string; product?: { id: string; status?: string } };
  }>({
    shop,
    token,
    query: `query($id: ID!) { productVariant(id: $id) { id product { id status } } }`,
    variables: { id: variantGid },
    apiVersion: API_VERSION,
  });
  if (!res.ok || !res.data?.productVariant?.product?.id) return null;
  return {
    productGid: res.data.productVariant.product.id,
    variantGid: res.data.productVariant.id,
  };
}

async function writeSyncLog(shop: string, result: DeltaSyncResult) {
  try {
    const { sqlQuery, ensureSqlReady } = await import("@/lib/sqlDb");
    await ensureSqlReady();
    const now = new Date().toISOString();

    const rows = await sqlQuery<{ id: string }>(
      `INSERT INTO shopify_cart_sync_activity
         (shop, synced_at, items_checked, items_updated, variants_added, variants_deleted, products_archived, errors, error_details, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        shop, now,
        result.itemsChecked, result.itemsUpdated,
        result.variantsAdded, result.variantsDeleted,
        result.productsArchived, result.errors,
        result.errorDetails.length > 0 ? result.errorDetails.join("; ").slice(0, 2000) : null,
        result.durationMs,
      ]
    );

    const syncId = rows[0]?.id;
    if (syncId && result.changes.length > 0) {
      const BATCH = 50;
      for (let i = 0; i < result.changes.length; i += BATCH) {
        const batch = result.changes.slice(i, i + BATCH);
        const values: unknown[] = [];
        const placeholders: string[] = [];
        for (let j = 0; j < batch.length; j++) {
          const c = batch[j];
          const offset = j * 7;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`
          );
          values.push(syncId, c.parentId, c.productTitle, c.variantSku, c.field, c.oldValue, c.newValue);
        }
        await sqlQuery(
          `INSERT INTO shopify_cart_sync_changes (sync_id, parent_id, product_title, variant_sku, field, old_value, new_value)
           VALUES ${placeholders.join(", ")}`,
          values
        );
      }
    }
  } catch {
    // best-effort logging
  }
}

/**
 * Main delta sync: fetches changed LS items, updates Cart Inventory, pushes to Shopify.
 */
export async function runDeltaSync(shop: string, opts?: { forceFullCheck?: boolean; targetParentId?: string }): Promise<DeltaSyncResult> {
  const start = Date.now();
  const result: DeltaSyncResult = {
    ok: true,
    itemsChecked: 0,
    itemsUpdated: 0,
    variantsAdded: 0,
    variantsDeleted: 0,
    productsArchived: 0,
    errors: 0,
    errorDetails: [],
    durationMs: 0,
    changes: [],
  };

  try {
    const config = await loadConfig(shop);
    const lastDeltaSyncAt = normalizeText((config as Record<string, unknown>).lastDeltaSyncAt);
    const lastFullCheckAt = normalizeText((config as Record<string, unknown>).lastFullCheckAt);
    const lastSaleSyncAt = normalizeText((config as Record<string, unknown>).lastSaleSyncAt);
    const now = new Date().toISOString();

    // --- SALE/REFUND PHASE: prioritize near-real-time store transactions ---
    try {
      const destructiveRules = await loadDestructiveSyncRules(shop);
      const recentSales = await fetchRecentSales(lastSaleSyncAt);
      const affectedItemIds = extractItemIdsFromSales(recentSales);
      const itemLookupCache = new Map<string, Promise<LSItem | null>>();
      const getCachedItemById = (itemId: string) => {
        const key = normalizeText(itemId);
        const existing = itemLookupCache.get(key);
        if (existing) return existing;
        const created = fetchItemById(key);
        itemLookupCache.set(key, created);
        return created;
      };
      const affectedItems = await mapWithConcurrency(
        affectedItemIds,
        SALE_ITEM_LOOKUP_CONCURRENCY,
        async (itemId) => getCachedItemById(itemId)
      );
      const affectedParentsOrdered: string[] = [];
      const affectedSeen = new Set<string>();
      for (const item of affectedItems) {
        if (!item) continue;
        const parentId = cartParentIdForItem(item);
        if (!parentId) continue;
        const key = normalizeLower(parentId);
        if (affectedSeen.has(key)) continue;
        affectedSeen.add(key);
        affectedParentsOrdered.push(parentId);
      }

      const saleSyncSkip = Math.max(
        0,
        parseInt(normalizeText((config as Record<string, unknown>).saleSyncSkip) || "0", 10) || 0
      );
      const batchStart = Math.min(saleSyncSkip, affectedParentsOrdered.length);
      const batchEnd = Math.min(batchStart + Math.max(1, SALE_TRIGGER_PARENT_BATCH_SIZE), affectedParentsOrdered.length);
      const targetParents = affectedParentsOrdered.slice(batchStart, batchEnd);

      for (const parentId of targetParents) {
        await runFullCheck(shop, result, destructiveRules, 0, parentId);
      }

      // Advance cursor through backlog; only advance time watermark when backlog is fully drained.
      if (batchEnd < affectedParentsOrdered.length) {
        (config as Record<string, unknown>).saleSyncSkip = batchEnd;
      } else {
        (config as Record<string, unknown>).saleSyncSkip = 0;
        (config as Record<string, unknown>).lastSaleSyncAt = now;
      }
    } catch (saleSyncErr) {
      result.errors++;
      result.errorDetails.push(`Sale-triggered sync failed: ${(saleSyncErr as Error)?.message}`);
    }
    if (!lastSaleSyncAt && !normalizeText((config as Record<string, unknown>).lastSaleSyncAt)) {
      (config as Record<string, unknown>).lastSaleSyncAt = now;
    }

    // --- DELTA PHASE: fetch only changed catalog items ---
    if (!lastDeltaSyncAt) {
      // First run: just seed the timestamp, don't fetch everything
      console.log("[delta-sync] First run — seeding timestamps, no items to process.");
      (config as Record<string, unknown>).lastDeltaSyncAt = now;
      (config as Record<string, unknown>).lastFullCheckAt = now;
      await saveConfig(shop, config);
      result.durationMs = Date.now() - start;
      await writeSyncLog(shop, result);
      return result;
    }

    const changedItems = await fetchChangedItems(lastDeltaSyncAt);
    result.itemsChecked = changedItems.length;

    if (changedItems.length > 0) {
      const cartParents = await listCartCatalogParents(shop);
      const cartMap = new Map<string, StagingParent>();
      for (const p of cartParents.data) {
        cartMap.set(normalizeLower(p.id), p);
      }

      const changedByMatrix = new Map<string, LSItem[]>();
      const changedStandalone: LSItem[] = [];

      for (const item of changedItems) {
        const matrixId = normalizeText(item.itemMatrixID);
        if (matrixId && matrixId !== "0") {
          if (!changedByMatrix.has(matrixId)) changedByMatrix.set(matrixId, []);
          changedByMatrix.get(matrixId)!.push(item);
        } else {
          changedStandalone.push(item);
        }
      }

      const parentIdsToUpdate = new Set<string>();

      // Update matrix-based products
      for (const [matrixId, items] of changedByMatrix) {
        const cartKey = cartParentIdForMatrix(matrixId);
        const cartParent = cartMap.get(normalizeLower(cartKey));
        if (!cartParent) continue; // not in Cart Inventory, skip (manual add only)

        let updated = false;
        for (const item of items) {
          const sku = normalizeLower(normalizeText(item.customSku) || normalizeText(item.systemSku));
          const upc = normalizeText(item.upc) || normalizeText(item.EAN);

          const existingVariant = cartParent.variants.find(
            (v) =>
              (sku && normalizeLower(v.sku) === sku) ||
              (upc && normalizeText(v.upc) === upc)
          );

          if (existingVariant) {
            const newQty = getTotalQoh(item);
            const newPrice = getDefaultPrice(item);
            const newColor = getColor(item);
            const newSize = getSize(item);
            const newUpc = normalizeText(item.upc) || normalizeText(item.EAN);
            const newCost = parseFloat(normalizeText(item.defaultCost)) || null;
            const vSku = normalizeText(existingVariant.sku);

            const trackChange = (field: string, oldVal: unknown, newVal: unknown) => {
              const o = String(oldVal ?? "");
              const n = String(newVal ?? "");
              if (o !== n) {
                result.changes.push({
                  parentId: cartParent.id,
                  productTitle: cartParent.title,
                  variantSku: vSku,
                  field,
                  oldValue: o,
                  newValue: n,
                });
              }
            };

            let changed = false;
            if (existingVariant.stock !== newQty) { trackChange("stock", existingVariant.stock, newQty); changed = true; }
            if (existingVariant.price !== newPrice) { trackChange("price", existingVariant.price, newPrice); changed = true; }
            if (normalizeLower(existingVariant.color) !== normalizeLower(newColor)) { trackChange("color", existingVariant.color, newColor); changed = true; }
            if (normalizeLower(existingVariant.size) !== normalizeLower(newSize)) { trackChange("size", existingVariant.size, newSize); changed = true; }
            if (normalizeText(existingVariant.upc) !== normalizeText(newUpc)) { trackChange("upc", existingVariant.upc, newUpc); changed = true; }
            if (existingVariant.costPrice !== newCost) { trackChange("costPrice", existingVariant.costPrice, newCost); changed = true; }

            if (changed) {
              existingVariant.stock = newQty;
              existingVariant.price = newPrice;
              existingVariant.color = newColor;
              existingVariant.size = newSize;
              existingVariant.upc = newUpc;
              existingVariant.costPrice = newCost;
              updated = true;
              result.itemsUpdated++;
            }
          }
          // New variant detection handled in full check phase below
        }

        if (updated) {
          const category = getCategory(items[0]);
          const brand = getBrand(items[0]);
          if (category && cartParent.category !== category) {
            result.changes.push({ parentId: cartParent.id, productTitle: cartParent.title, variantSku: "", field: "category", oldValue: cartParent.category || "", newValue: category });
            cartParent.category = category;
          }
          if (brand && cartParent.brand !== brand) {
            result.changes.push({ parentId: cartParent.id, productTitle: cartParent.title, variantSku: "", field: "brand", oldValue: cartParent.brand || "", newValue: brand });
            cartParent.brand = brand;
          }
          cartParent.stock = cartParent.variants.reduce(
            (sum, v) => sum + (typeof v.stock === "number" ? v.stock : 0),
            0
          );
          cartParent.price = cartParent.variants.find((v) => v.price !== null)?.price ?? cartParent.price;
          await upsertCartCatalogParents(shop, [cartParent]);
          parentIdsToUpdate.add(cartParent.id);
        }
      }

      // Update standalone items
      for (const item of changedStandalone) {
        const cartKey = cartParentIdForItem(item);
        if (!cartKey) continue;
        const cartParent = cartMap.get(normalizeLower(cartKey));
        if (!cartParent) continue;

        const newQty = getTotalQoh(item);
        const newPrice = getDefaultPrice(item);
        const v = cartParent.variants[0];
        if (!v) continue;

        const vSku = normalizeText(v.sku);
        const trackChange = (field: string, oldVal: unknown, newVal: unknown) => {
          const o = String(oldVal ?? "");
          const n = String(newVal ?? "");
          if (o !== n) {
            result.changes.push({ parentId: cartParent.id, productTitle: cartParent.title, variantSku: vSku, field, oldValue: o, newValue: n });
          }
        };

        let updated = false;
        const newUpc = normalizeText(item.upc) || normalizeText(item.EAN);
        const newCost = parseFloat(normalizeText(item.defaultCost)) || null;
        const newColor = getColor(item);
        const newSize = getSize(item);

        if (v.stock !== newQty) { trackChange("stock", v.stock, newQty); updated = true; }
        if (v.price !== newPrice) { trackChange("price", v.price, newPrice); updated = true; }
        if (normalizeText(v.upc) !== normalizeText(newUpc)) { trackChange("upc", v.upc, newUpc); updated = true; }
        if (v.costPrice !== newCost) { trackChange("costPrice", v.costPrice, newCost); updated = true; }
        if (normalizeLower(v.color) !== normalizeLower(newColor)) { trackChange("color", v.color, newColor); updated = true; }
        if (normalizeLower(v.size) !== normalizeLower(newSize)) { trackChange("size", v.size, newSize); updated = true; }

        if (updated) {
          v.stock = newQty;
          v.price = newPrice;
          v.upc = newUpc;
          v.costPrice = newCost;
          v.color = newColor;
          v.size = newSize;
          result.itemsUpdated++;
        }

        const category = getCategory(item);
        const brand = getBrand(item);
        if (category && cartParent.category !== category) {
          trackChange("category", cartParent.category, category);
          cartParent.category = category;
          updated = true;
        }
        if (brand && cartParent.brand !== brand) {
          trackChange("brand", cartParent.brand, brand);
          cartParent.brand = brand;
          updated = true;
        }

        if (updated) {
          cartParent.stock = v.stock;
          cartParent.price = v.price;
          await upsertCartCatalogParents(shop, [cartParent]);
          parentIdsToUpdate.add(cartParent.id);
        }
      }

      // Push changed items to Shopify
      if (parentIdsToUpdate.size > 0) {
        try {
          const pushResult = await runCartPushAll(shop, {
            parentIds: Array.from(parentIdsToUpdate),
          });
          result.pushed = pushResult.pushed ?? 0;
        } catch (pushErr) {
          result.errors++;
          result.errorDetails.push(`Push failed: ${(pushErr as Error)?.message}`);
        }
      }
    }

    // --- FULL CHECK PHASE: detect removed/new items + reconcile stock (batched) ---
    // Important: once a cycle starts (fullCheckOffset > 0), keep running each minute until it finishes.
    const fullCheckOffset = typeof (config as Record<string, unknown>).fullCheckOffset === "number"
      ? (config as Record<string, unknown>).fullCheckOffset as number
      : 0;
    const hasPendingFullCheck = fullCheckOffset > 0;
    const shouldRunFullCheck =
      opts?.forceFullCheck ||
      hasPendingFullCheck ||
      !lastFullCheckAt ||
      Date.now() - new Date(lastFullCheckAt).getTime() > FULL_CHECK_INTERVAL_MS;

    if (shouldRunFullCheck) {
      try {
        const destructiveRules = await loadDestructiveSyncRules(shop);
        const nextOffset = await runFullCheck(shop, result, destructiveRules, fullCheckOffset, opts?.targetParentId);
        (config as Record<string, unknown>).fullCheckOffset = nextOffset;
      } catch (fullCheckErr) {
        result.errors++;
        result.errorDetails.push(`Full check failed: ${(fullCheckErr as Error)?.message}`);
      }
      (config as Record<string, unknown>).lastFullCheckAt = now;
    }

    // Save timestamps
    (config as Record<string, unknown>).lastDeltaSyncAt = now;
    await saveConfig(shop, config);

  } catch (err) {
    result.ok = false;
    result.errors++;
    result.errorDetails.push((err as Error)?.message || "Unknown delta sync error");
  }

  result.durationMs = Date.now() - start;
  await writeSyncLog(shop, result);
  return result;
}

/**
 * Full check: detect removed/archived products, new variants, and reconcile stock/price.
 * Processes FULL_CHECK_BATCH_SIZE parents per run to stay within Vercel's 300s limit.
 * Returns the next offset for the following run (0 when all parents have been checked).
 */
async function runFullCheck(shop: string, result: DeltaSyncResult, destructiveRules: { archiveOnMatrixRemoval: boolean; deleteVariantsFromShopify: boolean; addVariantsToExisting: boolean }, offset: number, targetParentId?: string): Promise<number> {
  const cartParents = await listCartCatalogParents(shop);
  const token = await getShopifyToken(shop);

  const reconParents = cartParents.data.filter((p) => {
    const id = normalizeLower(p.id);
    return id.startsWith("matrix:") || id.startsWith("sku:");
  });

  let batch: typeof reconParents;
  let nextOffset: number;

  if (targetParentId) {
    const target = reconParents.find((p) => normalizeLower(p.id) === normalizeLower(targetParentId));
    batch = target ? [target] : [];
    nextOffset = offset;
    console.log(`[delta-sync] Full check targeted: parentId=${targetParentId}, found=${batch.length}`);
  } else {
    batch = reconParents.slice(offset, offset + FULL_CHECK_BATCH_SIZE);
    nextOffset = offset + FULL_CHECK_BATCH_SIZE >= reconParents.length ? 0 : offset + FULL_CHECK_BATCH_SIZE;
    console.log(`[delta-sync] Full check batch: offset=${offset}, batchSize=${batch.length}, totalParents=${reconParents.length}, nextOffset=${nextOffset}`);
  }

  for (const parent of batch) {
    const parentId = normalizeLower(parent.id);
    const isMatrixParent = parentId.startsWith("matrix:");
    const matrixId = isMatrixParent ? parent.id.replace(/^matrix:/i, "") : "";
    const standaloneSku = parentId.startsWith("sku:") ? parent.id.replace(/^sku:/i, "") : "";

    let lsItems: LSItem[];
    try {
      if (isMatrixParent) {
        if (!matrixId) continue;
        lsItems = await fetchItemsForMatrix(matrixId);
      } else if (standaloneSku) {
        lsItems = await fetchItemsForStandaloneSku(standaloneSku);
      } else {
        continue;
      }
    } catch {
      continue; // skip on API error, don't delete based on failed call
    }

    if (lsItems.length === 0) {
      if (!isMatrixParent) {
        // For standalone SKU parents, avoid destructive behavior on lookup misses.
        console.log(`[delta-sync] Standalone ${parent.id} not found in LS during full check. Skipping destructive actions.`);
        continue;
      }

      if (!destructiveRules.archiveOnMatrixRemoval) {
        console.log(`[delta-sync] Matrix ${matrixId} has 0 items in LS but archiveOnMatrixRemoval is OFF. Skipping.`);
        continue;
      }
      if (token) {
        for (const v of parent.variants) {
          const cid = normalizeText(v.cartId);
          if (!cid) continue;
          const lookup = await lookupShopifyProductForVariant(shop, token, cid);
          if (lookup) {
            await archiveShopifyProduct(shop, token, lookup.productGid);
            result.productsArchived++;
            result.changes.push({ parentId: parent.id, productTitle: parent.title, variantSku: "", field: "status", oldValue: "ACTIVE", newValue: "ARCHIVED" });
            break;
          }
        }
      }
      await removeCartCatalogParents(shop, [parent.id]);
      continue;
    }

    // Build set of active LS SKUs for this parent.
    const activeLsSkus = new Set<string>();
    const activeLsUpcs = new Set<string>();
    for (const item of lsItems) {
      const sku = normalizeLower(normalizeText(item.customSku) || normalizeText(item.systemSku));
      const upc = normalizeText(item.upc) || normalizeText(item.EAN);
      if (sku) activeLsSkus.add(sku);
      if (upc) activeLsUpcs.add(upc);
    }

    // Detect removed variants
    const survivingVariants: StagingVariant[] = [];
    let parentVariantsAdded = 0;
    let parentVariantsDeleted = 0;
    for (const v of parent.variants) {
      const vSku = normalizeLower(v.sku);
      const vUpc = normalizeText(v.upc);

      const stillActive =
        (vSku && activeLsSkus.has(vSku)) ||
        (vUpc && activeLsUpcs.has(vUpc));

      if (stillActive) {
        survivingVariants.push(v);
      } else if (!destructiveRules.deleteVariantsFromShopify) {
        console.log(`[delta-sync] Variant ${normalizeText(v.sku)} no longer in LS but deleteVariantsFromShopify is OFF. Keeping.`);
        survivingVariants.push(v);
      } else {
        const cid = normalizeText(v.cartId);
        if (cid && token) {
          const lookup = await lookupShopifyProductForVariant(shop, token, cid);
          if (lookup) {
            await deleteShopifyVariant(shop, token, lookup.productGid, lookup.variantGid);
            result.variantsDeleted++;
            parentVariantsDeleted++;
            result.changes.push({ parentId: parent.id, productTitle: parent.title, variantSku: normalizeText(v.sku), field: "variant", oldValue: "exists", newValue: "DELETED" });
          }
        }
      }
    }

    // Detect new variants (LS items not in Cart Inventory)
    const cartSkus = new Set(parent.variants.map((v) => normalizeLower(v.sku)).filter(Boolean));
    const cartUpcs = new Set(parent.variants.map((v) => normalizeText(v.upc)).filter(Boolean));

    for (const item of lsItems) {
      const sku = normalizeLower(normalizeText(item.customSku) || normalizeText(item.systemSku));
      const upc = normalizeText(item.upc) || normalizeText(item.EAN);

      const alreadyInCart =
        (sku && cartSkus.has(sku)) ||
        (upc && cartUpcs.has(upc));

      if (!alreadyInCart) {
        const newVariant = buildVariantFromLS(item, parent.id);
        survivingVariants.push(newVariant);
        result.variantsAdded++;
        parentVariantsAdded++;
        result.changes.push({ parentId: parent.id, productTitle: parent.title, variantSku: normalizeText(newVariant.sku), field: "variant", oldValue: "", newValue: "ADDED" });
      }
    }

    // Reconcile stock/price for existing variants (catches inventory changes that don't update timeStamp)
    let stockOrPriceChanged = false;
    for (const v of survivingVariants) {
      const vSku = normalizeLower(v.sku);
      const vUpc = normalizeText(v.upc);

      // Match by SKU first (unique per variant), only fall back to UPC if no SKU match
      let lsMatch: LSItem | undefined;
      if (vSku) {
        lsMatch = lsItems.find((item) => {
          const iSku = normalizeLower(normalizeText(item.customSku) || normalizeText(item.systemSku));
          return iSku === vSku;
        });
      }
      if (!lsMatch && vUpc) {
        lsMatch = lsItems.find((item) => {
          const iUpc = normalizeText(item.upc) || normalizeText(item.EAN);
          return iUpc === vUpc;
        });
      }
      if (!lsMatch) continue;

      const lsQty = getTotalQoh(lsMatch);
      const lsPrice = getDefaultPrice(lsMatch);
      const lsCost = parseFloat(normalizeText(lsMatch.defaultCost)) || null;

      if (v.stock !== lsQty) {
        result.changes.push({ parentId: parent.id, productTitle: parent.title, variantSku: normalizeText(v.sku), field: "stock", oldValue: String(v.stock ?? ""), newValue: String(lsQty) });
        v.stock = lsQty;
        stockOrPriceChanged = true;
        result.itemsUpdated++;
      }
      if (v.price !== lsPrice) {
        result.changes.push({ parentId: parent.id, productTitle: parent.title, variantSku: normalizeText(v.sku), field: "price", oldValue: String(v.price ?? ""), newValue: String(lsPrice ?? "") });
        v.price = lsPrice;
        stockOrPriceChanged = true;
      }
      if (v.costPrice !== lsCost) {
        v.costPrice = lsCost;
        stockOrPriceChanged = true;
      }
    }

    if (
      survivingVariants.length !== parent.variants.length ||
      parentVariantsAdded > 0 ||
      parentVariantsDeleted > 0 ||
      stockOrPriceChanged
    ) {
      if (survivingVariants.length === 0) {
        if (!destructiveRules.archiveOnMatrixRemoval) {
          console.log(`[delta-sync] All variants gone for ${parent.id} but archiveOnMatrixRemoval is OFF. Skipping archive.`);
        } else if (token) {
          const cid = normalizeText(parent.variants[0]?.cartId);
          if (cid) {
            const lookup = await lookupShopifyProductForVariant(shop, token, cid);
            if (lookup) {
              await archiveShopifyProduct(shop, token, lookup.productGid);
              result.productsArchived++;
              result.changes.push({ parentId: parent.id, productTitle: parent.title, variantSku: "", field: "status", oldValue: "ACTIVE", newValue: "ARCHIVED" });
            }
          }
        }
        if (destructiveRules.archiveOnMatrixRemoval) {
          await removeCartCatalogParents(shop, [parent.id]);
        }
      } else {
        parent.variants = survivingVariants;
        parent.variations = survivingVariants.length;
        parent.stock = survivingVariants.reduce(
          (sum, v) => sum + (typeof v.stock === "number" ? v.stock : 0),
          0
        );
        await upsertCartCatalogParents(shop, [parent]);

        if (stockOrPriceChanged) {
          try {
            const pushResult = await runCartPushAll(shop, { parentIds: [parent.id] });
            result.pushed = (result.pushed ?? 0) + (pushResult.pushed ?? 0);
          } catch {
            // logged elsewhere
          }
        }
      }
    }
  }

  return nextOffset;
}
