import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
const MAX_SCAN_PAGES = 40;
const MAX_SCAN_ORDERS = 4000;
const FETCH_BATCH = 100;
const ALLOWED_PAGE_SIZES = [20, 50, 75, 100] as const;

type OrderNode = {
  id?: string;
  name?: string;
  createdAt?: string;
  processedAt?: string | null;
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  currentSubtotalPriceSet?: { shopMoney?: { amount?: string | number } };
  currentTotalTaxSet?: { shopMoney?: { amount?: string | number } };
  currentTotalPriceSet?: { shopMoney?: { amount?: string | number } };
  customer?: { displayName?: string; firstName?: string; lastName?: string };
  shippingLines?: { nodes?: Array<{ title?: string }> };
  lineItems?: { nodes?: Array<{ title?: string; sku?: string; quantity?: number }> };
};

type SalesRow = {
  id: string;
  shop: string;
  invoice: string;
  orderDate: string;
  downloadedAt: string;
  customer: string;
  subTotal: number;
  tax: number;
  total: number;
  deliveryType: string;
  cartStatus: string;
  processStatus: "PROCESSED" | "PENDING";
  lineItems: Array<{ title: string; sku: string; quantity: number }>;
};

type OrdersQueryData = {
  orders?: {
    edges?: Array<{
      cursor?: string;
      node?: OrderNode;
    }>;
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string | null;
    };
  };
};

function norm(value: unknown) {
  return String(value ?? "").trim();
}

function normLower(value: unknown) {
  return norm(value).toLowerCase();
}

