"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

type CartInventoryVariantRow = {
  id: string;
  parentId: string;
  sku: string;
  upc: string;
  sellerSku: string;
  cartId: string;
  stock: number | null;
  stockByLocation: Array<{
    location: string;
    qty: number | null;
  }>;
  price: number | null;
  color: string;
  size: string;
  image: string;
  status: "PROCESSED" | "PENDING";
};

type CartInventoryParentRow = {
  id: string;
  title: string;
  category: string;
  brand: string;
  sku: string;
  stock: number | null;
  price: number | null;
  variations: number;
  image: string;
  status: "PROCESSED" | "PENDING";
  processedCount: number;
  pendingCount: number;
  variants: CartInventoryVariantRow[];
};

type CartInventoryResponse = {
  ok?: boolean;
  error?: string;
  shop?: string;
  warning?: string;
  source?: string | null;
  truncated?: boolean;
  filters?: Record<string, unknown>;
  options?: {
    categories?: string[];
    brands?: string[];
    shops?: string[];
    statuses?: string[];
  };
  summary?: {
    totalProducts?: number;
    totalItems?: number;
    totalProcessed?: number;
    totalPending?: number;
  };
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  rows?: CartInventoryParentRow[];
};

type CartFilters = {
  SKU: string;
  ParentSKU: string;
  Name: string;
  Brand: string;
  PriceFrom: string;
  PriceTo: string;
  StockFrom: string;
  StockTo: string;
  Orderby: "All" | "Processed" | "Pending";
  CategoryName: string;
  Keyword: string;
};

const DEFAULT_FILTERS: CartFilters = {
  SKU: "",
  ParentSKU: "",
  Name: "",
  Brand: "",
  PriceFrom: "",
  PriceTo: "",
  StockFrom: "",
  StockTo: "",
  Orderby: "All",
  CategoryName: "",
  Keyword: "",
};

const PAGE_SIZE_OPTIONS = [20, 50, 75, 100] as const;

type PagerToken = number | "ellipsis";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function formatQty(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(3);
}

function buildPager(currentPage: number, totalPages: number): PagerToken[] {
  if (totalPages <= 11) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const head = [1, 2, 3, 4, 5].filter((value) => value <= totalPages);
  const tailStart = Math.max(1, totalPages - 5);
  const tail = Array.from({ length: totalPages - tailStart + 1 }, (_, index) => tailStart + index);
  const merged: PagerToken[] = [...head];
  const headLast = head[head.length - 1] || 1;
  if (tailStart > headLast + 1) merged.push("ellipsis");
  for (const value of tail) {
    if (value > headLast) merged.push(value);
  }
  return merged;
}

function getVariantKey(variant: CartInventoryVariantRow) {
  return `${normalizeText(variant.parentId)}::${normalizeText(variant.id)}::${normalizeText(variant.sku)}`;
}

