"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

type CartInventoryVariantRow = {
  id: string;
  parentId: string;
  sku: string;
  upc: string;
  sellerSku: string;
  cartId: string;
  stock: number | null;
  stockByLocation: Array<{ location: string; qty: number | null }>;
  price: number | null;
  color: string;
  size: string;
  status: "PENDING" | "PROCESSED" | "ERROR";
  error?: string | null;
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
  status: "PENDING" | "PROCESSED" | "ERROR";
  processedCount: number;
  pendingCount: number;
  errorCount: number;
  variants: CartInventoryVariantRow[];
  error?: string | null;
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
  Orderby: "All" | "Processed" | "Pending" | "Error";
  CategoryName: string;
  Keyword: string;
};

type CartInventoryResponse = {
  ok?: boolean;
  error?: string;
  shop?: string;
  warning?: string;
  options?: {
    categories?: string[];
    statuses?: string[];
  };
  summary?: {
    totalProducts?: number;
    totalItems?: number;
    totalProcessed?: number;
    totalPending?: number;
    totalErrors?: number;
  };
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  rows?: CartInventoryParentRow[];
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

const PAGE_SIZE_OPTIONS = [20, 50, 75, 100, 200, 500] as const;
type TaskTone = "idle" | "running" | "success" | "error";
type StudioTaskTone = "idle" | "working" | "success" | "error";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function formatQty(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatPrice(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}

function variantKey(parentId: string, variantId: string) {
  return `${parentId}::${variantId}`;
}

export default function ShopifyMappingCartsInventory() {
  const [filters, setFilters] = useState<CartFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CartFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<CartInventoryParentRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [shop, setShop] = useState("");
  const [summary, setSummary] = useState({
    totalProducts: 0,
    totalItems: 0,
    totalProcessed: 0,
    totalPending: 0,
    totalErrors: 0,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalPages, setTotalPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [selectedParents, setSelectedParents] = useState<Record<string, boolean>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [task, setTask] = useState<{
    label: string;
    progress: number;
    tone: TaskTone;
  }>({ label: "Ready", progress: 0, tone: "idle" });

  async function loadCart(nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters) {
    const params = new URLSearchParams();
    params.set("page", String(nextPage));
    params.set("pageSize", String(nextPageSize));
    for (const [key, value] of Object.entries(nextFilters)) {
      const text = normalizeText(value);
      if (text) params.set(key, text);
    }
    if (shop) params.set("shop", shop);

    setBusy(true);
    setError("");
    setWarning("");
    setTask({ label: "Loading Cart Inventory staging...", progress: 24, tone: "running" });
    try {
      const resp = await fetch(`/api/shopify/cart-inventory?${params.toString()}`, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as CartInventoryResponse;
      if (!resp.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || `Cart inventory request failed (${resp.status})`);
      }
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setCategories(Array.isArray(json.options?.categories) ? json.options?.categories : []);
      setPage(Number(json.page || nextPage));
      setPageSize(Number(json.pageSize || nextPageSize));
      setTotalPages(Math.max(1, Number(json.totalPages || 1)));
      setShop(normalizeText(json.shop));
      setWarning(normalizeText(json.warning));
      setSummary({
        totalProducts: Number(json.summary?.totalProducts || 0),
        totalItems: Number(json.summary?.totalItems || 0),
        totalProcessed: Number(json.summary?.totalProcessed || 0),
        totalPending: Number(json.summary?.totalPending || 0),
        totalErrors: Number(json.summary?.totalErrors || 0),
      });
      setSelectedParents({});
      setSelectedVariants({});
      setExpandedRows({});
      setTask({ label: "Cart Inventory loaded", progress: 100, tone: "success" });
    } catch (e: unknown) {
      const message =
        normalizeText((e as { message?: string } | null)?.message) ||
        "Unable to load cart inventory.";
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadCart(1, 50, DEFAULT_FILTERS);
  }, []);

  const selectedParentIds = useMemo(() => {
    const out = new Set<string>();
    for (const [id, checked] of Object.entries(selectedParents)) {
      if (checked) out.add(id);
    }
    for (const [key, checked] of Object.entries(selectedVariants)) {
      if (!checked) continue;
      const [parentId] = key.split("::");
      if (parentId) out.add(parentId);
    }
    return Array.from(out);
  }, [selectedParents, selectedVariants]);

  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => Boolean(selectedParents[row.id]));
  const statusBarTone: StudioTaskTone = task.tone === "running" ? "working" : task.tone;
  const taskChipLabel =
    statusBarTone === "working" ? "Working" : statusBarTone === "success" ? "Done" : statusBarTone === "error" ? "Error" : "Idle";

  async function runAction(action: "stage-remove" | "set-status" | "undo-session", extra?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setStatus("");
    setTask({ label: `Running ${action}...`, progress: 35, tone: "running" });
    try {
      const resp = await fetch("/api/shopify/cart-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shop, ...extra }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(normalizeText(json.error) || `Action failed: ${action}`);
      if (action === "stage-remove") setStatus("Selected rows removed.");
      if (action === "set-status") setStatus("Status updated for selected rows.");
      if (action === "undo-session") setStatus("Undo completed.");
      setTask({ label: `${action} complete`, progress: 100, tone: "success" });
      await loadCart(page, pageSize, appliedFilters);
    } catch (e: unknown) {
      const message = normalizeText((e as { message?: string } | null)?.message) || "Action failed.";
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="glass-panel">
        <div className={`progress-inline ${statusBarTone}`}>
          <div className="progress-inline-head">
            <div className="progress-inline-title">Progress Bar</div>
            <span className={`progress-inline-chip ${statusBarTone}`}>{taskChipLabel}</span>
          </div>
          <p className="progress-inline-message">{task.label || "Ready"}</p>
        </div>
        <div className="filters">
          <input value={filters.SKU} onChange={(e) => setFilters((prev) => ({ ...prev, SKU: e.target.value }))} placeholder="SKU" />
          <input value={filters.ParentSKU} onChange={(e) => setFilters((prev) => ({ ...prev, ParentSKU: e.target.value }))} placeholder="Group SKU" />
          <input value={filters.Name} onChange={(e) => setFilters((prev) => ({ ...prev, Name: e.target.value }))} placeholder="Product Name" />
          <input value={filters.Brand} onChange={(e) => setFilters((prev) => ({ ...prev, Brand: e.target.value }))} placeholder="Brand" />
          <input value={filters.PriceFrom} onChange={(e) => setFilters((prev) => ({ ...prev, PriceFrom: e.target.value }))} placeholder="Price From" />
          <input value={filters.PriceTo} onChange={(e) => setFilters((prev) => ({ ...prev, PriceTo: e.target.value }))} placeholder="Price To" />
          <input value={filters.StockFrom} onChange={(e) => setFilters((prev) => ({ ...prev, StockFrom: e.target.value }))} placeholder="Stock From" />
          <input value={filters.StockTo} onChange={(e) => setFilters((prev) => ({ ...prev, StockTo: e.target.value }))} placeholder="Stock To" />
          <select value={filters.CategoryName} onChange={(e) => setFilters((prev) => ({ ...prev, CategoryName: e.target.value }))}>
            <option value="">Select Category</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={filters.Orderby} onChange={(e) => setFilters((prev) => ({ ...prev, Orderby: normalizeText(e.target.value) as CartFilters["Orderby"] }))}>
            <option value="All">All Statuses</option>
            <option value="Processed">Processed</option>
            <option value="Pending">Pending</option>
            <option value="Error">Error</option>
          </select>
          <input value={filters.Keyword} onChange={(e) => setFilters((prev) => ({ ...prev, Keyword: e.target.value }))} placeholder="Keyword" />
        </div>
        <div className="row">
          <button onClick={() => { setAppliedFilters(filters); void loadCart(1, pageSize, filters); }} disabled={busy}>Search</button>
          <button onClick={() => { setFilters(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS); void loadCart(1, pageSize, DEFAULT_FILTERS); }} disabled={busy}>Reset</button>
          <button onClick={() => void runAction("stage-remove", { parentIds: selectedParentIds })} disabled={busy || selectedParentIds.length < 1}>Remove Selected</button>
          <button onClick={() => void runAction("set-status", { parentIds: selectedParentIds, status: "PENDING" })} disabled={busy || selectedParentIds.length < 1}>Mark Pending</button>
          <button onClick={() => void runAction("set-status", { parentIds: selectedParentIds, status: "PROCESSED" })} disabled={busy || selectedParentIds.length < 1}>Mark Processed</button>
          <button onClick={() => void runAction("set-status", { parentIds: selectedParentIds, status: "ERROR" })} disabled={busy || selectedParentIds.length < 1}>Mark Error</button>
          <button onClick={() => void runAction("undo-session")} disabled={busy}>Undo Last Session</button>
          <button onClick={() => setError("Shopify push is disabled until your final approval.")} disabled={busy}>Push Selected to Shopify</button>
          <select value={String(pageSize)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); setPageSize(n); void loadCart(1, n, appliedFilters); }} disabled={busy}>
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={String(size)}>{size} / page</option>)}
          </select>
        </div>
        <p className="mini">Products {summary.totalProducts} | Items {summary.totalItems} | Processed {summary.totalProcessed} | Pending {summary.totalPending} | Error {summary.totalErrors} {shop ? `| Shop ${shop}` : ""}</p>
      </section>

      {status ? <p className="status">{status}</p> : null}
      {warning ? <p className="warn">{warning}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="glass-panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) =>
                    setSelectedParents(() => {
                      const next: Record<string, boolean> = {};
                      if (e.target.checked) {
                        for (const row of rows) next[row.id] = true;
                      }
                      return next;
                    })
                  }
                  aria-label="Select all visible parents"
                />
              </th>
              <th>Title</th><th>Category</th><th>Brand</th><th>SKU</th><th>Stock</th><th>Price</th><th>Variations</th><th>Status</th><th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length < 1 ? (
              <tr><td colSpan={10}>{busy ? "Loading..." : "No rows"}</td></tr>
            ) : rows.map((parent) => {
              const expanded = Boolean(expandedRows[parent.id]);
              return (
                <Fragment key={parent.id}>
                  <tr>
                    <td><input type="checkbox" checked={Boolean(selectedParents[parent.id])} onChange={(e) => setSelectedParents((prev) => ({ ...prev, [parent.id]: e.target.checked }))} /></td>
                    <td>{parent.title}</td><td>{parent.category || "-"}</td><td>{parent.brand || "-"}</td><td>{parent.sku}</td><td>{formatQty(parent.stock)}</td><td>{formatPrice(parent.price)}</td><td>{parent.variations}</td><td>{parent.status}</td>
                    <td><button onClick={() => setExpandedRows((prev) => ({ ...prev, [parent.id]: !prev[parent.id] }))}>{expanded ? "Hide" : "Show"}</button></td>
                  </tr>
                  {expanded ? (
                    <tr className="expand-row">
                      <td colSpan={10}>
                        <div className="variant-wrap">
                          <table className="variant-table">
                            <thead>
                              <tr>
                                <th />
                                <th>SKU</th><th>UPC</th><th>Seller SKU</th><th>Cart ID</th><th>Stock by Location</th><th>Price</th><th>Color</th><th>Size</th><th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parent.variants.map((variant) => {
                                const key = variantKey(parent.id, variant.id);
                                return (
                                  <tr key={key}>
                                    <td><input type="checkbox" checked={Boolean(selectedVariants[key])} onChange={(e) => setSelectedVariants((prev) => ({ ...prev, [key]: e.target.checked }))} /></td>
                                    <td>{variant.sku || "-"}</td><td>{variant.upc || "-"}</td><td>{variant.sellerSku || "-"}</td><td>{variant.cartId || "-"}</td>
                                    <td>
                                      {variant.stockByLocation.length ? (
                                        <ul className="stock-list">
                                          {variant.stockByLocation.map((row) => (
                                            <li key={`${key}-${row.location}`}>
                                              <span>{row.location}</span>
                                              <strong>{formatQty(row.qty)}</strong>
                                            </li>
                                          ))}
                                          <li className="total">
                                            <span>Company Stock</span>
                                            <strong>{formatQty(variant.stock)}</strong>
                                          </li>
                                        </ul>
                                      ) : (
                                        formatQty(variant.stock)
                                      )}
                                    </td>
                                    <td>{formatPrice(variant.price)}</td><td>{variant.color || "-"}</td><td>{variant.size || "-"}</td><td>{variant.status}</td>
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
            })}
          </tbody>
        </table>
      </section>

      <section className="row pager">
        <button onClick={() => { const n = Math.max(1, page - 1); setPage(n); void loadCart(n, pageSize, appliedFilters); }} disabled={busy || page <= 1}>Prev</button>
        <span>Page {page} / {totalPages}</span>
        <button onClick={() => { const n = Math.min(totalPages, page + 1); setPage(n); void loadCart(n, pageSize, appliedFilters); }} disabled={busy || page >= totalPages}>Next</button>
      </section>

      <style jsx>{`
        .page {
          max-width: 1300px;
          margin: 0 auto;
          padding: 14px 8px 28px;
          display: grid;
          gap: 12px;
          color: #f8fafc;
          position: relative;
          z-index: 4;
        }
        .progress-inline {
          margin-bottom: 10px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.45);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.78);
          display: grid;
          gap: 8px;
          position: relative;
          z-index: 6;
        }
        .progress-inline.success {
          border-color: rgba(134, 239, 172, 0.75);
          box-shadow: 0 0 0 1px rgba(134, 239, 172, 0.14), 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        .progress-inline.working {
          border-color: rgba(250, 204, 21, 0.75);
          box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.15), 0 8px 24px rgba(0, 0, 0, 0.24);
        }
        .progress-inline.error {
          border-color: rgba(252, 165, 165, 0.82);
          box-shadow: 0 0 0 1px rgba(252, 165, 165, 0.16), 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        .progress-inline-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .progress-inline-title {
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          color: rgba(226, 232, 240, 0.88);
        }
        .progress-inline-message {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          line-height: 1.35;
          color: #f8fafc;
        }
        .progress-inline-chip {
          min-height: 24px;
          padding: 3px 9px;
          border: 1px solid rgba(255, 255, 255, 0.52);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.14);
          color: rgba(248, 250, 252, 0.96);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
        }
        .progress-inline-chip.working {
          color: #f8fafc;
          border-color: rgba(253, 186, 116, 0.85);
          background: rgba(245, 158, 11, 0.2);
        }
        .progress-inline-chip.success {
          color: #dcfce7;
          border-color: rgba(134, 239, 172, 0.85);
          background: rgba(22, 163, 74, 0.22);
        }
        .progress-inline-chip.error {
          color: #fecaca;
          border-color: rgba(252, 165, 165, 0.9);
          background: rgba(220, 38, 38, 0.2);
        }
        p { margin: 0; color: rgba(226,232,240,.85); }
        .filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .filters :global(input), .filters :global(select) { min-height: 38px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #fff; padding: 0 10px; }
        .filters :global(option) { color: #111827; }
        .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        .row :global(button), .row :global(select) { min-height: 34px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #fff; padding: 0 10px; }
        .mini { margin-top: 8px; font-size: .8rem; color: rgba(226,232,240,.84); }
        .status, .warn, .error { margin: 0; padding: 10px 12px; border-radius: 10px; }
        .status { background: rgba(30,64,175,.2); color: #bfdbfe; }
        .warn { background: rgba(120,53,15,.2); color: #fde68a; }
        .error { background: rgba(127,29,29,.2); color: #fecaca; }
        .table-wrap { overflow-x: auto; border-radius: 12px; }
        table { width: 100%; min-width: 1050px; border-collapse: collapse; }
        th, td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.12); text-align: left; white-space: nowrap; }
        th { font-size: .76rem; color: rgba(226,232,240,.75); }
        .expand-row td { padding: 0; border-bottom: 1px solid rgba(255,255,255,.12); }
        .variant-wrap { overflow-x: auto; padding: 6px 8px 10px; }
        .variant-table { width: 100%; min-width: 980px; border-collapse: collapse; }
        .variant-table th, .variant-table td { white-space: nowrap; }
        .stock-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; min-width: 280px; }
        .stock-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px dashed rgba(255,255,255,.12); padding-bottom: 2px; }
        .stock-list li.total { border-bottom: 0; font-weight: 700; }
        .pager { justify-content: flex-end; }
        @media (max-width: 900px) { .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) { .filters { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}

