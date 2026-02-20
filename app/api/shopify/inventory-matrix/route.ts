import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";
import { listCartCatalogParentIds } from "@/lib/shopifyCartStaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
const SHOPIFY_PRODUCTS_PER_PAGE = 100;
const MAX_SHOPIFY_SCAN_PAGES = 40;
const SHOPIFY_VARIANTS_CACHE_MS = 5 * 60 * 1000;
const ALLOWED_PAGE_SIZES = [50, 100, 200, 300, 500] as const;

type ShopifyTokenSource = "db" | "env_token";

type CatalogOptions = {
  categories?: string[];
  shops?: string[];
};

type LightspeedCatalogRow = {
  id: string;
  itemId: string;
  itemMatrixId: string;
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

type LightspeedCatalogResponse = {
  ok?: boolean;
  error?: string;
  rows?: LightspeedCatalogRow[];
  total?: number;
  options?: CatalogOptions;
  truncated?: boolean;
};

type ShopifyProductEdge = {
  cursor?: string;
  node?: {
    id?: string;
    title?: string;
    featuredImage?: {
      url?: string | null;
    } | null;
    variants?: {
      nodes?: Array<{
        id?: string;
        sku?: string;
        barcode?: string;
        price?: string | number | null;
        inventoryQuantity?: number | null;
        selectedOptions?: Array<{
          name?: string;
          value?: string;
        }>;
        image?: {
          url?: string | null;
        } | null;
      }>;
    };
  };
};

type ProductsPageData = {
  products?: {
    edges?: ShopifyProductEdge[];
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string | null;
    };
  };
};

type ShopifyVariant = {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  barcode: string;
  price: number | null;
  inventoryQuantity: number | null;
  color: string;
  size: string;
  image: string;
  productImage: string;
};

type MatrixVariantRow = {
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
  price: number | null;
  variations: number;
  image: string;
  availableAt: {
    shopify: boolean;
    cart: boolean;
  };
  variants: MatrixVariantRow[];
};

