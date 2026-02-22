/**
 * SKUPlugs-style Workset aggregated stats.
 * Returns: top summary cards, Lightspeed panel, Shopify panel.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import { listCartCatalogParents } from "@/lib/shopifyCartStaging";
import { ensureLightspeedEnvLoaded } from "@/lib/loadLightspeedEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function parseNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseFloat(norm(v));
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number.parseInt(norm(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function getBaseUrl(req: NextRequest): string {
  try {
    const url = new URL(req.url);
    return url.origin;
  } catch {
    return process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  }
}

async function getLightspeedItemCount(baseUrl: string): Promise<number | null> {
  try {
    ensureLightspeedEnvLoaded();
    const res = await fetch(`${baseUrl}/api/lightspeed/catalog/count`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { itemCount?: number };
    return parseIntSafe(json.itemCount);
  } catch {
    return null;
  }
}

async function getShopifyProductCount(baseUrl: string, shop: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${baseUrl}/api/shopify/catalog/count?shop=${encodeURIComponent(shop)}`,
      { cache: "no-store", signal: AbortSignal.timeout(15_000) }
    );
    const json = (await res.json().catch(() => ({}))) as { productCount?: number };
    return parseIntSafe(json.productCount);
  } catch {
    return null;
  }
}

async function getCartInventorySummary(shop: string): Promise<{
  totalItems: number;
  totalProcessed: number;
  totalPending: number;
  totalErrors: number;
}> {
  try {
    const listed = await listCartCatalogParents(shop);
    const rows = listed.data || [];
    return {
      totalItems: rows.reduce((s, r) => s + (r.variations ?? 0), 0),
      totalProcessed: rows.reduce((s, r) => s + (r.processedCount ?? 0), 0),
      totalPending: rows.reduce((s, r) => s + (r.pendingCount ?? 0), 0),
      totalErrors: rows.reduce((s, r) => s + (r.errorCount ?? 0), 0),
    };
  } catch {
    return { totalItems: 0, totalProcessed: 0, totalPending: 0, totalErrors: 0 };
  }
}

type OrdersCountResult = { count: number; ordersError?: string };

async function getOrdersCount(shop: string, token: string): Promise<OrdersCountResult> {
  try {
    const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 1);
    const queryFilter = `created_at:>=${fromDate.toISOString().slice(0, 10)} status:any`;
    let cursor: string | null = null;
    let count = 0;
    const MAX_PAGES = 20;
    for (let p = 0; p < MAX_PAGES; p++) {
      const gqlQuery: string = cursor
        ? `query OrdersPage($after: String, $query: String) {
            orders(first: 250, after: $after, query: $query) {
              pageInfo { hasNextPage endCursor }
              edges { node { id } }
            }
          }`
        : `query OrdersFirst($query: String) {
            orders(first: 250, query: $query) {
              pageInfo { hasNextPage endCursor }
              edges { node { id } }
            }
          }`;
      const variables: Record<string, string> = { query: queryFilter };
      if (cursor) variables.after = cursor;
      const res = await runShopifyGraphql<{
        orders?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          edges?: Array<{ node?: { id?: string } }>;
        };
      }>({
        shop,
        token,
        query: gqlQuery,
        variables,
        apiVersion: API_VERSION,
      });
      if (!res.ok || !res.data?.orders) {
        const errStr = JSON.stringify(res.errors || {}).toLowerCase();
        if (errStr.includes("access denied") || errStr.includes("orders field")) {
          return {
            count: 0,
            ordersError:
              "Re-authorize Shopify in Settings: Disconnect, then Connect again to grant read_orders permission.",
          };
        }
        if (res.errors && (Array.isArray(res.errors) ? res.errors.length : Object.keys(res.errors).length)) {
          const first = Array.isArray(res.errors) ? (res.errors as Array<{ message?: string }>)[0]?.message : null;
          return { count: 0, ordersError: first || String(res.errors).slice(0, 150) };
        }
        break;
      }
      const edges = res.data.orders.edges || [];
      count += edges.length;
      if (!res.data.orders.pageInfo?.hasNextPage || edges.length === 0) break;
      cursor = res.data.orders.pageInfo?.endCursor ?? null;
      if (!cursor) break;
    }
    return { count };
  } catch (e) {
    return { count: 0, ordersError: (e as Error)?.message || "Orders request failed." };
  }
}

async function getShopAndToken(): Promise<{ shop: string; token: string } | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("shopify_tokens")
    .select("shop,access_token")
    .order("installed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const shop = norm((data as { shop?: string })?.shop);
  const token = norm((data as { access_token?: string })?.access_token);
  if (shop && token) return { shop: normalizeShopDomain(shop) || shop, token };
  const envShop = normalizeShopDomain(norm(process.env.SHOPIFY_SHOP_DOMAIN));
  const envToken = envShop ? getShopifyAdminToken(envShop) : null;
  if (envShop && envToken) return { shop: envShop, token: envToken };
  return null;
}

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  try {
    const lsStatusRes = await fetch(`${baseUrl}/api/lightspeed/status`, {
      cache: "no-store",
    });
    const lsStatus = (await lsStatusRes.json().catch(() => ({}))) as {
      connected?: boolean;
      accountId?: string;
      domainPrefix?: string;
    };
    const shopStatusRes = await fetch(`${baseUrl}/api/shopify/status`, {
      cache: "no-store",
    });
    const shopStatus = (await shopStatusRes.json().catch(() => ({}))) as {
      connected?: boolean;
      shop?: string | null;
    };

    const lightspeedConnected = Boolean(lsStatus.connected);
    const shopifyConnected = Boolean(shopStatus.connected && norm(shopStatus.shop));
    const integrationsCount = [lightspeedConnected, shopifyConnected].filter(Boolean).length;

    let lsItemCount: number | null = null;
    if (lightspeedConnected) {
      lsItemCount = await getLightspeedItemCount(baseUrl);
    }

    let shopProductCount: number | null = null;
    let cartSummary = { totalItems: 0, totalProcessed: 0, totalPending: 0, totalErrors: 0 };
    let ordersCount = 0;
    let ordersError: string | undefined;
    const shop = norm(shopStatus.shop);
    if (shopifyConnected && shop) {
      const st = await getShopAndToken();
      if (st) {
        shopProductCount = await getShopifyProductCount(baseUrl, st.shop);
        cartSummary = await getCartInventorySummary(st.shop);
        const ordersResult = await getOrdersCount(st.shop, st.token);
        ordersCount = ordersResult.count;
        ordersError = ordersResult.ordersError;
      }
    }

    const cartItems = cartSummary.totalItems;
    const totalInventory = lsItemCount ?? cartItems ?? shopProductCount ?? 0;
    const lsLabel = `Lightspeed_${norm(lsStatus.accountId) || "—"}`;
    const shopLabel = norm(shop) || "—";

    const inventoryGap =
      lsItemCount != null && cartItems != null && lsItemCount >= cartItems
        ? lsItemCount - cartItems
        : null;

    return NextResponse.json({
      ok: true,
      summaryCards: {
        totalInventory,
        totalOrders: ordersCount,
        totalIntegrations: integrationsCount,
        totalPendingInvoices: 0,
        inventoryGap: inventoryGap ?? undefined,
        ordersError,
      },
      lightspeedPanel: {
        label: lsLabel,
        totalInventory: lsItemCount ?? 0,
        totalOrders: ordersCount,
        totalPendingOrders: 0,
        ordersError,
      },
      shopifyPanel: {
        label: shopLabel,
        totalInventory: cartItems,
        totalProcessed: cartSummary.totalProcessed,
        totalPendings: cartSummary.totalPending,
        totalErrorRecordedItems: cartSummary.totalErrors,
        shopifyProducts: shopProductCount ?? undefined,
        inventoryGap: inventoryGap ?? undefined,
        ordersError,
      },
      lightspeedConnected,
      shopifyConnected,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
