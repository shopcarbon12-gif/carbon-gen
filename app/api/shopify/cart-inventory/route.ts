import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_VERSION = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
const SHOPIFY_PRODUCTS_PER_PAGE = 100;
const MAX_SHOPIFY_SCAN_PAGES = 40;
const ALLOWED_PAGE_SIZES = [20, 50, 75, 100] as const;

type ShopifyTokenSource = "db" | "env_token";

type CatalogOptions = {
  categories?: string[];
  shops?: string[];
};

type LightspeedCatalogRow = {
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

type LightspeedCatalogResponse = {
  ok?: boolean;
  error?: string;
  rows?: LightspeedCatalogRow[];
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

type FilterState = {
  sku: string;
  parentSku: string;
  name: string;
  brand: string;
  priceFrom: number | null;
  priceTo: number | null;
  stockFrom: number | null;
  stockTo: number | null;
  status: string;
  categoryName: string;
  keyword: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function parseNumber(value: unknown) {
  const parsed = Number.parseFloat(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: unknown) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function includesText(haystack: unknown, needleLower: string) {
  if (!needleLower) return true;
  return normalizeLower(haystack).includes(needleLower);
}

function compareText(a: unknown, b: unknown) {
  return normalizeText(a).localeCompare(normalizeText(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
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

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = parseInteger(value);
  if (parsed === null || parsed <= 0) return fallback;
  return parsed;
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

function resolveRowStock(row: LightspeedCatalogRow) {
  if (typeof row.qtyTotal === "number" && Number.isFinite(row.qtyTotal)) {
    return row.qtyTotal;
  }
  let sum = 0;
  let hasAny = false;
  for (const qty of Object.values(row.locations || {})) {
    if (qty === null || qty === undefined || Number.isNaN(qty)) continue;
    sum += qty;
    hasAny = true;
  }
  return hasAny ? Number(sum.toFixed(2)) : null;
}

function parseFilterState(searchParams: URLSearchParams): FilterState {
  return {
    sku: normalizeText(searchParams.get("SKU")),
    parentSku: normalizeText(searchParams.get("ParentSKU")),
    name: normalizeText(searchParams.get("Name")),
    brand: normalizeText(searchParams.get("Brand")),
    priceFrom: parseNumber(searchParams.get("PriceFrom")),
    priceTo: parseNumber(searchParams.get("PriceTo")),
    stockFrom: parseNumber(searchParams.get("StockFrom")),
    stockTo: parseNumber(searchParams.get("StockTo")),
    status: normalizeText(searchParams.get("Orderby")) || "All",
    categoryName: normalizeText(searchParams.get("CategoryName")),
    keyword: normalizeText(searchParams.get("Keyword")),
  };
}

function parsePageSize(searchParams: URLSearchParams) {
  const requested = parsePositiveInt(searchParams.get("pageSize"), 20);
  if (ALLOWED_PAGE_SIZES.includes(requested as (typeof ALLOWED_PAGE_SIZES)[number])) {
    return requested;
  }
  return 20;
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

function pickShopifyVariantForRow(
  row: LightspeedCatalogRow,
  lookups: ReturnType<typeof buildShopifyVariantLookups>
) {
  const skuCandidates = [
    normalizeText(row.customSku),
    normalizeText(row.systemSku),
    normalizeText(row.itemId),
  ].filter(Boolean);

  for (const candidate of skuCandidates) {
    const key = normalizeSkuKey(candidate);
    if (!key) continue;

    const exact = lookups.bySku.get(key) || [];
    if (exact.length > 0) return exact[0];

    // Keep SKU matching tolerant for leading "C" drift.
    const fallback = [...lookups.bySku.entries()].find(([entryKey]) =>
      skuMatches(entryKey, key)
    );
    if (fallback?.[1]?.[0]) return fallback[1][0];
  }

  const barcodeCandidates = [normalizeText(row.upc), normalizeText(row.ean)].filter(Boolean);
  for (const candidate of barcodeCandidates) {
    const key = normalizeSkuKey(candidate);
    if (!key) continue;
    const hits = lookups.byBarcode.get(key) || [];
    if (hits.length > 0) return hits[0];
  }

  return null;
}

async function getTokenCandidates(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("access_token")
    .eq("shop", shop)
    .maybeSingle();

  const dbToken = !error ? normalizeText((data as { access_token?: string } | null)?.access_token) : "";
  const envToken = normalizeText(getShopifyAdminToken(shop));
  const candidates: Array<{ token: string; source: ShopifyTokenSource }> = [];

  if (dbToken) candidates.push({ token: dbToken, source: "db" });
  if (envToken && envToken !== dbToken) candidates.push({ token: envToken, source: "env_token" });

  return candidates;
}

async function getAvailableShops() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shopify_tokens")
    .select("shop,installed_at")
    .order("installed_at", { ascending: false })
    .limit(100);

  const fromDb =
    !error && Array.isArray(data)
      ? data
          .map((row) =>
            normalizeShopDomain(normalizeText((row as { shop?: string } | null)?.shop) || "")
          )
          .filter((shop): shop is string => Boolean(shop))
      : [];

  const configured = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "");
  const unique = new Set<string>(fromDb);
  if (configured) unique.add(configured);
  return Array.from(unique).sort((a, b) => compareText(a, b));
}

async function fetchLightspeedSnapshot(req: NextRequest, refresh: boolean) {
  const url = new URL("/api/lightspeed/catalog", req.nextUrl.origin);
  url.searchParams.set("all", "1");
  url.searchParams.set("pageSize", "20000");
  url.searchParams.set("sortField", "customSku");
  url.searchParams.set("sortDir", "asc");
  if (refresh) {
    url.searchParams.set("refresh", "1");
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as LightspeedCatalogResponse;
  if (!response.ok) {
    throw new Error(normalizeText(json?.error) || "Unable to load Lightspeed catalog.");
  }

  return {
    rows: Array.isArray(json.rows) ? json.rows : [],
    options: {
      categories: Array.isArray(json.options?.categories) ? json.options?.categories : [],
      shops: Array.isArray(json.options?.shops) ? json.options?.shops : [],
    },
    truncated: Boolean(json.truncated),
  };
}

async function fetchShopifyVariants(shop: string, token: string) {
  const query = `
    query CartInventoryProducts($first: Int!, $after: String, $query: String) {
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

    if (!hasNextPage || !endCursor) {
      break;
    }

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

function buildParentRows(
  lightspeedRows: LightspeedCatalogRow[],
  lookups: ReturnType<typeof buildShopifyVariantLookups>
) {
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
      variants: CartInventoryVariantRow[];
    }
  >();

  for (const row of lightspeedRows) {
    const parentSku = resolveParentSku(row);
    if (!parentSku) continue;

    const parentKey = normalizeLower(parentSku);
    if (!parentKey) continue;

    const matchedVariant = pickShopifyVariantForRow(row, lookups);
    const variantSku = resolveVariantSku(row);
    const variantUpc = resolveVariantUpc(row);
    const variantStock = resolveRowStock(row);
    const variantPrice = resolveRowPrice(row);
    const productNumericId = toGidNumericId(matchedVariant?.productId || "");
    const variantNumericId = toGidNumericId(matchedVariant?.id || "");
    const cartId =
      productNumericId && variantNumericId
        ? `${productNumericId}~${variantNumericId}`
        : matchedVariant
          ? matchedVariant.id
          : "";
    const image =
      normalizeText(matchedVariant?.image) ||
      normalizeText(matchedVariant?.productImage) ||
      "";
    const stockByLocation = Object.entries(row.locations || {})
      .map(([location, qty]) => ({
        location: normalizeText(location),
        qty:
          typeof qty === "number" && Number.isFinite(qty)
            ? qty
            : parseNumber(qty),
      }))
      .sort((a, b) => compareText(a.location, b.location));

    const variantRow: CartInventoryVariantRow = {
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
      image,
      status: matchedVariant ? "PROCESSED" : "PENDING",
    };

    const current = grouped.get(parentKey);
    if (!current) {
      grouped.set(parentKey, {
        id: parentKey,
        title: normalizeText(row.description) || normalizeText(matchedVariant?.productTitle) || parentSku,
        category: normalizeText(row.category),
        brand: normalizeText(row.itemType),
        sku: parentSku,
        image,
        price: variantPrice,
        stock: variantStock ?? 0,
        hasStock: variantStock !== null,
        variants: [variantRow],
      });
      continue;
    }

    current.variants.push(variantRow);
    if (!current.image && image) current.image = image;
    if (!current.title) {
      current.title =
        normalizeText(row.description) || normalizeText(matchedVariant?.productTitle) || parentSku;
    }
    if (!current.category && row.category) current.category = normalizeText(row.category);
    if (!current.brand && row.itemType) current.brand = normalizeText(row.itemType);
    if (current.price === null && variantPrice !== null) current.price = variantPrice;
    if (variantStock !== null) {
      current.stock += variantStock;
      current.hasStock = true;
    }
  }

  const parents: CartInventoryParentRow[] = [];
  for (const group of grouped.values()) {
    const variants = [...group.variants].sort((a, b) => {
      const skuCompare = compareText(a.sku, b.sku);
      if (skuCompare !== 0) return skuCompare;
      return compareText(a.upc, b.upc);
    });

    const processedCount = variants.filter((variant) => variant.status === "PROCESSED").length;
    const pendingCount = Math.max(0, variants.length - processedCount);

    parents.push({
      id: group.id,
      title: group.title,
      category: group.category,
      brand: group.brand,
      sku: group.sku,
      stock: group.hasStock ? Number(group.stock.toFixed(2)) : null,
      price: group.price,
      variations: variants.length,
      image: group.image,
      status: pendingCount === 0 ? "PROCESSED" : "PENDING",
      processedCount,
      pendingCount,
      variants,
    });
  }

  return parents.sort((a, b) => compareText(a.sku, b.sku));
}

function parentMatchesFilters(parent: CartInventoryParentRow, filters: FilterState) {
  const statusFilter = normalizeLower(filters.status);
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "processed" && parent.status !== "PROCESSED") return false;
    if (statusFilter === "pending" && parent.status !== "PENDING") return false;
  }

  const skuNeedle = normalizeLower(filters.sku);
  if (skuNeedle) {
    const parentHit = includesText(parent.sku, skuNeedle);
    const variantHit = parent.variants.some((variant) => includesText(variant.sku, skuNeedle));
    if (!parentHit && !variantHit) return false;
  }

  const parentSkuNeedle = normalizeLower(filters.parentSku);
  if (parentSkuNeedle && !includesText(parent.sku, parentSkuNeedle)) return false;

  const nameNeedle = normalizeLower(filters.name);
  if (nameNeedle && !includesText(parent.title, nameNeedle)) return false;

  const brandNeedle = normalizeLower(filters.brand);
  if (brandNeedle && !includesText(parent.brand, brandNeedle)) return false;

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

  const keywordNeedle = normalizeLower(filters.keyword);
  if (keywordNeedle) {
    const parentText = [parent.title, parent.category, parent.brand, parent.sku].join(" ");
    const parentHit = includesText(parentText, keywordNeedle);
    if (!parentHit) {
      const variantHit = parent.variants.some((variant) => {
        const variantText = [
          variant.sku,
          variant.upc,
          variant.sellerSku,
          variant.cartId,
          variant.color,
          variant.size,
        ].join(" ");
        return includesText(variantText, keywordNeedle);
      });
      if (!variantHit) return false;
    }
  }

  return true;
}

function toPagedRows(rows: CartInventoryParentRow[], page: number, pageSize: number) {
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filters = parseFilterState(searchParams);
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = parsePageSize(searchParams);
    const refresh = normalizeLower(searchParams.get("refresh")) === "1";
    const requestedShop = normalizeShopDomain(normalizeText(searchParams.get("shop")) || "") || "";

    const availableShops = await getAvailableShops();
    const fallbackShop =
      normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") ||
      availableShops[0] ||
      "";
    const resolvedShop = requestedShop || fallbackShop;

    const lightspeedSnapshotPromise = fetchLightspeedSnapshot(req, refresh);

    let shopifyVariants: ShopifyVariant[] = [];
    let source: ShopifyTokenSource | null = null;
    let shopifyTruncated = false;
    let warning = "";

    if (resolvedShop) {
      const tokenCandidates = await getTokenCandidates(resolvedShop);
      if (tokenCandidates.length > 0) {
        let lastError = "";
        for (const candidate of tokenCandidates) {
          const attempt = await fetchShopifyVariants(resolvedShop, candidate.token);
          if (!attempt.ok) {
            lastError = attempt.error;
            continue;
          }
          source = candidate.source;
          shopifyVariants = attempt.variants;
          shopifyTruncated = attempt.truncated;
          lastError = "";
          break;
        }

        if (lastError) {
          warning = `Shopify variants could not be loaded: ${lastError}`;
        }
      } else {
        warning = `Shop ${resolvedShop} is not connected. Showing pending-only inventory view.`;
      }
    } else {
      warning = "No Shopify shop connected. Showing pending-only inventory view.";
    }

    const lightspeedSnapshot = await lightspeedSnapshotPromise;
    const lookups = buildShopifyVariantLookups(shopifyVariants);
    const parents = buildParentRows(lightspeedSnapshot.rows, lookups);
    const filtered = parents.filter((parent) => parentMatchesFilters(parent, filters));
    const paged = toPagedRows(filtered, page, pageSize);

    const totalItems = filtered.reduce((sum, row) => sum + row.variations, 0);
    const totalProcessed = filtered.reduce((sum, row) => sum + row.processedCount, 0);
    const totalPending = filtered.reduce((sum, row) => sum + row.pendingCount, 0);

    const categories = Array.from(
      new Set(parents.map((row) => normalizeText(row.category)).filter(Boolean))
    ).sort(compareText);
    const brands = Array.from(new Set(parents.map((row) => normalizeText(row.brand)).filter(Boolean))).sort(
      compareText
    );

    return NextResponse.json({
      ok: true,
      shop: resolvedShop,
      shops: availableShops,
      source,
      warning,
      truncated: Boolean(lightspeedSnapshot.truncated || shopifyTruncated),
      filters: {
        SKU: filters.sku,
        ParentSKU: filters.parentSku,
        Name: filters.name,
        Brand: filters.brand,
        PriceFrom: filters.priceFrom,
        PriceTo: filters.priceTo,
        StockFrom: filters.stockFrom,
        StockTo: filters.stockTo,
        Orderby: filters.status,
        CategoryName: filters.categoryName,
        Keyword: filters.keyword,
      },
      options: {
        categories,
        brands,
        shops: lightspeedSnapshot.options.shops,
        statuses: ["All", "Processed", "Pending"],
      },
      summary: {
        totalProducts: filtered.length,
        totalItems,
        totalProcessed,
        totalPending,
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
        error: normalizeText((e as { message?: string } | null)?.message) || "Unable to load cart inventory.",
      },
      { status: 500 }
    );
  }
}
