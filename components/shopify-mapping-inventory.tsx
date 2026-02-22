"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SyncTogglesBar } from "@/components/sync-toggles-bar";

type MatrixVariantRow = {
  id: string;
  parentId: string;
  sku: string;
  upc: string;
  sellerSku: string;
  cartId: string;
  stock: number | null;
  shopifyStock?: number | null;
  stockByLocation: Array<{ location: string; qty: number | null }>;
  price: number | null;
  color: string;
  size: string;
  image?: string;
  availableInShopify: boolean;
  stagedInCart: boolean;
};

type MatrixParentRow = {
  id: string;
  title: string;
  category: string;
  brand: string;
  sku: string;
  stock: number | null;
  shopifyStock?: number | null;
  stockGap?: number | null;
  price: number | null;
  variations: number;
  image?: string;
  availableAt: { shopify: boolean; cart: boolean };
  variants: MatrixVariantRow[];
};

type InventoryFilters = {
  SKU: string;
  GroupSKU: string;
  Name: string;
  Brand: string;
  PriceFrom: string;
  PriceTo: string;
  StockFrom: string;
  StockTo: string;
  CategoryName: string;
  ProductCreatedFrom: string;
  ProductCreatedTo: string;
  Keyword: string;
  CartState: "All" | "Enabled" | "NotEnabled";
  ShopifyState: "All" | "Available" | "Missing";
};

type InventoryResponse = {
  ok?: boolean;
  error?: string;
  shop?: string;
  warning?: string;
  options?: { categories?: string[] };
  summary?: {
    totalProducts?: number;
    totalItems?: number;
    totalInCart?: number;
    totalOnShopify?: number;
  };
  lightspeedCatalog?: {
    totalLoaded?: number;
    totalInLs?: number;
    truncated?: boolean;
    nextCatalogCursor?: string | null;
  };
  nextCatalogCursor?: string | null;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  rows?: MatrixParentRow[];
};

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 300, 500] as const;
const CATALOG_SELECT_PAGE_SIZE = 2000;
const CATALOG_SELECT_PARALLEL = 8;
const STAGE_ADD_CHUNK_SIZE = 300;
const STAGE_REMOVE_CHUNK_SIZE = 500;
const STAGE_PARALLEL_CHUNKS = 3;
type TaskTone = "idle" | "running" | "success" | "error";
type LoadTaskConfig = {
  startLabel?: string;
  startProgress?: number;
  successLabel?: string;
  successProgress?: number;
  skipSuccess?: boolean;
  /** When true, does not touch busy state – caller controls UI blocking */
  background?: boolean;
  /** Load more catalog chunk (merges with existing) */
  catalogCursor?: string | null;
};

type ParentSortField =
  | "title"
  | "category"
  | "brand"
  | "sku"
  | "stock"
  | "price"
  | "variations"
  | "availableAt"
  | "details";
type SortDirection = "asc" | "desc";
type ParentSortState = {
  field: ParentSortField;
  direction: SortDirection;
};

