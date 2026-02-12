-- Shopify OAuth tokens
create table if not exists shopify_tokens (
  shop text primary key,
  access_token text not null,
  scope text,
  installed_at timestamptz default now()
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
