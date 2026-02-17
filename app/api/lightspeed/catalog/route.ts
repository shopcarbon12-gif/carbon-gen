import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LS_TOKEN_URL = "https://cloud.merchantos.com/oauth/access_token.php";
const PREFERRED_DEFAULT_SHOP = "CARBON JEANS COMPANY";
const MAX_EXPORT_ROWS = 20_000;
const LS_ITEM_PAGE_LIMIT = 500;
const LS_ITEM_PAGE_LIMIT_FALLBACK = 100;
const LS_MIN_REQUEST_INTERVAL_MS = 1100;
const LS_RATE_LIMIT_RETRY_ATTEMPTS = 3;
const ALLOWED_PAGE_SIZES = [100, 500] as const;
const ALLOWED_SORT_FIELDS = [
  "item",
  "qty",
  "price",
  "category",
  "upc",
  "customSku",
  "color",
  "size",
] as const;
const ALLOWED_SORT_DIRECTIONS = ["asc", "desc"] as const;
type CatalogSortField = (typeof ALLOWED_SORT_FIELDS)[number] | `location:${string}`;
type CatalogSortDirection = (typeof ALLOWED_SORT_DIRECTIONS)[number];

const CACHE_MS = {
  tokenFallback: 10 * 60 * 1000,
  catalogSnapshot: 2 * 60 * 1000,
  shops: 15 * 60 * 1000,
  categories: 15 * 60 * 1000,
};

