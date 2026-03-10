"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SyncTogglesBar } from "@/components/sync-toggles-bar";
import { setGlobalTask, updateGlobalTaskMeta } from "@/lib/globalTask";

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
  /** "All" | "InShopify" | "NotInShopify" */
  ShopifySource: "All" | "InShopify" | "NotInShopify";
  /** "All" | "AllSkuInShopify" | "MissingSkuInShopify" */
  ShopifySkuCoverage: "All" | "AllSkuInShopify" | "MissingSkuInShopify";
  /** "All" | "Has" | "None" - filter by Shopify product description */
  HasDescription: "All" | "Has" | "None";
  /** "All" | "Has" | "None" - filter by product image */
  HasImage: "All" | "Has" | "None";
  /** Matrix filters: all variants must match (entire product) */
  MatrixStockFrom: string;
  MatrixStockTo: string;
  MatrixPriceFrom: string;
  MatrixPriceTo: string;
  MatrixSKU: string;
  MatrixColor: string;
  MatrixSize: string;
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
  ShopifySource: "All",
  ShopifySkuCoverage: "All",
  HasDescription: "All",
  HasImage: "All",
  MatrixStockFrom: "",
  MatrixStockTo: "",
  MatrixPriceFrom: "",
  MatrixPriceTo: "",
  MatrixSKU: "",
  MatrixColor: "",
  MatrixSize: "",
};

const PAGE_SIZE_OPTIONS = [20, 50, 75, 100, 200, 500] as const;

type TaskTone = "idle" | "running" | "success" | "error";
type SortField = "title" | "category" | "brand" | "upc" | "stock" | "price" | "variations" | "details";
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
  return value.toFixed(3);
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

function getParentUpc(parent: CartInventoryParentRow) {
  const firstVariantUpc = normalizeText(
    parent.variants.find((variant) => normalizeText(variant.upc))?.upc
  );
  return firstVariantUpc || "-";
}

