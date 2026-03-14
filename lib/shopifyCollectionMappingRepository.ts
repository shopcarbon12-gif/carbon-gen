import { randomUUID } from "node:crypto";
import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";
import { normalizeShopDomain } from "@/lib/shopify";

export type CollectionOption = {
  id: string;
  title: string;
  handle: string;
  productsCount: number | null;
};

export type MenuNodeRecord = {
  nodeKey: string;
  label: string;
  parentKey: string | null;
  depth: number;
  sortOrder: number;
  enabled: boolean;
  collectionId: string | null;
  collectionTitle: string | null;
  collectionHandle: string | null;
  defaultCollectionHandle: string | null;
  updatedAt: string | null;
};

type MenuNodeSeed = {
  key: string;
  label: string;
  parentKey: string | null;
  depth: number;
  sortOrder: number;
  defaultCollectionHandle?: string;
};

type PersistedNodeRow = {
  node_key: string;
  label: string;
  parent_key: string | null;
  depth: number;
  sort_order: number;
  enabled: boolean;
  collection_id: string | null;
  collection_title: string | null;
  collection_handle: string | null;
  default_collection_handle: string | null;
  updated_at: string | null;
};

type ToggleAuditInput = {
  shop: string;
  productId: string;
  productTitle: string;
  nodeKey: string;
  checked: boolean;
  addedCollectionIds: string[];
  removedCollectionIds: string[];
  status: "ok" | "error";
  errorMessage?: string;
};

export type LiveMenuNodeInput = {
  nodeKey: string;
  label: string;
  parentKey: string | null;
  depth: number;
  sortOrder: number;
  collectionIdHint?: string | null;
  defaultCollectionHandle?: string | null;
};

type MappingAuditInput = {
  shop: string;
  action: string;
  summary: string;
  status: "ok" | "error";
  details?: Record<string, unknown> | null;
  errorMessage?: string;
};

export type MappingAuditLogRow = {
  id: string;
  action: string;
  summary: string;
  status: "ok" | "error";
  details: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
};

export type ProductActionStatus = "PROCESSED" | "";

type PersistedMappingAuditRow = {
  id: string;
  action: string;
  summary: string;
  status: string;
  details: unknown;
  error_message: string | null;
  created_at: string;
};

const DEFAULT_SHOP_KEY = "__default_shop__";

