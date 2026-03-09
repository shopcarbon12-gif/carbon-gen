import { lsPost, lsGet, lsPut } from "@/lib/lightspeedApi";
import { listCartCatalogParents, type StagingParent, type StagingVariant } from "@/lib/shopifyCartStaging";
import { findOrCreateCustomer, syncCustomerLsHistory } from "@/lib/lightspeedCustomerSync";
import {
  getOrderSyncRecord,
  insertOrderProcessing,
  upsertOrderSyncRecord,
  loadLightspeedPosConfig,
} from "@/lib/lightspeedRepository";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}
function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

// ── Types ──────────────────────────────────────────────────────────────

export type ShopifyLineItem = {
  variant_id: number | null;
  sku: string;
  quantity: number;
  price: string;
  title: string;
  name: string;
};

export type ShopifyShippingLine = {
  title: string;
  price: string;
};

export type ShopifyOrder = {
  id: number;
  name: string;
  order_number: number;
  financial_status: string;
  line_items: ShopifyLineItem[];
  shipping_lines?: ShopifyShippingLine[];
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  created_at: string;
  customer?: {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  } | null;
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country?: string;
    phone?: string;
  } | null;
  billing_address?: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country?: string;
    phone?: string;
  } | null;
};

export type PosConfig = {
  downloadSettings: {
    register: string;
    paymentType: string;
    employee: string;
    shop: string;
  };
  shopConfigurations?: Array<{
    shopId: string;
    shopName: string;
    register: string;
    employee: string;
  }>;
};

type MatchedLine = {
  itemId: string;
  quantity: number;
  unitPrice: string;
  shopifyTitle: string;
  matchedBy: string;
};

type SaleResult = {
  ok: boolean;
  saleId?: string;
  linesMatched: number;
  linesSkipped: number;
  skippedItems: string[];
  customerMatchedBy?: string;
  error?: string;
};

type ExistingSaleCandidate = {
  saleID?: string;
  referenceNumber?: string;
  referenceNumberSource?: string;
  completed?: string | boolean;
  voided?: string | boolean;
  customerID?: string;
};

// ── Duplicate check ────────────────────────────────────────────────────

export async function isOrderAlreadyProcessed(shopifyOrderId: number): Promise<boolean> {
  try {
    const data = await getOrderSyncRecord(shopifyOrderId);
    if (!data) return false;
    // Block if completed OR if another process is actively working on it
    if (data.status === "completed" || data.status === "processing") return true;
    return false;
  } catch {
    return false;
  }
}

async function claimOrderForProcessing(
  shopifyOrderId: number,
  shopifyOrderName: string,
): Promise<boolean> {
  try {
    await insertOrderProcessing(shopifyOrderId, shopifyOrderName);
    return true;
  } catch (error: any) {
    // Unique constraint violation = another process already claimed it.
    // Fail closed on any storage issue to prevent duplicate LS sale creation.
    if (String(error?.message || "").toLowerCase().includes("duplicate")) return false;
    return false;
  }
}

