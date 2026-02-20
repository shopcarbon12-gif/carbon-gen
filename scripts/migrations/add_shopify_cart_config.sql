-- Shopify cart config (shop-level settings for cart mapping).
-- Run in Supabase SQL editor if cart config saves don't persist:
--   https://supabase.com/dashboard/project/YOUR_PROJECT/sql
create table if not exists shopify_cart_config (
  shop text primary key,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