const DEFAULT_MENU_NODES: MenuNodeSeed[] = [
  { key: "women", label: "WOMEN", parentKey: null, depth: 0, sortOrder: 10, defaultCollectionHandle: "women" },
  { key: "women/new-now", label: "NEW & NOW", parentKey: "women", depth: 1, sortOrder: 11, defaultCollectionHandle: "women-new-now" },
  { key: "women/new-now/new-arrivals", label: "NEW ARRIVALS", parentKey: "women/new-now", depth: 2, sortOrder: 12, defaultCollectionHandle: "new-arrivals-women" },
  { key: "women/new-now/limited-edition", label: "LIMITED EDITION", parentKey: "women/new-now", depth: 2, sortOrder: 13, defaultCollectionHandle: "limited-edition" },
  { key: "women/new-now/summer-sets", label: "SUMMER SETS", parentKey: "women/new-now", depth: 2, sortOrder: 14, defaultCollectionHandle: "summer-sets" },
  { key: "women/new-now/winter-sets", label: "WINTER SETS", parentKey: "women/new-now", depth: 2, sortOrder: 15, defaultCollectionHandle: "winter-sets-women" },

  { key: "women/clothing", label: "CLOTHING", parentKey: "women", depth: 1, sortOrder: 20, defaultCollectionHandle: "clothing-1" },
  { key: "women/clothing/matching-sets", label: "MATCHING SETS", parentKey: "women/clothing", depth: 2, sortOrder: 21, defaultCollectionHandle: "matching-sets-1" },
  { key: "women/clothing/dresses", label: "DRESSES", parentKey: "women/clothing", depth: 2, sortOrder: 22, defaultCollectionHandle: "dresses" },
  { key: "women/clothing/dresses/mini-dresses", label: "MINI DRESSES", parentKey: "women/clothing/dresses", depth: 3, sortOrder: 23, defaultCollectionHandle: "mini-dresses" },
  { key: "women/clothing/dresses/midi-dresses", label: "MIDI DRESSES", parentKey: "women/clothing/dresses", depth: 3, sortOrder: 24, defaultCollectionHandle: "midi-dresses-women" },
  { key: "women/clothing/dresses/maxi-dresses", label: "MAXI DRESSES", parentKey: "women/clothing/dresses", depth: 3, sortOrder: 25, defaultCollectionHandle: "maxi-dresses-women" },
  { key: "women/clothing/dresses/night-dresses", label: "NIGHT DRESSES", parentKey: "women/clothing/dresses", depth: 3, sortOrder: 26, defaultCollectionHandle: "night-dresses" },
  { key: "women/clothing/jeans", label: "JEANS", parentKey: "women/clothing", depth: 2, sortOrder: 27, defaultCollectionHandle: "clothing-jeans" },
  { key: "women/clothing/shorts", label: "SHORTS", parentKey: "women/clothing", depth: 2, sortOrder: 28, defaultCollectionHandle: "shorts" },
  { key: "women/clothing/skirts", label: "SKIRTS", parentKey: "women/clothing", depth: 2, sortOrder: 29, defaultCollectionHandle: "skirts" },
  { key: "women/clothing/tops", label: "TOPS", parentKey: "women/clothing", depth: 2, sortOrder: 30, defaultCollectionHandle: "tops" },
  { key: "women/clothing/tank-tops", label: "TANK TOPS", parentKey: "women/clothing", depth: 2, sortOrder: 31, defaultCollectionHandle: "tank-tops" },
  { key: "women/clothing/t-shirts", label: "T-SHIRTS", parentKey: "women/clothing", depth: 2, sortOrder: 32, defaultCollectionHandle: "t-shirts-women" },
  { key: "women/clothing/jumpsuits-rompers", label: "JUMPSUITS & ROMPERS", parentKey: "women/clothing", depth: 2, sortOrder: 33, defaultCollectionHandle: "jumpsuits-rompers" },
  { key: "women/clothing/jackets-coats", label: "JACKETS & COATS", parentKey: "women/clothing", depth: 2, sortOrder: 34, defaultCollectionHandle: "jackets-coats-2" },
  { key: "women/clothing/bodysuits", label: "BODYSUITS", parentKey: "women/clothing", depth: 2, sortOrder: 35, defaultCollectionHandle: "bodysuits" },
  { key: "women/clothing/tracksuits", label: "TRACKSUITS", parentKey: "women/clothing", depth: 2, sortOrder: 36, defaultCollectionHandle: "tracksuits" },
  { key: "women/clothing/sweatpants", label: "SWEATPANTS", parentKey: "women/clothing", depth: 2, sortOrder: 37, defaultCollectionHandle: "sweatpants" },
  { key: "women/clothing/pants-leggings", label: "PANTS & LEGGINGS", parentKey: "women/clothing", depth: 2, sortOrder: 38, defaultCollectionHandle: "pants-women" },
  { key: "women/clothing/leggings", label: "LEGGINGS", parentKey: "women/clothing", depth: 2, sortOrder: 39, defaultCollectionHandle: "women-clothing-leggings" },
  { key: "women/clothing/sweatshirts-hoodies", label: "SWEATSHIRTS & HOODIES", parentKey: "women/clothing", depth: 2, sortOrder: 40, defaultCollectionHandle: "sweatshirts-hoodies-women" },
  { key: "women/clothing/swimwear", label: "SWIMWEAR", parentKey: "women/clothing", depth: 2, sortOrder: 41, defaultCollectionHandle: "swimsuit-women" },
  { key: "women/clothing/sweaters", label: "SWEATERS", parentKey: "women/clothing", depth: 2, sortOrder: 42, defaultCollectionHandle: "sweaters-women" },

  { key: "women/accessories-shoes", label: "ACCESSORIES & SHOES", parentKey: "women", depth: 1, sortOrder: 50, defaultCollectionHandle: "accessories-shoes-women" },
  { key: "women/accessories-shoes/jewelry", label: "JEWELRY", parentKey: "women/accessories-shoes", depth: 2, sortOrder: 51, defaultCollectionHandle: "jewelry-women" },
  { key: "women/accessories-shoes/sunglasses", label: "SUNGLASSES", parentKey: "women/accessories-shoes", depth: 2, sortOrder: 52, defaultCollectionHandle: "sunglasses-women" },
  { key: "women/accessories-shoes/belts", label: "BELTS", parentKey: "women/accessories-shoes", depth: 2, sortOrder: 53, defaultCollectionHandle: "women-belts" },
  { key: "women/accessories-shoes/hats", label: "HATS", parentKey: "women/accessories-shoes", depth: 2, sortOrder: 54, defaultCollectionHandle: "hats" },
  { key: "women/accessories-shoes/shoes", label: "SHOES", parentKey: "women/accessories-shoes", depth: 2, sortOrder: 55, defaultCollectionHandle: "shoes-women" },
  { key: "women/accessories-shoes/fragrance-beauty", label: "FRAGRANCE & BEAUTY", parentKey: "women/accessories-shoes", depth: 2, sortOrder: 56, defaultCollectionHandle: "fragrance-beauty-women" },
  { key: "women/accessories-shoes/all-accessories", label: "ALL ACCESSORIES", parentKey: "women/accessories-shoes", depth: 2, sortOrder: 57, defaultCollectionHandle: "all-accessories-women" },

  { key: "men", label: "MEN", parentKey: null, depth: 0, sortOrder: 100, defaultCollectionHandle: "men" },
  { key: "men/new-now", label: "NEW & NOW", parentKey: "men", depth: 1, sortOrder: 101, defaultCollectionHandle: "men-new-now" },
  { key: "men/new-now/new-arrivals", label: "NEW ARRIVALS", parentKey: "men/new-now", depth: 2, sortOrder: 102, defaultCollectionHandle: "new-arrivals" },
  { key: "men/new-now/summer-sets", label: "SUMMER SETS", parentKey: "men/new-now", depth: 2, sortOrder: 103, defaultCollectionHandle: "summer-sets-men" },
  { key: "men/new-now/winter-sets", label: "WINTER SETS", parentKey: "men/new-now", depth: 2, sortOrder: 104, defaultCollectionHandle: "winter-sets" },

  { key: "men/clothing", label: "CLOTHING", parentKey: "men", depth: 1, sortOrder: 110, defaultCollectionHandle: "men-clothing" },
  { key: "men/clothing/jeans", label: "JEANS", parentKey: "men/clothing", depth: 2, sortOrder: 111, defaultCollectionHandle: "jeans-men" },
  { key: "men/clothing/baggy", label: "BAGGY", parentKey: "men/clothing", depth: 2, sortOrder: 112, defaultCollectionHandle: "baggy-men" },
  { key: "men/clothing/super-skinny-jeans", label: "SUPER SKINNY JEANS", parentKey: "men/clothing", depth: 2, sortOrder: 113, defaultCollectionHandle: "super-skinny-jeans-men" },
  { key: "men/clothing/skinny-jeans", label: "SKINNY JEANS", parentKey: "men/clothing", depth: 2, sortOrder: 114, defaultCollectionHandle: "skinny-jeans" },
  { key: "men/clothing/slim-jeans", label: "SLIM JEANS", parentKey: "men/clothing", depth: 2, sortOrder: 115, defaultCollectionHandle: "slim-jeans-men" },
  { key: "men/clothing/shirts", label: "SHIRTS", parentKey: "men/clothing", depth: 2, sortOrder: 116, defaultCollectionHandle: "shirts" },
  { key: "men/clothing/dress-shirt", label: "DRESS SHIRT", parentKey: "men/clothing", depth: 2, sortOrder: 117, defaultCollectionHandle: "dress-shirt" },
  { key: "men/clothing/denim-shirts", label: "DENIM SHIRTS", parentKey: "men/clothing", depth: 2, sortOrder: 118, defaultCollectionHandle: "denim-shirts" },
  { key: "men/clothing/linen-shirts", label: "LINEN SHIRTS", parentKey: "men/clothing", depth: 2, sortOrder: 119, defaultCollectionHandle: "linen-shirts" },
  { key: "men/clothing/graphic-t-shirts-summer", label: "GRAPHIC T-SHIRTS (SUMMER)", parentKey: "men/clothing", depth: 2, sortOrder: 120, defaultCollectionHandle: "short-sleeve-shirts" },
  { key: "men/clothing/graphic-t-shirts-winter", label: "GRAPHIC T-SHIRTS (WINTER)", parentKey: "men/clothing", depth: 2, sortOrder: 121, defaultCollectionHandle: "graphic-t-shirts-winter" },
  { key: "men/clothing/t-shirts", label: "T-SHIRTS", parentKey: "men/clothing", depth: 2, sortOrder: 122, defaultCollectionHandle: "t-shirts" },
  { key: "men/clothing/tank-tops", label: "TANK TOPS", parentKey: "men/clothing", depth: 2, sortOrder: 123, defaultCollectionHandle: "tank-tops-men" },
  { key: "men/clothing/tops", label: "TOPS", parentKey: "men/clothing", depth: 2, sortOrder: 124, defaultCollectionHandle: "tops-men" },
  { key: "men/clothing/shorts", label: "SHORTS", parentKey: "men/clothing", depth: 2, sortOrder: 125, defaultCollectionHandle: "shorts-1" },
  { key: "men/clothing/pants", label: "PANTS", parentKey: "men/clothing", depth: 2, sortOrder: 126, defaultCollectionHandle: "pants" },
  { key: "men/clothing/jackets-coats", label: "JACKETS & COATS", parentKey: "men/clothing", depth: 2, sortOrder: 127, defaultCollectionHandle: "jackets-coats" },
  { key: "men/clothing/tracksuits", label: "TRACKSUITS", parentKey: "men/clothing", depth: 2, sortOrder: 128, defaultCollectionHandle: "tracksuits-1" },
  { key: "men/clothing/sweatpants", label: "SWEATPANTS", parentKey: "men/clothing", depth: 2, sortOrder: 129, defaultCollectionHandle: "sweatpants-men" },
  { key: "men/clothing/sweatshirts-hoodies", label: "SWEATSHIRTS & HOODIES", parentKey: "men/clothing", depth: 2, sortOrder: 130, defaultCollectionHandle: "matching-sets" },
  { key: "men/clothing/overalls", label: "OVERALLS", parentKey: "men/clothing", depth: 2, sortOrder: 131, defaultCollectionHandle: "overalls" },
  { key: "men/clothing/swimwear", label: "SWIMWEAR", parentKey: "men/clothing", depth: 2, sortOrder: 132, defaultCollectionHandle: "swimwear-1" },
  { key: "men/clothing/sweaters", label: "SWEATERS", parentKey: "men/clothing", depth: 2, sortOrder: 133, defaultCollectionHandle: "sweaters-men" },
  { key: "men/clothing/polos", label: "POLOS", parentKey: "men/clothing", depth: 2, sortOrder: 134, defaultCollectionHandle: "polos" },
  { key: "men/clothing/shirt-shop", label: "SHIRT SHOP", parentKey: "men/clothing", depth: 2, sortOrder: 135, defaultCollectionHandle: "men-shirt-shop" },

  { key: "men/accessories-shoes", label: "ACCESSORIES & SHOES", parentKey: "men", depth: 1, sortOrder: 140, defaultCollectionHandle: "men-accessories-shoes" },
  { key: "men/accessories-shoes/jewelry", label: "JEWELRY", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 141, defaultCollectionHandle: "jewelry" },
  { key: "men/accessories-shoes/sunglasses", label: "SUNGLASSES", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 142, defaultCollectionHandle: "sunglasses" },
  { key: "men/accessories-shoes/belts", label: "BELTS", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 143, defaultCollectionHandle: "belts" },
  { key: "men/accessories-shoes/hats", label: "HATS", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 144, defaultCollectionHandle: "hats-men" },
  { key: "men/accessories-shoes/shoes", label: "SHOES", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 145, defaultCollectionHandle: "shoes" },
  { key: "men/accessories-shoes/fragrance-beauty", label: "FRAGRANCE & BEAUTY", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 146, defaultCollectionHandle: "fragrance-beauty" },
  { key: "men/accessories-shoes/socks-underwear", label: "SOCKS & UNDERWEAR", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 147, defaultCollectionHandle: "socks-underwear" },
  { key: "men/accessories-shoes/ties", label: "TIES", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 148, defaultCollectionHandle: "ties" },
  { key: "men/accessories-shoes/all-accessories", label: "ALL ACCESSORIES", parentKey: "men/accessories-shoes", depth: 2, sortOrder: 149, defaultCollectionHandle: "all-accessories" },

  { key: "jeans", label: "JEANS", parentKey: null, depth: 0, sortOrder: 200 },
  { key: "jeans/men", label: "MEN", parentKey: "jeans", depth: 1, sortOrder: 201, defaultCollectionHandle: "jeans-men" },
  { key: "jeans/men/skinny-jeans", label: "SKINNY JEANS", parentKey: "jeans/men", depth: 2, sortOrder: 202, defaultCollectionHandle: "skinny-jeans" },
  { key: "jeans/men/super-skinny-jeans", label: "SUPER SKINNY JEANS", parentKey: "jeans/men", depth: 2, sortOrder: 203, defaultCollectionHandle: "super-skinny-jeans-men" },
  { key: "jeans/men/baggy", label: "BAGGY", parentKey: "jeans/men", depth: 2, sortOrder: 204, defaultCollectionHandle: "baggy-men" },
  { key: "jeans/men/slim-jeans", label: "SLIM JEANS", parentKey: "jeans/men", depth: 2, sortOrder: 205, defaultCollectionHandle: "slim-jeans-men" },

  { key: "jeans/women", label: "WOMEN", parentKey: "jeans", depth: 1, sortOrder: 210, defaultCollectionHandle: "clothing-jeans" },
  { key: "jeans/women/skinny-jeans", label: "SKINNY JEANS", parentKey: "jeans/women", depth: 2, sortOrder: 211, defaultCollectionHandle: "skinny-jeans-women" },
  { key: "jeans/women/relaxed-jeans", label: "RELAXED JEANS", parentKey: "jeans/women", depth: 2, sortOrder: 212, defaultCollectionHandle: "relaxed-women" },
  { key: "jeans/women/flare-wide-leg-jeans", label: "FLARE & WIDE LEG JEANS", parentKey: "jeans/women", depth: 2, sortOrder: 213, defaultCollectionHandle: "jeans-women" },
];

