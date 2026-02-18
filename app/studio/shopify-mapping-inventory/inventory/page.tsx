"use client";

import dynamic from "next/dynamic";

const ShopifyMappingInventory = dynamic(
  () => import("@/components/shopify-mapping-inventory"),
  { ssr: false }
);

export default function StudioShopifyMappingInventoryInventoryPage() {
  return <ShopifyMappingInventory />;
}
