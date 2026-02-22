/**
 * Shared push logic for Cart Inventory → Shopify.
 * Used by both the cart-inventory API route and the cron sync.
 */
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import {
  listCartCatalogParents,
  updateCartCatalogStatus,
  upsertCartCatalogParents,
  type StagingParent,
} from "@/lib/shopifyCartStaging";
import { sendPushNotificationEmail } from "@/lib/email";
import { createShopifyProductFromCart } from "@/lib/shopifyCartProductCreate";

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
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();
    const dbToken = !error ? normalizeText((data as { access_token?: string } | null)?.access_token) : "";
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
  } = {}
): Promise<CartPushResult> {
  const notificationEmail = options.notificationEmail ?? null;

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
  let variantsLinkedByTitle = 0;
  let variantsAddedToExisting = 0;
  const addVariantErrors: string[] = [];

  for (const parent of toPush) {
    let staleCleaned = false;
    for (const v of parent.variants) {
      const cid = normalizeText(v.cartId);
      if (!cid) continue;
      const vGid = cid.startsWith("gid://") ? cid
        : `gid://shopify/ProductVariant/${cid.includes("~") ? cid.split("~")[1] || cid : cid}`;
      const sc = await runShopifyGraphql<{
        productVariant?: { product?: { status?: string } } | null;
      }>({
        shop, token,
        query: `query($id: ID!) { productVariant(id: $id) { product { status } } }`,
        variables: { id: vGid },
        apiVersion: API_VERSION,
      });
      const ps = normalizeLower(sc.data?.productVariant?.product?.status);
      if (!sc.ok || !sc.data?.productVariant || ps === "archived" || ps === "draft") {
        console.log("[cart-inventory] Clearing stale cartId", cid, "for variant", v.id, "(product status:", ps || "not found", ")");
        v.cartId = "";
        staleCleaned = true;
        staleLinksCleared += 1;
      }
    }
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
        let exactMatch = nodes?.find(
          (n) =>
            n &&
            (normalizeLower(n.sku) === normalizeLower(sku) || normalizeText(n.barcode) === normalizeText(upc))
        );
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
          const containsMatch = broadNodes?.find(
            (n) => n && (normalizeLower(n.sku || "").includes(normalizeLower(sku)) || normalizeLower(sku).includes(normalizeLower(n.sku || "")))
          );
          if (containsMatch) nodes = broadNodes || [];
          exactMatch = nodes?.find(
            (n) =>
              n &&
              (normalizeLower(n.sku || "").includes(normalizeLower(sku)) || normalizeLower(sku).includes(normalizeLower(n.sku || "")) || normalizeText(n.barcode) === normalizeText(upc))
          );
        }
        const match = exactMatch || nodes?.[0];
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
      const unlinked = parent.variants.filter((v) => !normalizeText(v.cartId));
      if (unlinked.length === 0) continue;
      const parentTitle = normalizeText(parent.title);
      if (!parentTitle || parentTitle.length < 3) continue;
      const titleQuery = (() => {
        const firstWord = parentTitle.trim().split(/\s+/)[0] || "";
        const titlePart = firstWord.length >= 2 ? `title:${firstWord.replace(/"/g, '\\"')}*` : `title:${parentTitle.slice(0, 30).replace(/"/g, '\\"')}`;
        return `${titlePart} status:active`;
      })();
      const prodRes = await runShopifyGraphql<{ products?: { edges?: Array<{ node?: { id: string; title: string; status?: string; variants?: { nodes?: Array<{ id: string; sku?: string; selectedOptions?: Array<{ name: string; value: string }> }> } } }> } }>({
        shop,
        token,
        query: `query($q: String!) {
          products(first: 5, query: $q) {
            edges { node {
              id title status
              variants(first: 100) { nodes { id sku selectedOptions { name value } } }
            } }
          }
        }`,
        variables: { q: titleQuery },
        apiVersion: API_VERSION,
      });
      const productEdges = prodRes.ok ? prodRes.data?.products?.edges : [];
      const activeProducts = (productEdges || [])
        .map((e) => e?.node)
        .filter((n): n is NonNullable<typeof n> => !!n && normalizeLower(n.status) === "active");
      const productNode = activeProducts[0];
      const shopifyVariants = productNode?.variants?.nodes || [];
      if (shopifyVariants.length === 0) continue;
      const matchedShopifyIds = new Set<string>();
      let linked = 0;
      for (const v of unlinked) {
        const ourSize = normalizeLower(normalizeText(v.size));
        const ourColor = normalizeLower(normalizeText(v.color));
        const ourSku = normalizeLower(normalizeText(v.sku) || normalizeText(parent.sku));
        const shopMatch = shopifyVariants.find((sv) => {
          if (matchedShopifyIds.has(sv.id)) return false;
          if (ourSku && normalizeLower(sv.sku || "") === ourSku) return true;
          const optSize = normalizeLower(sv.selectedOptions?.find((o) => normalizeLower(o.name) === "size")?.value || "");
          const optColor = normalizeLower(sv.selectedOptions?.find((o) => normalizeLower(o.name) === "color")?.value || "");
          if (ourSize && ourColor) return optSize === ourSize && optColor === ourColor;
          if (ourSize) return optSize === ourSize;
          if (ourColor) return optColor === ourColor;
          return false;
        });
        if (shopMatch?.id) {
          matchedShopifyIds.add(shopMatch.id);
          const numericId = shopMatch.id.replace(/^gid:\/\/shopify\/ProductVariant\//, "");
          v.cartId = numericId || shopMatch.id;
          variantsLinkedFromSearch += 1;
          variantsLinkedByTitle += 1;
          linked += 1;
        }
      }
      if (linked > 0) {
        const updatedParent: StagingParent = { ...parent, variants: [...parent.variants] };
        await upsertCartCatalogParents(shop, [updatedParent]);
      }
    }
  } catch (linkErr) {
    console.warn("[cart-inventory] Link-existing phase:", (linkErr as Error)?.message);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: configRow } = await supabase
      .from("shopify_cart_config")
      .select("config")
      .eq("shop", shopKey)
      .maybeSingle();
    const config = (configRow?.config as Record<string, unknown>) || {};
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
              }
            }
          }`,
          variables: { id: existingGid },
          apiVersion: API_VERSION,
        });
        const existingProductGid = prodLookup.ok ? prodLookup.data?.productVariant?.product?.id : null;
        const existingStatus = normalizeLower(prodLookup.data?.productVariant?.product?.status);
        const shopifyOptions = prodLookup.data?.productVariant?.product?.options || [];

        if (existingProductGid && existingStatus === "active") {
          console.log("[cart-inventory] Adding", unlinked.length, "missing variant(s) to existing product", existingProductGid, "options:", JSON.stringify(shopifyOptions.map((o: { name: string }) => o.name)));

          type ShopOpt = { name: string; optionValues?: Array<{ name: string }> };
          const colorOptionName = shopifyOptions.find((o: ShopOpt) => normalizeLower(o.name) === "color")?.name || "Color";
          const sizeOptionName = shopifyOptions.find((o: ShopOpt) => normalizeLower(o.name) === "size")?.name || "Size";
          const hasColorOption = shopifyOptions.some((o: ShopOpt) => normalizeLower(o.name) === "color");
          const hasSizeOption = shopifyOptions.some((o: ShopOpt) => normalizeLower(o.name) === "size");

          const toAdd = unlinked.map((v) => {
            const optValues: Array<{ name: string; optionName: string }> = [];
            if (hasColorOption) {
              optValues.push({ name: normalizeText(v.color) || "Default", optionName: colorOptionName });
            }
            if (hasSizeOption) {
              optValues.push({ name: normalizeText(v.size) || "Default", optionName: sizeOptionName });
            }
            if (optValues.length === 0) {
              optValues.push({ name: normalizeText(v.color) || normalizeText(v.size) || "Default", optionName: shopifyOptions[0]?.name || "Title" });
            }
            const varSku = normalizeText(v.sku) || undefined;
            return {
              optionValues: optValues,
              price: String(v.price != null ? v.price : parent.price ?? 0),
              barcode: normalizeText(v.upc) || undefined,
              ...(varSku ? { inventoryItem: { sku: varSku } } : {}),
            };
          });

          const addRes = await runShopifyGraphql<{
            productVariantsBulkCreate?: {
              userErrors?: Array<{ message: string; field?: string[] }>;
              productVariants?: Array<{ id: string }>;
            };
          }>({
            shop,
            token,
            query: `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkCreate(productId: $productId, variants: $variants) {
                userErrors { field message }
                productVariants { id }
              }
            }`,
            variables: { productId: existingProductGid, variants: toAdd },
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

          const newVarGids = addRes.ok && addRes.data?.productVariantsBulkCreate?.productVariants
            ? addRes.data.productVariantsBulkCreate.productVariants.map((pv) => pv.id).filter(Boolean)
            : [];
          variantsAddedToExisting += newVarGids.length;
          debugSteps.push({
            step: "add-variants",
            detail: `product=${existingProductGid} options=[${shopifyOptions.map((o: ShopOpt) => o.name).join(",")}] attempted=${unlinked.length} created=${newVarGids.length} errors=${addErrors.length} ok=${addRes.ok}`,
          });

          let gidIdx = 0;
          for (const v of parent.variants) {
            if (!normalizeText(v.cartId) && gidIdx < newVarGids.length) {
              v.cartId = newVarGids[gidIdx];
              gidIdx++;
            }
          }
          if (gidIdx > 0) {
            await upsertCartCatalogParents(shop, [{ ...parent }]);
          }
          continue;
        } else {
          debugSteps.push({ step: "add-variants-skip", detail: `product=${existingProductGid || "not found"} status=${existingStatus || "unknown"} — cannot add to non-active product` });
        }
      }

      const result = await createShopifyProductFromCart(shop, token, parent, cartConfig, locationId);
      if (!result.ok || !result.productGid || !result.variantGids?.length) {
        console.warn("[cart-inventory] Create product failed:", parent.sku, result.error);
        continue;
      }

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

  const productGidsUpdated = new Set<string>();

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
          inventoryItem?: { id: string };
          product?: {
            id: string;
            status?: string;
            productType?: string;
            vendor?: string;
            options?: Array<{ name: string; values: string[] }>;
          };
        };
      }>({
        shop,
        token,
        query: `query($id: ID!) { productVariant(id: $id) { id sku barcode inventoryItem { id } product { id status productType vendor options { name values } } } }`,
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

      const cartSku = normalizeText(v.sku) || normalizeText(parent.sku);
      const cartUpc = normalizeText(v.upc);
      const shopSku = normalizeText(shopVariant?.sku);
      const shopBarcode = normalizeText(shopVariant?.barcode);
      const variantUpdate: Record<string, string> = {};
      if (cartSku && !shopSku) variantUpdate.sku = cartSku;
      if (cartUpc && !shopBarcode) variantUpdate.barcode = cartUpc;

      const shopProductGid = shopVariant?.product?.id || "";

      if (Object.keys(variantUpdate).length > 0 && shopProductGid) {
        const bulkVariantInput: Record<string, unknown> = { id: variantGid };
        if (variantUpdate.barcode) bulkVariantInput.barcode = variantUpdate.barcode;
        if (variantUpdate.sku) bulkVariantInput.inventoryItem = { sku: variantUpdate.sku };

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
          debugSteps.push({ step: "variant-update-error", detail: `variant=${variantGid} ok=${vUpdateRes.ok} updates=${JSON.stringify(variantUpdate)} errors=${JSON.stringify(vUpdateErrors.map((e: { message: string }) => e.message))}` });
        } else {
          debugSteps.push({ step: "variant-update", detail: `variant=${variantGid} updated: ${Object.keys(variantUpdate).join(",")}` });
        }
      }
      if (shopProductGid && !productGidsUpdated.has(shopProductGid)) {
        productGidsUpdated.add(shopProductGid);
        const cartCategory = normalizeText(parent.category);
        const cartBrand = normalizeText(parent.brand);
        const shopType = normalizeText(shopVariant?.product?.productType);
        const shopVendorLower = normalizeLower(shopVariant?.product?.vendor);
        const productUpdate: Record<string, string> = { id: shopProductGid };
        const formattedCategory = cartCategory.replace(/[\\\/]/g, " >> ");
        const shopTypeNeedsFormat = shopType && /[\\\/]/.test(shopType);
        if (formattedCategory && (!shopType || shopTypeNeedsFormat)) productUpdate.productType = formattedCategory;
        if (cartBrand && (!shopVendorLower || shopVendorLower === "default" || shopVendorLower === "unknown")) productUpdate.vendor = cartBrand;

        if (Object.keys(productUpdate).length > 1) {
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
            debugSteps.push({ step: "product-update-error", detail: `product=${shopProductGid} ok=${pUpdateRes.ok} updates=${JSON.stringify(productUpdate)} errors=${JSON.stringify(pUpdateErrors.map((e: { message: string }) => e.message))}` });
          } else {
            debugSteps.push({ step: "product-update", detail: `product=${shopProductGid} updated: ${Object.keys(productUpdate).filter((k) => k !== "id").join(",")}` });
          }
        } else {
          debugSteps.push({ step: "product-update-skip", detail: `product=${shopProductGid} cartCategory="${cartCategory}" shopType="${shopType}" cartBrand="${cartBrand}" shopVendor="${shopVendorLower}" — no fields to update` });
        }

        const shopOptions = shopVariant?.product?.options || [];
        const sizeOption = shopOptions.find((o: { name: string }) => normalizeLower(o.name) === "size");
        if (sizeOption && sizeOption.values.length > 1) {
          const sorted = sortSizes(sizeOption.values);
          const needsReorder = sorted.some((val, i) => val !== sizeOption.values[i]);
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
        variables: { id: invItemId, input: { tracked: true } },
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
    }
  }
  removedFromShopify += archivedNotInCart;

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
            variantsLinkedByTitle,
            variantsAddedToExisting,
            variantsSkippedNoCartId,
            variantsSkippedNoInvItem,
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
                  : variantsSkippedNoCartId > 0
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
