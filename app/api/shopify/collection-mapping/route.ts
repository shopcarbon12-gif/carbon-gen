import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getShopifyAdminToken,
  getShopifyConfig,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import {
  getMostRecentInstalledShop,
  getShopifyAccessToken,
} from "@/lib/shopifyTokenRepository";
import {
  type CollectionOption,
  type ProductActionStatus,
  type LiveMenuNodeInput,
  type MappingAuditLogRow,
  type MenuNodeRecord,
  getDefaultMenuNodes,
  listAndEnsureMenuNodes,
  listLatestProductActionStatus,
  listMappingAuditLogs,
  logMappingAudit,
  saveMenuMappings,
  logCollectionMappingAction,
  syncLiveMenuNodes,
} from "@/lib/shopifyCollectionMappingRepository";
import { computeCollectionAutoMap } from "@/lib/shopifyCollectionAutoMapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BASE_PRODUCT_QUERY = "status:active -status:unlisted published_status:published";
const MAX_PRODUCT_PAGES = 60;
const PRODUCT_PAGE_SIZE = 100;
const MAX_COLLECTION_PAGES = 20;
const COLLECTION_PAGE_SIZE = 250;
const COLLECTION_CACHE_TTL_MS = 60 * 1000;
const PRODUCT_CACHE_TTL_MS = 45 * 1000;
const TOKEN_CACHE_TTL_MS = 60 * 1000;
const MAX_MENU_DEPTH = 4;
const MAX_SHOPIFY_MENU_DEPTH = 2;
const DEFAULT_MENU_HANDLE = normalizeText(process.env.SHOPIFY_COLLECTION_MAPPING_MENU_HANDLE || "main-menu") || "main-menu";
const REQUIRED_MENU_SCOPES = ["read_online_store_navigation", "write_online_store_navigation"] as const;
const DEBUG_INGEST_ENABLED =
  normalizeLower(process.env.COLLECTION_MAPPING_DEBUG_INGEST || "") === "true";
const DEBUG_INGEST_URL = "http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const collectionsCache = new Map<string, CacheEntry<CollectionOption[]>>();
const productsCache = new Map<string, CacheEntry<ProductRow[]>>();
const tokenCache = new Map<
  string,
  CacheEntry<{ ok: true; token: string; source: "db" | "env_token" } | { ok: false; error: string }>
>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeLower(value);
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return false;
}

function parseCsvList(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((part) => normalizeText(part))
        .filter(Boolean)
    )
  );
}

function parseProductsCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object" && typeof (raw as { count?: unknown }).count === "number") {
    const count = (raw as { count: number }).count;
    if (Number.isFinite(count)) return count;
  }
  return null;
}

function formatRequiredMenuScopes() {
  return REQUIRED_MENU_SCOPES.join(", ");
}

function parseGraphErrorMessages(errors: unknown): string[] {
  if (Array.isArray(errors)) {
    return errors
      .map((row) => {
        if (typeof row === "string") return row;
        if (row && typeof row === "object" && "message" in row) {
          return normalizeText((row as { message?: unknown }).message);
        }
        return normalizeText(row);
      })
      .filter(Boolean);
  }

  if (errors && typeof errors === "object" && "message" in (errors as Record<string, unknown>)) {
    const message = normalizeText((errors as { message?: unknown }).message);
    return message ? [message] : [];
  }

  const text = normalizeText(errors);
  return text ? [text] : [];
}

function isMenusAccessDenied(errors: unknown) {
  const text = parseGraphErrorMessages(errors).join(" | ").toLowerCase();
  return (
    text.includes("access denied for menus field") ||
    (text.includes("menus") && text.includes("access_denied")) ||
    text.includes("\"path\":[\"menus\"]")
  );
}

function buildMenuScopeErrorMessage(rawError?: string) {
  const details = normalizeText(rawError);
  const scopeText = formatRequiredMenuScopes();
  return `Shopify denied menu access. Reconnect the app with scopes: ${scopeText}.${details ? ` Details: ${details}` : ""}`;
}

function isMenuScopeErrorMessage(message: unknown) {
  const text = normalizeLower(message);
  return (
    text.includes("access denied for menus field") ||
    text.includes("denied menu access") ||
    text.includes("read_online_store_navigation") ||
    text.includes("write_online_store_navigation")
  );
}

function joinWarnings(...parts: Array<unknown>) {
  const unique = new Set<string>();
  for (const part of parts) {
    const text = normalizeText(part);
    if (text) unique.add(text);
  }
  return Array.from(unique).join(" | ");
}

