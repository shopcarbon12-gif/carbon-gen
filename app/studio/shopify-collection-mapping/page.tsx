import ShopifyCollectionMapping from "@/components/shopify-collection-mapping";
import { notFound } from "next/navigation";

export default function ShopifyCollectionMappingPage() {
  const disabledByEnv =
    String(process.env.DISABLE_SHOPIFY_COLLECTION_MAPPING || "").trim().toLowerCase() === "true";
  if (disabledByEnv) {
    notFound();
  }

  return (
    <div className="collection-mapping-route">
      <ShopifyCollectionMapping />
    </div>
  );
}
