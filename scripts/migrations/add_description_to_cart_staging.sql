-- Add description column to shopify_cart_inventory_staging for Shopify product description.
-- Run this in your Postgres SQL console if you see: "column shopify_cart_inventory_staging.description does not exist"
alter table if exists shopify_cart_inventory_staging
  add column if not exists description text;
