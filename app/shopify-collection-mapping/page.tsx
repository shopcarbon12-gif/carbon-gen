import ShopifyCollectionMapping from "@/components/shopify-collection-mapping";
import { notFound } from "next/navigation";

export default function ShopifyCollectionMappingPage() {
  const disabledByEnv =
    process.env.NODE_ENV === "production" &&
    String(process.env.DISABLE_SHOPIFY_COLLECTION_MAPPING || "").trim().toLowerCase() === "true";
  if (disabledByEnv) {
    notFound();
  }

  return (
    <div
      className="collection-mapping-route collection-mapping-standalone-route"
      style={{
        ["--collection-mapping-shell-content-top-offset" as "--collection-mapping-shell-content-top-offset"]: "70px",
        marginTop: "-30px",
      }}
    >
      <ShopifyCollectionMapping />
    </div>
  );
}
