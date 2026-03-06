-- Shopify cart config (shop-level settings for cart mapping).
-- Run in your Postgres SQL console if cart config saves don't persist.
create table if not exists shopify_cart_config (
  shop text primary key,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
