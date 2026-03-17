import ShopifyCollectionMapping from "@/components/shopify-collection-mapping";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

export default function ShopifyCollectionMappingPage() {
  const disabledByEnv =
    process.env.NODE_ENV === "production" &&
    String(process.env.DISABLE_SHOPIFY_COLLECTION_MAPPING || "").trim().toLowerCase() === "true";
  if (disabledByEnv) {
    notFound();
  }

  const standaloneRouteStyle = {
    "--collection-mapping-shell-content-top-offset": "70px",
    marginTop: "-30px",
  } as CSSProperties;

  return (
    <div
      className="collection-mapping-route collection-mapping-standalone-route"
      style={standaloneRouteStyle}
    >
      <ShopifyCollectionMapping />
    </div>
  );
}