function compareField(a: CartInventoryParentRow, b: CartInventoryParentRow, field: SortField): number {
  switch (field) {
    case "title": return (a.title || "").localeCompare(b.title || "", undefined, { numeric: true, sensitivity: "base" });
    case "category": return (a.category || "").localeCompare(b.category || "", undefined, { numeric: true, sensitivity: "base" });
    case "brand": return (a.brand || "").localeCompare(b.brand || "", undefined, { numeric: true, sensitivity: "base" });
    case "upc": return getParentUpc(a).localeCompare(getParentUpc(b), undefined, { numeric: true, sensitivity: "base" });
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
  const [generalFiltersOpen, setGeneralFiltersOpen] = useState(true);
  const [matrixFiltersOpen, setMatrixFiltersOpen] = useState(false);
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
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, _rawSetStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  function setStatus(s: string) {
    _rawSetStatus(s);
    updateGlobalTaskMeta(taskIdRef.current, s);
  }
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

  type PubItem = { id: string; name: string; app: { title: string } | null };
  type CatItem = { id: string; title: string; status: string; publicationId?: string | null };
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [pushDialogBg, setPushDialogBg] = useState(false);
  const [pushPubs, setPushPubs] = useState<PubItem[]>([]);
  const [pushCats, setPushCats] = useState<CatItem[]>([]);
  const [pushSelectedPubs, setPushSelectedPubs] = useState<string[]>([]);
  const [pushSelectedCats, setPushSelectedCats] = useState<string[]>([]);
  const [pushPubsLoading, setPushPubsLoading] = useState(false);

  const [channelPubs, setChannelPubs] = useState<Record<string, string[]>>({});
  const [channelDropdownOpen, setChannelDropdownOpen] = useState<string | null>(null);
  const [channelDropdownLoading, setChannelDropdownLoading] = useState(false);
  const [channelAllPubs, setChannelAllPubs] = useState<PubItem[]>([]);
  const [channelAllCats, setChannelAllCats] = useState<CatItem[]>([]);
  const [bulkChannelOpen, setBulkChannelOpen] = useState(false);
  const [bulkChannelPubs, setBulkChannelPubs] = useState<string[]>([]);
  const [bulkChannelCats, setBulkChannelCats] = useState<string[]>([]);
  
  const channelsFetchedForPage = useRef<string>("");

  const marketCatalogs = useMemo(
    () => channelAllCats.filter((c) => c.id.includes("MarketCatalog")),
    [channelAllCats]
  );

  function getProductGid(parent: CartInventoryParentRow): string | null {
    for (const v of parent.variants ?? []) {
      const cid = (v.cartId || "").trim();
      if (!cid) continue;
      if (cid.includes("~")) return `gid://shopify/Product/${cid.split("~")[0]}`;
      if (cid.startsWith("gid://shopify/ProductVariant/")) return null;
      if (!cid.startsWith("gid://")) return null;
    }
    return null;
  }

  async function ensureChannelLists(): Promise<{ publications: PubItem[]; catalogs: CatItem[] }> {
    const qs = shop ? `?shop=${encodeURIComponent(shop)}` : "";
    const resp = await fetch(`/api/shopify/publications${qs}`, { cache: "no-store" });
    const json = (await resp.json().catch(() => ({}))) as { publications?: PubItem[]; catalogs?: CatItem[] };
    const pubs = json.publications ?? [];
    const cats = json.catalogs ?? [];
    if (pubs.length) setChannelAllPubs(pubs);
    if (cats.length) setChannelAllCats(cats);
    return { publications: pubs, catalogs: cats };
  }

  async function prefetchChannelPubs(rows: CartInventoryParentRow[]) {
    const gids: string[] = [];
    for (const r of rows) {
      const g = getProductGid(r);
      if (g && !channelPubs[g]) gids.push(g);
    }
    if (gids.length === 0) return;
    const unique = Array.from(new Set(gids)).slice(0, 50);
    try {
      const freshLists = await ensureChannelLists();
      const freshMarketCats = freshLists.catalogs.filter((c) => c.id.includes("MarketCatalog") && c.publicationId);
      const resp = await fetch("/api/shopify/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-product-publications",
          shop,
          productGids: unique,
          catalogPubIds: freshMarketCats.map((c) => c.publicationId!),
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; products?: Record<string, string[]> };
      if (json.ok && json.products) {
        setChannelPubs((prev) => ({ ...prev, ...json.products }));
      }
    } catch { /* best-effort */ }
  }

  async function openChannelDropdown(parent: CartInventoryParentRow) {
    const pgid = getProductGid(parent);
    if (!pgid) return;
    if (channelDropdownOpen === parent.id) {
      setChannelDropdownOpen(null);
      return;
    }
    setChannelDropdownOpen(parent.id);
    setChannelDropdownLoading(true);
    try {
      await ensureChannelLists();
      if (!channelPubs[pgid]) {
        const prodPubResp = await fetch("/api/shopify/publications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get-product-publications",
            shop,
            productGids: [pgid],
            catalogPubIds: marketCatalogs.filter((c) => c.publicationId).map((c) => c.publicationId!),
          }),
        });
        const prodPubJson = (await prodPubResp.json().catch(() => ({}))) as {
          ok?: boolean;
          products?: Record<string, string[]>;
        };
        if (prodPubJson.ok && prodPubJson.products?.[pgid]) {
          setChannelPubs((prev) => ({ ...prev, [pgid]: prodPubJson.products![pgid] }));
        }
      }
    } catch { /* failed to load */ } finally {
      setChannelDropdownLoading(false);
    }
  }

  async function toggleChannel(productGid: string, publicationId: string, checked: boolean) {
    const current = channelPubs[productGid] || [];
    const updated = checked
      ? [...current, publicationId]
      : current.filter((id) => id !== publicationId);
    setChannelPubs((prev) => ({ ...prev, [productGid]: updated }));
    try {
      await fetch("/api/shopify/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-product-publications",
          shop,
          productGid,
          publishTo: checked ? [publicationId] : [],
          unpublishFrom: checked ? [] : [publicationId],
        }),
      });
    } catch {
      setChannelPubs((prev) => ({ ...prev, [productGid]: current }));
    }
  }

  async function toggleAllChannels(productGid: string, checked: boolean) {
    const allIds = channelAllPubs.map((p) => p.id);
    const current = channelPubs[productGid] || [];
    setChannelPubs((prev) => ({ ...prev, [productGid]: checked ? allIds : [] }));
    try {
      await fetch("/api/shopify/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-product-publications",
          shop,
          productGid,
          publishTo: checked ? allIds : [],
          unpublishFrom: checked ? [] : allIds,
        }),
      });
    } catch {
      setChannelPubs((prev) => ({ ...prev, [productGid]: current }));
    }
  }

  async function openBulkChannelDialog() {
    setBulkChannelOpen(true);
    try {
      await ensureChannelLists();
      setBulkChannelPubs(channelAllPubs.map((p) => p.id));
      setBulkChannelCats([]);
    } catch { /* best-effort */ }
  }

  function applyBulkChannels() {
    const count = selectedParentIds.length;
    const allPublishIds = [...bulkChannelPubs, ...bulkChannelCats];
    const allKnownIds = [...channelAllPubs.map((p) => p.id), ...marketCatalogs.filter((c) => c.publicationId).map((c) => c.publicationId!)];
    const allUnpubIds = allKnownIds.filter((id) => !allPublishIds.includes(id));
    const parentIdsCopy = [...selectedParentIds];

    setBulkChannelOpen(false);
    setGlobalTask("bg-channels", `Updating channels & catalogs for ${count} products...`, "running");

    fetch("/api/shopify/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bulk-set-publications",
        shop,
        parentIds: parentIdsCopy,
        publishTo: allPublishIds,
        unpublishFrom: allUnpubIds,
      }),
    })
      .then((resp) => resp.json().catch(() => ({})))
      .then((json: { ok?: boolean; updated?: number; totalProducts?: number; published?: number; errors?: string[]; message?: string }) => {
        if (json.ok) {
          setGlobalTask("bg-channels", `Channels & catalogs updated for ${json.totalProducts ?? json.updated ?? count} product(s)`, "success");
          channelsFetchedForPage.current = "";
          void prefetchChannelPubs(rows);
        } else {
          setGlobalTask("bg-channels", `Update error: ${json.errors?.slice(0, 3).join(", ") || json.message || "Unknown"}`, "error");
        }
      })
      .catch(() => {
        setGlobalTask("bg-channels", "Channel/catalog update failed — network error", "error");
      });
  }

  useEffect(() => {
    if (!channelDropdownOpen) return;
    const handler = () => setChannelDropdownOpen(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [channelDropdownOpen]);

  useEffect(() => {
    if (rows.length === 0 || !shop) return;
    const pageKey = `${page}-${pageSize}-${shop}`;
    if (channelsFetchedForPage.current === pageKey) return;
    channelsFetchedForPage.current = pageKey;
    void prefetchChannelPubs(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, page, pageSize, shop]);

  type SyncLogEntry = {
    id: string;
    synced_at: string;
    items_checked: number;
    items_updated: number;
    variants_added: number;
    variants_deleted: number;
    products_archived: number;
    errors: number;
    error_details: string | null;
    duration_ms: number;
  };
  const [syncLogEntries, setSyncLogEntries] = useState<SyncLogEntry[]>([]);
  const [syncLogOpen, setSyncLogOpen] = useState(false);

  const fetchSyncLog = useCallback(async () => {
    if (!shop) return;
    try {
      const resp = await fetch(`/api/shopify/sync-log?shop=${encodeURIComponent(shop)}&limit=20`, { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      if (json.ok && Array.isArray(json.entries)) {
        setSyncLogEntries(json.entries);
      }
    } catch { /* silent */ }
  }, [shop]);

  useEffect(() => {
    if (!shop) return;
    fetchSyncLog();
    const interval = setInterval(fetchSyncLog, 60_000);
    return () => clearInterval(interval);
  }, [shop, fetchSyncLog]);
  const allFilteredRowsRef = useRef<CartInventoryParentRow[] | null>(null);
  const [task, _rawSetTask] = useState<{
    label: string;
    progress: number;
    tone: TaskTone;
  }>({ label: "Ready", progress: 0, tone: "idle" });

  const taskIdRef = useRef("page-carts-inventory");

  function setTask(t: { label: string; progress: number; tone: TaskTone }, bgId?: string) {
    _rawSetTask(t);
    setGlobalTask(bgId || taskIdRef.current, t.label, t.tone);
  }

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
    void loadCart(1, 20, DEFAULT_FILTERS);
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
      allFilteredRowsRef.current = allRows;
      setAllFilteredSelected(true);
      const totalItems = allRows.reduce((n, r) => n + (r.variants?.length ?? r.variations ?? 0), 0);
      setStatus(`Selected all ${allRows.length} filtered products (${totalItems} variant${totalItems !== 1 ? "s" : ""}).`);
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
      let payload: Record<string, unknown> = { action, shop, ...extra };
      if (action === "stage-remove") {
        const ids = (extra?.parentIds as string[]) ?? [];
        const parentRows = getParentRowsForIds(ids);
        const removeProductGids = parentRows.map((p) => toProductGid(p)).filter((g): g is string => Boolean(g));
        if (removeProductGids.length > 0) {
          payload = { ...payload, removeProductGids };
        }
        payload = { ...payload, page, pageSize, filters: appliedFilters };
      }
      const resp = await fetch("/api/shopify/cart-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await resp.json().catch(() => ({}))) as CartInventoryResponse & { error?: string; removed?: number; archivedInShopify?: number };
      if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, `Action failed: ${action}`));
      if (action === "stage-remove") {
        const archived = json.archivedInShopify ?? 0;
        setStatus(archived > 0 ? `Removed from Carts Inventory and archived ${archived} product(s) in Shopify.` : "Selected rows removed from Carts Inventory.");
        if (Array.isArray(json.rows) && json.summary != null) {
          setRows(json.rows);
          setPage(Number(json.page ?? page));
          setPageSize(Number(json.pageSize ?? pageSize));
          setTotalPages(Math.max(1, Number(json.totalPages ?? 1)));
          setSummary({
            totalProducts: Number(json.summary.totalProducts ?? 0),
            totalItems: Number(json.summary.totalItems ?? 0),
            totalProcessed: Number(json.summary.totalProcessed ?? 0),
            totalPending: Number(json.summary.totalPending ?? 0),
            totalErrors: Number(json.summary.totalErrors ?? 0),
          });
          if (Array.isArray(json.options?.categories)) setCategories(json.options.categories);
          setSelectedParents({});
          setSelectedVariants({});
          setAllFilteredSelected(false);
          allFilteredRowsRef.current = null;
          setExpandedRows({});
        } else {
          await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing catalog..." });
        }
      } else {
        await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing catalog..." });
      }
      if (action === "set-status") setStatus("Status updated for selected rows.");
      if (action === "undo-session") setStatus("Undo completed.");
      setTask({ label: `${action} complete`, progress: 100, tone: "success" });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Action failed.");
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function activateArchivedInCart() {
    if (!shop) {
      setError("No shop selected.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    setTask({ label: "Activating archived products...", progress: 35, tone: "running" });
    try {
      const resp = await fetch("/api/shopify/cart-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate-archived", shop }),
      });
      const json = (await resp.json().catch(() => ({}))) as { error?: string; activated?: number };
      if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, "Activate failed"));
      const n = json.activated ?? 0;
      setStatus(`Activated ${n} archived product(s) in Shopify.`);
      setTask({ label: `Activated ${n} product(s)`, progress: 100, tone: "success" });
      await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing..." });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Activate failed");
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function matchToLSMatrix() {
    if (!shop) {
      setError("No shop selected.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    setTask({ label: "Matching Cart Inventory to LS matrix...", progress: 35, tone: "running" });
    try {
      const resp = await fetch("/api/shopify/cart-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "match-to-ls-matrix", shop }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        error?: string;
        matched?: number;
        skipped?: number;
        enriched?: number;
        errors?: string[];
      };
      if (!resp.ok) throw new Error(sanitizeUiErrorMessage(json.error, "Match to LS matrix failed"));
      const matched = json.matched ?? 0;
      const skipped = json.skipped ?? 0;
      const enriched = json.enriched ?? 0;
      setStatus(`Matched ${matched} product(s) to LS matrix. ${skipped} skipped (no LS match).${enriched ? ` Enriched ${enriched} existing product(s) with LS data.` : ""}`);
      setTask({ label: `Matched ${matched} product(s)`, progress: 100, tone: "success" });
      await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing..." });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Match to LS matrix failed");
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const PUSH_BATCH_SIZE = 80;

  async function countRemainingMissingSkuForSelection(parentIds: string[]) {
    if (!shop || parentIds.length < 1) return 0;
    const wanted = new Set(parentIds.map((id) => id.toLowerCase()));
    let remaining = 0;
    let currentPage = 1;
    let totalPages = 1;
    while (currentPage <= totalPages && remaining < wanted.size) {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("pageSize", String(SELECT_PAGE_SIZE));
      params.set("ShopifySkuCoverage", "MissingSkuInShopify");
      params.set("refreshCoverage", "1");
      if (shop) params.set("shop", shop);
      const resp = await fetch(`/api/shopify/cart-inventory?${params.toString()}`, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as CartInventoryResponse;
      if (!resp.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || "Failed to validate missing SKU coverage after push.");
      }
      const rows = Array.isArray(json.rows) ? json.rows : [];
      for (const row of rows) {
        if (wanted.has(row.id.toLowerCase())) remaining += 1;
      }
      totalPages = Math.max(1, Number(json.totalPages || 1));
      currentPage += 1;
    }
    return remaining;
  }

  async function countRemainingUnlinkedVariantsForSelection(parentIds: string[]) {
    if (!shop || parentIds.length < 1) return 0;
    const wanted = new Set(parentIds.map((id) => id.toLowerCase()));
    let remaining = 0;
    let currentPage = 1;
    let totalPages = 1;
    while (currentPage <= totalPages) {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("pageSize", String(SELECT_PAGE_SIZE));
      if (shop) params.set("shop", shop);
      const resp = await fetch(`/api/shopify/cart-inventory?${params.toString()}`, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as CartInventoryResponse;
      if (!resp.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || "Failed to validate remaining unlinked variants after push.");
      }
      const rows = Array.isArray(json.rows) ? json.rows : [];
      for (const row of rows) {
        if (!wanted.has(row.id.toLowerCase())) continue;
        remaining += (row.variants || []).filter((variant) => !normalizeText(variant.cartId)).length;
      }
      totalPages = Math.max(1, Number(json.totalPages || 1));
      currentPage += 1;
    }
    return remaining;
  }

  async function countFinalRemainingAfterSettle(parentIds: string[]) {
    const unlinkedNow = await countRemainingUnlinkedVariantsForSelection(parentIds);
    const missingNow = await countRemainingMissingSkuForSelection(parentIds);
    if (unlinkedNow < 1 && missingNow < 1) {
      return { unlinked: 0, missing: 0 };
    }
    // Give the backend one short settle window in case persistence is still in flight.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const unlinkedAfter = await countRemainingUnlinkedVariantsForSelection(parentIds);
    const missingAfter = await countRemainingMissingSkuForSelection(parentIds);
    return { unlinked: unlinkedAfter, missing: missingAfter };
  }

  async function openPushDialog(background: boolean) {
    const hasPush = selectedParentIds.length > 0;
    if (!hasPush) {
      setError("Nothing to push. Select items to push, or remove items first to remove them from Shopify.");
      return;
    }
    setPushDialogBg(background);
    setPushDialogOpen(true);
    setPushPubsLoading(true);
    try {
      const qs = shop ? `?shop=${encodeURIComponent(shop)}` : "";
      const [pubResp, cfgResp] = await Promise.all([
        fetch(`/api/shopify/publications${qs}`, { cache: "no-store" }),
        fetch(`/api/shopify/cart-config${qs}`, { cache: "no-store" }),
      ]);
      const pubJson = (await pubResp.json().catch(() => ({}))) as {
        ok?: boolean;
        publications?: PubItem[];
        catalogs?: CatItem[];
      };
      const cfgJson = (await cfgResp.json().catch(() => ({}))) as {
        config?: { publicationDefaults?: { selectedPublicationIds?: string[]; selectedCatalogIds?: string[] } };
      };
      const pubs = pubJson.publications ?? [];
      const cats = (pubJson.catalogs ?? []).filter((c) => c.id.includes("MarketCatalog") && c.publicationId);
      setPushPubs(pubs);
      setPushCats(cats);
      const defaults = cfgJson.config?.publicationDefaults;
      if (defaults?.selectedPublicationIds?.length) {
        setPushSelectedPubs(defaults.selectedPublicationIds);
      } else {
        setPushSelectedPubs(pubs.map((p) => p.id));
      }
      if (defaults?.selectedCatalogIds?.length) {
        setPushSelectedCats(defaults.selectedCatalogIds);
      } else {
        setPushSelectedCats([]);
      }
    } catch {
      setPushPubs([]);
      setPushCats([]);
      setPushSelectedPubs([]);
      setPushSelectedCats([]);
    } finally {
      setPushPubsLoading(false);
    }
  }

  async function pushSelectedToShopify(background = false) {
    setPushDialogOpen(false);
    const runInBackground = background === true;
    const requestedParentIds =
      allFilteredSelected && allFilteredRowsRef.current && allFilteredRowsRef.current.length > 0
        ? allFilteredRowsRef.current.map((row) => row.id)
        : [...selectedParentIds];
    const hasPush = requestedParentIds.length > 0;
    if (!hasPush) {
      setError("Nothing to push. Select items to push, or remove items first to remove them from Shopify.");
      return;
    }
    if (!runInBackground) setBusy(true);
    setError("");
    setStatus("");
    const useBatching = !runInBackground && requestedParentIds.length > PUSH_BATCH_SIZE;
    let batches = useBatching
      ? (() => {
          const b: string[][] = [];
          for (let i = 0; i < requestedParentIds.length; i += PUSH_BATCH_SIZE) {
            b.push(requestedParentIds.slice(i, i + PUSH_BATCH_SIZE));
          }
          return b;
        })()
      : [requestedParentIds];
    setTask({
      label: useBatching ? `Pushing batch 1/${batches.length}...` : "Pushing to Shopify...",
      progress: 35,
      tone: "running",
    });
    try {
      let totalPushed = 0;
      let totalCreated = 0;
      let totalRemoved = 0;
      let totalArchived = 0;
      let aggregatedDebug: {
        hint?: string;
        staleLinksCleared?: number;
        variantsLinkedBySku?: number;
        variantsLinkedByTitle?: number;
        variantsAddedToExisting?: number;
        variantsSkippedNoCartId?: number;
        variantsSkippedNoInvItem?: number;
        addVariantErrors?: string[];
        steps?: Array<{ step: string; detail: string }>;
      } = {};
      const allHints = new Set<string>();
      const allSteps: Array<{ step: string; detail: string }> = [];
      let addVariantsBlocked = 0;
      let createProductsBlocked = 0;
      const failedParentIds = new Set<string>();
      let autoSplitCount = 0;
      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) {
          setTask({
            label: `Pushing batch ${i + 1}/${batches.length}...`,
            progress: 35 + Math.round(((i + 0.5) / batches.length) * 55),
            tone: "running",
          });
        }
        const resp = await fetch("/api/shopify/cart-inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "push-selected",
            shop,
            parentIds: batches[i],
            publicationIds: [...pushSelectedPubs, ...pushSelectedCats],
            catalogIds: [],
            background: runInBackground,
            notificationEmail:
            (typeof process.env.NEXT_PUBLIC_PUSH_NOTIFICATION_EMAIL === "string" &&
              process.env.NEXT_PUBLIC_PUSH_NOTIFICATION_EMAIL.trim()) ||
            "elior@carbonjeanscompany.com",
        }),
      });
        const json = (await resp.json().catch(() => ({}))) as {
          error?: string;
          pushed?: number;
          productsCreated?: number;
          removedFromShopify?: number;
          archivedNotInCart?: number;
          startedAt?: string;
          debug?: {
            hint?: string;
            staleLinksCleared?: number;
            variantsLinkedBySku?: number;
            variantsLinkedByTitle?: number;
            variantsAddedToExisting?: number;
            variantsSkippedNoCartId?: number;
            variantsSkippedNoInvItem?: number;
            addVariantErrors?: string[];
            steps?: Array<{ step: string; detail: string }>;
          };
        };
        const apiError = sanitizeUiErrorMessage(json.error, "");
        const fallback =
          resp.status === 504
            ? `Request timed out. Batch ${i + 1} may be too large.`
            : resp.status === 502 || resp.status === 503
              ? "Server overloaded or timeout."
              : `Push to Shopify failed (${resp.status}).`;
        const errMsg = apiError || fallback;
        if (!resp.ok) {
          const isTimeoutStatus = resp.status === 502 || resp.status === 503 || resp.status === 504 || resp.status === 524;
          const currentBatch = batches[i] || [];
          if (isTimeoutStatus && currentBatch.length > 1) {
            const splitAt = Math.ceil(currentBatch.length / 2);
            const left = currentBatch.slice(0, splitAt);
            const right = currentBatch.slice(splitAt);
            batches.splice(i, 1, left, right);
            autoSplitCount += 1;
            setTask({
              label: `Batch timed out. Retrying in smaller chunks (${left.length}/${right.length})...`,
              progress: Math.max(35, Math.min(90, 35 + Math.round(((i + 0.5) / Math.max(1, batches.length)) * 55))),
              tone: "running",
            });
            i -= 1;
            continue;
          }
          for (const pid of currentBatch) failedParentIds.add(pid);
          if (batches.length === 1) {
            throw new Error(errMsg);
          }
          continue;
        }
        if (resp.status === 202) {
          setStatus("Sync started in background. You can close this page.");
          setTask({ label: "Sync running in background...", progress: 35, tone: "running" });
          const startedAt = normalizeText(json.startedAt) || new Date().toISOString();
          const startedAtMs = Date.parse(startedAt);
          const pollStart = Number.isFinite(startedAtMs) ? startedAtMs : Date.now();
          // Poll sync activity and update the progress bar with real completion status.
          const maxPollMs = 15 * 60 * 1000;
          const pollIntervalMs = 6000;
          let elapsed = 0;
          while (elapsed <= maxPollMs) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            elapsed += pollIntervalMs;
            const pct = Math.min(92, 35 + Math.round((elapsed / maxPollMs) * 57));
            setTask({ label: "Background sync running...", progress: pct, tone: "running" });
            try {
              const qs = new URLSearchParams({
                shop,
                limit: "5",
              });
              const logResp = await fetch(`/api/shopify/sync-log?${qs.toString()}`, { cache: "no-store" });
              const logJson = (await logResp.json().catch(() => ({}))) as {
                entries?: Array<{
                  synced_at?: string;
                  items_updated?: number;
                  variants_added?: number;
                  errors?: number;
                  error_details?: string | null;
                }>;
              };
              const entries = Array.isArray(logJson.entries) ? logJson.entries : [];
              const done = entries.find((entry) => {
                const ts = Date.parse(normalizeText(entry.synced_at));
                return Number.isFinite(ts) && ts >= pollStart - 1000;
              });
              if (done) {
                const updated = Number(done.items_updated || 0);
                const added = Number(done.variants_added || 0);
                const errors = Number(done.errors || 0);
                const details = normalizeText(done.error_details);
                const parts: string[] = [];
                parts.push(`Background sync completed. Updated ${updated} variant(s)`);
                if (added > 0) parts.push(`added ${added} variant(s)`);
                if (errors > 0) parts.push(`⚠ ${errors} error(s)`);
                if (errors > 0 && details) parts.push(details.slice(0, 240));
                setStatus(parts.join(". ") + ".");
                setTask({ label: "Background sync completed", progress: 100, tone: errors > 0 ? "error" : "success" });
                break;
              }
            } catch {
              // Keep polling; user still has the initial started message.
            }
          }
          await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing catalog..." });
          return;
        }
        totalPushed += json.pushed ?? 0;
        totalCreated += json.productsCreated ?? 0;
        totalRemoved += json.removedFromShopify ?? 0;
        totalArchived += json.archivedNotInCart ?? 0;
        if (json.debug) {
          const d = json.debug;
          aggregatedDebug.staleLinksCleared = (aggregatedDebug.staleLinksCleared || 0) + Number(d.staleLinksCleared || 0);
          aggregatedDebug.variantsLinkedBySku = (aggregatedDebug.variantsLinkedBySku || 0) + Number(d.variantsLinkedBySku || 0);
          aggregatedDebug.variantsLinkedByTitle = (aggregatedDebug.variantsLinkedByTitle || 0) + Number(d.variantsLinkedByTitle || 0);
          aggregatedDebug.variantsAddedToExisting = (aggregatedDebug.variantsAddedToExisting || 0) + Number(d.variantsAddedToExisting || 0);
          aggregatedDebug.variantsSkippedNoCartId = (aggregatedDebug.variantsSkippedNoCartId || 0) + Number(d.variantsSkippedNoCartId || 0);
          aggregatedDebug.variantsSkippedNoInvItem = (aggregatedDebug.variantsSkippedNoInvItem || 0) + Number(d.variantsSkippedNoInvItem || 0);
          if (Array.isArray(d.addVariantErrors) && d.addVariantErrors.length > 0) {
            aggregatedDebug.addVariantErrors = [...(aggregatedDebug.addVariantErrors || []), ...d.addVariantErrors];
          }
          if (Array.isArray(d.steps) && d.steps.length > 0) {
            allSteps.push(...d.steps);
            addVariantsBlocked += d.steps.filter((s) => s.step === "add-variants-blocked").length;
            createProductsBlocked += d.steps.filter((s) => s.step === "create-product-blocked").length;
          }
          const hint = normalizeText(d.hint);
          if (hint) allHints.add(hint);
        }
      }
      const parts: string[] = [];
      if (hasPush) parts.push(`Updated ${totalPushed} variant(s)`);
      if (totalCreated > 0) parts.push(`created ${totalCreated} product(s)`);
      if (totalArchived > 0) parts.push(`archived ${totalArchived}`);
      const remainingFinal = await countFinalRemainingAfterSettle(requestedParentIds);
      if (aggregatedDebug) {
        const d = aggregatedDebug;
        if (d.variantsAddedToExisting) parts.push(`added ${d.variantsAddedToExisting} variant(s)`);
        if (d.staleLinksCleared) parts.push(`cleared ${d.staleLinksCleared} stale link(s)`);
        const sizeReorders = allSteps.filter((s: { step: string }) => s.step === "size-reorder").length;
        if (sizeReorders > 0) parts.push(`reordered sizes on ${sizeReorders} product(s)`);
        if (addVariantsBlocked > 0) parts.push(`⚠ ${addVariantsBlocked} product(s) blocked by Add Variants setting`);
        if (createProductsBlocked > 0) parts.push(`⚠ ${createProductsBlocked} product(s) blocked by Create New Products setting`);
        if (d.addVariantErrors?.length) parts.push(`⚠ ${d.addVariantErrors.length} variant error(s)`);
        if (remainingFinal.unlinked > 0 && allHints.size > 0) {
          parts.push(Array.from(allHints).slice(0, 2).join(" | "));
        }
      }
      const remainingUnlinked = remainingFinal.unlinked;
      if (remainingUnlinked > 0) {
        parts.push(`⚠ ${remainingUnlinked} variant(s) still unlinked`);
      }
      const remainingMissing = remainingFinal.missing;
      if (remainingMissing > 0) {
        parts.push(`⚠ ${remainingMissing}/${requestedParentIds.length} selected product(s) still have missing SKU in Shopify`);
      }
      if (autoSplitCount > 0) {
        parts.push(`auto-split ${autoSplitCount} timed-out batch(es)`);
      }
      if (failedParentIds.size > 0) {
        parts.push(`⚠ ${failedParentIds.size} product(s) failed due to timeout/server error`);
      }
      if (parts.length === 0) parts.push("Push completed — no changes needed.");
      setStatus(parts.join(". ") + ".");
      setTask({ label: "Push to Shopify completed", progress: 100, tone: "success" });
      await loadCart(page, pageSize, appliedFilters, { startLabel: "Refreshing catalog..." });
    } catch (e: unknown) {
      const message = sanitizeUiErrorMessage((e as { message?: string } | null)?.message, "Push to Shopify failed.");
      setError(message);
      setTask({ label: message, progress: 100, tone: "error" });
    } finally {
      if (!runInBackground) setBusy(false);
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
    if (s === "PROCESSED") return <img src="/badge-processed.png" alt="Processed" className="sync-badge-img" />;
    if (s === "PENDING") return <img src="/badge-pending.png" alt="Pending" className="sync-badge-img" />;
    return <img src="/badge-error.png" alt="Error" className="sync-badge-img" />;
  }

  const statusTone: "error" | "working" | "success" | "idle" = error
    ? "error"
    : task.tone === "running"
      ? "working"
      : task.tone === "error"
        ? "error"
        : status
          ? "success"
          : "idle";
  const statusHeadline =
    error ||
    status ||
    (statusTone === "working" ? task.label || "Action in progress..." : "Ready.");

  function resetTaskProgressDisplay() {
    setStatus("");
    setWarning("");
    setError("");
    setTask({ label: "Ready", progress: 0, tone: "idle" });
  }

  return (
    <main className="page">
      <section className={`card status-bar ${statusTone}`} aria-live="polite" aria-atomic="true">
        <div className="status-bar-head">
          <div className="status-bar-title">Progress</div>
          <div className="status-bar-head-actions">
            <button className="status-chip status-chip-fixed idle status-reset-btn" type="button" onClick={resetTaskProgressDisplay}>
              Reset
            </button>
            <button className={`status-chip status-chip-fixed status-state-btn ${statusTone}`} type="button" disabled>
              {statusTone === "error"
                ? "Error"
                : statusTone === "working"
                  ? "Working"
                  : statusTone === "success"
                    ? "Done"
                    : "Idle"}
            </button>
          </div>
        </div>
        <div className="status-bar-message">
          {statusTone === "error" ? `Error: ${statusHeadline}` : statusHeadline}
        </div>
        <div className="status-bar-meta">
          {warning || (statusTone === "working" ? "Task in progress..." : "No active tasks.")}
        </div>
      </section>
      <div className="page-content">
      <nav className="quick-nav" aria-label="Inventory sections">
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

      <p className="breadcrumb">
        <Link href="/studio/shopify-mapping-inventory/workset">Workset</Link>
        <span className="sep"> / </span>
        <span>Carts Inventory</span>
      </p>

      <SyncTogglesBar shop={shop} disabled={busy} />

      {/* Sync Activity Log */}
      <div className="card" style={{ marginBottom: 12, padding: "10px 16px" }}>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
          onClick={() => setSyncLogOpen((v) => !v)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Sync Activity</span>
            {syncLogEntries.length > 0 && (
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                Last: {new Date(syncLogEntries[0].synced_at).toLocaleString()} — {syncLogEntries[0].items_updated} updated, {syncLogEntries[0].errors} errors
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, opacity: 0.5 }}>{syncLogOpen ? "▲" : "▼"}</span>
        </div>
        {syncLogOpen && (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            {syncLogEntries.length === 0 ? (
              <p style={{ fontSize: 12, opacity: 0.5 }}>No sync activity recorded yet.</p>
            ) : (
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Time</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Checked</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Updated</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>+Variants</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>-Variants</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Archived</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Errors</th>
                    <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      title={entry.error_details || ""}
                    >
                      <td style={{ padding: "3px 8px" }}>{new Date(entry.synced_at).toLocaleString()}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right" }}>{entry.items_checked}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right" }}>{entry.items_updated}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right", color: entry.variants_added > 0 ? "#4ade80" : undefined }}>{entry.variants_added}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right", color: entry.variants_deleted > 0 ? "#f87171" : undefined }}>{entry.variants_deleted}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right" }}>{entry.products_archived}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right", color: entry.errors > 0 ? "#f87171" : undefined }}>{entry.errors}</td>
                      <td style={{ padding: "3px 8px", textAlign: "right" }}>{entry.duration_ms < 1000 ? `${entry.duration_ms}ms` : `${(entry.duration_ms / 1000).toFixed(1)}s`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>


      <section className="glass-panel card filter-card">
        <div className="filters filters-skuplugs">
          <div className="filter-section">
            <button type="button" className="filter-section-header" onClick={() => setGeneralFiltersOpen((prev) => !prev)} aria-expanded={generalFiltersOpen}>
              <span className="filter-section-chevron">{generalFiltersOpen ? "▼" : "▶"}</span>
              <span>General Filters</span>
            </button>
            {generalFiltersOpen && (
              <>
                <div className="filter-row">
                  <input value={filters.SKU} onChange={(e) => updateFilter("SKU", e.target.value)} placeholder="SKU or UPC (partial)" aria-label="Filter by SKU or UPC" />
                  <input value={filters.Name} onChange={(e) => updateFilter("Name", e.target.value)} placeholder="Product Name" aria-label="Filter by product name" />
                  <input value={filters.Brand} onChange={(e) => updateFilter("Brand", e.target.value)} placeholder="Brand" aria-label="Filter by brand" />
                  <input value={filters.Keyword} onChange={(e) => updateFilter("Keyword", e.target.value)} placeholder="Search Keyword" aria-label="Search keyword" />
                </div>
                <div className="filter-row">
                  <input value={filters.PriceFrom} onChange={(e) => updateFilter("PriceFrom", e.target.value)} placeholder="Price From" type="number" step="any" min="0" aria-label="Minimum price" />
                  <input value={filters.PriceTo} onChange={(e) => updateFilter("PriceTo", e.target.value)} placeholder="Price To" type="number" step="any" min="0" aria-label="Maximum price" />
                  <input value={filters.StockFrom} onChange={(e) => updateFilter("StockFrom", e.target.value)} placeholder="Stock From" type="number" step="any" min="0" aria-label="Minimum stock" />
                  <input value={filters.StockTo} onChange={(e) => updateFilter("StockTo", e.target.value)} placeholder="Stock To" type="number" step="any" min="0" aria-label="Maximum stock" />
                </div>
                <div className="filter-row filter-row-actions">
                  <select value={filters.CategoryName} onChange={(e) => updateFilter("CategoryName", e.target.value)} aria-label="Filter by category">
                    <option value="">Select Category</option>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <select value={filters.Orderby} onChange={(e) => updateFilter("Orderby", normalizeText(e.target.value) as CartFilters["Orderby"])} aria-label="Filter by process status">
                    <option value="All">Status: All</option>
                    <option value="Processed">Processed</option>
                    <option value="Pending">Pending</option>
                    <option value="Error">Error</option>
                  </select>
                  <select value={filters.LSSource} onChange={(e) => updateFilter("LSSource", normalizeText(e.target.value) as CartFilters["LSSource"])} aria-label="Filter by source" title="Filter by Lightspeed inventory source">
                    <option value="All">All Sources</option>
                    <option value="InLS">In LS Inventory</option>
                    <option value="NotInLS">Not in LS (manual/Shopify)</option>
                  </select>
                  <select value={filters.ShopifySource} onChange={(e) => updateFilter("ShopifySource", normalizeText(e.target.value) as CartFilters["ShopifySource"])} aria-label="Filter by Shopify presence" title="Filter by Shopify presence">
                    <option value="All">Shopify: All</option>
                    <option value="InShopify">In Shopify</option>
                    <option value="NotInShopify">Not in Shopify</option>
                  </select>
                  <select value={filters.ShopifySkuCoverage} onChange={(e) => updateFilter("ShopifySkuCoverage", normalizeText(e.target.value) as CartFilters["ShopifySkuCoverage"])} aria-label="Filter by Shopify SKU coverage" title="Filter by strict SKU coverage in Shopify">
                    <option value="All">SKU Coverage: All</option>
                    <option value="AllSkuInShopify">All SKUs in Shopify</option>
                    <option value="MissingSkuInShopify">Has Missing SKU in Shopify</option>
                  </select>
                  <select value={filters.HasDescription} onChange={(e) => updateFilter("HasDescription", normalizeText(e.target.value) as CartFilters["HasDescription"])} aria-label="Filter by Shopify description" title="Filter by whether product has Shopify description">
                    <option value="All">Description: All</option>
                    <option value="Has">Has Description</option>
                    <option value="None">No Description</option>
                  </select>
                  <select value={filters.HasImage} onChange={(e) => updateFilter("HasImage", normalizeText(e.target.value) as CartFilters["HasImage"])} aria-label="Filter by product image" title="Filter by whether product has image">
                    <option value="All">Image: All</option>
                    <option value="Has">Has Image</option>
                    <option value="None">No Image</option>
                  </select>
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
                    title="Quick stock presets"
                    aria-label="Stock preset filter"
                  >
                    <option value="all">Stock: All</option>
                    <option value="zero">Stock: Zero</option>
                    <option value="low">Stock: Low</option>
                    <option value="instock">Stock: In stock</option>
                    <option value="null">Stock: Null</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="filter-section filter-section-matrix">
            <button type="button" className="filter-section-header" onClick={() => setMatrixFiltersOpen((prev) => !prev)} aria-expanded={matrixFiltersOpen}>
              <span className="filter-section-chevron">{matrixFiltersOpen ? "▼" : "▶"}</span>
              <span>Matrix Filters</span>
              <span className="filter-section-hint">(all variants must match)</span>
            </button>
            {matrixFiltersOpen && (
              <div className="filter-row filter-row-matrix">
                <input value={filters.MatrixStockFrom} onChange={(e) => updateFilter("MatrixStockFrom", e.target.value)} placeholder="Matrix Stock From" type="number" step="any" min="0" aria-label="Matrix: min stock (all variants)" title="Products where every variant has stock ≥ this" />
                <input value={filters.MatrixStockTo} onChange={(e) => updateFilter("MatrixStockTo", e.target.value)} placeholder="Matrix Stock To" type="number" step="any" min="0" aria-label="Matrix: max stock (all variants)" title="Products where every variant has stock ≤ this" />
                <input value={filters.MatrixPriceFrom} onChange={(e) => updateFilter("MatrixPriceFrom", e.target.value)} placeholder="Matrix Price From" type="number" step="any" min="0" aria-label="Matrix: min price (all variants)" title="Products where every variant price ≥ this" />
                <input value={filters.MatrixPriceTo} onChange={(e) => updateFilter("MatrixPriceTo", e.target.value)} placeholder="Matrix Price To" type="number" step="any" min="0" aria-label="Matrix: max price (all variants)" title="Products where every variant price ≤ this" />
                <input value={filters.MatrixSKU} onChange={(e) => updateFilter("MatrixSKU", e.target.value)} placeholder="Matrix SKU (all variants)" aria-label="Matrix: SKU (all variants must contain)" title="Products where every variant SKU/UPC contains this" />
                <input value={filters.MatrixColor} onChange={(e) => updateFilter("MatrixColor", e.target.value)} placeholder="Matrix Color (all variants)" aria-label="Matrix: Color (all variants)" title="Products where every variant has this color" />
                <input value={filters.MatrixSize} onChange={(e) => updateFilter("MatrixSize", e.target.value)} placeholder="Matrix Size (all variants)" aria-label="Matrix: Size (all variants)" title="Products where every variant has this size" />
              </div>
            )}
          </div>

          <div className="filter-row filter-row-actions filter-actions-global">
            <div className="filter-actions">
              <button className="btn-base search-btn" onClick={() => { setAppliedFilters(filters); void loadCart(1, pageSize, filters, { startLabel: "Applying filters...", successLabel: "Filters applied" }); }} disabled={busy}>Search</button>
              <button className="btn-base btn-outline" onClick={() => { setFilters(DEFAULT_FILTERS); setAppliedFilters(DEFAULT_FILTERS); void loadCart(1, pageSize, DEFAULT_FILTERS, { startLabel: "Resetting filters...", successLabel: "Filters reset" }); }} disabled={busy}>Reset</button>
            </div>
          </div>
        </div>
        <div className="row actions-row">
          <button className="btn-base btn-outline" onClick={() => void openComparePopup()} disabled={busy || !shop} title="Show Cart items that were not part of the last queue sync from LS inventory">Compare</button>
          <button className="btn-base btn-outline" onClick={() => void selectAllFilteredProducts()} disabled={busy || summary.totalProducts < 1} title="Select all products matching current filters">Select All</button>
          <button className="btn-base btn-outline" onClick={() => { setSelectedParents({}); setSelectedVariants({}); clearAllFilteredSelection(); }} disabled={busy || selectedParentIds.length < 1} title="Clear selection">Clear Selection</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("stage-remove", { parentIds: selectedParentIds })} disabled={busy || selectedParentIds.length < 1} title="Remove from Carts Inventory and archive in Shopify">Remove Selected</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("set-status", { parentIds: selectedParentIds, status: "PENDING" })} disabled={busy || selectedParentIds.length < 1}>Mark Pending</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("set-status", { parentIds: selectedParentIds, status: "PROCESSED" })} disabled={busy || selectedParentIds.length < 1}>Mark Processed</button>
          <button className="btn-base btn-outline" onClick={() => void runAction("undo-session")} disabled={busy}>Undo Last Session</button>
          <button className="btn-base btn-outline" onClick={() => void matchToLSMatrix()} disabled={busy || !shop} title="Convert Shopify-pulled items to LS matrix IDs so they appear as In LS Inventory. Matches by SKU or UPC.">Match to LS Matrix</button>
          <button className="btn-base btn-outline" onClick={() => void activateArchivedInCart()} disabled={busy || !shop} title="Activate archived Shopify products whose variants are in Cart. Temporary button – remove after products are back.">Activate Archived (in Cart)</button>
          <button className="btn-base btn-outline" onClick={() => void openBulkChannelDialog()} disabled={busy || selectedParentIds.length < 1} title="Update sales channels & catalogs for selected products">Update Channels</button>
          <button className="btn-base push-btn" onClick={() => void openPushDialog(true)} disabled={busy || selectedParentIds.length < 1} title="Push selected items to Shopify in background while you keep working.">Push to Shopify</button>
          <button className="btn-base btn-outline" onClick={() => void openPushDialog(true)} disabled={busy || selectedParentIds.length < 1} title="Push in background. You can close this page and sync will continue.">Push (background)</button>
        </div>
        <p className="mini">
          Products {summary.totalProducts} | Items {summary.totalItems} | <span className="mini-processed">Processed {summary.totalProcessed}</span> | <span className="mini-pending">Pending {summary.totalPending}</span> | <span className="mini-error">Errors {summary.totalErrors}</span>
          {selectedCounts.products > 0 ? (
            <span className="mini-selected"> | Selected: {selectedCounts.products} product{selectedCounts.products !== 1 ? "s" : ""} ({selectedCounts.items} item{selectedCounts.items !== 1 ? "s" : ""})</span>
          ) : null}
          {shop ? ` | Shop ${shop}` : ""}
        </p>
      </section>

      {status ? <p className="status-msg">{status}</p> : null}
      {warning ? <p className="warn-msg">{warning}</p> : null}
      {error ? <p className="error-msg">{error}</p> : null}

      <section className="table-toolbar">
        <span className="toolbar-left">
          <span className="toolbar-icon" aria-hidden>📊</span>
          <span className="total-products">Total Products: {summary.totalProducts.toLocaleString()}</span>
        </span>
        <span className="toolbar-right">
          <button type="button" className="toolbar-icon-btn" title="Export" aria-label="Export" onClick={() => {}} disabled={busy}>
            📁
          </button>
          <button type="button" className="toolbar-icon-btn" title="Download" aria-label="Download" onClick={() => {}} disabled={busy}>
            ⬇
          </button>
          <button type="button" className="toolbar-icon-btn" title="Remove selected from Carts Inventory and archive in Shopify" aria-label="Delete selected" onClick={() => void runAction("stage-remove", { parentIds: selectedParentIds })} disabled={busy || selectedParentIds.length < 1}>
            🗑
          </button>
          <select className="page-size-select" value={String(pageSize)} onChange={(e) => { const n = Number.parseInt(e.target.value, 10); setPageSize(n); void loadCart(1, n, appliedFilters, { startLabel: "Updating page size..." }); }} disabled={busy}>
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={String(size)}>{size}</option>)}
          </select>
        </span>
      </section>

      <section className="glass-panel card table-wrap table-card">
        <table className="parent-table">
          <colgroup>
            <col style={{ width: 34 }} />
            <col style={{ width: 270 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 36 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 88 }} />
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
                      const parentIds = new Set(sortedRows.map((r) => r.id));
                      setSelectedParents((prev) => {
                        const next = { ...prev };
                        for (const id of parentIds) next[id] = false;
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
              <th aria-sort={getAriaSort("upc")}>
                <button type="button" className={`sort-btn ${sortState?.field === "upc" ? "active" : ""}`} onClick={() => toggleSort("upc")}>
                  <span>UPC</span>
                  <span className="sort-mark">{getSortMark("upc")}</span>
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
                    <span>Process Status</span>
                    <span className="sort-mark">{getSortMark("details")}</span>
                  </button>
                </span>
              </th>
              <th></th>
              <th>Channels</th>
              <th className="picture-header-cell">Picture</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length < 1 ? (
              <tr><td colSpan={12}>{busy ? "Loading..." : "No products found. Pull catalog from Cart Configurations."}</td></tr>
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
                          const checked = e.target.checked;
                          setSelectedParents((prev) => ({ ...prev, [parent.id]: checked }));
                          setSelectedVariants((prev) => {
                            const next = { ...prev };
                            for (const v of parent.variants ?? []) {
                              const key = variantKey(parent.id, v.id);
                              if (checked) next[key] = true;
                              else delete next[key];
                            }
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td>
                      <span className="title-cell">
                        <span className="item-icon" aria-hidden>🔥</span>
                        <span>{parent.title}</span>
                      </span>
                    </td>
                    <td>{parent.category || "-"}</td>
                    <td>{parent.brand || "-"}</td>
                    <td>{getParentUpc(parent)}</td>
                    <td>{formatQty(parent.stock)}</td>
                    <td>{formatPrice(parent.price)}</td>
                    <td>{parent.variations}</td>
                    <td className="details-cell">
                      <span className="details-parent-wrap">
                        <span className="details-availability-inline">
                          {statusBadge(parent.status)}
                        </span>
                      </span>
                    </td>
                    <td className="eye-cell">
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
                    </td>
                    <td className="channels-cell" style={{ position: "relative" }}>
                      {(() => {
                        const pgid = getProductGid(parent);
                        if (!pgid) return <span className="muted">&ndash;</span>;
                        const pubs = channelPubs[pgid];
                        const totalChannels = channelAllPubs.length;
                        const totalCats = marketCatalogs.filter((c) => c.publicationId).length;
                        const total = totalChannels + totalCats || "?";
                        const knownPubIds = new Set([
                          ...channelAllPubs.map((p) => p.id),
                          ...marketCatalogs.filter((c) => c.publicationId).map((c) => c.publicationId!),
                        ]);
                        const count = pubs ? pubs.filter((id) => knownPubIds.has(id)).length : "?";
                        const isOpen = channelDropdownOpen === parent.id;
                        return (
                          <>
                            <button type="button" className="channels-badge" onClick={() => void openChannelDropdown(parent)} title="Manage sales channels & catalogs">
                              {count}/{total}
                            </button>
                            {isOpen && (
                              <div className="channels-dropdown" onClick={(e) => e.stopPropagation()}>
                                {channelDropdownLoading ? (
                                  <p className="channels-dd-loading">Loading...</p>
                                ) : channelAllPubs.length === 0 ? (
                                  <p className="channels-dd-loading">No channels</p>
                                ) : (
                                  <>
                                    <label className="channels-dd-item channels-dd-all">
                                      <input
                                        type="checkbox"
                                        checked={channelAllPubs.every((p) => (channelPubs[pgid] || []).includes(p.id))}
                                        onChange={(e) => void toggleAllChannels(pgid, e.target.checked)}
                                      />
                                      <span>Select All Channels</span>
                                    </label>
                                    {channelAllPubs.map((pub) => (
                                      <label key={pub.id} className="channels-dd-item">
                                        <input
                                          type="checkbox"
                                          checked={(channelPubs[pgid] || []).includes(pub.id)}
                                          onChange={(e) => void toggleChannel(pgid, pub.id, e.target.checked)}
                                        />
                                        <span>{pub.name}</span>
                                      </label>
                                    ))}
                                    {marketCatalogs.filter((c) => c.publicationId).length > 0 && (
                                      <>
                                        <div className="channels-dd-divider" />
                                        <label className="channels-dd-item channels-dd-all">
                                          <input
                                            type="checkbox"
                                            checked={marketCatalogs.filter((c) => c.publicationId).every((c) => (channelPubs[pgid] || []).includes(c.publicationId!))}
                                            onChange={(e) => {
                                              const catPubIds = marketCatalogs.filter((c) => c.publicationId).map((c) => c.publicationId!);
                                              if (e.target.checked) {
                                                for (const cid of catPubIds) void toggleChannel(pgid, cid, true);
                                              } else {
                                                for (const cid of catPubIds) void toggleChannel(pgid, cid, false);
                                              }
                                            }}
                                          />
                                          <span>Select All Catalogs</span>
                                        </label>
                                        {marketCatalogs.filter((c) => c.publicationId).map((cat) => (
                                          <label key={cat.id} className="channels-dd-item">
                                            <input
                                              type="checkbox"
                                              checked={(channelPubs[pgid] || []).includes(cat.publicationId!)}
                                              onChange={(e) => void toggleChannel(pgid, cat.publicationId!, e.target.checked)}
                                            />
                                            <span>{cat.title}</span>
                                          </label>
                                        ))}
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
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
                      <td colSpan={12}>
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
                                      <strong>{formatQty(variant.stock)}</strong>
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

      <section className="pager-skuplugs">
        <p className="pager-summary">Showing Page {page} of {totalPages}</p>
        <div className="pager-controls">
          <button className="btn-base btn-outline pager-btn" onClick={() => { const n = Math.max(1, page - 1); setPage(n); void loadCart(n, pageSize, appliedFilters, { startLabel: "Loading previous page...", successLabel: "Page loaded" }); }} disabled={busy || page <= 1} aria-label="Previous page">‹</button>
          <div className="pager-numbers">
            {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
              const p = totalPages <= 10 ? i + 1 : (page <= 5 ? i + 1 : Math.max(1, page - 5 + i));
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  type="button"
                  className={`btn-base btn-outline pager-num ${p === page ? "active" : ""}`}
                  onClick={() => void loadCart(p, pageSize, appliedFilters, { startLabel: "Loading page...", successLabel: "Page loaded" })}
                  disabled={busy}
                  aria-label={`Page ${p}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
          <button className="btn-base btn-outline pager-btn" onClick={() => { const n = Math.min(totalPages, page + 1); setPage(n); void loadCart(n, pageSize, appliedFilters, { startLabel: "Loading next page...", successLabel: "Page loaded" }); }} disabled={busy || page >= totalPages} aria-label="Next page">›</button>
        </div>
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

      {pushDialogOpen ? (
        <div className="preview-overlay" onClick={() => setPushDialogOpen(false)} role="dialog" aria-label="Push to Shopify — Sales Channels">
          <div className="push-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="push-dialog-head">
              <h3>Push to Shopify — Sales Channels</h3>
              <button type="button" className="preview-close" onClick={() => setPushDialogOpen(false)} aria-label="Close">&times;</button>
            </div>
            <p className="push-dialog-note">
              Select which sales channels and catalogs these {selectedParentIds.length} product(s) should be published to.
              Unchecked channels will have the product removed.
            </p>
            {pushPubsLoading ? (
              <p className="push-dialog-note" style={{ fontStyle: "italic" }}>Loading channels...</p>
            ) : pushPubs.length === 0 && pushCats.length === 0 ? (
              <p className="push-dialog-note" style={{ fontStyle: "italic" }}>
                No sales channels found. Products will be pushed without channel assignment.
              </p>
            ) : (
              <div className="push-dialog-body">
                {pushPubs.length > 0 && (
                  <div className="push-dialog-section">
                    <label className="push-dialog-selectall">
                      <input
                        type="checkbox"
                        checked={pushPubs.length > 0 && pushPubs.every((p) => pushSelectedPubs.includes(p.id))}
                        onChange={(e) => {
                          if (e.target.checked) setPushSelectedPubs(pushPubs.map((p) => p.id));
                          else setPushSelectedPubs([]);
                        }}
                      />
                      <strong>Select All Sales Channels</strong>
                    </label>
                    {pushPubs.map((pub) => (
                      <label key={pub.id} className="push-dialog-item">
                        <input
                          type="checkbox"
                          checked={pushSelectedPubs.includes(pub.id)}
                          onChange={(e) => {
                            if (e.target.checked) setPushSelectedPubs((prev) => [...prev, pub.id]);
                            else setPushSelectedPubs((prev) => prev.filter((id) => id !== pub.id));
                          }}
                        />
                        <span>{pub.name}</span>
                        {pub.app?.title ? <span className="push-dialog-app">{pub.app.title}</span> : null}
                      </label>
                    ))}
                  </div>
                )}
                {pushCats.length > 0 && (
                  <div className="push-dialog-section">
                    <label className="push-dialog-selectall">
                      <input
                        type="checkbox"
                        checked={pushCats.length > 0 && pushCats.every((c) => pushSelectedCats.includes(c.publicationId || c.id))}
                        onChange={(e) => {
                          if (e.target.checked) setPushSelectedCats(pushCats.map((c) => c.publicationId || c.id));
                          else setPushSelectedCats([]);
                        }}
                      />
                      <strong>Select All Catalogs</strong>
                    </label>
                    {pushCats.map((cat) => (
                      <label key={cat.id} className="push-dialog-item">
                        <input
                          type="checkbox"
                          checked={pushSelectedCats.includes(cat.publicationId || cat.id)}
                          onChange={(e) => {
                            const catPubId = cat.publicationId || cat.id;
                            if (e.target.checked) setPushSelectedCats((prev) => [...prev, catPubId]);
                            else setPushSelectedCats((prev) => prev.filter((id) => id !== catPubId));
                          }}
                        />
                        <span>{cat.title}</span>
                        <span className="push-dialog-app">{cat.status}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="push-dialog-actions">
              <button type="button" className="btn-base btn-outline" onClick={() => setPushDialogOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn-base push-btn"
                disabled={pushPubsLoading}
                onClick={() => void pushSelectedToShopify(pushDialogBg)}
              >
                {pushDialogBg ? "Push (background)" : "Push to Shopify"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkChannelOpen ? (
        <div className="preview-overlay" onClick={() => setBulkChannelOpen(false)} role="dialog" aria-label="Update Channels & Catalogs">
          <div className="push-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="push-dialog-head">
              <h3>Update Channels & Catalogs</h3>
              <button type="button" className="preview-close" onClick={() => setBulkChannelOpen(false)} aria-label="Close">&times;</button>
            </div>
            <p className="push-dialog-note">
              Apply channel & catalog selections to <strong>{selectedParentIds.length}</strong> selected product(s).
              Unchecked items will be unpublished from those channels.
            </p>
            <div className="push-dialog-body">
              {channelAllPubs.length > 0 && (
                <div className="push-dialog-section">
                  <label className="push-dialog-selectall">
                    <input
                      type="checkbox"
                      checked={channelAllPubs.length > 0 && channelAllPubs.every((p) => bulkChannelPubs.includes(p.id))}
                      onChange={(e) => {
                        if (e.target.checked) setBulkChannelPubs(channelAllPubs.map((p) => p.id));
                        else setBulkChannelPubs([]);
                      }}
                    />
                    <strong>Select All Sales Channels</strong>
                  </label>
                  {channelAllPubs.map((pub) => (
                    <label key={pub.id} className="push-dialog-item">
                      <input
                        type="checkbox"
                        checked={bulkChannelPubs.includes(pub.id)}
                        onChange={(e) => {
                          if (e.target.checked) setBulkChannelPubs((prev) => [...prev, pub.id]);
                          else setBulkChannelPubs((prev) => prev.filter((id) => id !== pub.id));
                        }}
                      />
                      <span>{pub.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {marketCatalogs.filter((c) => c.publicationId).length > 0 && (
                <div className="push-dialog-section">
                  <label className="push-dialog-selectall">
                    <input
                      type="checkbox"
                      checked={marketCatalogs.filter((c) => c.publicationId).length > 0 && marketCatalogs.filter((c) => c.publicationId).every((c) => bulkChannelCats.includes(c.publicationId!))}
                      onChange={(e) => {
                        if (e.target.checked) setBulkChannelCats(marketCatalogs.filter((c) => c.publicationId).map((c) => c.publicationId!));
                        else setBulkChannelCats([]);
                      }}
                    />
                    <strong>Select All Catalogs</strong>
                  </label>
                  {marketCatalogs.filter((c) => c.publicationId).map((cat) => (
                    <label key={cat.id} className="push-dialog-item">
                      <input
                        type="checkbox"
                        checked={bulkChannelCats.includes(cat.publicationId!)}
                        onChange={(e) => {
                          if (e.target.checked) setBulkChannelCats((prev) => [...prev, cat.publicationId!]);
                          else setBulkChannelCats((prev) => prev.filter((id) => id !== cat.publicationId!));
                        }}
                      />
                      <span>{cat.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="push-dialog-actions">
              <button type="button" className="btn-base btn-outline" onClick={() => setBulkChannelOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn-base push-btn"
                disabled={selectedParentIds.length < 1}
                onClick={() => applyBulkChannels()}
              >
                {`Apply to ${selectedParentIds.length} product(s)`}
              </button>
            </div>
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
      </div>

      <style jsx>{`
        .page {
          --status-bar-height: 154px;
          --page-inline-gap: 13px;
          --detail-thumb-w: 56px;
          --detail-thumb-h: 80px;
          --parent-thumb-w: 40px;
          --parent-thumb-h: 58px;
          max-width: 1220px;
          margin: 0 auto;
          padding: calc(var(--integration-panel-top, 89px) - 58px) 8px 26px;
          display: grid;
          gap: 12px;
          color: #f8fafc;
        }
        .status-bar {
          position: fixed;
          top: var(--integration-panel-top, 89px);
          left: calc(var(--page-inline-gap) + var(--page-edge-gap, 13px));
          right: calc(
            var(
              --content-right-pad,
              calc(
                var(--integration-panel-width, 255px) + var(--page-edge-gap, 13px) +
                  var(--content-api-gap, 13px)
              )
            )
          );
          z-index: 40;
          gap: 8px;
          height: var(--status-bar-height, 154px);
          min-height: var(--status-bar-height, 154px);
          max-height: var(--status-bar-height, 154px);
          overflow: hidden;
          text-align: center;
          justify-items: center;
          will-change: right, left;
          transition:
            left var(--chat-expand-duration, 220ms) var(--chat-expand-ease, cubic-bezier(0.22, 1, 0.36, 1)),
            right var(--chat-expand-duration, 220ms) var(--chat-expand-ease, cubic-bezier(0.22, 1, 0.36, 1));
        }
        .status-bar > * {
          width: 100%;
        }
        :global(.content.menu-open) .status-bar {
          left: 280px;
        }
        :global(.content.no-integration-panel) .status-bar {
          right: var(--page-inline-gap);
        }
        .page-content {
          margin-top: calc(var(--status-bar-height, 154px) + 13px);
          display: grid;
          gap: 12px;
        }
        .status-bar-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .status-bar-head-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .status-reset-btn {
          cursor: pointer;
          appearance: none;
          -webkit-appearance: none;
          font: inherit;
          line-height: 1;
          margin: 0;
        }
        .status-reset-btn:hover {
          filter: brightness(0.98);
        }
        .status-state-btn,
        .status-state-btn:disabled {
          cursor: default;
          opacity: 1;
          pointer-events: none;
        }
        .status-bar-title {
          font-weight: 700;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          font-size: 0.74rem;
          color: rgba(226, 232, 240, 0.8);
        }
        .status-chip {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 3px 0;
          box-sizing: border-box;
          justify-content: center;
          text-align: center;
          display: inline-flex;
          align-items: center;
          line-height: 1;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .status-chip-fixed {
          width: 82px;
          min-width: 82px;
          max-width: 82px;
          flex: 0 0 82px;
          height: 32px;
          min-height: 32px;
          max-height: 32px;
          padding: 0;
        }
        .status-chip.idle {
          color: #94a3b8;
          border-color: #cbd5e1;
          background: #f1f5f9;
        }
        .status-chip.working {
          color: #7c2d12;
          border-color: #fdba74;
          background: #ffedd5;
        }
        .status-chip.success {
          color: #166534;
          border-color: #86efac;
          background: #dcfce7;
        }
        .status-chip.error {
          color: #991b1b;
          border-color: #fca5a5;
          background: #fee2e2;
        }
        .status-bar.idle {
          border-color: #dbe5f1;
        }
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
          color: #f8fafc;
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .status-bar-meta {
          font-size: 0.8rem;
          color: rgba(226, 232, 240, 0.86);
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .card { padding: 18px; display: grid; gap: 10px; }
        .quick-nav { display: flex; flex-wrap: wrap; gap: 8px; }
        .quick-chip { text-decoration: none; border-radius: 10px; border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.06); color: rgba(248,250,252,0.9); padding: 8px 12px; font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
        .quick-chip.active { color: #fff; background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.38); }
        .breadcrumb { margin: 0; font-size: 0.9rem; color: rgba(226,232,240,0.9); }
        .breadcrumb a { color: rgba(226,232,240,0.9); text-decoration: none; }
        .breadcrumb a:hover { text-decoration: underline; }
        .breadcrumb .sep { color: rgba(226,232,240,0.6); margin: 0 4px; }
        .table-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; }
        .toolbar-left { display: flex; align-items: center; gap: 8px; }
        .toolbar-icon { font-size: 1.1rem; }
        .total-products { font-weight: 700; color: #fff; font-size: 0.9rem; }
        .toolbar-right { display: flex; align-items: center; gap: 10px; }
        .toolbar-icon-btn { min-width: 36px; min-height: 36px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; font-size: 1rem; cursor: pointer; }
        .toolbar-right .page-size-select { min-width: 70px; }
        .title-cell .item-icon { font-size: 1rem; margin-right: 8px; filter: hue-rotate(-20deg); }
        .pager-skuplugs { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; }
        .pager-summary { margin: 0; font-size: 0.9rem; color: rgba(226,232,240,0.9); font-weight: 600; }
        .pager-controls { display: flex; align-items: center; gap: 8px; }
        .pager-numbers { display: flex; align-items: center; gap: 4px; }
        .pager-num { min-width: 36px; min-height: 36px; padding: 0 10px; }
        .pager-num.active { background: rgba(59,130,246,0.3); border-color: rgba(59,130,246,0.6); }
        .filter-card { gap: 8px; }
        .filters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .filter-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .filter-section:last-of-type { border-bottom: none; }
        .filter-section-matrix { margin-top: 4px; }
        .filter-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          color: rgba(248,250,252,0.95);
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 0;
          text-align: left;
        }
        .filter-section-header:hover {
          color: #fff;
        }
        .filter-section-chevron {
          font-size: 0.7rem;
          opacity: 0.8;
        }
        .filter-section-hint {
          font-size: 0.78rem;
          font-weight: 400;
          color: rgba(226,232,240,0.6);
          margin-left: 4px;
        }
        .filter-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }
        .filter-row-matrix {
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        }
        .filter-row-actions { margin-top: 4px; }
        .filter-actions-global { margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; }
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
        .parent-table td:nth-child(10),
        .parent-table th:nth-child(11),
        .parent-table td:nth-child(11) { text-align: center !important; }
        th { font-size: .76rem; color: rgba(226,232,240,.75); }
        .picture-header-cell { font-weight: 700; }
        .channels-cell { vertical-align: middle; text-align: center !important; }
        .channels-badge {
          background: rgba(125, 211, 252, 0.15);
          border: 1px solid rgba(125, 211, 252, 0.35);
          color: #bae6fd;
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 6px;
          cursor: pointer;
          white-space: nowrap;
        }
        .channels-badge:hover { background: rgba(125, 211, 252, 0.25); }
        .channels-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          z-index: 120;
          min-width: 220px;
          overflow-y: visible;
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 10px;
          padding: 6px 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .channels-dd-loading {
          padding: 8px 12px;
          margin: 0;
          font-size: 0.8rem;
          color: rgba(226,232,240,0.7);
          font-style: italic;
        }
        .channels-dd-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px;
          font-size: 0.8rem;
          color: #f1f5f9;
          cursor: pointer;
          white-space: nowrap;
        }
        .channels-dd-item:hover { background: rgba(255,255,255,0.06); }
        .channels-dd-all { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 2px; font-weight: 600; }
        .channels-dd-item input[type="checkbox"] { width: 15px; height: 15px; accent-color: #22c55e; cursor: pointer; }
        .channels-dd-divider { height: 1px; background: rgba(255,255,255,0.12); margin: 6px 0; }
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
        .details-cell { text-align: center !important; vertical-align: middle; padding-top: 0 !important; padding-bottom: 0 !important; }
        .eye-cell { text-align: center !important; vertical-align: middle; padding: 0 !important; }
        .details-parent-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
          margin: 0 auto;
        }
        .details-toggle-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          line-height: 1;
          flex-shrink: 0;
        }
        .eye-symbol { width: 18px; height: 18px; display: block; }
        .details-availability-inline {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          overflow: hidden;
          max-width: 70px;
          max-height: 70px;
        }
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
        .sync-badge-img { max-height: 70px; max-width: 70px; height: 70px; width: 70px; object-fit: contain; vertical-align: middle; display: inline-block; flex-shrink: 0; }
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
        .push-dialog {
          cursor: default;
          background: #1e293b;
          border-radius: 14px;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
          max-width: min(520px, 94vw);
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .push-dialog-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }
        .push-dialog-head h3 {
          margin: 0;
          font-size: 1.05rem;
        }
        .push-dialog-note {
          margin: 0;
          padding: 12px 20px 0;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.84rem;
          line-height: 1.4;
        }
        .push-dialog-body {
          overflow-y: auto;
          padding: 12px 20px;
          display: grid;
          gap: 8px;
        }
        .push-dialog-section {
          display: grid;
          gap: 2px;
        }
        .push-dialog-selectall,
        .push-dialog-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.88rem;
          transition: background 0.15s;
        }
        .push-dialog-selectall {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 10px;
          margin-bottom: 4px;
        }
        .push-dialog-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .push-dialog-app {
          color: rgba(226, 232, 240, 0.55);
          font-size: 0.78rem;
          margin-left: auto;
        }
        .push-dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          flex-shrink: 0;
        }
        .push-dialog :global(input[type="checkbox"]) {
          width: 17px;
          height: 17px;
          min-height: 17px;
          border-radius: 4px;
          accent-color: #22c55e;
          cursor: pointer;
          flex-shrink: 0;
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
          .page { padding-top: 134px; }
          .card { padding: 14px; }
        }
        @media (max-width: 900px) {
          .page { padding-top: 146px; }
        }
        @media (max-width: 640px) {
          .actions-row :global(.btn-base) { flex: 1 1 auto; }
          .pager span { font-size: 0.95rem; }
          .sync-badge-img { max-height: 50px; max-width: 50px; height: 50px; width: 50px; }
          .details-availability-inline { max-width: 50px; max-height: 50px; }
        }
      `}</style>
    </main>
  );
}
