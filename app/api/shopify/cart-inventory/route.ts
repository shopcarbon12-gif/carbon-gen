import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  status: string;
  categoryName: string;
  keyword: string;
};

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
    status: normalizeText(searchParams.get("Orderby")) || "All",
    categoryName: normalizeText(searchParams.get("CategoryName")),
    keyword: normalizeText(searchParams.get("Keyword")),
  };
}

function rowMatchesFilters(parent: StagingParent, filters: CartFilters) {
  const statusFilter = normalizeLower(filters.status);
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "processed" && parent.status !== "PROCESSED") return false;
    if (statusFilter === "pending" && parent.status !== "PENDING") return false;
    if (statusFilter === "error" && parent.status !== "ERROR") return false;
  }

  const skuNeedle = normalizeLower(filters.sku);
  if (skuNeedle) {
    const parentHit = includesText(parent.sku, skuNeedle);
    const variantHit = parent.variants.some((variant) => includesText(variant.sku, skuNeedle));
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
    if (normalizeLower(parent.category) !== categoryNeedle) return false;
  }

  if (filters.priceFrom !== null) {
    if (parent.price === null || parent.price < filters.priceFrom) return false;
  }
  if (filters.priceTo !== null) {
    if (parent.price === null || parent.price > filters.priceTo) return false;
  }

  if (filters.stockFrom !== null) {
    if (parent.stock === null || parent.stock < filters.stockFrom) return false;
  }
  if (filters.stockTo !== null) {
    if (parent.stock === null || parent.stock > filters.stockTo) return false;
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

  return true;
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

function parseVariant(raw: unknown, parentId: string, index: number): StagingVariant {
  const row = (raw || {}) as Partial<StagingVariant> & { availableInShopify?: boolean };
  const matched = Boolean(row.shopifyMatched || row.availableInShopify);
  return {
    id: normalizeText(row.id) || `${parentId}-variant-${index + 1}`,
    parentId,
    sku: normalizeText(row.sku),
    upc: normalizeText(row.upc),
    sellerSku: normalizeText(row.sellerSku),
    cartId: normalizeText(row.cartId),
    stock: parseNumber(row.stock),
    stockByLocation: Array.isArray(row.stockByLocation)
      ? row.stockByLocation.map((stockRow) => {
          const item = (stockRow || {}) as { location?: unknown; qty?: unknown };
          return {
            location: normalizeText(item.location),
            qty: parseNumber(item.qty),
          };
        })
      : [],
    price: parseNumber(row.price),
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
  };

  const id =
    normalizeText(row.id) ||
    normalizeText((raw as { parentId?: unknown } | null)?.parentId) ||
    normalizeText(row.sku) ||
    `row-${index + 1}`;
  const sku = normalizeText(row.sku);
  if (!id || !sku) return null;

  const variants = Array.isArray(row.variants)
    ? row.variants.map((variant, variantIndex) => parseVariant(variant, id, variantIndex))
    : [];

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
    title: normalizeText(row.title) || sku,
    category: normalizeText(row.category),
    brand: normalizeText(row.brand),
    sku,
    stock: parseNumber(row.stock),
    price: parseNumber(row.price),
    variations: variants.length,
    image: normalizeText(row.image),
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

async function getAvailableShops() {
  let dbShops: string[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("shop,installed_at")
      .order("installed_at", { ascending: false })
      .limit(100);
    if (!error && Array.isArray(data)) {
      dbShops = data
        .map((row) =>
          normalizeShopDomain(normalizeText((row as { shop?: string } | null)?.shop) || "")
        )
        .filter((shop): shop is string => Boolean(shop));
    }
  } catch {
    // Optional fallback path when Supabase is unavailable.
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

    const listed = await listCartCatalogParents(shop);
    const sorted = [...listed.data].sort((a, b) => compareText(a.sku, b.sku));
    const filtered = sorted.filter((row) => rowMatchesFilters(row, filters));
    const paged = toPagedRows(filtered, page, pageSize);

    const categories = Array.from(
      new Set(sorted.map((row) => normalizeText(row.category)).filter(Boolean))
    ).sort(compareText);
    const brands = Array.from(
      new Set(sorted.map((row) => normalizeText(row.brand)).filter(Boolean))
    ).sort(compareText);
    const totalItems = filtered.reduce((sum, row) => sum + row.variations, 0);
    const totalProcessed = filtered.reduce((sum, row) => sum + row.processedCount, 0);
    const totalPending = filtered.reduce((sum, row) => sum + row.pendingCount, 0);
    const totalErrors = filtered.reduce((sum, row) => sum + row.errorCount, 0);

    return NextResponse.json({
      ok: true,
      shop,
      shops: availableShops,
      warning: listed.warning || "",
      options: {
        categories,
        brands,
        statuses: ["All", "Processed", "Pending", "Error"],
      },
      summary: {
        totalProducts: filtered.length,
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
      rows: paged.rows,
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
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = normalizeLower(body?.action) || "stage-add";

    const availableShops = await getAvailableShops();
    const requestedShop = normalizeShopDomain(normalizeText(body?.shop) || "") || "";
    const shop = requestedShop || resolveFallbackShop(availableShops) || "";

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
      const undoOps = buildUndoForStageAdd(current.data, incoming);
      const saved = await upsertCartCatalogParents(shop, incoming);

      const session =
        undoOps.length > 0
          ? createUndoSession({
              shop,
              target: "cart_inventory",
              action: "stage-add",
              note: `Queued ${incoming.length} parent item(s) to Cart Inventory.`,
              operations: undoOps,
            })
          : null;

      return NextResponse.json({
        ok: true,
        action,
        shop,
        upserted: saved.data.upserted,
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
      const parentIds = parseIds(body?.parentIds);
      if (parentIds.length < 1) {
        return NextResponse.json(
          { error: "parentIds[] is required for stage-remove action." },
          { status: 400 }
        );
      }

      const current = await listCartCatalogParents(shop);
      const undoOps = buildUndoForStageRemove(current.data, parentIds);
      const removed = await removeCartCatalogParents(shop, parentIds);

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

      return NextResponse.json({
        ok: true,
        action,
        shop,
        removed: removed.data.removed,
        warning: [removed.warning, current.warning].filter(Boolean).join(" ").trim(),
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

    if (action === "push-selected" || action === "push-all") {
      return NextResponse.json(
        {
          error:
            "Shopify push is intentionally disabled until you approve sync execution.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error:
          normalizeText((e as { message?: string } | null)?.message) ||
          "Unable to process cart inventory action.",
      },
      { status: 500 }
    );
  }
}
