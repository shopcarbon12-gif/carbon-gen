"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type CatalogRow = {
  id: string;
  itemId: string;
  systemSku: string;
  customSku: string;
  description: string;
  upc: string;
  ean: string;
  color: string;
  size: string;
  retailPrice: string;
  retailPriceNumber: number | null;
  category: string;
  itemType: string;
  qtyTotal: number | null;
  locations: Record<string, number | null>;
};

type CatalogOptions = {
  categories: string[];
  shops: string[];
  itemTypes: string[];
};

type CatalogResponse = {
  ok?: boolean;
  error?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  defaultLocation?: string;
  truncated?: boolean;
  options?: CatalogOptions;
  rows?: CatalogRow[];
};

type CatalogFilters = {
  q: string;
  category: string;
  shops: string[];
  itemType: string;
};

type SortField =
  | "item"
  | "qty"
  | "price"
  | "category"
  | "upc"
  | "customSku"
  | "color"
  | "size"
  | `location:${string}`;
type SortDirection = "asc" | "desc";
type SortState = {
  field: SortField;
  direction: SortDirection;
};
type PagerToken = number | "ellipsis";

const DEFAULT_LOCATION = "CARBON JEANS COMPANY";
const ALL_SHOPS_VALUE = "__all_shops__";
const PAGE_SIZE_OPTIONS = [100, 500] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const DEFAULT_SORT: SortState = { field: "customSku", direction: "asc" };