function parseNumber(value: unknown) {
  const parsed = Number.parseFloat(norm(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(norm(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function toIsoStartOfDay(input: string) {
  const raw = norm(input);
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toIsoEndOfDay(input: string) {
  const raw = norm(input);
  if (!raw) return null;
  const d = new Date(`${raw}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDateOnly(input: string) {
  const iso = toIsoStartOfDay(input);
  if (!iso) return "";
  return iso.slice(0, 10);
}

function deriveProcessStatus(financialStatus: string, fulfillmentStatus: string) {
  const financial = norm(financialStatus).toUpperCase();
  const fulfillment = norm(fulfillmentStatus).toUpperCase();
  const processedFinancialStates = new Set([
    "PAID",
    "PARTIALLY_PAID",
    "PARTIALLY_REFUNDED",
    "REFUNDED",
  ]);
  if (processedFinancialStates.has(financial)) return "PROCESSED" as const;
  if (fulfillment === "FULFILLED" || fulfillment === "PARTIALLY_FULFILLED") {
    return "PROCESSED" as const;
  }
  return "PENDING" as const;
}

function buildCustomerName(node: OrderNode) {
  const display = norm(node.customer?.displayName);
  if (display) return display;
  const first = norm(node.customer?.firstName);
  const last = norm(node.customer?.lastName);
  return [first, last].filter(Boolean).join(" ") || "--";
}

function buildDeliveryType(node: OrderNode) {
  const lineTitle = norm(node.shippingLines?.nodes?.[0]?.title).toUpperCase();
  if (lineTitle) return lineTitle;
  return "SHIPPING";
}

function toSalesRow(node: OrderNode, shop: string): SalesRow {
  const invoiceRaw = norm(node.name);
  const invoice = invoiceRaw.replace(/^#/, "") || "--";
  const financial = norm(node.displayFinancialStatus).toUpperCase();
  const fulfillment = norm(node.displayFulfillmentStatus).toUpperCase();

  return {
    id: norm(node.id) || `${shop}-${invoice}-${Math.random()}`,
    shop,
    invoice,
    orderDate: norm(node.createdAt),
    downloadedAt: norm(node.processedAt) || norm(node.createdAt),
    customer: buildCustomerName(node),
    subTotal: parseNumber(node.currentSubtotalPriceSet?.shopMoney?.amount),
    tax: parseNumber(node.currentTotalTaxSet?.shopMoney?.amount),
    total: parseNumber(node.currentTotalPriceSet?.shopMoney?.amount),
    deliveryType: buildDeliveryType(node),
    cartStatus: financial || "UNKNOWN",
    processStatus: deriveProcessStatus(financial, fulfillment),
    lineItems: (node.lineItems?.nodes || []).map((item) => ({
      title: norm(item.title) || "Item",
      sku: norm(item.sku) || "--",
      quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
    })),
  };
}

function passLocalFilters(
  row: SalesRow,
  params: {
    orderNo: string;
    sku: string;
    processStatus: string;
    fromIso: string | null;
    toIso: string | null;
  }
) {
  const orderNeedle = normLower(params.orderNo);
  if (orderNeedle) {
    const invoice = normLower(row.invoice);
    const id = normLower(row.id);
    if (!invoice.includes(orderNeedle) && !id.includes(orderNeedle)) return false;
  }

  const skuNeedle = normLower(params.sku);
  if (skuNeedle) {
    const found = row.lineItems.some((item) => normLower(item.sku).includes(skuNeedle));
    if (!found) return false;
  }

  const processNeedle = normLower(params.processStatus);
  if (processNeedle && processNeedle !== "all") {
    if (normLower(row.processStatus) !== processNeedle) return false;
  }

  const orderTs = new Date(row.orderDate).getTime();
  if (params.fromIso) {
    const fromTs = new Date(params.fromIso).getTime();
    if (Number.isFinite(fromTs) && Number.isFinite(orderTs) && orderTs < fromTs) return false;
  }
  if (params.toIso) {
    const toTs = new Date(params.toIso).getTime();
    if (Number.isFinite(toTs) && Number.isFinite(orderTs) && orderTs > toTs) return false;
  }

  return true;
}

function buildShopifyOrderQuery(args: { fromDate: string; toDate: string }) {
  const parts = ["status:any"];
  const fromDate = toDateOnly(args.fromDate);
  const toDate = toDateOnly(args.toDate);
  if (fromDate) parts.push(`created_at:>=${fromDate}`);
  if (toDate) parts.push(`created_at:<=${toDate}`);
  return parts.join(" ");
}

async function getTokenCandidates(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();

  const dbToken = !error ? norm((data as any)?.access_token) : "";
  const envToken = norm(getShopifyAdminToken(shop));
  const candidates: Array<{ token: string; source: "db" | "env_token" }> = [];
  if (dbToken) candidates.push({ token: dbToken, source: "db" });
  if (envToken && envToken !== dbToken) candidates.push({ token: envToken, source: "env_token" });
  return candidates;
}

async function getAvailableShops() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("shop,installed_at")
    .order("installed_at", { ascending: false })
    .limit(100);

  const fromDb = !error && Array.isArray(data)
    ? data
        .map((row) => normalizeShopDomain(norm((row as any)?.shop) || ""))
        .filter((shop): shop is string => Boolean(shop))
    : [];

  const configured = normalizeShopDomain(norm(process.env.SHOPIFY_SHOP_DOMAIN) || "");
  const unique = new Set<string>(fromDb);
  if (configured) unique.add(configured);
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

async function fetchShopOrders(args: {
  shop: string;
  token: string;
  queryFilter: string;
}) {
  let cursor: string | null = null;
  let scannedPages = 0;
  let truncated = false;
  const rows: SalesRow[] = [];
  const seen = new Set<string>();

  while (scannedPages < MAX_SCAN_PAGES) {
    const query = `
      query OrdersPage($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            cursor
            node {
              id
              name
              createdAt
              processedAt
              displayFinancialStatus
              displayFulfillmentStatus
              currentSubtotalPriceSet { shopMoney { amount } }
              currentTotalTaxSet { shopMoney { amount } }
              currentTotalPriceSet { shopMoney { amount } }
              customer {
                displayName
                firstName
                lastName
              }
              shippingLines(first: 1) {
                nodes { title }
              }
              lineItems(first: 50) {
                nodes {
                  title
                  sku
                  quantity
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const result = await runShopifyGraphql<OrdersQueryData>({
      shop: args.shop,
      token: args.token,
      query,
      variables: {
        first: FETCH_BATCH,
        after: cursor,
        query: args.queryFilter || null,
      },
      apiVersion: API_VERSION,
    });

    if (!result.ok) {
      return {
        ok: false as const,
        status: result.status,
        error: JSON.stringify(result.errors || "Shopify order fetch failed."),
      };
    }

    const edges = result.data?.orders?.edges || [];
    for (const edge of edges) {
      const node = edge?.node;
      if (!node) continue;
      const row = toSalesRow(node, args.shop);
      if (!row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      if (rows.length >= MAX_SCAN_ORDERS) {
        truncated = true;
        break;
      }
    }

    const hasNextPage = Boolean(result.data?.orders?.pageInfo?.hasNextPage);
    const endCursor = norm(result.data?.orders?.pageInfo?.endCursor);
    scannedPages += 1;
    if (truncated || !hasNextPage || !endCursor) break;
    cursor = endCursor;
  }

  if (scannedPages >= MAX_SCAN_PAGES) truncated = true;
  return { ok: true as const, rows, truncated };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedShop = normalizeShopDomain(norm(searchParams.get("shop")) || "") || "";
    const orderNo = norm(searchParams.get("orderNo"));
    const sku = norm(searchParams.get("sku"));
    const fromDate = norm(searchParams.get("fromDate"));
    const toDate = norm(searchParams.get("toDate"));
    const processStatus = norm(searchParams.get("processStatus")) || "all";
    const pageSizeRaw = parsePositiveInt(searchParams.get("pageSize"), 20);
    const pageRaw = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = ALLOWED_PAGE_SIZES.includes(pageSizeRaw as any) ? pageSizeRaw : 20;
    const page = Math.max(1, pageRaw);
    const fromIso = toIsoStartOfDay(fromDate);
    const toIso = toIsoEndOfDay(toDate);

    const shops = await getAvailableShops();
    const resolvedShop =
      requestedShop ||
      normalizeShopDomain(norm(process.env.SHOPIFY_SHOP_DOMAIN) || "") ||
      shops[0] ||
      "";

    if (!resolvedShop) {
      return NextResponse.json(
        {
          ok: false,
          error: "No Shopify shop is configured.",
          shops,
          rows: [],
          total: 0,
          page: 1,
          pageSize,
          totalPages: 1,
          truncated: false,
        },
        { status: 400 }
      );
    }

    const candidates = await getTokenCandidates(resolvedShop);
    if (!candidates.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Shop ${resolvedShop} is not connected.`,
          shops,
          shop: resolvedShop,
          rows: [],
          total: 0,
          page: 1,
          pageSize,
          totalPages: 1,
          truncated: false,
        },
        { status: 401 }
      );
    }

    const queryFilter = buildShopifyOrderQuery({ fromDate, toDate });
    let lastError = "Unable to load Shopify orders.";
    for (const candidate of candidates) {
      const fetched = await fetchShopOrders({
        shop: resolvedShop,
        token: candidate.token,
        queryFilter,
      });
      if (!fetched.ok) {
        lastError = fetched.error;
        continue;
      }

      const filtered = fetched.rows.filter((row) =>
        passLocalFilters(row, { orderNo, sku, processStatus, fromIso, toIso })
      );
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = Math.min(page, totalPages);
      const start = (currentPage - 1) * pageSize;
      const rows = filtered.slice(start, start + pageSize);

      return NextResponse.json({
        ok: true,
        shop: resolvedShop,
        shops,
        source: candidate.source,
        filters: {
          orderNo,
          sku,
          fromDate,
          toDate,
          processStatus,
        },
        total,
        page: currentPage,
        pageSize,
        totalPages,
        truncated: fetched.truncated,
        rows,
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: lastError,
        shops,
        shop: resolvedShop,
        rows: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 1,
        truncated: false,
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e?.message || "Unable to load sales."),
      },
      { status: 500 }
    );
  }
}