export default function ShopifyMappingCartsInventory() {
  const [filters, setFilters] = useState<CartFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CartFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<CartInventoryParentRow[]>([]);
  const [shop, setShop] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    totalProducts: 0,
    totalItems: 0,
    totalProcessed: 0,
    totalPending: 0,
  });
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [status, setStatus] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>({});

  async function loadInventory(args?: {
    page?: number;
    pageSize?: number;
    filters?: CartFilters;
    refresh?: boolean;
  }) {
    const nextPage = args?.page ?? page;
    const nextPageSize = args?.pageSize ?? pageSize;
    const nextFilters = args?.filters ?? appliedFilters;
    const isRefresh = Boolean(args?.refresh);

    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));
    if (isRefresh) params.set("refresh", "1");

    for (const [key, rawValue] of Object.entries(nextFilters)) {
      const value = normalizeText(rawValue);
      if (!value) continue;
      params.set(key, value);
    }

    setLoading(true);
    if (isRefresh) setRefreshing(true);
    setError("");
    setWarning("");

    try {
      const response = await fetch(`/api/shopify/cart-inventory?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await response.json().catch(() => ({}))) as CartInventoryResponse;
      if (!response.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || `Cart inventory request failed (${response.status})`);
      }

      const apiRows = Array.isArray(json.rows) ? json.rows : [];
      const apiPage = Number.isFinite(Number(json.page)) ? Number(json.page) : nextPage;
      const apiPageSize = Number.isFinite(Number(json.pageSize)) ? Number(json.pageSize) : nextPageSize;
      const apiTotalPages = Number.isFinite(Number(json.totalPages))
        ? Math.max(1, Number(json.totalPages))
        : 1;
      const apiTotal = Number.isFinite(Number(json.total)) ? Number(json.total) : apiRows.length;
      const apiCategories = Array.isArray(json.options?.categories) ? json.options?.categories : [];

      setRows(apiRows);
      setPage(apiPage);
      setPageSize(apiPageSize);
      setTotal(apiTotal);
      setTotalPages(apiTotalPages);
      setCategoryOptions(apiCategories);
      setShop(normalizeText(json.shop));
      setWarning(normalizeText(json.warning));
      setTruncated(Boolean(json.truncated));
      setSummary({
        totalProducts: Number(json.summary?.totalProducts || 0),
        totalItems: Number(json.summary?.totalItems || 0),
        totalProcessed: Number(json.summary?.totalProcessed || 0),
        totalPending: Number(json.summary?.totalPending || 0),
      });
      setExpandedRows({});
      setSelectedVariants({});
      setLastLoadedAt(new Date().toISOString());
    } catch (e: unknown) {
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setSummary({
        totalProducts: 0,
        totalItems: 0,
        totalProcessed: 0,
        totalPending: 0,
      });
      setExpandedRows({});
      setSelectedVariants({});
      setError(normalizeText((e as { message?: string } | null)?.message) || "Unable to load cart inventory.");
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadInventory({ page: 1, pageSize: 20, filters: DEFAULT_FILTERS });
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pager = useMemo(() => buildPager(page, totalPages), [page, totalPages]);

  const allVisibleVariants = useMemo(
    () => rows.flatMap((parent) => parent.variants.map((variant) => getVariantKey(variant))),
    [rows]
  );

  const selectedCount = useMemo(
    () => allVisibleVariants.filter((key) => Boolean(selectedVariants[key])).length,
    [allVisibleVariants, selectedVariants]
  );

  const allVisibleSelected = useMemo(
    () => allVisibleVariants.length > 0 && allVisibleVariants.every((key) => Boolean(selectedVariants[key])),
    [allVisibleVariants, selectedVariants]
  );

  function updateFilter<K extends keyof CartFilters>(key: K, value: CartFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function onSearch() {
    setStatus("");
    setAppliedFilters(filters);
    void loadInventory({ page: 1, pageSize, filters });
  }

  function onReset() {
    setStatus("");
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    void loadInventory({ page: 1, pageSize, filters: DEFAULT_FILTERS });
  }

  function onPageChange(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setStatus("");
    void loadInventory({ page: nextPage, pageSize, filters: appliedFilters });
  }

  function onPageSizeChange(nextPageSize: number) {
    if (!PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number])) return;
    if (nextPageSize === pageSize) return;
    setStatus("");
    void loadInventory({ page: 1, pageSize: nextPageSize, filters: appliedFilters });
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAllVisible(nextChecked: boolean) {
    setSelectedVariants((prev) => {
      const next = { ...prev };
      for (const key of allVisibleVariants) {
        if (nextChecked) next[key] = true;
        else delete next[key];
      }
      return next;
    });
  }

  function isParentSelected(parent: CartInventoryParentRow) {
    if (!parent.variants.length) return false;
    return parent.variants.every((variant) => Boolean(selectedVariants[getVariantKey(variant)]));
  }

  function toggleParent(parent: CartInventoryParentRow, nextChecked: boolean) {
    setSelectedVariants((prev) => {
      const next = { ...prev };
      for (const variant of parent.variants) {
        const key = getVariantKey(variant);
        if (nextChecked) next[key] = true;
        else delete next[key];
      }
      return next;
    });
  }

  function toggleVariant(variant: CartInventoryVariantRow, nextChecked: boolean) {
    const key = getVariantKey(variant);
    setSelectedVariants((prev) => {
      const next = { ...prev };
      if (nextChecked) next[key] = true;
      else delete next[key];
      return next;
    });
  }

  function onAddSelected() {
    if (selectedCount < 1) {
      setStatus("Select at least one variant row first.");
      return;
    }
    setStatus(`${selectedCount} selected item(s) ready for add action.`);
  }

  function onDeleteSelected() {
    if (selectedCount < 1) {
      setStatus("Select at least one variant row first.");
      return;
    }
    setStatus(`${selectedCount} selected item(s) ready for delete action.`);
  }

  function onResyncAll() {
    setStatus("");
    void loadInventory({ page, pageSize, filters: appliedFilters, refresh: true });
  }

  const titleShop = shop || "Not Connected";

  return (
    <main className="page carts-page">
      <section className="glass-panel hero">
        <div className="hero-copy">
          <p className="eyebrow">Shopify Mapping Inventory</p>
          <h1>Cart ({titleShop}) Inventory</h1>
          <p>
            Review product synchronization between Lightspeed and Shopify, then inspect each variant
            with cart IDs, location stock, and process status.
          </p>
        </div>
        <div className="hero-actions">
          <button
            suppressHydrationWarning
            type="button"
            className="btn-base btn-outline"
            onClick={() => void loadInventory({ page, pageSize, filters: appliedFilters, refresh: true })}
            disabled={refreshing || loading}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <span className="stamp">
            Last refresh: {lastLoadedAt ? new Date(lastLoadedAt).toLocaleString() : "--"}
          </span>
        </div>
      </section>

      <nav className="quick-nav" aria-label="Carts sections">
        <Link href="/studio/shopify-mapping-inventory/workset" className="quick-chip">
          Workset
        </Link>
        <Link href="/studio/shopify-mapping-inventory/sales" className="quick-chip">
          Sales
        </Link>
        <Link href="/studio/shopify-mapping-inventory/inventory" className="quick-chip">
          Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/carts-inventory" className="quick-chip active">
          Carts Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/configurations" className="quick-chip">
          Configurations
        </Link>
      </nav>

      <section className="glass-panel filters">
        <div className="filters-grid">
          <input
            value={filters.SKU}
            onChange={(e) => updateFilter("SKU", e.target.value)}
            placeholder="SKU"
            className="control"
          />
          <input
            value={filters.ParentSKU}
            onChange={(e) => updateFilter("ParentSKU", e.target.value)}
            placeholder="Group SKU"
            className="control"
          />
          <input
            value={filters.Name}
            onChange={(e) => updateFilter("Name", e.target.value)}
            placeholder="Product Name"
            className="control"
          />
          <input
            value={filters.Brand}
            onChange={(e) => updateFilter("Brand", e.target.value)}
            placeholder="Brand"
            className="control"
          />
          <input
            value={filters.PriceFrom}
            onChange={(e) => updateFilter("PriceFrom", e.target.value)}
            placeholder="Price From"
            className="control"
            inputMode="decimal"
          />
          <input
            value={filters.PriceTo}
            onChange={(e) => updateFilter("PriceTo", e.target.value)}
            placeholder="Price To"
            className="control"
            inputMode="decimal"
          />
          <input
            value={filters.StockFrom}
            onChange={(e) => updateFilter("StockFrom", e.target.value)}
            placeholder="Stock From"
            className="control"
            inputMode="numeric"
          />
          <input
            value={filters.StockTo}
            onChange={(e) => updateFilter("StockTo", e.target.value)}
            placeholder="Stock To"
            className="control"
            inputMode="numeric"
          />
          <select
            value={filters.Orderby}
            onChange={(e) =>
              updateFilter("Orderby", (normalizeText(e.target.value) || "All") as CartFilters["Orderby"])
            }
            className="control"
          >
            <option value="All">Select Product Status</option>
            <option value="All">All Products</option>
            <option value="Processed">Processed Products</option>
            <option value="Pending">Pending Products</option>
          </select>
          <select
            value={filters.CategoryName}
            onChange={(e) => updateFilter("CategoryName", e.target.value)}
            className="control"
          >
            <option value="">Select Category</option>
            {categoryOptions.map((category) => (
              <option value={category} key={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            value={filters.Keyword}
            onChange={(e) => updateFilter("Keyword", e.target.value)}
            placeholder="Search Keyword"
            className="control"
          />
        </div>
        <div className="filters-actions">
          <button suppressHydrationWarning type="button" className="btn-base btn-primary" onClick={onSearch} disabled={loading}>
            Search
          </button>
          <button suppressHydrationWarning type="button" className="btn-base btn-outline" onClick={onReset} disabled={loading}>
            Reset
          </button>
        </div>
      </section>

      <section className="meta-row">
        <div className="totals">
          <small>Total Products: {summary.totalProducts.toLocaleString()}</small>
          <small>Total Items: {summary.totalItems.toLocaleString()}</small>
          <small>Total Processed: {summary.totalProcessed.toLocaleString()}</small>
          <small>Total Pending: {summary.totalPending.toLocaleString()}</small>
        </div>

        <div className="meta-actions">
          <button suppressHydrationWarning type="button" className="btn-base btn-outline" onClick={onAddSelected} disabled={loading}>
            Add Selected
          </button>
          <button suppressHydrationWarning type="button" className="btn-base btn-danger" onClick={onDeleteSelected} disabled={loading}>
            Delete Selected
          </button>
          <button
            suppressHydrationWarning
            type="button"
            className="btn-base btn-outline"
            onClick={onResyncAll}
            disabled={loading || refreshing}
          >
            Re-sync all items
          </button>
          <label htmlFor="page-size" className="page-size-wrap">
            <span>Rows</span>
            <select
              id="page-size"
              className="control page-size"
              value={String(pageSize)}
              onChange={(e) => onPageSizeChange(Number.parseInt(e.target.value, 10))}
              disabled={loading}
            >
              {PAGE_SIZE_OPTIONS.map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="glass-panel table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAllVisible(e.target.checked)}
                    aria-label="Select all visible variants"
                  />
                </th>
                <th>Title</th>
                <th>Category</th>
                <th>Brand</th>
                <th>SKU</th>
                <th>Stock</th>
                <th>Price</th>
                <th>Variations</th>
                <th>Image</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length < 1 ? (
                <tr>
                  <td colSpan={10} className="empty">
                    {loading ? "Loading cart inventory..." : "No products matched current filters."}
                  </td>
                </tr>
              ) : (
                rows.map((parent) => {
                  const expanded = Boolean(expandedRows[parent.id]);
                  const selected = isParentSelected(parent);
                  return (
                    <Fragment key={parent.id}>
                      <tr>
                        <td className="check-col">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => toggleParent(parent, e.target.checked)}
                            aria-label={`Select ${parent.title}`}
                          />
                        </td>
                        <td className="title-cell">
                          <div className="title-wrap">
                            {parent.image ? (
                              <img src={parent.image} alt={parent.title} className="thumb" />
                            ) : (
                              <span className="thumb placeholder" aria-hidden />
                            )}
                            <span>{parent.title || parent.sku}</span>
                          </div>
                        </td>
                        <td>{parent.category || "-"}</td>
                        <td>{parent.brand || "-"}</td>
                        <td>{parent.sku || "-"}</td>
                        <td>{formatQty(parent.stock)}</td>
                        <td>{formatPrice(parent.price)}</td>
                        <td>{parent.variations}</td>
                        <td>
                          {parent.image ? (
                            <img src={parent.image} alt={`${parent.title} image`} className="thumb small" />
                          ) : (
                            <span className="thumb small placeholder" aria-hidden />
                          )}
                        </td>
                        <td>
                          <div className="status-cell">
                            <span className={`pill ${parent.status === "PROCESSED" ? "ok" : "warn"}`}>
                              {parent.status}
                            </span>
                            <button
                              suppressHydrationWarning
                              type="button"
                              className="expand-btn"
                              onClick={() => toggleExpand(parent.id)}
                              aria-expanded={expanded}
                              aria-label={expanded ? "Hide variations" : "Show variations"}
                            >
                              {expanded ? "▴" : "▾"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={10} className="detail-cell">
                            <div className="detail-wrap">
                              <table className="child-table">
                                <thead>
                                  <tr>
                                    <th className="check-col" />
                                    <th>SKU</th>
                                    <th>UPC</th>
                                    <th>Seller SKU</th>
                                    <th>Cart ID</th>
                                    <th>Stock</th>
                                    <th>Price</th>
                                    <th>Color</th>
                                    <th>Size</th>
                                    <th>Image</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {parent.variants.map((variant) => {
                                    const key = getVariantKey(variant);
                                    const checked = Boolean(selectedVariants[key]);
                                    return (
                                      <tr key={key}>
                                        <td className="check-col">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => toggleVariant(variant, e.target.checked)}
                                            aria-label={`Select ${variant.sku}`}
                                          />
                                        </td>
                                        <td>{variant.sku || "-"}</td>
                                        <td>{variant.upc || "-"}</td>
                                        <td>{variant.sellerSku || "-"}</td>
                                        <td>{variant.cartId || "-"}</td>
                                        <td className="stock-cell">
                                          {variant.stockByLocation.length > 0 ? (
                                            <ul>
                                              {variant.stockByLocation.map((stockRow) => (
                                                <li key={`${key}-${stockRow.location}`}>
                                                  <span>{stockRow.location}</span>
                                                  <strong>{formatQty(stockRow.qty)}</strong>
                                                </li>
                                              ))}
                                              <li className="company-row">
                                                <span>Company Stock</span>
                                                <strong>{formatQty(variant.stock)}</strong>
                                              </li>
                                            </ul>
                                          ) : (
                                            <span>{formatQty(variant.stock)}</span>
                                          )}
                                        </td>
                                        <td>{formatPrice(variant.price)}</td>
                                        <td>{variant.color || "-"}</td>
                                        <td>{variant.size || "-"}</td>
                                        <td>
                                          {variant.image ? (
                                            <img src={variant.image} alt={`${variant.sku} image`} className="thumb small" />
                                          ) : (
                                            <span className="thumb small placeholder" aria-hidden />
                                          )}
                                        </td>
                                        <td>
                                          <span className={`pill ${variant.status === "PROCESSED" ? "ok" : "warn"}`}>
                                            {variant.status}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
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
            Showing Page {page} of {totalPages} ({total.toLocaleString()} products)
          </small>
          <div className="pager">
            <button
              suppressHydrationWarning
              type="button"
              className="pager-btn"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={loading || page <= 1}
            >
              Prev
            </button>
            {pager.map((token, index) =>
              token === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="ellipsis">
                  ...
                </span>
              ) : (
                <button
                  suppressHydrationWarning
                  type="button"
                  key={`page-${token}`}
                  className={`pager-btn ${token === page ? "active" : ""}`}
                  onClick={() => onPageChange(token)}
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
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={loading || page >= totalPages}
            >
              Next
            </button>
          </div>
        </footer>
      </section>

      {status ? <p className="notice info">{status}</p> : null}
      {error ? <p className="notice error">Error: {error}</p> : null}
      {warning ? <p className="notice warn">{warning}</p> : null}
      {truncated ? (
        <p className="notice warn">
          Dataset was truncated for performance. Narrow filters if you need a fully exhaustive view.
        </p>
      ) : null}

      <style jsx>{`
        .carts-page {
          max-width: 1320px;
          margin: 0 auto;
          padding: 20px 8px 30px;
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
          font-size: clamp(1.4rem, 2.8vw, 1.95rem);
          line-height: 1.14;
        }
        .hero p {
          margin: 9px 0 0;
          color: rgba(226, 232, 240, 0.84);
          font-size: 0.9rem;
          line-height: 1.42;
          max-width: 780px;
        }
        .hero-actions {
          display: grid;
          justify-items: end;
          gap: 8px;
        }
        .stamp {
          color: rgba(226, 232, 240, 0.78);
          font-size: 0.75rem;
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
        .filters {
          border-radius: 16px;
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .filters-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .filters-actions {
          display: flex;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .totals {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
          color: rgba(226, 232, 240, 0.86);
          font-size: 0.84rem;
        }
        .meta-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .page-size-wrap {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: rgba(226, 232, 240, 0.86);
          font-size: 0.8rem;
        }
        .page-size {
          min-height: 38px;
          width: 80px;
          text-transform: none;
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
          min-width: 1180px;
        }
        th {
          text-align: left;
          font-size: 0.77rem;
          color: rgba(226, 232, 240, 0.76);
          font-weight: 700;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          white-space: nowrap;
          background: rgba(255, 255, 255, 0.04);
        }
        td {
          padding: 9px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.09);
          font-size: 0.82rem;
          color: rgba(248, 250, 252, 0.95);
          vertical-align: middle;
          white-space: nowrap;
        }
        .check-col {
          width: 34px;
          text-align: center;
        }
        .title-cell {
          max-width: 320px;
        }
        .title-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: 100%;
          min-width: 0;
        }
        .title-wrap span {
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .thumb {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          object-fit: cover;
          object-position: center;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.06);
          flex: 0 0 auto;
        }
        .thumb.small {
          width: 30px;
          height: 30px;
        }
        .thumb.placeholder {
          display: inline-block;
          border-style: dashed;
          opacity: 0.5;
        }
        .status-cell {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .expand-btn {
          min-height: 24px;
          min-width: 24px;
          padding: 0;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          font-size: 0.8rem;
          font-weight: 700;
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
          background: rgba(34, 197, 94, 0.25);
          border-color: rgba(34, 197, 94, 0.48);
          color: #dcfce7;
        }
        .pill.warn {
          background: rgba(245, 158, 11, 0.22);
          border-color: rgba(245, 158, 11, 0.44);
          color: #fef3c7;
        }
        .detail-cell {
          padding: 0;
          background: rgba(255, 255, 255, 0.03);
        }
        .detail-wrap {
          padding: 10px 10px 14px;
        }
        .child-table {
          min-width: 1140px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .child-table th,
        .child-table td {
          font-size: 0.78rem;
          padding: 8px 10px;
        }
        .stock-cell ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 4px;
        }
        .stock-cell li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: rgba(226, 232, 240, 0.88);
          font-size: 0.74rem;
          line-height: 1.25;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
          padding-bottom: 2px;
        }
        .stock-cell li.company-row {
          color: #fff;
          font-weight: 700;
          border-bottom: 0;
          padding-bottom: 0;
        }
        .empty {
          text-align: center;
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.84rem;
          padding: 22px 14px;
        }
        .table-footer {
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.11);
          flex-wrap: wrap;
        }
        .table-footer small {
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.78rem;
        }
        .pager {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
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
        .notice.info {
          color: #bfdbfe;
          border-color: rgba(96, 165, 250, 0.36);
          background: rgba(30, 64, 175, 0.2);
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
        @media (max-width: 1120px) {
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
          .meta-row {
            align-items: flex-start;
            flex-direction: column;
          }
          .meta-actions {
            width: 100%;
          }
          .meta-actions :global(button) {
            flex: 1;
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
