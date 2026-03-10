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
  type MenuNodeRecord,
  listAndEnsureMenuNodes,
  saveMenuMappings,
  resetMenuMappingsToDefault,
  logCollectionMappingAction,
} from "@/lib/shopifyCollectionMappingRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BASE_PRODUCT_QUERY = "status:active -status:unlisted published_status:published";
const MAX_PRODUCT_PAGES = 60;
const PRODUCT_PAGE_SIZE = 100;
const MAX_COLLECTION_PAGES = 20;
const COLLECTION_PAGE_SIZE = 250;

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

function isModuleEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return normalizeLower(process.env.ENABLE_SHOPIFY_COLLECTION_MAPPING || "") === "true";
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

  let lastError = "";
  for (const candidate of candidates) {
    const probe = await runShopifyGraphql<{ shop: { id: string } }>({
      shop,
      token: candidate.token,
      apiVersion,
      query: `query ProbeShopConnection { shop { id } }`,
    });

    if (probe.ok && probe.data?.shop?.id) {
      return { ok: true as const, token: candidate.token, source: candidate.source };
    }

    lastError = probe.errors ? JSON.stringify(probe.errors).slice(0, 240) : "Invalid Shopify token";
  }

  return {
    ok: false as const,
    error: `Shop token validation failed.${lastError ? ` ${lastError}` : ""}`,
  };
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
            productsCount
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

function enforceAncestorClosure(selected: Set<string>, parentMap: Map<string, string | null>) {
  const out = new Set<string>(selected);
  for (const key of Array.from(out)) {
    for (const ancestor of collectAncestors(key, parentMap)) {
      out.add(ancestor);
    }
  }
  return out;
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
      { ok: false, error: "Shopify Collection Mapping is local-only and disabled in production." },
      { status: 403 }
    );
  }

  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawShop = normalizeText(searchParams.get("shop") || "");
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
      fetchAllCollections(shop, tokenResult.token, apiVersion),
      fetchAllProducts(shop, tokenResult.token, apiVersion),
    ]);

    if ("error" in collectionsResult) {
      return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
    }
    if ("error" in productsResult) {
      return NextResponse.json({ ok: false, error: productsResult.error }, { status: 500 });
    }

    const nodesResult = await listAndEnsureMenuNodes(shop, collectionsResult.collections);
    const nodes = nodesResult.nodes;

    const filtered = productsResult.products.filter((row) => productMatchesFilters(row, filters));

    const sorted = [...filtered].sort((left, right) => compareRows(left, right, sortField));
    if (sortDir === "desc") sorted.reverse();

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    const start = (clampedPage - 1) * pageSize;
    const paged = sorted.slice(start, start + pageSize);

    return NextResponse.json({
      ok: true,
      shop,
      backend: nodesResult.backend,
      warning: nodesResult.warning || "",
      filters,
      sort: { field: sortField, dir: sortDir },
      page: clampedPage,
      pageSize,
      total,
      totalPages,
      collections: collectionsResult.collections,
      nodes,
      mappedNodes: nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      rows: paged.map((row) => mapProductRowToResponse(row, nodes)),
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
      { ok: false, error: "Shopify Collection Mapping is local-only and disabled in production." },
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
    const shop = await resolveShop(requestedShop);
    if (!shop) {
      return NextResponse.json({ ok: false, error: "Missing Shopify shop." }, { status: 400 });
    }

    const { apiVersion } = getShopifyConfig(new URL(req.url).origin);
    const tokenResult = await resolveWorkingToken(shop, apiVersion);
    if (!tokenResult.ok) {
      return NextResponse.json({ ok: false, error: tokenResult.error }, { status: 401 });
    }

    const collectionsResult = await fetchAllCollections(shop, tokenResult.token, apiVersion);
    if ("error" in collectionsResult) {
      return NextResponse.json({ ok: false, error: collectionsResult.error }, { status: 500 });
    }
    const collections = collectionsResult.collections;

    if (action === "save-mappings") {
      const mappings = Array.isArray(body.mappings)
        ? (body.mappings as Array<{ nodeKey: string; collectionId: string | null; enabled?: boolean }>)
        : [];

      const saved = await saveMenuMappings(shop, mappings, collections);
      return NextResponse.json({
        ok: true,
        shop,
        backend: saved.backend,
        warning: saved.warning || "",
        nodes: saved.nodes,
        mappedNodes: saved.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "reset-mappings") {
      const reset = await resetMenuMappingsToDefault(shop, collections);
      return NextResponse.json({
        ok: true,
        shop,
        backend: reset.backend,
        warning: reset.warning || "",
        nodes: reset.nodes,
        mappedNodes: reset.nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
      });
    }

    if (action === "toggle-node") {
      const productId = normalizeText(body.productId || "");
      const nodeKey = normalizeText(body.nodeKey || "");
      const checked = parseBool(body.checked);
      if (!productId || !nodeKey) {
        return NextResponse.json({ ok: false, error: "productId and nodeKey are required." }, { status: 400 });
      }

      const nodesResult = await listAndEnsureMenuNodes(shop, collections);
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

      const errors: string[] = [];
      for (const collectionId of additions) {
        const error = await applyCollectionAdd(shop, tokenResult.token, apiVersion, collectionId, productGid);
        if (error) errors.push(error);
      }

      for (const collectionId of removals) {
        const error = await applyCollectionRemove(shop, tokenResult.token, apiVersion, collectionId, productGid);
        if (error) errors.push(error);
      }

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

      return NextResponse.json({
        ok: errors.length < 1,
        shop,
        product: {
          id: refreshedResult.productId,
          title: refreshedResult.title,
          collectionIds: refreshedResult.collectionIds,
          checkedNodeKeys,
        },
        addedCollectionIds: additions,
        removedCollectionIds: removals,
        warning: errors.join(" | "),
      });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message || "Collection mapping update failed" }, { status: 500 });
  }
}
