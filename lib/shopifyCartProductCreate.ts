/**
 * Create Shopify products from Cart Inventory items that don't exist in Shopify yet.
 * Uses Cart Configuration (newProductMapping, newProductRules) for field mapping.
 */
import { runShopifyGraphql } from "@/lib/shopify";
import type { StagingParent, StagingVariant } from "@/lib/shopifyCartStaging";

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
  if (sizeSet.size > 0) options.push({ name: "Size", values: Array.from(sizeSet) });
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
  const handle =
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

  const productInput: Record<string, unknown> = {
    title,
    vendor,
    status: "ACTIVE",
    productOptions,
  };
  if (handle) productInput.handle = handle;

  const createRes = await runShopifyGraphql<{
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
      product: productInput,
    },
    apiVersion: API_VERSION,
  });

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
  const existingVariants = product.variants?.nodes || [];
  const variantGids: string[] = existingVariants.map((v) => v.id).filter(Boolean);

  if (variantGids[0] && firstVariant) {
    await runShopifyGraphql({
      shop,
      token,
      query: `mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          userErrors { message }
        }
      }`,
      variables: {
        input: {
          id: variantGids[0],
          price: String(price),
          ...(comparePrice != null && Number.isFinite(comparePrice) ? { compareAtPrice: String(comparePrice) } : {}),
          sku: norm(firstVariant.sku) || undefined,
          barcode: mapping.barcode === "UPC" ? norm(firstVariant.upc) || undefined : undefined,
        },
      },
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
      return {
        optionValues: optValues,
        price: String(v.price != null ? v.price : price),
        ...(comparePrice != null ? { compareAtPrice: String(comparePrice) } : {}),
        sku: norm(v.sku) || undefined,
        barcode: mapping.barcode === "UPC" ? norm(v.upc) || undefined : undefined,
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

    if (bulkRes.ok && bulkRes.data?.productVariantsBulkCreate?.productVariants) {
      for (const pv of bulkRes.data.productVariantsBulkCreate.productVariants) {
        if (pv?.id) variantGids.push(pv.id);
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

  const quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number }> = [];
  for (let i = 0; i < parent.variants.length && i < variantGids.length; i++) {
    const v = parent.variants[i];
    const variantGid = variantGids[i];
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
