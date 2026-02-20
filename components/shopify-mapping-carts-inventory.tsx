"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

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
  image?: string;
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
  image?: string;
  status: "PENDING" | "PROCESSED" | "ERROR";
  processedCount: number;
  pendingCount: number;
  errorCount: number;
  variants: CartInventoryVariantRow[];
  error?: string | null;
};

type CartFilters = {
  SKU: string;
  Name: string;
  Brand: string;
  PriceFrom: string;
  PriceTo: string;
  StockFrom: string;
  StockTo: string;
  StockNull: string;
  Orderby: "All" | "Processed" | "Pending" | "Error";
  CategoryName: string;
  Keyword: string;
  /** "All" | "InLS" (from LS inventory page) | "NotInLS" (manual/Shopify-only) */
  LSSource: "All" | "InLS" | "NotInLS";
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
  Name: "",
  Brand: "",
  PriceFrom: "",
  PriceTo: "",
  StockFrom: "",
  StockTo: "",
  StockNull: "",
  Orderby: "All",
  CategoryName: "",
  Keyword: "",
  LSSource: "All",
};

const PAGE_SIZE_OPTIONS = [20, 50, 75, 100, 200, 500] as const;

type TaskTone = "idle" | "running" | "success" | "error";
type SortField = "title" | "category" | "brand" | "sku" | "stock" | "price" | "variations" | "details";
type SortDir = "asc" | "desc";
type SortState = { field: SortField; dir: SortDir } | null;

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

function toProductGid(parent: CartInventoryParentRow): string | null {
  const id = parent.id.trim();
  if (/^\d+$/.test(id)) return `gid://shopify/Product/${id}`;
  const first = parent.variants?.[0];
  if (!first?.cartId) return null;
  const cartId = String(first.cartId).trim();
  const match = cartId.match(/^(\d+)~\d+/);
  if (match) return `gid://shopify/Product/${match[1]}`;
  if (cartId.startsWith("gid://shopify/ProductVariant/")) {
    return null;
  }
  return null;
}

function sanitizeUiErrorMessage(raw: unknown, fallback: string) {
  const text = normalizeText(raw);
  if (!text) return fallback;
  return text;
}

