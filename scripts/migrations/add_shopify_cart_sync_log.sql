-- Persists stage-add batches so Compare works across server instances.
-- Run this if the table doesn't exist yet: psql $DATABASE_URL -f scripts/migrations/add_shopify_cart_sync_log.sql
create table if not exists shopify_cart_sync_log (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  action text not null default 'stage-add',
  parent_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shopify_cart_sync_log_shop_created
  on shopify_cart_sync_log (shop, created_at desc);