const memoryNodesByShop = new Map<string, MenuNodeRecord[]>();
const memoryAuditLogsByShop = new Map<string, MappingAuditLogRow[]>();
let sqlTablesEnsured = false;
const MAPPING_AUDIT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAPPING_AUDIT_LIMIT_MAX = 1000;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeShopKey(shop: string) {
  return normalizeShopDomain(normalizeText(shop)) || DEFAULT_SHOP_KEY;
}

function toInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(normalizeText(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeLower(value);
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

function cloneNode(node: MenuNodeRecord): MenuNodeRecord {
  return {
    ...node,
    parentKey: node.parentKey || null,
    collectionId: node.collectionId || null,
    collectionTitle: node.collectionTitle || null,
    collectionHandle: node.collectionHandle || null,
    defaultCollectionHandle: node.defaultCollectionHandle || null,
    updatedAt: node.updatedAt || null,
  };
}

function sortNodes(rows: MenuNodeRecord[]) {
  return [...rows].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.nodeKey.localeCompare(b.nodeKey);
  });
}

function toCollectionMaps(collections: CollectionOption[]) {
  const byHandle = new Map<string, CollectionOption>();
  const byId = new Map<string, CollectionOption>();
  for (const row of collections) {
    const id = normalizeText(row.id);
    const handle = normalizeLower(row.handle);
    if (id) byId.set(id, row);
    if (handle) byHandle.set(handle, row);
  }
  return { byHandle, byId };
}