type CatalogRow = {
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

const lightspeedAccessTokenCache: { token: string; expiresAt: number } = {
  token: "",
  expiresAt: 0,
};

const lightspeedCatalogSnapshotCache: { rows: CatalogRow[]; expiresAt: number } = {
  rows: [],
  expiresAt: 0,
};

const lightspeedShopCache: {
  shopNameById: Record<string, string>;
  shopNames: string[];
  expiresAt: number;
} = {
  shopNameById: {},
  shopNames: [],
  expiresAt: 0,
};

const lightspeedCategoryCache: {
  categoryNameById: Record<string, string>;
  categoryNames: string[];
  expiresAt: number;
} = {
  categoryNameById: {},
  categoryNames: [],
  expiresAt: 0,
};

let lightspeedRequestChain: Promise<void> = Promise.resolve();
let lightspeedLastRequestAt = 0;

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isLikelyHtmlPayload(value: string) {
  return /<!doctype html|<html\b|<head\b|<body\b|<title\b/i.test(value);
}

function summarizeHtmlPayload(rawBody: string) {
  const title = normalizeText(rawBody.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  if (title) return title;
  const heading = normalizeText(rawBody.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (heading) return heading;
  return "Upstream service returned an HTML error page.";
}

function sanitizeErrorDetail(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  if (isLikelyHtmlPayload(text)) {
    const summary = summarizeHtmlPayload(text);
    return normalizeText(summary).slice(0, 220);
  }
  return text.replace(/\s+/g, " ").slice(0, 500);
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toBoolean(value: unknown) {
  const normalized = normalizeLower(value);
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

async function waitForLightspeedRequestSlot() {
  const next = lightspeedRequestChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, LS_MIN_REQUEST_INTERVAL_MS - (now - lightspeedLastRequestAt));
    if (waitMs > 0) {
      await delay(waitMs);
    }
    lightspeedLastRequestAt = Date.now();
  });

  lightspeedRequestChain = next.catch(() => undefined);
  await next;
}

function toNumber(value: unknown) {
  const parsed = Number.parseFloat(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTokenResponseBody(rawText: string) {
  const text = normalizeText(rawText);
  if (!text) return {} as Record<string, unknown>;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // fallback below
  }

  const parsedForm = Object.fromEntries(new URLSearchParams(text));
  if (Object.keys(parsedForm).length > 0) return parsedForm as Record<string, unknown>;
  return { raw: text };
}

function getTokenEndpointCandidates(domainPrefix: string) {
  const configuredRaw = normalizeText(process.env.LS_OAUTH_TOKEN_URL || DEFAULT_LS_TOKEN_URL);
  const resolvedConfigured = configuredRaw.replaceAll("<<domain_prefix>>", domainPrefix || "");
  const needsDomainPrefix = configuredRaw.includes("<<domain_prefix>>");
  const candidates: string[] = [];

  if (!needsDomainPrefix || domainPrefix) candidates.push(resolvedConfigured);
  if (domainPrefix) candidates.push(`https://${domainPrefix}.retail.lightspeed.app/api/1.0/token`);

  if (resolvedConfigured.includes("/auth/oauth/token")) {
    candidates.push(resolvedConfigured.replace("/auth/oauth/token", "/oauth/access_token.php"));
  }
  if (resolvedConfigured.includes("/oauth/access_token.php")) {
    candidates.push(resolvedConfigured.replace("/oauth/access_token.php", "/auth/oauth/token"));
  }

  const legacyCandidates = [
    "https://cloud.merchantos.com/oauth/access_token.php",
    "https://cloud.merchantos.com/auth/oauth/token",
  ];
  for (const endpoint of legacyCandidates) {
    if (!candidates.includes(endpoint)) candidates.push(endpoint);
  }

  return [...new Set(candidates)].filter(Boolean);
}

function getRSeriesResourceEndpoint(resource: string) {
  const accountId = normalizeText(process.env.LS_ACCOUNT_ID);
  if (!accountId) {
    throw new Error("LS_ACCOUNT_ID is missing. Configure Lightspeed account ID first.");
  }

  const base = normalizeText(process.env.LS_API_BASE || "https://api.lightspeedapp.com").replace(
    /\/+$/,
    ""
  );
  if (/\/API$/i.test(base)) {
    return `${base}/Account/${accountId}/${resource}.json`;
  }
  return `${base}/API/Account/${accountId}/${resource}.json`;
}

function readResponseError(parsedBody: any, rawBody: string, fallback = "request failed") {
  return (
    sanitizeErrorDetail(parsedBody?.message) ||
    sanitizeErrorDetail(parsedBody?.error) ||
    sanitizeErrorDetail(parsedBody?.error_description) ||
    sanitizeErrorDetail(rawBody) ||
    fallback
  );
}

async function refreshLightspeedAccessToken(forceRefresh = false) {
  if (
    !forceRefresh &&
    lightspeedAccessTokenCache.token &&
    lightspeedAccessTokenCache.expiresAt > Date.now()
  ) {
    return lightspeedAccessTokenCache.token;
  }

  const clientId = normalizeText(process.env.LS_CLIENT_ID);
  const clientSecret = normalizeText(process.env.LS_CLIENT_SECRET);
  const refreshToken = normalizeText(process.env.LS_REFRESH_TOKEN);
  const domainPrefix = normalizeLower(process.env.LS_DOMAIN_PREFIX);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Lightspeed credentials missing. Set LS_CLIENT_ID, LS_CLIENT_SECRET, and LS_REFRESH_TOKEN."
    );
  }

  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();

  const endpoints = getTokenEndpointCandidates(domainPrefix);
  let lastError = "Unable to refresh Lightspeed access token.";

  for (const endpoint of endpoints) {
    try {
      const tokenResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload,
        signal: AbortSignal.timeout(12_000),
      });

      const tokenRawBody = await tokenResponse.text();
      const tokenBody = parseTokenResponseBody(tokenRawBody);
      if (!tokenResponse.ok) {
        const detail = typeof tokenBody === "object" ? JSON.stringify(tokenBody) : String(tokenBody);
        lastError = `Unable to refresh token at ${endpoint}: ${detail}`;
        continue;
      }

      const accessToken = normalizeText(tokenBody.access_token);
      if (!accessToken) {
        lastError = `Unable to refresh token at ${endpoint}: access token missing`;
        continue;
      }

      const expiresInSeconds = Number.parseInt(normalizeText(tokenBody.expires_in), 10);
      const ttlMs = Number.isFinite(expiresInSeconds)
        ? Math.max(30, expiresInSeconds - 30) * 1000
        : CACHE_MS.tokenFallback;
      lightspeedAccessTokenCache.token = accessToken;
      lightspeedAccessTokenCache.expiresAt = Date.now() + ttlMs;

      const newRefreshToken = normalizeText(tokenBody.refresh_token);
      if (newRefreshToken && newRefreshToken !== refreshToken) {
        process.env.LS_REFRESH_TOKEN = newRefreshToken;
      }

      return accessToken;
    } catch (error: any) {
      lastError = `Unable to refresh token at ${endpoint}: ${String(error?.message || error)}`;
    }
  }

  throw new Error(lastError);
}

