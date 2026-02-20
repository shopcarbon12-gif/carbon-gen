import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ensureLightspeedEnvLoaded } from "@/lib/loadLightspeedEnv";
import {
  getShopifyAdminToken,
  normalizeShopDomain,
  runShopifyGraphql,
} from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LS_TOKEN_URL = "https://cloud.merchantos.com/oauth/access_token.php";
const DEFAULT_SHOPIFY_API_VERSION = "2025-01";

const lightspeedAccessTokenCache: { token: string; expiresAt: number } = {
  token: "",
  expiresAt: 0,
};

const categoryNameCache = new Map<string, string>();
const manufacturerNameCache = new Map<string, string>();

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

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

type ShopifyTokenCandidate = {
  shop: string;
  token: string;
  source: "db" | "env_token" | "db_auto";
};

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

async function refreshLightspeedAccessToken() {
  if (lightspeedAccessTokenCache.token && lightspeedAccessTokenCache.expiresAt > Date.now()) {
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
        : 10 * 60 * 1000;
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

  if (!response.ok) {
    throw new Error(
      `Lightspeed ${resource} request failed: ${readResponseError(parsedBody, rawBody)}`
    );
  }

  return toArray(parsedBody?.[resource]) as T[];
}

function parsePrice(item: any, type: "default" | "msrp") {
  const prices = toArray(item?.Prices?.ItemPrice);
  if (prices.length < 1) return "";

  const desired = prices.find((price: any) => {
    const useType = normalizeLower(price?.useType);
    const useTypeId = normalizeText(price?.useTypeID);
    if (type === "default") {
      return useTypeId === "1" || useType === "default";
    }
    return useTypeId === "2" || useType === "msrp";
  });
  if (desired) return normalizeText(desired?.amount);

  if (type === "default") return normalizeText(prices[0]?.amount);
  return "";
}

function joinImageUrl(baseImageURL: string, filename: string) {
  const base = normalizeText(baseImageURL).replace(/\/+$/, "");
  const file = normalizeText(filename).replace(/^\/+/, "");
  if (!base || !file) return "";
  return `${base}/${file}`;
}

async function resolveCategoryName(accessToken: string, categoryId: string) {
  const key = normalizeText(categoryId);
  if (!key || key === "0") return "Uncategorized";
  if (categoryNameCache.has(key)) return categoryNameCache.get(key) || "";

  const rows = await requestRSeriesList<any>({
    accessToken,
    resource: "Category",
    query: { categoryID: key, limit: 1 },
  });
  const name = normalizeText(rows[0]?.fullPathName || rows[0]?.name);
  categoryNameCache.set(key, name || `Category ${key}`);
  return categoryNameCache.get(key) || "";
}

async function resolveManufacturerName(accessToken: string, manufacturerId: string) {
  const key = normalizeText(manufacturerId);
  if (!key || key === "0") return "";
  if (manufacturerNameCache.has(key)) return manufacturerNameCache.get(key) || "";

  const rows = await requestRSeriesList<any>({
    accessToken,
    resource: "Manufacturer",
    query: { manufacturerID: key, limit: 1 },
  });
  const name = normalizeText(rows[0]?.name);
  manufacturerNameCache.set(key, name);
  return manufacturerNameCache.get(key) || "";
}

async function resolveImageUrl(accessToken: string, itemId: string) {
  const key = normalizeText(itemId);
  if (!key) return "";
  const rows = await requestRSeriesList<any>({
    accessToken,
    resource: "Image",
    query: { itemID: key, limit: 100 },
  });

  const sorted = [...rows].sort((a, b) => {
    const aOrdering = Number.parseInt(normalizeText(a?.ordering), 10);
    const bOrdering = Number.parseInt(normalizeText(b?.ordering), 10);
    const aSort = Number.isFinite(aOrdering) ? aOrdering : Number.POSITIVE_INFINITY;
    const bSort = Number.isFinite(bOrdering) ? bOrdering : Number.POSITIVE_INFINITY;
    if (aSort !== bSort) return aSort - bSort;
    const aId = Number.parseInt(normalizeText(a?.imageID), 10);
    const bId = Number.parseInt(normalizeText(b?.imageID), 10);
    if (Number.isFinite(aId) && Number.isFinite(bId)) return aId - bId;
    return 0;
  });

  const first = sorted[0];
  return joinImageUrl(first?.baseImageURL, first?.filename);
}

async function getDbTokenForShop(shop: string) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();
    if (error) return "";
    return normalizeText((data as any)?.access_token);
  } catch {
    return "";
  }
}

