# Shopify Mapping Inventory – Analysis & Fixes

## Problem Summary

You pushed **731 products / 4,835 items** to Shopify but in the catalog you see:

- **Fewer than 100 products**
- **No variant matrix** (size/color options)
- **No quantity** – every product shows "Inventory not tracked"

---

## Root Causes & Fixes

### 1. Inventory Not Tracked (FIXED)

**Cause:** New products were created with Shopify’s default `tracked: false`. Even when we called `inventorySetQuantities`, Shopify ignored the quantities because inventory was not tracked.

**Fix:** The app now calls `inventoryItemUpdate` with `tracked: true` for each variant before setting quantities in:

- **`lib/shopifyCartProductCreate.ts`** – when creating new products
- **`lib/cartInventoryPush.ts`** – when pushing quantities to existing products

**Result:** New pushes will enable tracking and set quantities correctly. Products should show inventory instead of "Inventory not tracked".

---

### 2. Product Creation Logic

**Flow:**

1. **Inventory matrix** (Lightspeed → Shopify) matches rows to Shopify variants by SKU/barcode and sets `cartId`.
2. **Queue Selected** sends rows to Cart Inventory staging.
3. **Push** runs `runCartPushAll`:
   - **Create products** only for parents that have at least one **unlinked** variant (no `cartId`).
   - **Update quantities** for all variants that have a `cartId` (existing Shopify variants).

**Implications:**

- If most of your 731 parents were matched in the inventory matrix and got `cartId`s from existing Shopify products, the push will mostly update quantities instead of creating new products.
- The “fewer than 100 products” you see can be due to:
  - Many parents mapping into the same Shopify product (shared SKUs).
  - Only parents with unlinked variants creating new products.
  - Existing products in Shopify that matched but weren’t visible because of filters or view settings.

---

### 3. Variant Matrix

- Each product in Shopify should have variants (size, color, etc.) defined in `productCreate` / `productUpdate`.
- `createShopifyProductFromCart` builds variants from staging data (`parent.variants`).
- If variants appear missing, possible causes:
  - Staging data has no variants (or only one).
  - Product creation failed for that parent (`createShopifyProductFromCart` returned an error).
  - Wrong Shopify product ID used (e.g. different store).

---

## Module Reference

| Module | Purpose |
|--------|---------|
| `lib/cartInventoryPush.ts` | Orchestrates push: create products, set quantities, archive removed products |
| `lib/shopifyCartProductCreate.ts` | Creates new products from staging, sets inventory tracking and quantities |
| `app/api/shopify/cart-inventory/route.ts` | API: `push-all`, `push-selected`, `stage-add` |
| `app/api/shopify/inventory-matrix/route.ts` | Matches Lightspeed items to Shopify variants, sets `cartId` |
| `lib/shopifyCartStaging.ts` | Staging table `shopify_cart_inventory_staging` |

---

## Recommended Next Steps

1. **Re-push** – Run a full push after these changes. New and updated products should now show inventory correctly.
2. **Check staging** – Inspect `shopify_cart_inventory_staging`: do parents have multiple variants and valid SKUs?
3. **Verify store** – Confirm the push targets the correct Shopify store (shop domain).
4. **Check logs** – Look for `[cart-inventory] Create product failed` or API errors during push.
