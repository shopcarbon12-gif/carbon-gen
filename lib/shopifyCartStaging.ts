import { neonQuery, ensureNeonReady } from "@/lib/neonDb";
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
  comparePrice: number | null;
  costPrice: number | null;
  weight: number | null;
  weightUnit: string;
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
  /** Shopify product description (empty if not from Shopify or no description) */
  description?: string;
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
  description?: string;
  status: SyncStatus;
  error_message: string | null;
  variants: unknown;
  created_at?: string;
  updated_at?: string;
};

type PersistResult<T> = {
  ok: boolean;
  backend: "neon" | "memory";
  warning?: string;
  data: T;
};

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
    description: normalizeText(input.description) || undefined,
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
    comparePrice: toNumber(row.comparePrice),
    costPrice: toNumber(row.costPrice),
    weight: toNumber(row.weight),
    weightUnit: normalizeText(row.weightUnit) || "kg",
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
  const rawVariants = typeof row.variants === "string" ? JSON.parse(row.variants) : row.variants;
  const variants = Array.isArray(rawVariants)
    ? rawVariants.map((variant, idx) => parseVariant(variant, parentId, idx))
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
    description: normalizeText((row as PersistedRow).description) || undefined,
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

function toMemoryRows(shopKey: string) {
  const bucket = getMemoryBucket(shopKey);
  return Array.from(bucket.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

async function tryNeon(): Promise<boolean> {
  try {
    if (!(process.env.NEON_DATABASE_URL || "").trim()) return false;
    await ensureNeonReady();
    return true;
  } catch {
    return false;
  }
}

export async function listCartCatalogParents(shop: string): Promise<PersistResult<StagingParent[]>> {
  const shopKey = normalizeShopKey(shop);

  if (!(await tryNeon())) {
    return {
      ok: true,
      backend: "memory",
      warning: "Neon is not configured. Cart Inventory staging is running in memory for this session.",
      data: toMemoryRows(shopKey),
    };
  }

  try {
    const rows = await neonQuery<PersistedRow>(
      `SELECT shop, parent_id, parent_sku, title, category, brand, stock, price,
              image, description, status, error_message, variants, created_at, updated_at
       FROM shopify_cart_inventory_staging
       WHERE shop = $1
       ORDER BY updated_at DESC`,
      [shopKey]
    );
    const parsed = rows.map((row) => parsePersistedRow(row));
    return { ok: true, backend: "neon", data: parsed };
  } catch (err) {
    console.warn("[cart-staging] Neon query failed, falling back to memory:", (err as Error)?.message);
    return {
      ok: true,
      backend: "memory",
      warning: `Neon staging table unavailable (${(err as Error)?.message}). Using in-memory staging instead.`,
      data: toMemoryRows(shopKey),
    };
  }
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

  if (!(await tryNeon())) {
    const bucket = getMemoryBucket(shopKey);
    for (const parent of sanitized) {
      bucket.set(normalizeLower(parent.id), parent);
    }
    return {
      ok: true,
      backend: "memory",
      warning: "Neon is not configured. Cart Inventory staging is running in memory for this session.",
      data: { upserted: sanitized.length },
    };
  }

  try {
    const BATCH = 50;
    for (let i = 0; i < sanitized.length; i += BATCH) {
      const batch = sanitized.slice(i, i + BATCH);
      const values: unknown[] = [];
      const placeholders: string[] = [];

      for (let j = 0; j < batch.length; j++) {
        const p = batch[j];
        const normalized = summarizeParent(p);
        const offset = j * 14;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`
        );
        values.push(
          shopKey,
          normalized.id,
          normalized.sku,
          normalized.title,
          normalized.category,
          normalized.brand,
          normalized.stock,
          normalized.price,
          normalized.image,
          normalizeText(normalized.description) || null,
          normalized.status,
          normalized.error || null,
          JSON.stringify(normalized.variants),
          new Date().toISOString()
        );
      }

      await neonQuery(
        `INSERT INTO shopify_cart_inventory_staging
           (shop, parent_id, parent_sku, title, category, brand, stock, price, image, description, status, error_message, variants, updated_at)
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (shop, parent_id) DO UPDATE SET
           parent_sku = EXCLUDED.parent_sku,
           title = EXCLUDED.title,
           category = EXCLUDED.category,
           brand = EXCLUDED.brand,
           stock = EXCLUDED.stock,
           price = EXCLUDED.price,
           image = EXCLUDED.image,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           error_message = EXCLUDED.error_message,
           variants = EXCLUDED.variants,
           updated_at = EXCLUDED.updated_at`,
        values
      );
    }

    return { ok: true, backend: "neon", data: { upserted: sanitized.length } };
  } catch (err) {
    console.warn("[cart-staging] Neon upsert failed, falling back to memory:", (err as Error)?.message);
    const bucket = getMemoryBucket(shopKey);
    for (const parent of sanitized) {
      bucket.set(normalizeLower(parent.id), parent);
    }
    return {
      ok: true,
      backend: "memory",
      warning: `Neon upsert unavailable (${(err as Error)?.message}). Using in-memory staging instead.`,
      data: { upserted: sanitized.length },
    };
  }
}

export async function clearCartCatalogForShop(shop: string): Promise<PersistResult<{ removed: number }>> {
  const shopKey = normalizeShopKey(shop);

  if (!(await tryNeon())) {
    const bucket = getMemoryBucket(shopKey);
    const count = bucket.size;
    bucket.clear();
    return {
      ok: true,
      backend: "memory",
      warning: "Neon is not configured. Cleared in-memory staging for this shop.",
      data: { removed: count },
    };
  }

  try {
    const result = await neonQuery<{ cnt: string }>(
      `WITH deleted AS (
         DELETE FROM shopify_cart_inventory_staging WHERE shop = $1 RETURNING parent_id
       ) SELECT count(*)::text AS cnt FROM deleted`,
      [shopKey]
    );
    const removed = parseInt(result[0]?.cnt || "0", 10);
    return { ok: true, backend: "neon", data: { removed } };
  } catch (err) {
    console.error("[cart-staging] Clear failed:", (err as Error)?.message);
    return {
      ok: false,
      backend: "neon",
      warning: `Failed to clear Carts Inventory: ${(err as Error)?.message}`,
      data: { removed: 0 },
    };
  }
}

const REMOVE_BATCH_SIZE = 400;

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

  if (!(await tryNeon())) {
    const bucket = getMemoryBucket(shopKey);
    let removed = 0;
    for (const id of ids) {
      if (bucket.delete(normalizeLower(id))) removed += 1;
    }
    return {
      ok: true,
      backend: "memory",
      warning: "Neon is not configured. Cart Inventory staging is running in memory for this session.",
      data: { removed },
    };
  }

  try {
    let removed = 0;
    for (let i = 0; i < ids.length; i += REMOVE_BATCH_SIZE) {
      const batch = ids.slice(i, i + REMOVE_BATCH_SIZE);
      const placeholders = batch.map((_, idx) => `$${idx + 2}`).join(", ");
      const result = await neonQuery<{ cnt: string }>(
        `WITH deleted AS (
           DELETE FROM shopify_cart_inventory_staging
           WHERE shop = $1 AND parent_id IN (${placeholders})
           RETURNING parent_id
         ) SELECT count(*)::text AS cnt FROM deleted`,
        [shopKey, ...batch]
      );
      removed += parseInt(result[0]?.cnt || "0", 10);
    }
    return { ok: true, backend: "neon", data: { removed } };
  } catch (err) {
    console.error("[cart-staging] Delete failed:", (err as Error)?.message);
    return {
      ok: false,
      backend: "neon",
      warning: `Failed to remove from staging: ${(err as Error)?.message}`,
      data: { removed: 0 },
    };
  }
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

export async function updateCartCatalogParentId(
  shop: string,
  oldParentId: string,
  updatedParent: StagingParent
): Promise<PersistResult<{ updated: number }>> {
  const shopKey = normalizeShopKey(shop);
  const oldId = normalizeText(oldParentId);
  const newId = normalizeText(updatedParent.id);
  if (!oldId || !newId || normalizeLower(oldId) === normalizeLower(newId)) {
    return { ok: true, backend: "neon", data: { updated: 0 } };
  }

  if (!(await tryNeon())) {
    const bucket = getMemoryBucket(shopKey);
    const existing = bucket.get(normalizeLower(oldId));
    if (!existing) return { ok: true, backend: "memory", data: { updated: 0 } };
    bucket.delete(normalizeLower(oldId));
    bucket.set(normalizeLower(newId), summarizeParent(updatedParent));
    return { ok: true, backend: "memory", data: { updated: 1 } };
  }

  try {
    await removeCartCatalogParents(shop, [oldId]);
    await upsertCartCatalogParents(shop, [updatedParent]);
    return { ok: true, backend: "neon", data: { updated: 1 } };
  } catch (err) {
    return {
      ok: false,
      backend: "neon",
      warning: `Failed to update parent_id: ${(err as Error)?.message}`,
      data: { updated: 0 },
    };
  }
}
