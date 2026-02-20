import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed, isCronAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

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
    stockNull: normalizeText(searchParams.get("StockNull")) || "all",
    status: normalizeText(searchParams.get("Orderby")) || "All",
    categoryName: normalizeText(searchParams.get("CategoryName")),
    keyword: normalizeText(searchParams.get("Keyword")),
    lsSource: normalizeText(searchParams.get("LSSource")) || "All",
  };
}

function isInLightspeedCatalog(parentId: string): boolean {
  const id = normalizeText(parentId).toLowerCase();
  return id.startsWith("matrix:") || id.startsWith("sku:");
}

function rowMatchesFilters(parent: StagingParent, filters: CartFilters) {
  const lsSourceFilter = normalizeLower(filters.lsSource);
  if (lsSourceFilter && lsSourceFilter !== "all") {
    const inLs = isInLightspeedCatalog(parent.id);
    if (lsSourceFilter === "inls" && !inLs) return false;
    if (lsSourceFilter === "notinls" && inLs) return false;
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

async function getTokenForShop(shop: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();
    const dbToken = !error ? normalizeText((data as { access_token?: string } | null)?.access_token) : "";
    if (dbToken) return dbToken;
  } catch {
    // fallback to env
  }
  const envToken = getShopifyAdminToken(shop);
  return envToken || null;
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
  if (!isRequestAuthed(req) && !isCronAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  let action = "";
  let shop = "";

  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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
      const undoOps = buildUndoForStageAdd(current.data, incoming);
      const saved = await upsertCartCatalogParents(shop, incoming);

      const parentIds = incoming.map((row: StagingParent) => row.id).filter(Boolean);
      await logStageAdd(shop, parentIds);

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

    // Push to Shopify: Manual or via cron (/api/cron/cart-sync). Cron auth via CRON_SECRET.
    if (action === "push-selected" || action === "push-all") {
      const notificationEmail = typeof body?.notificationEmail === "string" && body.notificationEmail.trim()
        ? body.notificationEmail.trim()
        : (process.env.PUSH_NOTIFICATION_EMAIL || "").trim() || null;

      const parentIds =
        action === "push-selected"
          ? parseIds(body?.parentIds)
          : (await listCartCatalogParents(shop)).data.map((p) => p.id);

      const removeProductGids = Array.isArray(body?.removeProductGids)
        ? (body.removeProductGids as unknown[])
            .map((v) => normalizeText(v))
            .filter((gid) => gid && gid.startsWith("gid://shopify/Product/"))
        : [];

      if (parentIds.length < 1 && removeProductGids.length < 1) {
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
          }).catch(() => {});
        }
        return NextResponse.json({ error: err }, { status: 400 });
      }


      if (body?.background === true) {
        try {
          const { getCloudflareContext } = await import("@opennextjs/cloudflare");
          const { ctx } = getCloudflareContext();
          if (ctx?.waitUntil) {
            const origin = req.nextUrl.origin;
            const pushPayload: Record<string, unknown> = {
              action,
              shop,
              parentIds,
              removeProductGids,
              background: false,
            };
            if (notificationEmail) pushPayload.notificationEmail = notificationEmail;
            const cookie = req.headers.get("cookie");
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            if (cookie) headers.Cookie = cookie;
            console.log("[cart-inventory] Background push started:", { shop, parentCount: parentIds.length, removalCount: removeProductGids.length });
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
              },
              { status: 202 }
            );
          }
        } catch {
          /* fallback to sync below */
        }
      }

      const current = await listCartCatalogParents(shop);
      const idSet = new Set(parentIds.map((id) => normalizeLower(id)));
      const toPush = current.data.filter((p) => idSet.has(normalizeLower(p.id)));

      const token =
        (await getTokenForShop(shop)) ||
        getShopifyAdminToken(shop);
      if (!token) {
        const err = "Shopify access token not found for this shop.";
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
          }).catch(() => {});
        }
        return NextResponse.json({ error: err }, { status: 401 });
      }

      const API_VERSION =
        (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";

      const locRes = await runShopifyGraphql<{
        locations?: { nodes?: Array<{ id: string }> };
      }>({
        shop,
        token,
        query: `query { locations(first: 5) { nodes { id } } }`,
        apiVersion: API_VERSION,
      });
      const locationId =
        locRes.ok && locRes.data?.locations?.nodes?.[0]?.id
          ? locRes.data.locations.nodes[0].id
          : "";
      if (!locationId) {
        const hint = !locRes.ok
          ? " (Check that SHOPIFY_SCOPES includes read_locations and re-authorize the app)"
          : "";
        const err = `No Shopify location found. Every store has a default location, but the app needs permission to read it. Add read_locations and write_inventory to SHOPIFY_SCOPES in .env, then re-authorize via Settings.${hint}`;
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
          }).catch(() => {});
        }
        return NextResponse.json({ error: err }, { status: 400 });
      }

      const quantities: Array<{
        inventoryItemId: string;
        locationId: string;
        quantity: number;
        compareQuantity: number | null;
      }> = [];

      for (const parent of toPush) {
        for (const v of parent.variants) {
          const cartId = normalizeText(v.cartId);
          if (!cartId) continue;
          const variantGid = cartId.includes("~")
            ? `gid://shopify/ProductVariant/${cartId.split("~")[1] || cartId}`
            : cartId.startsWith("gid://")
              ? cartId
              : `gid://shopify/ProductVariant/${cartId}`;

          const varRes = await runShopifyGraphql<{
            productVariant?: { inventoryItem?: { id: string } };
          }>({
            shop,
            token,
            query: `query($id: ID!) { productVariant(id: $id) { inventoryItem { id } } }`,
            variables: { id: variantGid },
            apiVersion: API_VERSION,
          });
          const invItemId =
            varRes.ok && varRes.data?.productVariant?.inventoryItem?.id
              ? varRes.data.productVariant.inventoryItem.id
              : "";
          if (!invItemId) continue;

          const qty =
            typeof v.stock === "number" && Number.isFinite(v.stock)
              ? Math.max(0, Math.round(v.stock))
              : 0;

          quantities.push({
            inventoryItemId: invItemId,
            locationId,
            quantity: qty,
            compareQuantity: null,
          });
        }
      }

      let pushed = 0;
      if (quantities.length > 0) {
        const BATCH = 100;
        for (let i = 0; i < quantities.length; i += BATCH) {
          const batch = quantities.slice(i, i + BATCH);
          const mutRes = await runShopifyGraphql<{
            inventorySetQuantities?: {
              userErrors?: Array<{ message: string }>;
            };
          }>({
            shop,
            token,
            query: `mutation($input: InventorySetQuantitiesInput!) {
              inventorySetQuantities(input: $input) {
                userErrors { message }
              }
            }`,
            variables: {
              input: {
                name: "available",
                reason: "correction",
                ignoreCompareQuantity: true,
                quantities: batch.map((q) => ({
                  inventoryItemId: q.inventoryItemId,
                  locationId: q.locationId,
                  quantity: q.quantity,
                  compareQuantity: q.compareQuantity,
                })),
              },
            },
            apiVersion: API_VERSION,
          });
          if (mutRes.ok && !(mutRes.data?.inventorySetQuantities?.userErrors?.length)) {
            pushed += batch.length;
          }
        }
      }

      const toMarkProcessed =
        pushed > 0 ? parentIds : [];
      if (toMarkProcessed.length > 0) {
        await updateCartCatalogStatus(shop, toMarkProcessed, "PROCESSED");
      }

      let removedFromShopify = 0;
      if (removeProductGids.length > 0) {
        for (const productGid of removeProductGids) {
          const updRes = await runShopifyGraphql<{
            productUpdate?: { product?: { id: string }; userErrors?: Array<{ message: string }> };
          }>({
            shop,
            token,
            query: `mutation productUpdate($product: ProductUpdateInput!) {
              productUpdate(product: $product) {
                product { id }
                userErrors { message }
              }
            }`,
            variables: {
              product: {
                id: productGid,
                status: "ARCHIVED",
              },
            },
            apiVersion: API_VERSION,
          });
          if (updRes.ok && !(updRes.data?.productUpdate?.userErrors?.length)) {
            removedFromShopify += 1;
          }
        }
      }

      const fullCart = await listCartCatalogParents(shop);
      const cartVariantGids = new Set<string>();
      for (const parent of fullCart.data) {
        for (const v of parent.variants) {
          const cartId = normalizeText(v.cartId);
          if (!cartId) continue;
          const gid = cartId.includes("~")
            ? `gid://shopify/ProductVariant/${cartId.split("~")[1] || cartId}`
            : cartId.startsWith("gid://")
              ? cartId
              : `gid://shopify/ProductVariant/${cartId}`;
          cartVariantGids.add(gid.toLowerCase());
        }
      }

      let archivedNotInCart = 0;
      let shopifyCursor: string | null = null;
      const PRODUCTS_PER_PAGE = 50;
      const MAX_ARCHIVE_PAGES = 100;
      for (let page = 0; page < MAX_ARCHIVE_PAGES; page++) {
        const prodRes: ShopifyGraphqlResult<ProductsPageResponse> =
          await runShopifyGraphql<ProductsPageResponse>({
          shop,
          token,
          query: `query($first: Int!, $after: String) {
            products(first: $first, after: $after, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
              edges { node { id variants(first: 250) { nodes { id } } } }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          variables: { first: PRODUCTS_PER_PAGE, after: shopifyCursor },
          apiVersion: API_VERSION,
        });
        if (!prodRes.ok || !prodRes.data?.products?.edges) break;
        const edges = prodRes.data.products.edges;
        const pageInfo = prodRes.data.products.pageInfo;
        for (const edge of edges) {
          const product = edge?.node;
          if (!product?.id) continue;
          const variantNodes = product.variants?.nodes || [];
          const hasVariantInCart = variantNodes.some((vn) =>
            cartVariantGids.has(normalizeText(vn?.id).toLowerCase())
          );
          if (variantNodes.length > 0 && !hasVariantInCart) {
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
                product: { id: product.id, status: "ARCHIVED" },
              },
              apiVersion: API_VERSION,
            });
            if (updRes.ok && !(updRes.data?.productUpdate?.userErrors?.length)) {
              archivedNotInCart += 1;
            }
          }
        }
        if (!pageInfo?.hasNextPage) break;
        shopifyCursor = pageInfo.endCursor || null;
        if (!shopifyCursor) break;
      }
      removedFromShopify += archivedNotInCart;

      const pushSummary = {
        action,
        shop,
        pushed,
        totalVariants: quantities.length,
        productsProcessed: toMarkProcessed.length,
        removedFromShopify,
        archivedNotInCart,
      };
      console.log("[cart-inventory] Push complete:", JSON.stringify(pushSummary));

      if (notificationEmail) {
        void sendPushNotificationEmail({
          to: notificationEmail,
          shop,
          success: true,
          pushed,
          totalVariants: quantities.length,
          markedProcessed: toMarkProcessed.length,
          removedFromShopify,
          archivedNotInCart,
          items: toPush.map((p) => ({
            sku: normalizeText(p.sku),
            title: normalizeText(p.title),
            brand: normalizeText(p.brand),
            variants: Array.isArray(p.variants) ? p.variants.length : 0,
          })),
        }).catch(() => {});
      }

      return NextResponse.json({
        ok: true,
        action,
        shop,
        pushed,
        totalVariants: quantities.length,
        markedProcessed: toMarkProcessed.length,
        removedFromShopify,
        archivedNotInCart,
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
        }).catch(() => {});
      }
    }

    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
