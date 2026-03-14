#!/usr/bin/env node
/**
 * Restore the mega menu from the seed structure.
 * Replaces the current Shopify main-menu with the full structure from DEFAULT_MENU_NODES,
 * including MEN > CLOTHING > SHIRT SHOP and all other expected items.
 *
 * Usage: node scripts/restore-mega-menu.mjs
 * Requires: SHOP env or defaults to 30e7d3.myshopify.com
 */
const api = process.env.API_URL || "https://app.shopcarbon.com/api/shopify/collection-mapping";
const shop = process.env.SHOP || "30e7d3.myshopify.com";

async function restore() {
  const res = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "restore-mega-menu-from-seed",
      shop,
      menuHandle: "main-menu",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    console.error("Restore failed:", json?.error || res.statusText);
    process.exit(1);
  }
  console.log("Mega menu restored successfully.");
  console.log("Nodes:", json.nodeCount);
  console.log("Menu:", json.menu?.handle || "main-menu");
}

restore().catch((err) => {
  console.error(err);
  process.exit(1);
});
