import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

export type SyncStatus = "PENDING" | "PROCESSED" | "ERROR";

export type StockByLocationRow = {
  location: string;
  qty: number | null;
};

export type StagingVariant = {
  id: string;
  parentId: string;
  sku: string;
  upc: string;
  sellerSku: string;
  cartId: string;
  stock: number | null;
  stockByLocation: StockByLocationRow[];
  price: number | null;
  color: string;
  size: string;
  image: string;
  status: SyncStatus;
  error?: string | null;
  shopifyMatched?: boolean;
};

export type StagingParent = {
  id: string;
  title: string;
  category: string;
  brand: string;
  sku: string;
  stock: number | null;
  price: number | null;
  variations: number;
  image: string;
  status: SyncStatus;
  processedCount: number;
  pendingCount: number;
  errorCount: number;
  variants: StagingVariant[];
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PersistedRow = {
  shop: string;
  parent_id: string;
  parent_sku: string;
  title: string;
  category: string;
  brand: string;
  stock: number | null;
  price: number | null;
  image: string;
  status: SyncStatus;
  error_message: string | null;
  variants: unknown;
  created_at?: string;
  updated_at?: string;
};

type PersistResult<T> = {
  ok: boolean;
  backend: "supabase" | "memory";
  warning?: string;
  data: T;
};

const TABLE = "shopify_cart_inventory_staging";
const DEFAULT_SHOP_KEY = "__default_shop__";
const memoryStore = new Map<string, Map<string, StagingParent>>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(normalizeText(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function toSyncStatus(value: unknown): SyncStatus {
  const normalized = normalizeLower(value);
  if (normalized === "processed") return "PROCESSED";
  if (normalized === "error") return "ERROR";
  return "PENDING";
}

function normalizeShopKey(shop: string) {
  return normalizeShopDomain(normalizeText(shop)) || DEFAULT_SHOP_KEY;
}

function getMemoryBucket(shopKey: string) {
  const existing = memoryStore.get(shopKey);
  if (existing) return existing;
  const created = new Map<string, StagingParent>();
  memoryStore.set(shopKey, created);
  return created;
}

function summarizeParent(input: StagingParent): StagingParent {
  const variants = Array.isArray(input.variants)
    ? input.variants.map((variant) => ({
        ...variant,
        status: toSyncStatus(variant.status),
      }))
    : [];

  const processedCount = variants.filter((variant) => variant.status === "PROCESSED").length;
  const errorCount = variants.filter((variant) => variant.status === "ERROR").length;
  const pendingCount = Math.max(0, variants.length - processedCount - errorCount);

  const parentStatus =
    errorCount > 0
      ? "ERROR"
      : variants.length > 0 && pendingCount === 0
        ? "PROCESSED"
        : "PENDING";

  const stockFromVariants = variants.reduce(
    (sum, variant) => sum + (typeof variant.stock === "number" ? variant.stock : 0),
    0
  );
  const hasStock = variants.some((variant) => typeof variant.stock === "number");

  return {
    id: normalizeText(input.id),
    title: normalizeText(input.title),
    category: normalizeText(input.category),
    brand: normalizeText(input.brand),
    sku: normalizeText(input.sku),
    stock:
      typeof input.stock === "number"
        ? input.stock
        : hasStock
          ? Number(stockFromVariants.toFixed(2))
          : null,
    price: typeof input.price === "number" ? input.price : toNumber(input.price),
    variations: variants.length,
    image: normalizeText(input.image),
    status: parentStatus,
    processedCount,
    pendingCount,
    errorCount,
    variants,
    error: normalizeText(input.error) || null,
    createdAt: normalizeText(input.createdAt) || undefined,
    updatedAt: normalizeText(input.updatedAt) || undefined,
  };
}

function parseVariant(raw: unknown, parentId: string, fallbackIndex: number): StagingVariant {
  const row = (raw || {}) as Partial<StagingVariant>;
  return {
    id: normalizeText(row.id) || `${parentId}-variant-${fallbackIndex + 1}`,
    parentId,
    sku: normalizeText(row.sku),
    upc: normalizeText(row.upc),
    sellerSku: normalizeText(row.sellerSku),
    cartId: normalizeText(row.cartId),
    stock: toNumber(row.stock),
    stockByLocation: Array.isArray(row.stockByLocation)
      ? row.stockByLocation.map((stockRow) => {
          const item = (stockRow || {}) as Partial<StockByLocationRow>;
          return {
            location: normalizeText(item.location),
            qty: toNumber(item.qty),
          };
        })
      : [],
    price: toNumber(row.price),
    color: normalizeText(row.color),
    size: normalizeText(row.size),
    image: normalizeText(row.image),
    status: toSyncStatus(row.status),
    error: normalizeText(row.error) || null,
    shopifyMatched: Boolean((row as { shopifyMatched?: boolean }).shopifyMatched),
  };
}

function parsePersistedRow(row: PersistedRow): StagingParent {
  const parentId = normalizeText(row.parent_id);
  const variants = Array.isArray(row.variants)
    ? row.variants.map((variant, idx) => parseVariant(variant, parentId, idx))
    : [];

  return summarizeParent({
    id: parentId,
    title: normalizeText(row.title),
    category: normalizeText(row.category),
    brand: normalizeText(row.brand),
    sku: normalizeText(row.parent_sku),
    stock: toNumber(row.stock),
    price: toNumber(row.price),
    variations: variants.length,
    image: normalizeText(row.image),
    status: toSyncStatus(row.status),
    processedCount: 0,
    pendingCount: 0,
    errorCount: 0,
    variants,
    error: normalizeText(row.error_message) || null,
    createdAt: normalizeText(row.created_at) || undefined,
    updatedAt: normalizeText(row.updated_at) || undefined,
  });
}

function toPersistedRow(shopKey: string, parent: StagingParent): PersistedRow {
  const normalized = summarizeParent(parent);
  const nowIso = new Date().toISOString();
  return {
    shop: shopKey,
    parent_id: normalized.id,
    parent_sku: normalized.sku,
    title: normalized.title,
    category: normalized.category,
    brand: normalized.brand,
    stock: normalized.stock,
    price: normalized.price,
    image: normalized.image,
    status: normalized.status,
    error_message: normalized.error || null,
    variants: normalized.variants,
    updated_at: nowIso,
  };
}

function tryGetSupabase() {
  try {
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

function toMemoryRows(shopKey: string) {
  const bucket = getMemoryBucket(shopKey);
  return Array.from(bucket.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

export async function listCartCatalogParents(shop: string): Promise<PersistResult<StagingParent[]>> {
  const shopKey = normalizeShopKey(shop);
  const supabase = tryGetSupabase();
  if (!supabase) {
    return {
      ok: true,
      backend: "memory",
      warning:
        "Supabase is not configured. Cart Inventory staging is running in memory for this session.",
      data: toMemoryRows(shopKey),
    };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "shop,parent_id,parent_sku,title,category,brand,stock,price,image,status,error_message,variants,created_at,updated_at"
    )
    .eq("shop", shopKey)
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      ok: true,
      backend: "memory",
      warning: `Supabase staging table unavailable (${error.message}). Using in-memory staging instead.`,
      data: toMemoryRows(shopKey),
    };
  }

  const rows = Array.isArray(data)
    ? data.map((row) => parsePersistedRow(row as PersistedRow))
    : [];
  return { ok: true, backend: "supabase", data: rows };
}

export async function listCartCatalogParentIds(
  shop: string
): Promise<PersistResult<Set<string>>> {
  const listed = await listCartCatalogParents(shop);
  return {
    ...listed,
    data: new Set(listed.data.map((row) => normalizeLower(row.id))),
  };
}

export async function upsertCartCatalogParents(
  shop: string,
  parents: StagingParent[]
): Promise<PersistResult<{ upserted: number }>> {
  const shopKey = normalizeShopKey(shop);
  const sanitized = parents
    .map((parent) => summarizeParent(parent))
    .filter((parent) => parent.id && parent.sku);

  if (sanitized.length < 1) {
    return { ok: true, backend: "memory", data: { upserted: 0 } };
  }

  const supabase = tryGetSupabase();
  if (!supabase) {
    const bucket = getMemoryBucket(shopKey);
    for (const parent of sanitized) {
      bucket.set(normalizeLower(parent.id), parent);
    }
    return {
      ok: true,
      backend: "memory",
      warning:
        "Supabase is not configured. Cart Inventory staging is running in memory for this session.",
      data: { upserted: sanitized.length },
    };
  }

  const payload = sanitized.map((parent) => toPersistedRow(shopKey, parent));
  const { error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: "shop,parent_id" });

  if (error) {
    const bucket = getMemoryBucket(shopKey);
    for (const parent of sanitized) {
      bucket.set(normalizeLower(parent.id), parent);
    }
    return {
      ok: true,
      backend: "memory",
      warning: `Supabase upsert unavailable (${error.message}). Using in-memory staging instead.`,
      data: { upserted: sanitized.length },
    };
  }

  return { ok: true, backend: "supabase", data: { upserted: sanitized.length } };
}

export async function removeCartCatalogParents(
  shop: string,
  parentIds: string[]
): Promise<PersistResult<{ removed: number }>> {
  const shopKey = normalizeShopKey(shop);
  const ids = Array.from(
    new Set(parentIds.map((id) => normalizeText(id)).filter(Boolean))
  );
  if (ids.length < 1) {
    return { ok: true, backend: "memory", data: { removed: 0 } };
  }

  const supabase = tryGetSupabase();
  if (!supabase) {
    const bucket = getMemoryBucket(shopKey);
    let removed = 0;
    for (const id of ids) {
      if (bucket.delete(normalizeLower(id))) removed += 1;
    }
    return {
      ok: true,
      backend: "memory",
      warning:
        "Supabase is not configured. Cart Inventory staging is running in memory for this session.",
      data: { removed },
    };
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("shop", shopKey)
    .in("parent_id", ids);

  if (error) {
    const bucket = getMemoryBucket(shopKey);
    let removed = 0;
    for (const id of ids) {
      if (bucket.delete(normalizeLower(id))) removed += 1;
    }
    return {
      ok: true,
      backend: "memory",
      warning: `Supabase delete unavailable (${error.message}). Using in-memory staging instead.`,
      data: { removed },
    };
  }

  return { ok: true, backend: "supabase", data: { removed: ids.length } };
}

export async function updateCartCatalogStatus(
  shop: string,
  parentIds: string[],
  status: SyncStatus
): Promise<PersistResult<{ updated: number }>> {
  const shopKey = normalizeShopKey(shop);
  const ids = Array.from(
    new Set(parentIds.map((id) => normalizeText(id)).filter(Boolean))
  );
  if (ids.length < 1) {
    return { ok: true, backend: "memory", data: { updated: 0 } };
  }

  const listed = await listCartCatalogParents(shopKey);
  const byId = new Map(
    listed.data.map((parent) => [normalizeLower(parent.id), parent] as [string, StagingParent])
  );

  const updatedRows: StagingParent[] = [];
  for (const id of ids) {
    const current = byId.get(normalizeLower(id));
    if (!current) continue;
    const variants =
      status === "ERROR"
        ? current.variants.map((variant) => ({ ...variant, status, error: "Marked for review." }))
        : current.variants.map((variant) => ({ ...variant, status, error: null }));
    updatedRows.push(summarizeParent({ ...current, status, variants, updatedAt: new Date().toISOString() }));
  }

  if (updatedRows.length < 1) {
    return { ...listed, data: { updated: 0 } };
  }

  const saved = await upsertCartCatalogParents(shopKey, updatedRows);
  return {
    ok: true,
    backend: saved.backend,
    warning: saved.warning,
    data: { updated: updatedRows.length },
  };
}