function debugIngest(payload: Record<string, unknown>) {
  if (!DEBUG_INGEST_ENABLED) return;
  fetch(DEBUG_INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function isModuleEnabled() {
  return normalizeLower(process.env.DISABLE_SHOPIFY_COLLECTION_MAPPING || "") !== "true";
}

async function resolveShop(rawShop: string): Promise<string> {
  const requested = normalizeShopDomain(rawShop) || "";
  if (requested) return requested;

  const envShop = normalizeShopDomain(process.env.SHOPIFY_SHOP_DOMAIN || "") || "";
  if (envShop) return envShop;

  try {
    const recent = await getMostRecentInstalledShop();
    return normalizeShopDomain(recent) || "";
  } catch {
    return "";
  }
}

async function getTokenCandidates(shop: string) {
  let dbToken = "";
  try {
    dbToken = (await getShopifyAccessToken(shop)) || "";
  } catch {
    dbToken = "";
  }

  const envToken = getShopifyAdminToken(shop);
  const out: Array<{ token: string; source: "db" | "env_token" }> = [];
  if (dbToken) out.push({ token: dbToken, source: "db" });
  if (envToken && envToken !== dbToken) out.push({ token: envToken, source: "env_token" });
  return out;
}

async function resolveWorkingToken(shop: string, apiVersion: string) {
  const cacheKey = buildShopCacheKey(shop, apiVersion);
  const cached = getCachedValue(tokenCache, cacheKey);
  if (cached) return cached;
  const candidates = await getTokenCandidates(shop);
  if (!candidates.length) {
    const out = { ok: false as const, error: "Shop not connected." };
    tokenCache.set(cacheKey, { value: out, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    return out;
  }

  let firstUsableToken: { token: string; source: "db" | "env_token" } | null = null;
  let lastError = "";
  for (const candidate of candidates) {
    const probe = await runShopifyGraphql<{ shop: { id: string } }>({
      shop,
      token: candidate.token,
      apiVersion,
      query: `query ProbeShopConnection { shop { id } }`,
    });

    if (probe.ok && probe.data?.shop?.id) {
      if (!firstUsableToken) {
        firstUsableToken = { token: candidate.token, source: candidate.source };
      }

      const menuProbe = await runShopifyGraphql<{ menus: { nodes: Array<{ id?: string }> } }>({
        shop,
        token: candidate.token,
        apiVersion,
        query: `
          query ProbeMenusScope {
            menus(first: 1) {
              nodes {
                id
              }
            }
          }
        `,
      });

      if (menuProbe.ok && menuProbe.data?.menus?.nodes) {
        const out = { ok: true as const, token: candidate.token, source: candidate.source };
        tokenCache.set(cacheKey, { value: out, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
        return out;
      }
    }

    lastError = probe.errors ? JSON.stringify(probe.errors).slice(0, 240) : "Invalid Shopify token";
  }

  if (firstUsableToken) {
    const out = { ok: true as const, token: firstUsableToken.token, source: firstUsableToken.source };
    tokenCache.set(cacheKey, { value: out, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    return out;
  }

  const out = {
    ok: false as const,
    error: `Shop token validation failed.${lastError ? ` ${lastError}` : ""}`,
  };
  tokenCache.set(cacheKey, { value: out, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  return out;
}

function buildShopCacheKey(shop: string, apiVersion: string) {
  const safeShop = normalizeShopDomain(shop) || normalizeText(shop);
  return `${safeShop}::${normalizeText(apiVersion)}`;
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const now = Date.now();
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidateShopCache<T>(cache: Map<string, CacheEntry<T>>, shop: string) {
  const safeShop = normalizeShopDomain(shop) || normalizeText(shop);
  const prefix = `${safeShop}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

type ShopifyCollectionNode = {
  id?: string;
  title?: string;
  handle?: string;
  productsCount?: number | { count?: number };
};

type GraphResult<T> = {
  ok: boolean;
  status: number;
  errors: unknown;
  data: T | null;
};

type CollectionsPageData = {
  collections: {
    edges: Array<{ node: ShopifyCollectionNode }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type CollectionsFetchResult =
  | { ok: true; collections: CollectionOption[] }
  | { ok: false; error: string };

type ProductsFetchResult =
  | { ok: true; products: ProductRow[] }
  | { ok: false; error: string };

type ProductCollectionsFetchResult =
  | { ok: true; productId: string; title: string; collectionIds: string[] }
  | { ok: false; error: string };

async function fetchAllCollections(
  shop: string,
  token: string,
  apiVersion: string
): Promise<CollectionsFetchResult> {
  const query = `
    query CollectionsPage($first: Int!, $after: String) {
      collections(first: $first, after: $after, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            productsCount {
              count
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

  let cursor: string | null = null;
  let page = 0;
  const out: CollectionOption[] = [];

  while (page < MAX_COLLECTION_PAGES) {
    const gqlResult: GraphResult<CollectionsPageData> = (await runShopifyGraphql<CollectionsPageData>(
      {
        shop,
        token,
        apiVersion,
        query,
        variables: { first: COLLECTION_PAGE_SIZE, after: cursor },
      }
    )) as GraphResult<CollectionsPageData>;

    if (!gqlResult.ok || !gqlResult.data?.collections) {
      return {
        ok: false,
        error: `Failed to load Shopify collections: ${JSON.stringify(gqlResult.errors || "unknown")}`,
      };
    }

    for (const edge of gqlResult.data.collections.edges || []) {
      const node = edge?.node || {};
      const id = normalizeText(node.id);
      if (!id) continue;
      out.push({
        id,
        title: normalizeText(node.title),
        handle: normalizeText(node.handle),
        productsCount: parseProductsCount(node.productsCount),
      });
    }

    const hasNext = Boolean(gqlResult.data.collections.pageInfo?.hasNextPage);
    const endCursor = normalizeText(gqlResult.data.collections.pageInfo?.endCursor) || null;
    page += 1;
    if (!hasNext || !endCursor) break;
    cursor = endCursor;
  }

  out.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  return { ok: true, collections: out };
}

async function fetchAllCollectionsCached(
  shop: string,
  token: string,
  apiVersion: string
): Promise<CollectionsFetchResult> {
  const cacheKey = buildShopCacheKey(shop, apiVersion);
  const cached = getCachedValue(collectionsCache, cacheKey);
  if (cached) return { ok: true, collections: cached };

  const result = await fetchAllCollections(shop, token, apiVersion);
  if ("collections" in result) {
    setCachedValue(collectionsCache, cacheKey, result.collections, COLLECTION_CACHE_TTL_MS);
  }
  return result;
}

type ShopifyProductNode = {
  id?: string;
  title?: string;
  handle?: string;
  productType?: string;
  status?: string;
  publishedAt?: string | null;
  updatedAt?: string;
  featuredImage?: { url?: string | null } | null;
  variants?: { nodes?: Array<{ id?: string; sku?: string | null; barcode?: string | null }> };
  collections?: { nodes?: Array<{ id?: string; title?: string; handle?: string }> };
};

type ProductsPageData = {
  products: {
    edges: Array<{ node: ShopifyProductNode }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type ProductRow = {
  id: string;
  title: string;
  handle: string;
  itemType: string;
  updatedAt: string;
  image: string | null;
  sku: string;
  upc: string;
  collectionIds: string[];
};

type ShopifyMenuItemNode = {
  id?: string;
  title?: string;
  type?: string;
  url?: string | null;
  resourceId?: string | null;
  tags?: string[] | null;
  items?: ShopifyMenuItemNode[];
};

type ShopifyMenuNode = {
  id?: string;
  title?: string;
  handle?: string;
  isDefault?: boolean;
  items?: ShopifyMenuItemNode[];
};

type MenusQueryData = {
  menus: {
    nodes: ShopifyMenuNode[];
  };
};

type MenuUpdateData = {
  menuUpdate: {
    menu: ShopifyMenuNode | null;
    userErrors: Array<{ field?: string[]; message?: string }>;
  };
};

type MenuFetchResult =
  | {
      ok: true;
      menuId: string;
      menuHandle: string;
      menuTitle: string;
      items: ShopifyMenuItemNode[];
      liveNodes: LiveMenuNodeInput[];
    }
  | { ok: false; error: string };

type MenuUpdateResult =
  | {
      ok: true;
      menuId: string;
      menuHandle: string;
      menuTitle: string;
      items: ShopifyMenuItemNode[];
      liveNodes: LiveMenuNodeInput[];
    }
  | { ok: false; error: string };

type MenuMutationItemInput = {
  id?: string;
  title: string;
  type: string;
  url?: string | null;
  resourceId?: string | null;
  tags?: string[];
  items?: MenuMutationItemInput[];
};

type MenuNodeIndex = {
  node: ShopifyMenuItemNode;
  parentKey: string | null;
  depth: number;
  siblingIndex: number;
};

type LinkTargetOption = {
  id: string;
  title: string;
  handle: string;
  url: string;
};

type MenuLinkTargets = {
  collections: LinkTargetOption[];
  pages: LinkTargetOption[];
  products: LinkTargetOption[];
  blogs: LinkTargetOption[];
};

type MenuLinkRecord = {
  nodeKey: string;
  type: string;
  url: string | null;
  resourceId: string | null;
};

type NodeLinkedTargetMeta = {
  linkedTargetType: string;
  linkedTargetLabel: string;
  linkedTargetResourceId: string | null;
  linkedTargetUrl: string | null;
};

type ResolvableLinkType = "COLLECTION" | "PAGE" | "PRODUCT" | "BLOG";

type MenuLinkTargetsQueryData = {
  pages?: {
    nodes?: Array<{ id?: string; title?: string; handle?: string }>;
  };
  products?: {
    nodes?: Array<{ id?: string; title?: string; handle?: string }>;
  };
  blogs?: {
    nodes?: Array<{ id?: string; title?: string; handle?: string }>;
  };
};

function getFirstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return "";
}

function transformProductNode(node: ShopifyProductNode): ProductRow | null {
  const status = normalizeLower(node.status);
  const publishedAt = normalizeText(node.publishedAt);
  if (status !== "active" || !publishedAt) return null;

  const id = normalizeText(node.id);
  if (!id) return null;

  const variants = Array.isArray(node.variants?.nodes) ? node.variants!.nodes! : [];
  const sku = getFirstNonEmpty(variants.map((variant) => variant?.sku));
  const upc = getFirstNonEmpty(variants.map((variant) => variant?.barcode));

  const collectionIds = Array.from(
    new Set(
      (Array.isArray(node.collections?.nodes) ? node.collections!.nodes! : [])
        .map((collection) => normalizeText(collection.id))
        .filter(Boolean)
    )
  );

  return {
    id,
    title: normalizeText(node.title),
    handle: normalizeText(node.handle),
    itemType: normalizeText(node.productType),
    updatedAt: normalizeText(node.updatedAt),
    image: normalizeText(node.featuredImage?.url) || null,
    sku,
    upc,
    collectionIds,
  };
}

async function fetchAllProducts(
  shop: string,
  token: string,
  apiVersion: string
): Promise<ProductsFetchResult> {
  const query = `
    query ProductsPage($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query, sortKey: TITLE) {
        edges {
          node {
            id
            title
            handle
            productType
            status
            publishedAt
            updatedAt
            featuredImage {
              url
            }
            variants(first: 50) {
              nodes {
                id
                sku
                barcode
              }
            }
            collections(first: 100) {
              nodes {
                id
                title
                handle
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

  let cursor: string | null = null;
  let page = 0;
  const out: ProductRow[] = [];

  while (page < MAX_PRODUCT_PAGES) {
    const gqlResult: GraphResult<ProductsPageData> = (await runShopifyGraphql<ProductsPageData>({
      shop,
      token,
      apiVersion,
      query,
      variables: {
        first: PRODUCT_PAGE_SIZE,
        after: cursor,
        query: BASE_PRODUCT_QUERY,
      },
    })) as GraphResult<ProductsPageData>;

    if (!gqlResult.ok || !gqlResult.data?.products) {
      return {
        ok: false,
        error: `Failed to load Shopify products: ${JSON.stringify(gqlResult.errors || "unknown")}`,
      };
    }

    for (const edge of gqlResult.data.products.edges || []) {
      const row = transformProductNode(edge?.node || {});
      if (row) out.push(row);
    }

    const hasNext = Boolean(gqlResult.data.products.pageInfo?.hasNextPage);
    const endCursor = normalizeText(gqlResult.data.products.pageInfo?.endCursor) || null;
    page += 1;
    if (!hasNext || !endCursor) break;
    cursor = endCursor;
  }

  return { ok: true, products: out };
}

async function fetchAllProductsCached(
  shop: string,
  token: string,
  apiVersion: string
): Promise<ProductsFetchResult> {
  const cacheKey = buildShopCacheKey(shop, apiVersion);
  const cached = getCachedValue(productsCache, cacheKey);
  if (cached) return { ok: true, products: cached };

  const result = await fetchAllProducts(shop, token, apiVersion);
  if ("products" in result) {
    setCachedValue(productsCache, cacheKey, result.products, PRODUCT_CACHE_TTL_MS);
  }
  return result;
}

type ProductFilters = {
  q: string;
  title: string;
  sku: string;
  upc: string;
  itemType: string;
  selectedItemTypes: string[];
};

function productMatchesFilters(row: ProductRow, filters: ProductFilters) {
  const haystack = [
    normalizeLower(row.title),
    normalizeLower(row.handle),
    normalizeLower(row.sku),
    normalizeLower(row.upc),
    normalizeLower(row.itemType),
  ];

  const q = normalizeLower(filters.q);
  if (q && !haystack.some((value) => value.includes(q))) return false;

  const title = normalizeLower(filters.title);
  if (title && !normalizeLower(row.title).includes(title)) return false;

  const sku = normalizeLower(filters.sku);
  if (sku && !normalizeLower(row.sku).includes(sku)) return false;

  const upc = normalizeLower(filters.upc);
  if (upc && !normalizeLower(row.upc).includes(upc)) return false;

  const itemType = normalizeLower(filters.itemType);
  if (itemType && !normalizeLower(row.itemType).includes(itemType)) return false;

  if (filters.selectedItemTypes.length > 0) {
    const selected = new Set(filters.selectedItemTypes.map((value) => normalizeLower(value)).filter(Boolean));
    if (selected.size > 0 && !selected.has(normalizeLower(row.itemType))) return false;
  }

  return true;
}

type SortField = "title" | "upc" | "sku" | "itemType" | "updatedAt";
type SortDir = "asc" | "desc";
type UncheckPolicy = "keep-descendants" | "remove-descendants";

function compareRows(left: ProductRow, right: ProductRow, field: SortField) {
  switch (field) {
    case "upc":
      return normalizeText(left.upc).localeCompare(normalizeText(right.upc), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    case "sku":
      return normalizeText(left.sku).localeCompare(normalizeText(right.sku), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    case "itemType":
      return normalizeText(left.itemType).localeCompare(normalizeText(right.itemType), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    case "updatedAt": {
      const a = Date.parse(left.updatedAt || "") || 0;
      const b = Date.parse(right.updatedAt || "") || 0;
      return a - b;
    }
    case "title":
    default:
      return normalizeText(left.title).localeCompare(normalizeText(right.title), undefined, {
        numeric: true,
        sensitivity: "base",
      });
  }
}

function toSortField(value: string): SortField {
  const normalized = normalizeText(value);
  if (normalized === "upc") return "upc";
  if (normalized === "sku") return "sku";
  if (normalized === "itemType") return "itemType";
  if (normalized === "updatedAt") return "updatedAt";
  return "title";
}

function toSortDir(value: string): SortDir {
  return normalizeLower(value) === "desc" ? "desc" : "asc";
}

function toUncheckPolicy(value: unknown): UncheckPolicy {
  const normalized = normalizeLower(value);
  if (normalized === "remove-descendants" || normalized === "remove_descendants") {
    return "remove-descendants";
  }
  return "keep-descendants";
}

function toProductGid(value: string) {
  const id = normalizeText(value);
  if (!id) return "";
  if (id.startsWith("gid://")) return id;
  if (/^\d+$/.test(id)) return `gid://shopify/Product/${id}`;
  return id;
}

function buildParentMap(nodes: MenuNodeRecord[]) {
  const map = new Map<string, string | null>();
  for (const node of nodes) {
    map.set(node.nodeKey, node.parentKey || null);
  }
  return map;
}

function buildChildrenMap(nodes: MenuNodeRecord[]) {
  const map = new Map<string, string[]>();
  for (const node of nodes) {
    const parentKey = normalizeText(node.parentKey);
    if (!parentKey) continue;
    const current = map.get(parentKey) || [];
    current.push(node.nodeKey);
    map.set(parentKey, current);
  }
  return map;
}

function collectAncestors(nodeKey: string, parentMap: Map<string, string | null>) {
  const ancestors: string[] = [];
  let current = parentMap.get(nodeKey) || null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    ancestors.push(current);
    seen.add(current);
    current = parentMap.get(current) || null;
  }
  return ancestors;
}

function collectDescendants(nodeKey: string, childrenMap: Map<string, string[]>) {
  const out: string[] = [];
  const queue = [...(childrenMap.get(nodeKey) || [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    const children = childrenMap.get(next) || [];
    for (const child of children) queue.push(child);
  }
  return out;
}

function enforceAncestorClosure(selected: Set<string>, parentMap: Map<string, string | null>) {
  const out = new Set<string>(selected);
  for (const key of Array.from(out)) {
    for (const ancestor of collectAncestors(key, parentMap)) {
      out.add(ancestor);
    }
  }
  return out;
}

function sanitizeMenuItemTree(items: ShopifyMenuItemNode[]): ShopifyMenuItemNode[] {
  return (Array.isArray(items) ? items : [])
    .map((row) => ({
      id: normalizeText(row.id),
      title: normalizeText(row.title),
      type: normalizeText(row.type).toUpperCase(),
      url: normalizeText(row.url) || null,
      resourceId: normalizeText(row.resourceId) || null,
      tags: Array.isArray(row.tags) ? row.tags.map((tag) => normalizeText(tag)).filter(Boolean) : [],
      items: sanitizeMenuItemTree(Array.isArray(row.items) ? row.items : []),
    }))
    .filter((row) => row.id || row.title);
}

function inferCollectionHandleFromUrl(url: string | null | undefined) {
  const raw = normalizeText(url);
  if (!raw) return "";
  const match = raw.match(/\/collections\/([^/?#]+)/i);
  return match ? normalizeText(match[1]).toLowerCase() : "";
}

function inferCollectionHintFromMenuItem(item: ShopifyMenuItemNode) {
  const resourceId = normalizeText(item.resourceId);
  if (resourceId && resourceId.includes("gid://shopify/Collection/")) return resourceId;
  return "";
}

function flattenMenuItemsToLiveNodes(items: ShopifyMenuItemNode[]) {
  const out: LiveMenuNodeInput[] = [];
  let order = 0;

  const walk = (rows: ShopifyMenuItemNode[], parentKey: string | null, depth: number) => {
    for (const row of rows) {
      const nodeKey = normalizeText(row.id);
      const label = normalizeText(row.title);
      if (!nodeKey || !label) continue;
      order += 1;
      out.push({
        nodeKey,
        label,
        parentKey,
        depth,
        sortOrder: order,
        collectionIdHint: inferCollectionHintFromMenuItem(row) || null,
        defaultCollectionHandle: inferCollectionHandleFromUrl(row.url) || null,
      });
      walk(Array.isArray(row.items) ? row.items : [], nodeKey, depth + 1);
    }
  };

  walk(sanitizeMenuItemTree(items), null, 0);
  return out;
}

function buildMenuTreeFromSeed(collections: CollectionOption[]): ShopifyMenuItemNode[] {
  const seed = getDefaultMenuNodes();
  const byHandle = new Map<string, CollectionOption>();
  for (const c of collections) {
    const h = normalizeText(c.handle).toLowerCase();
    if (h) byHandle.set(h, c);
  }

  function toItem(seedRow: (typeof seed)[0]): ShopifyMenuItemNode {
    const defaultUrl = normalizeText((seedRow as { defaultUrl?: string }).defaultUrl);
    const collection = seedRow.defaultCollectionHandle
      ? byHandle.get(normalizeText(seedRow.defaultCollectionHandle).toLowerCase())
      : undefined;
    const children = seed
      .filter((s) => s.parentKey === seedRow.key)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .map(toItem);
    const url = defaultUrl
      ? (defaultUrl.startsWith("/") ? defaultUrl : `/${defaultUrl}`)
      : collection?.handle
        ? `/collections/${collection.handle}`
        : "/collections/all";
    return {
      title: seedRow.label,
      type: collection ? "COLLECTION" : "HTTP",
      resourceId: collection?.id || null,
      url,
      items: children.length > 0 ? children : undefined,
    };
  }

  const roots = seed.filter((s) => !s.parentKey).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return roots.map(toItem);
}

function findMenuNodeIndex(items: ShopifyMenuItemNode[]) {
  const map = new Map<string, MenuNodeIndex>();

  const walk = (rows: ShopifyMenuItemNode[], parentKey: string | null, depth: number) => {
    rows.forEach((row, index) => {
      const key = normalizeText(row.id);
      if (!key) return;
      map.set(key, { node: row, parentKey, depth, siblingIndex: index });
      walk(Array.isArray(row.items) ? row.items : [], key, depth + 1);
    });
  };

  walk(items, null, 0);
  return map;
}

function buildVisibleMenuItemsFromNodes(
  sourceItems: ShopifyMenuItemNode[],
  nodes: MenuNodeRecord[],
  collections: CollectionOption[]
) {
  const sourceIndex = findMenuNodeIndex(sourceItems);
  const byId = new Map<string, CollectionOption>();
  const byHandle = new Map<string, CollectionOption>();
  for (const row of collections) {
    const id = normalizeText(row.id);
    if (id) byId.set(id, row);
    const handle = normalizeText(row.handle).toLowerCase();
    if (handle) byHandle.set(handle, row);
  }

  const enabledNodes = nodes.filter((row) => row.enabled);
  const childrenByParent = new Map<string, MenuNodeRecord[]>();
  for (const row of enabledNodes) {
    const parentKey = normalizeText(row.parentKey) || "__root__";
    const current = childrenByParent.get(parentKey) || [];
    current.push(row);
    childrenByParent.set(parentKey, current);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => {
      const aSource = sourceIndex.get(normalizeText(a.nodeKey));
      const bSource = sourceIndex.get(normalizeText(b.nodeKey));
      const aHasSource = Boolean(aSource);
      const bHasSource = Boolean(bSource);
      if (aHasSource && bHasSource && aSource && bSource) {
        if (aSource.siblingIndex !== bSource.siblingIndex) {
          return aSource.siblingIndex - bSource.siblingIndex;
        }
      }
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return normalizeText(a.nodeKey).localeCompare(normalizeText(b.nodeKey));
    });
  }

  const buildNode = (row: MenuNodeRecord): ShopifyMenuItemNode => {
    const existing = sourceIndex.get(normalizeText(row.nodeKey))?.node;
    const children = (childrenByParent.get(normalizeText(row.nodeKey)) || []).map((child) => buildNode(child));
    if (existing) {
      return {
        ...existing,
        title: normalizeText(row.label) || normalizeText(existing.title) || "Untitled",
        items: children,
      };
    }

    const collectionId = normalizeText(row.collectionId);
    const collectionFromId = collectionId ? byId.get(collectionId) : undefined;
    const handleHint = normalizeText(row.defaultCollectionHandle).toLowerCase();
    const collectionFromHandle = !collectionFromId && handleHint ? byHandle.get(handleHint) : undefined;
    const collection = collectionFromId || collectionFromHandle || null;

    if (collection) {
      return {
        title: normalizeText(row.label) || "Untitled",
        type: "COLLECTION",
        resourceId: normalizeText(collection.id) || null,
        url: collection.handle ? `/collections/${collection.handle}` : "/collections/all",
        items: children,
      };
    }

    const fallbackHandle = normalizeText(row.defaultCollectionHandle);
    const fallbackUrl = fallbackHandle ? `/collections/${fallbackHandle}` : "/";
    return {
      title: normalizeText(row.label) || "Untitled",
      type: "HTTP",
      resourceId: null,
      url: fallbackUrl,
      items: children,
    };
  };

  const roots = childrenByParent.get("__root__") || [];
  return roots.map((row) => buildNode(row));
}

function collectMenuDescendantKeys(node: ShopifyMenuItemNode) {
  const out = new Set<string>();
  const queue = [...(Array.isArray(node.items) ? node.items : [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const key = normalizeText(current.id);
    if (key) out.add(key);
    const children = Array.isArray(current.items) ? current.items : [];
    for (const child of children) queue.push(child);
  }
  return out;
}

function stripItemForMutation(item: ShopifyMenuItemNode): MenuMutationItemInput {
  const type = normalizeText(item.type).toUpperCase() || "HTTP";
  const out: MenuMutationItemInput = {
    id: normalizeText(item.id) || undefined,
    title: normalizeText(item.title) || "Untitled",
    type,
    items: (Array.isArray(item.items) ? item.items : []).map((child) => stripItemForMutation(child)),
  };
  const url = normalizeText(item.url);
  if (url) out.url = url;
  const resourceId = normalizeText(item.resourceId);
  if (resourceId) out.resourceId = resourceId;
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => normalizeText(tag)).filter(Boolean) : [];
  if (tags.length > 0) out.tags = tags;
  return out;
}

function updateItemCollectionLink(item: ShopifyMenuItemNode, collection: CollectionOption | null) {
  if (collection) {
    item.type = "COLLECTION";
    item.resourceId = normalizeText(collection.id) || null;
    item.url = collection.handle ? `/collections/${collection.handle}` : item.url || "/collections/all";
    return;
  }

  item.resourceId = null;
  item.type = normalizeText(item.type).toUpperCase() === "COLLECTION" ? "HTTP" : normalizeText(item.type).toUpperCase() || "HTTP";
  item.url = normalizeText(item.url) || "/collections/all";
}

function normalizeHttpLink(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.startsWith("/") || text.startsWith("#")) return text;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(text)) return text;
  return `/${text.replace(/^\/+/, "")}`;
}

function sortLinkTargets(rows: LinkTargetOption[]) {
  return [...rows].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

function toCollectionLinkTargets(collections: CollectionOption[]) {
  return sortLinkTargets(
    collections
      .map((collection) => {
        const id = normalizeText(collection.id);
        if (!id) return null;
        const handle = normalizeText(collection.handle);
        return {
          id,
          title: normalizeText(collection.title) || handle || id,
          handle,
          url: handle ? `/collections/${handle}` : "/collections/all",
        } satisfies LinkTargetOption;
      })
      .filter((row): row is LinkTargetOption => Boolean(row))
  );
}

function toEntityLinkTargets(
  rows: Array<{ id?: string; title?: string; handle?: string }> | undefined,
  urlPrefix: string
) {
  return sortLinkTargets(
    (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const id = normalizeText(row?.id);
        if (!id) return null;
        const handle = normalizeText(row?.handle);
        return {
          id,
          title: normalizeText(row?.title) || handle || id,
          handle,
          url: handle ? `${urlPrefix}${handle}` : "",
        } satisfies LinkTargetOption;
      })
      .filter((row): row is LinkTargetOption => Boolean(row))
  );
}

function buildMenuLinkTargetsWarning(errors: unknown) {
  const messages = parseGraphErrorMessages(errors);
  const merged = messages.join(" | ").toLowerCase();
  const blocked: string[] = [];
  if (merged.includes("access denied for pages field")) blocked.push("pages");
  if (merged.includes("access denied for products field")) blocked.push("products");
  if (merged.includes("access denied for blogs field")) blocked.push("blogs");

  if (blocked.length > 0) {
    const remaining = messages.filter((message) => {
      const lower = message.toLowerCase();
      return !(
        lower.includes("access denied for pages field") ||
        lower.includes("access denied for products field") ||
        lower.includes("access denied for blogs field")
      );
    });
    if (remaining.length < 1) return "";
    return `Some menu link targets are unavailable: ${remaining[0]}`;
  }

  const first = messages[0] || "";
  return first
    ? `Some menu link targets are unavailable: ${first}`
    : "Some menu link targets are unavailable.";
}

async function fetchMenuLinkTargets(
  shop: string,
  token: string,
  apiVersion: string,
  collections: CollectionOption[]
) {
  const fallback: MenuLinkTargets = {
    collections: toCollectionLinkTargets(collections),
    pages: [],
    products: [],
    blogs: [],
  };

  const query = `
    query CollectionMappingMenuLinkTargets($pageFirst: Int!, $productFirst: Int!, $blogFirst: Int!) {
      pages(first: $pageFirst, sortKey: TITLE) {
        nodes {
          id
          title
          handle
        }
      }
      products(first: $productFirst, sortKey: TITLE, query: "status:active") {
        nodes {
          id
          title
          handle
        }
      }
      blogs(first: $blogFirst) {
        nodes {
          id
          title
          handle
        }
      }
    }
  `;

  const gqlResult: GraphResult<MenuLinkTargetsQueryData> = (await runShopifyGraphql<MenuLinkTargetsQueryData>({
    shop,
    token,
    apiVersion,
    query,
    variables: { pageFirst: 250, productFirst: 250, blogFirst: 100 },
  })) as GraphResult<MenuLinkTargetsQueryData>;

  if (!gqlResult.ok || !gqlResult.data) {
    return {
      targets: fallback,
      warning: buildMenuLinkTargetsWarning(gqlResult.errors),
    };
  }

  return {
    targets: {
      collections: fallback.collections,
      pages: toEntityLinkTargets(gqlResult.data.pages?.nodes, "/pages/"),
      products: toEntityLinkTargets(gqlResult.data.products?.nodes, "/products/"),
      blogs: toEntityLinkTargets(gqlResult.data.blogs?.nodes, "/blogs/"),
    } satisfies MenuLinkTargets,
    warning: "",
  };
}

function flattenMenuLinks(items: ShopifyMenuItemNode[]) {
  const out: MenuLinkRecord[] = [];
  const walk = (rows: ShopifyMenuItemNode[]) => {
    for (const row of rows) {
      const nodeKey = normalizeText(row.id);
      if (!nodeKey) continue;
      out.push({
        nodeKey,
        type: normalizeText(row.type).toUpperCase() || "HTTP",
        url: normalizeText(row.url) || null,
        resourceId: normalizeText(row.resourceId) || null,
      });
      walk(Array.isArray(row.items) ? row.items : []);
    }
  };
  walk(sanitizeMenuItemTree(items));
  return out;
}

function buildLinkTargetIndexes(targets: MenuLinkTargets, collections: CollectionOption[]) {
  return {
    collectionsById: new Map(collections.map((row) => [normalizeText(row.id), row])),
    pagesById: new Map(targets.pages.map((row) => [normalizeText(row.id), row])),
    productsById: new Map(targets.products.map((row) => [normalizeText(row.id), row])),
    blogsById: new Map(targets.blogs.map((row) => [normalizeText(row.id), row])),
  };
}

function toPageFileNameFromPath(raw: string) {
  const value = normalizeText(raw);
  if (!value) return "";
  const normalizedPath = value
    .replace(/^[a-z][a-z0-9+\-.]*:\/\/[^/]+/i, "")
    .split(/[?#]/)[0]
    .trim();
  const segment = normalizedPath
    .split("/")
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .pop();
  if (!segment) return "";
  const base = segment.replace(/\.html?$/i, "").trim().toLowerCase();
  if (!base) return "";
  return `${base}.html`;
}

function toPageFileNameFromQuery(raw: string) {
  const value = normalizeText(raw);
  if (!value || !value.includes("?")) return "";
  const queryText = value.split("?")[1] || "";
  const params = new URLSearchParams(queryText);
  const viewValue = normalizeText(params.get("view") || params.get("page") || params.get("template") || "");
  if (!viewValue) return "";
  return toPageFileNameFromTitle(viewValue) || toPageFileNameFromPath(viewValue);
}

function toPageFileNameFromTitle(raw: string) {
  const value = normalizeText(raw).toLowerCase();
  if (!value) return "";
  const slug = value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return "";
  return `${slug}.html`;
}

function resolvePageDisplayLabel(params: {
  handle?: string;
  title?: string;
  url?: string;
}) {
  const fromQuery = toPageFileNameFromQuery(params.url || "");
  if (fromQuery) return fromQuery;
  const fromHandle = toPageFileNameFromPath(params.handle || "");
  if (fromHandle) return fromHandle;
  const fromUrl = toPageFileNameFromPath(params.url || "");
  if (fromUrl) return fromUrl;
  const fromTitle = toPageFileNameFromTitle(params.title || "");
  if (fromTitle) return fromTitle;
  return "page.html";
}

function resolveNodeLinkedTargetMeta(
  link: MenuLinkRecord | undefined,
  targetIndexes: ReturnType<typeof buildLinkTargetIndexes>
): NodeLinkedTargetMeta {
  if (!link) {
    return {
      linkedTargetType: "UNLINKED",
      linkedTargetLabel: "No target linked",
      linkedTargetResourceId: null,
      linkedTargetUrl: null,
    };
  }

  const type = normalizeText(link.type).toUpperCase() || "UNLINKED";
  const resourceId = normalizeText(link.resourceId);
  const url = normalizeText(link.url);

  if (type === "COLLECTION") {
    const collection = resourceId ? targetIndexes.collectionsById.get(resourceId) : undefined;
    const title = normalizeText(collection?.title);
    return {
      linkedTargetType: "COLLECTION",
      linkedTargetLabel: title || url || "Collection link",
      linkedTargetResourceId: resourceId || null,
      linkedTargetUrl: url || null,
    };
  }

  if (type === "PAGE") {
    const page = resourceId ? targetIndexes.pagesById.get(resourceId) : undefined;
    const title = normalizeText(page?.title);
    const handle = normalizeText(page?.handle);
    return {
      linkedTargetType: "PAGE",
      linkedTargetLabel: resolvePageDisplayLabel({ handle, title, url }),
      linkedTargetResourceId: resourceId || null,
      linkedTargetUrl: url || null,
    };
  }

  if (type === "PRODUCT") {
    const product = resourceId ? targetIndexes.productsById.get(resourceId) : undefined;
    const title = normalizeText(product?.title);
    return {
      linkedTargetType: "PRODUCT",
      linkedTargetLabel: title || url || "Product link",
      linkedTargetResourceId: resourceId || null,
      linkedTargetUrl: url || null,
    };
  }

  if (type === "BLOG") {
    const blog = resourceId ? targetIndexes.blogsById.get(resourceId) : undefined;
    const title = normalizeText(blog?.title);
    return {
      linkedTargetType: "BLOG",
      linkedTargetLabel: title || url || "Blog link",
      linkedTargetResourceId: resourceId || null,
      linkedTargetUrl: url || null,
    };
  }

  if (type === "FRONTPAGE") {
    return {
      linkedTargetType: "FRONTPAGE",
      linkedTargetLabel: "Homepage",
      linkedTargetResourceId: resourceId || null,
      linkedTargetUrl: url || "/",
    };
  }

  if (type === "SEARCH") {
    return {
      linkedTargetType: "SEARCH",
      linkedTargetLabel: "Search page",
      linkedTargetResourceId: resourceId || null,
      linkedTargetUrl: url || "/search",
    };
  }

  return {
    linkedTargetType: type,
    linkedTargetLabel:
      type === "HTTP" && /(^|\/)pages(\/|$)/i.test(url)
        ? resolvePageDisplayLabel({ url })
        : url || "Custom URL",
    linkedTargetResourceId: resourceId || null,
    linkedTargetUrl: url || null,
  };
}

function applyMenuNodeLink(
  item: ShopifyMenuItemNode,
  linkTypeRaw: unknown,
  linkTargetIdRaw: unknown,
  linkUrlRaw: unknown,
  collections: CollectionOption[],
  linkTargets: MenuLinkTargets
): { ok: true } | { ok: false; error: string } {
  const linkType = normalizeText(linkTypeRaw).toUpperCase() || "HTTP";
  const targetId = normalizeText(linkTargetIdRaw);
  const linkUrl = normalizeHttpLink(linkUrlRaw);
  item.tags = [];

  if (linkType === "COLLECTION") {
    const collection = collections.find((row) => normalizeText(row.id) === targetId) || null;
    if (!collection) return { ok: false, error: "Collection target was not found." };
    updateItemCollectionLink(item, collection);
    return { ok: true };
  }

  if (linkType === "PAGE" || linkType === "PRODUCT" || linkType === "BLOG") {
    if (!targetId) return { ok: false, error: `${linkType} target is required.` };
    const source =
      linkType === "PAGE" ? linkTargets.pages : linkType === "PRODUCT" ? linkTargets.products : linkTargets.blogs;
    const target = source.find((row) => normalizeText(row.id) === targetId) || null;
    if (!target) return { ok: false, error: `${linkType} target was not found.` };
    item.type = linkType;
    item.resourceId = target.id;
    item.url = target.url || normalizeText(item.url) || null;
    return { ok: true };
  }

  if (linkType === "FRONTPAGE") {
    item.type = "FRONTPAGE";
    item.resourceId = null;
    item.url = "/";
    return { ok: true };
  }

  if (linkType === "SEARCH") {
    item.type = "SEARCH";
    item.resourceId = null;
    item.url = "/search";
    return { ok: true };
  }

  if (linkType === "HTTP" || linkType === "URL") {
    if (!linkUrl) return { ok: false, error: "URL link requires a valid URL." };
    item.type = "HTTP";
    item.resourceId = null;
    item.url = linkUrl;
    return { ok: true };
  }

  return { ok: false, error: `Unsupported link type "${linkType || "unknown"}".` };
}

function normalizeMenuLinkTypeInput(value: unknown) {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "COLLECTION") return "COLLECTION";
  if (normalized === "PRODUCT") return "PRODUCT";
  if (normalized === "PAGE") return "PAGE";
  if (normalized === "BLOG") return "BLOG";
  if (normalized === "FRONTPAGE") return "FRONTPAGE";
  if (normalized === "HTTP" || normalized === "URL" || normalized === "WEB URL" || normalized === "WEB_URL") {
    return "HTTP";
  }
  return "HTTP";
}

function normalizeUrlPathForLookup(value: string) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (raw.startsWith("/")) return raw.toLowerCase();
  if (/^[a-z][a-z0-9+\-.]*:/i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return normalizeText(parsed.pathname).toLowerCase();
    } catch {
      return "";
    }
  }
  return `/${raw.replace(/^\/+/, "").toLowerCase()}`;
}

function toResourceGid(raw: string, entity: ResolvableLinkType) {
  const value = normalizeText(raw);
  if (!value) return "";
  if (value.startsWith("gid://")) return value;
  if (!/^\d+$/.test(value)) return "";
  if (entity === "COLLECTION") return `gid://shopify/Collection/${value}`;
  if (entity === "PAGE") return `gid://shopify/OnlineStorePage/${value}`;
  if (entity === "PRODUCT") return `gid://shopify/Product/${value}`;
  return `gid://shopify/Blog/${value}`;
}

function resolveTargetIdFromValue(
  candidates: LinkTargetOption[],
  valueRaw: unknown,
  entity: ResolvableLinkType
) {
  const value = normalizeText(valueRaw);
  if (!value) return "";
  const lowerValue = value.toLowerCase();
  const pathValue = normalizeUrlPathForLookup(value);
  const slugCandidate = (
    lowerValue
      .replace(/^[a-z][a-z0-9+\-.]*:\/\/[^/]+/i, "")
      .split(/[?#]/)[0]
      .split("/")
      .filter(Boolean)
      .pop() || lowerValue
  ).trim();

  const asGid = toResourceGid(value, entity);
  if (asGid) {
    const byGid = candidates.find((row) => normalizeText(row.id) === asGid);
    if (byGid) return byGid.id;
  }

  const byId = candidates.find((row) => normalizeText(row.id).toLowerCase() === lowerValue);
  if (byId) return byId.id;

  const byHandle = candidates.find((row) => normalizeText(row.handle).toLowerCase() === lowerValue);
  if (byHandle) return byHandle.id;

  const bySlugHandle = candidates.find((row) => normalizeText(row.handle).toLowerCase() === slugCandidate);
  if (bySlugHandle) return bySlugHandle.id;

  if (pathValue) {
    const byUrl = candidates.find((row) => normalizeText(row.url).toLowerCase() === pathValue);
    if (byUrl) return byUrl.id;
  }

  const byTitle = candidates.find((row) => normalizeText(row.title).toLowerCase() === lowerValue);
  if (byTitle) return byTitle.id;

  return "";
}

function resolvePreferredMenu(
  menus: ShopifyMenuNode[],
  requestedHandle: string
): ShopifyMenuNode | null {
  const safeHandle = normalizeLower(requestedHandle);
  const exact = menus.find((row) => normalizeLower(row.handle) === safeHandle);
  if (exact) return exact;
  const defaultMenu = menus.find((row) => Boolean(row.isDefault));
  if (defaultMenu) return defaultMenu;
  return menus[0] || null;
}

async function fetchMenuTree(
  shop: string,
  token: string,
  apiVersion: string,
  requestedHandle: string
): Promise<MenuFetchResult> {
  const query = `
    query MenusForCollectionMapping($first: Int!) {
      menus(first: $first) {
        nodes {
          id
          title
          handle
          isDefault
          items {
            id
            title
            type
            url
            resourceId
            tags
            items {
              id
              title
              type
              url
              resourceId
              tags
              items {
                id
                title
                type
                url
                resourceId
                tags
                items {
                  id
                  title
                  type
                  url
                  resourceId
                  tags
                }
              }
            }
          }
        }
      }
    }
  `;

  const gqlResult: GraphResult<MenusQueryData> = (await runShopifyGraphql<MenusQueryData>({
    shop,
    token,
    apiVersion,
    query,
    variables: { first: 50 },
  })) as GraphResult<MenusQueryData>;

  if (!gqlResult.ok || !gqlResult.data?.menus?.nodes) {
    const rawError = `Failed to load Shopify menus: ${JSON.stringify(gqlResult.errors || "unknown")}`;
    if (isMenusAccessDenied(gqlResult.errors)) {
      return { ok: false, error: buildMenuScopeErrorMessage(rawError) };
    }
    return { ok: false, error: rawError };
  }

  const menu = resolvePreferredMenu(gqlResult.data.menus.nodes || [], requestedHandle);
  if (!menu) {
    return { ok: false, error: "No Shopify menu found. Create a menu in Shopify Content > Menus first." };
  }

  const menuId = normalizeText(menu.id);
  const menuHandle = normalizeText(menu.handle) || requestedHandle || DEFAULT_MENU_HANDLE;
  const menuTitle = normalizeText(menu.title) || menuHandle;
  const items = sanitizeMenuItemTree(Array.isArray(menu.items) ? menu.items : []);

  if (!menuId) {
    return { ok: false, error: "Failed to resolve Shopify menu ID." };
  }

  return {
    ok: true,
    menuId,
    menuHandle,
    menuTitle,
    items,
    liveNodes: flattenMenuItemsToLiveNodes(items),
  };
}

function buildMenuUpdateItems(items: ShopifyMenuItemNode[]) {
  return items.map((item) => stripItemForMutation(item));
}

async function updateMenuTree(
  shop: string,
  token: string,
  apiVersion: string,
  menuId: string,
  menuTitle: string,
  menuHandle: string,
  items: ShopifyMenuItemNode[]
): Promise<MenuUpdateResult> {
  const mutation = `
    mutation UpdateMenuForCollectionMapping(
      $id: ID!
      $title: String!
      $handle: String!
      $items: [MenuItemUpdateInput!]!
    ) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
        menu {
          id
          title
          handle
          isDefault
          items {
            id
            title
            type
            url
            resourceId
            tags
            items {
              id
              title
              type
              url
              resourceId
              tags
              items {
                id
                title
                type
                url
                resourceId
                tags
                items {
                  id
                  title
                  type
                  url
                  resourceId
                  tags
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const menuItems = buildMenuUpdateItems(items);

  const gqlResult: GraphResult<MenuUpdateData> = (await runShopifyGraphql<MenuUpdateData>({
    shop,
    token,
    apiVersion,
    query: mutation,
    variables: {
      id: menuId,
      title: menuTitle,
      handle: menuHandle,
      items: menuItems,
    },
  })) as GraphResult<MenuUpdateData>;

  if (!gqlResult.ok || !gqlResult.data?.menuUpdate) {
    return {
      ok: false,
      error: `Shopify menuUpdate failed: ${JSON.stringify(gqlResult.errors || "unknown")}`,
    };
  }

  const userErrors = gqlResult.data.menuUpdate.userErrors || [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      error: userErrors
        .map((row) => normalizeText(row.message))
        .filter(Boolean)
        .join(" | "),
    };
  }

  const menu = gqlResult.data.menuUpdate.menu;
  if (!menu?.id) {
    return { ok: false, error: "Shopify menuUpdate returned an empty menu response." };
  }

  const nextItems = sanitizeMenuItemTree(Array.isArray(menu.items) ? menu.items : []);
  const nextMenuHandle = normalizeText(menu.handle) || menuHandle;
  const nextMenuTitle = normalizeText(menu.title) || menuTitle;
  return {
    ok: true,
    menuId: normalizeText(menu.id),
    menuHandle: nextMenuHandle,
    menuTitle: nextMenuTitle,
    items: nextItems,
    liveNodes: flattenMenuItemsToLiveNodes(nextItems),
  };
}

function parseMenuHandleParam(value: unknown) {
  return normalizeText(value) || DEFAULT_MENU_HANDLE;
}

function parseLogLimit(value: unknown) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 120;
  return Math.min(1000, parsed);
}

async function syncMenuNodesFromShopify(
  shop: string,
  token: string,
  apiVersion: string,
  menuHandle: string,
  collections: CollectionOption[]
) {
  const menuResult = await fetchMenuTree(shop, token, apiVersion, menuHandle);
  if (!menuResult.ok) {
    if (!isMenuScopeErrorMessage(menuResult.error)) {
      return { ok: false as const, error: menuResult.error, menuAccessDenied: false as const };
    }

    const fallback = await listAndEnsureMenuNodes(shop, collections);
    return {
      ok: true as const,
      menuAccessDenied: true as const,
      warning: joinWarnings(
        buildMenuScopeErrorMessage(),
        "Live menu pull/edit is unavailable until scopes are granted.",
        fallback.warning
      ),
      menu: {
        menuId: "",
        menuHandle: normalizeText(menuHandle) || DEFAULT_MENU_HANDLE,
        menuTitle: normalizeText(menuHandle) || "main-menu",
        items: [],
        liveNodes: [],
      },
      synced: fallback,
    };
  }

  const synced = await syncLiveMenuNodes(shop, menuResult.liveNodes, collections);
  return {
    ok: true as const,
    menuAccessDenied: false as const,
    menu: menuResult,
    synced,
  };
}

function parseCsvCell(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  return `"${text.replaceAll('"', '""')}"`;
}

function mappingLogsToCsv(rows: MappingAuditLogRow[]) {
  const header = [
    "id",
    "created_at",
    "status",
    "action",
    "summary",
    "error_message",
    "details_json",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        parseCsvCell(row.id),
        parseCsvCell(row.createdAt),
        parseCsvCell(row.status),
        parseCsvCell(row.action),
        parseCsvCell(row.summary),
        parseCsvCell(row.errorMessage || ""),
        parseCsvCell(JSON.stringify(row.details || {})),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function removeMenuNode(
  rows: ShopifyMenuItemNode[],
  nodeKey: string
): { rows: ShopifyMenuItemNode[]; removed: ShopifyMenuItemNode | null } {
  let removed: ShopifyMenuItemNode | null = null;
  const nextRows: ShopifyMenuItemNode[] = [];

  for (const row of rows) {
    const currentKey = normalizeText(row.id);
    if (!removed && currentKey === nodeKey) {
      removed = row;
      continue;
    }

    const nested = removeMenuNode(Array.isArray(row.items) ? row.items : [], nodeKey);
    if (nested.removed) {
      removed = nested.removed;
      nextRows.push({ ...row, items: nested.rows });
    } else {
      nextRows.push(row);
    }
  }

  return { rows: nextRows, removed };
}

function moveMenuNode(
  sourceItems: ShopifyMenuItemNode[],
  sourceKey: string,
  targetKey: string,
  position: "before" | "after" | "inside"
): { ok: true; items: ShopifyMenuItemNode[] } | { ok: false; error: string } {
  const items = sanitizeMenuItemTree(sourceItems);
  const indexBefore = findMenuNodeIndex(items);
  const source = indexBefore.get(sourceKey);
  const target = indexBefore.get(targetKey);
  if (!source || !target) {
    return { ok: false, error: "Invalid drag target/source collection." };
  }
  if (sourceKey === targetKey) {
    return { ok: false, error: "Cannot move a collection onto itself." };
  }

  const descendants = collectMenuDescendantKeys(source.node);
  if (descendants.has(targetKey)) {
    return { ok: false, error: "Cannot move a parent collection into one of its descendants." };
  }

  const subtreeDepth = (node: ShopifyMenuItemNode, baseDepth = 0): number => {
    const children = Array.isArray(node.items) ? node.items : [];
    if (children.length < 1) return baseDepth;
    let maxDepth = baseDepth;
    for (const child of children) {
      const childDepth = subtreeDepth(child, baseDepth + 1);
      if (childDepth > maxDepth) maxDepth = childDepth;
    }
    return maxDepth;
  };

  const detachedDepthOffset = subtreeDepth(source.node, 0);
  const targetDepth = position === "inside" ? target.depth + 1 : target.depth;
  if (targetDepth + detachedDepthOffset > MAX_MENU_DEPTH) {
    return { ok: false, error: "Shopify menu supports up to 4 nested levels." };
  }

  const detachNode = (
    rows: ShopifyMenuItemNode[],
    key: string
  ): { rows: ShopifyMenuItemNode[]; removed: ShopifyMenuItemNode | null } => {
    let removed: ShopifyMenuItemNode | null = null;
    const nextRows: ShopifyMenuItemNode[] = [];
    for (const row of rows) {
      const rowKey = normalizeText(row.id);
      if (!removed && rowKey === key) {
        removed = row;
        continue;
      }
      const nested = detachNode(Array.isArray(row.items) ? row.items : [], key);
      if (nested.removed) {
        removed = nested.removed;
        nextRows.push({ ...row, items: nested.rows });
      } else {
        nextRows.push(row);
      }
    }
    return { rows: nextRows, removed };
  };

  const detached = detachNode(items, sourceKey);
  if (!detached.removed) {
    return { ok: false, error: "Failed to detach source collection for move." };
  }

  const movedNode = detached.removed;
  const insertAsChild = (
    rows: ShopifyMenuItemNode[],
    targetNodeKey: string,
    nodeToInsert: ShopifyMenuItemNode
  ): { rows: ShopifyMenuItemNode[]; inserted: boolean } => {
    let inserted = false;
    const next = rows.map((row) => {
      const rowKey = normalizeText(row.id);
      if (rowKey === targetNodeKey) {
        inserted = true;
        const children = Array.isArray(row.items) ? row.items : [];
        return { ...row, items: [...children, nodeToInsert] };
      }
      const nested = insertAsChild(Array.isArray(row.items) ? row.items : [], targetNodeKey, nodeToInsert);
      if (nested.inserted) {
        inserted = true;
        return { ...row, items: nested.rows };
      }
      return row;
    });
    return { rows: next, inserted };
  };

  const insertAroundTarget = (
    rows: ShopifyMenuItemNode[],
    targetNodeKey: string,
    nodeToInsert: ShopifyMenuItemNode,
    mode: "before" | "after"
  ): { rows: ShopifyMenuItemNode[]; inserted: boolean } => {
    let inserted = false;
    const idx = rows.findIndex((row) => normalizeText(row.id) === targetNodeKey);
    if (idx >= 0) {
      inserted = true;
      const next = [...rows];
      const insertionIndex = mode === "before" ? idx : idx + 1;
      next.splice(insertionIndex, 0, nodeToInsert);
      return { rows: next, inserted };
    }

    const next = rows.map((row) => {
      const nested = insertAroundTarget(
        Array.isArray(row.items) ? row.items : [],
        targetNodeKey,
        nodeToInsert,
        mode
      );
      if (nested.inserted) {
        inserted = true;
        return { ...row, items: nested.rows };
      }
      return row;
    });
    return { rows: next, inserted };
  };

  const inserted =
    position === "inside"
      ? insertAsChild(detached.rows, targetKey, movedNode)
      : insertAroundTarget(detached.rows, targetKey, movedNode, position);

  if (!inserted.inserted) {
    return { ok: false, error: "Failed to insert moved collection at the target position." };
  }

  return { ok: true, items: inserted.rows };
}

async function fetchProductCollections(
  shop: string,
  token: string,
  apiVersion: string,
  productGid: string
): Promise<ProductCollectionsFetchResult> {
  const query = `
    query ProductCollections($id: ID!) {
      product(id: $id) {
        id
        title
        collections(first: 250) {
          nodes {
            id
          }
        }
      }
    }
  `;

  const gqlResult: GraphResult<{
    product: {
      id: string;
      title: string;
      collections: { nodes: Array<{ id: string }> };
    } | null;
  }> = (await runShopifyGraphql<{
    product: {
      id: string;
      title: string;
      collections: { nodes: Array<{ id: string }> };
    } | null;
  }>({
    shop,
    token,
    apiVersion,
    query,
    variables: { id: productGid },
  })) as GraphResult<{
    product: {
      id: string;
      title: string;
      collections: { nodes: Array<{ id: string }> };
    } | null;
  }>;

  if (!gqlResult.ok || !gqlResult.data?.product) {
    return {
      ok: false,
      error: `Failed to fetch product collections: ${JSON.stringify(gqlResult.errors || "unknown")}`,
    };
  }

  const product = gqlResult.data.product;
  return {
    ok: true,
    productId: normalizeText(product.id),
    title: normalizeText(product.title),
    collectionIds: Array.from(
      new Set(
        (Array.isArray(product.collections?.nodes) ? product.collections.nodes : [])
          .map((row) => normalizeText(row.id))
          .filter(Boolean)
      )
    ),
  };
}

async function applyCollectionAdd(
  shop: string,
  token: string,
  apiVersion: string,
  collectionId: string,
  productGid: string
): Promise<string | null> {
  const mutation = `
    mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response: GraphResult<{
    collectionAddProducts: {
      userErrors: Array<{ message?: string }>;
    };
  }> = (await runShopifyGraphql<{
    collectionAddProducts: {
      userErrors: Array<{ message?: string }>;
    };
  }>({
    shop,
    token,
    apiVersion,
    query: mutation,
    variables: { id: collectionId, productIds: [productGid] },
  })) as GraphResult<{
    collectionAddProducts: {
      userErrors: Array<{ message?: string }>;
    };
  }>;

  if (!response.ok || !response.data?.collectionAddProducts) {
    return `collectionAddProducts failed for ${collectionId}`;
  }

  const userErrors = response.data.collectionAddProducts.userErrors || [];
  if (userErrors.length > 0) {
    return userErrors
      .map((row) => normalizeText(row.message))
      .filter(Boolean)
      .join("; ");
  }

  return null;
}

async function applyCollectionRemove(
  shop: string,
  token: string,
  apiVersion: string,
  collectionId: string,
  productGid: string
): Promise<string | null> {
  const mutation = `
    mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response: GraphResult<{
    collectionRemoveProducts: {
      userErrors: Array<{ message?: string }>;
    };
  }> = (await runShopifyGraphql<{
    collectionRemoveProducts: {
      userErrors: Array<{ message?: string }>;
    };
  }>({
    shop,
    token,
    apiVersion,
    query: mutation,
    variables: { id: collectionId, productIds: [productGid] },
  })) as GraphResult<{
    collectionRemoveProducts: {
      userErrors: Array<{ message?: string }>;
    };
  }>;

  if (!response.ok || !response.data?.collectionRemoveProducts) {
    return `collectionRemoveProducts failed for ${collectionId}`;
  }

  const userErrors = response.data.collectionRemoveProducts.userErrors || [];
  if (userErrors.length > 0) {
    return userErrors
      .map((row) => normalizeText(row.message))
      .filter(Boolean)
      .join("; ");
  }

  return null;
}

function mapProductRowToResponse(
  row: ProductRow,
  nodes: MenuNodeRecord[],
  actionStatusByProductId: Map<string, ProductActionStatus>,
  nodePathByKey: Map<string, string>
) {
  const membership = new Set(row.collectionIds);
  const checkedNodeKeys = nodes
    .filter((node) => node.enabled && node.collectionId && membership.has(node.collectionId))
    .map((node) => node.nodeKey);
  const assignedMenuPaths = checkedNodeKeys
    .map((nodeKey) => nodePathByKey.get(nodeKey) || "")
    .filter(Boolean);
  const autoMap = computeCollectionAutoMap({
    sku: row.sku,
    upc: row.upc,
    title: row.title,
    itemType: row.itemType,
    assignedMenuPaths,
  });

  return {
    id: row.id,
    title: row.title,
    handle: row.handle,
    itemType: row.itemType,
    updatedAt: row.updatedAt,
    image: row.image,
    sku: row.sku,
    upc: row.upc,
    collectionIds: row.collectionIds,
    checkedNodeKeys,
    actionStatus: actionStatusByProductId.get(row.id) || "",
    parserType: autoMap.parserType,
    routeKey: autoMap.routeKey,
    digit: autoMap.digit,
    barcodeLabel: autoMap.barcodeLabel,
    mappingDecision: autoMap.mappingDecision,
    reviewReason: autoMap.reviewReason,
    autoMappedPaths: autoMap.autoMappedPaths,
    directCollectionsToAssign: autoMap.directCollectionsToAssign,
    suggestedPaths: autoMap.suggestedPaths,
  };
}

function buildNodePathByKey(nodes: MenuNodeRecord[]) {
  const byKey = new Map(nodes.map((node) => [node.nodeKey, node]));
  const out = new Map<string, string>();
  for (const node of nodes) {
    const parts: string[] = [];
    let current: MenuNodeRecord | undefined = node;
    const seen = new Set<string>();
    while (current && !seen.has(current.nodeKey)) {
      seen.add(current.nodeKey);
      const label = normalizeText(current.label);
      if (label) parts.unshift(label.toUpperCase());
      const parentKey = normalizeText(current.parentKey || "");
      current = parentKey ? byKey.get(parentKey) : undefined;
    }
    out.set(node.nodeKey, parts.join(" > "));
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!isModuleEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Shopify Collection Mapping is disabled by environment flag." },
      { status: 403 }
    );
  }


  try {
    const { searchParams } = new URL(req.url);
    const rawShop = normalizeText(searchParams.get("shop") || "");
    const menuHandle = parseMenuHandleParam(searchParams.get("menuHandle"));
    const includeLogs = parseBool(searchParams.get("includeLogs"));
    const logLimit = parseLogLimit(searchParams.get("logLimit"));
    const refreshProducts = parseBool(searchParams.get("refreshProducts"));
    const refreshCollections = parseBool(searchParams.get("refreshCollections"));
    const shop = await resolveShop(rawShop);
    if (!shop) {
      return NextResponse.json({ ok: false, error: "Missing Shopify shop." }, { status: 400 });
    }

    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(500, parsePositiveInt(searchParams.get("pageSize"), 20));

    const filters: ProductFilters = {
      q: normalizeText(searchParams.get("q") || ""),
      title: normalizeText(searchParams.get("title") || ""),
      sku: normalizeText(searchParams.get("sku") || ""),
      upc: normalizeText(searchParams.get("upc") || ""),
      itemType: normalizeText(searchParams.get("itemType") || ""),
      selectedItemTypes: parseCsvList(searchParams.get("types") || ""),
    };

    const sortField = toSortField(normalizeText(searchParams.get("sortField") || "title"));
    const sortDir = toSortDir(normalizeText(searchParams.get("sortDir") || "asc"));

    const { apiVersion } = getShopifyConfig(new URL(req.url).origin);
    const tokenResult = await resolveWorkingToken(shop, apiVersion);
    if (!tokenResult.ok) {
      return NextResponse.json({ ok: false, error: tokenResult.error }, { status: 401 });
    }

    const [collectionsResult, productsResult] = await Promise.all([
      refreshCollections
        ? fetchAllCollections(shop, tokenResult.token, apiVersion)
        : fetchAllCollectionsCached(shop, tokenResult.token, apiVersion),
      refreshProducts
        ? fetchAllProducts(shop, tokenResult.token, apiVersion)
        : fetchAllProductsCached(shop, tokenResult.token, apiVersion),
    ]);

    if ("error" in collectionsResult) {
      return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
    }
    if ("error" in productsResult) {
      return NextResponse.json({ ok: false, error: productsResult.error }, { status: 500 });
    }

    const menuSyncResult = await syncMenuNodesFromShopify(
      shop,
      tokenResult.token,
      apiVersion,
      menuHandle,
      collectionsResult.collections
    );
    if (!menuSyncResult.ok) {
      return NextResponse.json({ ok: false, error: menuSyncResult.error }, { status: 500 });
    }

    const linkTargetsResult = await fetchMenuLinkTargets(
      shop,
      tokenResult.token,
      apiVersion,
      collectionsResult.collections
    );

    const nodesResult = menuSyncResult.synced;
    const nodes = nodesResult.nodes;
    const nodePathByKey = buildNodePathByKey(nodes);

    const typeLabelByKey = new Map<string, string>();
    for (const row of productsResult.products) {
      const itemType = normalizeText(row.itemType);
      if (!itemType) continue;
      const key = normalizeLower(itemType);
      if (!typeLabelByKey.has(key)) typeLabelByKey.set(key, itemType);
    }
    const types = Array.from(typeLabelByKey.values()).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" })
    );

    const filtered = productsResult.products.filter((row) => productMatchesFilters(row, filters));

    const sorted = [...filtered].sort((left, right) => compareRows(left, right, sortField));
    if (sortDir === "desc") sorted.reverse();

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    const start = (clampedPage - 1) * pageSize;
    const paged = sorted.slice(start, start + pageSize);
    const actionStatusResult = await listLatestProductActionStatus(
      shop,
      paged.map((row) => row.id)
    );

    const logsResult = includeLogs ? await listMappingAuditLogs(shop, logLimit) : null;
    const warningParts = [
      normalizeText(menuSyncResult.warning),
      normalizeText(nodesResult.warning),
      normalizeText(linkTargetsResult.warning),
      normalizeText(actionStatusResult.warning),
      normalizeText(logsResult?.warning),
    ].filter(Boolean);

    const menuLinks = flattenMenuLinks(menuSyncResult.menu.items);
    const menuLinkByNodeKey = new Map(menuLinks.map((row) => [row.nodeKey, row]));
    const linkTargetIndexes = buildLinkTargetIndexes(linkTargetsResult.targets, collectionsResult.collections);
    const nodesWithLinkedTargets = nodes.map((node) => {
      const meta = resolveNodeLinkedTargetMeta(menuLinkByNodeKey.get(node.nodeKey), linkTargetIndexes);
      const linkedLabel = normalizeText(meta.linkedTargetLabel);
      const isUnlinked = !linkedLabel || linkedLabel === "No target linked";
      const fallbackLabel = isUnlinked && node.collectionTitle ? node.collectionTitle : linkedLabel;
      return {
        ...node,
        ...meta,
        linkedTargetLabel: fallbackLabel || meta.linkedTargetLabel,
      };
    });

    return NextResponse.json({
      ok: true,
      shop,
      backend: nodesResult.backend,
      warning: warningParts.join(" | "),
      filters,
      types,
      sort: { field: sortField, dir: sortDir },
      page: clampedPage,
      pageSize,
      total,
      totalPages,
      menu: {
        id: menuSyncResult.menu.menuId,
        handle: menuSyncResult.menu.menuHandle,
        title: menuSyncResult.menu.menuTitle,
      },
      menuLinks,
      linkTargets: linkTargetsResult.targets,
      collections: collectionsResult.collections,
      nodes: nodesWithLinkedTargets,
      mappedNodes: nodesWithLinkedTargets.filter((node) => node.enabled && Boolean(node.collectionId)),
      rows: paged.map((row) =>
        mapProductRowToResponse(row, nodes, actionStatusResult.statusByProductId, nodePathByKey)
      ),
      logs: logsResult?.logs || [],
      summary: {
        totalProducts: total,
        mappedNodeCount: nodes.filter((node) => node.enabled && node.collectionId).length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message || "Collection mapping fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isModuleEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Shopify Collection Mapping is disabled by environment flag." },
      { status: 403 }
    );
  }


  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = normalizeText(body.action || "");
    const requestedShop = normalizeText(body.shop || "");
    const menuHandle = parseMenuHandleParam(body.menuHandle);
    const shop = await resolveShop(requestedShop);
    if (!shop) {
      return NextResponse.json({ ok: false, error: "Missing Shopify shop." }, { status: 400 });
    }

    const { apiVersion } = getShopifyConfig(new URL(req.url).origin);
    const tokenResult = await resolveWorkingToken(shop, apiVersion);
    if (!tokenResult.ok) {
      return NextResponse.json({ ok: false, error: tokenResult.error }, { status: 401 });
    }

    if (action === "fetch-link-assets") {
      const requestedType = normalizeMenuLinkTypeInput(body.linkType || "COLLECTION");
      if (requestedType !== "COLLECTION" && requestedType !== "PRODUCT" && requestedType !== "PAGE") {
        return NextResponse.json({ ok: false, error: "Only COLLECTION, PRODUCT, and PAGE are supported." }, { status: 400 });
      }
      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }
      const linkTargetsResult = await fetchMenuLinkTargets(
        shop,
        tokenResult.token,
        apiVersion,
        collectionsResult.collections
      );
      return NextResponse.json({
        ok: true,
        shop,
        linkType: requestedType,
        warning: linkTargetsResult.warning,
        linkTargets: linkTargetsResult.targets,
        assets:
          requestedType === "COLLECTION"
            ? linkTargetsResult.targets.collections
            : requestedType === "PRODUCT"
              ? linkTargetsResult.targets.products
              : linkTargetsResult.targets.pages,
      });
    }

    if (action === "rename-collection-title") {
      const collectionId = normalizeText(body.collectionId || "");
      const nextTitle = normalizeText(body.title || "");
      if (!collectionId || !nextTitle) {
        return NextResponse.json({ ok: false, error: "collectionId and title are required." }, { status: 400 });
      }

      const mutation = `
        mutation RenameCollectionForMapping($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection {
              id
              title
              handle
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
      type RenameCollectionMutationData = {
        collectionUpdate: {
          collection: { id?: string; title?: string; handle?: string } | null;
          userErrors: Array<{ field?: string[]; message?: string }>;
        } | null;
      };
      const updateResult: GraphResult<RenameCollectionMutationData> =
        (await runShopifyGraphql<RenameCollectionMutationData>({
          shop,
          token: tokenResult.token,
          apiVersion,
          query: mutation,
          variables: {
            input: {
              id: collectionId,
              title: nextTitle,
            },
          },
        })) as GraphResult<RenameCollectionMutationData>;

      if (!updateResult.ok || !updateResult.data?.collectionUpdate) {
        return NextResponse.json(
          { ok: false, error: `Failed to rename collection: ${JSON.stringify(updateResult.errors || "unknown")}` },
          { status: 500 }
        );
      }
      const userErrors = updateResult.data.collectionUpdate.userErrors || [];
      if (userErrors.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: userErrors.map((row) => normalizeText(row.message)).filter(Boolean).join(" | ") || "Collection rename failed.",
          },
          { status: 400 }
        );
      }

      collectionsCache.delete(buildShopCacheKey(shop, apiVersion));
      const updated = updateResult.data.collectionUpdate.collection;
      await logMappingAudit({
        shop,
        action,
        summary: `Renamed collection to "${nextTitle}"`,
        status: "ok",
        details: {
          collectionId,
          title: nextTitle,
        },
      });
      return NextResponse.json({
        ok: true,
        shop,
        collection: updated
          ? {
              id: normalizeText(updated.id),
              title: normalizeText(updated.title),
              handle: normalizeText(updated.handle),
            }
          : null,
      });
    }

    if (action === "get-logs") {
      const logs = await listMappingAuditLogs(shop, parseLogLimit(body.limit));
      return NextResponse.json({
        ok: true,
        shop,
        backend: logs.backend,
        warning: logs.warning || "",
        logs: logs.logs,
      });
    }

    if (action === "download-logs-csv") {
      const logs = await listMappingAuditLogs(shop, parseLogLimit(body.limit));
      const csv = mappingLogsToCsv(logs.logs);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="collection-mapping-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (action === "refresh-menu") {
      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }
      const linkTargetsResult = await fetchMenuLinkTargets(
        shop,
        tokenResult.token,
        apiVersion,
        collectionsResult.collections
      );

      const menuSyncResult = await syncMenuNodesFromShopify(
        shop,
        tokenResult.token,
        apiVersion,
        menuHandle,
        collectionsResult.collections
      );
      if (!menuSyncResult.ok) {
        await logMappingAudit({
          shop,
          action,
          summary: "Refresh menu sync failed",
          status: "error",
          errorMessage: menuSyncResult.error,
          details: { menuHandle },
        });
        const status = isMenuScopeErrorMessage(menuSyncResult.error) ? 403 : 500;
        return NextResponse.json({ ok: false, error: menuSyncResult.error }, { status });
      }

      await logMappingAudit({
        shop,
        action: menuSyncResult.menuAccessDenied ? "refresh-menu-fallback" : action,
        summary: menuSyncResult.menuAccessDenied
          ? `Menu refresh fallback used (${menuSyncResult.menu.menuHandle})`
          : `Menu synced (${menuSyncResult.menu.menuHandle})`,
        status: "ok",
        details: { menuHandle: menuSyncResult.menu.menuHandle, nodes: menuSyncResult.synced.nodes.length },
      });

      return NextResponse.json({
        ok: true,
        shop,
        menu: {
          id: menuSyncResult.menu.menuId,
          handle: menuSyncResult.menu.menuHandle,
          title: menuSyncResult.menu.menuTitle,
        },
        backend: menuSyncResult.synced.backend,
        warning: joinWarnings(menuSyncResult.warning, menuSyncResult.synced.warning, linkTargetsResult.warning),
        menuLinks: flattenMenuLinks(menuSyncResult.menu.items),
        linkTargets: linkTargetsResult.targets,
        collections: collectionsResult.collections,
        nodes: menuSyncResult.synced.nodes,
        mappedNodes: menuSyncResult.synced.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "save-menu-tree") {
      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }
      const linkTargetsResult = await fetchMenuLinkTargets(
        shop,
        tokenResult.token,
        apiVersion,
        collectionsResult.collections
      );
      const menuSync = await fetchMenuTree(shop, tokenResult.token, apiVersion, menuHandle);
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const updateResult = await updateMenuTree(
        shop,
        tokenResult.token,
        apiVersion,
        menuSync.menuId,
        menuSync.menuTitle,
        menuSync.menuHandle,
        menuSync.items
      );
      if (!updateResult.ok) {
        return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
      }

      const synced = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
      await logMappingAudit({
        shop,
        action,
        summary: `Menu saved (${updateResult.menuHandle})`,
        status: "ok",
        details: { menuHandle: updateResult.menuHandle, nodes: synced.nodes.length },
      });

      return NextResponse.json({
        ok: true,
        shop,
        backend: synced.backend,
        warning: joinWarnings(synced.warning, linkTargetsResult.warning),
        menu: {
          id: updateResult.menuId,
          handle: updateResult.menuHandle,
          title: updateResult.menuTitle,
        },
        menuLinks: flattenMenuLinks(updateResult.items),
        linkTargets: linkTargetsResult.targets,
        collections: collectionsResult.collections,
        nodes: synced.nodes,
        mappedNodes: synced.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "restore-mega-menu-from-seed") {
      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }
      const menuSync = await fetchMenuTree(shop, tokenResult.token, apiVersion, menuHandle);
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }
      const builtItems = buildMenuTreeFromSeed(collectionsResult.collections);
      const updateResult = await updateMenuTree(
        shop,
        tokenResult.token,
        apiVersion,
        menuSync.menuId,
        menuSync.menuTitle,
        menuSync.menuHandle,
        builtItems
      );
      if (!updateResult.ok) {
        await logMappingAudit({
          shop,
          action,
          summary: "Failed to restore mega menu from seed",
          status: "error",
          errorMessage: updateResult.error,
        });
        return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
      }
      const synced = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
      await saveMenuMappings(
        shop,
        synced.nodes.map((n) => ({
          nodeKey: n.nodeKey,
          collectionId: n.collectionId,
          enabled: true,
        })),
        collectionsResult.collections
      );
      await logMappingAudit({
        shop,
        action,
        summary: `Restored mega menu from seed (${synced.nodes.length} nodes)`,
        status: "ok",
        details: { menuHandle, nodeCount: synced.nodes.length },
      });
      return NextResponse.json({
        ok: true,
        shop,
        menu: {
          id: updateResult.menuId,
          handle: updateResult.menuHandle,
          title: updateResult.menuTitle,
        },
        nodes: synced.nodes,
        nodeCount: synced.nodes.length,
      });
    }

    if (action === "save-mappings") {
      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }
      const menuSync = await syncMenuNodesFromShopify(
        shop,
        tokenResult.token,
        apiVersion,
        menuHandle,
        collectionsResult.collections
      );
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const mappings = Array.isArray(body.mappings)
        ? (body.mappings as Array<{ nodeKey: string; collectionId: string | null; enabled?: boolean }>)
        : [];
      const saved = await saveMenuMappings(shop, mappings, collectionsResult.collections);
      if (saved.invalidNodeKeys.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Some node keys are invalid or no longer exist in the live menu.",
            invalidNodeKeys: saved.invalidNodeKeys,
          },
          { status: 400 }
        );
      }
      await logMappingAudit({
        shop,
        action,
        summary: `Saved ${mappings.length} mapping row(s)`,
        status: "ok",
      });
      return NextResponse.json({
        ok: true,
        shop,
        backend: saved.backend,
        warning: saved.warning || "",
        nodes: saved.nodes,
        mappedNodes: saved.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "set-node-mapping-live") {
      const nodeKey = normalizeText(body.nodeKey || "");
      const hasCollectionIdInput = Object.prototype.hasOwnProperty.call(body, "collectionId");
      const requestedCollectionId = hasCollectionIdInput
        ? normalizeText(body.collectionId || "") || null
        : undefined;
      const enabled =
        typeof body.enabled === "boolean" ? Boolean(body.enabled) : undefined;
      const syncMenuLink = body.syncMenuLink === undefined ? true : parseBool(body.syncMenuLink);
      if (!nodeKey) {
        return NextResponse.json({ ok: false, error: "nodeKey is required." }, { status: 400 });
      }

      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }

      const menuSync = await syncMenuNodesFromShopify(
        shop,
        tokenResult.token,
        apiVersion,
        menuHandle,
        collectionsResult.collections
      );
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      let menuMeta = {
        id: menuSync.menu.menuId,
        handle: menuSync.menu.menuHandle,
        title: menuSync.menu.menuTitle,
      };
      let actionWarning = joinWarnings(menuSync.warning);
      const syncedNode = menuSync.synced.nodes.find((row) => normalizeText(row.nodeKey) === nodeKey) || null;
      const effectiveCollectionId =
        requestedCollectionId !== undefined ? requestedCollectionId : normalizeText(syncedNode?.collectionId) || null;

      const collectionMatch = effectiveCollectionId
        ? collectionsResult.collections.find((row) => normalizeText(row.id) === effectiveCollectionId) || null
        : null;

      const shouldSyncMenuLink = syncMenuLink && !menuSync.menuAccessDenied && typeof enabled !== "boolean";
      if (syncMenuLink && menuSync.menuAccessDenied) {
        actionWarning = joinWarnings(
          actionWarning,
          "Collection mapping was saved, but Shopify menu link sync is blocked until navigation scopes are granted."
        );
      }
      if (syncMenuLink && typeof enabled === "boolean") {
        actionWarning = joinWarnings(
          actionWarning,
          "Visibility was saved without changing Shopify link targets."
        );
      }

      if (shouldSyncMenuLink) {
        const items = sanitizeMenuItemTree(menuSync.menu.items);
        const index = findMenuNodeIndex(items);
        const target = index.get(nodeKey);
        if (!target) {
          return NextResponse.json({ ok: false, error: "Menu collection was not found." }, { status: 404 });
        }

        updateItemCollectionLink(target.node, collectionMatch);
        // #region agent log
        debugIngest({
            sessionId: "9da838",
            runId: "visibility-and-depth-debug",
            hypothesisId: "H4",
            location: "app/api/shopify/collection-mapping/route.ts:set-node-mapping-live",
            message: "visibility_link_sync_probe",
            data: {
              nodeKey,
              enabled: typeof enabled === "boolean" ? enabled : null,
              syncMenuLink,
              requestedCollectionId: requestedCollectionId ?? null,
              effectiveCollectionId,
              hasCollectionIdInput,
              targetType: normalizeText(target.node.type || ""),
              targetTitle: normalizeText(target.node.title || ""),
              targetResourceId: normalizeText(target.node.resourceId || ""),
              targetUrl: normalizeText(target.node.url || ""),
            },
            timestamp: Date.now(),
          });
        // #endregion
        const updateResult = await updateMenuTree(
          shop,
          tokenResult.token,
          apiVersion,
          menuSync.menu.menuId,
          menuSync.menu.menuTitle,
          menuSync.menu.menuHandle,
          items
        );
        if (!updateResult.ok) {
          // #region agent log
          debugIngest({
              sessionId: "9da838",
              runId: "visibility-and-depth-debug",
              hypothesisId: "H4",
              location: "app/api/shopify/collection-mapping/route.ts:set-node-mapping-live",
              message: "visibility_link_sync_error_probe",
              data: {
                nodeKey,
                requestedCollectionId: requestedCollectionId ?? null,
                effectiveCollectionId,
                enabled: typeof enabled === "boolean" ? enabled : null,
                error: normalizeText(updateResult.error || ""),
              },
              timestamp: Date.now(),
            });
          // #endregion
          await logMappingAudit({
            shop,
            action,
            summary: `Failed to update menu link for node ${nodeKey}`,
            status: "error",
            errorMessage: updateResult.error,
            details: { nodeKey, effectiveCollectionId },
          });
          return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
        }

        await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
        menuMeta = { id: updateResult.menuId, handle: updateResult.menuHandle, title: updateResult.menuTitle };
      }

      const saved = await saveMenuMappings(
        shop,
        [
          {
            nodeKey,
            collectionId: effectiveCollectionId,
            enabled,
          },
        ],
        collectionsResult.collections
      );

      await logMappingAudit({
        shop,
        action,
        summary: `Updated node mapping: ${nodeKey}`,
        status: "ok",
        details: {
          nodeKey,
          requestedCollectionId: requestedCollectionId ?? null,
          effectiveCollectionId,
          hasCollectionIdInput,
          enabled,
          menuHandle: menuMeta.handle,
          menuLinkSynced: shouldSyncMenuLink,
          menuAccessDenied: menuSync.menuAccessDenied,
        },
      });

      return NextResponse.json({
        ok: true,
        shop,
        menu: menuMeta,
        backend: saved.backend,
        warning: joinWarnings(saved.warning, actionWarning),
        nodes: saved.nodes,
        mappedNodes: saved.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "set-node-mapping-live-batch") {
      const updates = Array.isArray(body.updates)
        ? body.updates
            .map((row) => ({
              nodeKey: normalizeText((row as { nodeKey?: unknown }).nodeKey || ""),
              enabled: typeof (row as { enabled?: unknown }).enabled === "boolean" ? Boolean((row as { enabled?: unknown }).enabled) : null,
            }))
            .filter((row) => row.nodeKey && row.enabled !== null) as Array<{ nodeKey: string; enabled: boolean }>
        : [];
      if (updates.length < 1) {
        return NextResponse.json({ ok: false, error: "updates are required." }, { status: 400 });
      }

      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }

      const menuSync = await syncMenuNodesFromShopify(
        shop,
        tokenResult.token,
        apiVersion,
        menuHandle,
        collectionsResult.collections
      );
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const nodeByKey = new Map(menuSync.synced.nodes.map((row) => [normalizeText(row.nodeKey), row]));
      const mappings = updates
        .map((row) => {
          const current = nodeByKey.get(row.nodeKey);
          return {
            nodeKey: row.nodeKey,
            collectionId: normalizeText(current?.collectionId) || null,
            enabled: row.enabled,
          };
        })
        .filter((row) => Boolean(row.nodeKey));

      const saved = await saveMenuMappings(shop, mappings, collectionsResult.collections);
      let responseNodes = saved.nodes;
      let actionWarning = joinWarnings(saved.warning, menuSync.warning);
      if (!menuSync.menuAccessDenied) {
        const nextItems = buildVisibleMenuItemsFromNodes(menuSync.menu.items, saved.nodes, collectionsResult.collections);
        const updateResult = await updateMenuTree(
          shop,
          tokenResult.token,
          apiVersion,
          menuSync.menu.menuId,
          menuSync.menu.menuTitle,
          menuSync.menu.menuHandle,
          nextItems
        );
        if (!updateResult.ok) {
          await logMappingAudit({
            shop,
            action,
            summary: `Failed to apply visibility to Shopify for ${mappings.length} node(s)`,
            status: "error",
            errorMessage: updateResult.error,
            details: { count: mappings.length },
          });
          return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
        }

        const syncedAfterUpdate = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
        responseNodes = syncedAfterUpdate.nodes;
        actionWarning = joinWarnings(actionWarning, syncedAfterUpdate.warning);
      } else {
        actionWarning = joinWarnings(
          actionWarning,
          "Visibility was saved locally, but live menu update is blocked until navigation scopes are granted."
        );
      }
      await logMappingAudit({
        shop,
        action,
        summary: `Saved visibility for ${mappings.length} node(s)`,
        status: "ok",
        details: {
          count: mappings.length,
          enabledCount: mappings.filter((row) => row.enabled).length,
          disabledCount: mappings.filter((row) => !row.enabled).length,
        },
      });
      return NextResponse.json({
        ok: true,
        shop,
        backend: saved.backend,
        warning: actionWarning,
        nodes: responseNodes,
        mappedNodes: responseNodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "create-menu-node" || action === "add-menu-node") {
      const label = normalizeText(body.label || "");
      const parentKey = normalizeText(body.parentKey || "") || null;
      const legacyCollectionId = normalizeText(body.collectionId || "");
      const linkType = normalizeMenuLinkTypeInput(body.linkType || (legacyCollectionId ? "COLLECTION" : "HTTP"));
      const linkValue = normalizeText(body.linkValue || "");
      const linkTargetIdInput = normalizeText(body.linkTargetId || legacyCollectionId);
      const linkUrl = normalizeText(body.linkUrl || "");
      if (!label) {
        return NextResponse.json({ ok: false, error: "label is required." }, { status: 400 });
      }

      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }
      const linkTargetsResult = await fetchMenuLinkTargets(
        shop,
        tokenResult.token,
        apiVersion,
        collectionsResult.collections
      );

      const menuSync = await fetchMenuTree(shop, tokenResult.token, apiVersion, menuHandle);
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        await logMappingAudit({
          shop,
          action,
          summary: `Failed to create menu node "${label}"`,
          status: "error",
          errorMessage: menuSync.error,
          details: { label, parentKey, linkType, linkValue, linkTargetId: linkTargetIdInput, linkUrl, menuHandle },
        });
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const items = sanitizeMenuItemTree(menuSync.items);
      const index = findMenuNodeIndex(items);
      let parentDepth = -1;
      if (parentKey) {
        const parent = index.get(parentKey);
        if (!parent) {
          return NextResponse.json({ ok: false, error: "Parent menu collection was not found." }, { status: 404 });
        }
        parentDepth = Number(parent.depth || 0);
        if (parent.depth + 1 > MAX_MENU_DEPTH) {
          return NextResponse.json(
            { ok: false, error: "Shopify menu supports up to 4 nested levels." },
            { status: 400 }
          );
        }
      }
      const nextDepth = parentDepth + 1;

      const newItem: ShopifyMenuItemNode = {
        title: label,
        type: "HTTP",
        url: "/collections/all",
        resourceId: null,
        tags: [],
        items: [],
      };
      const resolvedLinkTargetId =
        linkTargetIdInput ||
        (linkType === "COLLECTION"
          ? resolveTargetIdFromValue(linkTargetsResult.targets.collections, linkValue, "COLLECTION")
          : linkType === "PAGE"
            ? resolveTargetIdFromValue(linkTargetsResult.targets.pages, linkValue, "PAGE")
            : linkType === "PRODUCT"
              ? resolveTargetIdFromValue(linkTargetsResult.targets.products, linkValue, "PRODUCT")
              : linkType === "BLOG"
                ? resolveTargetIdFromValue(linkTargetsResult.targets.blogs, linkValue, "BLOG")
                : "");
      const linkApplyResult = applyMenuNodeLink(
        newItem,
        linkType,
        resolvedLinkTargetId,
        linkType === "HTTP" ? linkValue || linkUrl : linkUrl,
        collectionsResult.collections,
        linkTargetsResult.targets
      );
      if (!linkApplyResult.ok) {
        return NextResponse.json({ ok: false, error: linkApplyResult.error }, { status: 400 });
      }

      if (nextDepth > MAX_SHOPIFY_MENU_DEPTH && nextDepth <= MAX_MENU_DEPTH) {
        // Always keep level-4 editor-only to avoid Shopify depth hard failure.
        const slug = normalizeLower(label)
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "node";
        const localNodeKey = `local4:${parentKey || "root"}:${slug}:${Date.now()}`;
        const siblingSortOrder =
          menuSync.liveNodes
            .filter((row) => normalizeText(row.parentKey) === normalizeText(parentKey))
            .reduce((max, row) => Math.max(max, Number(row.sortOrder || 0)), 0) + 1;
        const localLiveNode: LiveMenuNodeInput = {
          nodeKey: localNodeKey,
          label,
          parentKey,
          depth: nextDepth,
          sortOrder: siblingSortOrder,
          collectionIdHint: linkType === "COLLECTION" ? normalizeText(resolvedLinkTargetId) || null : null,
        };
        const syncedLocal = await syncLiveMenuNodes(
          shop,
          [...menuSync.liveNodes, localLiveNode],
          collectionsResult.collections
        );
        if (linkType === "COLLECTION" && normalizeText(resolvedLinkTargetId)) {
          await saveMenuMappings(
            shop,
            [{ nodeKey: localNodeKey, collectionId: normalizeText(resolvedLinkTargetId), enabled: true }],
            collectionsResult.collections
          );
        }
        await logMappingAudit({
          shop,
          action,
          summary: `Created editor-only level 4 node "${label}"`,
          status: "ok",
          details: {
            parentKey,
            nextDepth,
            linkType,
            linkValue,
            linkTargetId: resolvedLinkTargetId,
            nodeKey: localNodeKey,
            strategy: "proactive-local4",
          },
        });
        return NextResponse.json({
          ok: true,
          shop,
          menu: { id: menuSync.menuId, handle: menuSync.menuHandle, title: menuSync.menuTitle },
          backend: syncedLocal.backend,
          warning: joinWarnings(
            syncedLocal.warning,
            linkTargetsResult.warning,
            "Saved as editor-only level 4 node. Shopify live menu supports up to 3 nesting levels."
          ),
          createdNodeKey: localNodeKey,
          menuLinks: flattenMenuLinks(menuSync.items),
          linkTargets: linkTargetsResult.targets,
          nodes: syncedLocal.nodes,
          mappedNodes: syncedLocal.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
        });
      }

      const insertNode = (
        rows: ShopifyMenuItemNode[],
        targetParent: string | null,
        item: ShopifyMenuItemNode
      ): ShopifyMenuItemNode[] => {
        if (!targetParent) {
          return [...rows, item];
        }
        return rows.map((row) => {
          if (normalizeText(row.id) === targetParent) {
            const children = Array.isArray(row.items) ? row.items : [];
            return { ...row, items: [...children, item] };
          }
          return { ...row, items: insertNode(Array.isArray(row.items) ? row.items : [], targetParent, item) };
        });
      };

      const nextItems = insertNode(items, parentKey, newItem);
      const beforeKeys = new Set(menuSync.liveNodes.map((row) => row.nodeKey));
      const updateResult = await updateMenuTree(
        shop,
        tokenResult.token,
        apiVersion,
        menuSync.menuId,
        menuSync.menuTitle,
        menuSync.menuHandle,
        nextItems
      );
      if (!updateResult.ok) {
        // #region agent log
        debugIngest({
            sessionId: "9da838",
            runId: "visibility-and-depth-debug",
            hypothesisId: "H2",
            location: "app/api/shopify/collection-mapping/route.ts:add-menu-node",
            message: "add_node_shopify_error_probe",
            data: {
              parentKey,
              parentDepth,
              nextDepth: parentDepth + 1,
              label,
              linkType,
              error: normalizeText(updateResult.error || ""),
            },
            timestamp: Date.now(),
          });
        // #endregion
        const normalizedUpdateError = normalizeLower(updateResult.error);
        const isShopifyDepthLimitError =
          normalizedUpdateError.includes("more than 3 levels of nesting") ||
          normalizedUpdateError.includes("up to 3 levels of nesting");
        if (isShopifyDepthLimitError && nextDepth > MAX_SHOPIFY_MENU_DEPTH && nextDepth <= MAX_MENU_DEPTH) {
          // #region agent log
          debugIngest({
              sessionId: "9da838",
              runId: "visibility-and-depth-debug",
              hypothesisId: "H2",
              location: "app/api/shopify/collection-mapping/route.ts:add-menu-node",
              message: "add_node_fallback_triggered_probe",
              data: {
                parentKey,
                parentDepth,
                nextDepth,
                maxDepth: MAX_MENU_DEPTH,
                maxShopifyDepth: MAX_SHOPIFY_MENU_DEPTH,
                label,
              },
              timestamp: Date.now(),
            });
          // #endregion
          const slug = normalizeLower(label)
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "node";
          const localNodeKey = `local4:${parentKey || "root"}:${slug}:${Date.now()}`;
          const siblingSortOrder =
            menuSync.liveNodes
              .filter((row) => normalizeText(row.parentKey) === normalizeText(parentKey))
              .reduce((max, row) => Math.max(max, Number(row.sortOrder || 0)), 0) + 1;
          const localLiveNode: LiveMenuNodeInput = {
            nodeKey: localNodeKey,
            label,
            parentKey,
            depth: nextDepth,
            sortOrder: siblingSortOrder,
            collectionIdHint: linkType === "COLLECTION" ? normalizeText(resolvedLinkTargetId) || null : null,
          };
          const syncedLocal = await syncLiveMenuNodes(
            shop,
            [...menuSync.liveNodes, localLiveNode],
            collectionsResult.collections
          );
          if (linkType === "COLLECTION" && normalizeText(resolvedLinkTargetId)) {
            await saveMenuMappings(
              shop,
              [{ nodeKey: localNodeKey, collectionId: normalizeText(resolvedLinkTargetId), enabled: true }],
              collectionsResult.collections
            );
          }
          await logMappingAudit({
            shop,
            action,
            summary: `Created editor-only level 4 node "${label}"`,
            status: "ok",
            details: {
              parentKey,
              linkType,
              linkValue,
              linkTargetId: resolvedLinkTargetId,
              nodeKey: localNodeKey,
              fallbackReason: updateResult.error,
            },
          });
          return NextResponse.json({
            ok: true,
            shop,
            menu: { id: menuSync.menuId, handle: menuSync.menuHandle, title: menuSync.menuTitle },
            backend: syncedLocal.backend,
            warning: joinWarnings(
              syncedLocal.warning,
              linkTargetsResult.warning,
              "Saved as editor-only level 4 node. Shopify live menu supports up to 3 nesting levels."
            ),
            createdNodeKey: localNodeKey,
            menuLinks: flattenMenuLinks(menuSync.items),
            linkTargets: linkTargetsResult.targets,
            nodes: syncedLocal.nodes,
            mappedNodes: syncedLocal.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
          });
        }
        await logMappingAudit({
          shop,
          action,
          summary: `Failed to create menu node "${label}"`,
          status: "error",
          errorMessage: updateResult.error,
          details: { label, parentKey, linkType, linkValue, linkTargetId: resolvedLinkTargetId, linkUrl },
        });
        return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
      }

      const synced = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
      const createdNode =
        updateResult.liveNodes.find((row) => !beforeKeys.has(row.nodeKey) && normalizeText(row.label) === label) ||
        updateResult.liveNodes.find((row) => !beforeKeys.has(row.nodeKey)) ||
        null;

      if (createdNode && normalizeText(newItem.type).toUpperCase() === "COLLECTION" && normalizeText(newItem.resourceId)) {
        await saveMenuMappings(
          shop,
          [{ nodeKey: createdNode.nodeKey, collectionId: normalizeText(newItem.resourceId), enabled: true }],
          collectionsResult.collections
        );
      }

      await logMappingAudit({
        shop,
        action,
        summary: `Created menu node "${label}"`,
        status: "ok",
        details: {
          parentKey,
          linkType,
          linkValue,
          linkTargetId: resolvedLinkTargetId,
          linkUrl,
          nodeKey: createdNode?.nodeKey || null,
        },
      });

      return NextResponse.json({
        ok: true,
        shop,
        menu: { id: updateResult.menuId, handle: updateResult.menuHandle, title: updateResult.menuTitle },
        backend: synced.backend,
        warning: joinWarnings(synced.warning, linkTargetsResult.warning),
        createdNodeKey: createdNode?.nodeKey || null,
        menuLinks: flattenMenuLinks(updateResult.items),
        linkTargets: linkTargetsResult.targets,
        nodes: synced.nodes,
        mappedNodes: synced.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "move-menu-node") {
      const nodeKey = normalizeText(body.nodeKey || "");
      const targetKey = normalizeText(body.targetKey || "");
      const positionRaw = normalizeLower(body.position);
      const position: "before" | "after" | "inside" =
        positionRaw === "before" || positionRaw === "inside" ? (positionRaw as "before" | "inside") : "after";
      if (!nodeKey || !targetKey) {
        return NextResponse.json({ ok: false, error: "nodeKey and targetKey are required." }, { status: 400 });
      }

      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }

      const menuSync = await fetchMenuTree(shop, tokenResult.token, apiVersion, menuHandle);
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        await logMappingAudit({
          shop,
          action,
          summary: "Failed to move menu node",
          status: "error",
          errorMessage: menuSync.error,
          details: { nodeKey, targetKey, position, menuHandle },
        });
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const moveResult = moveMenuNode(menuSync.items, nodeKey, targetKey, position);
      if (!moveResult.ok) {
        const isLocal4Source = String(nodeKey || "").startsWith("local4:");
        const isLocal4Target = String(targetKey || "").startsWith("local4:");
        const errMsg =
          isLocal4Source || isLocal4Target
            ? "Editor-only (level 4) menu items cannot be moved in Shopify. Shopify supports up to 3 nesting levels. Move items to shallower positions first."
            : moveResult.error;
        return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
      }

      const updateResult = await updateMenuTree(
        shop,
        tokenResult.token,
        apiVersion,
        menuSync.menuId,
        menuSync.menuTitle,
        menuSync.menuHandle,
        moveResult.items
      );
      if (!updateResult.ok) {
        await logMappingAudit({
          shop,
          action,
          summary: "Failed to move menu node",
          status: "error",
          errorMessage: updateResult.error,
          details: { nodeKey, targetKey, position },
        });
        return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
      }

      const synced = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
      await logMappingAudit({
        shop,
        action,
        summary: `Moved node ${nodeKey} ${position} ${targetKey}`,
        status: "ok",
      });

      return NextResponse.json({
        ok: true,
        shop,
        menu: { id: updateResult.menuId, handle: updateResult.menuHandle, title: updateResult.menuTitle },
        backend: synced.backend,
        warning: synced.warning || "",
        menuLinks: flattenMenuLinks(updateResult.items),
        nodes: synced.nodes,
        mappedNodes: synced.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "edit-menu-node") {
      const nodeKey = normalizeText(body.nodeKey || "");
      const label = normalizeText(body.label || "");
      const linkTypeRaw = normalizeMenuLinkTypeInput(body.linkType || "");
      const linkValue = normalizeText(body.linkValue || "");
      const linkTargetIdInput = normalizeText(body.linkTargetId || "");
      const linkUrl = normalizeText(body.linkUrl || "");

      if (!nodeKey) {
        return NextResponse.json({ ok: false, error: "nodeKey is required." }, { status: 400 });
      }
      if (!label) {
        return NextResponse.json({ ok: false, error: "label is required." }, { status: 400 });
      }
      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }

      const linkTargetsResult = await fetchMenuLinkTargets(
        shop,
        tokenResult.token,
        apiVersion,
        collectionsResult.collections
      );
      const menuSync = await fetchMenuTree(shop, tokenResult.token, apiVersion, menuHandle);
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        await logMappingAudit({
          shop,
          action,
          summary: `Failed to edit menu node "${nodeKey}"`,
          status: "error",
          errorMessage: menuSync.error,
          details: { nodeKey, label, linkType: linkTypeRaw, linkValue, linkTargetId: linkTargetIdInput, linkUrl, menuHandle },
        });
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const items = sanitizeMenuItemTree(menuSync.items);
      const index = findMenuNodeIndex(items);
      const target = index.get(nodeKey);
      if (!target) {
        const isLocal4 = String(nodeKey || "").startsWith("local4:");
        const errMsg = isLocal4
          ? "This menu item is editor-only (level 4) and cannot be synced to Shopify. Shopify supports up to 3 nesting levels. Move it to a shallower position first."
          : "Menu node was not found.";
        return NextResponse.json({ ok: false, error: errMsg }, { status: 404 });
      }

      const linkType = linkTypeRaw || normalizeText(target.node.type || "HTTP").toUpperCase() || "HTTP";
      const resolvedLinkTargetId =
        linkTargetIdInput ||
        (linkType === "COLLECTION"
          ? resolveTargetIdFromValue(linkTargetsResult.targets.collections, linkValue, "COLLECTION")
          : linkType === "PAGE"
            ? resolveTargetIdFromValue(linkTargetsResult.targets.pages, linkValue, "PAGE")
            : linkType === "PRODUCT"
              ? resolveTargetIdFromValue(linkTargetsResult.targets.products, linkValue, "PRODUCT")
              : linkType === "BLOG"
                ? resolveTargetIdFromValue(linkTargetsResult.targets.blogs, linkValue, "BLOG")
                : "");
      const effectiveTargetId = resolvedLinkTargetId || normalizeText(target.node.resourceId || "") || null;
      const effectiveLinkUrl = linkType === "HTTP" ? linkValue || linkUrl || normalizeText(target.node.url || "") : linkUrl || normalizeText(target.node.url || "");

      target.node.title = label;
      const linkApplyResult = applyMenuNodeLink(
        target.node,
        linkType,
        effectiveTargetId,
        effectiveLinkUrl,
        collectionsResult.collections,
        linkTargetsResult.targets
      );
      if (!linkApplyResult.ok) {
        const baseErr = linkApplyResult.error;
        const hint =
          linkType === "PAGE" && (baseErr.includes("target") || baseErr.includes("PAGE"))
            ? " Select a page from the list and ensure your Shopify app has read access to pages."
            : "";
        return NextResponse.json({ ok: false, error: baseErr + hint }, { status: 400 });
      }

      const updateResult = await updateMenuTree(
        shop,
        tokenResult.token,
        apiVersion,
        menuSync.menuId,
        menuSync.menuTitle,
        menuSync.menuHandle,
        items
      );
      if (!updateResult.ok) {
        await logMappingAudit({
          shop,
          action,
          summary: `Failed to edit menu node "${nodeKey}"`,
          status: "error",
          errorMessage: updateResult.error,
          details: { nodeKey, label, linkType, linkValue, linkTargetId: effectiveTargetId, linkUrl },
        });
        return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
      }

      const synced = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
      await logMappingAudit({
        shop,
        action,
        summary: `Edited menu node "${label}"`,
        status: "ok",
        details: { nodeKey, linkType, linkValue, linkTargetId: effectiveTargetId, linkUrl },
      });

      return NextResponse.json({
        ok: true,
        shop,
        menu: { id: updateResult.menuId, handle: updateResult.menuHandle, title: updateResult.menuTitle },
        backend: synced.backend,
        warning: joinWarnings(synced.warning, linkTargetsResult.warning),
        menuLinks: flattenMenuLinks(updateResult.items),
        linkTargets: linkTargetsResult.targets,
        nodes: synced.nodes,
        mappedNodes: synced.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "delete-menu-node") {
      const nodeKey = normalizeText(body.nodeKey || "");
      if (!nodeKey) {
        return NextResponse.json({ ok: false, error: "nodeKey is required." }, { status: 400 });
      }

      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }

      const linkTargetsResult = await fetchMenuLinkTargets(
        shop,
        tokenResult.token,
        apiVersion,
        collectionsResult.collections
      );
      const menuSync = await fetchMenuTree(shop, tokenResult.token, apiVersion, menuHandle);
      if (!menuSync.ok) {
        const status = isMenuScopeErrorMessage(menuSync.error) ? 403 : 500;
        await logMappingAudit({
          shop,
          action,
          summary: `Failed to delete menu node "${nodeKey}"`,
          status: "error",
          errorMessage: menuSync.error,
          details: { nodeKey, menuHandle },
        });
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const items = sanitizeMenuItemTree(menuSync.items);
      const removed = removeMenuNode(items, nodeKey);
      if (!removed.removed) {
        return NextResponse.json({ ok: false, error: "Menu node was not found." }, { status: 404 });
      }

      const updateResult = await updateMenuTree(
        shop,
        tokenResult.token,
        apiVersion,
        menuSync.menuId,
        menuSync.menuTitle,
        menuSync.menuHandle,
        removed.rows
      );
      if (!updateResult.ok) {
        await logMappingAudit({
          shop,
          action,
          summary: `Failed to delete menu node "${nodeKey}"`,
          status: "error",
          errorMessage: updateResult.error,
          details: { nodeKey },
        });
        return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
      }

      const synced = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
      await logMappingAudit({
        shop,
        action,
        summary: `Deleted menu node "${normalizeText(removed.removed.title) || nodeKey}"`,
        status: "ok",
        details: { nodeKey },
      });

      return NextResponse.json({
        ok: true,
        shop,
        menu: { id: updateResult.menuId, handle: updateResult.menuHandle, title: updateResult.menuTitle },
        backend: synced.backend,
        warning: joinWarnings(synced.warning, linkTargetsResult.warning),
        menuLinks: flattenMenuLinks(updateResult.items),
        linkTargets: linkTargetsResult.targets,
        nodes: synced.nodes,
        mappedNodes: synced.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "toggle-node" || action === "toggle-nodes" || action === "bulk-toggle-nodes") {
      const singleNodeKey = normalizeText(body.nodeKey || "");
      const requestedNodeKeys = Array.from(
        new Set(
          (Array.isArray(body.nodeKeys) ? body.nodeKeys : [])
            .map((row) => normalizeText(row))
            .filter(Boolean)
            .concat(singleNodeKey ? [singleNodeKey] : [])
        )
      );
      const requestedDirectCollectionIds = Array.from(
        new Set(
          (Array.isArray(body.directCollectionIds) ? body.directCollectionIds : [])
            .map((row) => normalizeText(row))
            .filter(Boolean)
        )
      );
      const requestedProductIds =
        action === "bulk-toggle-nodes"
          ? Array.from(
              new Set(
                (Array.isArray(body.productIds) ? body.productIds : [])
                  .map((row) => normalizeText(row))
                  .filter(Boolean)
              )
            )
          : Array.from(new Set([normalizeText(body.productId || "")].filter(Boolean)));
      const checked = parseBool(body.checked);
      const uncheckPolicy = toUncheckPolicy(body.uncheckPolicy);
      if (requestedProductIds.length < 1 || (requestedNodeKeys.length < 1 && requestedDirectCollectionIds.length < 1)) {
        return NextResponse.json(
          { ok: false, error: "productIds and at least one node key or direct collection ID are required." },
          { status: 400 }
        );
      }

      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }
      const collectionById = new Map(
        collectionsResult.collections.map((row): [string, CollectionOption] => [normalizeText(row.id), row])
      );
      const invalidDirectCollectionIds = requestedDirectCollectionIds.filter((id) => !collectionById.has(id));
      if (invalidDirectCollectionIds.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "One or more direct collection IDs are invalid.",
            invalidDirectCollectionIds,
          },
          { status: 400 }
        );
      }

      const menuSyncResult = await syncMenuNodesFromShopify(
        shop,
        tokenResult.token,
        apiVersion,
        menuHandle,
        collectionsResult.collections
      );
      if (!menuSyncResult.ok) {
        const status = isMenuScopeErrorMessage(menuSyncResult.error) ? 403 : 500;
        return NextResponse.json({ ok: false, error: menuSyncResult.error }, { status });
      }

      const nodesResult = menuSyncResult.synced;
      const nodes = nodesResult.nodes.filter((node) => node.enabled && Boolean(node.collectionId));
      const nodeByKey = new Map<string, MenuNodeRecord>(
        nodes.map((node): [string, MenuNodeRecord] => [node.nodeKey, node])
      );
      const invalidNodeKeys = requestedNodeKeys.filter((key) => {
        const candidate = nodeByKey.get(key);
        return !candidate || !candidate.collectionId;
      });
      if (invalidNodeKeys.length > 0) {
        return NextResponse.json(
          { ok: false, error: "One or more selected collections are not mapped to a collection.", invalidNodeKeys },
          { status: 400 }
        );
      }

      const parentMap = buildParentMap(nodes);
      const childrenMap = buildChildrenMap(nodes);
      const mappedCollectionIds = new Set(nodes.map((node) => normalizeText(node.collectionId)).filter(Boolean));
      const managedCollectionIds = new Set<string>([...mappedCollectionIds, ...requestedDirectCollectionIds]);
      const activeToken = String(tokenResult.token || "");
      const requestedTargetSummary = [
        ...requestedNodeKeys,
        ...requestedDirectCollectionIds.map((id) => `collection:${id}`),
      ].join(",");

      async function processOneProduct(productId: string) {
        const productGid = toProductGid(productId);
        if (!productGid) {
          return { ok: false as const, productId, error: "Invalid product ID." };
        }

        const currentResult = await fetchProductCollections(shop, activeToken, apiVersion, productGid);
        if ("error" in currentResult) {
          await logCollectionMappingAction({
            shop,
            productId,
            productTitle: "",
            nodeKey: requestedTargetSummary,
            checked,
            addedCollectionIds: [],
            removedCollectionIds: [],
            status: "error",
            errorMessage: currentResult.error,
          });
          return { ok: false as const, productId, error: currentResult.error };
        }

        const currentCollectionSet = new Set(currentResult.collectionIds);
        const currentSelectedNodes = new Set<string>();
        for (const node of nodes) {
          const collectionId = normalizeText(node.collectionId);
          if (collectionId && currentCollectionSet.has(collectionId)) {
            currentSelectedNodes.add(node.nodeKey);
          }
        }

        const desiredNodes = checked ? new Set<string>() : new Set(currentSelectedNodes);
        if (checked) {
          for (const key of requestedNodeKeys) {
            desiredNodes.add(key);
            for (const ancestor of collectAncestors(key, parentMap)) desiredNodes.add(ancestor);
          }
        } else {
          for (const key of requestedNodeKeys) {
            desiredNodes.delete(key);
            if (uncheckPolicy === "remove-descendants") {
              for (const descendant of collectDescendants(key, childrenMap)) desiredNodes.delete(descendant);
            }
          }
        }

        const closedNodes = enforceAncestorClosure(desiredNodes, parentMap);
        const desiredCollectionIds = new Set<string>();
        for (const key of closedNodes) {
          const node = nodeByKey.get(key);
          const collectionId = normalizeText(node?.collectionId);
          if (collectionId) desiredCollectionIds.add(collectionId);
        }
        if (checked) {
          for (const collectionId of requestedDirectCollectionIds) {
            desiredCollectionIds.add(collectionId);
          }
        } else {
          for (const collectionId of requestedDirectCollectionIds) {
            desiredCollectionIds.delete(collectionId);
          }
        }

        const additions: string[] = [];
        const removals: string[] = [];
        for (const collectionId of desiredCollectionIds) {
          if (!currentCollectionSet.has(collectionId)) additions.push(collectionId);
        }
        for (const currentCollectionId of currentCollectionSet) {
          if (!managedCollectionIds.has(currentCollectionId)) continue;
          if (!desiredCollectionIds.has(currentCollectionId)) removals.push(currentCollectionId);
        }

        if (additions.length < 1 && removals.length < 1) {
          const checkedNodeKeys = nodes
            .filter((node) => node.collectionId && currentCollectionSet.has(node.collectionId))
            .map((node) => node.nodeKey);
          await logCollectionMappingAction({
            shop,
            productId: currentResult.productId,
            productTitle: currentResult.title,
            nodeKey: requestedTargetSummary,
            checked,
            addedCollectionIds: [],
            removedCollectionIds: [],
            status: "ok",
            errorMessage: "No Shopify collection updates were required.",
          });
          return {
            ok: true as const,
            product: {
              id: currentResult.productId,
              title: currentResult.title,
              collectionIds: currentResult.collectionIds,
              checkedNodeKeys,
            },
            addedCollectionIds: additions,
            removedCollectionIds: removals,
            warning: "",
          };
        }

        const errors: string[] = [];
        for (const collectionId of additions) {
          const error = await applyCollectionAdd(shop, activeToken, apiVersion, collectionId, productGid);
          if (error) errors.push(error);
        }
        for (const collectionId of removals) {
          const error = await applyCollectionRemove(shop, activeToken, apiVersion, collectionId, productGid);
          if (error) errors.push(error);
        }

        invalidateShopCache(productsCache, shop);
        const refreshedResult = await fetchProductCollections(shop, activeToken, apiVersion, productGid);
        if ("error" in refreshedResult) {
          await logCollectionMappingAction({
            shop,
            productId: currentResult.productId,
            productTitle: currentResult.title,
            nodeKey: requestedTargetSummary,
            checked,
            addedCollectionIds: additions,
            removedCollectionIds: removals,
            status: "error",
            errorMessage: refreshedResult.error,
          });
          return { ok: false as const, productId, error: refreshedResult.error };
        }

        const refreshedMembership = new Set(refreshedResult.collectionIds);
        const checkedNodeKeys = nodes
          .filter((node) => node.collectionId && refreshedMembership.has(node.collectionId))
          .map((node) => node.nodeKey);
        await logCollectionMappingAction({
          shop,
          productId: refreshedResult.productId,
          productTitle: refreshedResult.title,
          nodeKey: requestedTargetSummary,
          checked,
          addedCollectionIds: additions,
          removedCollectionIds: removals,
          status: errors.length > 0 ? "error" : "ok",
          errorMessage: errors.join(" | "),
        });
        return {
          ok: errors.length < 1,
          product: {
            id: refreshedResult.productId,
            title: refreshedResult.title,
            collectionIds: refreshedResult.collectionIds,
            checkedNodeKeys,
          },
          addedCollectionIds: additions,
          removedCollectionIds: removals,
          warning: errors.join(" | "),
        };
      }

      const outcomes: Array<
        | {
            ok: boolean;
            product: {
              id: string;
              title: string;
              collectionIds: string[];
              checkedNodeKeys: string[];
            };
            addedCollectionIds: string[];
            removedCollectionIds: string[];
            warning: string;
          }
        | { ok: false; productId: string; error: string }
      > = [];
      for (const id of requestedProductIds) {
        outcomes.push(await processOneProduct(id));
      }

      const failed = outcomes.filter((row) => !row.ok) as Array<{ ok: false; productId: string; error: string }>;
      const succeeded = outcomes.filter(
        (row): row is {
          ok: boolean;
          product: {
            id: string;
            title: string;
            collectionIds: string[];
            checkedNodeKeys: string[];
          };
          addedCollectionIds: string[];
          removedCollectionIds: string[];
          warning: string;
        } => "product" in row
      );
      const warnings = succeeded.map((row) => row.warning).filter(Boolean);

      await logMappingAudit({
        shop,
        action,
        summary:
          `${checked ? "Checked" : "Unchecked"} ${requestedNodeKeys.length} node(s), ` +
          `${requestedDirectCollectionIds.length} direct collection(s) for ${requestedProductIds.length} product(s)`,
        status: failed.length > 0 ? "error" : "ok",
        details: {
          requestedProductIds,
          requestedNodeKeys,
          requestedDirectCollectionIds,
          checked,
          failedCount: failed.length,
        },
        errorMessage: failed.map((row) => `${row.productId}: ${row.error}`).join(" | "),
      });

      if (requestedProductIds.length === 1 && succeeded[0]) {
        return NextResponse.json({
          ok: failed.length < 1 && succeeded[0].ok,
          shop,
          uncheckPolicy,
          product: succeeded[0].product,
          requestedNodeKeys,
          requestedDirectCollectionIds,
          addedCollectionIds: succeeded[0].addedCollectionIds,
          removedCollectionIds: succeeded[0].removedCollectionIds,
          warning: joinWarnings(...warnings, ...failed.map((row) => row.error), menuSyncResult.warning, nodesResult.warning),
        });
      }

      return NextResponse.json({
        ok: failed.length < 1,
        shop,
        uncheckPolicy,
        requestedNodeKeys,
        requestedDirectCollectionIds,
        processedCount: requestedProductIds.length,
        failedCount: failed.length,
        products: succeeded.map((row) => row.product),
        failures: failed,
        warning: joinWarnings(...warnings, ...failed.map((row) => row.error), menuSyncResult.warning, nodesResult.warning),
      });
    }

    await logMappingAudit({
      shop,
      action,
      summary: `Unsupported action: ${action}`,
      status: "error",
      errorMessage: "Unsupported action",
    });
    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message || "Collection mapping update failed" }, { status: 500 });
  }
}
