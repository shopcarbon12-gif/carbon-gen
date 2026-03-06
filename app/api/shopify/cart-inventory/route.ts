import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed, isCronAuthed } from "@/lib/auth";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import { getShopifyAccessToken, listInstalledShops } from "@/lib/shopifyTokenRepository";
import {
  listCartCatalogParents,
  removeCartCatalogParents,
  upsertCartCatalogParents,
  updateCartCatalogStatus,
  type StagingParent,
  type StagingVariant,
  type SyncStatus,
} from "@/lib/shopifyCartStaging";
import {
  createUndoSession,
  listUndoSessions,
  takeUndoSession,
  type UndoOperation,
} from "@/lib/shopifySyncSessionUndo";
import { logStageAdd } from "@/lib/shopifyCartSyncLog";
import { sendPushNotificationEmail } from "@/lib/email";
import { runActivateArchivedInCart, runCartPushAll } from "@/lib/cartInventoryPush";
import { runMatchToLSMatrix } from "@/lib/cartInventoryMatchToLS";
import { loadSyncToggles } from "@/lib/shopifyCartConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_PAGE_SIZES = [20, 50, 75, 100, 200, 500] as const;

type CartFilters = {
  sku: string;
  parentSku: string;
  name: string;
  brand: string;
  priceFrom: number | null;
  priceTo: number | null;
  stockFrom: number | null;
  stockTo: number | null;
  /** "all" | "null" - when "null", filter for parent.stock === null */
  stockNull: string;
  status: string;
  categoryName: string;
  keyword: string;
  /** "All" | "InLS" (from Lightspeed inventory) | "NotInLS" (manual/Shopify-only) */
  lsSource: string;
  /** "All" | "InShopify" | "NotInShopify" */
  shopifySource: string;
  /** "All" | "AllSkuInShopify" | "MissingSkuInShopify" */
  shopifySkuCoverage: string;
  /** "All" | "Has" | "None" - filter by Shopify product description */
  hasDescription: string;
  /** "All" | "Has" | "None" - filter by product image */
  hasImage: string;
  /** Matrix filters: all variants must match (entire product) */
  matrixStockFrom: number | null;
  matrixStockTo: number | null;
  matrixPriceFrom: number | null;
  matrixPriceTo: number | null;
  matrixSku: string;
  matrixColor: string;
  matrixSize: string;
};

type ProductsPageNode = { id: string; variants?: { nodes?: Array<{ id: string }> } };
type ProductsPageEdges = Array<{ node?: ProductsPageNode }>;
type ProductsPageResponse = {
  products?: {
    edges?: ProductsPageEdges;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  };
};
type ProductUpdateResponse = {
  productUpdate?: { product?: { id: string }; userErrors?: Array<{ message: string }> };
};
type ShopifyGraphqlResult<T> = { ok: boolean; data?: T | null; errors?: unknown };
type ProductVariantsPageResponse = {
  productVariants?: {
    edges?: Array<{ node?: { sku?: string | null } }>;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  };
};