async function getRecentShopRows(limit = 20) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("shop,access_token,installed_at")
      .order("installed_at", { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data as Array<{ shop?: string; access_token?: string }>;
  } catch {
    return [];
  }
}

function addTokenCandidate(
  bucket: ShopifyTokenCandidate[],
  row: {
    shop: string;
    token: string;
    source: ShopifyTokenCandidate["source"];
  }
) {
  const shop = normalizeShopDomain(row.shop) || "";
  const token = normalizeText(row.token);
  if (!shop || !token) return;
  const key = `${shop}__${token}`;
  if (bucket.some((item) => `${item.shop}__${item.token}` === key)) return;
  bucket.push({ shop, token, source: row.source });
}

async function getShopifyTokenCandidates() {
  const candidates: ShopifyTokenCandidate[] = [];
  const configuredShop = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN)) || "";

  if (configuredShop) {
    const dbToken = await getDbTokenForShop(configuredShop);
    addTokenCandidate(candidates, {
      shop: configuredShop,
      token: dbToken,
      source: "db",
    });

    const envToken = getShopifyAdminToken(configuredShop);
    addTokenCandidate(candidates, {
      shop: configuredShop,
      token: envToken,
      source: "env_token",
    });
  }

  if (candidates.length === 0) {
    const recent = await getRecentShopRows();
    for (const row of recent) {
      addTokenCandidate(candidates, {
        shop: normalizeText(row.shop),
        token: normalizeText(row.access_token),
        source: "db_auto",
      });
    }
  }

  return candidates;
}

function buildShopifySkuQuery(customSku: string) {
  const sku = normalizeText(customSku);
  if (!sku) return "";
  const escaped = sku.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `sku:"${escaped}" status:active published_status:published`;
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
  // Keep matching tolerant for catalogs where a leading "C" is missing on one side.
  return stripLeadingC(leftKey) === stripLeadingC(rightKey);
}

function extractColorOption(selectedOptions: any) {
  const options = toArray(selectedOptions);
  for (const option of options) {
    const name = normalizeLower(option?.name);
    if (name === "color" || name === "colour") {
      return normalizeLower(option?.value);
    }
  }
  return "";
}

function pickShopifyHeroImageBySku(customSku: string, edges: any[]) {
  const sku = normalizeText(customSku);
  if (!sku) return "";

  const rows = Array.isArray(edges) ? edges : [];
  for (const edge of rows) {
    const node = edge?.node;
    const variants = toArray(node?.variants?.nodes);
    const exactVariant = variants.find((variant: any) => skuMatches(variant?.sku, sku));
    if (!exactVariant) continue;

    const exactVariantImage = normalizeText(exactVariant?.image?.url);
    if (exactVariantImage) return exactVariantImage;

    const color = extractColorOption(exactVariant?.selectedOptions);
    if (color) {
      const sameColorVariant = variants.find((variant: any) => {
        const variantColor = extractColorOption(variant?.selectedOptions);
        if (!variantColor || variantColor !== color) return false;
        return Boolean(normalizeText(variant?.image?.url));
      });
      const sameColorVariantImage = normalizeText(sameColorVariant?.image?.url);
      if (sameColorVariantImage) return sameColorVariantImage;

      const colorImage = toArray(node?.images?.nodes).find((image: any) => {
        const altText = normalizeLower(image?.altText);
        return Boolean(altText) && altText.includes(color);
      });
      const colorImageUrl = normalizeText(colorImage?.url);
      if (colorImageUrl) return colorImageUrl;
    }

    const anyVariantImage = normalizeText(
      toArray(variants).find((variant: any) => normalizeText(variant?.image?.url))?.image?.url
    );
    if (anyVariantImage) return anyVariantImage;

    const featured = normalizeText(node?.featuredImage?.url);
    if (featured) return featured;

    const firstImage = normalizeText(toArray(node?.images?.nodes)[0]?.url);
    if (firstImage) return firstImage;
  }

  return "";
}

