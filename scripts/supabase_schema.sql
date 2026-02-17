-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- Shopify OAuth tokens
create table if not exists shopify_tokens (
  shop text primary key,
  access_token text not null,
  scope text,
  installed_at timestamptz default now()
);

-- App users (local auth + roles)
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'manager', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Role definitions (admin-managed)
create table if not exists app_roles (
  name text primary key,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Role -> permission matrix
create table if not exists app_role_permissions (
  role_name text not null references app_roles(name) on delete cascade,
  permission_key text not null,
  allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_name, permission_key)
);

-- Dropbox OAuth tokens (per app user/session user id)
create table if not exists dropbox_tokens (
  user_id text primary key,
  refresh_token text not null,
  account_id text,
  email text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Models
create table if not exists models (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null default gen_random_uuid(),
  user_id text not null,
  name text not null,
  gender text not null,
  ref_image_urls text[] default '{}',
  created_at timestamptz default now()
);

-- Sessions
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  shop text,
  product_id text,
  product_handle text,
  item_type text,
  item_ref_urls text[] default '{}',
  seo_title text,
  seo_description text,
  created_at timestamptz default now()
);

-- Generations
create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  panel_index int not null,
  pose_a int not null,
  pose_b int not null,
  prompt text,
  image_url text,
  status text default 'pending',
  attempts int default 0,
  created_at timestamptz default now()
);

-- Shopify sync logs
create table if not exists shopify_sync (
  id uuid primary key default gen_random_uuid(),
  shop text,
  product_id text,
  media_id text,
  variant_id text,
  alt_text text,
  status text default 'synced',
  created_at timestamptz default now()
);

-- SEO jobs (batch/single)
create table if not exists seo_jobs (
  id uuid primary key default gen_random_uuid(),
  shop text,
  product_id text,
  seo_title text,
  seo_description text,
  alt_text text,
  status text default 'pending',
  created_at timestamptz default now()
);

-- Cart inventory staging (module catalog copy before Shopify push)
create table if not exists shopify_cart_inventory_staging (
  id uuid primary key default gen_random_uuid(),
  shop text not null,
  parent_id text not null,
  parent_sku text not null,
  title text not null,
  category text,
  brand text,
  stock numeric,
  price numeric,
  image text,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSED', 'ERROR')),
  error_message text,
  variants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop, parent_id)
);

-- Backward-compatible migration for older staging table shapes.
alter table if exists shopify_cart_inventory_staging
  add column if not exists id uuid;
alter table if exists shopify_cart_inventory_staging
  add column if not exists shop text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists parent_id text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists parent_sku text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists title text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists category text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists brand text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists stock numeric;
alter table if exists shopify_cart_inventory_staging
  add column if not exists price numeric;
alter table if exists shopify_cart_inventory_staging
  add column if not exists image text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists status text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists error_message text;
alter table if exists shopify_cart_inventory_staging
  add column if not exists variants jsonb;
alter table if exists shopify_cart_inventory_staging
  add column if not exists created_at timestamptz;
alter table if exists shopify_cart_inventory_staging
  add column if not exists updated_at timestamptz;

update shopify_cart_inventory_staging
set
  id = coalesce(id, gen_random_uuid()),
  shop = coalesce(nullif(btrim(shop), ''), '__default_shop__'),
  parent_id = coalesce(nullif(btrim(parent_id), ''), encode(gen_random_bytes(8), 'hex')),
  parent_sku = coalesce(nullif(btrim(parent_sku), ''), nullif(btrim(parent_id), ''), 'UNKNOWN'),
  title = coalesce(nullif(btrim(title), ''), nullif(btrim(parent_sku), ''), 'Untitled'),
  status = case
    when upper(coalesce(nullif(btrim(status), ''), 'PENDING')) in ('PENDING', 'PROCESSED', 'ERROR')
      then upper(coalesce(nullif(btrim(status), ''), 'PENDING'))
    else 'PENDING'
  end,
  variants = coalesce(variants, '[]'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table if exists shopify_cart_inventory_staging
  alter column shop set default '__default_shop__';
alter table if exists shopify_cart_inventory_staging
  alter column id set default gen_random_uuid();
alter table if exists shopify_cart_inventory_staging
  alter column id set not null;
alter table if exists shopify_cart_inventory_staging
  alter column shop set not null;
alter table if exists shopify_cart_inventory_staging
  alter column parent_id set not null;
alter table if exists shopify_cart_inventory_staging
  alter column parent_sku set not null;
alter table if exists shopify_cart_inventory_staging
  alter column title set not null;
alter table if exists shopify_cart_inventory_staging
  alter column status set default 'PENDING';
alter table if exists shopify_cart_inventory_staging
  alter column status set not null;
alter table if exists shopify_cart_inventory_staging
  alter column variants set default '[]'::jsonb;
alter table if exists shopify_cart_inventory_staging
  alter column variants set not null;
alter table if exists shopify_cart_inventory_staging
  alter column created_at set default now();
alter table if exists shopify_cart_inventory_staging
  alter column created_at set not null;
alter table if exists shopify_cart_inventory_staging
  alter column updated_at set default now();
alter table if exists shopify_cart_inventory_staging
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopify_cart_inventory_staging_status_check'
  ) then
    alter table shopify_cart_inventory_staging
      add constraint shopify_cart_inventory_staging_status_check
      check (status in ('PENDING', 'PROCESSED', 'ERROR'));
  end if;
end
$$;

-- Keep one row per (shop,parent_id) before creating/upholding unique key.
with ranked as (
  select
    ctid,
    row_number() over (
      partition by shop, parent_id
      order by updated_at desc nulls last, created_at desc nulls last, ctid desc
    ) as rn
  from shopify_cart_inventory_staging
)
delete from shopify_cart_inventory_staging s
using ranked r
where s.ctid = r.ctid
  and r.rn > 1;

create unique index if not exists idx_shopify_cart_inventory_staging_shop_parent_id
  on shopify_cart_inventory_staging (shop, parent_id);

create index if not exists idx_shopify_cart_inventory_staging_shop
  on shopify_cart_inventory_staging (shop);

create index if not exists idx_shopify_cart_inventory_staging_status
  on shopify_cart_inventory_staging (status);

create or replace function shopify_cart_inventory_staging_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_shopify_cart_inventory_staging_touch_updated_at
  on shopify_cart_inventory_staging;

create trigger trg_shopify_cart_inventory_staging_touch_updated_at
before update on shopify_cart_inventory_staging
for each row
execute function shopify_cart_inventory_staging_touch_updated_at();
