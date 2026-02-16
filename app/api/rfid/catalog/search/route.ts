import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { CatalogItem } from "@/lib/rfid";

export const runtime = "nodejs";

const DEFAULT_LS_TOKEN_URL = "https://cloud.merchantos.com/oauth/access_token.php";

const lightspeedAccessTokenCache: { token: string; expiresAt: number } = {
  token: "",
  expiresAt: 0,
};

const lightspeedCatalogCache: { items: CatalogItem[]; expiresAt: number } = {
  items: [],
  expiresAt: 0,
};

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function parseTokenResponseBody(rawText: string) {
  const text = String(rawText || "").trim();
  if (!text) return {} as Record<string, unknown>;

  try {
    const parsedJson = JSON.parse(text);
    if (parsedJson && typeof parsedJson === "object") return parsedJson as Record<string, unknown>;
  } catch {
    // fall through to URLSearchParams parse
  }

  const parsedForm = Object.fromEntries(new URLSearchParams(text));
  if (Object.keys(parsedForm).length > 0) return parsedForm as Record<string, unknown>;
  return { raw: text };
}

function getTokenEndpointCandidates(domainPrefix: string) {
  const configuredRaw = (process.env.LS_OAUTH_TOKEN_URL || DEFAULT_LS_TOKEN_URL).trim();
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

function getRSeriesItemEndpoint() {
  const accountId = String(process.env.LS_ACCOUNT_ID || "").trim();
  if (!accountId) {
    throw new Error("LS_ACCOUNT_ID is missing. Configure Lightspeed account ID first.");
  }

  const base = String(process.env.LS_API_BASE || "https://api.lightspeedapp.com")
    .trim()
    .replace(/\/+$/, "");

  if (/\/API$/i.test(base)) {
    return `${base}/Account/${accountId}/Item.json`;
  }
  return `${base}/API/Account/${accountId}/Item.json`;
}

function extractDefaultRetailPrice(item: any) {
  const prices = toArray(item?.Prices?.ItemPrice);
  if (prices.length === 0) return "";

  const defaultPrice = prices.find((price: any) => {
    const useType = String(price?.useType || "")
      .trim()
      .toLowerCase();
    return String(price?.useTypeID || "") === "1" || useType === "default";
  });

  const selectedPrice = defaultPrice || prices[0];
  const amount = selectedPrice?.amount;
  if (amount === undefined || amount === null || String(amount).trim() === "") return "";
  return String(amount).trim();
}

function normalizeCatalogItem(item: any): CatalogItem {
  return {
    itemId: String(item?.itemID || "").trim(),
    systemSku: String(item?.systemSku || "").trim(),
    customSku: String(item?.customSku || "").trim(),
    upc: String(item?.upc || "").trim(),
    ean: String(item?.ean || "").trim(),
    manufacturerSku: String(item?.manufacturerSku || "").trim(),
    description: String(item?.description || "").trim(),
    retailPrice: extractDefaultRetailPrice(item),
    color: String(item?.color || "").trim(),
    size: String(item?.size || "").trim(),
  };
}

function dedupeCatalogItems(items: CatalogItem[], limit: number) {
  const unique = new Map<string, CatalogItem>();
  for (const item of items) {
    const key = item.itemId || item.systemSku || item.customSku || item.upc || item.ean;
    if (!key) continue;
    if (!unique.has(key)) unique.set(key, item);
    if (unique.size >= limit) break;
  }
  return [...unique.values()].slice(0, limit);
}

function scoreCatalogMatch(item: CatalogItem, queryLower: string) {
  const fields = [
    item.systemSku,
    item.customSku,
    item.upc,
    item.ean,
    item.manufacturerSku,
    item.description,
    item.itemId,
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  let best = 0;
  for (const field of fields) {
    if (field === queryLower) best = Math.max(best, 100);
    else if (field.startsWith(queryLower)) best = Math.max(best, 75);
    else if (field.includes(queryLower)) best = Math.max(best, 40);
  }
  return best;
}

async function refreshLightspeedAccessToken() {
  if (lightspeedAccessTokenCache.token && lightspeedAccessTokenCache.expiresAt > Date.now()) {
    return lightspeedAccessTokenCache.token;
  }

  const clientId = String(process.env.LS_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.LS_CLIENT_SECRET || "").trim();
  const refreshToken = String(process.env.LS_REFRESH_TOKEN || "").trim();
  const domainPrefix = String(process.env.LS_DOMAIN_PREFIX || "").trim().toLowerCase();

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
        signal: AbortSignal.timeout(12000),
      });

      const tokenRawBody = await tokenResponse.text();
      const tokenBody = parseTokenResponseBody(tokenRawBody);
      if (!tokenResponse.ok) {
        const detail = typeof tokenBody === "object" ? JSON.stringify(tokenBody) : String(tokenBody);
        lastError = `Unable to refresh token at ${endpoint}: ${detail}`;
        continue;
      }

      const accessToken = String(tokenBody.access_token || "").trim();
      if (!accessToken) {
        lastError = `Unable to refresh token at ${endpoint}: access token missing`;
        continue;
      }

      const expiresInSeconds = Number.parseInt(String(tokenBody.expires_in || ""), 10);
      const ttlMs = Number.isFinite(expiresInSeconds)
        ? Math.max(30, expiresInSeconds - 30) * 1000
        : 10 * 60 * 1000;
      lightspeedAccessTokenCache.token = accessToken;
      lightspeedAccessTokenCache.expiresAt = Date.now() + ttlMs;

      const newRefreshToken = String(tokenBody.refresh_token || "").trim();
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

async function requestRSeriesItems(
  accessToken: string,
  queryParams: Record<string, string | number> = {}
) {
  const endpoint = getRSeriesItemEndpoint();
  const url = new URL(endpoint);

  if (!url.searchParams.has("limit")) url.searchParams.set("limit", "20");
  url.searchParams.set("archived", "false");

  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  const rawBody = await response.text();
  let parsedBody: any = {};
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = { raw: rawBody };
  }

  if (!response.ok) {
    const details =
      parsedBody?.message ||
      parsedBody?.error ||
      parsedBody?.error_description ||
      String(rawBody || "").slice(0, 500) ||
      "request failed";
    throw new Error(`Lightspeed catalog request failed: ${details}`);
  }

  const list = toArray(parsedBody?.Item).map(normalizeCatalogItem);
  const total = Number.parseInt(String(parsedBody?.["@attributes"]?.count || ""), 10);
  return {
    items: list,
    totalCount: Number.isFinite(total) ? total : list.length,
  };
}