function compareField(a: CartInventoryParentRow, b: CartInventoryParentRow, field: SortField): number {
  switch (field) {
    case "title": return (a.title || "").localeCompare(b.title || "", undefined, { numeric: true, sensitivity: "base" });
    case "category": return (a.category || "").localeCompare(b.category || "", undefined, { numeric: true, sensitivity: "base" });
    case "brand": return (a.brand || "").localeCompare(b.brand || "", undefined, { numeric: true, sensitivity: "base" });
    case "sku": return (a.sku || "").localeCompare(b.sku || "", undefined, { numeric: true, sensitivity: "base" });
    case "stock": return (a.stock ?? -Infinity) - (b.stock ?? -Infinity);
    case "price": return (a.price ?? -Infinity) - (b.price ?? -Infinity);
    case "variations": return (a.variations ?? 0) - (b.variations ?? 0);
    case "details": {
      const order: Record<string, number> = { ERROR: 0, PENDING: 1, PROCESSED: 2 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    }
    default: return 0;
  }
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
  const [sortState, setSortState] = useState<SortState>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [comparePopupOpen, setComparePopupOpen] = useState(false);
  const [compareNotInLastSyncRows, setCompareNotInLastSyncRows] = useState<CartInventoryParentRow[]>([]);
  const [compareMeta, setCompareMeta] = useState<{ lastSyncCount: number; totalCartCount: number; hasLastSync: boolean } | null>(null);
  const [goToPageInput, setGoToPageInput] = useState("");
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const allFilteredRowsRef = useRef<CartInventoryParentRow[] | null>(null);
  const removalQueueRef = useRef<Set<string>>(new Set());
  const [removalQueueSize, setRemovalQueueSize] = useState(0);
  const statusBarRef = useRef<HTMLElement | null>(null);
  const [statusBarHeight, setStatusBarHeight] = useState(0);
  const [task, setTask] = useState<{
    label: string;
    progress: number;
    tone: TaskTone;
  }>({ label: "Ready", progress: 0, tone: "idle" });

  useEffect(() => {
    const node = statusBarRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setStatusBarHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  function updateFilter<K extends keyof CartFilters>(key: K, value: CartFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function loadCart(nextPage = page, nextPageSize = pageSize, nextFilters = appliedFilters, opts?: { startLabel?: string; successLabel?: string }) {
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
    setTask({ label: opts?.startLabel || "Loading Shopify catalog...", progress: 24, tone: "running" });
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
      setAllFilteredSelected(false);
      allFilteredRowsRef.current = null;
      setExpandedRows({});
      setTask({ label: opts?.successLabel || "Shopify catalog loaded", progress: 100, tone: "success" });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Unable to load Shopify catalog.");
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadCart(1, 50, DEFAULT_FILTERS);
  }, []);

  const SELECT_PAGE_SIZE = 500;

  async function selectAllFilteredProducts() {
    setBusy(true);
    setError("");
    setStatus("");
    setTask({ label: "Selecting all filtered products...", progress: 20, tone: "running" });
    try {
      const allRows: CartInventoryParentRow[] = [];
      let currentPage = 1;
      let totalPages = 1;
      let totalProducts = 0;
      while (currentPage <= totalPages) {
        const params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("pageSize", String(SELECT_PAGE_SIZE));
        for (const [key, value] of Object.entries(appliedFilters)) {
          const text = normalizeText(value);
          if (text) params.set(key, text);
        }
        if (shop) params.set("shop", shop);
        const resp = await fetch(`/api/shopify/cart-inventory?${params.toString()}`, { cache: "no-store" });
        const json = (await resp.json().catch(() => ({}))) as CartInventoryResponse;
        if (!resp.ok || json.ok === false) {
          throw new Error(normalizeText(json.error) || "Failed to fetch filtered products.");
        }
        const pageRows = Array.isArray(json.rows) ? json.rows : [];
        for (const row of pageRows) allRows.push(row);
        totalPages = Math.max(1, Number(json.totalPages || 1));
        if (currentPage === 1) totalProducts = Number(json.summary?.totalProducts || 0) || totalPages * SELECT_PAGE_SIZE;
        setTask({
          label: `Selecting filtered products (${allRows.length}/${totalProducts})...`,
          progress: Math.min(90, 20 + Math.round((currentPage / totalPages) * 70)),
          tone: "running",
        });
        currentPage += 1;
      }
      const next: Record<string, boolean> = {};
      for (const row of allRows) next[row.id] = true;
      setSelectedParents(next);
      setSelectedVariants({});
      allFilteredRowsRef.current = allRows;
      setAllFilteredSelected(true);
      setStatus(`Selected all ${allRows.length} filtered products.`);
      setTask({ label: `Selected ${allRows.length} filtered products`, progress: 100, tone: "success" });
    } catch (e: unknown) {
      const msg = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Unable to select all filtered products.");
      setError(msg);
      setTask({ label: msg, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function clearAllFilteredSelection() {
    setAllFilteredSelected(false);
    allFilteredRowsRef.current = null;
  }

  async function openComparePopup() {
    if (!shop) {
      setError("Shop context is required. Load Cart Inventory first.");
      return;
    }
    setBusy(true);
    setError("");
    setTask({ label: "Comparing with last sync...", progress: 30, tone: "running" });
    try {
      const params = new URLSearchParams();
      params.set("shop", shop);
      const resp = await fetch(`/api/shopify/cart-inventory/compare?${params.toString()}`, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        rows?: CartInventoryParentRow[];
        lastSyncCount?: number;
        totalCartCount?: number;
        notInLastSyncCount?: number;
        hasLastSync?: boolean;
        message?: string;
      };
      if (!resp.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || "Failed to fetch compare data.");
      }
      const rows = Array.isArray(json.rows) ? json.rows : [];
      setCompareNotInLastSyncRows(rows);
      setCompareMeta({
        lastSyncCount: json.lastSyncCount ?? 0,
        totalCartCount: json.totalCartCount ?? 0,
        hasLastSync: json.hasLastSync ?? false,
      });
      setComparePopupOpen(true);
      const label = json.hasLastSync
        ? `${rows.length} item${rows.length !== 1 ? "s" : ""} in Cart not from last sync`
        : normalizeText(json.message) || "No recent sync found";
      setTask({ label, progress: 100, tone: "success" });
    } catch (e: unknown) {
      const msg = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Unable to compare.");
      setError(msg);
      setTask({ label: msg, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

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

  const selectedCounts = useMemo(() => {
    const refRows = allFilteredRowsRef.current;
    const ids = new Set(selectedParentIds.map((id) => id.toLowerCase()));
    if (refRows) {
      let products = 0;
      let items = 0;
      for (const row of refRows) {
        if (!ids.has(row.id.toLowerCase())) continue;
        products += 1;
        items += row.variations ?? 0;
      }
      return { products, items };
    }
    let products = 0;
    let items = 0;
    for (const row of rows) {
      if (!ids.has(row.id.toLowerCase())) continue;
      products += 1;
      items += row.variations ?? 0;
    }
    return { products, items };
  }, [selectedParentIds, rows]);

  const sortedRows = useMemo(() => {
    if (!sortState) return rows;
    const sorted = [...rows].sort((a, b) => compareField(a, b, sortState.field));
    return sortState.dir === "desc" ? sorted.reverse() : sorted;
  }, [rows, sortState]);

  const allVisibleSelected =
    sortedRows.length > 0 && sortedRows.every((row) => Boolean(selectedParents[row.id]));
  const statusBarTone = task.tone === "running" ? "working" : task.tone;

  function toggleSort(field: SortField) {
    setSortState((prev) => {
      if (prev?.field === field) {
        if (prev.dir === "asc") return { field, dir: "desc" };
        return null;
      }
      return { field, dir: "asc" };
    });
  }

  function getSortMark(field: SortField) {
    if (sortState?.field !== field) return "↕";
    return sortState.dir === "asc" ? "↑" : "↓";
  }

  function getAriaSort(field: SortField): "ascending" | "descending" | "none" {
    if (sortState?.field !== field) return "none";
    return sortState.dir === "asc" ? "ascending" : "descending";
  }

  function getParentRowsForIds(ids: string[]): CartInventoryParentRow[] {
    const idSet = new Set(ids.map((x) => x.toLowerCase()));
    const refRows = allFilteredRowsRef.current;
    const source = refRows ?? rows;
    return source.filter((r) => idSet.has(r.id.toLowerCase()));
  }

  async function runAction(action: "stage-remove" | "set-status" | "undo-session", extra?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setStatus("");
    setTask({ label: `Running ${action}...`, progress: 35, tone: "running" });
    try {
      if (action === "stage-remove") {
        const ids = (extra?.parentIds as string[]) ?? [];
        const parentRows = getParentRowsForIds(ids);
        for (const parent of parentRows) {
          const gid = toProductGid(parent);
          if (gid) removalQueueRef.current.add(gid);
        }
        setRemovalQueueSize(removalQueueRef.current.size);
      }
      const resp = await fetch("/api/shopify/cart-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shop, ...extra }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, `Action failed: ${action}`));
      if (action === "stage-remove") setStatus("Selected rows removed from staging. Push to Shopify to remove from live catalog.");
      if (action === "set-status") setStatus("Status updated for selected rows.");
      if (action === "undo-session") setStatus("Undo completed.");
      setTask({ label: `${action} complete`, progress: 100, tone: "success" });
      await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing catalog..." });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Action failed.");
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function pushSelectedToShopify(background = false) {
    const removeProductGids = Array.from(removalQueueRef.current);
    const hasPush = selectedParentIds.length > 0;
    const hasRemove = removeProductGids.length > 0;
    if (!hasPush && !hasRemove) {
      setError("Nothing to push. Select items to push, or remove items first to remove them from Shopify.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    setTask({ label: background ? "Starting sync in background..." : "Pushing to Shopify...", progress: 35, tone: "running" });
    try {
      const resp = await fetch("/api/shopify/cart-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push-selected",
          shop,
          parentIds: selectedParentIds,
          removeProductGids: hasRemove ? removeProductGids : undefined,
          background,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; message?: string; pushed?: number; removedFromShopify?: number; archivedNotInCart?: number };
      if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, "Push to Shopify failed."));
      if (resp.status === 202) {
        if (hasRemove) {
          removalQueueRef.current.clear();
          setRemovalQueueSize(0);
        }
        setStatus("Sync started in background. You can close this page.");
        setTask({ label: "Sync running in background", progress: 100, tone: "success" });
        await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing catalog..." });
        return;
      }
      if (hasRemove) {
        removalQueueRef.current.clear();
        setRemovalQueueSize(0);
      }
      const parts: string[] = [];
      if (hasPush && json.pushed != null) parts.push(`Updated ${json.pushed} variant(s)`);
      if (hasRemove && json.removedFromShopify != null) parts.push(`Archived ${json.removedFromShopify} product(s) from catalog`);
      if (!hasRemove && json.archivedNotInCart != null && json.archivedNotInCart > 0) parts.push(`Archived ${json.archivedNotInCart} product(s) not in Cart`);
      setStatus(parts.length ? parts.join(". ") : "Push to Shopify completed.");
      setTask({ label: "Push to Shopify completed", progress: 100, tone: "success" });
      await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing catalog..." });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Push to Shopify failed.");
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function goToPageNumber() {
    const parsed = Number.parseInt(goToPageInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > totalPages) return;
    setGoToPageInput("");
    setPage(parsed);
    void loadCart(parsed, pageSize, appliedFilters, { startLabel: `Loading page ${parsed}...`, successLabel: "Page loaded" });
  }

  function statusBadge(s: "PENDING" | "PROCESSED" | "ERROR") {
    const cls = s === "PROCESSED" ? "sync-processed" : s === "ERROR" ? "sync-error" : "sync-pending";
    return <span className={`sync-badge ${cls}`}>{s}</span>;
  }

  return (
    <main className="page" style={{ ["--status-bar-height" as string]: `${statusBarHeight}px` }}>
      <section
        ref={statusBarRef}
        className={`card status-bar ${statusBarTone}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="status-bar-head">
          <div className="status-bar-title">Progress</div>
          <span className={`status-chip ${statusBarTone}`}>
            {task.tone === "error" ? "Error" : task.tone === "running" ? "Working" : task.tone === "success" ? "Done" : "Idle"}
          </span>
        </div>
        <div className="status-bar-message">
          {task.tone === "error" ? `Error: ${task.label}` : task.label}
        </div>
        {status ? <div className="status-bar-meta">{status}</div> : null}
      </section>

      <section className="glass-panel card filter-card">
        <div className="filters">
          <input value={filters.SKU} onChange={(e) => updateFilter("SKU", e.target.value)} placeholder="SKU or UPC (partial)" />
          <input value={filters.Name} onChange={(e) => updateFilter("Name", e.target.value)} placeholder="Product Name" />
          <input value={filters.Brand} onChange={(e) => updateFilter("Brand", e.target.value)} placeholder="Brand" />
          <input value={filters.PriceFrom} onChange={(e) => updateFilter("PriceFrom", e.target.value)} placeholder="Price From" />
          <input value={filters.PriceTo} onChange={(e) => updateFilter("PriceTo", e.target.value)} placeholder="Price To" />
          <input value={filters.StockFrom} onChange={(e) => updateFilter("StockFrom", e.target.value)} placeholder="Stock From" />
          <input value={filters.StockTo} onChange={(e) => updateFilter("StockTo", e.target.value)} placeholder="Stock To" />
          <select
            value={
              filters.StockNull ? "null"
              : filters.StockFrom === "1" && !filters.StockTo ? "instock"
              : filters.StockFrom === "0" && filters.StockTo === "0" ? "zero"
              : filters.StockFrom === "0.01" && filters.StockTo === "0.99" ? "low"
              : "all"
            }
            onChange={(e) => {
              const p = normalizeText(e.target.value);
              if (p === "null") setFilters((prev) => ({ ...prev, StockFrom: "", StockTo: "", StockNull: "null" }));
              else if (p === "zero") setFilters((prev) => ({ ...prev, StockFrom: "0", StockTo: "0", StockNull: "" }));
              else if (p === "low") setFilters((prev) => ({ ...prev, StockFrom: "0.01", StockTo: "0.99", StockNull: "" }));
              else if (p === "instock") setFilters((prev) => ({ ...prev, StockFrom: "1", StockTo: "", StockNull: "" }));
              else setFilters((prev) => ({ ...prev, StockFrom: "", StockTo: "", StockNull: "" }));
            }}
            title="Quick stock presets to find edge cases (e.g. low stock 0&lt;x&lt;1, null stock)"
          >
            <option value="all">Stock: All</option>
            <option value="zero">Stock: Zero</option>
            <option value="low">Stock: Low (0&lt;x&lt;1)</option>
            <option value="instock">Stock: In stock (≥1)</option>
            <option value="null">Stock: Null/unknown</option>
          </select>
          <select value={filters.CategoryName} onChange={(e) => updateFilter("CategoryName", e.target.value)}>
            <option value="">Select Category</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={filters.Orderby} onChange={(e) => updateFilter("Orderby", normalizeText(e.target.value) as CartFilters["Orderby"])}>
            <option value="All">All Sync Statuses</option>
            <option value="Processed">Processed</option>
            <option value="Pending">Pending</option>
            <option value="Error">Error</option>
          </select>
          <select value={filters.LSSource} onChange={(e) => updateFilter("LSSource", normalizeText(e.target.value) as CartFilters["LSSource"])} title="Filter by Lightspeed inventory source">
            <option value="All">All Sources</option>
            <option value="InLS">In LS Inventory</option>
            <option value="NotInLS">Not in LS (manual/Shopify)</option>
          </select>
          <select className="page-size-select" value={String(pageSize)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); setPageSize(n); void loadCart(1, n, appliedFilters, { startLabel: "Updating page size..." }); }} disabled={busy}>
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={String(size)}>{size} / page</option>)}
          </select>
        </div>
        <div className="row actions-row">
          <button className="btn-base search-btn" onClick={() => { setAppliedFilters(filters); void loadCart(1, pageSize, filters, { startLabel: "Applying filters...", successLabel: "Filters applied" }); }} disabled={busy}>Search</button>
          <button className="btn-base btn-outline" onClick={() => { setFilters(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS); void loadCart(1, pageSize, DEFAULT_FILTERS, { startLabel: "Resetting filters...", successLabel: "Filters reset" }); }} disabled={busy}>Reset</button>
          <button className="btn-base btn-outline" onClick={() => void openComparePopup()} disabled={busy || !shop} title="Show Cart items that were not part of the last queue sync from LS inventory">Compare</button>
          <button className="btn-base btn-outline" onClick={() => void selectAllFilteredProducts()} disabled={busy || summary.totalProducts < 1} title="Select all products matching current filters">Select All</button>
          <button className="btn-base btn-outline" onClick={() => { setSelectedParents({}); setSelectedVariants({}); clearAllFilteredSelection(); }} disabled={busy || selectedParentIds.length < 1} title="Clear selection">Clear Selection</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("stage-remove", { parentIds: selectedParentIds })} disabled={busy || selectedParentIds.length < 1}>Remove Selected</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("set-status", { parentIds: selectedParentIds, status: "PENDING" })} disabled={busy || selectedParentIds.length < 1}>Mark Pending</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("set-status", { parentIds: selectedParentIds, status: "PROCESSED" })} disabled={busy || selectedParentIds.length < 1}>Mark Processed</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("undo-session")} disabled={busy}>Undo Last Session</button>
          <button className="btn-base push-btn" onClick={() => pushSelectedToShopify(false)} disabled={busy || (selectedParentIds.length < 1 && removalQueueSize < 1)} title={removalQueueSize > 0 ? `Push updates and remove ${removalQueueSize} product(s) from Shopify catalog` : "Push selected items to Shopify. Wait for completion."}>Push to Shopify{removalQueueSize > 0 ? ` (+ remove ${removalQueueSize})` : ""}</button>
          <button className="btn-base btn-outline" onClick={() => pushSelectedToShopify(true)} disabled={busy || (selectedParentIds.length < 1 && removalQueueSize < 1)} title="Push in background. You can close this page and sync will continue.">Push (background)</button>
        </div>
        <p className="mini">
          Products {summary.totalProducts} | Items {summary.totalItems} | <span className="mini-processed">Processed {summary.totalProcessed}</span> | <span className="mini-pending">Pending {summary.totalPending}</span> | <span className="mini-error">Errors {summary.totalErrors}</span>
          {selectedCounts.products > 0 ? (
            <span className="mini-selected"> | Selected: {selectedCounts.products} product{selectedCounts.products !== 1 ? "s" : ""} ({selectedCounts.items} item{selectedCounts.items !== 1 ? "s" : ""})</span>
          ) : null}
          {removalQueueSize > 0 ? (
            <span className="mini-removal"> | {removalQueueSize} pending removal from Shopify (<button type="button" className="mini-link" onClick={() => { removalQueueRef.current.clear(); setRemovalQueueSize(0); }}>clear</button>)</span>
          ) : null}
          {shop ? ` | Shop ${shop}` : ""}
        </p>
      </section>

      {status ? <p className="status-msg">{status}</p> : null}
      {warning ? <p className="warn-msg">{warning}</p> : null}
      {error ? <p className="error-msg">{error}</p> : null}

      <section className="glass-panel card table-wrap table-card">
        <table className="parent-table">
          <colgroup>
            <col style={{ width: 34 }} />
            <col style={{ width: 340 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 72 }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      clearAllFilteredSelection();
                      const next: Record<string, boolean> = {};
                      for (const row of sortedRows) next[row.id] = true;
                      setSelectedParents(next);
                    } else {
                      setSelectedParents((prev) => {
                        const next = { ...prev };
                        for (const row of sortedRows) next[row.id] = false;
                        return next;
                      });
                    }
                  }}
                  aria-label="Select all visible parents"
                />
              </th>
              <th aria-sort={getAriaSort("title")}>
                <button type="button" className={`sort-btn align-left ${sortState?.field === "title" ? "active" : ""}`} onClick={() => toggleSort("title")}>
                  <span>Title</span>
                  <span className="sort-mark">{getSortMark("title")}</span>
                </button>
              </th>
              <th aria-sort={getAriaSort("category")}>
                <button type="button" className={`sort-btn ${sortState?.field === "category" ? "active" : ""}`} onClick={() => toggleSort("category")}>
                  <span>Category</span>
                  <span className="sort-mark">{getSortMark("category")}</span>
                </button>
              </th>
              <th aria-sort={getAriaSort("brand")}>
                <button type="button" className={`sort-btn ${sortState?.field === "brand" ? "active" : ""}`} onClick={() => toggleSort("brand")}>
                  <span>Brand</span>
                  <span className="sort-mark">{getSortMark("brand")}</span>
                </button>
              </th>
              <th aria-sort={getAriaSort("sku")}>
                <button type="button" className={`sort-btn ${sortState?.field === "sku" ? "active" : ""}`} onClick={() => toggleSort("sku")}>
                  <span>SKU</span>
                  <span className="sort-mark">{getSortMark("sku")}</span>
                </button>
              </th>
              <th aria-sort={getAriaSort("stock")}>
                <button type="button" className={`sort-btn ${sortState?.field === "stock" ? "active" : ""}`} onClick={() => toggleSort("stock")}>
                  <span>Stock</span>
                  <span className="sort-mark">{getSortMark("stock")}</span>
                </button>
              </th>
              <th aria-sort={getAriaSort("price")}>
                <button type="button" className={`sort-btn ${sortState?.field === "price" ? "active" : ""}`} onClick={() => toggleSort("price")}>
                  <span>Price</span>
                  <span className="sort-mark">{getSortMark("price")}</span>
                </button>
              </th>
              <th aria-sort={getAriaSort("variations")}>
                <button type="button" className={`sort-btn ${sortState?.field === "variations" ? "active" : ""}`} onClick={() => toggleSort("variations")}>
                  <span>Variations</span>
                  <span className="sort-mark">{getSortMark("variations")}</span>
                </button>
              </th>
              <th className="details-header-cell" aria-sort={getAriaSort("details")}>
                <span className="details-header-inner">
                  <button type="button" className={`sort-btn ${sortState?.field === "details" ? "active" : ""}`} onClick={() => toggleSort("details")}>
                    <span>Details</span>
                    <span className="sort-mark">{getSortMark("details")}</span>
                  </button>
                </span>
              </th>
              <th className="picture-header-cell">Picture</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length < 1 ? (
              <tr><td colSpan={10}>{busy ? "Loading..." : "No products found. Pull catalog from Cart Configurations."}</td></tr>
            ) : sortedRows.map((parent) => {
              const expanded = Boolean(expandedRows[parent.id]);
              const parentImage = normalizeText(parent.image);
              return (
                <Fragment key={parent.id}>
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedParents[parent.id])}
                        onChange={(e) => setSelectedParents((prev) => ({ ...prev, [parent.id]: e.target.checked }))}
                      />
                    </td>
                    <td>
                      <span className="title-cell">
                        <img
                          className="shopify-title-logo"
                          src="/brand/shopify-bag.svg"
                          alt=""
                          aria-hidden="true"
                          width={22}
                          height={32}
                          style={{ width: 22, height: 32 }}
                        />
                        <span>{parent.title}</span>
                      </span>
                    </td>
                    <td>{parent.category || "-"}</td>
                    <td>{parent.brand || "-"}</td>
                    <td>{parent.sku}</td>
                    <td>{formatQty(parent.stock)}</td>
                    <td>{formatPrice(parent.price)}</td>
                    <td>{parent.variations}</td>
                    <td className="details-cell">
                      <span className="details-parent-wrap">
                        <span className="details-availability-inline">
                          {statusBadge(parent.status)}
                        </span>
                        <button
                          className="details-toggle-btn"
                          onClick={() => setExpandedRows((prev) => ({ ...prev, [parent.id]: !prev[parent.id] }))}
                          aria-label={expanded ? "Hide details" : "Show details"}
                        >
                          {expanded ? (
                            <svg className="eye-symbol" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                              <path d="M2.5 12C4.5 7.9 8 5.5 12 5.5C16 5.5 19.5 7.9 21.5 12C19.5 16.1 16 18.5 12 18.5C8 18.5 4.5 16.1 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
                              <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <svg className="eye-symbol" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                              <path d="M2.5 12C4.5 7.9 8 5.5 12 5.5C16 5.5 19.5 7.9 21.5 12C19.5 16.1 16 18.5 12 18.5C8 18.5 4.5 16.1 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" />
                            </svg>
                          )}
                        </button>
                      </span>
                    </td>
                    <td className="picture-cell">
                      {parentImage ? (
                        <button type="button" className="thumb-btn" onClick={() => setPreviewImage(parentImage)} aria-label="Preview image">
                          <img className="parent-detail-thumb" src={parentImage} alt="" width={40} height={58} />
                        </button>
                      ) : (
                        <span className="muted">&ndash;</span>
                      )}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="expand-row">
                      <td colSpan={10}>
                        <div className="variant-wrap">
                          <table className="variant-table">
                            <colgroup>
                              <col style={{ width: 34 }} />
                              <col style={{ width: 340 }} />
                              <col style={{ width: 190 }} />
                              <col style={{ width: 170 }} />
                              <col style={{ width: 110 }} />
                              <col style={{ width: 80 }} />
                              <col style={{ width: 90 }} />
                              <col style={{ width: 100 }} />
                              <col style={{ width: 88 }} />
                              <col style={{ width: 72 }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th />
                                <th>SKU</th>
                                <th>UPC</th>
                                <th colSpan={2}>Stock</th>
                                <th>Price</th>
                                <th>Color</th>
                                <th>Size</th>
                                <th className="details-head"><span className="variant-head-shifted">Details</span></th>
                                <th className="picture-header-cell"><span className="variant-head-shifted">Picture</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {parent.variants.map((variant) => {
                                const key = variantKey(parent.id, variant.id);
                                return (
                                  <tr key={key} className="variant-row">
                                    <td />
                                    <td>
                                      <span className="variant-sku-cell">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(selectedVariants[key])}
                                          onChange={(e) => setSelectedVariants((prev) => ({ ...prev, [key]: e.target.checked }))}
                                        />
                                        <span>{variant.sku || "-"}</span>
                                      </span>
                                    </td>
                                    <td>{variant.upc || "-"}</td>
                                    <td colSpan={2} className="variant-stock-cell">
                                      <div className="stock-matrix">
                                        <div className="stock-matrix-head">
                                          <span>Store</span>
                                          <span>Stock</span>
                                        </div>
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
                                          <div className="stock-fallback">Company Stock: {formatQty(variant.stock)}</div>
                                        )}
                                      </div>
                                    </td>
                                    <td>{formatPrice(variant.price)}</td>
                                    <td>{variant.color || "-"}</td>
                                    <td>{variant.size || "-"}</td>
                                    <td className="details-cell variant-details-cell">
                                      <span className="details-availability-inline">
                                        {statusBadge(variant.status)}
                                      </span>
                                    </td>
                                    <td className="picture-cell">
                                      {normalizeText(variant.image) ? (
                                        <button type="button" className="thumb-btn" onClick={() => setPreviewImage(normalizeText(variant.image))} aria-label="Preview image">
                                          <img className="detail-thumb" src={normalizeText(variant.image)} alt="" width={72} height={104} />
                                        </button>
                                      ) : (
                                        <span className="muted">&ndash;</span>
                                      )}
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
            })}
          </tbody>
        </table>
      </section>

      <section className="row pager">
        <button className="btn-base btn-outline" onClick={() => { const n = Math.max(1, page - 1); setPage(n); void loadCart(n, pageSize, appliedFilters, { startLabel: "Loading previous page...", successLabel: "Page loaded" }); }} disabled={busy || page <= 1}>Prev</button>
        <span>Page {page} / {totalPages}</span>
        <button className="btn-base btn-outline" onClick={() => { const n = Math.min(totalPages, page + 1); setPage(n); void loadCart(n, pageSize, appliedFilters, { startLabel: "Loading next page...", successLabel: "Page loaded" }); }} disabled={busy || page >= totalPages}>Next</button>
        <span className="pager-goto">
          <label htmlFor="cart-pager-goto-input" className="pager-goto-label">Go to</label>
          <input
            id="cart-pager-goto-input"
            type="number"
            min={1}
            max={totalPages}
            className="pager-goto-input"
            value={goToPageInput}
            onChange={(e) => setGoToPageInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToPageNumber()}
            placeholder={String(page)}
            disabled={busy}
            aria-label="Page number"
          />
          <button type="button" className="btn-base btn-outline pager-goto-btn" onClick={goToPageNumber} disabled={busy || !goToPageInput.trim()}>Go</button>
        </span>
      </section>

      {previewImage ? (
        <div className="preview-overlay" onClick={() => setPreviewImage(null)} role="dialog" aria-label="Image preview">
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="Preview" className="preview-img" />
            <button type="button" className="preview-close" onClick={() => setPreviewImage(null)} aria-label="Close preview">&times;</button>
          </div>
        </div>
      ) : null}

      {comparePopupOpen ? (
        <div className="compare-overlay" onClick={() => setComparePopupOpen(false)} role="dialog" aria-label="Items not in last sync">
          <div className="compare-popup" onClick={(e) => e.stopPropagation()}>
            <div className="compare-popup-head">
              <h3 className="compare-popup-title">Items in Cart Not From Last Sync</h3>
              <button type="button" className="compare-popup-close" onClick={() => setComparePopupOpen(false)} aria-label="Close">&times;</button>
            </div>
            <p className="compare-popup-desc">
              {compareMeta?.hasLastSync
                ? `These ${compareNotInLastSyncRows.length} product${compareNotInLastSyncRows.length !== 1 ? "s" : ""} exist in Cart Inventory but were not part of the last queue sync from LS (${compareMeta.lastSyncCount} synced, ${compareMeta.totalCartCount} total in Cart).`
                : "No recent queue sync found. Queue items from the Inventory page first, then use Compare."}
            </p>
            <div className="compare-popup-table-wrap">
              <table className="compare-popup-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Brand</th>
                    <th>Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {compareNotInLastSyncRows.length < 1 ? (
                    <tr><td colSpan={6}>{compareMeta?.hasLastSync ? "All Cart items came from the last sync." : "Queue items from the Inventory page first."}</td></tr>
                  ) : (
                    compareNotInLastSyncRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.title || "-"}</td>
                        <td>{row.sku || "-"}</td>
                        <td>{row.category || "-"}</td>
                        <td>{row.brand || "-"}</td>
                        <td>{formatQty(row.stock)}</td>
                        <td>{statusBadge(row.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .page {
          --detail-thumb-w: 56px;
          --detail-thumb-h: 80px;
          --parent-thumb-w: 40px;
          --parent-thumb-h: 58px;
          max-width: 1220px;
          margin: 0 auto;
          padding: 134px 8px 26px;
          display: grid;
          gap: 12px;
          color: #f8fafc;
        }
        .card { padding: 18px; display: grid; gap: 10px; }
        .status-bar {
          position: fixed;
          top: 89px;
          left: calc(var(--page-inline-gap, 13px) + var(--page-edge-gap, 13px));
          right: calc(
            var(
              --content-right-pad,
              calc(var(--integration-panel-width, 255px) + var(--page-edge-gap, 13px) + var(--content-api-gap, 13px))
            ) + 8px
          );
          z-index: 40;
          display: grid;
          gap: 4px;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid #dbe5f1;
          background: #f8fafc;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        :global(.content.menu-open) .status-bar {
          left: 280px;
        }
        :global(.content.no-integration-panel) .status-bar {
          right: calc(var(--page-inline-gap, 13px) + 8px);
        }
        .status-bar-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .status-bar-title {
          font-weight: 700;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          font-size: 0.78rem;
          color: #64748b;
        }
        .status-chip {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 2px 10px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #475569;
        }
        .status-chip.working { background: #fef9c3; color: #854d0e; }
        .status-chip.success { background: #dcfce7; color: #166534; }
        .status-chip.error { background: #fee2e2; color: #991b1b; }
        .status-bar.idle { border-color: #dbe5f1; }
        .status-bar.working {
          border-color: #facc15;
          box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.15), 0 8px 24px rgba(0, 0, 0, 0.24);
        }
        .status-bar.success {
          border-color: #86efac;
          box-shadow: 0 0 0 1px rgba(134, 239, 172, 0.14), 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        .status-bar.error {
          border-color: #fca5a5;
          box-shadow: 0 0 0 1px rgba(252, 165, 165, 0.16), 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        .status-bar-message {
          font-size: 0.95rem;
          font-weight: 600;
          color: #0f172a;
          line-height: 1.35;
        }
        .status-bar-meta {
          font-size: 0.8rem;
          color: #475569;
          line-height: 1.25;
        }
        .filter-card { gap: 8px; }
        .filters {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .page :global(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])),
        .page :global(textarea),
        .page :global(select) {
          text-transform: none;
        }
        .page :global(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])::placeholder),
        .page :global(textarea::placeholder) {
          text-transform: none;
        }
        .filters :global(option) { color: #111827; }
        .row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .actions-row { margin-top: 2px; }
        .actions-row :global(.btn-base) {
          min-height: 44px;
          padding: 0 14px;
        }
        .page :global(.search-btn) {
          background: linear-gradient(180deg, #4bc99a 0%, #3fb88b 50%, #38a87e 100%);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 10px;
          font-weight: 700;
          padding: 0 24px;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.2) inset, 0 1px 2px rgba(0, 0, 0, 0.08);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        }
        .page :global(.search-btn:hover:not(:disabled)) {
          background: linear-gradient(180deg, #52d1a3 0%, #45c494 50%, #3fb88b 100%);
          border-color: rgba(255, 255, 255, 0.45);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.25) inset, 0 2px 6px rgba(0, 0, 0, 0.12);
        }
        .page :global(.search-btn:disabled) {
          background: linear-gradient(180deg, #6b9b8a 0%, #5a8a7a 100%);
          opacity: 0.7;
        }
        .page :global(.push-btn) {
          background: linear-gradient(180deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 10px;
          font-weight: 700;
          padding: 0 20px;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.15) inset, 0 1px 2px rgba(0, 0, 0, 0.08);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        }
        .page :global(.push-btn:hover:not(:disabled)) {
          background: linear-gradient(180deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%);
          border-color: rgba(255, 255, 255, 0.4);
        }
        .page :global(.push-btn:disabled) {
          opacity: 0.55;
        }
        .page-size-select { min-width: 122px; }
        .mini {
          margin: 0;
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.9);
          font-weight: 600;
        }
        .mini-processed { color: #86efac; }
        .mini-pending { color: #fde68a; }
        .mini-error { color: #fca5a5; }
        .mini-removal { color: #94a3b8; }
        .mini-link { background: none; border: none; color: #67e8f9; cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
        .mini-link:hover { color: #22d3ee; }
        .status-msg, .warn-msg, .error-msg {
          margin: 0;
          border-radius: 12px;
          padding: 8px 10px;
          border: 1px solid transparent;
          font-size: 0.92rem;
          font-weight: 600;
        }
        .status-msg {
          border-color: rgba(16, 185, 129, 0.32);
          background: rgba(16, 185, 129, 0.14);
          color: #a7f3d0;
        }
        .warn-msg {
          border-color: rgba(245, 158, 11, 0.36);
          background: rgba(245, 158, 11, 0.14);
          color: #fde68a;
        }
        .error-msg {
          border-color: rgba(248, 113, 113, 0.32);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
        }
        .table-wrap { overflow-x: auto; border-radius: 12px; }
        .table-card { padding-top: 8px; }
        .selection-count {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(248, 250, 252, 0.96);
          font-weight: 700;
          font-size: 0.9rem;
          line-height: 1;
          border-radius: 10px;
        }
        table { width: 100%; min-width: 1050px; border-collapse: collapse; }
        .parent-table { table-layout: fixed; }
        th, td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.12); text-align: left; white-space: nowrap; }
        .sort-btn {
          min-height: 0;
          border: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          font-weight: 700;
          padding: 0;
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
        }
        .sort-btn.align-left { justify-content: flex-start; }
        .sort-btn:hover,
        .sort-btn:focus-visible {
          transform: none !important;
          box-shadow: none !important;
          opacity: 1 !important;
          color: #fff;
          outline: none;
        }
        .sort-btn.active { color: #f8fafc; }
        .sort-mark { font-size: .72rem; line-height: 1; opacity: .9; }
        .parent-table th:nth-child(3),
        .parent-table td:nth-child(3),
        .parent-table th:nth-child(4),
        .parent-table td:nth-child(4),
        .parent-table th:nth-child(5),
        .parent-table td:nth-child(5),
        .parent-table th:nth-child(6),
        .parent-table td:nth-child(6),
        .parent-table th:nth-child(7),
        .parent-table td:nth-child(7),
        .parent-table th:nth-child(8),
        .parent-table td:nth-child(8),
        .parent-table th:nth-child(9),
        .parent-table td:nth-child(9),
        .parent-table th:nth-child(10),
        .parent-table td:nth-child(10) { text-align: center !important; }
        th { font-size: .76rem; color: rgba(226,232,240,.75); }
        .picture-header-cell { font-weight: 700; }
        .picture-cell { vertical-align: middle; text-align: center !important; }
        .thumb-btn {
          background: none;
          border: 0;
          padding: 0;
          margin: 0;
          cursor: pointer;
          display: inline-block;
          border-radius: 4px;
          transition: opacity 0.15s;
        }
        .thumb-btn:hover { opacity: 0.8; }
        .muted { color: rgba(226,232,240,.55); }
        .title-cell { display: inline-flex; align-items: center; gap: 8px; }
        .shopify-title-logo { width: 18px; height: 24px; object-fit: contain; display: inline-block; }
        .details-head { text-align: center !important; }
        .details-header-cell { text-align: center !important; }
        .details-header-inner {
          display: inline-block;
          max-width: 88px;
          width: 100%;
          margin: 0 auto;
        }
        .details-header-inner .sort-btn {
          width: 100%;
          justify-content: center;
        }
        .details-cell { text-align: center !important; vertical-align: middle; }
        .details-parent-wrap {
          display: grid;
          grid-template-columns: auto 56px;
          align-items: center;
          justify-content: center;
          justify-items: center;
          gap: 0;
          width: 100%;
          max-width: 88px;
          margin: 0 auto;
        }
        .details-availability-inline {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .details-toggle-btn {
          width: 56px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0;
          line-height: 1;
        }
        .eye-symbol { width: 18px; height: 18px; display: block; }
        .parent-detail-thumb { width: var(--parent-thumb-w); height: var(--parent-thumb-h); object-fit: cover; border-radius: 4px; background: rgba(255,255,255,.08); display: block; margin: 0 auto; }
        .sync-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .sync-processed { background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.3); }
        .sync-pending { background: rgba(245, 158, 11, 0.2); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.3); }
        .sync-error { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
        .expand-row td { padding: 0; border-bottom: 1px solid rgba(255,255,255,.12); }
        .variant-wrap { overflow-x: auto; padding: 0; }
        .variant-table { width: 100%; min-width: 1444px; border-collapse: collapse; table-layout: fixed; }
        .variant-table th, .variant-table td { white-space: nowrap; padding: 8px 10px; }
        .variant-table th:nth-child(2),
        .variant-table td:nth-child(2) { padding-left: 200px; text-align: left !important; }
        .variant-sku-cell { display: inline-flex; align-items: center; gap: 8px; }
        .variant-table td:nth-child(9),
        .variant-table td:nth-child(10) { text-align: center !important; }
        .variant-table th:nth-child(9),
        .variant-table th:nth-child(10) { text-align: center !important; }
        .variant-head-shifted { display: inline-block; transform: translateX(-40px); }
        .variant-row td { vertical-align: top; background: rgba(15, 23, 42, 0.08); }
        .variant-row td.details-cell { vertical-align: middle !important; }
        .variant-stock-cell { white-space: normal !important; }
        .stock-matrix { width: 100%; min-width: 0; max-width: 100%; }
        .stock-matrix-head { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px; padding: 2px 0 6px; border-top: 1px solid rgba(250, 204, 21, .55); border-bottom: 1px solid rgba(255,255,255,.2); font-size: .76rem; font-weight: 700; color: rgba(226,232,240,.9); }
        .stock-fallback { color: rgba(226,232,240,.92); font-weight: 700; }
        .stock-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; min-width: 0; }
        .stock-list li { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; border-bottom: 1px solid rgba(255,255,255,.14); padding: 6px 0; }
        .stock-list li.total { border-bottom: 0; border-top: 1px solid rgba(255,255,255,.2); margin-top: 2px; font-weight: 700; }
        .stock-matrix-head span:first-child,
        .stock-list li span { white-space: nowrap; }
        .stock-matrix-head span:last-child,
        .stock-list li strong { justify-self: end; text-align: right; min-width: 22px; }
        .variant-details-cell { vertical-align: middle !important; text-align: center !important; }
        .variant-details-cell .details-availability-inline {
          margin: 0 auto;
          transform: translateX(-40px);
        }
        .variant-row td.picture-cell { vertical-align: middle !important; }
        .variant-row td.picture-cell .thumb-btn,
        .variant-row td.picture-cell > .muted { transform: translateX(-40px); }
        .detail-thumb { width: var(--detail-thumb-w); height: var(--detail-thumb-h); object-fit: cover; border-radius: 4px; background: rgba(255,255,255,.08); display: block; margin: 0 auto; }
        .pager { justify-content: flex-end; align-items: center; gap: 12px; flex-wrap: wrap; }
        .pager :global(.btn-base) { min-height: 40px; min-width: 64px; padding: 0 14px; }
        .pager span { font-size: 1rem; font-weight: 700; line-height: 1.2; }
        .pager-goto {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .pager-goto-label {
          font-size: 0.95rem;
          font-weight: 600;
          color: rgba(248, 250, 252, 0.9);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .pager-goto-input {
          width: 56px;
          min-height: 40px;
          padding: 0 8px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          font-size: 1rem;
          font-weight: 600;
          text-align: center;
        }
        .pager-goto-input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.5);
        }
        .pager-goto-input::placeholder { color: rgba(248, 250, 252, 0.5); }
        .pager-goto-btn { min-width: 48px; }
        .preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .preview-content {
          position: relative;
          cursor: default;
          max-width: 90vw;
          max-height: 90vh;
        }
        .preview-img {
          display: block;
          max-width: 90vw;
          max-height: 85vh;
          object-fit: contain;
          border-radius: 10px;
          box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
        }
        .preview-close {
          position: absolute;
          top: -14px;
          right: -14px;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.7);
          background: rgba(0, 0, 0, 0.6);
          color: #fff;
          font-size: 1.3rem;
          font-weight: 700;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .preview-close:hover {
          background: rgba(0, 0, 0, 0.85);
          border-color: #fff;
        }
        .compare-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 24px;
        }
        .compare-popup {
          cursor: default;
          background: #1e293b;
          border-radius: 12px;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
          max-width: min(900px, 95vw);
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .compare-popup-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }
        .compare-popup-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
          color: #f8fafc;
        }
        .compare-popup-close {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          font-size: 1.4rem;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .compare-popup-close:hover {
          background: rgba(255, 255, 255, 0.18);
          color: #f8fafc;
        }
        .compare-popup-desc {
          margin: 0;
          padding: 12px 20px;
          font-size: 0.9rem;
          color: #94a3b8;
          flex-shrink: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .compare-popup-table-wrap {
          overflow: auto;
          flex: 1;
          min-height: 0;
        }
        .compare-popup-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        .compare-popup-table th,
        .compare-popup-table td {
          padding: 10px 14px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .compare-popup-table th {
          background: rgba(0, 0, 0, 0.2);
          color: #94a3b8;
          font-weight: 600;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .compare-popup-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .compare-popup-table td {
          color: #e2e8f0;
        }
        @media (max-width: 1180px) {
          .status-bar {
            top: 89px;
            left: 8px;
            right: 8px;
          }
          :global(.content.menu-open) .status-bar {
            left: 280px;
          }
          .page { padding-top: 134px; }
          .card { padding: 14px; }
        }
        @media (max-width: 900px) {
          .page { padding-top: 146px; }
          .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .filters { grid-template-columns: 1fr; }
          .actions-row :global(.btn-base) { flex: 1 1 auto; }
          .pager span { font-size: 0.95rem; }
        }
      `}</style>
    </main>
  );
}
