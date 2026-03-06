/**
 * Shared push logic for Cart Inventory → Shopify.
 * Used by both the cart-inventory API route and the cron sync.
 */
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";
import {
  listCartCatalogParents,
  updateCartCatalogStatus,
  upsertCartCatalogParents,
  type StagingParent,
  type StagingVariant,
} from "@/lib/shopifyCartStaging";
import { sendPushNotificationEmail } from "@/lib/email";
import { createShopifyProductFromCart } from "@/lib/shopifyCartProductCreate";
import {
  loadConfig,
  loadProductUpdateRules,
  loadDestructiveSyncRules,
  type ProductUpdateRules,
  type DestructiveSyncRules,
} from "@/lib/shopifyCartConfig";

type ProductsPageNode = { id: string; variants?: { nodes?: Array<{ id: string }> } };
type ProductsPageEdges = Array<{ node?: ProductsPageNode }>;
type ProductsPageResponse = {
  products?: {
    edges?: ProductsPageEdges;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  };
};
type ProductUpdateResponse = {
  productUpdate?: { product?: { id: string }; userErrors?: Array<{ message: string }> };
};

export type CartPushResult = {
  ok: boolean;
  error?: string;
  pushed?: number;
  totalVariants?: number;
  markedProcessed?: number;
  removedFromShopify?: number;
  productsCreated?: number;
  archivedNotInCart?: number;
  variantsLinkedFromSearch?: number;
  debug?: unknown;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

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

const SHOPIFY_VARIANT_LOOKUP_CONCURRENCY = parseInt(
  process.env.SHOPIFY_VARIANT_LOOKUP_CONCURRENCY || "6",
  10
);

const SIZE_ORDER: Record<string, number> = {
  XXS: 0, XS: 1, S: 2, M: 3, L: 4,
  XL: 5, XXL: 6, "2XL": 6, XXXL: 7, "3XL": 7,
  "4XL": 8, "5XL": 9, OS: 10, "O/S": 10, "ONE SIZE": 10,
};

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const au = a.toUpperCase().trim();
    const bu = b.toUpperCase().trim();
    const aRank = SIZE_ORDER[au];
    const bRank = SIZE_ORDER[bu];
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    if (aRank != null && bRank != null) return aRank - bRank;
    if (aRank != null) return -1;
    if (bRank != null) return 1;
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    if (!isNaN(aNum)) return -1;
    if (!isNaN(bNum)) return 1;
    return au.localeCompare(bu);
  });
}

function collectOptionsFromVariants(variants: Array<{ color?: string; size?: string }>): { name: string; values: string[] }[] {
  const colorSet = new Set<string>();
  const sizeSet = new Set<string>();
  for (const v of variants) {
    const c = normalizeText(v.color);
    const s = normalizeText(v.size);
    if (c) colorSet.add(c);
    if (s) sizeSet.add(s);
  }
  const options: { name: string; values: string[] }[] = [];
  if (colorSet.size > 0) options.push({ name: "Color", values: Array.from(colorSet) });
  if (sizeSet.size > 0) options.push({ name: "Size", values: sortSizes(Array.from(sizeSet)) });
  if (options.length === 0) options.push({ name: "Title", values: ["Default"] });
  return options;
}

async function getTokenForShop(shop: string): Promise<string | null> {
  try {
    const dbToken = await getShopifyAccessToken(shop);
    if (dbToken) return dbToken;
  } catch {
    /* fallback to env */
  }
  return getShopifyAdminToken(shop) || null;
}

