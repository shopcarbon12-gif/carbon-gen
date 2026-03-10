import ShopifyCollectionMapping from "@/components/shopify-collection-mapping";
import { notFound } from "next/navigation";

export default function ShopifyCollectionMappingPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ShopifyCollectionMapping />;
}
