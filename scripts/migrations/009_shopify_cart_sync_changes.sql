CREATE TABLE IF NOT EXISTS shopify_cart_sync_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_id uuid REFERENCES shopify_cart_sync_activity(id) ON DELETE CASCADE,
  parent_id text NOT NULL,
  product_title text,
  variant_sku text,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_sync_changes_sync_id
  ON shopify_cart_sync_changes (sync_id);

CREATE INDEX IF NOT EXISTS idx_cart_sync_changes_time
  ON shopify_cart_sync_changes (changed_at DESC);