function buildSeededNodes(collections: CollectionOption[]): MenuNodeRecord[] {
  const { byHandle } = toCollectionMaps(collections);
  const nowIso = new Date().toISOString();
  return DEFAULT_MENU_NODES.map((seed) => {
    const matched = seed.defaultCollectionHandle
      ? byHandle.get(normalizeLower(seed.defaultCollectionHandle))
      : undefined;

    return {
      nodeKey: seed.key,
      label: seed.label,
      parentKey: seed.parentKey,
      depth: seed.depth,
      sortOrder: seed.sortOrder,
      enabled: true,
      collectionId: matched?.id || null,
      collectionTitle: matched?.title || null,
      collectionHandle: matched?.handle || null,
      defaultCollectionHandle: seed.defaultCollectionHandle || null,
      updatedAt: nowIso,
    };
  });
}

function parsePersistedNode(row: PersistedNodeRow): MenuNodeRecord {
  return {
    nodeKey: normalizeText(row.node_key),
    label: normalizeText(row.label),
    parentKey: normalizeText(row.parent_key) || null,
    depth: Math.max(0, toInt(row.depth)),
    sortOrder: toInt(row.sort_order),
    enabled: toBool(row.enabled, true),
    collectionId: normalizeText(row.collection_id) || null,
    collectionTitle: normalizeText(row.collection_title) || null,
    collectionHandle: normalizeText(row.collection_handle) || null,
    defaultCollectionHandle: normalizeText(row.default_collection_handle) || null,
    updatedAt: normalizeText(row.updated_at) || null,
  };
}

function normalizeDetails(details: unknown): Record<string, unknown> {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return {};
}

function parsePersistedMappingAuditRow(row: PersistedMappingAuditRow): MappingAuditLogRow {
  return {
    id: normalizeText(row.id) || randomUUID(),
    action: normalizeText(row.action) || "unknown",
    summary: normalizeText(row.summary),
    status: normalizeLower(row.status) === "error" ? "error" : "ok",
    details: normalizeDetails(row.details),
    errorMessage: normalizeText(row.error_message) || null,
    createdAt: normalizeText(row.created_at) || new Date().toISOString(),
  };
}