const DEFAULT_FILTERS: CatalogFilters = {
  q: "",
  category: "all",
  shops: [DEFAULT_LOCATION],
  itemType: "all",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toCsvCell(value: unknown) {
  const raw = String(value ?? "");
  if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function formatQty(value: number | null | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.00$/, "");
}

function formatPrice(row: CatalogRow) {
  const amount = row.retailPriceNumber;
  if (amount !== null && Number.isFinite(amount)) {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  const fallback = normalizeText(row.retailPrice);
  if (!fallback) return "0.00";
  const parsed = Number.parseFloat(fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getLocationQty(row: CatalogRow, locationName: string) {
  const direct = row.locations?.[locationName];
  if (direct !== undefined) return direct;
  const match = Object.keys(row.locations || {}).find(
    (name) => normalizeLower(name) === normalizeLower(locationName)
  );
  if (!match) return null;
  return row.locations[match];
}

function buildTimestampSlug() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function buildCatalogCsv(
  rows: CatalogRow[],
  view: {
    showCombinedQty: boolean;
    locationColumnNames: string[];
  }
) {
  const qtyHeader = view.showCombinedQty ? ["QTY"] : [];
  const locationHeaders = view.locationColumnNames.map((name) => `${name} QTY`);
  const header = [
    "CUSTOM SKU",
    "UPC",
    "ITEM",
    "COLOR",
    "SIZE",
    ...qtyHeader,
    ...locationHeaders,
    "PRICE",
    "CATEGORY",
    "SYSTEM SKU",
    "ITEM ID",
    "ITEM TYPE",
  ];

  const lines = rows.map((row) => {
    const qtyValues = view.showCombinedQty
      ? [toCsvCell(formatQty(sumSelectedShopsQty(row, view.locationColumnNames)))]
      : [];
    const locationValues = view.locationColumnNames.map((locationName) =>
      toCsvCell(formatQty(getLocationQty(row, locationName)))
    );
    return [
      toCsvCell(row.customSku || ""),
      toCsvCell(row.upc || row.ean || ""),
      toCsvCell(row.description || row.customSku || row.systemSku || row.itemId || ""),
      toCsvCell(row.color || ""),
      toCsvCell(row.size || ""),
      ...qtyValues,
      ...locationValues,
      toCsvCell(formatPrice(row)),
      toCsvCell(row.category || ""),
      toCsvCell(row.systemSku || ""),
      toCsvCell(row.itemId || ""),
      toCsvCell(row.itemType || ""),
    ].join(",");
  });

  return [header.map(toCsvCell).join(","), ...lines].join("\n");
}

function triggerCsvDownload(csvText: string, filename: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function filtersEqual(a: CatalogFilters, b: CatalogFilters) {
  if (a.q !== b.q || a.category !== b.category || a.itemType !== b.itemType) return false;
  const left = [...new Set(a.shops.map((value) => normalizeText(value).toLowerCase()).filter(Boolean))].sort();
  const right = [...new Set(b.shops.map((value) => normalizeText(value).toLowerCase()).filter(Boolean))].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sumSelectedShopsQty(row: CatalogRow, selectedShops: string[]) {
  let sum = 0;
  let hasAny = false;
  for (const shopName of selectedShops) {
    const qty = getLocationQty(row, shopName);
    if (qty === null || qty === undefined || Number.isNaN(qty)) continue;
    sum += qty;
    hasAny = true;
  }
  if (!hasAny) return null;
  return Number(sum.toFixed(2));
}

function toLocationSortField(locationName: string): SortField {
  return `location:${normalizeText(locationName)}`;
}

export default function ShopifyMappingInventory() {
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [options, setOptions] = useState<CatalogOptions>({
    categories: [],
    shops: [],
    itemTypes: [],
  });
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT);
  const [defaultLocation, setDefaultLocation] = useState(DEFAULT_LOCATION);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<null | "selected" | "all">(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const allShopOptions = useMemo(
    () => options.shops.filter((shopName) => normalizeText(shopName)),
    [options.shops]
  );
  const normalizedDefaultLocation = normalizeText(defaultLocation) || DEFAULT_LOCATION;
  const defaultShopOption = useMemo(() => {
    return (
      allShopOptions.find(
        (shopName) => normalizeLower(shopName) === normalizeLower(normalizedDefaultLocation)
      ) ||
      allShopOptions[0] ||
      normalizedDefaultLocation
    );
  }, [allShopOptions, normalizedDefaultLocation]);
  const visibleLocationColumns = useMemo(() => {
    const appliedSet = new Set(
      appliedFilters.shops.map((shopName) => normalizeText(shopName).toLowerCase()).filter(Boolean)
    );
    const matched = allShopOptions.filter((shopName) => appliedSet.has(normalizeLower(shopName)));
    if (matched.length > 0) return matched;
    return [defaultShopOption];
  }, [allShopOptions, appliedFilters.shops, defaultShopOption]);
  const shopFilterOptions = useMemo(() => {
    const source = allShopOptions.length > 0 ? allShopOptions : [defaultShopOption];
    return Array.from(new Set(source.map((shopName) => normalizeText(shopName)).filter(Boolean)));
  }, [allShopOptions, defaultShopOption]);
  const shopFilterValue = useMemo(() => {
    const selected = filters.shops.map((shopName) => normalizeText(shopName)).filter(Boolean);
    if (selected.length > 1) return ALL_SHOPS_VALUE;
    const single = selected[0];
    if (!single) return defaultShopOption;
    const matched = shopFilterOptions.find((shopName) => normalizeLower(shopName) === normalizeLower(single));
    return matched || defaultShopOption;
  }, [defaultShopOption, filters.shops, shopFilterOptions]);

  const showCombinedQtyColumn = visibleLocationColumns.length > 1;
  const tableColumnCount =
    1 + // select
    3 + // custom sku, upc, item
    2 + // color, size
    (showCombinedQtyColumn ? 1 : 0) +
    visibleLocationColumns.length +
    2; // price, category

  const selectedVisibleRows = useMemo(
    () => rows.filter((row) => Boolean(selectedRows[row.id])),
    [rows, selectedRows]
  );

  const allVisibleSelected = useMemo(
    () => rows.length > 0 && rows.every((row) => Boolean(selectedRows[row.id])),
    [rows, selectedRows]
  );
  const pagerTokens = useMemo<PagerToken[]>(() => {
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
  }, [totalPages]);

  const buildCatalogParams = useCallback(
    (activeFilters: CatalogFilters, targetPage: number, extras?: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("pageSize", String(pageSize));
      params.set("sortField", sortState.field);
      params.set("sortDir", sortState.direction);

      const q = normalizeText(activeFilters.q);
      if (q) params.set("q", q);

      const category = normalizeText(activeFilters.category);
      if (category && normalizeLower(category) !== "all") params.set("category", category);

      const normalizedShops = Array.from(
        new Set(activeFilters.shops.map((shopName) => normalizeText(shopName)).filter(Boolean))
      );
      if (normalizedShops.length > 0) {
        params.set("shops", JSON.stringify(normalizedShops));
      }

      const itemType = normalizeText(activeFilters.itemType);
      if (itemType && normalizeLower(itemType) !== "all") params.set("itemType", itemType);

      for (const [key, value] of Object.entries(extras || {})) {
        if (!value) continue;
        params.set(key, value);
      }

      return params;
    },
    [pageSize, sortState.direction, sortState.field]
  );

  const loadCatalogPage = useCallback(
    async (targetPage: number, activeFilters: CatalogFilters, opts?: { refresh?: boolean }) => {
      const refresh = Boolean(opts?.refresh);
      setBusy(true);
      if (refresh) setRefreshBusy(true);
      setError("");

      try {
        const params = buildCatalogParams(activeFilters, targetPage, refresh ? { refresh: "1" } : undefined);
        const resp = await fetch(`/api/lightspeed/catalog?${params.toString()}`, { cache: "no-store" });
        const json = (await resp.json().catch(() => ({}))) as CatalogResponse;
        if (!resp.ok) {
          throw new Error(normalizeText(json?.error) || "Failed to load Lightspeed catalog.");
        }

        const nextRows = Array.isArray(json?.rows) ? json.rows : [];
        const nextOptions = json?.options || { categories: [], shops: [], itemTypes: [] };
        const nextDefaultLocation = normalizeText(json?.defaultLocation) || DEFAULT_LOCATION;

        setRows(nextRows);
        setTotal(Math.max(0, Number(json?.total || 0)));
        setTotalPages(Math.max(1, Number(json?.totalPages || 1)));
        setDefaultLocation(nextDefaultLocation);
        setOptions({
          categories: Array.isArray(nextOptions.categories) ? nextOptions.categories : [],
          shops: Array.isArray(nextOptions.shops) ? nextOptions.shops : [],
          itemTypes: Array.isArray(nextOptions.itemTypes) ? nextOptions.itemTypes : [],
        });
        setSelectedRows({});
      } catch (e: any) {
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setSelectedRows({});
        setError(String(e?.message || "Failed to load Lightspeed catalog."));
      } finally {
        setBusy(false);
        if (refresh) setRefreshBusy(false);
      }
    },
    [buildCatalogParams]
  );

  useEffect(() => {
    void loadCatalogPage(page, appliedFilters);
  }, [appliedFilters, loadCatalogPage, page, pageSize]);

  function setFilterField<K extends keyof CatalogFilters>(field: K, value: CatalogFilters[K]) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function submitSearch() {
    setStatus("");
    setError("");
    setExportMenuOpen(false);
    const nextShops = filters.shops.length > 0 ? filters.shops : [defaultShopOption];
    const next: CatalogFilters = { ...filters, shops: nextShops };
    setFilters(next);

    if (filtersEqual(next, appliedFilters)) {
      if (page !== 1) {
        setPage(1);
        return;
      }
      void loadCatalogPage(1, next);
      return;
    }

    setPage(1);
    setAppliedFilters(next);
  }

  function clearFilters() {
    const reset: CatalogFilters = {
      q: "",
      category: "all",
      shops: [defaultShopOption],
      itemType: "all",
    };
    setStatus("");
    setError("");
    setExportMenuOpen(false);
    setFilters(reset);
    setPage(1);
    setAppliedFilters(reset);
  }

  function changePageSize(value: number) {
    if (!PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number])) return;
    if (value === pageSize) return;
    setStatus("");
    setError("");
    setExportMenuOpen(false);
    setSelectedRows({});
    setPage(1);
    setPageSize(value);
  }

  function toggleSort(field: SortField) {
    setStatus("");
    setError("");
    setExportMenuOpen(false);
    setSelectedRows({});
    setPage(1);
    setSortState((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { field, direction: "asc" };
    });
  }

  function renderSortArrow(field: SortField) {
    if (sortState.field !== field) return null;
    return <span className="sort-arrow">{sortState.direction === "asc" ? "^" : "v"}</span>;
  }

  function toggleAllVisible(nextChecked: boolean) {
    setSelectedRows((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (nextChecked) next[row.id] = true;
        else delete next[row.id];
      }
      return next;
    });
  }

  function toggleRow(rowId: string, nextChecked: boolean) {
    setSelectedRows((prev) => {
      const next = { ...prev };
      if (nextChecked) next[rowId] = true;
      else delete next[rowId];
      return next;
    });
  }

  async function exportSelected() {
    if (selectedVisibleRows.length < 1) {
      setError("Select at least one row to export.");
      return;
    }
    setExportBusy("selected");
    setExportMenuOpen(false);
    setStatus("");
    setError("");

    try {
      const csv = buildCatalogCsv(selectedVisibleRows, {
        showCombinedQty: showCombinedQtyColumn,
        locationColumnNames: visibleLocationColumns,
      });
      triggerCsvDownload(csv, `lightspeed-catalog-selected-${buildTimestampSlug()}.csv`);
      setStatus(`Exported ${selectedVisibleRows.length} selected item(s).`);
    } catch (e: any) {
      setError(String(e?.message || "Failed to export selected items."));
    } finally {
      setExportBusy(null);
    }
  }

  async function exportAllFiltered() {
    setExportBusy("all");
    setExportMenuOpen(false);
    setStatus("");
    setError("");

    try {
      const params = buildCatalogParams(appliedFilters, 1, {
        all: "1",
        pageSize: "20000",
      });
      const resp = await fetch(`/api/lightspeed/catalog?${params.toString()}`, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as CatalogResponse;
      if (!resp.ok) {
        throw new Error(normalizeText(json?.error) || "Failed to export Lightspeed catalog.");
      }

      const allRows = Array.isArray(json?.rows) ? json.rows : [];
      if (allRows.length < 1) {
        throw new Error("No catalog rows available for export.");
      }

      const csv = buildCatalogCsv(allRows, {
        showCombinedQty: showCombinedQtyColumn,
        locationColumnNames: visibleLocationColumns,
      });
      triggerCsvDownload(csv, `lightspeed-catalog-all-${buildTimestampSlug()}.csv`);

      if (json?.truncated) {
        setStatus(`Exported ${allRows.length} row(s). Export was truncated by API size limits.`);
      } else {
        setStatus(`Exported ${allRows.length} filtered item(s).`);
      }
    } catch (e: any) {
      setError(String(e?.message || "Failed to export all filtered items."));
    } finally {
      setExportBusy(null);
    }
  }

  async function printSelectedRows() {
    if (selectedVisibleRows.length < 1) {
      setError("Select at least one row to print RFID labels.");
      return;
    }

    setPrintBusy(true);
    setExportMenuOpen(false);
    setError("");
    setStatus(`Starting RFID print for ${selectedVisibleRows.length} selected item(s)...`);

    let success = 0;
    let failed = 0;
    const failureMessages: string[] = [];

    try {
      for (let index = 0; index < selectedVisibleRows.length; index += 1) {
        const row = selectedVisibleRows[index];
        const labelId = normalizeText(row.systemSku || row.itemId || row.customSku);
        if (!labelId) {
          failed += 1;
          failureMessages.push(`Row ${index + 1}: Missing Lightspeed System ID.`);
          continue;
        }

        setStatus(`Printing ${index + 1} / ${selectedVisibleRows.length}...`);

        const payload = {
          lightspeedSystemId: labelId,
          itemName: normalizeText(row.description),
          color: normalizeText(row.color),
          size: normalizeText(row.size),
          upc: normalizeText(row.upc || row.ean),
          customSku: normalizeText(row.customSku),
          retailPrice: normalizeText(row.retailPrice || "0"),
          countryCode: "USA",
          qty: 1,
          printNow: true,
          printerIp: "",
          printerPort: "",
        };

        const resp = await fetch("/api/rfid/labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await resp.json().catch(() => ({}))) as { error?: string; printStatus?: { message?: string } };

        if (!resp.ok) {
          failed += 1;
          failureMessages.push(
            `Row ${index + 1}: ${normalizeText(json?.error) || "Unable to print RFID label."}`
          );
          continue;
        }

        success += 1;
      }

      if (failed > 0) {
        setError(failureMessages.slice(0, 3).join(" | "));
      }
      setStatus(`RFID print completed. Success: ${success}. Failed: ${failed}.`);
    } catch (e: any) {
      setError(String(e?.message || "RFID print failed."));
    } finally {
      setPrintBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="glass-panel card hero-card">
        <h2>Inventory Control Grid</h2>
        <p className="hint">
          Search, filter, and stage inventory for Shopify mapping using live Lightspeed catalog data.
        </p>
      </section>

      <nav className="quick-nav" aria-label="Inventory sections">
        <Link href="/studio/shopify-mapping-inventory/workset" className="quick-chip">
          Workset
        </Link>
        <Link href="/studio/shopify-mapping-inventory/sales" className="quick-chip">
          Sales
        </Link>
        <Link href="/studio/shopify-mapping-inventory/inventory" className="quick-chip active">
          Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/carts-inventory" className="quick-chip">
          Carts Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/configurations" className="quick-chip">
          Configurations
        </Link>
      </nav>

      <section className="glass-panel card filter-card">
        <div className="search-row">
          <input
            value={filters.q}
            onChange={(e) => setFilterField("q", e.target.value)}
            placeholder="Search item descriptions, SKU, UPC, or system ID"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitSearch();
              }
            }}
          />
          <button className="btn-base btn-primary search-btn" onClick={submitSearch} disabled={busy}>
            {busy ? "Searching..." : "Search"}
          </button>
          <button
            className="btn-base btn-outline"
            onClick={() => void loadCatalogPage(page, appliedFilters, { refresh: true })}
            disabled={refreshBusy}
          >
            {refreshBusy ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="filters-grid">
          <label>
            <span className="control-label">Shop / Location</span>
            <select
              value={shopFilterValue}
              onChange={(e) => {
                const nextValue = normalizeText(e.target.value);
                if (nextValue === ALL_SHOPS_VALUE) {
                  setFilterField("shops", shopFilterOptions);
                  return;
                }
                setFilterField("shops", [nextValue || defaultShopOption]);
              }}
              disabled={busy}
            >
              <option value={ALL_SHOPS_VALUE}>All Shops</option>
              {shopFilterOptions.map((shopName) => (
                <option key={shopName} value={shopName}>
                  {shopName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="control-label">Category</span>
            <select
              value={filters.category}
              onChange={(e) => setFilterField("category", e.target.value)}
              disabled={busy}
            >
              <option value="all">All Categories</option>
              {options.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="control-label">Item Type</span>
            <select
              value={filters.itemType}
              onChange={(e) => setFilterField("itemType", e.target.value)}
              disabled={busy}
            >
              <option value="all">All Item Types</option>
              {options.itemTypes.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {itemType}
                </option>
              ))}
            </select>
          </label>

          <div className="filter-actions">
            <button className="btn-base btn-outline" onClick={clearFilters} disabled={busy}>
              Clear Filters
            </button>
          </div>
        </div>
      </section>

      <section className="glass-panel card table-card">
        <div className="table-head">
          <div className="table-counters">
            <strong>{total.toLocaleString()} Local Items Found</strong>
            <div className="table-meta">
              <span>
                Page {page} / {totalPages} | {pageSize} per page
              </span>
              <label className="page-size-control">
                <span>Per Page</span>
                <select
                  className="page-size-select"
                  value={String(pageSize)}
                  onChange={(e) => changePageSize(Number.parseInt(e.target.value, 10))}
                  disabled={busy}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={String(size)}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="table-actions">
            <button
              className="btn-base btn-primary"
              onClick={printSelectedRows}
              disabled={printBusy || exportBusy !== null || selectedVisibleRows.length < 1}
            >
              {printBusy ? "Printing..." : `Print${selectedVisibleRows.length ? ` (${selectedVisibleRows.length})` : ""}`}
            </button>

            <div className="export-wrap">
              <button
                className="btn-base btn-outline"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                disabled={printBusy || exportBusy !== null}
              >
                {exportBusy === null ? "Export" : "Exporting..."}
              </button>
              {exportMenuOpen ? (
                <div className="export-menu">
                  <button
                    className="btn-base btn-outline"
                    onClick={exportSelected}
                    disabled={selectedVisibleRows.length < 1 || exportBusy !== null}
                  >
                    Export Selected
                  </button>
                  <button className="btn-base btn-outline" onClick={exportAllFiltered} disabled={exportBusy !== null}>
                    Export All Filtered
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {status ? <p className="status">{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAllVisible(e.target.checked)}
                    aria-label="Select all visible rows"
                  />
                </th>
                <th>
                  <button
                    type="button"
                    className={`sort-head-btn ${sortState.field === "customSku" ? "active" : ""}`}
                    onClick={() => toggleSort("customSku")}
                    disabled={busy}
                  >
                    CUSTOM SKU {renderSortArrow("customSku")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`sort-head-btn ${sortState.field === "upc" ? "active" : ""}`}
                    onClick={() => toggleSort("upc")}
                    disabled={busy}
                  >
                    UPC {renderSortArrow("upc")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`sort-head-btn ${sortState.field === "item" ? "active" : ""}`}
                    onClick={() => toggleSort("item")}
                    disabled={busy}
                  >
                    ITEM {renderSortArrow("item")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`sort-head-btn ${sortState.field === "color" ? "active" : ""}`}
                    onClick={() => toggleSort("color")}
                    disabled={busy}
                  >
                    COLOR {renderSortArrow("color")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`sort-head-btn ${sortState.field === "size" ? "active" : ""}`}
                    onClick={() => toggleSort("size")}
                    disabled={busy}
                  >
                    SIZE {renderSortArrow("size")}
                  </button>
                </th>
                {showCombinedQtyColumn ? (
                  <th>
                    <button
                      type="button"
                      className={`sort-head-btn ${sortState.field === "qty" ? "active" : ""}`}
                      onClick={() => toggleSort("qty")}
                      disabled={busy}
                    >
                      QTY. {renderSortArrow("qty")}
                    </button>
                  </th>
                ) : null}
                {visibleLocationColumns.map((locationName) => (
                  <th key={locationName}>
                    <button
                      type="button"
                      className={`sort-head-btn ${
                        sortState.field === toLocationSortField(locationName) ? "active" : ""
                      }`}
                      onClick={() => toggleSort(toLocationSortField(locationName))}
                      disabled={busy}
                    >
                      {locationName.toUpperCase()} {renderSortArrow(toLocationSortField(locationName))}
                    </button>
                  </th>
                ))}
                <th>
                  <button
                    type="button"
                    className={`sort-head-btn ${sortState.field === "price" ? "active" : ""}`}
                    onClick={() => toggleSort("price")}
                    disabled={busy}
                  >
                    PRICE {renderSortArrow("price")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`sort-head-btn ${sortState.field === "category" ? "active" : ""}`}
                    onClick={() => toggleSort("category")}
                    disabled={busy}
                  >
                    CATEGORY {renderSortArrow("category")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length < 1 ? (
                <tr>
                  <td colSpan={tableColumnCount}>
                    <div className="empty">{busy ? "Loading catalog..." : "No items found for current filters."}</div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="check-col">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedRows[row.id])}
                        onChange={(e) => toggleRow(row.id, e.target.checked)}
                        aria-label={`Select ${row.description || row.customSku || row.itemId || "item"}`}
                      />
                    </td>
                    <td className="item-cell">
                      {row.customSku || "-"}
                    </td>
                    <td>{row.upc || row.ean || "-"}</td>
                    <td className="item-cell">
                      {row.itemId || row.systemSku ? (
                        <Link
                          className="item-link"
                          href={`/studio/lightspeed-catalog/${encodeURIComponent(
                            normalizeText(row.itemId) || normalizeText(row.systemSku) || row.id
                          )}`}
                        >
                          {row.description || row.customSku || row.systemSku || row.itemId || "-"}
                        </Link>
                      ) : (
                        row.description || row.customSku || row.systemSku || row.itemId || "-"
                      )}
                    </td>
                    <td>{row.color || "-"}</td>
                    <td>{row.size || "-"}</td>
                    {showCombinedQtyColumn ? (
                      <td>{formatQty(sumSelectedShopsQty(row, visibleLocationColumns))}</td>
                    ) : null}
                    {visibleLocationColumns.map((locationName) => (
                      <td key={`${row.id}-${locationName}`}>{formatQty(getLocationQty(row, locationName))}</td>
                    ))}
                    <td>${formatPrice(row)}</td>
                    <td>{row.category || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button
            className="btn-base btn-outline pager-jump-btn"
            onClick={() => setPage(1)}
            disabled={busy || page <= 1}
          >
            Go To First
          </button>
          <button
            className="pager-arrow-btn"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={busy || page <= 1}
            aria-label="Previous page"
          >
            {"<"}
          </button>
          <div className="pager-pages" aria-label="Pagination">
            {pagerTokens.map((token, index) =>
              token === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="pager-ellipsis">
                  ...
                </span>
              ) : (
                <button
                  key={token}
                  className={`pager-page-btn ${page === token ? "active" : ""}`}
                  onClick={() => setPage(token)}
                  disabled={busy || page === token}
                >
                  {token}
                </button>
              )
            )}
          </div>
          <button
            className="pager-arrow-btn"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={busy || page >= totalPages}
            aria-label="Next page"
          >
            {">"}
          </button>
          <button
            className="btn-base btn-outline pager-jump-btn"
            onClick={() => setPage(totalPages)}
            disabled={busy || page >= totalPages}
          >
            Go To Last
          </button>
        </div>
      </section>

      <style jsx>{`
        .page {
          max-width: none;
          margin: 0;
          padding: 22px 0 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .card {
          padding: 18px;
          display: grid;
          gap: 12px;
        }
        h2 {
          margin: 0;
        }
        .hint {
          margin: 0;
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.94rem;
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
        .search-row {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) 128px 128px;
          gap: 10px;
          align-items: center;
        }
        .search-btn {
          min-width: 120px;
        }
        .filters-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(190px, 1fr));
          gap: 10px;
          align-items: end;
        }
        .filter-actions {
          display: flex;
          align-items: end;
          justify-content: flex-end;
          min-height: 52px;
        }
        .table-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          flex-wrap: wrap;
        }
        .table-counters {
          display: grid;
          gap: 4px;
        }
        .table-counters strong {
          font-size: 1.05rem;
        }
        .table-counters span {
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.9rem;
        }
        .table-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .page-size-control {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: rgba(226, 232, 240, 0.9);
          font-size: 0.84rem;
        }
        .page-size-select {
          min-height: 38px;
          border-radius: 10px;
          padding: 6px 10px;
          width: 86px;
        }
        .table-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .export-wrap {
          position: relative;
        }
        .export-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          z-index: 12;
          width: 190px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(5, 10, 25, 0.98);
          padding: 8px;
          display: grid;
          gap: 8px;
          box-shadow: 0 16px 34px rgba(2, 6, 23, 0.55);
        }
        .status,
        .error {
          margin: 0;
          border-radius: 12px;
          padding: 8px 10px;
          border: 1px solid transparent;
          font-size: 0.92rem;
        }
        .status {
          border-color: rgba(16, 185, 129, 0.32);
          background: rgba(16, 185, 129, 0.14);
          color: #a7f3d0;
        }
        .error {
          border-color: rgba(248, 113, 113, 0.32);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
        }
        .table-wrap {
          overflow: auto;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1000px;
          font-size: 0.92rem;
        }
        th,
        td {
          border: 1px solid rgba(255, 255, 255, 0.18);
          padding: 8px;
          text-align: left;
          vertical-align: middle;
          white-space: nowrap;
        }
        th {
          background: rgba(255, 255, 255, 0.1);
          font-size: 0.85rem;
          letter-spacing: 0.02em;
        }
        .sort-head-btn {
          border: 0;
          background: transparent;
          color: rgba(226, 232, 240, 0.94);
          font: inherit;
          font-weight: inherit;
          letter-spacing: inherit;
          padding: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .sort-head-btn:hover {
          color: #f8fafc;
        }
        .sort-head-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .sort-head-btn.active {
          color: #f8fafc;
        }
        td {
          background: rgba(255, 255, 255, 0.03);
        }
        .item-cell {
          max-width: 340px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #dbeafe;
          font-weight: 600;
        }
        .item-link {
          color: #93c5fd;
          text-decoration: none;
          border-bottom: 1px solid transparent;
        }
        .item-link:hover {
          color: #dbeafe;
          border-bottom-color: rgba(147, 197, 253, 0.8);
        }
        .check-col {
          width: 36px;
          text-align: center;
        }
        .sort-arrow {
          color: #fb7185;
          font-weight: 700;
        }
        .empty {
          min-height: 120px;
          display: grid;
          place-items: center;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.95rem;
          text-align: center;
          padding: 18px;
        }
        .pager {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pager-jump-btn {
          min-height: 38px;
          padding: 0 12px;
          font-size: 0.84rem;
          white-space: nowrap;
        }
        .pager-arrow-btn {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .pager-arrow-btn:hover:not(:disabled) {
          background: rgba(147, 197, 253, 0.22);
          border-color: rgba(147, 197, 253, 0.65);
        }
        .pager-arrow-btn:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }
        .pager-pages {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .pager-page-btn {
          min-width: 34px;
          height: 34px;
          padding: 0 8px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(226, 232, 240, 0.95);
          font-size: 0.84rem;
          font-weight: 600;
          cursor: pointer;
        }
        .pager-page-btn:hover:not(:disabled) {
          background: rgba(147, 197, 253, 0.2);
          border-color: rgba(147, 197, 253, 0.6);
          color: #f8fafc;
        }
        .pager-page-btn.active {
          background: rgba(147, 197, 253, 0.36);
          border-color: rgba(147, 197, 253, 0.82);
          color: #f8fafc;
        }
        .pager-page-btn:disabled {
          cursor: default;
        }
        .pager-ellipsis {
          color: rgba(226, 232, 240, 0.72);
          font-size: 0.88rem;
          padding: 0 3px;
        }
        @media (max-width: 1040px) {
          .search-row {
            grid-template-columns: 1fr;
          }
          .filters-grid {
            grid-template-columns: repeat(2, minmax(180px, 1fr));
          }
          .filter-actions {
            justify-content: flex-start;
          }
        }
        @media (max-width: 700px) {
          .table-actions {
            width: 100%;
            justify-content: flex-start;
          }
          .pager {
            justify-content: flex-start;
          }
          .filters-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
