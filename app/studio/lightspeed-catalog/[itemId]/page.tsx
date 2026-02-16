import LightspeedCatalogItemPage from "@/components/lightspeed-catalog-item-page";

export default async function StudioLightspeedCatalogItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <LightspeedCatalogItemPage itemId={itemId} />;
}