async function resolveShopifyHeroImage(customSku: string) {
  const sku = normalizeText(customSku);
  if (!sku) return "";

  const queryFilter = buildShopifySkuQuery(sku);
  if (!queryFilter) return "";

  const apiVersion = normalizeText(process.env.SHOPIFY_API_VERSION || DEFAULT_SHOPIFY_API_VERSION);
  const tokenCandidates = await getShopifyTokenCandidates();
  if (tokenCandidates.length < 1) return "";

  const query = `
    query HeroImageBySku($query: String!) {
      products(first: 10, query: $query) {
        edges {
          node {
            id
            featuredImage {
              url
              altText
            }
            images(first: 20) {
              nodes {
                url
                altText
              }
            }
            variants(first: 100) {
              nodes {
                sku
                image {
                  url
                  altText
                }
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  for (const candidate of tokenCandidates) {
    const response = await runShopifyGraphql<{
      products?: {
        edges?: Array<{ node?: any }>;
      };
    }>({
      shop: candidate.shop,
      token: candidate.token,
      query,
      variables: { query: queryFilter },
      apiVersion,
    });

    if (!response.ok) continue;
    const edges = toArray(response.data?.products?.edges);
    const hero = pickShopifyHeroImageBySku(sku, edges);
    if (hero) return hero;
  }

  return "";
}

async function resolveItem(accessToken: string, lookup: string) {
  const trimmed = normalizeText(lookup);
  if (!trimmed) return null;

  const candidates: Record<string, string>[] = [];
  if (/^\d+$/.test(trimmed)) {
    candidates.push({ itemID: trimmed });
  }
  candidates.push({ systemSku: trimmed });
  candidates.push({ customSku: trimmed });

  for (const candidate of candidates) {
    const rows = await requestRSeriesList<any>({
      accessToken,
      resource: "Item",
      query: {
        ...candidate,
        limit: 1,
        archived: "false",
        load_relations: '["Manufacturer"]',
      },
    });
    if (rows.length > 0) return rows[0];
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  ensureLightspeedEnvLoaded();
  try {
    const { itemId } = await params;
    const lookup = normalizeText(itemId);
    if (!lookup) {
      return NextResponse.json({ error: "Item id is required." }, { status: 400 });
    }

    const accessToken = await refreshLightspeedAccessToken();
    const item = await resolveItem(accessToken, lookup);
    if (!item) {
      return NextResponse.json({ error: "Item not found in Lightspeed." }, { status: 404 });
    }

    const itemIdValue = normalizeText(item?.itemID);
    const systemId = normalizeText(item?.systemSku || item?.itemID);
    const name = normalizeText(item?.description);
    const upc = normalizeText(item?.upc || item?.ean);
    const customSku = normalizeText(item?.customSku);
    const categoryId = normalizeText(item?.categoryID);
    const manufacturerId = normalizeText(item?.manufacturerID);
    const defaultPrice = parsePrice(item, "default");
    const msrp = parsePrice(item, "msrp");

    const [category, brand, lightspeedImage, shopifyHeroImage] = await Promise.all([
      resolveCategoryName(accessToken, categoryId),
      resolveManufacturerName(accessToken, manufacturerId),
      resolveImageUrl(accessToken, itemIdValue),
      resolveShopifyHeroImage(customSku),
    ]);
    const image = shopifyHeroImage || lightspeedImage;

    return NextResponse.json({
      ok: true,
      item: {
        itemId: itemIdValue,
        systemId,
        name,
        image,
        upc,
        customSku,
        category,
        brand,
        defaultPrice,
        msrp,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Unable to load Lightspeed item details.") },
      { status: 400 }
    );
  }
}
