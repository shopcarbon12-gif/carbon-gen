/**
 * Create Shopify products from Cart Inventory items that don't exist in Shopify yet.
 * Uses Cart Configuration (newProductMapping, newProductRules) for field mapping.
 */
import { runShopifyGraphql } from "@/lib/shopify";
import type { StagingParent, StagingVariant } from "@/lib/shopifyCartStaging";
import { sortSizes } from "@/lib/cartInventoryPush";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

type CartConfig = {
  newProductMapping?: {
    productName?: string;
    description?: string;
    urlAndHandle?: string;
    price?: string;
    comparePrice?: string;
    barcode?: string;
    vendor?: string;
    tags?: string[];
    weight?: string;
  };
  newProductRules?: {
    productStatus?: boolean;
    inventoryManagement?: boolean;
    postVariantAsIndividual?: boolean;
  };
};

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function normLower(s: unknown): string {
  return norm(s).toLowerCase();
}

function getSelectedOptionValue(
  options: Array<{ name: string; value: string }> | undefined,
  optionName: string
): string {
  return normLower(options?.find((o) => normLower(o.name) === normLower(optionName))?.value);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 255) || `sku-${Date.now()}`;
}

function resolveField(
  mapping: string | undefined,
  parent: StagingParent,
  variant: StagingVariant | null
): string {
  const m = norm(mapping).toUpperCase();
  switch (m) {
    case "TITLE":
      return norm(parent.title) || norm(parent.sku);
    case "DESCRIPTION":
      return norm(parent.title);
    case "SKU":
      return norm(parent.sku);
    case "BRAND":
      return norm(parent.brand);
    case "CATEGORY":
      return norm(parent.category);
    case "PRICE":
      return variant?.price != null ? String(variant.price) : parent.price != null ? String(parent.price) : "0";
    case "UPC":
      return variant ? norm(variant.upc) : "";
    default:
      return "";
  }
}

function collectOptions(variants: StagingVariant[]): { name: string; values: string[] }[] {
  const colorSet = new Set<string>();
  const sizeSet = new Set<string>();
  for (const v of variants) {
    const c = norm(v.color);
    const s = norm(v.size);
    if (c) colorSet.add(c);
    if (s) sizeSet.add(s);
  }
  const options: { name: string; values: string[] }[] = [];
  if (colorSet.size > 0) options.push({ name: "Color", values: Array.from(colorSet) });
  if (sizeSet.size > 0) options.push({ name: "Size", values: sortSizes(Array.from(sizeSet)) });
  if (options.length === 0) options.push({ name: "Title", values: ["Default"] });
  return options;
}

export type CreateProductResult = {
  ok: boolean;
  productGid?: string;
  variantGids?: string[];
  error?: string;
};