async function findExistingShopifySaleByReference(orderName: string): Promise<string | null> {
  const ref = normalizeText(orderName);
  if (!ref) return null;
  try {
    const res = await lsGet<any>("Sale", {
      referenceNumber: `~,${ref}`,
      limit: "50",
    });
    const raw = res?.Sale;
    const sales: ExistingSaleCandidate[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const matches = sales
      .filter((sale) => normalizeText(sale.referenceNumber) === ref)
      .filter((sale) => normalizeLower(sale.referenceNumberSource) === "shopify")
      .filter((sale) => !(sale.voided === true || normalizeLower(sale.voided) === "true"))
      .map((sale) => normalizeText(sale.saleID))
      .filter(Boolean);
    if (matches.length === 0) return null;
    matches.sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
    return matches[0] || null;
  } catch {
    return null;
  }
}

export async function markOrderProcessed(
  shopifyOrderId: number,
  shopifyOrderName: string,
  lsSaleId: string | null,
  status: "completed" | "failed",
  errorMessage?: string
): Promise<void> {
  try {
    await upsertOrderSyncRecord({
      shopifyOrderId,
      shopifyOrderName,
      lsSaleId,
      status,
      errorMessage: errorMessage || null,
    });
  } catch {
    // best-effort logging
  }
}

// ── Item matching ──────────────────────────────────────────────────────

function buildSkuAndUpcMaps(parents: StagingParent[]): {
  bySku: Map<string, StagingVariant>;
  byUpc: Map<string, StagingVariant>;
  byShopifyVariantId: Map<string, StagingVariant>;
} {
  const bySku = new Map<string, StagingVariant>();
  const byUpc = new Map<string, StagingVariant>();
  const byShopifyVariantId = new Map<string, StagingVariant>();

  for (const parent of parents) {
    for (const v of parent.variants) {
      const sku = normalizeLower(v.sku);
      const upc = normalizeLower(v.upc);
      const cartId = normalizeText(v.cartId);

      if (sku) bySku.set(sku, v);
      if (upc) byUpc.set(upc, v);

      if (cartId.startsWith("gid://shopify/ProductVariant/")) {
        const numericId = cartId.replace("gid://shopify/ProductVariant/", "");
        if (numericId) byShopifyVariantId.set(numericId, v);
      }
    }
  }

  return { bySku, byUpc, byShopifyVariantId };
}

async function findLsItemByCustomSku(sku: string): Promise<string | null> {
  if (!sku) return null;
  try {
    const result = await lsGet<any>("Item", { customSku: `~,${sku}`, limit: "1" });
    const items = Array.isArray(result?.Item) ? result.Item : result?.Item ? [result.Item] : [];
    if (items.length > 0) return normalizeText(items[0].itemID);
  } catch { /* not found */ }
  return null;
}

async function findLsItemByUpc(upc: string): Promise<string | null> {
  if (!upc) return null;
  try {
    const result = await lsGet<any>("Item", { upc: `~,${upc}`, limit: "1" });
    const items = Array.isArray(result?.Item) ? result.Item : result?.Item ? [result.Item] : [];
    if (items.length > 0) return normalizeText(items[0].itemID);
  } catch { /* not found */ }
  return null;
}

async function matchLineItems(
  lineItems: ShopifyLineItem[],
  shop: string
): Promise<{ matched: MatchedLine[]; skipped: string[] }> {
  const cartData = await listCartCatalogParents(shop);
  const { bySku, byUpc, byShopifyVariantId } = buildSkuAndUpcMaps(cartData.data);

  const matched: MatchedLine[] = [];
  const skipped: string[] = [];

  for (const line of lineItems) {
    if (line.quantity <= 0) continue;

    let variant: StagingVariant | undefined;
    let matchedBy = "";

    const variantIdStr = line.variant_id ? String(line.variant_id) : "";
    if (variantIdStr && byShopifyVariantId.has(variantIdStr)) {
      variant = byShopifyVariantId.get(variantIdStr);
      matchedBy = "shopifyVariantId";
    }

    if (!variant) {
      const lineSku = normalizeLower(line.sku);
      if (lineSku && bySku.has(lineSku)) {
        variant = bySku.get(lineSku);
        matchedBy = "sku";
      }
    }

    if (!variant) {
      const lineSku = normalizeLower(line.sku);
      if (lineSku && byUpc.has(lineSku)) {
        variant = byUpc.get(lineSku);
        matchedBy = "upc";
      }
    }

    const resolvedSku = variant ? normalizeText(variant.sku) : normalizeText(line.sku);
    const resolvedUpc = variant ? normalizeText(variant.upc) : "";

    if (!resolvedSku && !resolvedUpc) {
      skipped.push(`${line.name || line.title} (SKU: ${line.sku || "N/A"}) — no SKU or UPC`);
      continue;
    }

    let lsItemId = await findLsItemByCustomSku(resolvedSku);
    if (!lsItemId && resolvedUpc) {
      lsItemId = await findLsItemByUpc(resolvedUpc);
      if (lsItemId) matchedBy += "+upcLookup";
    }
    if (lsItemId && !matchedBy.includes("upcLookup")) matchedBy += "+skuLookup";

    if (!lsItemId) {
      skipped.push(`${line.name || line.title} (SKU: ${resolvedSku || "N/A"}) — not found in Lightspeed`);
      continue;
    }

    matched.push({
      itemId: lsItemId,
      quantity: line.quantity,
      unitPrice: line.price,
      shopifyTitle: line.name || line.title,
      matchedBy,
    });
  }

  return { matched, skipped };
}

// ── WebShipping item for shipping costs ────────────────────────────────

let cachedWebShippingItemId: string | null = null;

async function getWebShippingItemId(): Promise<string | null> {
  if (cachedWebShippingItemId) return cachedWebShippingItemId;
  try {
    const result = await lsGet<any>("Item", { description: "~,WebShipping", limit: "1" });
    const items = Array.isArray(result?.Item) ? result.Item : result?.Item ? [result.Item] : [];
    if (items.length > 0) {
      cachedWebShippingItemId = normalizeText(items[0].itemID);
      return cachedWebShippingItemId;
    }
  } catch { /* not found */ }
  try {
    const result = await lsGet<any>("Item", { customSku: "~,WebShipping", limit: "1" });
    const items = Array.isArray(result?.Item) ? result.Item : result?.Item ? [result.Item] : [];
    if (items.length > 0) {
      cachedWebShippingItemId = normalizeText(items[0].itemID);
      return cachedWebShippingItemId;
    }
  } catch { /* not found */ }
  return null;
}

// ── Customer matching (Phase 4) ────────────────────────────────────────
// Real customer matching is handled by lib/lightspeedCustomerSync.ts

// ── LS Sale creation ───────────────────────────────────────────────────

export async function createLightspeedSale(
  order: ShopifyOrder,
  posConfig: PosConfig,
  shop: string
): Promise<SaleResult> {
  if (await isOrderAlreadyProcessed(order.id)) {
    return { ok: true, linesMatched: 0, linesSkipped: 0, skippedItems: [], error: "Already processed" };
  }

  const claimed = await claimOrderForProcessing(order.id, order.name);
  if (!claimed) {
    const existingAfterClaimMiss = await findExistingShopifySaleByReference(order.name);
    if (existingAfterClaimMiss) {
      await markOrderProcessed(order.id, order.name, existingAfterClaimMiss, "completed");
      return {
        ok: true,
        saleId: existingAfterClaimMiss,
        linesMatched: 0,
        linesSkipped: 0,
        skippedItems: [],
        error: "Already processed",
      };
    }
    return { ok: true, linesMatched: 0, linesSkipped: 0, skippedItems: [], error: "Already being processed" };
  }

  const existingSaleId = await findExistingShopifySaleByReference(order.name);
  if (existingSaleId) {
    await markOrderProcessed(order.id, order.name, existingSaleId, "completed");
    return {
      ok: true,
      saleId: existingSaleId,
      linesMatched: 0,
      linesSkipped: 0,
      skippedItems: [],
      error: "Already processed",
    };
  }

  const { matched, skipped } = await matchLineItems(order.line_items, shop);

  if (matched.length === 0) {
    const errMsg = `No line items could be matched. Skipped: ${skipped.join(", ")}`;
    await markOrderProcessed(order.id, order.name, null, "failed", errMsg);
    return { ok: false, linesMatched: 0, linesSkipped: skipped.length, skippedItems: skipped, error: errMsg };
  }

  const ds = posConfig.downloadSettings;
  const registerID = normalizeText(ds.register) || "1";
  const employeeID = normalizeText(ds.employee) || "1";
  const shopID = normalizeText(ds.shop) || "1";
  const paymentTypeID = normalizeText(ds.paymentType) || "7";

  const saleLines: Array<{ itemID: string; unitQuantity: string; unitPrice: string }> = matched.map((m) => ({
    itemID: m.itemId,
    unitQuantity: String(m.quantity),
    unitPrice: m.unitPrice,
  }));

  const shippingTotal = (order.shipping_lines || []).reduce(
    (sum, sl) => sum + (Number.parseFloat(sl.price) || 0), 0
  );
  if (shippingTotal > 0) {
    const webShippingItemId = await getWebShippingItemId();
    if (webShippingItemId) {
      saleLines.push({
        itemID: webShippingItemId,
        unitQuantity: "1",
        unitPrice: String(shippingTotal),
      });
    }
  }

  const { customerId, matchedBy: customerMatchedBy } = await findOrCreateCustomer(
    order.customer,
    order.shipping_address,
    order.billing_address
  );

  try {
    const draftPayload: Record<string, unknown> = {
      employeeID,
      shopID,
      registerID,
      completed: false,
      referenceNumber: order.name,
      referenceNumberSource: "Shopify",
      SaleLines: { SaleLine: saleLines },
    };
    if (customerId) draftPayload.customerID = customerId;

    let draftResult: any = null;
    let saleId = "";
    try {
      draftResult = await lsPost<any>("Sale", draftPayload, { disableTransportRetries: true });
      saleId = normalizeText(draftResult?.Sale?.saleID);
    } catch (postError: any) {
      // A timeout/network error after POST can still create the sale in LS.
      // Recover by reference number before failing to avoid duplicate POST.
      const existingSaleId = await findExistingShopifySaleByReference(order.name);
      if (existingSaleId) {
        saleId = existingSaleId;
      } else {
        const postErrorMsg = String(postError?.message || postError || "unknown_error");
        throw new Error(`Lightspeed POST Sale failed (${postErrorMsg}) and no existing sale found by reference`);
      }
    }

    if (!saleId) {
      const errMsg = "LS Sale created but no saleID returned";
      await markOrderProcessed(order.id, order.name, null, "failed", errMsg);
      return { ok: false, linesMatched: matched.length, linesSkipped: skipped.length, skippedItems: skipped, error: errMsg };
    }

    const calcTotal = normalizeText(draftResult?.Sale?.calcTotal) || normalizeText(draftResult?.Sale?.total);
    const paymentAmount = calcTotal || order.total_price;

    const completedResult = await lsPut<any>(`Sale/${saleId}`, {
      completed: true,
      SalePayments: {
        SalePayment: [
          {
            paymentTypeID,
            amount: paymentAmount,
          },
        ],
      },
    });

    const finalSaleId = normalizeText(completedResult?.Sale?.saleID) || saleId;
    await markOrderProcessed(order.id, order.name, finalSaleId, "completed");

    const customerEmail = normalizeLower(order.customer?.email);
    if (customerId && customerEmail) {
      syncCustomerLsHistory(customerId, customerEmail).catch(() => {});
    }

    return {
      ok: true,
      saleId: finalSaleId,
      linesMatched: matched.length,
      linesSkipped: skipped.length,
      skippedItems: skipped,
      customerMatchedBy,
    };
  } catch (error: any) {
    const errMsg = String(error?.message || error);
    await markOrderProcessed(order.id, order.name, null, "failed", errMsg);
    return {
      ok: false,
      linesMatched: matched.length,
      linesSkipped: skipped.length,
      skippedItems: skipped,
      customerMatchedBy,
      error: errMsg,
    };
  }
}

// ── Load POS config helper ─────────────────────────────────────────────

export async function loadPosConfig(): Promise<PosConfig> {
  const key = normalizeText(process.env.LS_ACCOUNT_ID) || "default";
  try {
    const cfg = (await loadLightspeedPosConfig(key)) || {};

    const ds = (cfg.downloadSettings && typeof cfg.downloadSettings === "object"
      ? cfg.downloadSettings
      : {}) as Record<string, unknown>;

    return {
      downloadSettings: {
        register: normalizeText(ds.register) || "1",
        paymentType: normalizeText(ds.paymentType) || "7",
        employee: normalizeText(ds.employee) || "1",
        shop: normalizeText(ds.shop) || "1",
      },
      shopConfigurations: Array.isArray(cfg.shopConfigurations)
        ? (cfg.shopConfigurations as PosConfig["shopConfigurations"])
        : (cfg.shopConfigurations as any)?.rows || [],
    };
  } catch {
    return {
      downloadSettings: { register: "1", paymentType: "7", employee: "1", shop: "1" },
    };
  }
}
