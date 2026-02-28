-- Tracks Shopify orders synced to Lightspeed to prevent duplicate processing.
CREATE TABLE IF NOT EXISTS shopify_order_sync_log (
  shopify_order_id  BIGINT PRIMARY KEY,
  shopify_order_name TEXT NOT NULL DEFAULT '',
  ls_sale_id        TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  error_message     TEXT,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_sync_log_status ON shopify_order_sync_log (status);
CREATE INDEX IF NOT EXISTS idx_order_sync_log_processed ON shopify_order_sync_log (processed_at);