const DEFAULT_FILTERS: InventoryFilters = {
  SKU: "",
  GroupSKU: "",
  Name: "",
  Brand: "",
  PriceFrom: "",
  PriceTo: "",
  StockFrom: "",
  StockTo: "",
  CategoryName: "",
  ProductCreatedFrom: "",
  ProductCreatedTo: "",
  Keyword: "",
  CartState: "All",
  ShopifyState: "All",
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeUiErrorMessage(value: unknown, fallback = "Request failed.") {
  const text = normalizeText(value);
  if (!text) return fallback;
  if (/<!doctype html|<html\b|<head\b|<body\b|<title\b/i.test(text)) {
    const title = normalizeText(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
    if (title) return `Lightspeed service error: ${title}`;
    return "Lightspeed service returned an HTML error page.";
  }
  return text.replace(/\s+/g, " ");
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

function isVisibleStockLocation(location: string) {
  const normalized = normalizeText(location).toLowerCase();
  if (!normalized) return false;
  if (normalized === "0") return false;
  if (/^shop\s*#?\s*0$/.test(normalized)) return false;
  if (/^shopid\s*=\s*\d+$/i.test(normalized)) return false;
  return true;
}

function totalVisibleStock(rows: Array<{ location: string; qty: number | null }>) {
  let sum = 0;
  let hasQty = false;
  for (const row of rows) {
    if (row.qty === null || row.qty === undefined || Number.isNaN(row.qty)) continue;
    sum += row.qty;
    hasQty = true;
  }
  return hasQty ? Number(sum.toFixed(2)) : null;
}

function variantKey(parentId: string, variantId: string) {
  return `${parentId}::${variantId}`;
}

function buildInventoryParams(
  nextPage: number,
  nextPageSize: number,
  nextFilters: InventoryFilters,
  shopValue: string,
  forceRefresh?: boolean,
  catalogCursor?: string | null,
  selectAll?: boolean
) {
  const params = new URLSearchParams();
  params.set("page", String(nextPage));
  params.set("pageSize", String(nextPageSize));
  for (const [key, value] of Object.entries(nextFilters)) {
    const text = normalizeText(value);
    if (text) params.set(key, text);
  }
  if (shopValue) params.set("shop", shopValue);
  if (forceRefresh) params.set("refresh", "1");
  if (catalogCursor) params.set("catalogCursor", catalogCursor);
  if (selectAll) params.set("selectAll", "1");
  return params;
}

export default function ShopifyMappingInventory() {
  const abortRef = useRef<AbortController | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<InventoryFilters>(DEFAULT_FILTERS);
  const [rows, setRows] = useState<MatrixParentRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState(1);
  const [shop, setShop] = useState("");
  const [summary, setSummary] = useState({
    totalProducts: 0,
    totalItems: 0,
    totalInCart: 0,
    totalOnShopify: 0,
  });
  const [lightspeedCatalog, setLightspeedCatalog] = useState<{
    totalLoaded: number;
    totalInLs: number;
    truncated: boolean;
    nextCatalogCursor: string | null;
  }>({ totalLoaded: 0, totalInLs: 0, truncated: false, nextCatalogCursor: null });
  const [selectedParents, setSelectedParents] = useState<Record<string, boolean>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [task, setTask] = useState<{
    label: string;
    progress: number;
    tone: TaskTone;
  }>({ label: "Ready", progress: 0, tone: "idle" });
  const [sortState, setSortState] = useState<ParentSortState | null>(null);
  const allCatalogRowsRef = useRef<MatrixParentRow[] | null>(null);
  const [allCatalogSelected, setAllCatalogSelected] = useState(false);
  const [allCatalogSelectedCount, setAllCatalogSelectedCount] = useState(0);
  const [goToPageInput, setGoToPageInput] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  function goToPageNumber() {
    const num = Number.parseInt(goToPageInput.trim(), 10);
    if (!Number.isFinite(num) || num < 1 || num > totalPages) return;
    setPage(num);
    setGoToPageInput("");
    void loadInventory(num, pageSize, appliedFilters, {
      startLabel: "Loading page...",
      startProgress: 24,
      successLabel: "Page loaded",
    });
  }

  function clearAllCatalogSelection() {
    allCatalogRowsRef.current = null;
    setAllCatalogSelected(false);
    setAllCatalogSelectedCount(0);
  }

  async function loadInventory(
    nextPage = page,
    nextPageSize = pageSize,
    nextFilters = appliedFilters,
    taskConfig?: LoadTaskConfig,
    forceRefresh?: boolean
  ) {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const controller = abortRef.current;
    const params = buildInventoryParams(
      nextPage,
      nextPageSize,
      nextFilters,
      shop,
      forceRefresh,
      taskConfig?.catalogCursor
    );

    const startProgressRaw = taskConfig?.startProgress;
    const startProgress =
      typeof startProgressRaw === "number" && Number.isFinite(startProgressRaw)
        ? Math.max(0, Math.min(100, Math.round(startProgressRaw)))
        : 20;
    const successProgressRaw = taskConfig?.successProgress;
    const successProgress =
      typeof successProgressRaw === "number" && Number.isFinite(successProgressRaw)
        ? Math.max(0, Math.min(100, Math.round(successProgressRaw)))
        : 100;
    const startLabel = normalizeText(taskConfig?.startLabel) || "Loading Lightspeed inventory...";
    const successLabel = normalizeText(taskConfig?.successLabel) || "Inventory loaded";
    const isBackground = Boolean(taskConfig?.background);

    if (!isBackground) {
      setBusy(true);
      setError("");
      setWarning("");
      setTask({ label: startLabel, progress: startProgress, tone: "running" });
    }
    try {
      const resp = await fetch(`/api/shopify/inventory-matrix?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const json = (await resp.json().catch(() => ({}))) as InventoryResponse;
      if (!resp.ok || json.ok === false) {
        throw new Error(
          sanitizeUiErrorMessage(json.error, `Inventory request failed (${resp.status})`)
        );
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
        totalInCart: Number(json.summary?.totalInCart || 0),
        totalOnShopify: Number(json.summary?.totalOnShopify || 0),
      });
      const lc = json.lightspeedCatalog;
      const nextCursor = json.nextCatalogCursor ?? lc?.nextCatalogCursor ?? null;
      setLightspeedCatalog({
        totalLoaded: Number(lc?.totalLoaded ?? 0),
        totalInLs: Number(lc?.totalInLs ?? 0),
        truncated: Boolean(lc?.truncated),
        nextCatalogCursor: nextCursor,
      });
      setSelectedParents({});
      setSelectedVariants({});
      setExpandedRows({});
      clearAllCatalogSelection();
      if (!taskConfig?.skipSuccess) {
        setTask({ label: successLabel, progress: successProgress, tone: "success" });
      }
      return { ok: true as const, nextCatalogCursor: nextCursor };
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === "AbortError") return false;
      const message = sanitizeUiErrorMessage(
        (e as { message?: string } | null)?.message,
        "Unable to load inventory."
      );
      if (!isBackground) setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
      return false;
    } finally {
      if (!isBackground) setBusy(false);
    }
  }

  const FILTER_DEBOUNCE_MS = 500;
  const filtersSerial = JSON.stringify(filters);
  const appliedFiltersSerial = JSON.stringify(appliedFilters);

  useEffect(() => {
    void loadInventory(1, pageSize, DEFAULT_FILTERS, {
      startLabel: "Loading inventory matrix...",
      startProgress: 18,
      successLabel: "Inventory ready",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    if (filtersSerial === appliedFiltersSerial) return;
    const t = setTimeout(() => {
      setAppliedFilters(filters);
      void loadInventory(1, pageSize, filters, {
        startLabel: "Applying filters...",
        startProgress: 24,
        successLabel: "Filters applied",
      });
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filtersSerial, appliedFiltersSerial, pageSize]);

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
  const selectedProductsCount = allCatalogSelected
    ? allCatalogSelectedCount
    : selectedParentIds.length;


  const sortedRows = useMemo(() => {
    if (!sortState) return rows;

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const compareNullableNumber = (a: number | null | undefined, b: number | null | undefined) => {
      const aMissing = a === null || a === undefined || Number.isNaN(a);
      const bMissing = b === null || b === undefined || Number.isNaN(b);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return sortState.direction === "asc" ? a - b : b - a;
    };
    const compareNullableText = (a: string | null | undefined, b: string | null | undefined) => {
      const left = normalizeText(a);
      const right = normalizeText(b);
      if (!left && !right) return 0;
      if (!left) return 1;
      if (!right) return -1;
      return sortState.direction === "asc"
        ? collator.compare(left, right)
        : collator.compare(right, left);
    };
    const hasDetailImage = (parent: MatrixParentRow) =>
      parent.variants.some((variant) => Boolean(normalizeText(variant.image)));

    const next = [...rows];
    next.sort((a, b) => {
      let cmp = 0;
      if (sortState.field === "title") cmp = compareNullableText(a.title, b.title);
      if (sortState.field === "category") cmp = compareNullableText(a.category, b.category);
      if (sortState.field === "brand") cmp = compareNullableText(a.brand, b.brand);
      if (sortState.field === "sku") cmp = compareNullableText(a.sku, b.sku);
      if (sortState.field === "stock") cmp = compareNullableNumber(a.stock, b.stock);
      if (sortState.field === "price") cmp = compareNullableNumber(a.price, b.price);
      if (sortState.field === "variations")
        cmp = compareNullableNumber(a.variations ?? null, b.variations ?? null);
      if (sortState.field === "availableAt") {
        const left = a.availableAt.shopify ? 1 : 0;
        const right = b.availableAt.shopify ? 1 : 0;
        cmp = sortState.direction === "asc" ? left - right : right - left;
      }
      if (sortState.field === "details") {
        const left = hasDetailImage(a) ? 1 : 0;
        const right = hasDetailImage(b) ? 1 : 0;
        cmp = sortState.direction === "asc" ? left - right : right - left;
      }
      if (cmp !== 0) return cmp;
      return collator.compare(a.id, b.id);
    });
    return next;
  }, [rows, sortState]);

  const allVisibleSortedSelected =
    sortedRows.length > 0 && sortedRows.every((row) => Boolean(selectedParents[row.id]));

  function toggleSort(field: ParentSortField) {
    setSortState((prev) => {
      if (!prev || prev.field !== field) return { field, direction: "asc" };
      return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  }

  function getAriaSort(field: ParentSortField): "none" | "ascending" | "descending" {
    if (!sortState || sortState.field !== field) return "none";
    return sortState.direction === "asc" ? "ascending" : "descending";
  }

  function getSortMark(field: ParentSortField) {
    if (!sortState || sortState.field !== field) return "\u2195";
    return sortState.direction === "asc" ? "\u2191" : "\u2193";
  }

  function requireShopContext() {
    const shopValue = normalizeText(shop);
    if (shopValue) return shopValue;
    setError("Shop context is unavailable. Reload the inventory grid and try again.");
    return null;
  }

  function updateFilter<K extends keyof InventoryFilters>(key: K, value: InventoryFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function fetchPage(
    pageNum: number,
    pageSize: number,
    filtersSnapshot: InventoryFilters,
    shopContext: string,
    opts?: { selectAll?: boolean }
  ): Promise<InventoryResponse> {
    const params = buildInventoryParams(
      pageNum,
      pageSize,
      filtersSnapshot,
      shopContext,
      undefined,
      undefined,
      opts?.selectAll
    );
    const resp = await fetch(`/api/shopify/inventory-matrix?${params.toString()}`, {
      cache: "no-store",
    });
    const json = (await resp.json().catch(() => ({}))) as InventoryResponse;
    if (!resp.ok || json.ok === false) {
      throw new Error(
        sanitizeUiErrorMessage(json.error, `Inventory request failed (${resp.status})`)
      );
    }
    return json;
  }

  async function fetchAllFilteredCatalogRows(
    filtersSnapshot: InventoryFilters,
    progressLabel: string
  ) {
    const shopContext = requireShopContext();
    if (!shopContext) return [];

    setTask({ label: `${progressLabel}...`, progress: 40, tone: "running" });

    const json = await fetchPage(
      1,
      10000,
      filtersSnapshot,
      shopContext,
      { selectAll: true }
    );

    const pageRows = Array.isArray(json.rows) ? json.rows : [];
    const byId = new Map<string, MatrixParentRow>();
    for (const row of pageRows) {
      if (!normalizeText(row.id)) continue;
      byId.set(row.id, row);
    }

    return Array.from(byId.values());
  }

  async function selectAllCatalogProducts() {
    const shopContext = requireShopContext();
    if (!shopContext) return;

    const filtersSnapshot = { ...appliedFilters };
    setBusy(true);
    setError("");
    setStatus("");
    setTask({
      label: "Selecting all filtered catalog products...",
      progress: 12,
      tone: "running",
    });

    try {
      const allRows = await fetchAllFilteredCatalogRows(
        filtersSnapshot,
        "Selecting filtered products"
      );

      if (allRows.length < 1) {
        setSelectedParents({});
        setSelectedVariants({});
        clearAllCatalogSelection();
        setStatus("No catalog products found for current filters.");
        setTask({ label: "No catalog products to select", progress: 100, tone: "success" });
        return;
      }

      const nextParents: Record<string, boolean> = {};
      const nextVariants: Record<string, boolean> = {};
      for (const row of allRows) {
        nextParents[row.id] = true;
        for (const v of row.variants ?? []) {
          nextVariants[variantKey(row.id, v.id)] = true;
        }
      }
      setSelectedParents(nextParents);
      setSelectedVariants(nextVariants);
      allCatalogRowsRef.current = allRows;
      setAllCatalogSelected(true);
      setAllCatalogSelectedCount(allRows.length);
      const totalItems = allRows.reduce((n, r) => n + (r.variants?.length ?? r.variations ?? 0), 0);
      setStatus(`Selected all ${allRows.length} filtered catalog products (${totalItems} variant${totalItems !== 1 ? "s" : ""}).`);
      setTask({
        label: `Selected ${allRows.length} filtered products`,
        progress: 100,
        tone: "success",
      });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage(
        (e as { message?: string } | null)?.message,
        "Unable to select all catalog products."
      );
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function clearSelectedCatalogProducts() {
    setSelectedParents({});
    setSelectedVariants({});
    clearAllCatalogSelection();
    setStatus("Catalog selection cleared.");
    setTask({ label: "Catalog selection cleared", progress: 100, tone: "success" });
  }

  async function queueSelected() {
    const shopContext = requireShopContext();
    if (!shopContext) return;

    const selected: MatrixParentRow[] =
      allCatalogSelected && allCatalogRowsRef.current?.length
        ? [...allCatalogRowsRef.current]
        : [];

    if (selected.length < 1) {
      for (const parent of rows) {
        if (selectedParents[parent.id]) {
          selected.push(parent);
          continue;
        }
        const selectedVariantRows = parent.variants.filter((variant) =>
          Boolean(selectedVariants[variantKey(parent.id, variant.id)])
        );
        if (selectedVariantRows.length < 1) continue;
        const stock = selectedVariantRows.reduce(
          (sum, variant) => sum + (typeof variant.stock === "number" ? variant.stock : 0),
          0
        );
        const hasStock = selectedVariantRows.some((variant) => typeof variant.stock === "number");
        selected.push({
          ...parent,
          variants: selectedVariantRows,
          variations: selectedVariantRows.length,
          stock: hasStock ? Number(stock.toFixed(2)) : null,
        });
      }
    }

    if (selected.length < 1) {
      setError("Select at least one parent/variant row first.");
      return;
    }

    const chunks: MatrixParentRow[][] = [];
    for (let index = 0; index < selected.length; index += STAGE_ADD_CHUNK_SIZE) {
      chunks.push(selected.slice(index, index + STAGE_ADD_CHUNK_SIZE));
    }

    setBusy(true);
    setStatus("");
    setTask({ label: "Queueing selected rows to Cart Inventory...", progress: 22, tone: "running" });
    setError("");
    try {
      let upsertedTotal = 0;
      let lastUndoId = "";
      for (let i = 0; i < chunks.length; i += STAGE_PARALLEL_CHUNKS) {
        const batch = chunks.slice(i, i + STAGE_PARALLEL_CHUNKS);
        const progress = 22 + Math.round(((i + batch.length) / chunks.length) * 58);
        setTask({
          label: `Queueing chunks ${i + 1}-${i + batch.length}/${chunks.length}...`,
          progress: Math.min(94, progress),
          tone: "running",
        });
        const results = await Promise.all(
          batch.map(async (chunk) => {
            const resp = await fetch("/api/shopify/cart-inventory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "stage-add", shop: shopContext, rows: chunk }),
            });
            const json = (await resp.json().catch(() => ({}))) as {
              error?: string;
              upserted?: number;
              undoSession?: { id?: string };
            };
            if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, "Unable to queue items."));
            return { json, chunk };
          })
        );
        for (const { json, chunk } of results) {
          upsertedTotal += Number(json.upserted ?? chunk.length ?? 0);
          if (normalizeText(json.undoSession?.id)) {
            lastUndoId = normalizeText(json.undoSession?.id);
          }
        }
      }
      setStatus(`Queued ${Number(upsertedTotal || selected.length)} item(s).`);
      setTask({ label: "Queue completed", progress: 100, tone: "success" });
      void loadInventory(page, pageSize, appliedFilters, {
        startLabel: "Refreshing inventory...",
        skipSuccess: true,
        background: true,
      });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage(
        (e as { message?: string } | null)?.message,
        "Unable to queue items."
      );
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    const shopContext = requireShopContext();
    if (!shopContext) return;

    const parentIds =
      allCatalogSelected && allCatalogRowsRef.current?.length
        ? allCatalogRowsRef.current.map((row) => row.id)
        : selectedParentIds;

    if (parentIds.length < 1) {
      setError("Select at least one parent/variant row first.");
      return;
    }

    const chunks: string[][] = [];
    for (let index = 0; index < parentIds.length; index += STAGE_REMOVE_CHUNK_SIZE) {
      chunks.push(parentIds.slice(index, index + STAGE_REMOVE_CHUNK_SIZE));
    }

    setBusy(true);
    setStatus("");
    setTask({ label: "Removing selected rows from Cart staging...", progress: 24, tone: "running" });
    setError("");
    try {
      let removedTotal = 0;
      let lastUndoId = "";
      for (let i = 0; i < chunks.length; i += STAGE_PARALLEL_CHUNKS) {
        const batch = chunks.slice(i, i + STAGE_PARALLEL_CHUNKS);
        const progress = 24 + Math.round(((i + batch.length) / chunks.length) * 58);
        setTask({
          label: `Removing chunks ${i + 1}-${i + batch.length}/${chunks.length}...`,
          progress: Math.min(94, progress),
          tone: "running",
        });
        const results = await Promise.all(
          batch.map(async (chunk) => {
            const resp = await fetch("/api/shopify/cart-inventory", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "stage-remove",
                shop: shopContext,
                parentIds: chunk,
              }),
            });
            const json = (await resp.json().catch(() => ({}))) as {
              error?: string;
              removed?: number;
              undoSession?: { id?: string };
            };
            if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, "Unable to remove items."));
            return { json, chunk };
          })
        );
        for (const { json, chunk } of results) {
          removedTotal += Number(json.removed ?? chunk.length ?? 0);
          if (normalizeText(json.undoSession?.id)) {
            lastUndoId = normalizeText(json.undoSession?.id);
          }
        }
      }
      setStatus(`Removed ${Number(removedTotal || parentIds.length)} item(s).`);
      setTask({ label: "Remove completed", progress: 100, tone: "success" });
      void loadInventory(page, pageSize, appliedFilters, {
        startLabel: "Refreshing inventory...",
        skipSuccess: true,
        background: true,
      });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage(
        (e as { message?: string } | null)?.message,
        "Unable to remove items."
      );
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function undoLastSession() {
    const shopContext = requireShopContext();
    if (!shopContext) return;

    setBusy(true);
    setTask({ label: "Undoing last session...", progress: 24, tone: "running" });
    setError("");
    try {
      const resp = await fetch("/api/shopify/cart-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo-session", shop: shopContext }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, "Unable to undo session."));
      setStatus("Undo completed.");
      const refreshed = await loadInventory(page, pageSize, appliedFilters, {
        startLabel: "Refreshing inventory after undo...",
        startProgress: 74,
        skipSuccess: true,
      });
      if (refreshed) {
        setTask({ label: "Undo completed", progress: 100, tone: "success" });
      }
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage(
        (e as { message?: string } | null)?.message,
        "Unable to undo session."
      );
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
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

      <p className="breadcrumb">
        <Link href="/studio/shopify-mapping-inventory/workset">Workset</Link>
        <span className="sep"> / </span>
        <span>Inventory</span>
      </p>

      <SyncTogglesBar shop={shop} disabled={busy} />

      <section className={`card status-bar ${task.tone === "running" ? "working" : task.tone}`} aria-live="polite" aria-atomic="true">
        <div className="status-bar-head">
          <div className="status-bar-title">progress bar</div>
          <span className={`status-chip ${task.tone === "running" ? "working" : task.tone}`}>
            {task.tone === "error" ? "Error" : task.tone === "running" ? "Working" : task.tone === "success" ? "Done" : "Idle"}
          </span>
        </div>
        <div className="status-bar-message">
          {task.tone === "error" ? `Error: ${task.label}` : task.label}
        </div>
        {status ? <div className="status-bar-meta">{status}</div> : null}
      </section>

      <section className="glass-panel card filter-card">
        <div className="filters filters-skuplugs">
          <div className="filter-row">
            <input value={filters.SKU} onChange={(e) => updateFilter("SKU", e.target.value)} placeholder="SKU or UPC (partial)" aria-label="Filter by SKU" />
            <input value={filters.GroupSKU} onChange={(e) => updateFilter("GroupSKU", e.target.value)} placeholder="Group SKU" aria-label="Filter by Group SKU" />
            <input value={filters.Name} onChange={(e) => updateFilter("Name", e.target.value)} placeholder="Product Name" aria-label="Filter by product name" />
            <input value={filters.Brand} onChange={(e) => updateFilter("Brand", e.target.value)} placeholder="Brand" aria-label="Filter by brand" />
          </div>
          <div className="filter-row">
            <input value={filters.PriceFrom} onChange={(e) => updateFilter("PriceFrom", e.target.value)} placeholder="Price From" type="number" step="any" min="0" aria-label="Minimum price" />
            <input value={filters.PriceTo} onChange={(e) => updateFilter("PriceTo", e.target.value)} placeholder="Price To" type="number" step="any" min="0" aria-label="Maximum price" />
            <input value={filters.StockFrom} onChange={(e) => updateFilter("StockFrom", e.target.value)} placeholder="Stock From" type="number" step="any" min="0" aria-label="Minimum stock" />
            <input value={filters.StockTo} onChange={(e) => updateFilter("StockTo", e.target.value)} placeholder="Stock To" type="number" step="any" min="0" aria-label="Maximum stock" />
          </div>
          <div className="filter-row">
            <select value={filters.CategoryName} onChange={(e) => updateFilter("CategoryName", e.target.value)} aria-label="Filter by category">
              <option value="">Select Category</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={filters.CartState} onChange={(e) => updateFilter("CartState", normalizeText(e.target.value) as InventoryFilters["CartState"])} aria-label="Filter by cart status">
              <option value="All">Items enabled for Cart: All</option>
              <option value="Enabled">Enabled in Cart</option>
              <option value="NotEnabled">Not enabled in Cart</option>
            </select>
            <select value={filters.ShopifyState} onChange={(e) => updateFilter("ShopifyState", normalizeText(e.target.value) as InventoryFilters["ShopifyState"])} aria-label="Filter by Shopify status">
              <option value="All">Shopify availability: All</option>
              <option value="Available">On Shopify</option>
              <option value="Missing">Not on Shopify</option>
            </select>
          </div>
          <div className="filter-row filter-row-actions">
            <input type="date" value={filters.ProductCreatedFrom} onChange={(e) => updateFilter("ProductCreatedFrom", e.target.value)} aria-label="Product created from date" />
            <input type="date" value={filters.ProductCreatedTo} onChange={(e) => updateFilter("ProductCreatedTo", e.target.value)} aria-label="Product created to date" />
            <input value={filters.Keyword} onChange={(e) => updateFilter("Keyword", e.target.value)} placeholder="Search Keyword" className="filter-keyword" aria-label="Search keyword" />
            <div className="filter-actions">
              <button className="btn-base search-btn" onClick={() => { setAppliedFilters(filters); void loadInventory(1, pageSize, filters, { startLabel: "Searching...", startProgress: 24, successLabel: "Search completed" }); }} disabled={busy}>Search</button>
              <button className="btn-base btn-outline" onClick={() => { setFilters(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS); void loadInventory(1, pageSize, DEFAULT_FILTERS, { startLabel: "Resetting...", startProgress: 24, successLabel: "Filters reset" }); }} disabled={busy}>Reset</button>
            </div>
          </div>
        </div>
        <div className="row actions-row actions-primary">
          <button className="btn-base btn-outline" onClick={() => void loadInventory(1, pageSize, appliedFilters, { startLabel: "Refreshing from Lightspeed...", startProgress: 24, successLabel: "Inventory refreshed" }, true)} disabled={busy} title="Force fresh fetch from Lightspeed (bypasses cache)">
            Refresh
          </button>
          {lightspeedCatalog.truncated && lightspeedCatalog.nextCatalogCursor ? (
            <>
              <button
                className="btn-base btn-outline"
                onClick={() =>
                  void loadInventory(1, pageSize, appliedFilters, {
                    startLabel: "Loading more catalog...",
                    startProgress: 40,
                    successLabel: "Catalog updated",
                    catalogCursor: lightspeedCatalog.nextCatalogCursor,
                  })
                }
                disabled={busy}
                title="Load next ~3.5k items"
              >
                Load more catalog
              </button>
              <button
                className="btn-base btn-outline"
                onClick={async () => {
                  let cursor: string | null = lightspeedCatalog.nextCatalogCursor;
                  while (cursor) {
                    const result = await loadInventory(1, pageSize, appliedFilters, {
                      startLabel: "Loading full catalog...",
                      startProgress: 50,
                      successLabel: "Catalog updated",
                      catalogCursor: cursor,
                      skipSuccess: true,
                    });
                    if (result === false) break;
                    cursor = (typeof result === "object" && result?.ok ? result.nextCatalogCursor : null) ?? null;
                  }
                  setTask({ label: "Full catalog loaded", progress: 100, tone: "success" });
                }}
                disabled={busy}
                title="Load all remaining items (may take a minute)"
              >
                Load all
              </button>
            </>
          ) : null}
          {allCatalogSelected ? (
            <button className="btn-base btn-outline" onClick={clearSelectedCatalogProducts} disabled={busy}>
              Clear Catalog Selection ({allCatalogSelectedCount})
            </button>
          ) : (
            <button
              className="btn-base btn-outline"
              onClick={selectAllCatalogProducts}
              disabled={busy || summary.totalProducts < 1}
              title="Select all products matching current filters"
            >
              Select All Catalog Products
            </button>
          )}
          <button className="btn-base btn-outline" onClick={queueSelected} disabled={busy}>Queue Selected</button>
          <button className="btn-base btn-outline" onClick={removeSelected} disabled={busy}>Remove from Queue</button>
          <button className="btn-base btn-outline" onClick={undoLastSession} disabled={busy}>Undo Last Session</button>
        </div>
      </section>

      {status ? <p className="status">{status}</p> : null}
      {warning ? <p className="warn">{warning}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <section className="table-toolbar">
        <span className="toolbar-left">
          <span className="toolbar-icon" aria-hidden>📊</span>
          <span className="total-products">Total Products: {summary.totalProducts.toLocaleString()}</span>
          <span className="toolbar-sep" aria-hidden>|</span>
          <span className="mini-inline">
            Items {summary.totalItems} | In Cart {summary.totalInCart} | On Shopify {summary.totalOnShopify}
            {lightspeedCatalog.totalLoaded > 0 ? (
              <span className="ls-catalog-info">
                {" · "}
                LS: {lightspeedCatalog.totalLoaded.toLocaleString()} items
                {lightspeedCatalog.truncated ? (
                  <span className="truncated-badge" title="Click 'Load more catalog' to fetch remaining items (free plan, ~3.5k per load).">
                    (truncated)
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </span>
        <span className="toolbar-right">
          <button type="button" className="toolbar-icon-btn" title="Export" aria-label="Export" onClick={() => {}} disabled={busy}>
            📁
          </button>
          <button type="button" className="toolbar-icon-btn" title="Download" aria-label="Download" onClick={() => {}} disabled={busy}>
            ⬇
          </button>
          <select className="page-size-select" value={String(pageSize)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); setPageSize(n); void loadInventory(1, n, appliedFilters, { startLabel: "Updating page size...", startProgress: 24, successLabel: "Page size updated" }); }} disabled={busy}>
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={String(size)}>{size}</option>)}
          </select>
        </span>
      </section>

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
                  checked={allVisibleSortedSelected}
                  onChange={(e) => {
                    clearAllCatalogSelection();
                    if (e.target.checked) {
                      const nextParents: Record<string, boolean> = {};
                      const nextVariants: Record<string, boolean> = {};
                      for (const row of sortedRows) {
                        nextParents[row.id] = true;
                        for (const v of row.variants ?? []) {
                          nextVariants[variantKey(row.id, v.id)] = true;
                        }
                      }
                      setSelectedParents(nextParents);
                      setSelectedVariants(nextVariants);
                    } else {
                      const ids = new Set(sortedRows.map((r) => r.id));
                      setSelectedParents((prev) => {
                        const next = { ...prev };
                        for (const id of ids) delete next[id];
                        return next;
                      });
                      setSelectedVariants((prev) => {
                        const next = { ...prev };
                        for (const row of sortedRows) {
                          for (const v of row.variants ?? []) {
                            delete next[variantKey(row.id, v.id)];
                          }
                        }
                        return next;
                      });
                    }
                  }}
                  aria-label="Select all visible products and variants"
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
                    <span>Available at</span>
                    <span className="sort-mark">{getSortMark("details")}</span>
                  </button>
                </span>
              </th>
              <th className="picture-header-cell">Picture</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length < 1 ? (
              <tr><td colSpan={10}>{busy ? "Loading..." : "No rows"}</td></tr>
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
                        onChange={(e) => {
                          clearAllCatalogSelection();
                          setSelectedParents((prev) => ({ ...prev, [parent.id]: e.target.checked }));
                        }}
                      />
                    </td>
                    <td>
                      <span className="title-cell">
                        <span className="item-icon" aria-hidden>
                          🔥
                        </span>
                        <span>{parent.title}</span>
                      </span>
                    </td>
                    <td>{parent.category || "-"}</td><td>{parent.brand || "-"}</td><td>{parent.sku}</td>
                    <td>
                      <span className={parent.stockGap != null && parent.stockGap !== 0 ? "stock-with-gap" : ""} title={parent.stockGap != null && parent.stockGap !== 0 ? `LS: ${formatQty(parent.stock)} | Shopify: ${formatQty(parent.shopifyStock ?? null)} | Gap: ${parent.stockGap! > 0 ? "+" : ""}${parent.stockGap}` : ""}>
                        {formatQty(parent.stock)}
                        {parent.stockGap != null && parent.stockGap !== 0 ? (
                          <span className="stock-gap-badge" title={`LS − Shopify = ${parent.stockGap > 0 ? "+" : ""}${parent.stockGap}`}>
                            {" "}{parent.stockGap > 0 ? "▲" : "▼"} {parent.stockGap > 0 ? "+" : ""}{parent.stockGap}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>{formatPrice(parent.price)}</td><td>{parent.variations}</td>
                    <td className="details-cell">
                      <span className={`details-parent-wrap ${(parent.stock ?? 0) <= 0 ? "out-of-stock" : ""}`}>
                        <span className="details-availability-inline" title={parent.availableAt.shopify ? "On Shopify" : "Not on Shopify"}>
                            <span className="product-type-icon" aria-hidden>
                              👕
                            </span>
                            {parent.availableAt.shopify ? (
                              <img
                                className="parent-shopify-logo"
                                src="/brand/shopify-bag.svg"
                                alt="On Shopify"
                                width={24}
                                height={24}
                              />
                            ) : (
                              <span className="muted">–</span>
                            )}
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
                          <img
                            className="parent-detail-thumb"
                            src={parentImage}
                            alt=""
                            width={40}
                            height={58}
                            loading="lazy"
                          />
                        </button>
                      ) : (
                        <span className="muted">–</span>
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
                                const visibleStockRows = variant.stockByLocation.filter((row) =>
                                  isVisibleStockLocation(row.location)
                                );
                                const companyStock = totalVisibleStock(visibleStockRows);
                                return (
                                  <tr key={key} className="variant-row">
                                    <td />
                                    <td>
                                      <span className="variant-sku-cell">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(selectedVariants[key])}
                                          onChange={(e) => {
                                            clearAllCatalogSelection();
                                            setSelectedVariants((prev) => ({ ...prev, [key]: e.target.checked }));
                                          }}
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
                                        {visibleStockRows.length ? (
                                          <ul className="stock-list">
                                            {visibleStockRows.map((row) => (
                                              <li key={`${key}-${row.location}`}>
                                                <span>{row.location}</span>
                                                <strong>{formatQty(row.qty)}</strong>
                                              </li>
                                            ))}
                                            {variant.shopifyStock != null && variant.availableInShopify ? (
                                              <li className={variant.stock !== variant.shopifyStock ? "shopify-gap" : ""}>
                                                <span>Shopify</span>
                                                <strong>{formatQty(variant.shopifyStock)}</strong>
                                              </li>
                                            ) : null}
                                            <li className="total">
                                              <span>Company Stock</span>
                                              <strong>{formatQty(companyStock)}</strong>
                                            </li>
                                          </ul>
                                        ) : (
                                          <div className="stock-fallback">
                                            Company Stock: {formatQty(companyStock)}
                                            {variant.shopifyStock != null && variant.availableInShopify && variant.stock !== variant.shopifyStock ? (
                                              <span className="variant-gap-inline"> · Shopify: {formatQty(variant.shopifyStock)} (Gap: {(variant.stock ?? 0) - variant.shopifyStock > 0 ? "+" : ""}{(variant.stock ?? 0) - variant.shopifyStock})</span>
                                            ) : null}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td>{formatPrice(variant.price)}</td>
                                    <td>{variant.color || "-"}</td>
                                    <td>{variant.size || "-"}</td>
                                    <td className="details-cell variant-details-cell">
                                      <span className="details-availability-inline" title={variant.stagedInCart ? "In cart" : "Not in cart"}>
                                        {variant.stagedInCart ? (
                                          <img
                                            className="variant-shopify-logo"
                                            src="/brand/shopify-bag.svg"
                                            alt="In cart"
                                            width={24}
                                            height={24}
                                          />
                                        ) : (
                                          <span className="muted">–</span>
                                        )}
                                      </span>
                                    </td>
                                    <td className="picture-cell">
                                      {normalizeText(variant.image) ? (
                                        <button type="button" className="thumb-btn" onClick={() => setPreviewImage(normalizeText(variant.image))} aria-label="Preview image">
                                          <img
                                            className="detail-thumb"
                                            src={normalizeText(variant.image)}
                                            alt=""
                                            width={72}
                                            height={104}
                                            loading="lazy"
                                          />
                                        </button>
                                      ) : (
                                        <span className="muted">–</span>
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

      <section className="pager-skuplugs">
        <p className="pager-summary">Showing Page {page} of {totalPages}</p>
        <div className="pager-controls">
          <button className="btn-base btn-outline pager-btn" onClick={() => { const n = Math.max(1, page - 1); setPage(n); void loadInventory(n, pageSize, appliedFilters, { startLabel: "Loading previous page...", startProgress: 24, successLabel: "Page loaded" }); }} disabled={busy || page <= 1} aria-label="Previous page">‹</button>
          <div className="pager-numbers">
            {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
              const p = totalPages <= 10 ? i + 1 : (page <= 5 ? i + 1 : Math.max(1, page - 5 + i));
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  type="button"
                  className={`btn-base btn-outline pager-num ${p === page ? "active" : ""}`}
                  onClick={() => void loadInventory(p, pageSize, appliedFilters, { startLabel: "Loading page...", startProgress: 24, successLabel: "Page loaded" })}
                  disabled={busy}
                  aria-label={`Page ${p}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button className="btn-base btn-outline pager-btn" onClick={() => { const n = Math.min(totalPages, page + 1); setPage(n); void loadInventory(n, pageSize, appliedFilters, { startLabel: "Loading next page...", startProgress: 24, successLabel: "Page loaded" }); }} disabled={busy || page >= totalPages} aria-label="Next page">›</button>
        </div>
        <span className="pager-goto">
          <label htmlFor="pager-goto-input" className="pager-goto-label">Go to</label>
          <input
            id="pager-goto-input"
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

      <style jsx>{`
        .page { --detail-thumb-w: 56px; --detail-thumb-h: 80px; --parent-thumb-w: 40px; --parent-thumb-h: 58px; max-width: 1220px; margin: 0 auto; padding: 134px 8px 26px; display: grid; gap: 8px; color: #f8fafc; }
        .quick-nav { display: flex; flex-wrap: wrap; gap: 8px; }
        .quick-chip { text-decoration: none; border-radius: 10px; border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.06); color: rgba(248,250,252,0.9); padding: 8px 12px; font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
        .quick-chip.active { color: #fff; background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.38); }
        .breadcrumb { margin: 0; font-size: 0.9rem; color: rgba(226,232,240,0.9); }
        .breadcrumb a { color: rgba(226,232,240,0.9); text-decoration: none; }
        .breadcrumb a:hover { text-decoration: underline; }
        .breadcrumb .sep { color: rgba(226,232,240,0.6); margin: 0 4px; }
        .table-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 10px 14px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; gap: 8px; }
        .toolbar-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; min-width: 0; }
        .toolbar-sep { color: rgba(226,232,240,0.4); font-weight: 600; margin: 0 2px; }
        .mini-inline { font-size: 0.85rem; font-weight: 600; color: rgba(226,232,240,0.9); }
        .toolbar-icon { font-size: 1.1rem; }
        .total-products { font-weight: 700; color: #fff; font-size: 0.9rem; }
        .toolbar-right { display: flex; align-items: center; gap: 10px; }
        .toolbar-icon-btn { min-width: 36px; min-height: 36px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; font-size: 1rem; cursor: pointer; }
        .toolbar-right .page-size-select { min-width: 70px; }
        .title-cell .item-icon { font-size: 1rem; margin-right: 8px; filter: hue-rotate(-20deg); }
        .details-parent-wrap.out-of-stock { opacity: 0.45; }
        .details-parent-wrap.out-of-stock .parent-shopify-logo { filter: grayscale(1); }
        .product-type-icon { font-size: 0.9rem; margin-right: 6px; }
        .pager-skuplugs { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 16px; }
        .pager-summary { margin: 0; font-size: 0.9rem; color: rgba(226,232,240,0.9); font-weight: 600; }
        .pager-controls { display: flex; align-items: center; gap: 8px; }
        .pager-numbers { display: flex; align-items: center; gap: 4px; }
        .pager-num { min-width: 36px; min-height: 36px; padding: 0 10px; }
        .pager-num.active { background: rgba(59,130,246,0.3); border-color: rgba(59,130,246,0.6); }
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
        .status-chip.success { background: #dcfce7; color: #166534; border-color: #86efac; }
        .status-chip.error { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
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
        .actions-row {
          margin-top: 2px;
        }
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
        .page-size-select {
          min-width: 122px;
        }
        .mini {
          margin: 0;
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.9);
          font-weight: 600;
        }
        .ls-catalog-info {
          color: rgba(226, 232, 240, 0.75);
          font-weight: 500;
        }
        .truncated-badge {
          margin-left: 4px;
          padding: 2px 6px;
          border-radius: 6px;
          background: rgba(245, 158, 11, 0.25);
          color: #fde68a;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .status, .warn, .error {
          margin: 0;
          border-radius: 12px;
          padding: 8px 10px;
          border: 1px solid transparent;
          font-size: 0.92rem;
          font-weight: 600;
        }
        .status {
          border-color: rgba(16, 185, 129, 0.32);
          background: rgba(16, 185, 129, 0.14);
          color: #a7f3d0;
        }
        .warn {
          border-color: rgba(245, 158, 11, 0.36);
          background: rgba(245, 158, 11, 0.14);
          color: #fde68a;
        }
        .error {
          border-color: rgba(248, 113, 113, 0.32);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
        }
        .table-wrap {
          overflow-x: auto;
          border-radius: 12px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .table-wrap::-webkit-scrollbar {
          display: none;
        }
        .table-card {
          padding-top: 8px;
        }
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
        .sort-btn.align-left {
          justify-content: flex-start;
        }
        .sort-btn:hover,
        .sort-btn:focus-visible {
          transform: none !important;
          box-shadow: none !important;
          opacity: 1 !important;
          color: #fff;
          outline: none;
        }
        .sort-btn.active {
          color: #f8fafc;
        }
        .sort-mark {
          font-size: .72rem;
          line-height: 1;
          opacity: .9;
        }
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
        .stock-with-gap { font-weight: 700; }
        .stock-gap-badge {
          display: inline-block;
          margin-left: 4px;
          padding: 1px 6px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
        }
        .stock-with-gap .stock-gap-badge {
          background: rgba(245, 158, 11, 0.25);
          color: #fde68a;
          border: 1px solid rgba(245, 158, 11, 0.4);
        }
        .title-cell { display: inline-flex; align-items: center; gap: 8px; }
        .ls-logo { width: 18px; height: 24px; object-fit: contain; display: inline-block; }
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
          grid-template-columns: 32px 56px;
          align-items: center;
          justify-content: center;
          justify-items: center;
          gap: 0;
          width: 100%;
          max-width: 88px;
          margin: 0 auto;
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
        .eye-symbol {
          width: 18px;
          height: 18px;
          display: block;
        }
        .details-availability-inline {
          width: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .details-parent-spacer { display: none; }
        .parent-detail-thumb { width: var(--parent-thumb-w); height: var(--parent-thumb-h); object-fit: cover; border-radius: 4px; background: rgba(255,255,255,.08); display: block; margin: 0 auto; }
        .availability { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 72px; margin: 0 auto; }
        .availability.center { justify-content: center; width: 100%; }
        .availability.stack { flex-direction: column; gap: 6px; min-height: 128px; }
        .cart-pill { display: inline-flex; align-items: center; min-height: 20px; padding: 0 8px; border-radius: 10px; font-size: .72rem; border: 1px solid rgba(56,189,248,.5); background: rgba(14,116,144,.22); color: #bae6fd; }
        .shopify-logo { width: 30px; height: 30px; object-fit: contain; display: inline-block; }
        .parent-shopify-logo { width: 24px; height: 24px; object-fit: contain; display: block; margin: 0; }
        .expand-row td { padding: 0; border-bottom: 1px solid rgba(255,255,255,.12); }
        .variant-wrap {
          overflow-x: auto;
          padding: 0;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .variant-wrap::-webkit-scrollbar {
          display: none;
        }
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
        .variant-row td.details-cell {
          vertical-align: middle !important;
        }
        .variant-stock-cell { white-space: normal !important; }
        .stock-matrix { width: 100%; min-width: 0; max-width: 100%; }
        .stock-matrix-head { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 10px; padding: 2px 0 6px; border-top: 1px solid rgba(250, 204, 21, .55); border-bottom: 1px solid rgba(255,255,255,.2); font-size: .76rem; font-weight: 700; color: rgba(226,232,240,.9); }
        .stock-fallback { color: rgba(226,232,240,.92); font-weight: 700; }
        .stock-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; min-width: 0; }
        .stock-list li { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; border-bottom: 1px solid rgba(255,255,255,.14); padding: 6px 0; }
        .stock-list li.total { border-bottom: 0; border-top: 1px solid rgba(255,255,255,.2); margin-top: 2px; font-weight: 700; }
        .stock-list li.shopify-gap { background: rgba(245, 158, 11, 0.12); }
        .variant-gap-inline { color: #fde68a; font-size: 0.8rem; margin-left: 6px; }
        .stock-matrix-head span:first-child,
        .stock-list li span { white-space: nowrap; }
        .stock-matrix-head span:last-child,
        .stock-list li strong { justify-self: end; text-align: right; min-width: 22px; }
        .variant-shopify-logo { width: 24px; height: 24px; object-fit: contain; display: block; margin: 0 auto; }
        .variant-details-cell {
          vertical-align: middle !important;
          text-align: center !important;
        }
        .variant-details-cell .details-availability-inline {
          margin: 0 auto;
          transform: translateX(-40px);
        }
        .variant-row td.picture-cell {
          vertical-align: middle !important;
        }
        .variant-row td.picture-cell .thumb-btn,
        .variant-row td.picture-cell > .muted {
          transform: translateX(-40px);
        }
        .detail-cell-center {
          width: var(--detail-thumb-w);
          min-height: var(--detail-thumb-h);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .detail-thumb { width: var(--detail-thumb-w); height: var(--detail-thumb-h); object-fit: cover; border-radius: 4px; background: rgba(255,255,255,.08); display: block; margin: 0 auto; }
        .pager { justify-content: flex-end; align-items: center; gap: 12px; flex-wrap: wrap; }
        .pager :global(.btn-base) {
          min-height: 40px;
          min-width: 64px;
          padding: 0 14px;
        }
        .pager span {
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.2;
        }
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
        .pager-goto-input::placeholder {
          color: rgba(248, 250, 252, 0.5);
        }
        .pager-goto-btn {
          min-width: 48px;
        }
        @media (max-width: 1180px) {
          .status-bar {
            top: 89px;
            left: 8px;
            right: 8px;
          }
          .page { padding-top: 134px; }
          .card {
            padding: 14px;
          }
        }
        @media (max-width: 900px) {
          .page { padding-top: 146px; }
        }
        @media (max-width: 640px) {
          .actions-row :global(.btn-base) {
            flex: 1 1 auto;
          }
          .pager span {
            font-size: 0.95rem;
          }
        }
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
      `}</style>
    </main>
  );
}

