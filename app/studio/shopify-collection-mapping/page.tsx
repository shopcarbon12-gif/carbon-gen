import ShopifyCollectionMapping from "@/components/shopify-collection-mapping";
import { notFound } from "next/navigation";

export default function ShopifyCollectionMappingPage() {
  const enabledInProd =
    String(process.env.ENABLE_SHOPIFY_COLLECTION_MAPPING || "").trim().toLowerCase() === "true";

  if (process.env.NODE_ENV === "production" && !enabledInProd) {
    notFound();
  }

  return <ShopifyCollectionMapping />;
}
