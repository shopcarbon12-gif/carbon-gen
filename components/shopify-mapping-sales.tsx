"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

type SalesFilters = {
  orderNo: string;
  shop: string;
  fromDate: string;
  toDate: string;
  sku: string;
  processStatus: "all" | "processed" | "pending";
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

type SalesResponse = {
  ok?: boolean;
  error?: string;
  shop?: string;
  shops?: string[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  truncated?: boolean;
  rows?: SalesRow[];
};

const PAGE_SIZE_OPTIONS = [20, 50, 75, 100] as const;

const DEFAULT_FILTERS: SalesFilters = {
  orderNo: "",
  shop: "",
  fromDate: "",
  toDate: "",
  sku: "",
  processStatus: "all",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function formatDateTime(value: string) {
  const text = normalizeText(value);
  if (!text) return "--";
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatFixed(value: number) {
  if (!Number.isFinite(value)) return "0.000";
  return value.toFixed(3);
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "$0";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function buildPager(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

export default function ShopifyMappingSales() {
  const [filters, setFilters] = useState<SalesFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [shops, setShops] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [lastLoadedAt, setLastLoadedAt] = useState<string>("");

  async function loadSales(args?: {
    page?: number;
    pageSize?: number;
    filters?: SalesFilters;
  }) {
    const nextPage = args?.page ?? page;
    const nextPageSize = args?.pageSize ?? pageSize;
    const nextFilters = args?.filters ?? filters;

    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));
    if (nextFilters.orderNo) params.set("orderNo", nextFilters.orderNo);
    if (nextFilters.shop) params.set("shop", nextFilters.shop);
    if (nextFilters.fromDate) params.set("fromDate", nextFilters.fromDate);
    if (nextFilters.toDate) params.set("toDate", nextFilters.toDate);
    if (nextFilters.sku) params.set("sku", nextFilters.sku);
    params.set("processStatus", nextFilters.processStatus);

    setLoading(true);
    setError("");
    try {
      const resp = await fetch(`/api/shopify/orders?${params.toString()}`, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as SalesResponse;
      if (!resp.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || `Sales request failed (${resp.status})`);
      }

      const apiRows = Array.isArray(json.rows) ? json.rows : [];
      const apiShops = Array.isArray(json.shops) ? json.shops : [];
      const apiPage = Number.isFinite(Number(json.page)) ? Number(json.page) : nextPage;
      const apiPageSize = Number.isFinite(Number(json.pageSize))
        ? Number(json.pageSize)
        : nextPageSize;
      const apiTotalPages = Number.isFinite(Number(json.totalPages))
        ? Math.max(1, Number(json.totalPages))
        : 1;
      const apiTotal = Number.isFinite(Number(json.total)) ? Number(json.total) : apiRows.length;
      const resolvedShop = normalizeText(json.shop);

      setRows(apiRows);
      setShops(apiShops);
      setPage(apiPage);
      setPageSize(apiPageSize);
      setTotalPages(apiTotalPages);
      setTotal(apiTotal);
      setTruncated(Boolean(json.truncated));
      setExpandedRows({});
      setLastLoadedAt(new Date().toISOString());
      if (!normalizeText(nextFilters.shop) && resolvedShop) {
        setFilters((prev) => ({ ...prev, shop: resolvedShop }));
      }
    } catch (e: any) {
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setTruncated(false);
      setError(String(e?.message || "Unable to load sales."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSales({ page: 1, pageSize: 20, filters: DEFAULT_FILTERS });
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pager = useMemo(() => buildPager(page, totalPages), [page, totalPages]);

  const insights = useMemo(() => {
    const gross = rows.reduce((sum, row) => sum + (Number.isFinite(row.total) ? row.total : 0), 0);
    const net = rows.reduce(
      (sum, row) => sum + (Number.isFinite(row.subTotal) ? row.subTotal : 0),
      0
    );
    const tax = rows.reduce((sum, row) => sum + (Number.isFinite(row.tax) ? row.tax : 0), 0);
    const processed = rows.filter((row) => row.processStatus === "PROCESSED").length;
    const pending = rows.filter((row) => row.processStatus === "PENDING").length;
    const processedRate = rows.length ? Math.round((processed / rows.length) * 100) : 0;
    const avgOrderValue = rows.length ? gross / rows.length : 0;

    return {
      gross,
      net,
      tax,
      processed,
      pending,
      processedRate,
      avgOrderValue,
    };
  }, [rows]);

  function onFilterChange<K extends keyof SalesFilters>(key: K, value: SalesFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function onApplyFilters() {
    void loadSales({ page: 1, filters });
  }

  function onClearFilters() {
    const nextFilters = { ...DEFAULT_FILTERS, shop: filters.shop };
    setFilters(nextFilters);
    void loadSales({ page: 1, filters: nextFilters });
  }

  function onPageSizeChange(next: number) {
    if (!PAGE_SIZE_OPTIONS.includes(next as (typeof PAGE_SIZE_OPTIONS)[number])) return;
    setPageSize(next);
    void loadSales({ page: 1, pageSize: next });
  }

  function toggleRow(id: string) {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <main className="page sales-page">
      <section className="glass-panel hero">
        <div className="hero-copy">
          <p className="eyebrow">Shopify Mapping Inventory</p>
          <h1>Revenue Operations Console</h1>
          <p>
            Live order intelligence with strong filtering, pipeline-state tracking, and fast review
            of line-level details.
          </p>
        </div>
        <div className="hero-actions">
          <button
            suppressHydrationWarning
            type="button"
            className="btn"
            onClick={() => void loadSales()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Now"}
          </button>
          <span className="stamp">
            Last refresh: {lastLoadedAt ? new Date(lastLoadedAt).toLocaleString() : "--"}
          </span>
        </div>
      </section>

      <nav className="quick-nav" aria-label="Sales sections">
        <Link href="/studio/shopify-mapping-inventory/workset" className="quick-chip">
          Workset
        </Link>
        <Link href="/studio/shopify-mapping-inventory/sales" className="quick-chip active">
          Sales
        </Link>
        <Link href="/studio/shopify-mapping-inventory/inventory" className="quick-chip">
          Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/carts-inventory" className="quick-chip">
          Carts Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/configurations" className="quick-chip">
          Configurations
        </Link>
      </nav>

      <section className="insight-grid">
        <article className="glass-panel insight">
          <p>Gross (current page)</p>
          <strong>{formatCurrency(insights.gross)}</strong>
        </article>
        <article className="glass-panel insight">
          <p>Average Order Value</p>
          <strong>{formatCurrency(insights.avgOrderValue)}</strong>
        </article>
        <article className="glass-panel insight">
          <p>Processed Rate</p>
          <strong>{insights.processedRate}%</strong>
        </article>
        <article className="glass-panel insight">
          <p>Pipeline State</p>
          <strong>
            {insights.processed} processed / {insights.pending} pending
          </strong>
        </article>
      </section>

      <section className="glass-panel filters">
        <div className="filters-grid">
          <select
            value={filters.shop}
            onChange={(e) => onFilterChange("shop", e.target.value)}
            className="control"
          >
            <option value="">Select Store</option>
            {shops.map((shop) => (
              <option value={shop} key={shop}>
                {shop}
              </option>
            ))}
          </select>
          <select
            value={filters.processStatus}
            onChange={(e) =>
              onFilterChange(
                "processStatus",
                (normalizeLower(e.target.value) || "all") as SalesFilters["processStatus"]
              )
            }
            className="control"
          >
            <option value="all">All Pipeline States</option>
            <option value="processed">Processed Only</option>
            <option value="pending">Pending Only</option>
          </select>
          <input
            value={filters.orderNo}
            onChange={(e) => onFilterChange("orderNo", e.target.value)}
            placeholder="Order Number"
            className="control"
          />
          <input
            value={filters.sku}
            onChange={(e) => onFilterChange("sku", e.target.value)}
            placeholder="SKU"
            className="control"
          />
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => onFilterChange("fromDate", e.target.value)}
            className="control"
          />
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => onFilterChange("toDate", e.target.value)}
            className="control"
          />
        </div>
        <div className="filters-actions">
          <button suppressHydrationWarning type="button" className="btn" onClick={onApplyFilters} disabled={loading}>
            Apply Filters
          </button>
          <button suppressHydrationWarning type="button" className="btn ghost" onClick={onClearFilters} disabled={loading}>
            Clear
          </button>
        </div>
      </section>

      <section className="sales-meta">
        <small>{total.toLocaleString()} orders found</small>
        <div className="meta-right">
          <span>
            Net: <strong>{formatCurrency(insights.net)}</strong>
          </span>
          <span>
            Tax: <strong>{formatCurrency(insights.tax)}</strong>
          </span>
          <label htmlFor="sales-page-size">Rows</label>
          <select
            id="sales-page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="control compact"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="glass-panel table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Timeline</th>
                <th>Customer</th>
                <th>Net</th>
                <th>Tax</th>
                <th>Gross</th>
                <th>Logistics</th>
                <th>Payment</th>
                <th>Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty">
                    {loading ? "Loading sales..." : "No orders matched current filters."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const expanded = Boolean(expandedRows[row.id]);
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td>
                          <div className="order-cell">
                            <strong>#{row.invoice}</strong>
                            <span>{row.shop}</span>
                          </div>
                        </td>
                        <td>
                          <div className="timeline-cell">
                            <span>Placed: {formatDateTime(row.orderDate)}</span>
                            <span>Imported: {formatDateTime(row.downloadedAt)}</span>
                          </div>
                        </td>
                        <td>{row.customer || "--"}</td>
                        <td>{formatFixed(row.subTotal)}</td>
                        <td>{formatFixed(row.tax)}</td>
                        <td>{formatFixed(row.total)}</td>
                        <td>
                          <span className="pill warn">{row.deliveryType || "SHIPPING"}</span>
                        </td>
                        <td>
                          <span className="pill ok">{row.cartStatus || "UNKNOWN"}</span>
                        </td>
                        <td>
                          <div className="pipeline-cell">
                            <span className={`pill ${row.processStatus === "PROCESSED" ? "ok" : "warn"}`}>
                              {row.processStatus}
                            </span>
                            <button
                              suppressHydrationWarning
                              type="button"
                              className="expand"
                              onClick={() => toggleRow(row.id)}
                              aria-expanded={expanded}
                              aria-label={expanded ? "Hide order items" : "Show order items"}
                            >
                              {expanded ? "Hide" : "Details"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={9} className="detail-cell">
                            {row.lineItems.length ? (
                              <ul className="line-items">
                                {row.lineItems.map((item, index) => (
                                  <li key={`${row.id}-${item.sku}-${index}`}>
                                    <span>{item.title}</span>
                                    <span>SKU {item.sku}</span>
                                    <span>Qty {item.quantity}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="no-items">No line items available.</span>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className="table-footer">
          <small>
            Page {page} of {totalPages}
          </small>
          <div className="pager">
            <button
              suppressHydrationWarning
              type="button"
              className="pager-btn"
              onClick={() => void loadSales({ page: Math.max(1, page - 1) })}
              disabled={loading || page <= 1}
            >
              Prev
            </button>
            {pager.map((token, i) =>
              token === "ellipsis" ? (
                <span key={`ellipsis-${i}`} className="ellipsis">
                  ...
                </span>
              ) : (
                <button
                  suppressHydrationWarning
                  type="button"
                  key={`page-${token}`}
                  className={`pager-btn ${token === page ? "active" : ""}`}
                  onClick={() => void loadSales({ page: token })}
                  disabled={loading}
                >
                  {token}
                </button>
              )
            )}
            <button
              suppressHydrationWarning
              type="button"
              className="pager-btn"
              onClick={() => void loadSales({ page: Math.min(totalPages, page + 1) })}
              disabled={loading || page >= totalPages}
            >
              Next
            </button>
          </div>
        </footer>
      </section>

      {error ? <p className="notice error">Error: {error}</p> : null}
      {truncated ? (
        <p className="notice warn">
          Response was truncated for performance. Narrow date range or add filters for complete
          coverage.
        </p>
      ) : null}

      <style jsx>{`
        .sales-page {
          max-width: 1240px;
          margin: 0 auto;
          padding: 20px 8px 28px;
          display: grid;
          gap: 12px;
          color: #f8fafc;
        }
        .hero {
          border-radius: 18px;
          padding: 16px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: end;
        }
        .eyebrow {
          margin: 0;
          color: rgba(226, 232, 240, 0.78);
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .hero h1 {
          margin: 6px 0 0;
          font-size: clamp(1.45rem, 2.8vw, 2rem);
          line-height: 1.12;
        }
        .hero p {
          margin: 9px 0 0;
          color: rgba(226, 232, 240, 0.84);
          font-size: 0.9rem;
          line-height: 1.42;
          max-width: 760px;
        }
        .hero-actions {
          display: grid;
          justify-items: end;
          gap: 8px;
        }
        .stamp {
          font-size: 0.75rem;
          color: rgba(226, 232, 240, 0.78);
        }
        .quick-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .quick-chip {
          text-decoration: none;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(248, 250, 252, 0.9);
          padding: 8px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }
        .quick-chip.active {
          color: #fff;
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.38);
        }
        .insight-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .insight {
          border-radius: 14px;
          padding: 12px;
          display: grid;
          gap: 4px;
        }
        .insight p {
          margin: 0;
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }
        .insight strong {
          color: #fff;
          font-size: 1.06rem;
          line-height: 1.25;
          font-weight: 800;
        }
        .filters {
          border-radius: 16px;
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .filters-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .control {
          min-height: 40px;
          width: 100%;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 0.84rem;
          padding: 0 11px;
          outline: none;
        }
        .control::placeholder {
          color: rgba(226, 232, 240, 0.66);
        }
        .control.compact {
          min-height: 34px;
          width: 86px;
          padding: 0 8px;
        }
        .filters-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .btn {
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.32);
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          font-weight: 700;
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          padding: 0 12px;
        }
        .btn.ghost {
          background: transparent;
        }
        .btn:disabled {
          opacity: 0.62;
          cursor: wait;
        }
        .sales-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: rgba(226, 232, 240, 0.84);
          font-size: 0.83rem;
        }
        .meta-right {
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }
        .meta-right strong {
          color: #fff;
        }
        .table-card {
          border-radius: 16px;
          padding: 0;
          overflow: hidden;
        }
        .table-wrap {
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1040px;
        }
        th {
          text-align: left;
          font-size: 0.77rem;
          color: rgba(226, 232, 240, 0.76);
          font-weight: 700;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          white-space: nowrap;
        }
        td {
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.09);
          font-size: 0.83rem;
          color: rgba(248, 250, 252, 0.95);
          vertical-align: middle;
        }
        .order-cell {
          display: grid;
          gap: 2px;
        }
        .order-cell strong {
          font-size: 0.9rem;
        }
        .order-cell span {
          color: rgba(226, 232, 240, 0.74);
          font-size: 0.72rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 240px;
        }
        .timeline-cell {
          display: grid;
          gap: 2px;
          white-space: nowrap;
        }
        .pill {
          min-height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          border: 1px solid transparent;
        }
        .pill.ok {
          background: rgba(34, 197, 94, 0.26);
          border-color: rgba(34, 197, 94, 0.5);
          color: #dcfce7;
        }
        .pill.warn {
          background: rgba(245, 158, 11, 0.24);
          border-color: rgba(245, 158, 11, 0.46);
          color: #fef3c7;
        }
        .pipeline-cell {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .expand {
          min-height: 24px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 0 8px;
        }
        .detail-cell {
          background: rgba(255, 255, 255, 0.04);
          padding-top: 12px;
          padding-bottom: 12px;
        }
        .line-items {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 7px;
        }
        .line-items li {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.06);
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-size: 0.79rem;
          color: rgba(226, 232, 240, 0.92);
        }
        .no-items {
          font-size: 0.79rem;
          color: rgba(226, 232, 240, 0.82);
        }
        .empty {
          text-align: center;
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.84rem;
          padding: 20px 14px;
        }
        .table-footer {
          padding: 11px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.11);
        }
        .table-footer small {
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.78rem;
        }
        .pager {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pager-btn {
          min-width: 32px;
          min-height: 32px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 700;
          padding: 0 9px;
        }
        .pager-btn.active {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.4);
        }
        .pager-btn:disabled {
          opacity: 0.52;
          cursor: default;
        }
        .ellipsis {
          color: rgba(226, 232, 240, 0.74);
          min-width: 18px;
          text-align: center;
        }
        .notice {
          margin: 0;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 0.82rem;
          border: 1px solid transparent;
        }
        .notice.error {
          color: #fecaca;
          border-color: rgba(239, 68, 68, 0.44);
          background: rgba(127, 29, 29, 0.18);
        }
        .notice.warn {
          color: #fde68a;
          border-color: rgba(245, 158, 11, 0.44);
          background: rgba(120, 53, 15, 0.2);
        }
        @media (max-width: 1080px) {
          .insight-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .filters-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 760px) {
          .hero {
            grid-template-columns: 1fr;
            align-items: start;
          }
          .hero-actions {
            justify-items: start;
          }
          .filters-grid {
            grid-template-columns: 1fr;
          }
          .filters-actions {
            justify-content: stretch;
          }
          .btn {
            flex: 1;
          }
          .sales-meta {
            flex-direction: column;
            align-items: flex-start;
          }
          .meta-right {
            flex-wrap: wrap;
          }
          .line-items li {
            flex-direction: column;
            align-items: flex-start;
          }
          .table-footer {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </main>
  );
}