type FilterState = {
  sku: string;
  name: string;
  priceFrom: number | null;
  priceTo: number | null;
  stockFrom: number | null;
  stockTo: number | null;
  categoryName: string;
  cartState: string;
  shopifyState: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function parseNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(normalizeText(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseInteger(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = parseInteger(value);
  if (parsed === null || parsed <= 0) return fallback;
  return parsed;
}

function parsePageSize(value: unknown) {
  const requested = parsePositiveInt(value, 100);
  if (ALLOWED_PAGE_SIZES.includes(requested as (typeof ALLOWED_PAGE_SIZES)[number])) {
    return requested;
  }
  return 100;
}

function compareText(a: unknown, b: unknown) {
  return normalizeText(a).localeCompare(normalizeText(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function includesText(haystack: unknown, needleLower: string) {
  if (!needleLower) return true;
  return normalizeLower(haystack).includes(needleLower);
}

function normalizeSkuKey(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function stripLeadingC(value: string) {
  return value.startsWith("c") ? value.slice(1) : value;
}

function skuMatches(left: unknown, right: unknown) {
  const leftKey = normalizeSkuKey(left);
  const rightKey = normalizeSkuKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  return stripLeadingC(leftKey) === stripLeadingC(rightKey);
}

function toGidNumericId(value: string) {
  const match = normalizeText(value).match(/(\d+)(?:\D*)$/);
  return match ? match[1] : "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenToPattern(token: string) {
  return normalizeText(token)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => escapeRegExp(part))
    .join("\\s+");
}

function normalizeParentTitle(rawTitle: string, fallbackSku: string, variants: MatrixVariantRow[]) {
  const fallback = normalizeText(rawTitle) || normalizeText(fallbackSku);
  if (!fallback) return "";
  const normalized = fallback.replace(/\s+/g, " ").trim();

  const trailingTokens = Array.from(
    new Set(
      variants
        .flatMap((variant) => [normalizeText(variant.size), normalizeText(variant.color)])
        .filter(Boolean)
        .map((token) => token.toUpperCase())
    )
  ).sort((a, b) => b.length - a.length);

  let current = normalized;
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const token of trailingTokens) {
      const tokenPattern = tokenToPattern(token);
      if (!tokenPattern) continue;
      const pattern = new RegExp(`(?:\\s*[-_/]\\s*|\\s+)${tokenPattern}$`, "i");
      if (!pattern.test(current)) continue;
      const cleaned = current.replace(pattern, "").replace(/\s+/g, " ").trim();
      if (!cleaned) continue;
      current = cleaned;
      changed = true;
      break;
    }
    if (!changed) break;
  }

  return current;
}

function resolveVariantColor(variant: ShopifyVariant | null) {
  return normalizeText(variant?.color);
}

function resolveVariantSize(variant: ShopifyVariant | null) {
  return normalizeText(variant?.size);
}

function resolveParentSku(row: LightspeedCatalogRow) {
  return (
    normalizeText(row.systemSku) ||
    normalizeText(row.itemId) ||
    normalizeText(row.customSku) ||
    normalizeText(row.id)
  );
}

function resolveParentGroupKey(row: LightspeedCatalogRow) {
  const matrixId = normalizeText(row.itemMatrixId);
  if (matrixId && matrixId !== "0") {
    return `matrix:${normalizeLower(matrixId)}`;
  }
  const fallbackSku = resolveParentSku(row);
  if (!fallbackSku) return "";
  return `sku:${normalizeLower(fallbackSku)}`;
}

function resolveParentDisplaySku(row: LightspeedCatalogRow) {
  const matrixId = normalizeText(row.itemMatrixId);
  if (matrixId && matrixId !== "0") return matrixId;
  return resolveParentSku(row);
}

function resolveVariantSku(row: LightspeedCatalogRow) {
  return (
    normalizeText(row.customSku) ||
    normalizeText(row.systemSku) ||
    normalizeText(row.itemId) ||
    normalizeText(row.id)
  );
}

function resolveVariantUpc(row: LightspeedCatalogRow) {
  return normalizeText(row.upc) || normalizeText(row.ean);
}

function resolveRowPrice(row: LightspeedCatalogRow) {
  if (typeof row.retailPriceNumber === "number" && Number.isFinite(row.retailPriceNumber)) {
    return row.retailPriceNumber;
  }
  return parseNumber(row.retailPrice);
}

function isInvalidLocationName(location: string) {
  const normalized = normalizeLower(location);
  if (!normalized) return true;
  if (normalized === "0") return true;
  if (/^shop\s*#?\s*0$/i.test(normalized)) return true;
  return /^shopid\s*=\s*\d+$/i.test(normalized);
}

function normalizeLocationRows(
  locations: Record<string, number | null>,
  knownLocationsLower: Set<string>
) {
  const rows = Object.entries(locations || {})
    .map(([location, qty]) => ({
      location: normalizeText(location),
      qty: typeof qty === "number" && Number.isFinite(qty) ? qty : parseNumber(qty),
    }))
    .filter((row) => {
      if (isInvalidLocationName(row.location)) return false;
      if (knownLocationsLower.size < 1) return true;
      return knownLocationsLower.has(normalizeLower(row.location));
    })
    .sort((a, b) => compareText(a.location, b.location));

  let sum = 0;
  let hasQty = false;
  for (const row of rows) {
    if (row.qty === null || row.qty === undefined || Number.isNaN(row.qty)) continue;
    sum += row.qty;
    hasQty = true;
  }

  return {
    rows,
    total: hasQty ? Number(sum.toFixed(2)) : null,
  };
}

function parseFilterState(searchParams: URLSearchParams): FilterState {
  return {
    sku: normalizeText(searchParams.get("SKU")),
    name: normalizeText(searchParams.get("Name")),
    priceFrom: parseNumber(searchParams.get("PriceFrom")),
    priceTo: parseNumber(searchParams.get("PriceTo")),
    stockFrom: parseNumber(searchParams.get("StockFrom")),
    stockTo: parseNumber(searchParams.get("StockTo")),
    categoryName: normalizeText(searchParams.get("CategoryName")),
    cartState: normalizeText(searchParams.get("CartState")) || "All",
    shopifyState: normalizeText(searchParams.get("ShopifyState")) || "All",
  };
}

function buildShopifyVariantLookups(variants: ShopifyVariant[]) {
  const bySku = new Map<string, ShopifyVariant[]>();
  const byBarcode = new Map<string, ShopifyVariant[]>();

  for (const variant of variants) {
    const skuKey = normalizeSkuKey(variant.sku);
    if (skuKey) {
      const list = bySku.get(skuKey) || [];
      list.push(variant);
      bySku.set(skuKey, list);
    }

    const barcodeKey = normalizeSkuKey(variant.barcode);
    if (barcodeKey) {
      const list = byBarcode.get(barcodeKey) || [];
      list.push(variant);
      byBarcode.set(barcodeKey, list);
    }
  }

  return { bySku, byBarcode };
}

type MatchType = "exact_sku" | "fuzzy_sku" | "barcode" | null;
type MatchResult = { variant: ShopifyVariant | null; matchType: MatchType };

function pickShopifyVariantForRow(
  row: LightspeedCatalogRow,
  lookups: ReturnType<typeof buildShopifyVariantLookups>
): MatchResult {
  const skuCandidates = [
    normalizeText(row.customSku),
    normalizeText(row.systemSku),
    normalizeText(row.itemId),
  ].filter(Boolean);

  for (const candidate of skuCandidates) {
    const key = normalizeSkuKey(candidate);
    if (!key) continue;

    const exact = lookups.bySku.get(key) || [];
    if (exact.length > 0) return { variant: exact[0], matchType: "exact_sku" };

    if (key.length >= 4) {
      const strippedKey = stripLeadingC(key);
      if (strippedKey !== key && strippedKey.length >= 3) {
        const fallback = lookups.bySku.get(strippedKey);
        if (fallback && fallback.length > 0) return { variant: fallback[0], matchType: "fuzzy_sku" };

        const reverseFallback = [...lookups.bySku.entries()].find(([entryKey]) => {
          const strippedEntry = stripLeadingC(entryKey);
          return strippedEntry === strippedKey || strippedEntry === key;
        });
        if (reverseFallback?.[1]?.[0]) return { variant: reverseFallback[1][0], matchType: "fuzzy_sku" };
      }
    }
  }

  const barcodeCandidates = [normalizeText(row.upc), normalizeText(row.ean)].filter(Boolean);
  for (const candidate of barcodeCandidates) {
    const key = normalizeSkuKey(candidate);
    if (!key) continue;
    const hits = lookups.byBarcode.get(key) || [];
    if (hits.length > 0) return { variant: hits[0], matchType: "barcode" };
  }

  return { variant: null, matchType: null };
}

async function getTokenCandidates(shop: string) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();

    const dbToken = !error
      ? normalizeText((data as { access_token?: string } | null)?.access_token)
      : "";
    const envToken = normalizeText(getShopifyAdminToken(shop));
    const candidates: Array<{ token: string; source: ShopifyTokenSource }> = [];

    if (dbToken) candidates.push({ token: dbToken, source: "db" });
    if (envToken && envToken !== dbToken) candidates.push({ token: envToken, source: "env_token" });
    return candidates;
  } catch {
    const envToken = normalizeText(getShopifyAdminToken(shop));
    return envToken ? [{ token: envToken, source: "env_token" as const }] : [];
  }
}

async function getAvailableShops() {
  let dbShops: string[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("shop,installed_at")
      .order("installed_at", { ascending: false })
      .limit(100);

    if (!error && Array.isArray(data)) {
      dbShops = data
        .map((row) =>
          normalizeShopDomain(normalizeText((row as { shop?: string } | null)?.shop) || "")
        )
        .filter((shop): shop is string => Boolean(shop));
    }
  } catch {
    // Optional fallback path when Supabase is unavailable.
  }

  const configured = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "");
  const unique = new Set<string>(dbShops);
  if (configured) unique.add(configured);
  return Array.from(unique).sort(compareText);
}

const shopifyVariantsCache: {
  shop: string;
  variants: ShopifyVariant[];
  source: ShopifyTokenSource | null;
  truncated: boolean;
  expiresAt: number;
} = {
  shop: "",
  variants: [],
  source: null,
  truncated: false,
  expiresAt: 0,
};

async function fetchLightspeedSnapshot(req: NextRequest, refresh: boolean) {
  const url = new URL("/api/lightspeed/catalog", req.nextUrl.origin);
  url.searchParams.set("all", "1");
  url.searchParams.set("pageSize", "20000");
  url.searchParams.set("sortField", "customSku");
  url.searchParams.set("sortDir", "asc");
  url.searchParams.set("shops", "all");
  url.searchParams.set("includeNoStock", "1");
  if (refresh) {
    url.searchParams.set("refresh", "1");
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as LightspeedCatalogResponse;
  if (!response.ok) {
    throw new Error(normalizeText(json?.error) || "Unable to load Lightspeed catalog.");
  }

  const rows = Array.isArray(json.rows) ? json.rows : [];
  const totalInLs =
    typeof json.total === "number" && Number.isFinite(json.total)
      ? json.total
      : rows.length;

  return {
    rows,
    totalInLs,
    options: {
      categories: Array.isArray(json.options?.categories) ? json.options?.categories : [],
      shops: Array.isArray(json.options?.shops) ? json.options?.shops : [],
    },
    truncated: Boolean(json.truncated),
  };
}

async function fetchShopifyVariants(shop: string, token: string) {
  const query = `
    query InventoryMatrixProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            title
            featuredImage {
              url
            }
            variants(first: 250) {
              nodes {
                id
                sku
                barcode
                price
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                }
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

  const variants: ShopifyVariant[] = [];
  let page = 0;
  let cursor: string | null = null;
  let truncated = false;

  while (page < MAX_SHOPIFY_SCAN_PAGES) {
    const result = await runShopifyGraphql<ProductsPageData>({
      shop,
      token,
      query,
      variables: {
        first: SHOPIFY_PRODUCTS_PER_PAGE,
        after: cursor,
        query: "status:active",
      },
      apiVersion: API_VERSION,
    });

    if (!result.ok) {
      return {
        ok: false as const,
        status: result.status,
        error: JSON.stringify(result.errors || "Shopify catalog request failed."),
      };
    }

    const edges = result.data?.products?.edges || [];
    for (const edge of edges) {
      const product = edge.node;
      if (!product) continue;

      const productId = normalizeText(product.id);
      const productTitle = normalizeText(product.title);
      const productImage = normalizeText(product.featuredImage?.url);
      const variantNodes = product.variants?.nodes || [];

      for (const variantNode of variantNodes) {
        const optionRows = variantNode.selectedOptions || [];
        const colorOption = optionRows.find((option) => {
          const key = normalizeLower(option.name);
          return key === "color" || key === "colour";
        });
        const sizeOption = optionRows.find((option) => normalizeLower(option.name) === "size");

        variants.push({
          id: normalizeText(variantNode.id),
          productId,
          productTitle,
          sku: normalizeText(variantNode.sku),
          barcode: normalizeText(variantNode.barcode),
          price: parseNumber(variantNode.price),
          inventoryQuantity:
            typeof variantNode.inventoryQuantity === "number" &&
            Number.isFinite(variantNode.inventoryQuantity)
              ? variantNode.inventoryQuantity
              : null,
          color: normalizeText(colorOption?.value),
          size: normalizeText(sizeOption?.value),
          image: normalizeText(variantNode.image?.url),
          productImage,
        });
      }
    }

    const hasNextPage = Boolean(result.data?.products?.pageInfo?.hasNextPage);
    const endCursor = normalizeText(result.data?.products?.pageInfo?.endCursor);
    page += 1;

    if (!hasNextPage || !endCursor) break;
    if (page >= MAX_SHOPIFY_SCAN_PAGES) {
      truncated = true;
      break;
    }
    cursor = endCursor;
  }

  return {
    ok: true as const,
    variants,
    truncated,
  };
}

type MatchStats = {
  exactSku: number;
  fuzzySku: number;
  barcode: number;
  unmatched: number;
};

function buildMatrixRows(
  lightspeedRows: LightspeedCatalogRow[],
  lookups: ReturnType<typeof buildShopifyVariantLookups>,
  stagedParentIds: Set<string>,
  knownLocations: string[]
) {
  const knownLocationsLower = new Set(
    knownLocations.map((location) => normalizeLower(location)).filter(Boolean)
  );
  const matchStats: MatchStats = { exactSku: 0, fuzzySku: 0, barcode: 0, unmatched: 0 };
  const grouped = new Map<
    string,
    {
      id: string;
      title: string;
      category: string;
      brand: string;
      sku: string;
      image: string;
      price: number | null;
      stock: number;
      hasStock: boolean;
      variants: MatrixVariantRow[];
    }
  >();

  for (const row of lightspeedRows) {
    const parentSku = resolveParentDisplaySku(row);
    if (!parentSku) continue;

    const parentKey = resolveParentGroupKey(row);
    if (!parentKey) continue;

    const { variant: matchedVariant, matchType } = pickShopifyVariantForRow(row, lookups);
    if (matchType === "exact_sku") matchStats.exactSku++;
    else if (matchType === "fuzzy_sku") matchStats.fuzzySku++;
    else if (matchType === "barcode") matchStats.barcode++;
    else matchStats.unmatched++;
    const variantSku = resolveVariantSku(row);
    const variantUpc = resolveVariantUpc(row);
    const normalizedLocationRows = normalizeLocationRows(row.locations || {}, knownLocationsLower);
    const variantStock = normalizedLocationRows.total;
    const variantPrice = resolveRowPrice(row);
    const productNumericId = toGidNumericId(matchedVariant?.productId || "");
    const variantNumericId = toGidNumericId(matchedVariant?.id || "");
    const cartId =
      productNumericId && variantNumericId
        ? `${productNumericId}~${variantNumericId}`
        : matchedVariant
          ? matchedVariant.id
          : "";
    const variantImage = normalizeText(matchedVariant?.image);
    const heroImage = normalizeText(matchedVariant?.productImage);
    const stockByLocation = normalizedLocationRows.rows;
    const stagedInCart = stagedParentIds.has(normalizeLower(parentKey));

    const variantRow: MatrixVariantRow = {
      id: normalizeText(row.id) || `${parentSku}-${variantSku}-${variantUpc}`,
      parentId: parentKey,
      sku: variantSku,
      upc: variantUpc,
      sellerSku: normalizeText(matchedVariant?.sku),
      cartId,
      stock: variantStock,
      stockByLocation,
      price: variantPrice,
      color: normalizeText(row.color) || resolveVariantColor(matchedVariant),
      size: normalizeText(row.size) || resolveVariantSize(matchedVariant),
      image: variantImage,
      availableInShopify: Boolean(matchedVariant),
      stagedInCart,
    };

    const current = grouped.get(parentKey);
    if (!current) {
      grouped.set(parentKey, {
        id: parentKey,
        title:
          normalizeText(row.description) ||
          normalizeText(matchedVariant?.productTitle) ||
          parentSku,
        category: normalizeText(row.category),
        brand: normalizeText(row.itemType),
        sku: parentSku,
        image: heroImage,
        price: variantPrice,
        stock: variantStock ?? 0,
        hasStock: variantStock !== null,
        variants: [variantRow],
      });
      continue;
    }

    current.variants.push(variantRow);
    if (!current.image && heroImage) current.image = heroImage;
    if (!current.title) {
      current.title =
        normalizeText(row.description) ||
        normalizeText(matchedVariant?.productTitle) ||
        parentSku;
    }
    if (!current.category && row.category) current.category = normalizeText(row.category);
    if (!current.brand && row.itemType) current.brand = normalizeText(row.itemType);
    if (current.price === null && variantPrice !== null) current.price = variantPrice;
    if (variantStock !== null) {
      current.stock += variantStock;
      current.hasStock = true;
    }
  }

  const parents: MatrixParentRow[] = [];
  for (const group of grouped.values()) {
    const variants = [...group.variants].sort((a, b) => {
      const skuCompare = compareText(a.sku, b.sku);
      if (skuCompare !== 0) return skuCompare;
      return compareText(a.upc, b.upc);
    });
    const availableInShopify = variants.some((variant) => variant.availableInShopify);
    const stagedInCart = stagedParentIds.has(normalizeLower(group.id));

    parents.push({
      id: group.id,
      title: normalizeParentTitle(group.title, group.sku, variants),
      category: group.category,
      brand: group.brand,
      sku: group.sku,
      stock: group.hasStock ? Number(group.stock.toFixed(2)) : null,
      price: group.price,
      variations: variants.length,
      image: group.image,
      availableAt: {
        shopify: availableInShopify,
        cart: stagedInCart,
      },
      variants,
    });
  }

  return { parents: parents.sort((a, b) => compareText(a.sku, b.sku)), matchStats };
}

function parentMatchesFilters(parent: MatrixParentRow, filters: FilterState) {
  const cartState = normalizeLower(filters.cartState);
  if (cartState && cartState !== "all") {
    if (cartState === "enabled" && !parent.availableAt.cart) return false;
    if (cartState === "notenabled" && parent.availableAt.cart) return false;
  }

  const shopifyState = normalizeLower(filters.shopifyState);
  if (shopifyState && shopifyState !== "all") {
    if (shopifyState === "available" && !parent.availableAt.shopify) return false;
    if (shopifyState === "missing" && parent.availableAt.shopify) return false;
  }

  const skuNeedle = normalizeLower(filters.sku);
  if (skuNeedle) {
    const parentHit = includesText(parent.sku, skuNeedle);
    const variantHit = parent.variants.some(
      (variant) =>
        includesText(variant.sku, skuNeedle) ||
        includesText(variant.upc, skuNeedle) ||
        includesText(variant.sellerSku, skuNeedle)
    );
    if (!parentHit && !variantHit) return false;
  }

  const nameNeedle = normalizeLower(filters.name);
  if (nameNeedle && !includesText(parent.title, nameNeedle)) return false;

  const categoryNeedle = normalizeLower(filters.categoryName);
  if (categoryNeedle && categoryNeedle !== "all") {
    if (normalizeLower(parent.category) !== categoryNeedle) return false;
  }

  if (filters.priceFrom !== null) {
    if (parent.price === null || parent.price < filters.priceFrom) return false;
  }
  if (filters.priceTo !== null) {
    if (parent.price === null || parent.price > filters.priceTo) return false;
  }

  if (filters.stockFrom !== null) {
    if (parent.stock === null || parent.stock < filters.stockFrom) return false;
  }
  if (filters.stockTo !== null) {
    if (parent.stock === null || parent.stock > filters.stockTo) return false;
  }

  return true;
}

function toPagedRows(rows: MatrixParentRow[], page: number, pageSize: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    total,
    totalPages,
    page: currentPage,
    rows: rows.slice(start, start + pageSize),
  };
}

async function fetchShopifyVariantsCached(
  shop: string,
  refresh: boolean
): Promise<{
  variants: ShopifyVariant[];
  source: ShopifyTokenSource | null;
  truncated: boolean;
  warning: string;
}> {
  if (
    !refresh &&
    shopifyVariantsCache.shop === shop &&
    shopifyVariantsCache.variants.length > 0 &&
    shopifyVariantsCache.expiresAt > Date.now()
  ) {
    return {
      variants: shopifyVariantsCache.variants,
      source: shopifyVariantsCache.source,
      truncated: shopifyVariantsCache.truncated,
      warning: "",
    };
  }

  if (!shop) {
    return { variants: [], source: null, truncated: false, warning: "No Shopify shop connected. Shopify availability is unavailable." };
  }

  const tokenCandidates = await getTokenCandidates(shop);
  if (tokenCandidates.length === 0) {
    return { variants: [], source: null, truncated: false, warning: `Shop ${shop} is not connected. Shopify availability is unavailable.` };
  }

  let lastError = "";
  for (const candidate of tokenCandidates) {
    const attempt = await fetchShopifyVariants(shop, candidate.token);
    if (!attempt.ok) {
      lastError = attempt.error;
      continue;
    }
    shopifyVariantsCache.shop = shop;
    shopifyVariantsCache.variants = attempt.variants;
    shopifyVariantsCache.source = candidate.source;
    shopifyVariantsCache.truncated = attempt.truncated;
    shopifyVariantsCache.expiresAt = Date.now() + SHOPIFY_VARIANTS_CACHE_MS;
    return {
      variants: attempt.variants,
      source: candidate.source,
      truncated: attempt.truncated,
      warning: "",
    };
  }

  return { variants: [], source: null, truncated: false, warning: `Shopify availability comparison failed: ${lastError}` };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseFilterState(searchParams);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePageSize(searchParams.get("pageSize"));
    const refresh = normalizeLower(searchParams.get("refresh")) === "1";
    const requestedShop = normalizeShopDomain(normalizeText(searchParams.get("shop")) || "") || "";

    const configuredShop =
      normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "";
    const resolvedShop = requestedShop || configuredShop;

    const [availableShops, lightspeedSnapshot, stagedIdsResult, shopifyResult] = await Promise.all([
      getAvailableShops(),
      fetchLightspeedSnapshot(req, refresh),
      listCartCatalogParentIds(resolvedShop || configuredShop),
      fetchShopifyVariantsCached(resolvedShop || configuredShop, refresh),
    ]);

    const fallbackShop = configuredShop || availableShops[0] || "";
    const finalShop = resolvedShop || fallbackShop;
    const { variants: shopifyVariants, source, truncated: shopifyTruncated, warning } = shopifyResult;
    const lookups = buildShopifyVariantLookups(shopifyVariants);
    const { parents, matchStats } = buildMatrixRows(
      lightspeedSnapshot.rows,
      lookups,
      stagedIdsResult.data,
      lightspeedSnapshot.options.shops
    );
    const filtered = parents.filter((parent) => parentMatchesFilters(parent, filters));
    const paged = toPagedRows(filtered, page, pageSize);

    const totalItems = filtered.reduce((sum, row) => sum + row.variations, 0);
    const totalInCart = filtered.filter((row) => row.availableAt.cart).length;
    const totalOnShopify = filtered.filter((row) => row.availableAt.shopify).length;

    const categories = Array.from(
      new Set(parents.map((row) => normalizeText(row.category)).filter(Boolean))
    ).sort(compareText);
    const brands = Array.from(
      new Set(parents.map((row) => normalizeText(row.brand)).filter(Boolean))
    ).sort(compareText);

    return NextResponse.json({
      ok: true,
      shop: finalShop,
      shops: availableShops,
      source,
      warning: [warning, stagedIdsResult.warning].filter(Boolean).join(" ").trim(),
      truncated: Boolean(lightspeedSnapshot.truncated || shopifyTruncated),
      filters: {
        SKU: filters.sku,
        Name: filters.name,
        PriceFrom: filters.priceFrom,
        PriceTo: filters.priceTo,
        StockFrom: filters.stockFrom,
        StockTo: filters.stockTo,
        CategoryName: filters.categoryName,
        CartState: filters.cartState,
        ShopifyState: filters.shopifyState,
      },
      options: {
        categories,
        brands,
        shops: lightspeedSnapshot.options.shops,
        cartStates: ["All", "Enabled", "NotEnabled"],
        shopifyStates: ["All", "Available", "Missing"],
      },
      summary: {
        totalProducts: filtered.length,
        totalItems,
        totalInCart,
        totalOnShopify,
      },
      lightspeedCatalog: {
        totalLoaded: lightspeedSnapshot.rows.length,
        totalInLs: lightspeedSnapshot.totalInLs,
        truncated: Boolean(lightspeedSnapshot.truncated),
      },
      matchStats: {
        shopifyVariantsScanned: shopifyVariants.length,
        lightspeedRowsProcessed: lightspeedSnapshot.rows.length,
        exactSku: matchStats.exactSku,
        fuzzySku: matchStats.fuzzySku,
        barcode: matchStats.barcode,
        unmatched: matchStats.unmatched,
      },
      page: paged.page,
      pageSize,
      total: paged.total,
      totalPages: paged.totalPages,
      rows: paged.rows,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          normalizeText((e as { message?: string } | null)?.message) ||
          "Unable to load Lightspeed inventory matrix.",
      },
      { status: 500 }
    );
  }
}