/** Run push: sync Cart Inventory to Shopify, create products, archive products not in cart. */
export async function runCartPushAll(
  shop: string,
  options: {
    notificationEmail?: string | null;
    parentIds?: string[];
    publicationIds?: string[];
    catalogIds?: string[];
  } = {}
): Promise<CartPushResult> {
  const notificationEmail = options.notificationEmail ?? null;
  const publicationIds = Array.isArray(options.publicationIds) ? options.publicationIds : [];
  const catalogIds = Array.isArray(options.catalogIds) ? options.catalogIds : [];

  const parentIds =
    Array.isArray(options.parentIds) && options.parentIds.length > 0
      ? options.parentIds
      : (await listCartCatalogParents(shop)).data.map((p) => p.id);

  if (parentIds.length < 1) {
    const err = "No items selected for push and no products to remove.";
    if (notificationEmail) {
      void sendPushNotificationEmail({
        to: notificationEmail,
        shop,
        success: false,
        pushed: 0,
        totalVariants: 0,
        markedProcessed: 0,
        removedFromShopify: 0,
        error: err,
        items: [],
      }).catch(() => {});
    }
    return { ok: false, error: err };
  }

  const current = await listCartCatalogParents(shop);
  const idSet = new Set(parentIds.map((id) => normalizeLower(id)));
  const toPush = current.data.filter((p) => idSet.has(normalizeLower(p.id)));

  let variantsSkippedNoCartId = 0;
  let variantsSkippedNoInvItem = 0;

  const token =
    (await getTokenForShop(shop)) ||
    getShopifyAdminToken(shop);
  if (!token) {
    const err = "Shopify access token not found for this shop.";
    if (notificationEmail) {
      void sendPushNotificationEmail({
        to: notificationEmail,
        shop,
        success: false,
        pushed: 0,
        totalVariants: 0,
        markedProcessed: 0,
        removedFromShopify: 0,
        error: err,
        items: [],
      }).catch(() => {});
    }
    return { ok: false, error: err };
  }

  const API_VERSION =
    (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

  const locRes = await runShopifyGraphql<{
    location?: { id: string };
    locations?: { nodes?: Array<{ id: string }> };
  }>({
    shop,
    token,
    query: `query {
      location { id }
    }`,
    apiVersion: API_VERSION,
  });
  let locationId =
    locRes.ok && locRes.data?.location?.id ? locRes.data.location.id : "";
  if (!locationId) {
    const fallbackRes = await runShopifyGraphql<{
      locations?: { nodes?: Array<{ id: string }> };
    }>({
      shop,
      token,
      query: `query { locations(first: 5) { nodes { id } } }`,
      apiVersion: API_VERSION,
    });
    locationId =
      fallbackRes.ok && fallbackRes.data?.locations?.nodes?.[0]?.id
        ? fallbackRes.data.locations.nodes[0].id
        : "";
    if (locationId) console.log("[cart-inventory] Using fallback locations(first:5), locationId:", locationId);
  } else {
    console.log("[cart-inventory] Using primary location, locationId:", locationId);
  }
  if (!locationId) {
    const hint = !locRes.ok
      ? " (Check that SHOPIFY_SCOPES includes read_locations and re-authorize the app)"
      : "";
    const err = `No Shopify location found. Every store has a default location, but the app needs permission to read it. Add read_locations and write_inventory to SHOPIFY_SCOPES in .env, then re-authorize via Settings.${hint}`;
    if (notificationEmail) {
      void sendPushNotificationEmail({
        to: notificationEmail,
        shop,
        success: false,
        pushed: 0,
        totalVariants: 0,
        markedProcessed: 0,
        removedFromShopify: 0,
        error: err,
        items: [],
      }).catch(() => {});
    }
    return { ok: false, error: err };
  }

  let productsCreated = 0;
  let variantsLinkedFromSearch = 0;
  const shopKey = normalizeShopDomain(shop) || shop;
  const debugSteps: Array<{ step: string; detail: string }> = [];
  let staleLinksCleared = 0;
  let variantsLinkedBySku = 0;
  let variantsLinkedByBarcode = 0;
  let variantsAddedToExisting = 0;
  const addVariantErrors: string[] = [];
  const variantLookupCache = new Map<string, Promise<{
    ok: boolean;
    data?: {
      productVariant?: {
        sku?: string | null;
        barcode?: string | null;
        selectedOptions?: Array<{ name?: string; value?: string }>;
        product?: { status?: string };
      } | null;
    } | null;
  }>>();

  const lookupVariantState = (variantGid: string) => {
    const key = normalizeText(variantGid);
    const existing = variantLookupCache.get(key);
    if (existing) return existing;
    const created = runShopifyGraphql<{
      productVariant?: {
        sku?: string | null;
        barcode?: string | null;
        selectedOptions?: Array<{ name?: string; value?: string }>;
        product?: { status?: string };
      } | null;
    }>({
      shop,
      token,
      query: `query($id: ID!) {
        productVariant(id: $id) {
          sku
          barcode
          selectedOptions { name value }
          product { status }
        }
      }`,
      variables: { id: key },
      apiVersion: API_VERSION,
    });
    variantLookupCache.set(key, created);
    return created;
  };

  for (const parent of toPush) {
    let staleCleaned = false;
    const toVariantGid = (id: string) => {
      const raw = normalizeText(id);
      if (!raw) return "";
      if (raw.startsWith("gid://shopify/ProductVariant/")) return raw;
      if (raw.includes("~")) {
        const [, variantId = ""] = raw.split("~");
        if (variantId) return `gid://shopify/ProductVariant/${variantId}`;
      }
      return `gid://shopify/ProductVariant/${raw}`;
    };

    // Guardrail: the same Shopify variant must not be linked to multiple cart variants.
    // If duplicates exist, clear them so relink/create can rebuild correct one-to-one mapping.
    const linkCounts = new Map<string, number>();
    for (const v of parent.variants) {
      const gid = toVariantGid(normalizeText(v.cartId));
      if (!gid) continue;
      linkCounts.set(gid, (linkCounts.get(gid) || 0) + 1);
    }
    for (const v of parent.variants) {
      const gid = toVariantGid(normalizeText(v.cartId));
      if (!gid) continue;
      if ((linkCounts.get(gid) || 0) > 1) {
        v.cartId = "";
        staleCleaned = true;
        staleLinksCleared += 1;
      }
    }

    await mapWithConcurrency(
      parent.variants,
      SHOPIFY_VARIANT_LOOKUP_CONCURRENCY,
      async (v) => {
        const cid = normalizeText(v.cartId);
        if (!cid) return;
        const vGid = cid.startsWith("gid://")
          ? cid
          : `gid://shopify/ProductVariant/${cid.includes("~") ? cid.split("~")[1] || cid : cid}`;
        const sc = await lookupVariantState(vGid);
        if (!sc.ok) {
          console.warn("[cart-inventory] Skipping stale check for", cid, "- API error (will not clear link)");
          return;
        }
        const ps = normalizeLower(sc.data?.productVariant?.product?.status);
        if (!sc.data?.productVariant || ps === "archived" || ps === "draft") {
          console.log("[cart-inventory] Clearing stale cartId", cid, "for variant", v.id, "(product status:", ps || "not found", ")");
          v.cartId = "";
          staleCleaned = true;
          staleLinksCleared += 1;
          return;
        }

        // Guardrail: cartId must represent the same variant identity (SKU first, barcode second).
        // If a cartId points at a different Shopify variant, clear it so the variant can be re-linked/created.
        const linkedSku = normalizeLower(sc.data.productVariant.sku);
        const linkedBarcode = normalizeText(sc.data.productVariant.barcode);
        const linkedColor = normalizeLower(
          sc.data.productVariant.selectedOptions?.find((o) => normalizeLower(o?.name) === "color")?.value
        );
        const linkedSize = normalizeLower(
          sc.data.productVariant.selectedOptions?.find((o) => normalizeLower(o?.name) === "size")?.value
        );
        const expectedSku = normalizeLower(v.sku);
        const expectedBarcode = normalizeText(v.upc);
        const expectedColor = normalizeLower(v.color);
        const expectedSize = normalizeLower(v.size);
        const skuMismatch = Boolean(expectedSku) && Boolean(linkedSku) && expectedSku !== linkedSku;
        const barcodeMismatch =
          !expectedSku && Boolean(expectedBarcode) && Boolean(linkedBarcode) && expectedBarcode !== linkedBarcode;
        const colorMismatch =
          Boolean(expectedColor) &&
          Boolean(linkedColor) &&
          expectedColor !== linkedColor;
        const sizeMismatch =
          Boolean(expectedSize) &&
          Boolean(linkedSize) &&
          expectedSize !== linkedSize;
        // SKU is primary identity for variants. Option mismatches are only a
        // stale-link signal for non-SKU fallback links.
        const optionMismatchForFallbackOnly =
          !expectedSku && (colorMismatch || sizeMismatch);
        if (skuMismatch || barcodeMismatch || optionMismatchForFallbackOnly) {
          console.log(
            "[cart-inventory] Clearing mismatched cartId",
            cid,
            "for variant",
            v.id,
            "(expected sku/barcode/color/size:",
            expectedSku || "-",
            "/",
            expectedBarcode || "-",
            "/",
            expectedColor || "-",
            "/",
            expectedSize || "-",
            "got:",
            linkedSku || "-",
            "/",
            linkedBarcode || "-",
            "/",
            linkedColor || "-",
            "/",
            linkedSize || "-",
            ")"
          );
          v.cartId = "";
          staleCleaned = true;
          staleLinksCleared += 1;
        }
      }
    );
    if (staleCleaned) {
      await upsertCartCatalogParents(shop, [{ ...parent }]).catch((e) =>
        console.warn("[cart-inventory] Failed to persist cleared stale links:", (e as Error)?.message)
      );
    }
  }

  try {
    for (const parent of toPush) {
      let parentUpdated = false;
      for (const v of parent.variants) {
        if (normalizeText(v.cartId)) continue;
        const sku = normalizeText(v.sku) || normalizeText(parent.sku);
        const upc = normalizeText(v.upc);
        if (!sku && !upc) continue;
        const searchQuery = sku ? `sku:${sku.replace(/"/g, '\\"')}` : `barcode:${upc.replace(/"/g, '\\"')}`;
        type SkuNode = { id: string; sku?: string; barcode?: string; product?: { status?: string } };
        const searchRes = await runShopifyGraphql<{
          productVariants?: { edges?: Array<{ node?: SkuNode }> };
        }>({
          shop,
          token,
          query: `query($q: String!) {
            productVariants(first: 5, query: $q) {
              edges { node { id sku barcode product { status } } }
            }
          }`,
          variables: { q: searchQuery },
          apiVersion: API_VERSION,
        });
        const filterActive = (n: SkuNode | undefined | null) =>
          !!n && normalizeLower(n.product?.status) === "active";
        let nodes = searchRes.ok
          ? searchRes.data?.productVariants?.edges?.map((e) => e?.node).filter(filterActive) as SkuNode[]
          : [];
        const skuLower = normalizeLower(sku);
        const upcText = normalizeText(upc);
        let exactMatch = nodes?.find((n) => {
          if (!n) return false;
          // SKU is the primary identity key; only use barcode matching when SKU is absent.
          if (skuLower) return normalizeLower(n.sku) === skuLower;
          if (upcText) return normalizeText(n.barcode) === upcText;
          return false;
        });
        if (!exactMatch && sku && nodes?.length === 0) {
          const broadRes = await runShopifyGraphql<{
            productVariants?: { edges?: Array<{ node?: SkuNode }> };
          }>({
            shop,
            token,
            query: `query($q: String!) {
              productVariants(first: 10, query: $q) {
                edges { node { id sku barcode product { status } } }
              }
            }`,
            variables: { q: sku.replace(/"/g, '\\"') },
            apiVersion: API_VERSION,
          });
          const broadNodes = broadRes.ok
            ? broadRes.data?.productVariants?.edges?.map((e) => e?.node).filter(filterActive) as SkuNode[]
            : [];
          exactMatch = broadNodes?.find((n) => {
            if (!n) return false;
            const nSku = normalizeLower(n.sku || "");
            if (nSku === skuLower) return true;
            return false;
          });
          if (exactMatch) nodes = broadNodes || [];
        }
        // Never blind-link by "first result" when SKU exists; require exact SKU match.
        const match = exactMatch || (!skuLower ? nodes?.[0] : undefined);
        if (match?.id) {
          const gid = match.id;
          const numericId = gid.replace(/^gid:\/\/shopify\/ProductVariant\//, "");
          v.cartId = numericId || gid;
          variantsLinkedFromSearch += 1;
          variantsLinkedBySku += 1;
          parentUpdated = true;
        }
      }
      if (parentUpdated) {
        const updatedParent: StagingParent = { ...parent, variants: [...parent.variants] };
        await upsertCartCatalogParents(shop, [updatedParent]);
      }
    }

    for (const parent of toPush) {
      const barcodeCounts = new Map<string, number>();
      for (const v of parent.variants) {
        if (normalizeText(v.cartId)) continue;
        // Guardrail: never barcode-link a variant that already has SKU.
        // SKU-based matching/creation must decide these variants.
        if (normalizeText(v.sku)) continue;
        const upc = normalizeText(v.upc);
        if (!upc) continue;
        barcodeCounts.set(upc, (barcodeCounts.get(upc) || 0) + 1);
      }
      let parentUpdated = false;
      for (const v of parent.variants) {
        if (normalizeText(v.cartId)) continue;
        if (normalizeText(v.sku)) continue;
        const upc = normalizeText(v.upc);
        if (!upc) continue;
        // Guardrail: barcode may represent parent context, not variant identity.
        // If a barcode is shared by multiple unlinked variants in this parent,
        // do not link by barcode; let add-variants path create distinct variants by options/SKU.
        if ((barcodeCounts.get(upc) || 0) > 1) {
          debugSteps.push({
            step: "barcode-link-skip-ambiguous",
            detail: `parent=${parent.id} barcode=${upc} variants=${barcodeCounts.get(upc) || 0}`,
          });
          continue;
        }
        const barcodeQuery = `barcode:${upc.replace(/"/g, '\\"')}`;
        type BarcodeNode = { id: string; sku?: string; barcode?: string; product?: { status?: string } };
        const barcodeRes = await runShopifyGraphql<{
          productVariants?: { edges?: Array<{ node?: BarcodeNode }> };
        }>({
          shop,
          token,
          query: `query($q: String!) {
            productVariants(first: 5, query: $q) {
              edges { node { id sku barcode product { status } } }
            }
          }`,
          variables: { q: barcodeQuery },
          apiVersion: API_VERSION,
        });
        const barcodeFilterActive = (n: BarcodeNode | undefined | null) =>
          !!n && normalizeLower(n.product?.status) === "active";
        const barcodeNodes = barcodeRes.ok
          ? barcodeRes.data?.productVariants?.edges?.map((e) => e?.node).filter(barcodeFilterActive) as BarcodeNode[]
          : [];
        const barcodeMatch = barcodeNodes?.find(
          (n) => n && normalizeText(n.barcode) === normalizeText(upc)
        ) || barcodeNodes?.[0];
        if (barcodeMatch?.id) {
          const numericId = barcodeMatch.id.replace(/^gid:\/\/shopify\/ProductVariant\//, "");
          v.cartId = numericId || barcodeMatch.id;
          variantsLinkedFromSearch += 1;
          variantsLinkedByBarcode += 1;
          parentUpdated = true;
        }
      }
      if (parentUpdated) {
        const updatedParent: StagingParent = { ...parent, variants: [...parent.variants] };
        await upsertCartCatalogParents(shop, [updatedParent]);
      }
    }
  } catch (linkErr) {
    console.warn("[cart-inventory] Link-existing phase:", (linkErr as Error)?.message);
  }

  const updateRules = await loadProductUpdateRules(shop);
  const destructiveRules = await loadDestructiveSyncRules(shop);
  const productGidsUpdated = new Set<string>();

  try {
    const config = await loadConfig(shopKey);
    const cartConfig = {
      newProductMapping: (config.newProductMapping as Record<string, unknown>) || {},
      newProductRules: (config.newProductRules as Record<string, unknown>) || {},
    };

    for (const parent of toPush) {
      const unlinked = parent.variants.filter((v) => !normalizeText(v.cartId));
      if (unlinked.length === 0) continue;

      const linked = parent.variants.filter((v) => normalizeText(v.cartId));

      if (linked.length > 0) {
        const existingCartId = normalizeText(linked[0].cartId);
        const existingGid = existingCartId.startsWith("gid://")
          ? existingCartId
          : `gid://shopify/ProductVariant/${existingCartId.includes("~") ? existingCartId.split("~")[1] || existingCartId : existingCartId}`;
        const prodLookup = await runShopifyGraphql<{
          productVariant?: {
            product?: {
              id: string;
              status?: string;
              options?: Array<{ name: string; optionValues?: Array<{ name: string }> }>;
              variants?: {
                nodes?: Array<{
                  id: string;
                  sku?: string | null;
                  selectedOptions?: Array<{ name: string; value: string }>;
                }>;
              };
            };
          };
        }>({
          shop,
          token,
          query: `query($id: ID!) {
            productVariant(id: $id) {
              product {
                id status
                options { name optionValues { name } }
                variants(first: 250) { nodes { id sku selectedOptions { name value } } }
              }
            }
          }`,
          variables: { id: existingGid },
          apiVersion: API_VERSION,
        });
        const existingProductGid = prodLookup.ok ? prodLookup.data?.productVariant?.product?.id : null;
        const existingStatus = normalizeLower(prodLookup.data?.productVariant?.product?.status);
        const shopifyOptions = prodLookup.data?.productVariant?.product?.options || [];
        const shopifyExistingVariants: Array<{
          id: string;
          sku?: string | null;
          selectedOptions?: Array<{ name: string; value: string }>;
        }> = prodLookup.data?.productVariant?.product?.variants?.nodes || [];

        if (existingProductGid && existingStatus === "active") {
          if (!destructiveRules.addVariantsToExisting) {
            debugSteps.push({ step: "add-variants-blocked", detail: `product=${existingProductGid} unlinked=${unlinked.length} — blocked by addVariantsToExisting=false` });
            continue;
          }
          console.log("[cart-inventory] Adding", unlinked.length, "missing variant(s) to existing product", existingProductGid, "options:", JSON.stringify(shopifyOptions.map((o: { name: string }) => o.name)));

          type ShopOpt = { name: string; optionValues?: Array<{ name: string }> };
          const colorOptionName = shopifyOptions.find((o: ShopOpt) => normalizeLower(o.name) === "color")?.name || "Color";
          const sizeOptionName = shopifyOptions.find((o: ShopOpt) => normalizeLower(o.name) === "size")?.name || "Size";
          const hasColorOption = shopifyOptions.some((o: ShopOpt) => normalizeLower(o.name) === "color");
          const hasSizeOption = shopifyOptions.some((o: ShopOpt) => normalizeLower(o.name) === "size");
          const tupleKeyOf = (variant: StagingVariant) => {
            const c = normalizeLower(variant.color);
            const s = normalizeLower(variant.size);
            if (!c || !s) return "";
            return `${c}::${s}`;
          };
          const localTupleCounts = new Map<string, number>();
          for (const pv of parent.variants) {
            const k = tupleKeyOf(pv);
            if (!k) continue;
            localTupleCounts.set(k, (localTupleCounts.get(k) || 0) + 1);
          }

          const toVariantGid = (id: string) => {
            const raw = normalizeText(id);
            if (!raw) return "";
            if (raw.startsWith("gid://shopify/ProductVariant/")) return raw;
            if (raw.includes("~")) {
              const [, variantId = ""] = raw.split("~");
              if (variantId) return `gid://shopify/ProductVariant/${variantId}`;
            }
            return `gid://shopify/ProductVariant/${raw}`;
          };
          // Prevent assigning the same Shopify variant ID to multiple variants
          // within this relink pass; allow reclaiming from wrongly linked rows.
          const relinkedExistingIds = new Set<string>();
          const toAdd = unlinked.flatMap((v) => {
            const varSku = normalizeText(v.sku);
            const vColor = normalizeLower(v.color);
            const vSize = normalizeLower(v.size);
            const localTupleKey = vColor && vSize ? `${vColor}::${vSize}` : "";
            const hasLocalTupleConflict =
              Boolean(localTupleKey) && (localTupleCounts.get(localTupleKey) || 0) > 1;
            const skuExactExists = Boolean(varSku) && shopifyExistingVariants.some((sv) =>
              normalizeLower(sv?.sku) === normalizeLower(varSku)
            );
            const tupleExistsAny =
              Boolean(vColor) &&
              Boolean(vSize) &&
              shopifyExistingVariants.some((sv) => {
                const opts = sv?.selectedOptions || [];
                const svColor = normalizeLower(
                  opts.find((o) => normalizeLower(o.name) === "color")?.value
                );
                const svSize = normalizeLower(
                  opts.find((o) => normalizeLower(o.name) === "size")?.value
                );
                return svColor === vColor && svSize === vSize;
              });

            // If this variant already exists on Shopify (same SKU or same Color/Size tuple),
            // relink instead of trying to create it again.
            const existingVariant = shopifyExistingVariants.find((sv: {
              id: string;
              sku?: string | null;
              selectedOptions?: Array<{ name: string; value: string }>;
            }) => {
              if (!sv?.id || relinkedExistingIds.has(sv.id)) return false;
              const svSku = normalizeLower(sv.sku);
              if (varSku && svSku && svSku === normalizeLower(varSku)) return true;
              if (hasLocalTupleConflict) return false;
              const opts = sv.selectedOptions || [];
              const svColor = normalizeLower(
                opts.find((o) => normalizeLower(o.name) === "color")?.value
              );
              const svSize = normalizeLower(
                opts.find((o) => normalizeLower(o.name) === "size")?.value
              );
              if (vColor && vSize) return svColor === vColor && svSize === vSize;
              return false;
            });

            if (existingVariant?.id) {
              const existingGid = toVariantGid(existingVariant.id);
              for (const holder of parent.variants) {
                if (holder.id === v.id) continue;
                const holderGid = toVariantGid(normalizeText(holder.cartId));
                if (holderGid && existingGid && holderGid === existingGid) {
                  holder.cartId = "";
                  if (!unlinked.some((u) => u.id === holder.id)) {
                    unlinked.push(holder);
                  }
                }
              }
              v.cartId = existingVariant.id;
              relinkedExistingIds.add(existingVariant.id);
              variantsLinkedFromSearch += 1;
              variantsLinkedBySku += varSku ? 1 : 0;
              debugSteps.push({
                step: "add-variants-relink-existing",
                detail: `product=${existingProductGid} variant=${existingVariant.id} sku=${varSku || "-"}`,
              });
              return [];
            }
            const tupleVariantAny =
              hasLocalTupleConflict
                ? null
                : vColor && vSize
                ? shopifyExistingVariants.find((sv) => {
                    if (!sv?.id) return false;
                    const opts = sv.selectedOptions || [];
                    const svColor = normalizeLower(
                      opts.find((o) => normalizeLower(o.name) === "color")?.value
                    );
                    const svSize = normalizeLower(
                      opts.find((o) => normalizeLower(o.name) === "size")?.value
                    );
                    return svColor === vColor && svSize === vSize;
                  })
                : null;
            if (tupleVariantAny?.id) {
              const existingGid = toVariantGid(tupleVariantAny.id);
              for (const holder of parent.variants) {
                if (holder.id === v.id) continue;
                const holderGid = toVariantGid(normalizeText(holder.cartId));
                if (holderGid && existingGid && holderGid === existingGid) {
                  holder.cartId = "";
                  if (!unlinked.some((u) => u.id === holder.id)) {
                    unlinked.push(holder);
                  }
                }
              }
              v.cartId = tupleVariantAny.id;
              relinkedExistingIds.add(tupleVariantAny.id);
              variantsLinkedFromSearch += 1;
              debugSteps.push({
                step: "add-variants-reclaim-by-tuple",
                detail: `product=${existingProductGid} variant=${tupleVariantAny.id} tuple=${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"}`,
              });
              return [];
            }
            if (!skuExactExists && tupleExistsAny) {
              if (hasLocalTupleConflict) {
                const conflictText = `Duplicate option tuple in source (${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"})`;
                debugSteps.push({
                  step: "add-variants-local-tuple-conflict",
                  detail: `product=${existingProductGid} sku=${varSku || "-"} ${conflictText}`,
                });
                addVariantErrors.push(conflictText);
                return [];
              }
              debugSteps.push({
                step: "add-variants-skip-duplicate-option",
                detail: `product=${existingProductGid} sku=${varSku || "-"} option=${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"}`,
              });
              addVariantErrors.push(
                `Option tuple already exists in Shopify (${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"})`
              );
              return [];
            }

            const fallbackOptionValue =
              normalizeText(v.sku) ||
              normalizeText(v.upc) ||
              normalizeText(v.id) ||
              normalizeText(v.color) ||
              normalizeText(v.size) ||
              "Default";
            const optValues: Array<{ name: string; optionName: string }> = [];
            if (shopifyOptions.length > 0) {
              for (const opt of shopifyOptions) {
                const optionName = normalizeText((opt as { name?: string }).name) || "Title";
                const optionKey = normalizeLower(optionName);
                let optionValue = "";
                if (optionKey === "color" && hasColorOption) {
                  optionValue = normalizeText(v.color);
                } else if (optionKey === "size" && hasSizeOption) {
                  optionValue = normalizeText(v.size);
                }
                if (!optionValue) optionValue = fallbackOptionValue;
                optValues.push({ name: optionValue, optionName });
              }
            } else {
              optValues.push({ name: fallbackOptionValue, optionName: "Title" });
            }
            const varSkuValue = normalizeText(v.sku) || undefined;
            return [{
              optionValues: optValues,
              price: String(v.price != null ? v.price : parent.price ?? 0),
              barcode: normalizeText(v.upc) || undefined,
              ...(varSkuValue ? { inventoryItem: { sku: varSkuValue } } : {}),
            }];
          });

          if (relinkedExistingIds.size > 0) {
            await upsertCartCatalogParents(shop, [{ ...parent }]);
          }
          const dedupedToAdd = [] as typeof toAdd;
          const seenOptionKeys = new Set<string>();
          for (const candidate of toAdd) {
            const optionKey = (candidate.optionValues || [])
              .map((ov) => `${normalizeLower(ov.optionName)}=${normalizeLower(ov.name)}`)
              .sort()
              .join("|");
            if (optionKey && seenOptionKeys.has(optionKey)) {
              debugSteps.push({
                step: "add-variants-skip-duplicate-source-option",
                detail: `product=${existingProductGid} option=${optionKey}`,
              });
              addVariantErrors.push(`Duplicate option tuple in source skipped (${optionKey})`);
              continue;
            }
            if (optionKey) seenOptionKeys.add(optionKey);
            dedupedToAdd.push(candidate);
          }
          if (dedupedToAdd.length === 0) {
            continue;
          }

          const addRes = await runShopifyGraphql<{
            productVariantsBulkCreate?: {
              userErrors?: Array<{ message: string; field?: string[] }>;
              productVariants?: Array<{ id: string; sku?: string; selectedOptions?: Array<{ name: string; value: string }> }>;
            };
          }>({
            shop,
            token,
            query: `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkCreate(productId: $productId, variants: $variants) {
                userErrors { field message }
                productVariants { id sku selectedOptions { name value } }
              }
            }`,
            variables: { productId: existingProductGid, variants: dedupedToAdd },
            apiVersion: API_VERSION,
          });

          if (!addRes.ok) {
            const errDetail = JSON.stringify(addRes.errors || "unknown GraphQL error").slice(0, 200);
            console.warn("[cart-inventory] productVariantsBulkCreate GraphQL error:", errDetail);
            addVariantErrors.push(`GraphQL error: ${errDetail}`);
            debugSteps.push({ step: "add-variants-error", detail: `ok=false product=${existingProductGid} graphqlError=${errDetail}` });
          }

          const addErrors = addRes.data?.productVariantsBulkCreate?.userErrors || [];
          if (addErrors.length > 0) {
            const msgs = addErrors.map((e: { message: string }) => e.message);
            console.warn("[cart-inventory] Add variants userErrors:", msgs);
            addVariantErrors.push(...msgs);
          }

          let createdVariants = addRes.ok && addRes.data?.productVariantsBulkCreate?.productVariants
            ? addRes.data.productVariantsBulkCreate.productVariants.filter((pv) => pv.id)
            : [];
          if (createdVariants.length === 0 && dedupedToAdd.length > 1) {
            debugSteps.push({
              step: "add-variants-fallback-start",
              detail: `product=${existingProductGid} attempting single-create for ${dedupedToAdd.length} variants`,
            });
            // Fallback: when bulk create is partially invalid (e.g., one duplicate option tuple),
            // retry one-by-one so valid variants can still be created.
            const singleCreated: Array<{ id: string; sku?: string; selectedOptions?: Array<{ name: string; value: string }> }> = [];
            for (const one of dedupedToAdd) {
              const oneRes = await runShopifyGraphql<{
                productVariantsBulkCreate?: {
                  userErrors?: Array<{ message: string; field?: string[] }>;
                  productVariants?: Array<{ id: string; sku?: string; selectedOptions?: Array<{ name: string; value: string }> }>;
                };
              }>({
                shop,
                token,
                query: `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                  productVariantsBulkCreate(productId: $productId, variants: $variants) {
                    userErrors { field message }
                    productVariants { id sku selectedOptions { name value } }
                  }
                }`,
                variables: { productId: existingProductGid, variants: [one] },
                apiVersion: API_VERSION,
              });
              if (!oneRes.ok) {
                const errDetail = JSON.stringify(oneRes.errors || "unknown GraphQL error").slice(0, 200);
                addVariantErrors.push(`GraphQL error: ${errDetail}`);
                continue;
              }
              const oneErrs = oneRes.data?.productVariantsBulkCreate?.userErrors || [];
              if (oneErrs.length > 0) {
                addVariantErrors.push(...oneErrs.map((e) => e.message));
                continue;
              }
              const oneCreated = oneRes.data?.productVariantsBulkCreate?.productVariants || [];
              for (const pv of oneCreated) {
                if (pv?.id) singleCreated.push(pv);
              }
            }
            if (singleCreated.length > 0) {
              createdVariants = singleCreated;
              debugSteps.push({
                step: "add-variants-fallback-single",
                detail: `product=${existingProductGid} created=${singleCreated.length}/${dedupedToAdd.length}`,
              });
            }
          }
          variantsAddedToExisting += createdVariants.length;
          debugSteps.push({
            step: "add-variants",
            detail: `product=${existingProductGid} options=[${shopifyOptions.map((o: ShopOpt) => o.name).join(",")}] attempted=${unlinked.length} created=${createdVariants.length} errors=${addErrors.length} ok=${addRes.ok}`,
          });

          let linkedCount = 0;
          for (const v of parent.variants) {
            if (normalizeText(v.cartId)) continue;
            const vSku = normalizeText(v.sku) || normalizeText(parent.sku);
            const vColor = normalizeLower(v.color) || "default";
            const vSize = normalizeLower(v.size) || "default";
            const matched = createdVariants.find((cv) => {
              if (vSku && cv.sku && normalizeLower(cv.sku) === normalizeLower(vSku)) return true;
              const opts = cv.selectedOptions || [];
              const cvColor = normalizeLower(opts.find((o) => normalizeLower(o.name) === "color")?.value);
              const cvSize = normalizeLower(opts.find((o) => normalizeLower(o.name) === "size")?.value);
              return cvColor === vColor && cvSize === vSize;
            });
            if (matched) {
              v.cartId = matched.id;
              linkedCount++;
              const idx = createdVariants.indexOf(matched);
              if (idx >= 0) createdVariants.splice(idx, 1);
            }
          }
          if (linkedCount > 0) {
            await upsertCartCatalogParents(shop, [{ ...parent }]);
          }
          continue;
        } else {
          debugSteps.push({ step: "add-variants-skip", detail: `product=${existingProductGid || "not found"} status=${existingStatus || "unknown"} — cannot add to non-active product` });
        }
      }

      if (linked.length === 0 && destructiveRules.addVariantsToExisting) {
        const parentTitle = normalizeText(parent.title);
        if (parentTitle) {
          const titleLookup = await runShopifyGraphql<{
            products?: {
              edges?: Array<{
                node?: {
                  id: string;
                  title?: string;
                  status?: string;
                  options?: Array<{ name: string; optionValues?: Array<{ name: string }> }>;
                  variants?: {
                    nodes?: Array<{
                      id: string;
                      sku?: string | null;
                      selectedOptions?: Array<{ name: string; value: string }>;
                    }>;
                  };
                };
              }>;
            };
          }>({
            shop,
            token,
            query: `query($q: String!) {
              products(first: 10, query: $q) {
                edges {
                  node {
                    id
                    title
                    status
                    options { name optionValues { name } }
                    variants(first: 250) { nodes { id sku selectedOptions { name value } } }
                  }
                }
              }
            }`,
            variables: { q: `title:"${parentTitle.replace(/"/g, '\\"')}" status:active` },
            apiVersion: API_VERSION,
          });

          type TitleMatchNode = {
            id: string;
            title?: string;
            status?: string;
            options?: Array<{ name: string; optionValues?: Array<{ name: string }> }>;
            variants?: {
              nodes?: Array<{
                id: string;
                sku?: string | null;
                selectedOptions?: Array<{ name: string; value: string }>;
              }>;
            };
          };
          const titleEdges = (titleLookup.data?.products?.edges || []) as Array<{ node?: TitleMatchNode }>;
          const exactTitleMatches = titleEdges
            .map((edge) => edge?.node)
            .filter(
              (node): node is TitleMatchNode =>
                Boolean(node?.id) &&
                normalizeLower(node?.status) === "active" &&
                normalizeLower(node?.title) === normalizeLower(parentTitle)
            );

          if (exactTitleMatches.length > 1) {
            debugSteps.push({
              step: "title-match-conflict-skip-create",
              detail: `title=${parentTitle} matches=${exactTitleMatches.length}`,
            });
            continue;
          }

          if (exactTitleMatches.length === 1) {
            const match = exactTitleMatches[0]!;
            const existingProductGid = match.id;
            const shopifyOptions = match.options || [];
            const shopifyExistingVariants = match.variants?.nodes || [];
            type ShopOpt = { name: string; optionValues?: Array<{ name: string }> };
            const colorOptionName = shopifyOptions.find((o: ShopOpt) => normalizeLower(o.name) === "color")?.name || "Color";
            const sizeOptionName = shopifyOptions.find((o: ShopOpt) => normalizeLower(o.name) === "size")?.name || "Size";
            const hasColorOption = shopifyOptions.some((o: ShopOpt) => normalizeLower(o.name) === "color");
            const hasSizeOption = shopifyOptions.some((o: ShopOpt) => normalizeLower(o.name) === "size");

            const tupleKeyOf = (variant: StagingVariant) => {
              const c = normalizeLower(variant.color);
              const s = normalizeLower(variant.size);
              if (!c || !s) return "";
              return `${c}::${s}`;
            };
            const localTupleCounts = new Map<string, number>();
            for (const pv of parent.variants) {
              const k = tupleKeyOf(pv);
              if (!k) continue;
              localTupleCounts.set(k, (localTupleCounts.get(k) || 0) + 1);
            }
            const relinkedIds = new Set<string>();
            const toAdd = unlinked.flatMap((v) => {
              const varSku = normalizeText(v.sku);
              const vColor = normalizeLower(v.color);
              const vSize = normalizeLower(v.size);
              const localTupleKey = vColor && vSize ? `${vColor}::${vSize}` : "";
              const hasLocalTupleConflict =
                Boolean(localTupleKey) && (localTupleCounts.get(localTupleKey) || 0) > 1;
              const skuExactExists = Boolean(varSku) && shopifyExistingVariants.some((sv) =>
                normalizeLower(sv?.sku) === normalizeLower(varSku)
              );
              const tupleExistsAny =
                Boolean(vColor) &&
                Boolean(vSize) &&
                shopifyExistingVariants.some((sv) => {
                  const opts = sv?.selectedOptions || [];
                  const svColor = normalizeLower(opts.find((o) => normalizeLower(o.name) === "color")?.value);
                  const svSize = normalizeLower(opts.find((o) => normalizeLower(o.name) === "size")?.value);
                  return svColor === vColor && svSize === vSize;
                });
              const existingVariant = shopifyExistingVariants.find((sv) => {
                if (!sv?.id || relinkedIds.has(sv.id)) return false;
                const svSku = normalizeLower(sv.sku);
                if (varSku && svSku && svSku === normalizeLower(varSku)) return true;
                if (hasLocalTupleConflict) return false;
                const opts = sv.selectedOptions || [];
                const svColor = normalizeLower(opts.find((o) => normalizeLower(o.name) === "color")?.value);
                const svSize = normalizeLower(opts.find((o) => normalizeLower(o.name) === "size")?.value);
                if (vColor && vSize) return svColor === vColor && svSize === vSize;
                return false;
              });

              if (existingVariant?.id) {
                const toVariantGid = (id: string) => {
                  const raw = normalizeText(id);
                  if (!raw) return "";
                  if (raw.startsWith("gid://shopify/ProductVariant/")) return raw;
                  if (raw.includes("~")) {
                    const [, variantId = ""] = raw.split("~");
                    if (variantId) return `gid://shopify/ProductVariant/${variantId}`;
                  }
                  return `gid://shopify/ProductVariant/${raw}`;
                };
                const existingGid = toVariantGid(existingVariant.id);
                for (const holder of parent.variants) {
                  if (holder.id === v.id) continue;
                  const holderGid = toVariantGid(normalizeText(holder.cartId));
                  if (holderGid && existingGid && holderGid === existingGid) {
                    holder.cartId = "";
                      if (!unlinked.some((u) => u.id === holder.id)) {
                        unlinked.push(holder);
                      }
                  }
                }
                v.cartId = existingVariant.id;
                relinkedIds.add(existingVariant.id);
                variantsLinkedFromSearch += 1;
                return [];
              }
              const tupleVariantAny =
                hasLocalTupleConflict
                  ? null
                  : vColor && vSize
                  ? shopifyExistingVariants.find((sv) => {
                      if (!sv?.id) return false;
                      const opts = sv.selectedOptions || [];
                      const svColor = normalizeLower(opts.find((o) => normalizeLower(o.name) === "color")?.value);
                      const svSize = normalizeLower(opts.find((o) => normalizeLower(o.name) === "size")?.value);
                      return svColor === vColor && svSize === vSize;
                    })
                  : null;
              if (tupleVariantAny?.id) {
                const toVariantGid = (id: string) => {
                  const raw = normalizeText(id);
                  if (!raw) return "";
                  if (raw.startsWith("gid://shopify/ProductVariant/")) return raw;
                  if (raw.includes("~")) {
                    const [, variantId = ""] = raw.split("~");
                    if (variantId) return `gid://shopify/ProductVariant/${variantId}`;
                  }
                  return `gid://shopify/ProductVariant/${raw}`;
                };
                const existingGid = toVariantGid(tupleVariantAny.id);
                for (const holder of parent.variants) {
                  if (holder.id === v.id) continue;
                  const holderGid = toVariantGid(normalizeText(holder.cartId));
                  if (holderGid && existingGid && holderGid === existingGid) {
                    holder.cartId = "";
                      if (!unlinked.some((u) => u.id === holder.id)) {
                        unlinked.push(holder);
                      }
                  }
                }
                v.cartId = tupleVariantAny.id;
                relinkedIds.add(tupleVariantAny.id);
                variantsLinkedFromSearch += 1;
                debugSteps.push({
                  step: "title-match-reclaim-by-tuple",
                  detail: `title=${parentTitle} variant=${tupleVariantAny.id} tuple=${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"}`,
                });
                return [];
              }
              if (!skuExactExists && tupleExistsAny) {
                if (hasLocalTupleConflict) {
                  const conflictText = `Duplicate option tuple in source (${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"})`;
                  debugSteps.push({
                    step: "title-match-local-tuple-conflict",
                    detail: `title=${parentTitle} sku=${varSku || "-"} ${conflictText}`,
                  });
                  addVariantErrors.push(conflictText);
                  return [];
                }
                debugSteps.push({
                  step: "title-match-skip-duplicate-option",
                  detail: `title=${parentTitle} sku=${varSku || "-"} option=${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"}`,
                });
                addVariantErrors.push(
                  `Option tuple already exists in Shopify (${normalizeText(v.color) || "-"} / ${normalizeText(v.size) || "-"})`
                );
                return [];
              }

              const fallbackOptionValue =
                normalizeText(v.sku) ||
                normalizeText(v.upc) ||
                normalizeText(v.id) ||
                normalizeText(v.color) ||
                normalizeText(v.size) ||
                "Default";
              const optValues: Array<{ name: string; optionName: string }> = [];
              if (shopifyOptions.length > 0) {
                for (const opt of shopifyOptions) {
                  const optionName = normalizeText((opt as { name?: string }).name) || "Title";
                  const optionKey = normalizeLower(optionName);
                  let optionValue = "";
                  if (optionKey === "color" && hasColorOption) {
                    optionValue = normalizeText(v.color);
                  } else if (optionKey === "size" && hasSizeOption) {
                    optionValue = normalizeText(v.size);
                  }
                  if (!optionValue) optionValue = fallbackOptionValue;
                  optValues.push({ name: optionValue, optionName });
                }
              } else {
                optValues.push({ name: fallbackOptionValue, optionName: "Title" });
              }
              const varSkuValue = normalizeText(v.sku) || undefined;
              return [{
                optionValues: optValues,
                price: String(v.price != null ? v.price : parent.price ?? 0),
                barcode: normalizeText(v.upc) || undefined,
                ...(varSkuValue ? { inventoryItem: { sku: varSkuValue } } : {}),
              }];
            });

            const dedupedToAddByTitle = [] as typeof toAdd;
            const seenTitleOptionKeys = new Set<string>();
            for (const candidate of toAdd) {
              const optionKey = (candidate.optionValues || [])
                .map((ov) => `${normalizeLower(ov.optionName)}=${normalizeLower(ov.name)}`)
                .sort()
                .join("|");
              if (optionKey && seenTitleOptionKeys.has(optionKey)) {
                debugSteps.push({
                  step: "title-match-skip-duplicate-source-option",
                  detail: `title=${parentTitle} option=${optionKey}`,
                });
                addVariantErrors.push(`Duplicate option tuple in source skipped (${optionKey})`);
                continue;
              }
              if (optionKey) seenTitleOptionKeys.add(optionKey);
              dedupedToAddByTitle.push(candidate);
            }

            if (dedupedToAddByTitle.length > 0) {
              const addRes = await runShopifyGraphql<{
                productVariantsBulkCreate?: {
                  userErrors?: Array<{ message: string; field?: string[] }>;
                  productVariants?: Array<{ id: string; sku?: string; selectedOptions?: Array<{ name: string; value: string }> }>;
                };
              }>({
                shop,
                token,
                query: `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                  productVariantsBulkCreate(productId: $productId, variants: $variants) {
                    userErrors { field message }
                    productVariants { id sku selectedOptions { name value } }
                  }
                }`,
                variables: { productId: existingProductGid, variants: dedupedToAddByTitle },
                apiVersion: API_VERSION,
              });
              const addErrors = addRes.data?.productVariantsBulkCreate?.userErrors || [];
              if (!addRes.ok || addErrors.length > 0) {
                addVariantErrors.push(...addErrors.map((e: { message: string }) => e.message));
              }
              const created = addRes.ok && addRes.data?.productVariantsBulkCreate?.productVariants
                ? addRes.data.productVariantsBulkCreate.productVariants.filter((pv) => pv.id)
                : [];
              variantsAddedToExisting += created.length;
              for (const v of parent.variants) {
                if (normalizeText(v.cartId)) continue;
                const vSku = normalizeText(v.sku) || normalizeText(parent.sku);
                const vColor = normalizeLower(v.color) || "default";
                const vSize = normalizeLower(v.size) || "default";
                const matched = created.find((cv) => {
                  if (vSku && cv.sku && normalizeLower(cv.sku) === normalizeLower(vSku)) return true;
                  const opts = cv.selectedOptions || [];
                  const cvColor = normalizeLower(opts.find((o) => normalizeLower(o.name) === "color")?.value);
                  const cvSize = normalizeLower(opts.find((o) => normalizeLower(o.name) === "size")?.value);
                  return cvColor === vColor && cvSize === vSize;
                });
                if (matched?.id) v.cartId = matched.id;
              }
            }

            await upsertCartCatalogParents(shop, [{ ...parent }]);
            debugSteps.push({
              step: "title-match-add-variants",
              detail: `title=${parentTitle} product=${existingProductGid} unlinked=${unlinked.length}`,
            });
            continue;
          }
        }
      }

      if (!destructiveRules.createNewProducts) {
        debugSteps.push({ step: "create-product-blocked", detail: `sku=${parent.sku} title=${parent.title} — blocked by createNewProducts=false` });
        continue;
      }

      const result = await createShopifyProductFromCart(shop, token, parent, cartConfig, locationId);
      if (!result.ok || !result.productGid || !result.variantGids?.length) {
        console.warn("[cart-inventory] Create product failed:", parent.sku, result.error);
        continue;
      }

      productGidsUpdated.add(result.productGid);

      const updatedVariants = parent.variants.map((v, i) => ({
        ...v,
        cartId: result.variantGids?.[i] || v.cartId,
      }));
      const updatedParent: StagingParent = { ...parent, variants: updatedVariants };
      await upsertCartCatalogParents(shop, [updatedParent]);
      for (let i = 0; i < parent.variants.length; i++) {
        parent.variants[i].cartId = result.variantGids?.[i] || parent.variants[i].cartId;
      }
      productsCreated += 1;
    }
  } catch (createErr) {
    console.warn("[cart-inventory] Product creation phase:", (createErr as Error)?.message);
  }

  const quantities: Array<{
    inventoryItemId: string;
    locationId: string;
    quantity: number;
    compareQuantity: number | null;
  }> = [];

  for (const parent of toPush) {
    for (const v of parent.variants) {
      const cartId = normalizeText(v.cartId);
      if (!cartId) {
        variantsSkippedNoCartId += 1;
        continue;
      }
      const variantGid = cartId.includes("~")
        ? `gid://shopify/ProductVariant/${cartId.split("~")[1] || cartId}`
        : cartId.startsWith("gid://")
          ? cartId
          : `gid://shopify/ProductVariant/${cartId}`;

      const varRes = await runShopifyGraphql<{
        productVariant?: {
          id: string;
          sku?: string;
          barcode?: string;
          price?: string;
          compareAtPrice?: string;
          inventoryItem?: { id: string; cost?: string };
          product?: {
            id: string;
            title?: string;
            handle?: string;
            descriptionHtml?: string;
            status?: string;
            productType?: string;
            vendor?: string;
            tags?: string[];
            options?: Array<{ name: string; values: string[] }>;
          };
        };
      }>({
        shop,
        token,
        query: `query($id: ID!) { productVariant(id: $id) { id sku barcode price compareAtPrice inventoryItem { id } product { id title handle descriptionHtml status productType vendor tags options { name values } } } }`,
        variables: { id: variantGid },
        apiVersion: API_VERSION,
      });
      const shopVariant = varRes.ok ? varRes.data?.productVariant : null;
      const prodStatus = normalizeLower(shopVariant?.product?.status);
      if (prodStatus === "archived" || prodStatus === "draft") {
        console.log("[cart-inventory] Skipping variant", variantGid, "- product is", prodStatus);
        v.cartId = "";
        variantsSkippedNoCartId += 1;
        continue;
      }
      const invItemId = shopVariant?.inventoryItem?.id || "";
      if (!invItemId) {
        variantsSkippedNoInvItem += 1;
        continue;
      }

      // --- Variant-level updates (SKU, barcode, price) gated by config ---
      const cartSku = normalizeText(v.sku) || normalizeText(parent.sku);
      const cartUpc = normalizeText(v.upc);
      const shopSku = normalizeText(shopVariant?.sku);
      const shopBarcode = normalizeText(shopVariant?.barcode);
      const bulkVariantInput: Record<string, unknown> = { id: variantGid };
      let hasVariantChanges = false;

      if (updateRules.barcode && cartUpc && cartUpc !== shopBarcode) {
        bulkVariantInput.barcode = cartUpc;
        hasVariantChanges = true;
      } else if (cartUpc && !shopBarcode) {
        bulkVariantInput.barcode = cartUpc;
        hasVariantChanges = true;
      }

      if (cartSku && cartSku !== shopSku) {
        bulkVariantInput.inventoryItem = { sku: cartSku };
        hasVariantChanges = true;
      } else if (cartSku && !shopSku) {
        bulkVariantInput.inventoryItem = { sku: cartSku };
        hasVariantChanges = true;
      }

      if (updateRules.price && v.price != null) {
        const cartPrice = String(v.price);
        if (cartPrice !== normalizeText(shopVariant?.price)) {
          bulkVariantInput.price = cartPrice;
          hasVariantChanges = true;
        }
      }

      if (updateRules.comparePrice && v.comparePrice != null) {
        const cartCompare = String(v.comparePrice);
        if (cartCompare !== normalizeText(shopVariant?.compareAtPrice)) {
          bulkVariantInput.compareAtPrice = cartCompare;
          hasVariantChanges = true;
        }
      }

      if (updateRules.weight && v.weight != null) {
        bulkVariantInput.weight = v.weight;
        bulkVariantInput.weightUnit = (normalizeText(v.weightUnit) || "KILOGRAMS").toUpperCase();
        hasVariantChanges = true;
      }

      const shopProductGid = shopVariant?.product?.id || "";

      if (hasVariantChanges && shopProductGid) {
        const vUpdateRes = await runShopifyGraphql<{
          productVariantsBulkUpdate?: {
            userErrors?: Array<{ message: string }>;
            productVariants?: Array<{ id: string }>;
          };
        }>({
          shop,
          token,
          query: `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { message }
              productVariants { id }
            }
          }`,
          variables: { productId: shopProductGid, variants: [bulkVariantInput] },
          apiVersion: API_VERSION,
        });
        const vUpdateErrors = vUpdateRes.data?.productVariantsBulkUpdate?.userErrors || [];
        if (vUpdateErrors.length > 0 || !vUpdateRes.ok) {
          debugSteps.push({ step: "variant-update-error", detail: `variant=${variantGid} ok=${vUpdateRes.ok} errors=${JSON.stringify(vUpdateErrors.map((e: { message: string }) => e.message))}` });
        } else {
          const updatedFields = Object.keys(bulkVariantInput).filter((k) => k !== "id");
          debugSteps.push({ step: "variant-update", detail: `variant=${variantGid} updated: ${updatedFields.join(",")}` });
        }
      }

      // --- Product-level updates gated by config (once per product) ---
      if (shopProductGid && !productGidsUpdated.has(shopProductGid)) {
        productGidsUpdated.add(shopProductGid);
        const productUpdate: Record<string, unknown> = { id: shopProductGid };
        const updatedFields: string[] = [];

        const cartCategory = normalizeText(parent.category);
        const cartBrand = normalizeText(parent.brand);
        const formattedCategory = cartCategory.replace(/[\\\/]/g, " >> ");

        if (updateRules.productName) {
          const cartTitle = normalizeText(parent.title);
          if (cartTitle && cartTitle !== normalizeText(shopVariant?.product?.title)) {
            productUpdate.title = cartTitle;
            updatedFields.push("title");
          }
        }

        if (updateRules.description) {
          const cartDesc = normalizeText(parent.description);
          if (cartDesc) {
            productUpdate.descriptionHtml = cartDesc;
            updatedFields.push("description");
          }
        }

        if (updateRules.urlHandle) {
          const cartHandle = normalizeLower(parent.title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          if (cartHandle && cartHandle !== normalizeText(shopVariant?.product?.handle)) {
            productUpdate.handle = cartHandle;
            updatedFields.push("handle");
          }
        }

        if (updateRules.productType) {
          if (formattedCategory) {
            productUpdate.productType = formattedCategory;
            updatedFields.push("productType");
          }
        } else {
          const shopType = normalizeText(shopVariant?.product?.productType);
          const shopTypeNeedsFormat = shopType && /[\\\/]/.test(shopType);
          if (formattedCategory && (!shopType || shopTypeNeedsFormat)) {
            productUpdate.productType = formattedCategory;
            updatedFields.push("productType");
          }
        }

        if (updateRules.vendor) {
          if (cartBrand) {
            productUpdate.vendor = cartBrand;
            updatedFields.push("vendor");
          }
        } else {
          const shopVendorLower = normalizeLower(shopVariant?.product?.vendor);
          if (cartBrand && (!shopVendorLower || shopVendorLower === "default" || shopVendorLower === "unknown")) {
            productUpdate.vendor = cartBrand;
            updatedFields.push("vendor");
          }
        }

        if (updateRules.tags) {
          const cartTags = normalizeText(parent.category).split(/>>|,/).map((t) => t.trim()).filter(Boolean);
          if (cartTags.length > 0) {
            productUpdate.tags = cartTags;
            updatedFields.push("tags");
          }
        }

        if (updatedFields.length > 0) {
          const pUpdateRes = await runShopifyGraphql<ProductUpdateResponse>({
            shop,
            token,
            query: `mutation productUpdate($product: ProductUpdateInput!) {
              productUpdate(product: $product) {
                product { id }
                userErrors { message }
              }
            }`,
            variables: { product: productUpdate },
            apiVersion: API_VERSION,
          });
          const pUpdateErrors = pUpdateRes.data?.productUpdate?.userErrors || [];
          if (pUpdateErrors.length > 0 || !pUpdateRes.ok) {
            debugSteps.push({ step: "product-update-error", detail: `product=${shopProductGid} ok=${pUpdateRes.ok} updated=${updatedFields.join(",")} errors=${JSON.stringify(pUpdateErrors.map((e: { message: string }) => e.message))}` });
          } else {
            debugSteps.push({ step: "product-update", detail: `product=${shopProductGid} updated: ${updatedFields.join(",")}` });
          }
        } else {
          debugSteps.push({ step: "product-update-skip", detail: `product=${shopProductGid} — no fields to update per config` });
        }

        const shopOptions = shopVariant?.product?.options || [];
        const sizeOption = shopOptions.find((o: { name: string }) => normalizeLower(o.name) === "size");
        if (sizeOption && sizeOption.values.length > 1) {
          const currentSizes = Array.from(
            new Set(
              sizeOption.values
                .map((value) => normalizeText(value))
                .filter(Boolean)
            )
          );
          const sorted = sortSizes(currentSizes);
          const needsReorder =
            sorted.length === currentSizes.length &&
            sorted.some((val, i) => val !== currentSizes[i]);
          if (needsReorder) {
            const reorderOptions = shopOptions.map((o: { name: string; values: string[] }) => {
              if (normalizeLower(o.name) === "size") {
                return { name: o.name, values: sorted.map((v) => ({ name: v })) };
              }
              return { name: o.name, values: o.values.map((v) => ({ name: v })) };
            });
            const reorderRes = await runShopifyGraphql<{
              productOptionsReorder?: { userErrors?: Array<{ message: string }> };
            }>({
              shop,
              token,
              query: `mutation reorderOptions($productId: ID!, $options: [OptionReorderInput!]!) {
                productOptionsReorder(productId: $productId, options: $options) {
                  userErrors { message }
                }
              }`,
              variables: { productId: shopProductGid, options: reorderOptions },
              apiVersion: API_VERSION,
            });
            const reorderErrors = reorderRes.data?.productOptionsReorder?.userErrors || [];
            if (reorderErrors.length > 0 || !reorderRes.ok) {
              debugSteps.push({ step: "size-reorder-error", detail: `product=${shopProductGid} errors=${JSON.stringify(reorderErrors.map((e: { message: string }) => e.message))}` });
            } else {
              debugSteps.push({ step: "size-reorder", detail: `product=${shopProductGid} reordered: ${sorted.join(",")}` });
            }
          }
        }
      }

      await runShopifyGraphql({
        shop,
        token,
        query: `mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
          inventoryItemUpdate(id: $id, input: $input) {
            userErrors { message }
          }
        }`,
        variables: {
          id: invItemId,
          input: {
            tracked: true,
            ...(updateRules.costPrice && v.costPrice != null ? { cost: String(v.costPrice) } : {}),
          },
        },
        apiVersion: API_VERSION,
      });

      const qty =
        typeof v.stock === "number" && Number.isFinite(v.stock)
          ? Math.max(0, Math.round(v.stock))
          : 0;

      quantities.push({
        inventoryItemId: invItemId,
        locationId,
        quantity: qty,
        compareQuantity: null,
      });
    }
  }

  const parentsToPersist = toPush.filter((p) =>
    p.variants.some((v) => !normalizeText(v.cartId))
  );
  if (parentsToPersist.length > 0) {
    await upsertCartCatalogParents(shop, parentsToPersist).catch((e) =>
      console.warn("[cart-inventory] Failed to persist cleared cartIds:", (e as Error)?.message)
    );
  }

  const deduped = new Map<string, (typeof quantities)[0]>();
  for (const q of quantities) {
    const key = `${q.inventoryItemId}::${q.locationId}`;
    const existing = deduped.get(key);
    if (!existing || q.quantity > existing.quantity) {
      deduped.set(key, q);
    }
  }
  const uniqueQuantities = Array.from(deduped.values());
  console.log("[cart-inventory] Pre-push: raw=", quantities.length, "deduped=", uniqueQuantities.length, "skippedNoCartId=", variantsSkippedNoCartId, "skippedNoInvItem=", variantsSkippedNoInvItem);
  let pushed = 0;
  let inventoryErrors: string[] = [];
  if (uniqueQuantities.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < uniqueQuantities.length; i += BATCH) {
      const batch = uniqueQuantities.slice(i, i + BATCH);
      const mutRes = await runShopifyGraphql<{
        inventorySetQuantities?: {
          userErrors?: Array<{ message: string }>;
        };
      }>({
        shop,
        token,
        query: `mutation($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            userErrors { message }
          }
        }`,
        variables: {
          input: {
            name: "available",
            reason: "correction",
            ignoreCompareQuantity: true,
            quantities: batch.map((q) => ({
              inventoryItemId: q.inventoryItemId,
              locationId: q.locationId,
              quantity: q.quantity,
              compareQuantity: q.compareQuantity,
            })),
          },
        },
        apiVersion: API_VERSION,
      });
      const errs = mutRes.data?.inventorySetQuantities?.userErrors ?? [];
      if (errs.length > 0) {
        inventoryErrors.push(...errs.map((e: { message?: string }) => e.message).filter(Boolean));
        console.warn("[cart-inventory] inventorySetQuantities userErrors:", errs.map((e: { message?: string }) => e.message));
      }
      if (mutRes.ok && errs.length === 0) {
        pushed += batch.length;
      }
    }
  }

  const toMarkProcessed = pushed > 0 ? parentIds : [];
  if (toMarkProcessed.length > 0) {
    await updateCartCatalogStatus(shop, toMarkProcessed, "PROCESSED");
  }

  let removedFromShopify = 0;
  const fullCart = await listCartCatalogParents(shop);
  const cartVariantGids = new Set<string>();
  for (const parent of fullCart.data) {
    for (const v of parent.variants) {
      const cartId = normalizeText(v.cartId);
      if (!cartId) continue;
      const gid = cartId.includes("~")
        ? `gid://shopify/ProductVariant/${cartId.split("~")[1] || cartId}`
        : cartId.startsWith("gid://")
          ? cartId
          : `gid://shopify/ProductVariant/${cartId}`;
      cartVariantGids.add(gid.toLowerCase());
    }
  }

  let archivedNotInCart = 0;
  const ARCHIVE_SAFETY_MIN_CART_VARIANTS = 10;
  const ARCHIVE_MAX_PER_RUN = 50;
  if (!destructiveRules.archiveProductsNotInCart) {
    console.log("[cart-inventory] Archive phase skipped: archiveProductsNotInCart is OFF.");
  } else if (cartVariantGids.size < ARCHIVE_SAFETY_MIN_CART_VARIANTS) {
    console.warn(`[cart-inventory] Archive safety: only ${cartVariantGids.size} cart variants found (min ${ARCHIVE_SAFETY_MIN_CART_VARIANTS}). Skipping archive phase to avoid data loss.`);
  } else {
  const archiveQueries = ["status:active", "status:draft", "status:unlisted"] as const;
  for (const statusQuery of archiveQueries) {
    let shopifyCursor: string | null = null;
    const PRODUCTS_PER_PAGE = 50;
    const MAX_ARCHIVE_PAGES = 100;
    for (let page = 0; page < MAX_ARCHIVE_PAGES; page++) {
      let prodRes: { ok: boolean; data?: ProductsPageResponse | null };
      try {
        prodRes = await runShopifyGraphql<ProductsPageResponse>({
          shop,
          token,
          query: `query($first: Int!, $after: String, $query: String!) {
            products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
              edges { node { id variants(first: 250) { nodes { id } } } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          variables: {
            first: PRODUCTS_PER_PAGE,
            after: shopifyCursor,
            query: statusQuery,
          },
          apiVersion: API_VERSION,
        });
      } catch (archiveErr) {
        console.warn("[cart-inventory] Archive query failed for", statusQuery, (archiveErr as Error)?.message);
        break;
      }
      if (!prodRes.ok || !prodRes.data?.products?.edges) break;
      const edges = prodRes.data.products.edges;
      const pageInfo = prodRes.data.products.pageInfo;
      for (const edge of edges) {
        const product = edge?.node;
        if (!product?.id) continue;
        const variantNodes = product.variants?.nodes || [];
        const hasVariantInCart = variantNodes.some((vn) =>
          cartVariantGids.has(normalizeText(vn?.id).toLowerCase())
        );
        if (variantNodes.length > 0 && !hasVariantInCart) {
          if (archivedNotInCart >= ARCHIVE_MAX_PER_RUN) {
            console.warn(`[cart-inventory] Archive circuit breaker: reached ${ARCHIVE_MAX_PER_RUN} archives in one run. Stopping.`);
            break;
          }
          const updRes = await runShopifyGraphql<ProductUpdateResponse>({
            shop,
            token,
            query: `mutation productUpdate($product: ProductUpdateInput!) {
              productUpdate(product: $product) {
                product { id }
                userErrors { message }
              }
            }`,
            variables: {
              product: { id: product.id, status: "ARCHIVED" },
            },
            apiVersion: API_VERSION,
          });
          if (updRes.ok && !(updRes.data?.productUpdate?.userErrors?.length)) {
            archivedNotInCart += 1;
          }
        }
      }
      if (!pageInfo?.hasNextPage) break;
      shopifyCursor = pageInfo.endCursor || null;
      if (!shopifyCursor) break;
      if (archivedNotInCart >= ARCHIVE_MAX_PER_RUN) break;
    }
    if (archivedNotInCart >= ARCHIVE_MAX_PER_RUN) break;
  }
  } // end archive safety else
  removedFromShopify += archivedNotInCart;

  // ---------- Phase 10: Manage Publications (Sales Channels) ----------
  const isValidGid = (gid: string) => /^gid:\/\/shopify\/\w+\/\d+$/.test(gid);
  let publishedToChannels = 0;
  let unpublishedFromChannels = 0;
  if (publicationIds.length > 0) {
    const allProductGids = Array.from(productGidsUpdated).filter(isValidGid);
    const safePubIds = publicationIds.filter(isValidGid);
    if (allProductGids.length > 0 && safePubIds.length > 0) {
      const PUB_BATCH = 25;
      for (let batchStart = 0; batchStart < allProductGids.length; batchStart += PUB_BATCH) {
        const batch = allProductGids.slice(batchStart, batchStart + PUB_BATCH);
        const pubAliases = batch.map((gid, idx) => {
          const alias = `pub${idx}`;
          return `${alias}: publishablePublish(id: "${gid}", input: [${safePubIds.map((pid) => `{ publicationId: "${pid}" }`).join(", ")}]) {
            userErrors { field message }
          }`;
        });
        const pubMutation = `mutation PublishBatch { ${pubAliases.join("\n")} }`;
        const pubRes = await runShopifyGraphql<Record<string, { userErrors: Array<{ message: string }> }>>({
          shop,
          token,
          query: pubMutation,
          apiVersion: API_VERSION,
        });
        if (pubRes.ok && pubRes.data) {
          for (const val of Object.values(pubRes.data)) {
            if (val?.userErrors?.length === 0) publishedToChannels++;
          }
        }
      }

      for (let batchStart = 0; batchStart < allProductGids.length; batchStart += PUB_BATCH) {
        const batch = allProductGids.slice(batchStart, batchStart + PUB_BATCH);
        const checkAliases = batch.map((gid, idx) => {
          const alias = `c${idx}`;
          return `${alias}: product(id: "${gid}") {
            id
            resourcePublicationsV2(first: 20) { edges { node { publication { id } } } }
          }`;
        });
        const checkQuery = `{ ${checkAliases.join("\n")} }`;
        const checkRes = await runShopifyGraphql<Record<string, {
          id: string;
          resourcePublicationsV2: { edges: Array<{ node: { publication: { id: string } } }> };
        }>>({ shop, token, query: checkQuery, apiVersion: API_VERSION });
        if (!checkRes.ok || !checkRes.data) continue;

        for (const prod of Object.values(checkRes.data)) {
          if (!prod?.id || !prod.resourcePublicationsV2) continue;
          const currentPubIds = prod.resourcePublicationsV2.edges.map((e) => e.node.publication.id);
          const toRemove = currentPubIds.filter((pid) => !publicationIds.includes(pid));
          if (toRemove.length === 0) continue;
          const unpubRes = await runShopifyGraphql<{
            publishableUnpublish: { userErrors: Array<{ message: string }> };
          }>({
            shop,
            token,
            query: `mutation UnpubProduct($id: ID!, $input: [PublicationInput!]!) {
              publishableUnpublish(id: $id, input: $input) { userErrors { field message } }
            }`,
            variables: { id: prod.id, input: toRemove.map((pid) => ({ publicationId: pid })) },
            apiVersion: API_VERSION,
          });
          if (unpubRes.ok && unpubRes.data?.publishableUnpublish?.userErrors?.length === 0) {
            unpublishedFromChannels++;
          }
        }
      }
    }
  }

  // Final reconciliation pass: resolve any remaining unlinked variants by unique exact SKU.
  // This runs after all create/update phases to avoid stale intermediate counters.
  let variantsRelinkedFinal = 0;
  let variantsSkuConflictFinal = 0;
  try {
    for (const parent of toPush) {
      let parentUpdated = false;
      for (const v of parent.variants) {
        if (normalizeText(v.cartId)) continue;
        const sku = normalizeText(v.sku);
        if (!sku) continue;
        const searchRes = await runShopifyGraphql<{
          productVariants?: {
            edges?: Array<{
              node?: {
                id: string;
                sku?: string;
                product?: { status?: string };
              };
            }>;
          };
        }>({
          shop,
          token,
          query: `query($q: String!) {
            productVariants(first: 5, query: $q) {
              edges { node { id sku product { status } } }
            }
          }`,
          variables: { q: `sku:${sku.replace(/"/g, '\\"')}` },
          apiVersion: API_VERSION,
        });
        if (!searchRes.ok) continue;
        const matches = (searchRes.data?.productVariants?.edges || [])
          .map((e) => e.node)
          .filter((n): n is { id: string; sku?: string; product?: { status?: string } } => Boolean(n?.id))
          .filter((n) => normalizeLower(n.sku) === normalizeLower(sku))
          .filter((n) => {
            const st = normalizeLower(n.product?.status);
            return st !== "archived" && st !== "draft";
          });
        if (matches.length === 1) {
          v.cartId = matches[0].id;
          variantsRelinkedFinal += 1;
          parentUpdated = true;
          debugSteps.push({
            step: "final-relink-by-sku",
            detail: `sku=${sku} variant=${matches[0].id}`,
          });
        } else if (matches.length > 1) {
          variantsSkuConflictFinal += 1;
          debugSteps.push({
            step: "final-relink-conflict",
            detail: `sku=${sku} matches=${matches.length}`,
          });
        }
      }
      if (parentUpdated) {
        await upsertCartCatalogParents(shop, [{ ...parent }]).catch(() => {});
      }
    }
  } catch (finalRelinkErr) {
    console.warn("[cart-inventory] Final relink pass:", (finalRelinkErr as Error)?.message);
  }

  const finalVariantsStillUnlinked = toPush.reduce(
    (sum, parent) =>
      sum +
      parent.variants.reduce(
        (inner, v) => inner + (normalizeText(v.cartId) ? 0 : 1),
        0
      ),
    0
  );

  const pushSummary = {
    action: "push-all",
    shop,
    pushed,
    totalVariants: uniqueQuantities.length,
    productsProcessed: toMarkProcessed.length,
    removedFromShopify,
    archivedNotInCart,
  };
  console.log("[cart-inventory] Push complete:", JSON.stringify(pushSummary));

  if (notificationEmail) {
    void sendPushNotificationEmail({
      to: notificationEmail,
      shop,
      success: true,
      pushed,
      totalVariants: uniqueQuantities.length,
      markedProcessed: toMarkProcessed.length,
      removedFromShopify,
      archivedNotInCart,
      productsCreated,
      items: toPush.map((p) => ({
        sku: normalizeText(p.sku),
        title: normalizeText(p.title),
        brand: normalizeText(p.brand),
        variants: Array.isArray(p.variants) ? p.variants.length : 0,
      })),
    }).catch(() => {});
  }

  return {
    ok: true,
    pushed,
    productsCreated,
    variantsLinkedFromSearch: variantsLinkedFromSearch > 0 ? variantsLinkedFromSearch : undefined,
    totalVariants: uniqueQuantities.length,
    markedProcessed: toMarkProcessed.length,
    removedFromShopify,
    archivedNotInCart,
    debug: {
            parentsRequested: parentIds.length,
            parentsMatched: toPush.length,
            staleLinksCleared,
            variantsLinkedBySku,
            variantsLinkedByBarcode,
            variantsAddedToExisting,
            variantsSkippedNoCartId: finalVariantsStillUnlinked,
            variantsSkippedNoInvItem,
            variantsRelinkedFinal,
            variantsSkuConflictFinal,
            quantitiesAttempted: uniqueQuantities.length,
            inventoryErrors:
              inventoryErrors.length > 0 ? inventoryErrors.slice(0, 5) : undefined,
            addVariantErrors:
              addVariantErrors.length > 0 ? addVariantErrors.slice(0, 5) : undefined,
            steps: debugSteps.length > 0 ? debugSteps.slice(0, 30) : undefined,
            hint:
              inventoryErrors.length > 0
                ? `Shopify inventory update failed: ${inventoryErrors[0]}${inventoryErrors.length > 1 ? ` (+${inventoryErrors.length - 1} more)` : ""}`
                : addVariantErrors.length > 0
                  ? `Failed to add variants: ${addVariantErrors[0]}`
                  : finalVariantsStillUnlinked > 0
                    ? "Variants are not linked to Shopify. Try pulling from Shopify catalog first, or run Match to LS Matrix if from Lightspeed."
                    : variantsSkippedNoInvItem > 0
                      ? "Variants could not be found in Shopify (deleted or ID mismatch)."
                      : quantities.length === 0 && toPush.length > 0
                        ? "No variants could be linked. Check that products exist in Shopify with matching SKUs or titles."
                        : undefined,
          },
  };
}

export type ActivateArchivedResult = {
  ok: boolean;
  activated?: number;
  error?: string;
};

/** Activate Shopify products that are archived but whose variants are in the cart. */
export async function runActivateArchivedInCart(shop: string): Promise<ActivateArchivedResult> {
  const token = (await getTokenForShop(shop)) || getShopifyAdminToken(shop);
  if (!token) return { ok: false, error: "Shopify access token not found for this shop." };

  const fullCart = await listCartCatalogParents(shop);
  const cartVariantGids = new Set<string>();
  for (const parent of fullCart.data) {
    for (const v of parent.variants) {
      const cartId = normalizeText(v.cartId);
      if (!cartId) continue;
      const gid =
        cartId.includes("~")
          ? `gid://shopify/ProductVariant/${cartId.split("~")[1] || cartId}`
          : cartId.startsWith("gid://")
            ? cartId
            : `gid://shopify/ProductVariant/${cartId}`;
      cartVariantGids.add(gid.toLowerCase());
    }
  }
  if (cartVariantGids.size < 1) {
    return { ok: true, activated: 0 };
  }

  const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
  let activated = 0;
  let shopifyCursor: string | null = null;
  const PRODUCTS_PER_PAGE = 50;
  const MAX_PAGES = 200;

  for (let page = 0; page < MAX_PAGES; page++) {
    let prodRes: { ok: boolean; data?: ProductsPageResponse | null };
    prodRes = await runShopifyGraphql<ProductsPageResponse>({
      shop,
      token,
      query: `query($first: Int!, $after: String, $query: String!) {
        products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
          edges { node { id variants(first: 250) { nodes { id } } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: {
        first: PRODUCTS_PER_PAGE,
        after: shopifyCursor,
        query: "status:archived",
      },
      apiVersion: API_VERSION,
    });
    if (!prodRes.ok || !prodRes.data?.products?.edges) break;
    const edges = prodRes.data.products.edges;
    const pageInfo = prodRes.data.products.pageInfo;
    for (const edge of edges) {
      const product = edge?.node;
      if (!product?.id) continue;
      const variantNodes = product.variants?.nodes || [];
      const hasVariantInCart = variantNodes.some((vn) =>
        cartVariantGids.has(normalizeText(vn?.id).toLowerCase())
      );
      if (variantNodes.length > 0 && hasVariantInCart) {
        const updRes = await runShopifyGraphql<ProductUpdateResponse>({
          shop,
          token,
          query: `mutation productUpdate($product: ProductUpdateInput!) {
            productUpdate(product: $product) {
              product { id }
              userErrors { message }
            }
          }`,
          variables: {
            product: { id: product.id, status: "ACTIVE" },
          },
          apiVersion: API_VERSION,
        });
        if (updRes.ok && !(updRes.data?.productUpdate?.userErrors?.length)) {
          activated += 1;
        }
      }
    }
    if (!pageInfo?.hasNextPage) break;
    shopifyCursor = pageInfo.endCursor || null;
    if (!shopifyCursor) break;
  }
  return { ok: true, activated };
}