async function requestRSeriesList<T>(params: {
  accessToken: string;
  resource: string;
  query?: Record<string, string | number>;
}) {
  const { accessToken, resource } = params;
  const query = params.query || {};
  const endpoint = getRSeriesResourceEndpoint(resource);
  const url = new URL(endpoint);

  for (const [key, value] of Object.entries(query)) {
    const strValue = normalizeText(value);
    if (!strValue) continue;
    url.searchParams.set(key, strValue);
  }

  let lastError = `Lightspeed ${resource} request failed.`;

  for (let attempt = 1; attempt <= LS_RATE_LIMIT_RETRY_ATTEMPTS; attempt += 1) {
    await waitForLightspeedRequestSlot();

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const rawBody = await response.text();
    let parsedBody: any = {};
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = { raw: rawBody };
    }

    if (response.ok) {
      const list = toArray(parsedBody?.[resource]) as T[];
      const total = Number.parseInt(normalizeText(parsedBody?.["@attributes"]?.count), 10);
      return {
        rows: list,
        totalCount: Number.isFinite(total) ? total : list.length,
      };
    }

    const detail = readResponseError(parsedBody, rawBody);
    const isRateLimited =
      response.status === 429 || /rate\s*limit/i.test(detail);
    lastError = `Lightspeed ${resource} request failed: ${detail}`;

    if (!isRateLimited || attempt >= LS_RATE_LIMIT_RETRY_ATTEMPTS) {
      throw new Error(lastError);
    }

    const retryAfterRaw = normalizeText(response.headers.get("retry-after"));
    const retryAfterSeconds = Number.parseFloat(retryAfterRaw);
    const retryWaitMs = Number.isFinite(retryAfterSeconds)
      ? Math.max(1000, Math.round(retryAfterSeconds * 1000))
      : 1200 * attempt;
    await delay(retryWaitMs);
  }

  throw new Error(lastError);
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function formatDisplayText(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeItemType(value: unknown) {
  const text = formatDisplayText(value);
  if (!text) return "Default";
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractMatrixColorAndSize(item: any) {
  const attributes = item?.ItemAttributes || {};
  const color = normalizeText(
    attributes?.attribute1 ??
      attributes?.color ??
      item?.attribute1 ??
      item?.color
  );
  const size = normalizeText(
    attributes?.attribute2 ??
      attributes?.size ??
      item?.attribute2 ??
      item?.size
  );
  return { color, size };
}

function extractDefaultRetailPrice(item: any) {
  const prices = toArray(item?.Prices?.ItemPrice);
  if (prices.length === 0) return "";

  const defaultPrice = prices.find((price: any) => {
    const useType = normalizeLower(price?.useType);
    return normalizeText(price?.useTypeID) === "1" || useType === "default";
  });

  const selectedPrice = defaultPrice || prices[0];
  const amount = normalizeText(selectedPrice?.amount);
  if (!amount) return "";
  return amount;
}

async function loadShops(accessToken: string, forceRefresh = false) {
  if (!forceRefresh && lightspeedShopCache.shopNames.length && lightspeedShopCache.expiresAt > Date.now()) {
    return {
      shopNameById: lightspeedShopCache.shopNameById,
      shopNames: lightspeedShopCache.shopNames,
    };
  }

  const shopNameById: Record<string, string> = {};
  const names: string[] = [];
  let offset = 0;
  const limit = 100;
  let totalCount = Number.POSITIVE_INFINITY;
  let guard = 0;

  while (offset < totalCount && guard < 20) {
    const page = await requestRSeriesList<any>({
      accessToken,
      resource: "Shop",
      query: { limit, offset },
    });
    totalCount = page.totalCount;
    const rows = page.rows;

    for (const row of rows) {
      if (toBoolean(row?.archived)) continue;
      const id = normalizeText(row?.shopID);
      const name = normalizeText(row?.name);
      if (!id || !name) continue;
      shopNameById[id] = name;
      if (!names.includes(name)) names.push(name);
    }

    if (rows.length === 0) break;
    offset += limit;
    guard += 1;
  }

  names.sort(compareText);
  lightspeedShopCache.shopNameById = shopNameById;
  lightspeedShopCache.shopNames = names;
  lightspeedShopCache.expiresAt = Date.now() + CACHE_MS.shops;
  return {
    shopNameById,
    shopNames: names,
  };
}

async function loadCategories(accessToken: string, forceRefresh = false) {
  if (
    !forceRefresh &&
    lightspeedCategoryCache.categoryNames.length &&
    lightspeedCategoryCache.expiresAt > Date.now()
  ) {
    return {
      categoryNameById: lightspeedCategoryCache.categoryNameById,
      categoryNames: lightspeedCategoryCache.categoryNames,
    };
  }

  const categoryNameById: Record<string, string> = {};
  const names: string[] = [];
  let offset = 0;
  const limit = 100;
  let totalCount = Number.POSITIVE_INFINITY;
  let guard = 0;

  while (offset < totalCount && guard < 100) {
    const page = await requestRSeriesList<any>({
      accessToken,
      resource: "Category",
      query: { limit, offset },
    });
    totalCount = page.totalCount;
    const rows = page.rows;

    for (const row of rows) {
      const id = normalizeText(row?.categoryID);
      const label = normalizeText(row?.fullPathName || row?.name);
      if (!id || !label) continue;
      categoryNameById[id] = label;
      if (!names.includes(label)) names.push(label);
    }

    if (rows.length === 0) break;
    offset += limit;
    guard += 1;
  }

  names.sort(compareText);
  lightspeedCategoryCache.categoryNameById = categoryNameById;
  lightspeedCategoryCache.categoryNames = names;
  lightspeedCategoryCache.expiresAt = Date.now() + CACHE_MS.categories;
  return {
    categoryNameById,
    categoryNames: names,
  };
}

function pickDefaultLocation(shopNames: string[]) {
  const preferred = shopNames.find((name) => normalizeLower(name) === normalizeLower(PREFERRED_DEFAULT_SHOP));
  if (preferred) return preferred;
  return shopNames[0] || PREFERRED_DEFAULT_SHOP;
}

function normalizeCatalogItem(
  item: any,
  index: number,
  shopNameById: Record<string, string>,
  categoryNameById: Record<string, string>
): CatalogRow {
  const itemId = normalizeText(item?.itemID);
  const itemMatrixId = normalizeText(item?.itemMatrixID);
  const systemSku = normalizeText(item?.systemSku);
  const customSku = normalizeText(item?.customSku);
  const upc = normalizeText(item?.upc);
  const ean = normalizeText(item?.ean);
  const description = normalizeText(item?.description);
  const matrix = extractMatrixColorAndSize(item);
  const retailPrice = extractDefaultRetailPrice(item);
  const retailPriceNumber = toNumber(retailPrice);
  const categoryId = normalizeText(item?.categoryID);
  const category = categoryNameById[categoryId] || (categoryId && categoryId !== "0" ? `Category ${categoryId}` : "Uncategorized");
  const itemType = normalizeItemType(item?.itemType);

  const locations: Record<string, number | null> = {};
  let qtyTotal = 0;
  let hasQty = false;
  for (const entry of toArray(item?.ItemShops?.ItemShop)) {
    const shopId = normalizeText((entry as any)?.shopID);
    if (!shopId || shopId === "0") continue;
    const shopName = normalizeText(shopNameById[shopId]);
    if (!shopName) continue;
    const qty = toNumber((entry as any)?.qoh);
    locations[shopName] = qty;
    if (qty !== null) {
      qtyTotal += qty;
      hasQty = true;
    }
  }

  return {
    id: itemId || systemSku || customSku || upc || ean || `item-${index + 1}`,
    itemId,
    itemMatrixId,
    systemSku,
    customSku,
    description,
    upc,
    ean,
    color: matrix.color,
    size: matrix.size,
    retailPrice,
    retailPriceNumber,
    category,
    itemType,
    qtyTotal: hasQty ? Number(qtyTotal.toFixed(2)) : null,
    locations,
  };
}

async function loadCatalogSnapshot(
  accessToken: string,
  deps: {
    shopNameById: Record<string, string>;
    categoryNameById: Record<string, string>;
  },
  forceRefresh = false
) {
  if (
    !forceRefresh &&
    lightspeedCatalogSnapshotCache.rows.length > 0 &&
    lightspeedCatalogSnapshotCache.expiresAt > Date.now()
  ) {
    return lightspeedCatalogSnapshotCache.rows;
  }

  let pageLimit = LS_ITEM_PAGE_LIMIT;
  const buildBaseQuery = (limit: number) => ({
    limit,
    archived: "false",
    load_relations: '["ItemShops","ItemAttributes"]',
  });

  let firstPage: { rows: any[]; totalCount: number } | null = null;
  try {
    firstPage = await requestRSeriesList<any>({
      accessToken,
      resource: "Item",
      query: { ...buildBaseQuery(pageLimit), offset: 0 },
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    const likelyLimitError =
      /limit|invalid|parameter|too\s+large|maximum/i.test(message);
    if (!likelyLimitError || pageLimit === LS_ITEM_PAGE_LIMIT_FALLBACK) {
      throw error;
    }
    pageLimit = LS_ITEM_PAGE_LIMIT_FALLBACK;
    firstPage = await requestRSeriesList<any>({
      accessToken,
      resource: "Item",
      query: { ...buildBaseQuery(pageLimit), offset: 0 },
    });
  }

  if (!firstPage) {
    throw new Error("Unable to load Lightspeed item catalog.");
  }

  const rawItems: any[] = [...firstPage.rows];
  const totalCount = firstPage.totalCount;
  const offsets: number[] = [];
  for (let offset = pageLimit; offset < totalCount; offset += pageLimit) {
    offsets.push(offset);
  }

  const concurrency = 6;
  for (let i = 0; i < offsets.length; i += concurrency) {
    const chunk = offsets.slice(i, i + concurrency);
    const pages = await Promise.all(
      chunk.map((offset) =>
        requestRSeriesList<any>({
          accessToken,
          resource: "Item",
          query: { ...buildBaseQuery(pageLimit), offset },
        })
      )
    );
    for (const page of pages) {
      rawItems.push(...page.rows);
    }
  }

  const rows = rawItems.map((item, index) =>
    normalizeCatalogItem(item, index, deps.shopNameById, deps.categoryNameById)
  );

  lightspeedCatalogSnapshotCache.rows = rows;
  lightspeedCatalogSnapshotCache.expiresAt = Date.now() + CACHE_MS.catalogSnapshot;
  return rows;
}

function includesText(haystack: string, needleLower: string) {
  if (!needleLower) return true;
  return normalizeLower(haystack).includes(needleLower);
}

function getLocationQty(locations: Record<string, number | null>, locationName: string) {
  if (!locationName) return null;
  const exact = locations[locationName];
  if (exact !== undefined) return exact;
  const key = Object.keys(locations).find((name) => normalizeLower(name) === normalizeLower(locationName));
  if (!key) return null;
  return locations[key];
}

function isSortDirection(value: string): value is CatalogSortDirection {
  return ALLOWED_SORT_DIRECTIONS.includes(value as CatalogSortDirection);
}

function isSortField(value: string): value is CatalogSortField {
  if (ALLOWED_SORT_FIELDS.includes(value as (typeof ALLOWED_SORT_FIELDS)[number])) return true;
  if (!value.startsWith("location:")) return false;
  return Boolean(normalizeText(value.slice("location:".length)));
}

function parseLegacySortMode(rawSort: string) {
  const value = normalizeText(rawSort);
  if (value === "qtyAsc") return { field: "qty" as CatalogSortField, direction: "asc" as CatalogSortDirection };
  if (value === "qtyDesc") return { field: "qty" as CatalogSortField, direction: "desc" as CatalogSortDirection };
  return { field: "customSku" as CatalogSortField, direction: "asc" as CatalogSortDirection };
}

function compareRowsByCustomSku(a: CatalogRow, b: CatalogRow) {
  const aSku = normalizeText(a.customSku);
  const bSku = normalizeText(b.customSku);
  if (aSku && bSku) {
    const bySku = compareText(aSku, bSku);
    if (bySku !== 0) return bySku;
  } else if (aSku) {
    return -1;
  } else if (bSku) {
    return 1;
  }

  const byName = compareText(normalizeText(a.description), normalizeText(b.description));
  if (byName !== 0) return byName;
  return compareText(normalizeText(a.itemId), normalizeText(b.itemId));
}

function toSortableItemName(row: CatalogRow) {
  return normalizeText(row.description || row.customSku || row.systemSku || row.itemId);
}

function toSortableUpc(row: CatalogRow) {
  return normalizeText(row.upc || row.ean);
}

function toSortableColor(row: CatalogRow) {
  return normalizeText(row.color);
}

function toSortableSize(row: CatalogRow) {
  return normalizeText(row.size);
}

function toSortablePrice(row: CatalogRow) {
  if (row.retailPriceNumber !== null && Number.isFinite(row.retailPriceNumber)) {
    return row.retailPriceNumber;
  }
  return toNumber(row.retailPrice);
}

function toSortableQty(row: CatalogRow, shopFilters: string[]) {
  let sum = 0;
  let hasAny = false;
  for (const shopFilter of shopFilters) {
    const qty = getLocationQty(row.locations, shopFilter);
    if (qty === null || qty === undefined || Number.isNaN(qty)) continue;
    sum += qty;
    hasAny = true;
  }
  if (!hasAny) return null;
  return Number(sum.toFixed(2));
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: CatalogSortDirection
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return 0;
  return direction === "asc" ? left - right : right - left;
}

function compareNullableText(left: string, right: string, direction: CatalogSortDirection) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const compared = compareText(a, b);
  return direction === "asc" ? compared : -compared;
}

function sortRows(
  rows: CatalogRow[],
  sortField: CatalogSortField,
  sortDirection: CatalogSortDirection,
  shopFilters: string[]
) {
  return [...rows].sort((a, b) => {
    let compared = 0;

    if (sortField === "customSku") {
      compared = compareRowsByCustomSku(a, b);
      if (sortDirection === "desc") compared *= -1;
    } else if (sortField === "item") {
      compared = compareNullableText(toSortableItemName(a), toSortableItemName(b), sortDirection);
    } else if (sortField === "qty") {
      compared = compareNullableNumber(
        toSortableQty(a, shopFilters),
        toSortableQty(b, shopFilters),
        sortDirection
      );
    } else if (sortField === "price") {
      compared = compareNullableNumber(toSortablePrice(a), toSortablePrice(b), sortDirection);
    } else if (sortField === "category") {
      compared = compareNullableText(a.category, b.category, sortDirection);
    } else if (sortField === "upc") {
      compared = compareNullableText(toSortableUpc(a), toSortableUpc(b), sortDirection);
    } else if (sortField === "color") {
      compared = compareNullableText(toSortableColor(a), toSortableColor(b), sortDirection);
    } else if (sortField === "size") {
      compared = compareNullableText(toSortableSize(a), toSortableSize(b), sortDirection);
    } else if (sortField.startsWith("location:")) {
      const locationName = normalizeText(sortField.slice("location:".length));
      compared = compareNullableNumber(
        getLocationQty(a.locations, locationName),
        getLocationQty(b.locations, locationName),
        sortDirection
      );
    }

    if (compared !== 0) return compared;
    return compareRowsByCustomSku(a, b);
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = normalizeText(searchParams.get("q"));
    const categoryFilter = normalizeText(searchParams.get("category")) || "all";
    const requestedShopsRaw = normalizeText(searchParams.get("shops"));
    const legacyShopFilter = normalizeText(searchParams.get("shop"));
    const itemTypeFilter = normalizeText(searchParams.get("itemType")) || "all";
    const requestedSort = normalizeText(searchParams.get("sort"));
    const requestedSortField = normalizeText(searchParams.get("sortField"));
    const requestedSortDir = normalizeLower(searchParams.get("sortDir"));
    const refresh = toBoolean(searchParams.get("refresh"));
    const allRowsMode = toBoolean(searchParams.get("all"));
    const legacySort = parseLegacySortMode(requestedSort);
    const sortField: CatalogSortField = isSortField(requestedSortField)
      ? requestedSortField
      : legacySort.field;
    const sortDirection: CatalogSortDirection = isSortDirection(requestedSortDir)
      ? requestedSortDir
      : legacySort.direction;

    const requestedPage = Number.parseInt(normalizeText(searchParams.get("page")), 10);
    const requestedPageSize = Number.parseInt(normalizeText(searchParams.get("pageSize")), 10);
    const pageSize = allRowsMode
      ? Math.max(1, Math.min(MAX_EXPORT_ROWS, Number.isFinite(requestedPageSize) ? requestedPageSize : MAX_EXPORT_ROWS))
      : ALLOWED_PAGE_SIZES.includes(requestedPageSize as (typeof ALLOWED_PAGE_SIZES)[number])
        ? requestedPageSize
        : 100;
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;

    const accessToken = await refreshLightspeedAccessToken(refresh);
    const [shopsData, categoriesData] = await Promise.all([
      loadShops(accessToken, refresh),
      loadCategories(accessToken, refresh),
    ]);

    const defaultLocation = pickDefaultLocation(shopsData.shopNames);
    const availableShopNames = shopsData.shopNames;
    let requestedShopNames: string[] = [];
    let allShopsRequested = false;
    if (requestedShopsRaw) {
      if (normalizeLower(requestedShopsRaw) === "all") {
        allShopsRequested = true;
      } else {
        try {
          const parsed = JSON.parse(requestedShopsRaw);
          if (Array.isArray(parsed)) {
            requestedShopNames = parsed.map((value) => normalizeText(value)).filter(Boolean);
          } else {
            requestedShopNames = requestedShopsRaw
              .split(",")
              .map((value) => normalizeText(value))
              .filter(Boolean);
          }
        } catch {
          requestedShopNames = requestedShopsRaw
            .split(",")
            .map((value) => normalizeText(value))
            .filter(Boolean);
        }
      }
    } else if (legacyShopFilter) {
      if (normalizeLower(legacyShopFilter) === "all") {
        allShopsRequested = true;
      } else {
        requestedShopNames = [legacyShopFilter];
      }
    } else {
      requestedShopNames = [PREFERRED_DEFAULT_SHOP];
    }

    const effectiveShops = allShopsRequested
      ? availableShopNames
      : availableShopNames.filter((shopName) =>
          requestedShopNames.some(
            (selected) => normalizeLower(selected) === normalizeLower(shopName)
          )
        );
    const fallbackShop =
      availableShopNames.find(
        (shopName) => normalizeLower(shopName) === normalizeLower(defaultLocation)
      ) ||
      availableShopNames[0] ||
      defaultLocation;
    const effectiveShopFilters = effectiveShops.length > 0 ? effectiveShops : [fallbackShop];

    const snapshot = await loadCatalogSnapshot(
      accessToken,
      {
        shopNameById: shopsData.shopNameById,
        categoryNameById: categoriesData.categoryNameById,
      },
      refresh
    );

    const queryLower = normalizeLower(query);
    const categoryLower = normalizeLower(categoryFilter);
    const itemTypeLower = normalizeLower(itemTypeFilter);

    const filtered = sortRows(
      snapshot.filter((row) => {
        if (queryLower) {
          const searchable = [
            row.description,
            row.customSku,
            row.systemSku,
            row.itemId,
            row.itemMatrixId,
            row.upc,
            row.ean,
            row.color,
            row.size,
            row.category,
          ].join(" ");
          if (!includesText(searchable, queryLower)) return false;
        }

        if (categoryLower !== "all" && normalizeLower(row.category) !== categoryLower) {
          return false;
        }

        if (itemTypeLower !== "all" && normalizeLower(row.itemType) !== itemTypeLower) {
          return false;
        }

        if (effectiveShopFilters.length > 0) {
          const hasSelectedQty = effectiveShopFilters.some(
            (shopName) => getLocationQty(row.locations, shopName) !== null
          );
          if (!hasSelectedQty) return false;
        }

        return true;
      }),
      sortField,
      sortDirection,
      effectiveShopFilters
    );

    const total = filtered.length;
    const totalPages = allRowsMode ? 1 : Math.max(1, Math.ceil(total / pageSize));
    const currentPage = allRowsMode ? 1 : Math.min(page, totalPages);
    const startIndex = allRowsMode ? 0 : (currentPage - 1) * pageSize;
    const slicedRows = allRowsMode
      ? filtered.slice(0, Math.min(total, pageSize))
      : filtered.slice(startIndex, startIndex + pageSize);
    const truncated = allRowsMode && filtered.length > slicedRows.length;

    const categoryOptions = [...new Set(snapshot.map((row) => row.category).filter(Boolean))].sort(compareText);
    const shopOptions = [...new Set(shopsData.shopNames.filter(Boolean))].sort(compareText);
    const itemTypeOptions = [...new Set(snapshot.map((row) => row.itemType).filter(Boolean))].sort(compareText);

    return NextResponse.json({
      ok: true,
      page: currentPage,
      pageSize,
      total,
      totalPages,
      defaultLocation,
      truncated,
      filters: {
        q: query,
        category: categoryFilter,
        shop: effectiveShopFilters[0] || defaultLocation,
        shops: effectiveShopFilters,
        itemType: itemTypeFilter,
      },
      sort: {
        field: sortField,
        direction: sortDirection,
      },
      options: {
        categories: categoryOptions,
        shops: shopOptions,
        itemTypes: itemTypeOptions,
      },
      rows: slicedRows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Unable to load Lightspeed catalog.") },
      { status: 400 }
    );
  }
}