function clampAuditLimit(limit: number) {
  if (!Number.isFinite(limit)) return 100;
  return Math.max(1, Math.min(MAPPING_AUDIT_LIMIT_MAX, Math.floor(limit)));
}

function pruneMemoryAuditLogs(shopKey: string) {
  const existing = memoryAuditLogsByShop.get(shopKey) || [];
  const threshold = Date.now() - MAPPING_AUDIT_RETENTION_MS;
  const next = existing.filter((row) => {
    const ts = Date.parse(row.createdAt);
    return Number.isFinite(ts) && ts >= threshold;
  });
  memoryAuditLogsByShop.set(shopKey, next);
  return next;
}

function getMemoryNodes(shop: string, collections: CollectionOption[]): MenuNodeRecord[] {
  const shopKey = normalizeShopKey(shop);
  const existing = memoryNodesByShop.get(shopKey);
  if (!existing || existing.length < 1) {
    const seeded = buildSeededNodes(collections);
    memoryNodesByShop.set(shopKey, seeded.map(cloneNode));
    return sortNodes(seeded);
  }

  const byKey = new Map(existing.map((row) => [row.nodeKey, row]));
  const seeded = buildSeededNodes(collections);
  for (const seed of seeded) {
    const current = byKey.get(seed.nodeKey);
    if (!current) {
      existing.push(cloneNode(seed));
      byKey.set(seed.nodeKey, existing[existing.length - 1]);
      continue;
    }
    current.label = seed.label;
    current.parentKey = seed.parentKey;
    current.depth = seed.depth;
    current.sortOrder = seed.sortOrder;
    current.defaultCollectionHandle = seed.defaultCollectionHandle;
  }

  memoryNodesByShop.set(shopKey, sortNodes(existing).map(cloneNode));
  return sortNodes(existing);
}