const SHOPIFY_SKU_CACHE_TTL_MS = 60_000;
const shopifySkuCache = new Map<string, { expiresAt: number; skuSet: Set<string> }>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function parseNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(normalizeText(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseInteger(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function compareText(a: unknown, b: unknown) {
  return normalizeText(a).localeCompare(normalizeText(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function includesText(haystack: unknown, needleLower: string) {
  if (!needleLower) return true;
  return normalizeLower(haystack).includes(needleLower);
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = parseInteger(value);
  if (parsed === null || parsed <= 0) return fallback;
  return parsed;
}

function parsePageSize(value: unknown) {
  const requested = parsePositiveInt(value, 20);
  if (ALLOWED_PAGE_SIZES.includes(requested as (typeof ALLOWED_PAGE_SIZES)[number])) {
    return requested;
  }
  return 20;
}

function shouldUseStrictShopifySkuCoverage(filters: CartFilters) {
  const coverage = normalizeLower(filters.shopifySkuCoverage);
  return coverage === "allskuinshopify" || coverage === "missingskuinshopify";
}

async function loadShopifySkuSet(
  shop: string,
  options: { forceRefresh?: boolean } = {}
): Promise<{ skuSet: Set<string> | null; warning: string }> {
  const cacheKey = normalizeLower(shop);
  const now = Date.now();
  const cached = shopifySkuCache.get(cacheKey);
  const forceRefresh = options.forceRefresh === true;
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return { skuSet: cached.skuSet, warning: "" };
  }

  // Strict SKU coverage must use the installed shop token from DB.
  // Do not silently fall back to env tokens here; that can mask real gaps.
  const token = await getTokenForShop(shop, { allowEnvFallback: false });
  if (!token) {
    return { skuSet: null, warning: "Strict SKU coverage unavailable: missing installed Shopify token for this shop." };
  }

  const apiVersion = normalizeText(process.env.SHOPIFY_API_VERSION) || "2025-01";
  const skuSet = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 100; page++) {
    const res = (await runShopifyGraphql<ProductVariantsPageResponse>({
      shop,
      token,
      apiVersion,
      query: `query ProductVariantsPage($after: String) {
        productVariants(first: 250, after: $after) {
          edges { node { sku } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: { after },
    })) as ShopifyGraphqlResult<ProductVariantsPageResponse>;

    if (!res.ok) {
      return { skuSet: null, warning: "Strict SKU coverage unavailable: failed to fetch Shopify variants." };
    }

    const conn = res.data?.productVariants;
    for (const edge of conn?.edges || []) {
      const sku = normalizeLower(edge?.node?.sku);
      if (sku) skuSet.add(sku);
    }

    if (!conn?.pageInfo?.hasNextPage) break;
    const endCursor = normalizeText(conn.pageInfo.endCursor);
    if (!endCursor) break;
    after = endCursor;
  }

  shopifySkuCache.set(cacheKey, { expiresAt: now + SHOPIFY_SKU_CACHE_TTL_MS, skuSet });
  return { skuSet, warning: "" };
}

function toSyncStatus(value: unknown): SyncStatus {
  const normalized = normalizeLower(value);
  if (normalized === "processed") return "PROCESSED";
  if (normalized === "error") return "ERROR";
  return "PENDING";
}

function parseFilters(searchParams: URLSearchParams): CartFilters {
  return {
    sku: normalizeText(searchParams.get("SKU")),
    parentSku: normalizeText(searchParams.get("ParentSKU")),
    name: normalizeText(searchParams.get("Name")),
    brand: normalizeText(searchParams.get("Brand")),
    priceFrom: parseNumber(searchParams.get("PriceFrom")),
    priceTo: parseNumber(searchParams.get("PriceTo")),
    stockFrom: parseNumber(searchParams.get("StockFrom")),
    stockTo: parseNumber(searchParams.get("StockTo")),
    stockNull: normalizeText(searchParams.get("StockNull")) || "all",
    status: normalizeText(searchParams.get("Orderby")) || "All",
    categoryName: normalizeText(searchParams.get("CategoryName")),
    keyword: normalizeText(searchParams.get("Keyword")),
    lsSource: normalizeText(searchParams.get("LSSource")) || "All",
    shopifySource: normalizeText(searchParams.get("ShopifySource")) || "All",
    shopifySkuCoverage:
      normalizeText(searchParams.get("ShopifySkuCoverage")) || "All",
    hasDescription: normalizeText(searchParams.get("HasDescription")) || "All",
    hasImage: normalizeText(searchParams.get("HasImage")) || "All",
    matrixStockFrom: parseNumber(searchParams.get("MatrixStockFrom")),
    matrixStockTo: parseNumber(searchParams.get("MatrixStockTo")),
    matrixPriceFrom: parseNumber(searchParams.get("MatrixPriceFrom")),
    matrixPriceTo: parseNumber(searchParams.get("MatrixPriceTo")),
    matrixSku: normalizeText(searchParams.get("MatrixSKU")),
    matrixColor: normalizeText(searchParams.get("MatrixColor")),
    matrixSize: normalizeText(searchParams.get("MatrixSize")),
  };
}

function isInLightspeedCatalog(parentId: string): boolean {
  const id = normalizeText(parentId).toLowerCase();
  return id.startsWith("matrix:") || id.startsWith("sku:");
}

/** Matrix filters: product passes only if ALL variants match each active filter. */
function rowMatchesMatrixFilters(parent: StagingParent, filters: CartFilters): boolean {
  const variants = parent.variants || [];
  if (variants.length === 0) return true;

  const hasMatrixStock = filters.matrixStockFrom !== null || filters.matrixStockTo !== null;
  const hasMatrixPrice = filters.matrixPriceFrom !== null || filters.matrixPriceTo !== null;
  const hasMatrixSku = Boolean(normalizeText(filters.matrixSku));
  const hasMatrixColor = Boolean(normalizeText(filters.matrixColor));
  const hasMatrixSize = Boolean(normalizeText(filters.matrixSize));
  if (!hasMatrixStock && !hasMatrixPrice && !hasMatrixSku && !hasMatrixColor && !hasMatrixSize) {
    return true;
  }

  for (const v of variants) {
    if (hasMatrixStock) {
      const vStock = typeof v.stock === "number" && Number.isFinite(v.stock) ? v.stock : null;
      if (filters.matrixStockFrom !== null) {
        if (vStock === null || vStock < filters.matrixStockFrom) return false;
      }
      if (filters.matrixStockTo !== null) {
        if (vStock === null || vStock > filters.matrixStockTo) return false;
      }
    }
    if (hasMatrixPrice) {
      const vPrice = typeof v.price === "number" && Number.isFinite(v.price) ? v.price : null;
      if (filters.matrixPriceFrom !== null) {
        if (vPrice === null || vPrice < filters.matrixPriceFrom) return false;
      }
      if (filters.matrixPriceTo !== null) {
        if (vPrice === null || vPrice > filters.matrixPriceTo) return false;
      }
    }
    if (hasMatrixSku) {
      const needle = normalizeLower(filters.matrixSku);
      if (!includesText(v.sku, needle) && !includesText(v.upc, needle)) return false;
    }
    if (hasMatrixColor) {
      const needle = normalizeLower(filters.matrixColor);
      if (!includesText(v.color, needle)) return false;
    }
    if (hasMatrixSize) {
      const needle = normalizeLower(filters.matrixSize);
      if (!includesText(v.size, needle)) return false;
    }
  }
  return true;
}

function rowMatchesFilters(parent: StagingParent, filters: CartFilters, shopifySkuSet: Set<string> | null = null) {
  const lsSourceFilter = normalizeLower(filters.lsSource);
  if (lsSourceFilter && lsSourceFilter !== "all") {
    const inLs = isInLightspeedCatalog(parent.id);
    if (lsSourceFilter === "inls" && !inLs) return false;
    if (lsSourceFilter === "notinls" && inLs) return false;
  }
  const shopifySourceFilter = normalizeLower(filters.shopifySource);
  if (shopifySourceFilter && shopifySourceFilter !== "all") {
    const inShopify = parent.variants.some((variant) => {
      const hasCartId = Boolean(normalizeText(variant.cartId));
      const matched = Boolean((variant as StagingVariant & { shopifyMatched?: boolean }).shopifyMatched);
      return hasCartId || matched;
    });
    if (shopifySourceFilter === "inshopify" && !inShopify) return false;
    if (shopifySourceFilter === "notinshopify" && inShopify) return false;
  }
  const skuCoverageFilter = normalizeLower(filters.shopifySkuCoverage);
  if (skuCoverageFilter && skuCoverageFilter !== "all") {
    const variantsWithSku = parent.variants.filter((variant) =>
      Boolean(normalizeText(variant.sku))
    );
    const hasAnyVariantSku = variantsWithSku.length > 0;
    const allVariantSkuInShopify =
      hasAnyVariantSku &&
      variantsWithSku.every((variant) => {
        const variantSku = normalizeLower(variant.sku);
        if (variantSku && shopifySkuSet) {
          return shopifySkuSet.has(variantSku);
        }
        const hasCartId = Boolean(normalizeText(variant.cartId));
        const matched = Boolean(variant.shopifyMatched);
        return hasCartId || matched;
      });
    const hasMissingVariantSku =
      hasAnyVariantSku &&
      variantsWithSku.some((variant) => {
        const variantSku = normalizeLower(variant.sku);
        if (variantSku && shopifySkuSet) {
          return !shopifySkuSet.has(variantSku);
        }
        const hasCartId = Boolean(normalizeText(variant.cartId));
        const matched = Boolean(variant.shopifyMatched);
        return !hasCartId && !matched;
      });
    if (skuCoverageFilter === "allskuinshopify" && !allVariantSkuInShopify) {
      return false;
    }
    if (skuCoverageFilter === "missingskuinshopify" && !hasMissingVariantSku) {
      return false;
    }
  }

  const statusFilter = normalizeLower(filters.status);
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "processed" && parent.status !== "PROCESSED") return false;
    if (statusFilter === "pending" && parent.status !== "PENDING") return false;
    if (statusFilter === "error" && parent.status !== "ERROR") return false;
  }

  const skuNeedle = normalizeLower(filters.sku);
  if (skuNeedle) {
    const parentHit = includesText(parent.sku, skuNeedle);
    const variantHit = parent.variants.some(
      (variant) =>
        includesText(variant.sku, skuNeedle) ||
        includesText(variant.upc, skuNeedle) ||
        includesText(variant.sellerSku, skuNeedle)
    );
    if (!parentHit && !variantHit) return false;
  }

  const parentSkuNeedle = normalizeLower(filters.parentSku);
  if (parentSkuNeedle && !includesText(parent.sku, parentSkuNeedle)) return false;

  const nameNeedle = normalizeLower(filters.name);
  if (nameNeedle && !includesText(parent.title, nameNeedle)) return false;

  const brandNeedle = normalizeLower(filters.brand);
  if (brandNeedle && !includesText(parent.brand, brandNeedle)) return false;

  const categoryNeedle = normalizeLower(filters.categoryName);
  if (categoryNeedle && categoryNeedle !== "all") {
    if (normalizeLower(parent.category).replace(/[\\\/]/g, " >> ") !== categoryNeedle) return false;
  }

  if (filters.priceFrom !== null) {
    if (parent.price === null || parent.price < filters.priceFrom) return false;
  }
  if (filters.priceTo !== null) {
    if (parent.price === null || parent.price > filters.priceTo) return false;
  }

  if (normalizeLower(filters.stockNull) === "null") {
    if (parent.stock !== null) return false;
  } else {
    if (filters.stockFrom !== null) {
      if (parent.stock === null || parent.stock < filters.stockFrom) return false;
    }
    if (filters.stockTo !== null) {
      if (parent.stock === null || parent.stock > filters.stockTo) return false;
    }
  }

  const keywordNeedle = normalizeLower(filters.keyword);
  if (keywordNeedle) {
    const parentText = [parent.title, parent.category, parent.brand, parent.sku].join(" ");
    const parentHit = includesText(parentText, keywordNeedle);
    if (!parentHit) {
      const variantHit = parent.variants.some((variant) => {
        const variantText = [
          variant.sku,
          variant.upc,
          variant.sellerSku,
          variant.cartId,
          variant.color,
          variant.size,
        ].join(" ");
        return includesText(variantText, keywordNeedle);
      });
      if (!variantHit) return false;
    }
  }

  const hasDescFilter = normalizeLower(filters.hasDescription);
  if (hasDescFilter && hasDescFilter !== "all") {
    const rawDesc = normalizeText(parent.description);
    const meaningfulDesc = rawDesc
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hasMeaningfulDesc = meaningfulDesc.length > 0;
    if (hasDescFilter === "has" && !hasMeaningfulDesc) return false;
    if (hasDescFilter === "none" && hasMeaningfulDesc) return false;
  }

  const hasImgFilter = normalizeLower(filters.hasImage);
  if (hasImgFilter && hasImgFilter !== "all") {
    const hasImg =
      Boolean(normalizeText(parent.image)) ||
      parent.variants.some((v) => Boolean(normalizeText(v.image)));
    if (hasImgFilter === "has" && !hasImg) return false;
    if (hasImgFilter === "none" && hasImg) return false;
  }

  if (!rowMatchesMatrixFilters(parent, filters)) return false;

  return true;
}

function formatCategories<T extends { category?: string }>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r, category: normalizeText(r.category).replace(/[\\\/]/g, " >> ") }));
}

function toPagedRows(rows: StagingParent[], page: number, pageSize: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    total,
    totalPages,
    page: currentPage,
    rows: rows.slice(start, start + pageSize),
  };
}

function parseLocationStock(raw: unknown): Array<{ location: string; qty: number | null }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: Array<{ location: string; qty: number | null }> = [];
  for (const [location, qty] of Object.entries(raw as Record<string, unknown>)) {
    const loc = normalizeText(location);
    if (!loc) continue;
    out.push({ location: loc, qty: parseNumber(qty) });
  }
  return out;
}

function parseVariant(raw: unknown, parentId: string, index: number): StagingVariant {
  const row = (raw || {}) as Partial<StagingVariant> & {
    availableInShopify?: boolean;
    customSku?: unknown;
    systemSku?: unknown;
    ean?: unknown;
    itemId?: unknown;
    locations?: unknown;
  };
  const matched = Boolean(row.shopifyMatched || row.availableInShopify);
  const stockByLocation = Array.isArray(row.stockByLocation)
    ? row.stockByLocation.map((stockRow) => {
      const item = (stockRow || {}) as { location?: unknown; qty?: unknown };
      return {
        location: normalizeText(item.location),
        qty: parseNumber(item.qty),
      };
    })
    : parseLocationStock(row.locations);
  const stockFromLocations = stockByLocation.reduce((sum, item) => sum + (item.qty ?? 0), 0);
  const stockValue = parseNumber(row.stock);
  const skuValue = normalizeText(row.sku) || normalizeText(row.customSku) || normalizeText(row.systemSku);
  const upcValue = normalizeText(row.upc) || normalizeText(row.ean);
  return {
    id: normalizeText(row.id) || normalizeText(row.itemId) || `${parentId}-variant-${index + 1}`,
    parentId,
    sku: skuValue,
    upc: upcValue,
    sellerSku: normalizeText(row.sellerSku),
    cartId: normalizeText(row.cartId),
    stock: stockValue ?? (stockByLocation.length > 0 ? stockFromLocations : null),
    stockByLocation,
    price: parseNumber(row.price),
    comparePrice: parseNumber(row.comparePrice),
    costPrice: parseNumber(row.costPrice),
    weight: parseNumber(row.weight),
    weightUnit: normalizeText(row.weightUnit) || "kg",
    color: normalizeText(row.color),
    size: normalizeText(row.size),
    image: normalizeText(row.image),
    status: normalizeText(row.status) ? toSyncStatus(row.status) : matched ? "PROCESSED" : "PENDING",
    error: normalizeText(row.error) || null,
    shopifyMatched: matched,
  };
}

function parseIncomingParent(raw: unknown, index: number): StagingParent | null {
  const row = (raw || {}) as Partial<StagingParent> & {
    availableAt?: { shopify?: boolean };
    customSku?: unknown;
    systemSku?: unknown;
    itemMatrixId?: unknown;
    itemMatrixID?: unknown;
    itemId?: unknown;
  };
  const lsSku = normalizeText(row.customSku) || normalizeText(row.systemSku);
  const lsMatrixId = normalizeText(row.itemMatrixId) || normalizeText(row.itemMatrixID);

  const explicitParentId = normalizeText((raw as { parentId?: unknown } | null)?.parentId);
  const rowId = normalizeText(row.id);
  const id =
    explicitParentId ||
    (lsMatrixId ? `matrix:${normalizeLower(lsMatrixId)}` : "") ||
    (rowId.startsWith("matrix:") || rowId.startsWith("sku:") ? rowId : "") ||
    rowId ||
    (lsSku ? `sku:${normalizeLower(lsSku)}` : "") ||
    normalizeText(row.sku) ||
    `row-${index + 1}`;

  const variants = Array.isArray(row.variants)
    ? row.variants.map((variant, variantIndex) => parseVariant(variant, id, variantIndex))
    : [parseVariant(raw, id, 0)].filter((v) => Boolean(normalizeText(v.sku)));
  const sku =
    normalizeText(row.sku) ||
    lsSku ||
    normalizeText(variants.find((variant) => normalizeText(variant.sku))?.sku);
  if (!id || !sku) return null;

  const hasAnyVariant = variants.length > 0;
  const statusFromAvailability = row.availableAt?.shopify ? "PROCESSED" : "PENDING";
  const status = normalizeText(row.status)
    ? toSyncStatus(row.status)
    : hasAnyVariant
      ? variants.every((variant) => variant.status === "PROCESSED")
        ? "PROCESSED"
        : variants.some((variant) => variant.status === "ERROR")
          ? "ERROR"
          : "PENDING"
      : statusFromAvailability;

  return {
    id,
    title: normalizeText(row.title) || normalizeText(row.description) || sku,
    category: normalizeText(row.category).replace(/[\\\/]/g, " >> "),
    brand: normalizeText(row.brand),
    sku,
    stock: parseNumber(row.stock) ?? variants.reduce((sum, v) => sum + (v.stock ?? 0), 0),
    price: parseNumber(row.price) ?? variants.find((v) => v.price != null)?.price ?? null,
    variations: variants.length,
    image: normalizeText(row.image),
    description: normalizeText(row.description) || undefined,
    status,
    processedCount: 0,
    pendingCount: 0,
    errorCount: 0,
    variants,
    error: normalizeText(row.error) || null,
  };
}

function parseIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => normalizeText(item)).filter(Boolean))
  );
}

function resolveFallbackShop(availableShops: string[]) {
  const envShop = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "";
  return envShop || availableShops[0] || "";
}

async function getTokenForShop(
  shop: string,
  options: { allowEnvFallback?: boolean } = {}
): Promise<string | null> {
  const allowEnvFallback = options.allowEnvFallback !== false;
  try {
    const dbToken = await getShopifyAccessToken(shop);
    if (dbToken) return dbToken;
  } catch {
    // fallback to env
  }
  if (!allowEnvFallback) return null;
  const envToken = getShopifyAdminToken(shop);
  return envToken || null;
}

async function getAvailableShops() {
  let dbShops: string[] = [];
  try {
    dbShops = await listInstalledShops(100);
  } catch {
    // Optional fallback path when the DB is unavailable.
  }

  const out = new Set<string>(dbShops);
  const envShop = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "");
  if (envShop) out.add(envShop);
  return Array.from(out).sort(compareText);
}

function buildUndoForStageAdd(
  currentRows: StagingParent[],
  incomingRows: StagingParent[]
): UndoOperation[] {
  const previousById = new Map(
    currentRows.map((row) => [normalizeLower(row.id), row] as [string, StagingParent])
  );
  const touchedIds = Array.from(
    new Set(incomingRows.map((row) => normalizeText(row.id)).filter(Boolean))
  );
  const previousRows = touchedIds
    .map((id) => previousById.get(normalizeLower(id)))
    .filter((row): row is StagingParent => Boolean(row));
  const newIds = touchedIds.filter((id) => !previousById.has(normalizeLower(id)));

  const operations: UndoOperation[] = [];
  if (previousRows.length > 0) operations.push({ type: "restore_rows", rows: previousRows });
  if (newIds.length > 0) operations.push({ type: "remove_rows", parentIds: newIds });
  return operations;
}

function buildUndoForStageRemove(
  currentRows: StagingParent[],
  parentIds: string[]
): UndoOperation[] {
  const idSet = new Set(parentIds.map((id) => normalizeLower(id)));
  const removedRows = currentRows.filter((row) => idSet.has(normalizeLower(row.id)));
  return removedRows.length > 0 ? [{ type: "restore_rows", rows: removedRows }] : [];
}

async function applyUndoOperation(shop: string, operation: UndoOperation) {
  if (operation.type === "restore_rows") {
    await upsertCartCatalogParents(shop, operation.rows);
    return;
  }
  await removeCartCatalogParents(shop, operation.parentIds);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const availableShops = await getAvailableShops();
    const requestedShop = normalizeShopDomain(normalizeText(searchParams.get("shop")) || "") || "";
    const shop = requestedShop || resolveFallbackShop(availableShops);

    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePageSize(searchParams.get("pageSize"));
    const filters = parseFilters(searchParams);
    const forceCoverageRefresh =
      normalizeLower(searchParams.get("refreshCoverage")) === "1" ||
      normalizeLower(searchParams.get("refreshCoverage")) === "true";

    const listed = await listCartCatalogParents(shop);
    const strictCoverage = shouldUseStrictShopifySkuCoverage(filters);
    const coverageData = strictCoverage
      ? await loadShopifySkuSet(shop, { forceRefresh: forceCoverageRefresh })
      : { skuSet: null as Set<string> | null, warning: "" };
    if (strictCoverage && !coverageData.skuSet) {
      return NextResponse.json(
        {
          ok: false,
          error: coverageData.warning || "Strict SKU coverage is unavailable for this shop.",
        },
        { status: 503 }
      );
    }
    const filtered = listed.data.filter((row) =>
      rowMatchesFilters(row, filters, coverageData.skuSet)
    );
    const sortedFiltered = [...filtered].sort((a, b) => compareText(a.sku, b.sku));
    const paged = toPagedRows(sortedFiltered, page, pageSize);

    const categories = Array.from(
      new Set(
        listed.data
          .map((row) => normalizeText(row.category).replace(/[\\\/]/g, " >> "))
          .filter(Boolean)
      )
    ).sort(compareText);
    const brands = Array.from(
      new Set(listed.data.map((row) => normalizeText(row.brand)).filter(Boolean))
    ).sort(compareText);
    const totalItems = filtered.reduce((sum, row) => sum + row.variations, 0);
    const totalProcessed = filtered.reduce((sum, row) => sum + row.processedCount, 0);
    const totalPending = filtered.reduce((sum, row) => sum + row.pendingCount, 0);
    const totalErrors = filtered.reduce((sum, row) => sum + row.errorCount, 0);

    return NextResponse.json({
      ok: true,
      shop,
      shops: availableShops,
      warning: [listed.warning, coverageData.warning].filter(Boolean).join(" ").trim(),
      options: {
        categories,
        brands,
        statuses: ["All", "Processed", "Pending", "Error"],
      },
      summary: {
        totalProducts: sortedFiltered.length,
        totalItems,
        totalProcessed,
        totalPending,
        totalErrors,
      },
      undoSessions: listUndoSessions(shop, "cart_inventory", 8).map((session) => ({
        id: session.id,
        target: session.target,
        action: session.action,
        note: session.note,
        createdAt: session.createdAt,
      })),
      page: paged.page,
      pageSize,
      total: paged.total,
      totalPages: paged.totalPages,
      rows: formatCategories(paged.rows),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          normalizeText((e as { message?: string } | null)?.message) ||
          "Unable to load cart inventory.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  const cronSecretFromBody =
    typeof body?._cronSecret === "string" ? body._cronSecret.trim() : "";
  const cronSecretEnv = (process.env.CRON_SECRET || "").trim();
  const bodyCronAuth =
    Boolean(cronSecretEnv && cronSecretFromBody === cronSecretEnv);
  if (bodyCronAuth && "_cronSecret" in body) delete body._cronSecret;

  if (!isRequestAuthed(req) && !isCronAuthed(req) && !bodyCronAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let action = "";
  let shop = "";

  try {
    action = normalizeLower(body?.action) || "stage-add";

    const availableShops = await getAvailableShops();
    const requestedShop = normalizeShopDomain(normalizeText(body?.shop) || "") || "";
    shop = requestedShop || resolveFallbackShop(availableShops) || "";

    if (action === "stage-add") {
      const incomingRaw = Array.isArray(body?.rows) ? body.rows : [];
      const incoming = incomingRaw
        .map((row: unknown, index: number) => parseIncomingParent(row, index))
        .filter((row: StagingParent | null): row is StagingParent => Boolean(row));

      if (incoming.length < 1) {
        return NextResponse.json(
          { error: "rows[] is required for stage-add action." },
          { status: 400 }
        );
      }

      const current = await listCartCatalogParents(shop);

      // --- Phase 1: SKU/UPC dedup ---
      // Build lookup maps from existing cart items so incoming LS rows
      // match existing Shopify-pulled items even if parent_id differs.
      const existingBySku = new Map<string, StagingParent>();
      const existingByUpc = new Map<string, StagingParent>();
      const existingByParentId = new Map<string, StagingParent>();
      for (const p of current.data) {
        const pId = normalizeLower(p.id);
        if (pId) existingByParentId.set(pId, p);
        const pSku = normalizeLower(p.sku);
        if (pSku) existingBySku.set(pSku, p);
        for (const v of p.variants) {
          const vSku = normalizeLower(v.sku);
          const vUpc = normalizeLower(v.upc);
          if (vSku) existingBySku.set(vSku, p);
          if (vUpc) existingByUpc.set(vUpc, p);
        }
      }

      const addMissingVariants = body?.addMissingVariants === true;
      const createIfMissing = body?.createIfMissing === true;
      let mergedCount = 0;
      let addedVariants = 0;
      let skippedUnmatched = 0;
      let createdParents = 0;
      const reconciledByParentId = new Map<string, StagingParent>();
      const changedParentIds = new Set<string>();
      const matchedByIncomingParentId = new Map<string, StagingParent>();
      for (const inc of incoming) {
        const incSku = normalizeLower(inc.sku);
        const incomingParentId = normalizeLower(inc.id);

        // Find existing cart item by SKU, then fallback to variant UPC
        let match: StagingParent | undefined;
        if (incomingParentId) match = matchedByIncomingParentId.get(incomingParentId);
        if (!match && incSku) match = existingBySku.get(incSku);
        if (!match) {
          for (const v of inc.variants) {
            const vSku = normalizeLower(v.sku);
            if (vSku && existingBySku.has(vSku)) { match = existingBySku.get(vSku); break; }
          }
        }
        if (!match) {
          if (incomingParentId) {
            match = existingByParentId.get(incomingParentId);
          }
        }

        if (!match) {
          if (createIfMissing) {
            const newParentId = normalizeText(inc.id) || `sku:${normalizeLower(inc.sku || `queued-${Date.now()}`)}`;
            const newParentKey = normalizeLower(newParentId);
            const target = reconciledByParentId.get(newParentKey) || {
              ...inc,
              id: newParentId,
              status: "PENDING" as const,
              processedCount: 0,
              pendingCount: (inc.variants || []).length,
              errorCount: 0,
              variants: (inc.variants || []).map((v) => ({
                ...v,
                parentId: newParentId,
                cartId: normalizeText(v.cartId),
                shopifyMatched: Boolean(v.shopifyMatched),
              })),
            };
            if (!reconciledByParentId.has(newParentKey)) {
              reconciledByParentId.set(newParentKey, target);
              createdParents += 1;
            }
            if (incomingParentId) {
              matchedByIncomingParentId.set(incomingParentId, target);
            }
            changedParentIds.add(newParentKey);
            mergedCount++;
            continue;
          }
          skippedUnmatched++;
          continue;
        }

        let changedThisIncoming = false;
        const parentId = normalizeLower(match.id);
        const target = reconciledByParentId.get(parentId) || {
          ...match,
          variants: [...match.variants],
          description: inc.description || match.description,
        };
        if (!reconciledByParentId.has(parentId)) {
          reconciledByParentId.set(parentId, target);
        }
        if (incomingParentId) {
          matchedByIncomingParentId.set(incomingParentId, target);
        }

        for (const incV of inc.variants) {
          const incVSku = normalizeLower(incV.sku);
          const incVUpc = normalizeLower(incV.upc);
          // SKU is the variant identity. UPC is parent context and may repeat
          // across sibling variants, so only use UPC fallback when it's unique.
          let existingIdx = target.variants.findIndex((ev) =>
            incVSku && normalizeLower(ev.sku) === incVSku
          );
          if (existingIdx < 0 && !addMissingVariants && !incVSku && incVUpc) {
            const upcMatches = target.variants
              .map((ev, idx) => ({ idx, upc: normalizeLower(ev.upc) }))
              .filter((entry) => entry.upc === incVUpc);
            if (upcMatches.length === 1) {
              existingIdx = upcMatches[0].idx;
            }
          }

          if (existingIdx >= 0) {
            const existingV = target.variants[existingIdx];
            target.variants[existingIdx] = {
              ...existingV,
              ...incV,
              parentId: target.id,
              cartId: existingV?.cartId || incV.cartId,
              shopifyMatched: existingV?.shopifyMatched || incV.shopifyMatched,
            };
            changedThisIncoming = true;
            continue;
          }

          if (addMissingVariants) {
            target.variants.push({
              ...incV,
              parentId: target.id,
              cartId: "",
              shopifyMatched: false,
              status: "PENDING",
            });
            changedThisIncoming = true;
            addedVariants++;
          }
        }

        if (inc.description && !target.description) {
          target.description = inc.description;
          changedThisIncoming = true;
        }

        if (changedThisIncoming) {
          changedParentIds.add(parentId);
          mergedCount++;
        }
      }

      const reconciled = Array.from(reconciledByParentId.entries())
        .filter(([parentId]) => changedParentIds.has(parentId))
        .map(([, parent]) => parent);

      const undoOps = buildUndoForStageAdd(current.data, reconciled);
      const saved = await upsertCartCatalogParents(shop, reconciled);

      const parentIds = reconciled.map((row: StagingParent) => row.id).filter(Boolean);
      await logStageAdd(shop, parentIds);

      const session =
        undoOps.length > 0
          ? createUndoSession({
            shop,
            target: "cart_inventory",
            action: "stage-add",
            note: `Queued ${reconciled.length} parent item(s) to Cart Inventory.`,
            operations: undoOps,
          })
          : null;

      return NextResponse.json({
        ok: true,
        action,
        shop,
        upserted: saved.data.upserted,
        merged: mergedCount,
        createdParents,
        addedVariants,
        skippedUnmatched,
        warning: [saved.warning, current.warning].filter(Boolean).join(" ").trim(),
        undoSession: session
          ? {
            id: session.id,
            target: session.target,
            action: session.action,
            note: session.note,
            createdAt: session.createdAt,
          }
          : null,
      });
    }

    if (action === "stage-remove") {
      const syncToggles = await loadSyncToggles(shop || "__default__");
      if (!syncToggles.shopifySyncEnabled) {
        return NextResponse.json(
          { error: "Shopify sync is disabled for this module. Enable it in the sync toggles to remove/archive products." },
          { status: 403 }
        );
      }
      const requestedIds = parseIds(body?.parentIds);
      if (requestedIds.length < 1) {
        return NextResponse.json(
          { error: "parentIds[] is required for stage-remove action." },
          { status: 400 }
        );
      }

      const removeProductGids = Array.isArray(body?.removeProductGids)
        ? (body.removeProductGids as unknown[])
          .map((v) => normalizeText(v))
          .filter((gid) => gid && gid.startsWith("gid://shopify/Product/"))
        : [];

      const current = await listCartCatalogParents(shop);
      const requestedSet = new Set(requestedIds.map((id) => normalizeLower(id)));
      const parentIds = current.data
        .filter((p) => requestedSet.has(normalizeLower(p.id)))
        .map((p) => p.id);

      if (parentIds.length < 1) {
        return NextResponse.json(
          { error: "No matching items found in Cart for the selected IDs. The list may have changed." },
          { status: 400 }
        );
      }

      const undoOps = buildUndoForStageRemove(current.data, parentIds);
      const removed = await removeCartCatalogParents(shop, parentIds);

      if (!removed.ok || removed.data.removed < 1) {
        const msg = removed.warning || "Failed to remove items from Carts Inventory staging.";
        return NextResponse.json(
          { error: msg, removed: removed.data.removed },
          { status: 400 }
        );
      }

      let archivedInShopify = 0;
      if (removeProductGids.length > 0) {
        const token =
          (await getTokenForShop(shop)) || getShopifyAdminToken(shop);
        const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
        if (token) {
          for (const productGid of removeProductGids) {
            const updRes = await runShopifyGraphql<ProductUpdateResponse>({
              shop,
              token,
              query: `mutation productUpdate($product: ProductUpdateInput!) {
                productUpdate(product: $product) {
                  product { id }
                  userErrors { message }
                }
              }`,
              variables: {
                product: { id: productGid, status: "ARCHIVED" },
              },
              apiVersion: API_VERSION,
            });
            if (updRes.ok && !(updRes.data?.productUpdate?.userErrors?.length)) {
              archivedInShopify += 1;
            }
          }
        }
      }

      const session =
        undoOps.length > 0
          ? createUndoSession({
            shop,
            target: "cart_inventory",
            action: "stage-remove",
            note: `Removed ${parentIds.length} parent item(s) from Cart Inventory.`,
            operations: undoOps,
          })
          : null;

      const freshListed = await listCartCatalogParents(shop);
      const freshSorted = [...freshListed.data].sort((a, b) => compareText(a.sku, b.sku));
      const f = (body?.filters as Record<string, unknown>) || {};
      const filters: CartFilters = {
        sku: normalizeText(f.SKU ?? f.sku),
        parentSku: normalizeText(f.ParentSKU ?? f.parentSku),
        name: normalizeText(f.Name ?? f.name),
        brand: normalizeText(f.Brand ?? f.brand),
        priceFrom: parseNumber(f.PriceFrom ?? f.priceFrom),
        priceTo: parseNumber(f.PriceTo ?? f.priceTo),
        stockFrom: parseNumber(f.StockFrom ?? f.stockFrom),
        stockTo: parseNumber(f.StockTo ?? f.stockTo),
        stockNull: normalizeText(f.StockNull ?? f.stockNull) || "all",
        status: normalizeText(f.Orderby ?? f.status) || "All",
        categoryName: normalizeText(f.CategoryName ?? f.categoryName),
        keyword: normalizeText(f.Keyword ?? f.keyword),
        lsSource: normalizeText(f.LSSource ?? f.lsSource) || "All",
        shopifySource: normalizeText(f.ShopifySource ?? f.shopifySource) || "All",
        shopifySkuCoverage:
          normalizeText(f.ShopifySkuCoverage ?? f.shopifySkuCoverage) || "All",
        hasDescription: normalizeText(f.HasDescription ?? f.hasDescription) || "All",
        hasImage: normalizeText(f.HasImage ?? f.hasImage) || "All",
        matrixStockFrom: parseNumber(f.MatrixStockFrom ?? f.matrixStockFrom),
        matrixStockTo: parseNumber(f.MatrixStockTo ?? f.matrixStockTo),
        matrixPriceFrom: parseNumber(f.MatrixPriceFrom ?? f.matrixPriceFrom),
        matrixPriceTo: parseNumber(f.MatrixPriceTo ?? f.matrixPriceTo),
        matrixSku: normalizeText(f.MatrixSKU ?? f.matrixSku),
        matrixColor: normalizeText(f.MatrixColor ?? f.matrixColor),
        matrixSize: normalizeText(f.MatrixSize ?? f.matrixSize),
      };
      const strictCoverage = shouldUseStrictShopifySkuCoverage(filters);
      const coverageData = strictCoverage
        ? await loadShopifySkuSet(shop)
        : { skuSet: null as Set<string> | null, warning: "" };
      const freshFiltered = freshSorted.filter((row) =>
        rowMatchesFilters(row, filters, coverageData.skuSet)
      );
      const reqPage = parsePositiveInt(body?.page, 1);
      const reqPageSize = parsePageSize(body?.pageSize);
      const freshPaged = toPagedRows(freshFiltered, reqPage, reqPageSize);
      const totalItems = freshFiltered.reduce((sum, row) => sum + row.variations, 0);
      const totalProcessed = freshFiltered.reduce((sum, row) => sum + row.processedCount, 0);
      const totalPending = freshFiltered.reduce((sum, row) => sum + row.pendingCount, 0);
      const totalErrors = freshFiltered.reduce((sum, row) => sum + row.errorCount, 0);

      return NextResponse.json({
        ok: true,
        action,
        shop,
        removed: removed.data.removed,
        archivedInShopify,
        warning: [removed.warning, current.warning, coverageData.warning].filter(Boolean).join(" ").trim(),
        undoSession: session
          ? {
            id: session.id,
            target: session.target,
            action: session.action,
            note: session.note,
            createdAt: session.createdAt,
          }
          : null,
        rows: formatCategories(freshPaged.rows),
        page: freshPaged.page,
        pageSize: reqPageSize,
        total: freshPaged.total,
        totalPages: freshPaged.totalPages,
        summary: {
          totalProducts: freshFiltered.length,
          totalItems,
          totalProcessed,
          totalPending,
          totalErrors,
        },
        options: {
          categories: Array.from(new Set(freshSorted.map((row) => normalizeText(row.category).replace(/[\\\/]/g, " >> ")).filter(Boolean))).sort(compareText),
          brands: Array.from(new Set(freshSorted.map((row) => normalizeText(row.brand)).filter(Boolean))).sort(compareText),
        },
        undoSessions: listUndoSessions(shop, "cart_inventory", 8).map((s) => ({
          id: s.id,
          target: s.target,
          action: s.action,
          note: s.note,
          createdAt: s.createdAt,
        })),
      });
    }

    if (action === "set-status") {
      const parentIds = parseIds(body?.parentIds);
      const status = toSyncStatus(body?.status);
      if (parentIds.length < 1) {
        return NextResponse.json(
          { error: "parentIds[] is required for set-status action." },
          { status: 400 }
        );
      }

      const current = await listCartCatalogParents(shop);
      const undoOps = buildUndoForStageRemove(current.data, parentIds);
      const updated = await updateCartCatalogStatus(shop, parentIds, status);

      const session =
        undoOps.length > 0
          ? createUndoSession({
            shop,
            target: "cart_inventory",
            action: "set-status",
            note: `Updated ${parentIds.length} parent item(s) to ${status}.`,
            operations: undoOps,
          })
          : null;

      return NextResponse.json({
        ok: true,
        action,
        shop,
        updated: updated.data.updated,
        status,
        warning: [updated.warning, current.warning].filter(Boolean).join(" ").trim(),
        undoSession: session
          ? {
            id: session.id,
            target: session.target,
            action: session.action,
            note: session.note,
            createdAt: session.createdAt,
          }
          : null,
      });
    }

    if (action === "undo-session") {
      const requestedSessionId = normalizeText(body?.sessionId);
      const session = takeUndoSession(shop, requestedSessionId || undefined);
      if (!session) {
        return NextResponse.json(
          { error: "No undo session found for this shop." },
          { status: 404 }
        );
      }
      if (session.target !== "cart_inventory") {
        return NextResponse.json(
          { error: "Requested undo session does not belong to Cart Inventory." },
          { status: 400 }
        );
      }

      for (let index = session.operations.length - 1; index >= 0; index -= 1) {
        const operation = session.operations[index];
        await applyUndoOperation(shop, operation);
      }

      return NextResponse.json({
        ok: true,
        action,
        shop,
        undoneSession: {
          id: session.id,
          target: session.target,
          action: session.action,
          note: session.note,
          createdAt: session.createdAt,
        },
      });
    }

    if (action === "list-sessions") {
      return NextResponse.json({
        ok: true,
        action,
        shop,
        sessions: listUndoSessions(shop, "cart_inventory", 25).map((session) => ({
          id: session.id,
          target: session.target,
          action: session.action,
          note: session.note,
          createdAt: session.createdAt,
        })),
      });
    }

    if (action === "archive-products") {
      const gids = Array.isArray(body?.productGids) ? body.productGids as string[] : [];
      if (gids.length < 1) {
        return NextResponse.json({ error: "productGids[] required." }, { status: 400 });
      }
      const token = await getTokenForShop(shop);
      if (!token) {
        return NextResponse.json({ error: "No Shopify token." }, { status: 401 });
      }
      const apiVer = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
      let archived = 0;
      for (const gid of gids) {
        const res = await runShopifyGraphql<ProductUpdateResponse>({
          shop, token,
          query: `mutation productUpdate($product: ProductUpdateInput!) {
            productUpdate(product: $product) { product { id } userErrors { message } }
          }`,
          variables: { product: { id: gid, status: "ARCHIVED" } },
          apiVersion: apiVer,
        });
        if (res.ok && !(res.data?.productUpdate?.userErrors?.length)) archived += 1;
      }
      return NextResponse.json({ ok: true, action, shop, archived });
    }

    if (action === "activate-products") {
      const gids = Array.isArray(body?.productGids) ? body.productGids as string[] : [];
      if (gids.length < 1) {
        return NextResponse.json({ error: "productGids[] required." }, { status: 400 });
      }
      const token = await getTokenForShop(shop);
      if (!token) {
        return NextResponse.json({ error: "No Shopify token." }, { status: 401 });
      }
      const apiVer = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
      let activated = 0;
      for (const gid of gids) {
        const res = await runShopifyGraphql<ProductUpdateResponse>({
          shop, token,
          query: `mutation productUpdate($product: ProductUpdateInput!) {
            productUpdate(product: $product) { product { id } userErrors { message } }
          }`,
          variables: { product: { id: gid, status: "ACTIVE" } },
          apiVersion: apiVer,
        });
        if (res.ok && !(res.data?.productUpdate?.userErrors?.length)) activated += 1;
      }
      return NextResponse.json({ ok: true, action, shop, activated });
    }

    if (action === "relink-products") {
      const pairs = Array.isArray(body?.pairs) ? body.pairs as Array<{ goodProductId: string }> : [];
      if (pairs.length < 1) {
        return NextResponse.json({ error: "pairs[] required with goodProductId." }, { status: 400 });
      }
      const token = await getTokenForShop(shop);
      if (!token) return NextResponse.json({ error: "No Shopify token." }, { status: 401 });
      const apiVer = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

      const goodGids = pairs.map((p) => {
        const id = String(p.goodProductId).trim();
        return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
      });

      const BATCH = 50;
      const skuToVariantGid = new Map<string, string>();
      const barcodeToVariantGid = new Map<string, string>();
      const titleToVariantGids = new Map<string, Array<{ gid: string; sku: string; barcode: string }>>();

      for (let i = 0; i < goodGids.length; i += BATCH) {
        const chunk = goodGids.slice(i, i + BATCH);
        const gidList = chunk.map((g) => `"${g}"`).join(",");
        const res = await runShopifyGraphql<{
          nodes?: Array<{ id: string; title: string; status: string; variants?: { nodes: Array<{ id: string; sku?: string; barcode?: string }> } } | null>;
        }>({
          shop, token,
          query: `query { nodes(ids: [${gidList}]) { ... on Product { id title status variants(first: 100) { nodes { id sku barcode } } } } }`,
          variables: {},
          apiVersion: apiVer,
        });
        for (const node of (res.data?.nodes || [])) {
          if (!node?.id) continue;
          const titleLower = (node.title || "").trim().toLowerCase();
          const variants = node.variants?.nodes || [];
          const varList: Array<{ gid: string; sku: string; barcode: string }> = [];
          for (const v of variants) {
            const sku = (v.sku || "").trim().toLowerCase();
            const barcode = (v.barcode || "").trim().toLowerCase();
            if (sku) skuToVariantGid.set(sku, v.id);
            if (barcode) barcodeToVariantGid.set(barcode, v.id);
            varList.push({ gid: v.id, sku, barcode });
          }
          if (titleLower) titleToVariantGids.set(titleLower, varList);
        }
      }

      const goodVariantGidSet = new Set<string>();
      for (const [, gid] of skuToVariantGid) goodVariantGidSet.add(gid);
      for (const [, gid] of barcodeToVariantGid) goodVariantGidSet.add(gid);

      const current = await listCartCatalogParents(shop);

      let relinked = 0;
      let variantsFixed = 0;
      const updated: StagingParent[] = [];

      for (const parent of current.data) {
        let changed = false;
        const titleLower = (parent.title || "").trim().toLowerCase();
        const goodVars = titleToVariantGids.get(titleLower);
        if (!goodVars) continue;

        for (const variant of parent.variants) {
          const currentCartId = (variant.cartId || "").trim();
          const alreadyGood = goodVariantGidSet.has(currentCartId);
          if (alreadyGood) continue;

          const vSku = (variant.sku || "").trim().toLowerCase();
          const vUpc = (variant.upc || "").trim().toLowerCase();

          let newGid = "";
          if (vSku) newGid = skuToVariantGid.get(vSku) || "";
          if (!newGid && vUpc) newGid = barcodeToVariantGid.get(vUpc) || "";

          if (newGid && newGid !== currentCartId) {
            variant.cartId = newGid;
            changed = true;
            variantsFixed++;
          }
        }

        if (changed) {
          updated.push(parent);
          relinked++;
        }
      }

      if (updated.length > 0) {
        await upsertCartCatalogParents(shop, updated);
      }

      return NextResponse.json({
        ok: true,
        action,
        shop,
        relinked,
        variantsFixed,
        skusAvailable: skuToVariantGid.size,
        message: `Relinked ${relinked} product(s), fixed ${variantsFixed} variant cartId(s).`,
      });
    }

    if (action === "activate-archived") {
      const syncToggles = await loadSyncToggles(shop || "__default__");
      if (!syncToggles.shopifySyncEnabled) {
        return NextResponse.json(
          { error: "Shopify sync is disabled for this module. Enable it in the sync toggles." },
          { status: 403 }
        );
      }
      const result = await runActivateArchivedInCart(shop);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        action,
        shop,
        activated: result.activated ?? 0,
        message: `Activated ${result.activated ?? 0} archived product(s) that are in Cart.`,
      });
    }

    if (action === "match-to-ls-matrix") {
      if (!shop) {
        return NextResponse.json({ error: "Shop is required for match-to-ls-matrix." }, { status: 400 });
      }
      try {
        const origin = req.nextUrl.origin;
        const result = await runMatchToLSMatrix(shop, origin);
        return NextResponse.json({
          ok: true,
          action,
          shop,
          matched: result.matched,
          skipped: result.skipped,
          enriched: result.enriched,
          errors: result.errors,
          warning: result.warning,
          message: `Matched ${result.matched} product(s) to LS matrix. ${result.skipped} skipped (no LS match).${result.enriched ? ` Enriched ${result.enriched} existing product(s) with LS data.` : ""}`,
        });
      } catch (e) {
        const message = (e as Error)?.message || "Match to LS matrix failed.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (action === "image-sync-test") {
      const { runImageSync, loadImageSyncSettings } = await import("@/lib/lightspeedImageSyncOrchestrator");
      const targetIds = parseIds(body?.parentIds);
      const dryRun = body?.dryRun === true;
      const forceRun = body?.forceRun === true;

      if (body?.directTest) {
        const { syncImagesToLsMatrix, syncImagesToLsItem, listLsImages } = await import("@/lib/lightspeedImageSync");
        const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls as string[] : [];
        const matrixId = typeof body.matrixId === "string" ? body.matrixId : null;
        const itemId = typeof body.itemId === "string" ? body.itemId : null;
        const deleteFirst = body.deleteFirst !== false;
        const title = typeof body.title === "string" ? body.title : "Test Product";

        if (imageUrls.length === 0 || (!matrixId && !itemId)) {
          return NextResponse.json({ error: "directTest requires imageUrls[] and matrixId or itemId" }, { status: 400 });
        }

        const before = matrixId
          ? await listLsImages({ itemMatrixID: matrixId })
          : await listLsImages({ itemID: itemId! });

        const syncResult = matrixId
          ? await syncImagesToLsMatrix({ itemMatrixID: matrixId, shopifyImageUrls: imageUrls, productTitle: title, deleteFirst })
          : await syncImagesToLsItem({ itemID: itemId!, shopifyImageUrls: imageUrls, productTitle: title, deleteFirst });

        const after = matrixId
          ? await listLsImages({ itemMatrixID: matrixId })
          : await listLsImages({ itemID: itemId! });

        return NextResponse.json({
          ok: true,
          action: "direct-test",
          before: { count: before.length, images: before.map((i) => ({ id: i.imageID, filename: i.filename, size: i.size })) },
          syncResult,
          after: { count: after.length, images: after.map((i) => ({ id: i.imageID, filename: i.filename, size: i.size })) },
        });
      }

      if (targetIds.length === 0) {
        const allParents = (await listCartCatalogParents(shop)).data;
        const lsMatched = allParents.filter(
          (p) => p.id.toLowerCase().startsWith("matrix:") || p.id.toLowerCase().startsWith("sku:")
        );
        return NextResponse.json({
          ok: true,
          action: "list-candidates",
          total: lsMatched.length,
          candidates: lsMatched.slice(0, 20).map((p) => ({
            id: p.id,
            title: p.title,
            sku: p.sku,
            image: p.image,
            variants: p.variants.length,
            hasImages: Boolean(p.image),
          })),
        });
      }

      if (forceRun) {
        const result = await runImageSync(shop, {
          parentIds: targetIds,
          dryRun,
          settingsOverride: { pushShopifyImagesToLS: true, deleteExistingLSImages: true },
        });
        return NextResponse.json({ ok: true, action: "image-sync-test", result });
      }

      const result = await runImageSync(shop, { parentIds: targetIds, dryRun });
      return NextResponse.json({ ok: true, action: "image-sync-test", result });
    }

    // Push to Shopify: Manual or via cron (/api/cron/cart-sync). Cron auth via CRON_SECRET.
    if (action === "push-selected" || action === "push-all") {
      const syncToggles = await loadSyncToggles(shop || "__default__");
      if (!syncToggles.shopifySyncEnabled) {
        return NextResponse.json(
          { error: "Shopify sync is disabled for this module. Enable it in the sync toggles to push to Shopify." },
          { status: 403 }
        );
      }
      const notificationEmail = typeof body?.notificationEmail === "string" && body.notificationEmail.trim()
        ? body.notificationEmail.trim()
        : (process.env.PUSH_NOTIFICATION_EMAIL || "").trim() || null;

      const parentIds =
        action === "push-selected"
          ? parseIds(body?.parentIds)
          : (await listCartCatalogParents(shop)).data.map((p) => p.id);

      if (parentIds.length < 1) {
        const err = "No items selected for push and no products to remove.";
        if (notificationEmail) {
          void sendPushNotificationEmail({
            to: notificationEmail,
            shop,
            success: false,
            pushed: 0,
            totalVariants: 0,
            markedProcessed: 0,
            removedFromShopify: 0,
            error: err,
            items: [],
          }).catch(() => { });
        }
        return NextResponse.json({ error: err }, { status: 400 });
      }


      if (body?.background === true) {
        const startedAt = new Date().toISOString();
        const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://127.0.0.1:${process.env.PORT || 3000}`;
        const bgPublicationIds = Array.isArray(body?.publicationIds)
          ? (body.publicationIds as string[]).filter((id) => typeof id === "string" && id.trim())
          : [];
        const bgCatalogIds = Array.isArray(body?.catalogIds)
          ? (body.catalogIds as string[]).filter((id) => typeof id === "string" && id.trim())
          : [];
        const pushPayload: Record<string, unknown> = {
          action,
          shop,
          parentIds,
          background: false,
          publicationIds: bgPublicationIds,
          catalogIds: bgCatalogIds,
        };
        if (notificationEmail) pushPayload.notificationEmail = notificationEmail;
        const cookie = req.headers.get("cookie");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const cronSecret = (process.env.CRON_SECRET || "").trim();
        if (cronSecret) headers["x-cron-secret"] = cronSecret;
        if (cookie) headers.Cookie = cookie;

        try {
          const { getCloudflareContext } = await import("@opennextjs/cloudflare");
          const { ctx } = getCloudflareContext();
          if (ctx?.waitUntil) {
            console.log("[cart-inventory] Background push started:", { shop, parentCount: parentIds.length });
            ctx.waitUntil(
              fetch(`${origin}/api/shopify/cart-inventory`, {
                method: "POST",
                headers,
                body: JSON.stringify(pushPayload),
              })
            );
            return NextResponse.json(
              {
                ok: true,
                action,
                shop,
                message: "Sync started in background. You can close this page.",
                startedAt,
              },
              { status: 202 }
            );
          }
        } catch {
          /* fallback below */
        }
        // Fallback for runtimes without waitUntil (e.g. Vercel):
        // fire-and-forget self request and return immediately.
        void fetch(`${origin}/api/shopify/cart-inventory`, {
          method: "POST",
          headers,
          body: JSON.stringify(pushPayload),
        }).catch(() => { });
        return NextResponse.json(
          {
            ok: true,
            action,
            shop,
            message: "Sync started in background. You can keep navigating.",
            startedAt,
          },
          { status: 202 }
        );
      }

      const publicationIds = Array.isArray(body?.publicationIds)
        ? (body.publicationIds as string[]).filter((id) => typeof id === "string" && id.trim())
        : [];
      const catalogIds = Array.isArray(body?.catalogIds)
        ? (body.catalogIds as string[]).filter((id) => typeof id === "string" && id.trim())
        : [];

      const result = await runCartPushAll(shop, {
        notificationEmail,
        parentIds,
        publicationIds,
        catalogIds,
      });

      if (!result.ok) {
        const status = result.error?.toLowerCase().includes("token") ? 401 : 400;
        return NextResponse.json({ error: result.error ?? "Push failed" }, { status });
      }

      // Write activity row so UI can poll progress/completion for manual background pushes.
      try {
        const { sqlQuery, ensureSqlReady } = await import("@/lib/sqlDb");
        await ensureSqlReady();
        const debug = (result.debug || {}) as {
          variantsAddedToExisting?: number;
          addVariantErrors?: string[];
          inventoryErrors?: string[];
        };
        const errCount =
          Number(debug.addVariantErrors?.length || 0) +
          Number(debug.inventoryErrors?.length || 0);
        const errText = [
          ...(Array.isArray(debug.addVariantErrors) ? debug.addVariantErrors : []),
          ...(Array.isArray(debug.inventoryErrors) ? debug.inventoryErrors : []),
        ]
          .join("; ")
          .slice(0, 2000);

        await sqlQuery(
          `INSERT INTO shopify_cart_sync_activity
             (shop, synced_at, items_checked, items_updated, variants_added, variants_deleted, products_archived, errors, error_details, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            shop,
            new Date().toISOString(),
            Number(result.totalVariants || 0),
            Number(result.pushed || 0),
            Number(debug.variantsAddedToExisting || 0),
            0,
            Number(result.archivedNotInCart || 0),
            errCount,
            errText || null,
            0,
          ]
        );
      } catch {
        // best-effort log only
      }

      return NextResponse.json({
        ok: true,
        action,
        shop,
        pushed: result.pushed ?? 0,
        productsCreated: result.productsCreated ?? 0,
        totalVariants: result.totalVariants ?? 0,
        markedProcessed: result.markedProcessed ?? 0,
        removedFromShopify: result.removedFromShopify ?? 0,
        archivedNotInCart: result.archivedNotInCart ?? 0,
        debug: result.debug,
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    const errMsg = normalizeText(err?.message) || "Unable to process cart inventory action.";
    const logParts: string[] = [];
    if (err?.name) logParts.push(err.name);
    logParts.push(errMsg);
    if (err?.code) logParts.push(`[code: ${err.code}]`);
    if (err?.stack) {
      const stackLines = err.stack.split("\n").slice(0, 6).join("\n");
      logParts.push("\nStack:\n" + stackLines);
    }
    const logDetail = logParts.join(" ").trim() || String(e);
    console.error("[cart-inventory] Error:", errMsg, e);

    if ((action === "push-selected" || action === "push-all") && shop) {
      const notificationEmail =
        (typeof body?.notificationEmail === "string" && body.notificationEmail.trim()) ||
        (process.env.PUSH_NOTIFICATION_EMAIL || "").trim() ||
        null;
      if (notificationEmail) {
        void sendPushNotificationEmail({
          to: notificationEmail,
          shop,
          success: false,
          pushed: 0,
          totalVariants: 0,
          markedProcessed: 0,
          removedFromShopify: 0,
          error: logDetail,
          items: [],
        }).catch(() => { });
      }
    }

    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
