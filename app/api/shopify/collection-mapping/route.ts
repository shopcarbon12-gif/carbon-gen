import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
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
  type LiveMenuNodeInput,
  type MappingAuditLogRow,
  type MenuNodeRecord,
  listAndEnsureMenuNodes,
  listMappingAuditLogs,
  logMappingAudit,
  saveMenuMappings,
  logCollectionMappingAction,
  syncLiveMenuNodes,
} from "@/lib/shopifyCollectionMappingRepository";

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
const MAX_MENU_DEPTH = 3;
const DEFAULT_MENU_HANDLE = normalizeText(process.env.SHOPIFY_COLLECTION_MAPPING_MENU_HANDLE || "main-menu") || "main-menu";
const REQUIRED_MENU_SCOPES = ["read_online_store_navigation", "write_online_store_navigation"] as const;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const collectionsCache = new Map<string, CacheEntry<CollectionOption[]>>();
const productsCache = new Map<string, CacheEntry<ProductRow[]>>();

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
  const candidates = await getTokenCandidates(shop);
  if (!candidates.length) {
    return { ok: false as const, error: "Shop not connected." };
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
        return { ok: true as const, token: candidate.token, source: candidate.source };
      }
    }

    lastError = probe.errors ? JSON.stringify(probe.errors).slice(0, 240) : "Invalid Shopify token";
  }

  if (firstUsableToken) {
    return { ok: true as const, token: firstUsableToken.token, source: firstUsableToken.source };
  }

  return {
    ok: false as const,
    error: `Shop token validation failed.${lastError ? ` ${lastError}` : ""}`,
  };
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
      warning: `Failed to load menu link targets: ${JSON.stringify(gqlResult.errors || "unknown")}`,
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
    mutation UpdateMenuForCollectionMapping($menu: MenuUpdateInput!) {
      menuUpdate(menu: $menu) {
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

  const menuInput = {
    id: menuId,
    title: menuTitle,
    handle: menuHandle,
    items: buildMenuUpdateItems(items),
  };

  const gqlResult: GraphResult<MenuUpdateData> = (await runShopifyGraphql<MenuUpdateData>({
    shop,
    token,
    apiVersion,
    query: mutation,
    variables: { menu: menuInput },
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
    return { ok: false, error: "Invalid drag target/source node." };
  }
  if (sourceKey === targetKey) {
    return { ok: false, error: "Cannot move a node onto itself." };
  }

  const descendants = collectMenuDescendantKeys(source.node);
  if (descendants.has(targetKey)) {
    return { ok: false, error: "Cannot move a parent node into one of its descendants." };
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
    return { ok: false, error: "Shopify menu supports up to 3 nested levels." };
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
    return { ok: false, error: "Failed to detach source node for move." };
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
    return { ok: false, error: "Failed to insert moved node at the target position." };
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

function mapProductRowToResponse(row: ProductRow, nodes: MenuNodeRecord[]) {
  const membership = new Set(row.collectionIds);
  const checkedNodeKeys = nodes
    .filter((node) => node.enabled && node.collectionId && membership.has(node.collectionId))
    .map((node) => node.nodeKey);

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
  };
}

export async function GET(req: NextRequest) {
  if (!isModuleEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Shopify Collection Mapping is disabled by environment flag." },
      { status: 403 }
    );
  }

  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawShop = normalizeText(searchParams.get("shop") || "");
    const menuHandle = parseMenuHandleParam(searchParams.get("menuHandle"));
    const includeLogs = parseBool(searchParams.get("includeLogs"));
    const logLimit = parseLogLimit(searchParams.get("logLimit"));
    const shop = await resolveShop(rawShop);
    if (!shop) {
      return NextResponse.json({ ok: false, error: "Missing Shopify shop." }, { status: 400 });
    }

    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(250, parsePositiveInt(searchParams.get("pageSize"), 30));

    const filters: ProductFilters = {
      q: normalizeText(searchParams.get("q") || ""),
      title: normalizeText(searchParams.get("title") || ""),
      sku: normalizeText(searchParams.get("sku") || ""),
      upc: normalizeText(searchParams.get("upc") || ""),
      itemType: normalizeText(searchParams.get("itemType") || ""),
    };

    const sortField = toSortField(normalizeText(searchParams.get("sortField") || "title"));
    const sortDir = toSortDir(normalizeText(searchParams.get("sortDir") || "asc"));

    const { apiVersion } = getShopifyConfig(new URL(req.url).origin);
    const tokenResult = await resolveWorkingToken(shop, apiVersion);
    if (!tokenResult.ok) {
      return NextResponse.json({ ok: false, error: tokenResult.error }, { status: 401 });
    }

    const [collectionsResult, productsResult] = await Promise.all([
      fetchAllCollectionsCached(shop, tokenResult.token, apiVersion),
      fetchAllProductsCached(shop, tokenResult.token, apiVersion),
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

    const filtered = productsResult.products.filter((row) => productMatchesFilters(row, filters));

    const sorted = [...filtered].sort((left, right) => compareRows(left, right, sortField));
    if (sortDir === "desc") sorted.reverse();

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    const start = (clampedPage - 1) * pageSize;
    const paged = sorted.slice(start, start + pageSize);

    const logsResult = includeLogs ? await listMappingAuditLogs(shop, logLimit) : null;
    const warningParts = [
      normalizeText(menuSyncResult.warning),
      normalizeText(nodesResult.warning),
      normalizeText(linkTargetsResult.warning),
      normalizeText(logsResult?.warning),
    ].filter(Boolean);

    return NextResponse.json({
      ok: true,
      shop,
      backend: nodesResult.backend,
      warning: warningParts.join(" | "),
      filters,
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
      menuLinks: flattenMenuLinks(menuSyncResult.menu.items),
      linkTargets: linkTargetsResult.targets,
      collections: collectionsResult.collections,
      nodes,
      mappedNodes: nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      rows: paged.map((row) => mapProductRowToResponse(row, nodes)),
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

  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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

    if (action === "save-mappings") {
      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
      }

      const mappings = Array.isArray(body.mappings)
        ? (body.mappings as Array<{ nodeKey: string; collectionId: string | null; enabled?: boolean }>)
        : [];
      const saved = await saveMenuMappings(shop, mappings, collectionsResult.collections);
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
      const collectionId = normalizeText(body.collectionId || "") || null;
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

      const collectionMatch = collectionId
        ? collectionsResult.collections.find((row) => normalizeText(row.id) === collectionId) || null
        : null;

      const shouldSyncMenuLink = syncMenuLink && !menuSync.menuAccessDenied;
      if (syncMenuLink && menuSync.menuAccessDenied) {
        actionWarning = joinWarnings(
          actionWarning,
          "Collection mapping was saved, but Shopify menu link sync is blocked until navigation scopes are granted."
        );
      }

      if (shouldSyncMenuLink) {
        const items = sanitizeMenuItemTree(menuSync.menu.items);
        const index = findMenuNodeIndex(items);
        const target = index.get(nodeKey);
        if (!target) {
          return NextResponse.json({ ok: false, error: "Menu node was not found." }, { status: 404 });
        }

        updateItemCollectionLink(target.node, collectionMatch);
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
          await logMappingAudit({
            shop,
            action,
            summary: `Failed to update menu link for node ${nodeKey}`,
            status: "error",
            errorMessage: updateResult.error,
            details: { nodeKey, collectionId },
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
            collectionId,
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
          collectionId,
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

    if (action === "create-menu-node") {
      const label = normalizeText(body.label || "");
      const parentKey = normalizeText(body.parentKey || "") || null;
      const legacyCollectionId = normalizeText(body.collectionId || "");
      const linkType = normalizeText(body.linkType || (legacyCollectionId ? "COLLECTION" : "HTTP")).toUpperCase() || "HTTP";
      const linkTargetId = normalizeText(body.linkTargetId || legacyCollectionId) || null;
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
          details: { label, parentKey, linkType, linkTargetId, linkUrl, menuHandle },
        });
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const items = sanitizeMenuItemTree(menuSync.items);
      const index = findMenuNodeIndex(items);
      if (parentKey) {
        const parent = index.get(parentKey);
        if (!parent) {
          return NextResponse.json({ ok: false, error: "Parent menu node was not found." }, { status: 404 });
        }
        if (parent.depth + 1 > MAX_MENU_DEPTH) {
          return NextResponse.json(
            { ok: false, error: "Shopify menu supports up to 3 nested levels." },
            { status: 400 }
          );
        }
      }

      const newItem: ShopifyMenuItemNode = {
        title: label,
        type: "HTTP",
        url: "/collections/all",
        resourceId: null,
        tags: [],
        items: [],
      };
      const linkApplyResult = applyMenuNodeLink(
        newItem,
        linkType,
        linkTargetId,
        linkUrl,
        collectionsResult.collections,
        linkTargetsResult.targets
      );
      if (!linkApplyResult.ok) {
        return NextResponse.json({ ok: false, error: linkApplyResult.error }, { status: 400 });
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
        await logMappingAudit({
          shop,
          action,
          summary: `Failed to create menu node "${label}"`,
          status: "error",
          errorMessage: updateResult.error,
          details: { label, parentKey, linkType, linkTargetId, linkUrl },
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
        details: { parentKey, linkType, linkTargetId, linkUrl, nodeKey: createdNode?.nodeKey || null },
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
        return NextResponse.json({ ok: false, error: moveResult.error }, { status: 400 });
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
      const linkType = normalizeText(body.linkType || "").toUpperCase();
      const linkTargetId = normalizeText(body.linkTargetId || "") || null;
      const linkUrl = normalizeText(body.linkUrl || "");

      if (!nodeKey) {
        return NextResponse.json({ ok: false, error: "nodeKey is required." }, { status: 400 });
      }
      if (!label) {
        return NextResponse.json({ ok: false, error: "label is required." }, { status: 400 });
      }
      if (!linkType) {
        return NextResponse.json({ ok: false, error: "linkType is required." }, { status: 400 });
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
          details: { nodeKey, label, linkType, linkTargetId, linkUrl, menuHandle },
        });
        return NextResponse.json({ ok: false, error: menuSync.error }, { status });
      }

      const items = sanitizeMenuItemTree(menuSync.items);
      const index = findMenuNodeIndex(items);
      const target = index.get(nodeKey);
      if (!target) {
        return NextResponse.json({ ok: false, error: "Menu node was not found." }, { status: 404 });
      }

      target.node.title = label;
      const linkApplyResult = applyMenuNodeLink(
        target.node,
        linkType,
        linkTargetId,
        linkUrl,
        collectionsResult.collections,
        linkTargetsResult.targets
      );
      if (!linkApplyResult.ok) {
        return NextResponse.json({ ok: false, error: linkApplyResult.error }, { status: 400 });
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
          details: { nodeKey, label, linkType, linkTargetId, linkUrl },
        });
        return NextResponse.json({ ok: false, error: updateResult.error }, { status: 500 });
      }

      const synced = await syncLiveMenuNodes(shop, updateResult.liveNodes, collectionsResult.collections);
      await logMappingAudit({
        shop,
        action,
        summary: `Edited menu node "${label}"`,
        status: "ok",
        details: { nodeKey, linkType, linkTargetId, linkUrl },
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

    if (action === "toggle-node") {
      const productId = normalizeText(body.productId || "");
      const nodeKey = normalizeText(body.nodeKey || "");
      const checked = parseBool(body.checked);
      const uncheckPolicy = toUncheckPolicy(body.uncheckPolicy);
      if (!productId || !nodeKey) {
        return NextResponse.json({ ok: false, error: "productId and nodeKey are required." }, { status: 400 });
      }

      const collectionsResult = await fetchAllCollectionsCached(shop, tokenResult.token, apiVersion);
      if ("error" in collectionsResult) {
        return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
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
      const targetNode = nodeByKey.get(nodeKey);
      if (!targetNode || !targetNode.collectionId) {
        return NextResponse.json({ ok: false, error: "Selected node is not mapped to a collection." }, { status: 400 });
      }

      const productGid = toProductGid(productId);
      if (!productGid) {
        return NextResponse.json({ ok: false, error: "Invalid product ID." }, { status: 400 });
      }

      const currentResult = await fetchProductCollections(shop, tokenResult.token, apiVersion, productGid);
      if ("error" in currentResult) {
        await logCollectionMappingAction({
          shop,
          productId,
          productTitle: "",
          nodeKey,
          checked,
          addedCollectionIds: [],
          removedCollectionIds: [],
          status: "error",
          errorMessage: currentResult.error,
        });
        return NextResponse.json({ ok: false, error: currentResult.error }, { status: 500 });
      }

      const currentCollectionSet = new Set(currentResult.collectionIds);
      const parentMap = buildParentMap(nodes);
      const childrenMap = buildChildrenMap(nodes);
      const mappedCollectionIds = new Set(nodes.map((node) => normalizeText(node.collectionId)).filter(Boolean));

      const currentSelectedNodes = new Set<string>();
      for (const node of nodes) {
        const collectionId = normalizeText(node.collectionId);
        if (collectionId && currentCollectionSet.has(collectionId)) {
          currentSelectedNodes.add(node.nodeKey);
        }
      }

      const desiredNodes = new Set(currentSelectedNodes);
      if (checked) {
        desiredNodes.add(nodeKey);
        for (const ancestor of collectAncestors(nodeKey, parentMap)) {
          desiredNodes.add(ancestor);
        }
      } else {
        desiredNodes.delete(nodeKey);
        if (uncheckPolicy === "remove-descendants") {
          for (const descendant of collectDescendants(nodeKey, childrenMap)) {
            desiredNodes.delete(descendant);
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

      const additions: string[] = [];
      const removals: string[] = [];

      for (const collectionId of desiredCollectionIds) {
        if (!currentCollectionSet.has(collectionId)) additions.push(collectionId);
      }

      for (const currentCollectionId of currentCollectionSet) {
        if (!mappedCollectionIds.has(currentCollectionId)) continue;
        if (!desiredCollectionIds.has(currentCollectionId)) removals.push(currentCollectionId);
      }

      if (additions.length < 1 && removals.length < 1) {
        const checkedNodeKeys = nodes
          .filter((node) => node.collectionId && currentCollectionSet.has(node.collectionId))
          .map((node) => node.nodeKey);

        let noChangeMessage = "No Shopify collection updates were required.";
        if (
          !checked &&
          uncheckPolicy === "keep-descendants" &&
          currentSelectedNodes.has(nodeKey) &&
          checkedNodeKeys.includes(nodeKey)
        ) {
          noChangeMessage =
            "Node stayed checked because at least one selected child still requires its parent category.";
        }

        await logCollectionMappingAction({
          shop,
          productId: currentResult.productId,
          productTitle: currentResult.title,
          nodeKey,
          checked,
          addedCollectionIds: [],
          removedCollectionIds: [],
          status: "ok",
          errorMessage: noChangeMessage,
        });
        await logMappingAudit({
          shop,
          action: "toggle-node",
          summary: `No-op toggle on ${nodeKey}`,
          status: "ok",
          details: { productId: currentResult.productId, checked, reason: noChangeMessage },
        });

        return NextResponse.json({
          ok: true,
          noop: true,
          shop,
          uncheckPolicy,
          product: {
            id: currentResult.productId,
            title: currentResult.title,
            collectionIds: currentResult.collectionIds,
            checkedNodeKeys,
          },
          addedCollectionIds: [],
          removedCollectionIds: [],
          warning: joinWarnings(noChangeMessage, menuSyncResult.warning, nodesResult.warning),
        });
      }

      const errors: string[] = [];
      for (const collectionId of additions) {
        const error = await applyCollectionAdd(shop, tokenResult.token, apiVersion, collectionId, productGid);
        if (error) errors.push(error);
      }

      for (const collectionId of removals) {
        const error = await applyCollectionRemove(shop, tokenResult.token, apiVersion, collectionId, productGid);
        if (error) errors.push(error);
      }

      invalidateShopCache(productsCache, shop);

      const refreshedResult = await fetchProductCollections(shop, tokenResult.token, apiVersion, productGid);
      if ("error" in refreshedResult) {
        await logCollectionMappingAction({
          shop,
          productId: currentResult.productId,
          productTitle: currentResult.title,
          nodeKey,
          checked,
          addedCollectionIds: additions,
          removedCollectionIds: removals,
          status: "error",
          errorMessage: refreshedResult.error,
        });
        return NextResponse.json({ ok: false, error: refreshedResult.error }, { status: 500 });
      }

      const refreshedMembership = new Set(refreshedResult.collectionIds);
      const checkedNodeKeys = nodes
        .filter((node) => node.collectionId && refreshedMembership.has(node.collectionId))
        .map((node) => node.nodeKey);

      await logCollectionMappingAction({
        shop,
        productId: refreshedResult.productId,
        productTitle: refreshedResult.title,
        nodeKey,
        checked,
        addedCollectionIds: additions,
        removedCollectionIds: removals,
        status: errors.length > 0 ? "error" : "ok",
        errorMessage: errors.join(" | "),
      });
      await logMappingAudit({
        shop,
        action: "toggle-node",
        summary: `${checked ? "Checked" : "Unchecked"} ${nodeKey} for ${refreshedResult.title}`,
        status: errors.length > 0 ? "error" : "ok",
        details: {
          productId: refreshedResult.productId,
          nodeKey,
          checked,
          addedCollectionIds: additions,
          removedCollectionIds: removals,
        },
        errorMessage: errors.join(" | "),
      });

      return NextResponse.json({
        ok: errors.length < 1,
        shop,
        uncheckPolicy,
        product: {
          id: refreshedResult.productId,
          title: refreshedResult.title,
          collectionIds: refreshedResult.collectionIds,
          checkedNodeKeys,
        },
        addedCollectionIds: additions,
        removedCollectionIds: removals,
        warning: joinWarnings(errors.join(" | "), menuSyncResult.warning, nodesResult.warning),
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