async function ensureSqlTables() {
  if (sqlTablesEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS shopify_collection_menu_nodes (
      shop TEXT NOT NULL,
      node_key TEXT NOT NULL,
      label TEXT NOT NULL,
      parent_key TEXT,
      depth INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT true,
      collection_id TEXT,
      collection_title TEXT,
      collection_handle TEXT,
      default_collection_handle TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (shop, node_key)
    )
  `);

  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS shopify_collection_mapping_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_title TEXT,
      node_key TEXT NOT NULL,
      checked BOOLEAN NOT NULL,
      added_collection_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      removed_collection_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'ok',
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS shopify_collection_mapping_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ok',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await sqlQuery(`
    CREATE INDEX IF NOT EXISTS idx_shopify_collection_menu_nodes_shop_sort
      ON shopify_collection_menu_nodes (shop, sort_order, node_key)
  `);

  await sqlQuery(`
    CREATE INDEX IF NOT EXISTS idx_shopify_collection_mapping_actions_shop_created
      ON shopify_collection_mapping_actions (shop, created_at DESC)
  `);

  await sqlQuery(`
    CREATE INDEX IF NOT EXISTS idx_shopify_collection_mapping_audit_shop_created
      ON shopify_collection_mapping_audit (shop, created_at DESC)
  `);

  sqlTablesEnsured = true;
}

async function canUseSql() {
  if (!hasSqlDatabaseConfigured()) return false;
  try {
    await ensureSqlTables();
    return true;
  } catch {
    return false;
  }
}

async function listSqlNodes(shop: string): Promise<MenuNodeRecord[]> {
  const shopKey = normalizeShopKey(shop);
  const rows = await sqlQuery<PersistedNodeRow>(
    `SELECT node_key, label, parent_key, depth, sort_order, enabled,
            collection_id, collection_title, collection_handle,
            default_collection_handle, updated_at
     FROM shopify_collection_menu_nodes
     WHERE shop = $1
     ORDER BY sort_order ASC, node_key ASC`,
    [shopKey]
  );
  return rows.map(parsePersistedNode);
}

async function seedSqlNodesIfMissing(shop: string, collections: CollectionOption[]) {
  const shopKey = normalizeShopKey(shop);
  const existing = await listSqlNodes(shopKey);
  const existingKeys = new Set(existing.map((row) => row.nodeKey));
  const seeded = buildSeededNodes(collections);

  for (const row of seeded) {
    if (existingKeys.has(row.nodeKey)) continue;
    await sqlQuery(
      `INSERT INTO shopify_collection_menu_nodes (
        shop, node_key, label, parent_key, depth, sort_order,
        enabled, collection_id, collection_title, collection_handle,
        default_collection_handle, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, now()
      )
      ON CONFLICT (shop, node_key) DO UPDATE
        SET label = EXCLUDED.label,
            parent_key = EXCLUDED.parent_key,
            depth = EXCLUDED.depth,
            sort_order = EXCLUDED.sort_order,
            default_collection_handle = EXCLUDED.default_collection_handle`,
      [
        shopKey,
        row.nodeKey,
        row.label,
        row.parentKey,
        row.depth,
        row.sortOrder,
        row.enabled,
        row.collectionId,
        row.collectionTitle,
        row.collectionHandle,
        row.defaultCollectionHandle,
      ]
    );
  }
}

export async function listAndEnsureMenuNodes(
  shop: string,
  collections: CollectionOption[]
): Promise<{ backend: "sql" | "memory"; nodes: MenuNodeRecord[]; warning?: string }> {
  const safeShop = normalizeShopKey(shop);
  if (!(await canUseSql())) {
    return {
      backend: "memory",
      warning: "SQL is not configured. Mapping data is running in memory for this local session.",
      nodes: getMemoryNodes(safeShop, collections),
    };
  }

  await seedSqlNodesIfMissing(safeShop, collections);
  return {
    backend: "sql",
    nodes: sortNodes(await listSqlNodes(safeShop)),
  };
}

export async function saveMenuMappings(
  shop: string,
  mappings: Array<{ nodeKey: string; collectionId: string | null; enabled?: boolean }>,
  collections: CollectionOption[]
): Promise<{ backend: "sql" | "memory"; nodes: MenuNodeRecord[]; warning?: string }> {
  const safeShop = normalizeShopKey(shop);
  const { byId } = toCollectionMaps(collections);

  if (!(await canUseSql())) {
    const current = getMemoryNodes(safeShop, collections);
    const byKey = new Map(current.map((row) => [row.nodeKey, cloneNode(row)]));
    for (const mapping of mappings) {
      const nodeKey = normalizeText(mapping.nodeKey);
      if (!nodeKey || !byKey.has(nodeKey)) continue;
      const row = byKey.get(nodeKey)!;
      const collectionId = normalizeText(mapping.collectionId) || "";
      const match = collectionId ? byId.get(collectionId) : null;
      row.collectionId = match?.id || null;
      row.collectionTitle = match?.title || null;
      row.collectionHandle = match?.handle || null;
      row.enabled = typeof mapping.enabled === "boolean" ? mapping.enabled : row.enabled;
      row.updatedAt = new Date().toISOString();
      byKey.set(nodeKey, row);
    }
    const next = sortNodes(Array.from(byKey.values()));
    memoryNodesByShop.set(safeShop, next.map(cloneNode));
    return {
      backend: "memory",
      warning: "SQL is not configured. Mapping data is running in memory for this local session.",
      nodes: next,
    };
  }

  await seedSqlNodesIfMissing(safeShop, collections);

  for (const mapping of mappings) {
    const nodeKey = normalizeText(mapping.nodeKey);
    if (!nodeKey) continue;
    const collectionId = normalizeText(mapping.collectionId) || "";
    const match = collectionId ? byId.get(collectionId) : null;

    await sqlQuery(
      `UPDATE shopify_collection_menu_nodes
       SET collection_id = $3,
           collection_title = $4,
           collection_handle = $5,
           enabled = COALESCE($6, enabled),
           updated_at = now()
       WHERE shop = $1 AND node_key = $2`,
      [
        safeShop,
        nodeKey,
        match?.id || null,
        match?.title || null,
        match?.handle || null,
        typeof mapping.enabled === "boolean" ? mapping.enabled : null,
      ]
    );
  }

  return {
    backend: "sql",
    nodes: sortNodes(await listSqlNodes(safeShop)),
  };
}

export async function resetMenuMappingsToDefault(
  shop: string,
  collections: CollectionOption[]
): Promise<{ backend: "sql" | "memory"; nodes: MenuNodeRecord[]; warning?: string }> {
  const safeShop = normalizeShopKey(shop);
  const { byHandle } = toCollectionMaps(collections);

  if (!(await canUseSql())) {
    const rows = getMemoryNodes(safeShop, collections).map((row) => {
      const match = row.defaultCollectionHandle
        ? byHandle.get(normalizeLower(row.defaultCollectionHandle))
        : undefined;
      return {
        ...row,
        collectionId: match?.id || null,
        collectionTitle: match?.title || null,
        collectionHandle: match?.handle || null,
        enabled: true,
        updatedAt: new Date().toISOString(),
      };
    });
    memoryNodesByShop.set(safeShop, rows.map(cloneNode));
    return {
      backend: "memory",
      warning: "SQL is not configured. Mapping data is running in memory for this local session.",
      nodes: sortNodes(rows),
    };
  }

  await seedSqlNodesIfMissing(safeShop, collections);

  const current = await listSqlNodes(safeShop);
  for (const row of current) {
    const match = row.defaultCollectionHandle
      ? byHandle.get(normalizeLower(row.defaultCollectionHandle))
      : undefined;

    await sqlQuery(
      `UPDATE shopify_collection_menu_nodes
       SET collection_id = $3,
           collection_title = $4,
           collection_handle = $5,
           enabled = true,
           updated_at = now()
       WHERE shop = $1 AND node_key = $2`,
      [safeShop, row.nodeKey, match?.id || null, match?.title || null, match?.handle || null]
    );
  }

  return {
    backend: "sql",
    nodes: sortNodes(await listSqlNodes(safeShop)),
  };
}

function normalizeLiveNode(row: LiveMenuNodeInput): LiveMenuNodeInput {
  return {
    nodeKey: normalizeText(row.nodeKey),
    label: normalizeText(row.label),
    parentKey: normalizeText(row.parentKey) || null,
    depth: Math.max(0, toInt(row.depth)),
    sortOrder: toInt(row.sortOrder),
    collectionIdHint: normalizeText(row.collectionIdHint) || null,
    defaultCollectionHandle: normalizeText(row.defaultCollectionHandle) || null,
  };
}

function resolveNodeCollectionState(
  existing: MenuNodeRecord | undefined,
  incoming: LiveMenuNodeInput,
  byId: Map<string, CollectionOption>,
  byHandle: Map<string, CollectionOption>
) {
  const existingCollectionId = normalizeText(existing?.collectionId);
  const incomingCollectionIdHint = normalizeText(incoming.collectionIdHint);
  const existingDefaultHandle = normalizeText(existing?.defaultCollectionHandle);
  const incomingDefaultHandle = normalizeText(incoming.defaultCollectionHandle);

  const existingMatch = existingCollectionId ? byId.get(existingCollectionId) : undefined;
  const incomingHintMatch = incomingCollectionIdHint ? byId.get(incomingCollectionIdHint) : undefined;

  if (existingMatch) {
    return {
      collectionId: existingMatch.id,
      collectionTitle: existingMatch.title,
      collectionHandle: existingMatch.handle,
      defaultCollectionHandle: incomingDefaultHandle || existingDefaultHandle || existingMatch.handle || null,
    };
  }

  if (incomingHintMatch) {
    return {
      collectionId: incomingHintMatch.id,
      collectionTitle: incomingHintMatch.title,
      collectionHandle: incomingHintMatch.handle,
      defaultCollectionHandle:
        incomingDefaultHandle || existingDefaultHandle || incomingHintMatch.handle || null,
    };
  }

  if (existingCollectionId) {
    return {
      collectionId: existingCollectionId,
      collectionTitle: normalizeText(existing?.collectionTitle) || null,
      collectionHandle: normalizeText(existing?.collectionHandle) || null,
      defaultCollectionHandle: incomingDefaultHandle || existingDefaultHandle || null,
    };
  }

  const handleMatch =
    byHandle.get(normalizeLower(incomingDefaultHandle)) ||
    byHandle.get(normalizeLower(existingDefaultHandle));

  return {
    collectionId: handleMatch?.id || null,
    collectionTitle: handleMatch?.title || null,
    collectionHandle: handleMatch?.handle || null,
    defaultCollectionHandle: incomingDefaultHandle || existingDefaultHandle || handleMatch?.handle || null,
  };
}

export async function syncLiveMenuNodes(
  shop: string,
  liveNodes: LiveMenuNodeInput[],
  collections: CollectionOption[]
): Promise<{ backend: "sql" | "memory"; nodes: MenuNodeRecord[]; warning?: string }> {
  const safeShop = normalizeShopKey(shop);
  const { byId, byHandle } = toCollectionMaps(collections);
  const normalized = liveNodes
    .map(normalizeLiveNode)
    .filter((row) => row.nodeKey && row.label)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.nodeKey.localeCompare(b.nodeKey);
    });

  if (!(await canUseSql())) {
    const existing = memoryNodesByShop.get(safeShop) || [];
    const byExisting = new Map(existing.map((row) => [row.nodeKey, row]));
    const normalizedKeys = new Set(normalized.map((row) => row.nodeKey));
    const nowIso = new Date().toISOString();
    const next: MenuNodeRecord[] = normalized.map((row) => {
      const current = byExisting.get(row.nodeKey);
      const collectionState = resolveNodeCollectionState(current, row, byId, byHandle);
      return {
        nodeKey: row.nodeKey,
        label: row.label,
        parentKey: row.parentKey,
        depth: row.depth,
        sortOrder: row.sortOrder,
        enabled: typeof current?.enabled === "boolean" ? current.enabled : true,
        collectionId: collectionState.collectionId,
        collectionTitle: collectionState.collectionTitle,
        collectionHandle: collectionState.collectionHandle,
        defaultCollectionHandle: collectionState.defaultCollectionHandle,
        updatedAt: nowIso,
      };
    });
    const preservedLocalOnly = existing
      .filter((row) => row.nodeKey.startsWith("local4:") && !normalizedKeys.has(row.nodeKey))
      .map((row) => ({ ...row, updatedAt: nowIso }));
    const preservedDisabledMissing = existing
      .filter((row) => row.enabled === false && !normalizedKeys.has(row.nodeKey))
      .map((row) => ({ ...row, updatedAt: nowIso }));
    next.push(...preservedLocalOnly, ...preservedDisabledMissing);

    memoryNodesByShop.set(safeShop, next.map(cloneNode));
    return {
      backend: "memory",
      warning: "SQL is not configured. Mapping data is running in memory for this local session.",
      nodes: sortNodes(next),
    };
  }

  const existingRows = await listSqlNodes(safeShop);
  const byExisting = new Map(existingRows.map((row) => [row.nodeKey, row]));
  const now = new Date().toISOString();

  for (const row of normalized) {
    const current = byExisting.get(row.nodeKey);
    const collectionState = resolveNodeCollectionState(current, row, byId, byHandle);
    await sqlQuery(
      `INSERT INTO shopify_collection_menu_nodes (
        shop, node_key, label, parent_key, depth, sort_order, enabled,
        collection_id, collection_title, collection_handle, default_collection_handle, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz)
      ON CONFLICT (shop, node_key) DO UPDATE
        SET label = EXCLUDED.label,
            parent_key = EXCLUDED.parent_key,
            depth = EXCLUDED.depth,
            sort_order = EXCLUDED.sort_order,
            enabled = EXCLUDED.enabled,
            collection_id = EXCLUDED.collection_id,
            collection_title = EXCLUDED.collection_title,
            collection_handle = EXCLUDED.collection_handle,
            default_collection_handle = EXCLUDED.default_collection_handle,
            updated_at = EXCLUDED.updated_at`,
      [
        safeShop,
        row.nodeKey,
        row.label,
        row.parentKey,
        row.depth,
        row.sortOrder,
        typeof current?.enabled === "boolean" ? current.enabled : true,
        collectionState.collectionId,
        collectionState.collectionTitle,
        collectionState.collectionHandle,
        collectionState.defaultCollectionHandle,
        now,
      ]
    );
  }

  const keys = normalized.map((row) => row.nodeKey);
  if (keys.length < 1) {
    await sqlQuery(
      `DELETE FROM shopify_collection_menu_nodes
       WHERE shop = $1
         AND node_key NOT LIKE 'local4:%'
         AND enabled = true`,
      [safeShop]
    );
  } else {
    await sqlQuery(
      `DELETE FROM shopify_collection_menu_nodes
       WHERE shop = $1
         AND NOT (node_key = ANY($2::text[]))
         AND node_key NOT LIKE 'local4:%'
         AND enabled = true`,
      [safeShop, keys]
    );
  }

  return {
    backend: "sql",
    nodes: sortNodes(await listSqlNodes(safeShop)),
  };
}

export async function logCollectionMappingAction(input: ToggleAuditInput): Promise<void> {
  const shop = normalizeShopKey(input.shop);
  if (!(await canUseSql())) return;

  try {
    await sqlQuery(
      `INSERT INTO shopify_collection_mapping_actions (
        shop,
        product_id,
        product_title,
        node_key,
        checked,
        added_collection_ids,
        removed_collection_ids,
        status,
        error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        shop,
        normalizeText(input.productId),
        normalizeText(input.productTitle) || null,
        normalizeText(input.nodeKey),
        Boolean(input.checked),
        JSON.stringify(Array.isArray(input.addedCollectionIds) ? input.addedCollectionIds : []),
        JSON.stringify(Array.isArray(input.removedCollectionIds) ? input.removedCollectionIds : []),
        normalizeText(input.status) || "ok",
        normalizeText(input.errorMessage) || null,
      ]
    );
  } catch {
    // Best-effort audit log.
  }
}