export async function createShopifyProductFromCart(
  shop: string,
  token: string,
  parent: StagingParent,
  config: CartConfig,
  locationId: string
): Promise<CreateProductResult> {
  const mapping = config.newProductMapping || {};
  const rules = config.newProductRules || {};
  const firstVariant = parent.variants[0];
  const title =
    norm(mapping.productName) === "TITLE"
      ? norm(parent.title) || norm(parent.sku)
      : resolveField(mapping.productName, parent, firstVariant) || norm(parent.title) || norm(parent.sku);
  const vendor = resolveField(mapping.vendor || "Brand", parent, null) || "Unknown";
  const baseHandle =
    norm(mapping.urlAndHandle) === "SKU"
      ? slugify(parent.sku)
      : norm(mapping.urlAndHandle) === "TITLE"
        ? slugify(parent.title)
        : slugify(parent.sku);
  const priceStr = resolveField(mapping.price || "Price", parent, firstVariant);
  const price = Math.max(0, parseFloat(priceStr) || 0);
  const comparePrice = mapping.comparePrice ? parseFloat(resolveField(mapping.comparePrice, parent, firstVariant)) : null;

  const options = collectOptions(parent.variants);
  const productOptions = options.map((opt) => ({
    name: opt.name,
    values: opt.values.map((v) => ({ name: v })),
  }));

  const firstOptValues = options.map((opt) => ({
    name: opt.values[0] || opt.name,
    optionName: opt.name,
  }));

  const productType = norm(parent.category).replace(/[\\\/]/g, " >> ");

  const productInput: Record<string, unknown> = {
    title,
    vendor,
    status: "ACTIVE",
    productOptions,
    ...(productType ? { productType } : {}),
  };

  const createWithHandle = (h: string) =>
    runShopifyGraphql<{
      productCreate?: {
        userErrors?: Array<{ field?: string[]; message: string }>;
        product?: {
          id: string;
          variants?: { nodes?: Array<{ id: string }> };
        };
      };
    }>({
      shop,
      token,
      query: `mutation productCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          userErrors { field message }
          product {
            id
            variants(first: 250) { nodes { id } }
          }
        }
      }`,
      variables: {
        product: { ...productInput, ...(h ? { handle: h } : {}) },
      },
      apiVersion: API_VERSION,
    });

  let createRes = await createWithHandle(baseHandle);
  const handleError = createRes.data?.productCreate?.userErrors?.find(
    (e: { field?: string[]; message: string }) =>
      /handle.*already|already.*in use/i.test(e.message) ||
      (e.field && e.field.some((f) => /handle/i.test(String(f))))
  );
  if (handleError && baseHandle) {
    const suffix = `-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const uniqueHandle = (baseHandle.slice(0, 250 - suffix.length) + suffix)
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    createRes = await createWithHandle(uniqueHandle);
  }

  if (!createRes.ok) {
    return { ok: false, error: JSON.stringify(createRes.errors) };
  }
  const errors = createRes.data?.productCreate?.userErrors || [];
  if (errors.length > 0) {
    return { ok: false, error: errors.map((e) => e.message).join("; ") };
  }
  const product = createRes.data?.productCreate?.product;
  if (!product?.id) {
    return { ok: false, error: "productCreate did not return product" };
  }

  const productGid = product.id;
  const autoCreatedVariants = product.variants?.nodes || [];
  let variantGids: string[] = autoCreatedVariants.map((v) => v.id).filter(Boolean);

  console.log("[shopify-create] productCreate returned", autoCreatedVariants.length, "variant(s), need", parent.variants.length);

  const buildBulkUpdateInput = (varGid: string, v: StagingVariant, priceVal: number) => {
    const varSku = norm(v.sku) || undefined;
    return {
      id: varGid,
      price: String(v.price != null ? v.price : priceVal),
      ...(comparePrice != null && Number.isFinite(comparePrice) ? { compareAtPrice: String(comparePrice) } : {}),
      barcode: norm(v.upc) || undefined,
      ...(varSku ? { inventoryItem: { sku: varSku } } : {}),
    };
  };

  if (autoCreatedVariants.length >= parent.variants.length) {
    const updateInputs = parent.variants
      .slice(0, variantGids.length)
      .map((v, i) => buildBulkUpdateInput(variantGids[i], v, price));
    if (updateInputs.length > 0) {
      await runShopifyGraphql({
        shop,
        token,
        query: `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
        }`,
        variables: { productId: productGid, variants: updateInputs },
        apiVersion: API_VERSION,
      });
    }
  } else {
    if (variantGids[0] && firstVariant) {
      await runShopifyGraphql({
        shop,
        token,
        query: `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
        }`,
        variables: { productId: productGid, variants: [buildBulkUpdateInput(variantGids[0], firstVariant, price)] },
        apiVersion: API_VERSION,
      });
    }

    if (parent.variants.length > 1) {
      const toCreate = parent.variants.slice(1).map((v) => {
        const optValues = options.map((opt) => {
          const val =
            opt.name === "Color"
              ? norm(v.color) || opt.values[0]
              : opt.name === "Size"
                ? norm(v.size) || opt.values[0]
                : opt.values[0];
          return { name: val, optionName: opt.name };
        });
        const varSku = norm(v.sku) || undefined;
        return {
          optionValues: optValues,
          price: String(v.price != null ? v.price : price),
          ...(comparePrice != null ? { compareAtPrice: String(comparePrice) } : {}),
          barcode: norm(v.upc) || undefined,
          ...(varSku ? { inventoryItem: { sku: varSku } } : {}),
        };
      });

      const bulkRes = await runShopifyGraphql<{
        productVariantsBulkCreate?: {
          userErrors?: Array<{ message: string }>;
          productVariants?: Array<{ id: string }>;
        };
      }>({
        shop,
        token,
        query: `mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants) {
            userErrors { message }
            productVariants { id }
          }
        }`,
        variables: { productId: productGid, variants: toCreate },
        apiVersion: API_VERSION,
      });

      const bulkErrors = bulkRes.data?.productVariantsBulkCreate?.userErrors || [];
      if (bulkErrors.length > 0) {
        console.warn("[shopify-create] productVariantsBulkCreate errors:", bulkErrors.map((e: { message: string }) => e.message));
      }
      if (bulkRes.ok && bulkRes.data?.productVariantsBulkCreate?.productVariants) {
        for (const pv of bulkRes.data.productVariantsBulkCreate.productVariants) {
          if (pv?.id) variantGids.push(pv.id);
        }
      }

      if (variantGids.length < parent.variants.length) {
        console.log("[shopify-create] Re-fetching variants after bulk create...");
        const refetchRes = await runShopifyGraphql<{
          product?: { variants?: { nodes?: Array<{ id: string }> } };
        }>({
          shop,
          token,
          query: `query($id: ID!) { product(id: $id) { variants(first: 250) { nodes { id } } } }`,
          variables: { id: productGid },
          apiVersion: API_VERSION,
        });
        const allVars = refetchRes.ok ? refetchRes.data?.product?.variants?.nodes || [] : [];
        if (allVars.length >= parent.variants.length) {
          variantGids = allVars.map((v) => v.id).filter(Boolean);
          const updateBatch = parent.variants
            .slice(1)
            .map((v, i) => {
              const idx = i + 1;
              return idx < variantGids.length ? buildBulkUpdateInput(variantGids[idx], v, price) : null;
            })
            .filter(Boolean) as Array<Record<string, unknown>>;
          if (updateBatch.length > 0) {
            await runShopifyGraphql({
              shop,
              token,
              query: `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
              }`,
              variables: { productId: productGid, variants: updateBatch },
              apiVersion: API_VERSION,
            });
          }
        }
      }
    }
  }

  if (rules.productStatus === true) {
    const unpubRes = await runShopifyGraphql<{
      publishableUnpublish?: { userErrors?: Array<{ message: string }> };
    }>({
      shop,
      token,
      query: `mutation unpublish($id: ID!) {
        publishableUnpublish(id: $id) {
          userErrors { message }
        }
      }`,
      variables: { id: productGid },
      apiVersion: API_VERSION,
    });
  }

  // Enforce deterministic size ordering after create/add-variants.
  // This prevents Shopify's internal option ordering from scrambling sizes.
  const optionsRes = await runShopifyGraphql<{
    product?: {
      options?: Array<{ name: string; values?: string[] }>;
    };
  }>({
    shop,
    token,
    query: `query($id: ID!) {
      product(id: $id) {
        options { name values }
      }
    }`,
    variables: { id: productGid },
    apiVersion: API_VERSION,
  });

  const shopOptions = optionsRes.ok ? optionsRes.data?.product?.options || [] : [];
  const sizeOption = shopOptions.find((o) => normLower(o.name) === "size");
  if (sizeOption && Array.isArray(sizeOption.values) && sizeOption.values.length > 1) {
    const current = sizeOption.values.map((v) => norm(v)).filter(Boolean);
    const sorted = sortSizes(current);
    const needsReorder = sorted.length === current.length && sorted.some((value, index) => value !== current[index]);
    if (needsReorder) {
      const reorderOptions = shopOptions.map((o) => {
        const values = Array.isArray(o.values) ? o.values.map((v) => norm(v)).filter(Boolean) : [];
        const orderedValues = normLower(o.name) === "size" ? sorted : values;
        return {
          name: o.name,
          values: orderedValues.map((value) => ({ name: value })),
        };
      });
      await runShopifyGraphql({
        shop,
        token,
        query: `mutation reorderOptions($productId: ID!, $options: [OptionReorderInput!]!) {
          productOptionsReorder(productId: $productId, options: $options) {
            userErrors { message }
          }
        }`,
        variables: { productId: productGid, options: reorderOptions },
        apiVersion: API_VERSION,
      });
    }
  }

  // Re-map Shopify variant IDs to cart variant order by identity (SKU first, then Color+Size),
  // so size rows never receive the wrong SKU/cartId due to Shopify option sorting.
  const mapRes = await runShopifyGraphql<{
    product?: {
      variants?: {
        nodes?: Array<{
          id: string;
          sku?: string | null;
          selectedOptions?: Array<{ name: string; value: string }>;
        }>;
      };
    };
  }>({
    shop,
    token,
    query: `query($id: ID!) {
      product(id: $id) {
        variants(first: 250) {
          nodes { id sku selectedOptions { name value } }
        }
      }
    }`,
    variables: { id: productGid },
    apiVersion: API_VERSION,
  });

  const mappedVariantGids = (() => {
    const shopVariants =
      mapRes.ok && mapRes.data?.product?.variants?.nodes
        ? mapRes.data.product.variants.nodes
        : [];
    if (shopVariants.length < 1) return variantGids;

    const used = new Set<string>();
    const bySku = new Map<string, string>();
    for (const sv of shopVariants) {
      const sku = normLower(sv?.sku);
      if (sku && sv?.id) bySku.set(sku, sv.id);
    }

    const mapped = parent.variants.map((v) => {
      const sku = normLower(v.sku);
      if (sku) {
        const id = bySku.get(sku);
        if (id) {
          used.add(id);
          return id;
        }
      }

      const color = normLower(v.color);
      const size = normLower(v.size);
      const byOptions = shopVariants.find((sv) => {
        if (!sv?.id || used.has(sv.id)) return false;
        const svColor = getSelectedOptionValue(sv.selectedOptions, "Color");
        const svSize = getSelectedOptionValue(sv.selectedOptions, "Size");
        if (color && size) return svColor === color && svSize === size;
        if (color) return svColor === color;
        if (size) return svSize === size;
        return false;
      });
      if (byOptions?.id) {
        used.add(byOptions.id);
        return byOptions.id;
      }
      return "";
    });

    const matchedCount = mapped.filter(Boolean).length;
    if (matchedCount > 0) return mapped;
    return variantGids;
  })();

  variantGids = mappedVariantGids;

  const quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number }> = [];
  for (let i = 0; i < parent.variants.length && i < variantGids.length; i++) {
    const v = parent.variants[i];
    const variantGid = variantGids[i];
    if (!variantGid) continue;
    const invRes = await runShopifyGraphql<{
      productVariant?: { inventoryItem?: { id: string } };
    }>({
      shop,
      token,
      query: `query($id: ID!) { productVariant(id: $id) { inventoryItem { id } } }`,
      variables: { id: variantGid },
      apiVersion: API_VERSION,
    });
    const invItemId = invRes.ok ? invRes.data?.productVariant?.inventoryItem?.id : null;
    if (invItemId) {
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
      const qty = typeof v.stock === "number" && Number.isFinite(v.stock) ? Math.max(0, Math.round(v.stock)) : 0;
      quantities.push({ inventoryItemId: invItemId, locationId, quantity: qty });
    }
  }

  if (quantities.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < quantities.length; i += BATCH) {
      const batch = quantities.slice(i, i + BATCH);
      await runShopifyGraphql({
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
              compareQuantity: null,
            })),
          },
        },
        apiVersion: API_VERSION,
      });
    }
  }

  return { ok: true, productGid, variantGids };
}
