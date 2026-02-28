CREATE TABLE IF NOT EXISTS customer_ls_history (
  id            bigint generated always as identity primary key,
  shopify_email text NOT NULL UNIQUE,
  ls_customer_id text,
  sales_json    jsonb NOT NULL DEFAULT '[]'::jsonb,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_ls_history_email
  ON customer_ls_history (shopify_email);
