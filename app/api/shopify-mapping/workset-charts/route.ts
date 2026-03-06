/**
 * SKUPlugs-style Workset chart data: Sales, Orders, Top 10 revenue by SKU.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import { listShopifyTokenRecords } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function parseNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(norm(v));
  return Number.isFinite(n) ? n : 0;
}

type DatePoint = { date: string; current: number; previous: number };
type TopRevenueRow = { sku: string; amount: number };

async function getShopAndToken(): Promise<{ shop: string; token: string } | null> {
  const row = (await listShopifyTokenRecords(1))[0];
  const shop = norm(row?.shop);
  const token = norm(row?.accessToken);
  if (shop && token) return { shop: normalizeShopDomain(shop) || shop, token };
  const envShop = normalizeShopDomain(norm(process.env.SHOPIFY_SHOP_DOMAIN));
  const envToken = envShop ? getShopifyAdminToken(envShop) : null;
  if (envShop && envToken) return { shop: envShop, token: envToken };
  return null;
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const range = norm(searchParams.get("range")) || "30";
    const days = Math.min(365, Math.max(7, Number.parseInt(range, 10) || 30));

    const st = await getShopAndToken();
    if (!st) {
      return NextResponse.json({
        ok: true,
        sales: [] as DatePoint[],
        orders: [] as DatePoint[],
        topRevenue: [] as TopRevenueRow[],
      });
    }

    const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - days);
    const previousStart = new Date(currentStart);
    previousStart.setFullYear(previousStart.getFullYear() - 1);
    const previousEnd = new Date(now);
    previousEnd.setFullYear(previousEnd.getFullYear() - 1);

    const currentEnd = new Date(now);
    const currentQuery = `created_at:>=${toDateKey(currentStart.toISOString())} created_at:<=${toDateKey(currentEnd.toISOString())} status:any`;
    const previousQuery = `created_at:>=${toDateKey(previousStart.toISOString())} created_at:<=${toDateKey(previousEnd.toISOString())} status:any`;

    type OrderNode = {
      createdAt?: string;
      currentTotalPriceSet?: { shopMoney?: { amount?: string } };
      lineItems?: {
        nodes?: Array<{
          sku?: string;
          quantity?: number;
          originalUnitPriceSet?: { shopMoney?: { amount?: string } };
        }>;
      };
    };

    async function fetchOrders(
      shop: string,
      token: string,
      queryFilter: string
    ): Promise<OrderNode[]> {
      const nodes: OrderNode[] = [];
      let cursor: string | null = null;
      const MAX_PAGES = 20;
      for (let p = 0; p < MAX_PAGES; p++) {
        const query = `query Orders($first: Int!, $after: String, $query: String) {
          orders(first: 250, after: $after, query: $query, sortKey: CREATED_AT) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                createdAt
                currentTotalPriceSet { shopMoney { amount } }
                lineItems(first: 50) {
                  nodes {
                    sku
                    quantity
                    originalUnitPriceSet { shopMoney { amount } }
                  }
                }
              }
            }
          }
        }`;
        const variables: Record<string, unknown> = {
          first: 250,
          query: queryFilter,
        };
        if (cursor) variables.after = cursor;
        const res = await runShopifyGraphql<{
          orders?: {
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
            edges?: Array<{ node?: OrderNode }>;
          };
        }>({
          shop,
          token,
          query,
          variables,
          apiVersion: API_VERSION,
        });
        if (!res.ok || !res.data?.orders) break;
        const edges = res.data.orders.edges || [];
        for (const e of edges) {
          if (e?.node) nodes.push(e.node);
        }
        if (!res.data.orders.pageInfo?.hasNextPage || edges.length === 0) break;
        cursor = res.data.orders.pageInfo?.endCursor ?? null;
        if (!cursor) break;
      }
      return nodes;
    }

    const [currentOrders, previousOrders] = await Promise.all([
      fetchOrders(st.shop, st.token, currentQuery),
      fetchOrders(st.shop, st.token, previousQuery),
    ]);

    const salesCurrent = new Map<string, number>();
    const salesPrevious = new Map<string, number>();
    const ordersCurrent = new Map<string, number>();
    const ordersPrevious = new Map<string, number>();
    const revenueBySku = new Map<string, number>();

    const currentDateKeys: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(currentStart);
      d.setDate(d.getDate() + i);
      const key = toDateKey(d.toISOString());
      currentDateKeys.push(key);
      salesCurrent.set(key, 0);
      salesPrevious.set(key, 0);
      ordersCurrent.set(key, 0);
      ordersPrevious.set(key, 0);
    }

    for (const o of currentOrders) {
      const key = o.createdAt ? toDateKey(o.createdAt) : "";
      if (key && salesCurrent.has(key)) {
        const tot = parseNum(o.currentTotalPriceSet?.shopMoney?.amount);
        salesCurrent.set(key, (salesCurrent.get(key) || 0) + tot);
        ordersCurrent.set(key, (ordersCurrent.get(key) || 0) + 1);
      }
      for (const li of o.lineItems?.nodes || []) {
        const sku = norm(li.sku) || "—";
        const qty = Number.isFinite(Number(li.quantity)) ? Number(li.quantity) : 0;
        const price = parseNum(li.originalUnitPriceSet?.shopMoney?.amount);
        const rev = qty * price;
        revenueBySku.set(sku, (revenueBySku.get(sku) || 0) + rev);
      }
    }

    for (const o of previousOrders) {
      const key = o.createdAt ? toDateKey(o.createdAt) : "";
      if (key) {
        const currKey = `${Number(key.slice(0, 4)) + 1}${key.slice(4)}`;
        if (salesCurrent.has(currKey)) {
          const tot = parseNum(o.currentTotalPriceSet?.shopMoney?.amount);
          salesPrevious.set(currKey, (salesPrevious.get(currKey) || 0) + tot);
          ordersPrevious.set(currKey, (ordersPrevious.get(currKey) || 0) + 1);
        }
      }
      for (const li of o.lineItems?.nodes || []) {
        const sku = norm(li.sku) || "—";
        const qty = Number.isFinite(Number(li.quantity)) ? Number(li.quantity) : 0;
        const price = parseNum(li.originalUnitPriceSet?.shopMoney?.amount);
        const rev = qty * price;
        revenueBySku.set(sku, (revenueBySku.get(sku) || 0) + rev);
      }
    }

    const sales = currentDateKeys.map((date) => ({
      date,
      current: salesCurrent.get(date) ?? 0,
      previous: salesPrevious.get(date) ?? 0,
    }));

    const orders = currentDateKeys.map((date) => ({
      date,
      current: ordersCurrent.get(date) ?? 0,
      previous: ordersPrevious.get(date) ?? 0,
    }));

    const topRevenue = Array.from(revenueBySku.entries())
      .filter(([sku]) => sku !== "—")
      .map(([sku, amount]) => ({ sku, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    const currentYear = now.getFullYear();
    const prevYear = currentYear - 1;
    const fmt = (d: string) => {
      const [y, m, day] = d.split("-");
      return `${m ?? ""}/${day ?? ""}/${y ?? ""}`;
    };

    return NextResponse.json({
      ok: true,
      sales,
      orders,
      topRevenue,
      labels: {
        current: `${fmt(sales[0]?.date ?? "")} to ${fmt(sales[sales.length - 1]?.date ?? "")}`,
        previous: `${prevYear}`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