async function trimSqlMappingAuditLogs(shop: string) {
  await sqlQuery(
    `DELETE FROM shopify_collection_mapping_audit
     WHERE shop = $1
       AND created_at < now() - interval '7 days'`,
    [shop]
  );
}

export async function logMappingAudit(input: MappingAuditInput): Promise<void> {
  const shop = normalizeShopKey(input.shop);
  const action = normalizeText(input.action) || "unknown";
  const summary = normalizeText(input.summary) || action;
  const status: "ok" | "error" = normalizeLower(input.status) === "error" ? "error" : "ok";
  const details = normalizeDetails(input.details);
  const errorMessage = normalizeText(input.errorMessage) || null;

  if (!(await canUseSql())) {
    const current = pruneMemoryAuditLogs(shop);
    const row: MappingAuditLogRow = {
      id: randomUUID(),
      action,
      summary,
      status,
      details,
      errorMessage,
      createdAt: new Date().toISOString(),
    };
    memoryAuditLogsByShop.set(shop, [row, ...current].slice(0, MAPPING_AUDIT_LIMIT_MAX));
    return;
  }

  try {
    await trimSqlMappingAuditLogs(shop);
    await sqlQuery(
      `INSERT INTO shopify_collection_mapping_audit (
        shop, action, summary, status, details, error_message
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [shop, action, summary, status, JSON.stringify(details), errorMessage]
    );
  } catch {
    // Best-effort audit log.
  }
}

export async function listMappingAuditLogs(
  shop: string,
  limit = 120
): Promise<{ backend: "sql" | "memory"; logs: MappingAuditLogRow[]; warning?: string }> {
  const safeShop = normalizeShopKey(shop);
  const safeLimit = clampAuditLimit(limit);

  if (!(await canUseSql())) {
    const rows = pruneMemoryAuditLogs(safeShop)
      .slice()
      .sort((a, b) => {
        const tA = Date.parse(a.createdAt) || 0;
        const tB = Date.parse(b.createdAt) || 0;
        return tB - tA;
      })
      .slice(0, safeLimit);
    return {
      backend: "memory",
      warning: "SQL is not configured. Mapping logs are only available for this local session.",
      logs: rows,
    };
  }

  await trimSqlMappingAuditLogs(safeShop);
  const rows = await sqlQuery<PersistedMappingAuditRow>(
    `SELECT id, action, summary, status, details, error_message, created_at
     FROM shopify_collection_mapping_audit
     WHERE shop = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [safeShop, safeLimit]
  );

  return {
    backend: "sql",
    logs: rows.map(parsePersistedMappingAuditRow),
  };
}

export async function listLatestProductActionStatus(
  shop: string,
  productIds: string[]
): Promise<{
  backend: "sql" | "memory";
  statusByProductId: Map<string, ProductActionStatus>;
  warning?: string;
}> {
  const safeShop = normalizeShopKey(shop);
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map((row) => normalizeText(row))
        .filter(Boolean)
    )
  );
  const empty = new Map<string, ProductActionStatus>();
  if (normalizedIds.length < 1) {
    return { backend: (await canUseSql()) ? "sql" : "memory", statusByProductId: empty };
  }

  if (!(await canUseSql())) {
    return {
      backend: "memory",
      warning: "SQL is not configured. Product mapping status is unavailable in this local session.",
      statusByProductId: empty,
    };
  }

  type LatestActionRow = {
    product_id: string;
    status: string;
  };
  const rows = await sqlQuery<LatestActionRow>(
    `SELECT DISTINCT ON (product_id) product_id, status
     FROM shopify_collection_mapping_actions
     WHERE shop = $1
       AND product_id = ANY($2::text[])
     ORDER BY product_id ASC, created_at DESC`,
    [safeShop, normalizedIds]
  );
  const statusByProductId = new Map<string, ProductActionStatus>();
  for (const row of rows) {
    const productId = normalizeText(row.product_id);
    if (!productId) continue;
    const status = normalizeLower(row.status) === "ok" ? "PROCESSED" : "";
    statusByProductId.set(productId, status);
  }
  return { backend: "sql", statusByProductId };
}

export function getDefaultMenuNodes() {
  return DEFAULT_MENU_NODES.map((row) => ({ ...row }));
}
