CREATE TABLE IF NOT EXISTS shopify_cart_sync_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  items_checked int NOT NULL DEFAULT 0,
  items_updated int NOT NULL DEFAULT 0,
  variants_added int NOT NULL DEFAULT 0,
  variants_deleted int NOT NULL DEFAULT 0,
  products_archived int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  error_details text,
  duration_ms int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cart_sync_activity_shop_time
  ON shopify_cart_sync_activity (shop, synced_at DESC);