async function loadCatalogSnapshot(accessToken: string) {
  if (lightspeedCatalogCache.items.length > 0 && lightspeedCatalogCache.expiresAt > Date.now()) {
    return lightspeedCatalogCache.items;
  }

  const allItems: CatalogItem[] = [];
  let offset = 0;
  const pageLimit = 100;
  let totalCount = Number.POSITIVE_INFINITY;
  let guard = 0;

  while (offset < totalCount && guard < 150) {
    const page = await requestRSeriesItems(accessToken, {
      limit: pageLimit,
      offset,
    });
    allItems.push(...page.items);
    totalCount = page.totalCount;
    offset += pageLimit;
    guard += 1;
    if (page.items.length === 0) break;
  }

  lightspeedCatalogCache.items = allItems;
  lightspeedCatalogCache.expiresAt = Date.now() + 5 * 60 * 1000;
  return allItems;
}

async function searchLightspeedCatalog(query: string, limit = 20) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < 2) {
    throw new Error("Enter at least 2 characters to search the catalog.");
  }

  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(String(limit), 10) || 20));
  const accessToken = await refreshLightspeedAccessToken();
  const exactMatches: CatalogItem[] = [];
  const exactFields = ["systemSku", "customSku", "upc", "ean", "manufacturerSku", "description"];

  if (/^\d+$/.test(trimmed)) {
    exactFields.unshift("itemID");
  }

  for (const field of exactFields) {
    const page = await requestRSeriesItems(accessToken, {
      limit: safeLimit,
      [field]: trimmed,
    });
    exactMatches.push(...page.items);
    const unique = dedupeCatalogItems(exactMatches, safeLimit);
    if (unique.length >= safeLimit) return unique;
  }

  const dedupedExact = dedupeCatalogItems(exactMatches, safeLimit);
  if (dedupedExact.length > 0) return dedupedExact;

  const snapshot = await loadCatalogSnapshot(accessToken);
  const queryLower = trimmed.toLowerCase();

  const partial = snapshot
    .map((item) => ({ item, score: scoreCatalogMatch(item, queryLower) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.item.description.localeCompare(b.item.description);
    })
    .slice(0, safeLimit)
    .map((entry) => entry.item);

  return dedupeCatalogItems(partial, safeLimit);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = String(searchParams.get("q") || "").trim();
    const rawLimit = Number(searchParams.get("limit") || "20");
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.trunc(rawLimit))) : 20;
    const items = await searchLightspeedCatalog(query, limit);
    return NextResponse.json({
      query,
      count: items.length,
      items,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Unable to search Lightspeed catalog.") },
      { status: 400 }
    );
  }
}

