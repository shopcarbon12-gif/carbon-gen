import { NextResponse } from "next/server";
import { ensureLightspeedEnvLoaded } from "@/lib/loadLightspeedEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LS_TOKEN_URL = "https://cloud.merchantos.com/oauth/access_token.php";

const lightspeedAccessTokenCache: { token: string; expiresAt: number } = {
  token: "",
  expiresAt: 0,
};

type RawRow = {
  barcodeNumber?: unknown;
  styleNumber?: unknown;
  description?: unknown;
  color?: unknown;
  size?: unknown;
  matrixDescription?: unknown;
  srp?: unknown;
  upc?: unknown;
};

type PreparedRow = {
  barcodeNumber: string;
  styleNumber: string;
  description: string;
  color: string;
  size: string;
  matrixDescription: string;
  srp: string;
  upc: string;
  codeNumber: string;
  matrixKey: string;
};

type RowResult = {
  barcodeNumber: string;
  systemId: string;
  itemId: string;
  matrixId: string;
  status: "created" | "updated" | "existing" | "failed";
  message: string;
};

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

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
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

function getRSeriesResourceEndpoint(resource: string, id?: string) {
  const accountId = normalizeText(process.env.LS_ACCOUNT_ID);
  if (!accountId) {
    throw new Error("LS_ACCOUNT_ID is missing. Configure Lightspeed account ID first.");
  }

  const base = normalizeText(process.env.LS_API_BASE || "https://api.lightspeedapp.com").replace(
    /\/+$/,
    ""
  );
  const core = /\/API$/i.test(base)
    ? `${base}/Account/${accountId}/${resource}`
    : `${base}/API/Account/${accountId}/${resource}`;
  const idPart = normalizeText(id);
  if (idPart) return `${core}/${encodeURIComponent(idPart)}.json`;
  return `${core}.json`;
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

async function requestRSeries<T>(params: {
  accessToken: string;
  resource: string;
  method?: "GET" | "POST" | "PUT";
  id?: string;
  query?: Record<string, string | number>;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}) {
  const {
    accessToken,
    resource,
    method = "GET",
    id = "",
    query = {},
    body,
    timeoutMs = 20_000,
  } = params;

  const endpoint = getRSeriesResourceEndpoint(resource, id);
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(query)) {
    const textValue = normalizeText(value);
    if (!textValue) continue;
    url.searchParams.set(key, textValue);
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
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
      `Lightspeed ${resource} ${method} request failed: ${readResponseError(parsedBody, rawBody)}`
    );
  }

  return parsedBody as T;
}

async function requestRSeriesList<T>(params: {
  accessToken: string;
  resource: string;
  query?: Record<string, string | number>;
}) {
  const response = await requestRSeries<any>({
    accessToken: params.accessToken,
    resource: params.resource,
    method: "GET",
    query: params.query,
  });
  return toArray(response?.[params.resource]) as T[];
}

async function requestRSeriesCreate<T>(params: {
  accessToken: string;
  resource: string;
  payload: Record<string, unknown>;
}) {
  const response = await requestRSeries<any>({
    accessToken: params.accessToken,
    resource: params.resource,
    method: "POST",
    body: params.payload,
  });
  return response?.[params.resource] as T;
}

async function requestRSeriesUpdate<T>(params: {
  accessToken: string;
  resource: string;
  id: string;
  payload: Record<string, unknown>;
}) {
  const response = await requestRSeries<any>({
    accessToken: params.accessToken,
    resource: params.resource,
    id: params.id,
    method: "PUT",
    body: params.payload,
  });
  return response?.[params.resource] as T;
}

function stripLeadingC(value: string) {
  const clean = normalizeText(value).toLowerCase();
  return clean.startsWith("c") ? clean.slice(1) : clean;
}

function skuMatches(left: unknown, right: unknown) {
  const leftKey = normalizeText(left).replace(/\s+/g, "").toLowerCase();
  const rightKey = normalizeText(right).replace(/\s+/g, "").toLowerCase();
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  return stripLeadingC(leftKey) === stripLeadingC(rightKey);
}

function deriveCodeNumber(barcodeNumber: string) {
  return normalizeText(barcodeNumber).slice(0, 7);
}

function normalizeRows(rawRows: RawRow[]) {
  const deduped = new Map<string, PreparedRow>();
  for (const raw of rawRows) {
    const barcodeNumber = normalizeText(raw.barcodeNumber);
    if (!barcodeNumber) continue;
    const styleNumber = normalizeText(raw.styleNumber);
    const description = normalizeText(raw.description);
    const color = normalizeText(raw.color);
    const size = normalizeText(raw.size);
    const srp = normalizeText(raw.srp);
    const upc = normalizeText(raw.upc);
    const codeNumber = deriveCodeNumber(barcodeNumber);
    const fallbackMatrixDescription = [styleNumber, description]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .join(" ");
    const matrixDescription =
      normalizeText(raw.matrixDescription) ||
      fallbackMatrixDescription ||
      description ||
      (codeNumber ? `Matrix ${codeNumber}` : barcodeNumber);
    const matrixKey = codeNumber || `${matrixDescription}|${styleNumber}`;

    deduped.set(barcodeNumber.toLowerCase(), {
      barcodeNumber,
      styleNumber,
      description,
      color,
      size,
      matrixDescription,
      srp,
      upc,
      codeNumber,
      matrixKey,
    });
  }
  return [...deduped.values()];
}

function resolveColorSizeAttributeSetId(rows: any[]) {
  const normalizedRows = rows.map((row) => ({
    id: normalizeText(row?.itemAttributeSetID),
    name: normalizeText(row?.name),
    attr1: normalizeLower(row?.attributeName1),
    attr2: normalizeLower(row?.attributeName2),
  }));

  const exactName = normalizedRows.find((row) => normalizeLower(row.name) === "color/size");
  if (exactName?.id) return exactName.id;

  const fuzzyName = normalizedRows.find(
    (row) => normalizeLower(row.name).includes("color") && normalizeLower(row.name).includes("size")
  );
  if (fuzzyName?.id) return fuzzyName.id;

  const byAttributes = normalizedRows.find(
    (row) => row.attr1 === "color" && row.attr2 === "size"
  );
  if (byAttributes?.id) return byAttributes.id;

  return "";
}

async function resolveItemAttributeSetId(accessToken: string, requestedId: string) {
  if (requestedId) return requestedId;

  const rows = await requestRSeriesList<any>({
    accessToken,
    resource: "ItemAttributeSet",
    query: { limit: 200, archived: "false" },
  });
  const found = resolveColorSizeAttributeSetId(rows);
  if (found) return found;

  throw new Error("Unable to find ItemAttributeSet for Color/Size.");
}

function buildVariantDescription(row: PreparedRow) {
  const parts = [row.description, row.color, row.size].map((part) => normalizeText(part)).filter(Boolean);
  if (!parts.length) return row.barcodeNumber;
  return parts.join(" ");
}

function buildItemAttributes(row: PreparedRow, itemAttributeSetId: string) {
  return {
    itemAttributeSetID: String(itemAttributeSetId),
    attribute1: normalizeText(row.color),
    attribute2: normalizeText(row.size),
  };
}

function safeUpc(value: string) {
  const upc = normalizeText(value);
  if (!upc) return "";
  if (!/^\d{11,18}$/.test(upc)) return "";
  return upc;
}

function maybePricePayload(value: string) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  const amount = Number.isInteger(num) ? String(num) : num.toFixed(2);
  return {
    ItemPrice: [
      {
        amount,
        useTypeID: "1",
        useType: "Default",
      },
    ],
  };
}

async function findExistingItemByBarcode(accessToken: string, barcodeNumber: string) {
  const normalized = normalizeText(barcodeNumber);
  if (!normalized) return null;

  const candidates = [normalized];
  const withoutLeadingC =
    normalized.toLowerCase().startsWith("c") ? normalized.slice(1) : `C${normalized}`;
  if (withoutLeadingC && !candidates.includes(withoutLeadingC)) candidates.push(withoutLeadingC);

  for (const candidate of candidates) {
    const rows = await requestRSeriesList<any>({
      accessToken,
      resource: "Item",
      query: {
        customSku: candidate,
        limit: 1,
        archived: "false",
        load_relations: '["ItemAttributes"]',
      },
    });
    const found = rows[0];
    if (found && skuMatches(found?.customSku, normalized)) {
      return found;
    }
  }

  return null;
}

async function findExistingMatrixByDescription(accessToken: string, matrixDescription: string) {
  const normalizedDescription = normalizeText(matrixDescription);
  if (!normalizedDescription) return "";

  const rows = await requestRSeriesList<any>({
    accessToken,
    resource: "ItemMatrix",
    query: {
      description: normalizedDescription,
      limit: 50,
      archived: "false",
    },
  });

  const exact = rows.find(
    (row) => normalizeLower(row?.description) === normalizeLower(normalizedDescription)
  );
  return normalizeText(exact?.itemMatrixID || rows[0]?.itemMatrixID);
}

export async function POST(req: Request) {
  ensureLightspeedEnvLoaded();
  try {
    const body = (await req.json().catch(() => ({}))) as {
      rows?: RawRow[];
      itemAttributeSetId?: unknown;
      forceMatrix?: unknown;
    };

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    const rows = normalizeRows(rawRows);
    if (!rows.length) {
      return NextResponse.json(
        { error: "No valid rows provided. Include at least one row with barcode number." },
        { status: 400 }
      );
    }

    const forceMatrix = body.forceMatrix === undefined ? true : toBoolean(body.forceMatrix);
    const requestedAttributeSetId = normalizeText(body.itemAttributeSetId);
    const accessToken = await refreshLightspeedAccessToken();
    const itemAttributeSetId = await resolveItemAttributeSetId(accessToken, requestedAttributeSetId);

    const existingByBarcode = new Map<string, any | null>();
    const lookupErrorsByBarcode = new Map<string, string>();

    for (const row of rows) {
      try {
        const existing = await findExistingItemByBarcode(accessToken, row.barcodeNumber);
        existingByBarcode.set(row.barcodeNumber.toLowerCase(), existing);
      } catch (e: any) {
        const message = String(e?.message || "Item lookup failed.");
        lookupErrorsByBarcode.set(row.barcodeNumber.toLowerCase(), message);
      }
    }

    const rowsByMatrixKey = new Map<string, PreparedRow[]>();
    for (const row of rows) {
      const list = rowsByMatrixKey.get(row.matrixKey) || [];
      list.push(row);
      rowsByMatrixKey.set(row.matrixKey, list);
    }

    const matrixIdByKey = new Map<string, string>();
    const matrixErrorByKey = new Map<string, string>();
    const matrixIdByDescription = new Map<string, string>();
    let createdMatrices = 0;

    for (const [matrixKey, groupRows] of rowsByMatrixKey.entries()) {
      try {
        const existingMatrixId = groupRows
          .map((row) => existingByBarcode.get(row.barcodeNumber.toLowerCase()))
          .map((item) => normalizeText(item?.itemMatrixID))
          .find((itemMatrixId) => itemMatrixId && itemMatrixId !== "0");

        if (existingMatrixId) {
          matrixIdByKey.set(matrixKey, existingMatrixId);
          continue;
        }

        const matrixDescription = normalizeText(groupRows[0]?.matrixDescription || "") || `Matrix ${matrixKey}`;
        const descriptionKey = normalizeLower(matrixDescription);
        const cachedMatrixId = matrixIdByDescription.get(descriptionKey);
        if (cachedMatrixId) {
          matrixIdByKey.set(matrixKey, cachedMatrixId);
          continue;
        }

        const foundMatrixId = await findExistingMatrixByDescription(accessToken, matrixDescription);
        if (foundMatrixId) {
          matrixIdByKey.set(matrixKey, foundMatrixId);
          matrixIdByDescription.set(descriptionKey, foundMatrixId);
          continue;
        }

        const matrix = await requestRSeriesCreate<any>({
          accessToken,
          resource: "ItemMatrix",
          payload: {
            description: matrixDescription,
            itemAttributeSetID: itemAttributeSetId,
          },
        });

        const itemMatrixId = normalizeText(matrix?.itemMatrixID);
        if (!itemMatrixId) {
          throw new Error("Lightspeed did not return itemMatrixID.");
        }

        matrixIdByKey.set(matrixKey, itemMatrixId);
        matrixIdByDescription.set(descriptionKey, itemMatrixId);
        createdMatrices += 1;
      } catch (e: any) {
        matrixErrorByKey.set(
          matrixKey,
          String(e?.message || "Unable to resolve/create matrix for this group.")
        );
      }
    }

    const results: RowResult[] = [];
    let createdItems = 0;
    let updatedItems = 0;
    let existingItems = 0;
    let failures = 0;

    for (const row of rows) {
      const barcodeKey = row.barcodeNumber.toLowerCase();
      const lookupError = lookupErrorsByBarcode.get(barcodeKey);
      if (lookupError) {
        failures += 1;
        results.push({
          barcodeNumber: row.barcodeNumber,
          systemId: "",
          itemId: "",
          matrixId: "",
          status: "failed",
          message: lookupError,
        });
        continue;
      }

      const matrixError = matrixErrorByKey.get(row.matrixKey);
      if (matrixError) {
        failures += 1;
        results.push({
          barcodeNumber: row.barcodeNumber,
          systemId: "",
          itemId: "",
          matrixId: "",
          status: "failed",
          message: matrixError,
        });
        continue;
      }

      const matrixId = normalizeText(matrixIdByKey.get(row.matrixKey));
      if (!matrixId) {
        failures += 1;
        results.push({
          barcodeNumber: row.barcodeNumber,
          systemId: "",
          itemId: "",
          matrixId: "",
          status: "failed",
          message: "Matrix ID missing for row group.",
        });
        continue;
      }

      try {
        const existing = existingByBarcode.get(barcodeKey);
        const attributes = buildItemAttributes(row, itemAttributeSetId);
        const variantDescription = buildVariantDescription(row);

        if (existing) {
          const existingItemId = normalizeText(existing?.itemID);
          const existingSystemId = normalizeText(existing?.systemSku || existing?.itemID);
          const existingMatrixId = normalizeText(existing?.itemMatrixID);
          const existingAttr1 = normalizeText(existing?.ItemAttributes?.attribute1);
          const existingAttr2 = normalizeText(existing?.ItemAttributes?.attribute2);

          const needsUpdate =
            forceMatrix &&
            (existingMatrixId !== matrixId ||
              existingAttr1 !== normalizeText(attributes.attribute1) ||
              existingAttr2 !== normalizeText(attributes.attribute2));

          if (!needsUpdate) {
            existingItems += 1;
            results.push({
              barcodeNumber: row.barcodeNumber,
              systemId: existingSystemId,
              itemId: existingItemId,
              matrixId: existingMatrixId || matrixId,
              status: "existing",
              message:
                existingMatrixId && existingMatrixId !== "0"
                  ? "Item already exists in matrix."
                  : "Item already exists.",
            });
            continue;
          }

          if (!existingItemId) {
            throw new Error("Existing Lightspeed item is missing itemID.");
          }

          const updated = await requestRSeriesUpdate<any>({
            accessToken,
            resource: "Item",
            id: existingItemId,
            payload: {
              itemMatrixID: matrixId,
              description: variantDescription,
              ItemAttributes: attributes,
            },
          });

          updatedItems += 1;
          results.push({
            barcodeNumber: row.barcodeNumber,
            systemId: normalizeText(updated?.systemSku || existingSystemId),
            itemId: normalizeText(updated?.itemID || existingItemId),
            matrixId: normalizeText(updated?.itemMatrixID || matrixId),
            status: "updated",
            message: "Existing item moved/updated in matrix.",
          });
          continue;
        }

        const payload: Record<string, unknown> = {
          description: variantDescription,
          customSku: row.barcodeNumber,
          itemType: "default",
          serialized: "false",
          tax: "true",
          discountable: "true",
          itemMatrixID: matrixId,
          ItemAttributes: attributes,
        };

        const upc = safeUpc(row.upc);
        if (upc) payload.upc = upc;

        const prices = maybePricePayload(row.srp);
        if (prices) payload.Prices = prices;

        const created = await requestRSeriesCreate<any>({
          accessToken,
          resource: "Item",
          payload,
        });

        createdItems += 1;
        results.push({
          barcodeNumber: row.barcodeNumber,
          systemId: normalizeText(created?.systemSku || created?.itemID),
          itemId: normalizeText(created?.itemID),
          matrixId: normalizeText(created?.itemMatrixID || matrixId),
          status: "created",
          message: "Item created in matrix.",
        });
      } catch (e: any) {
        failures += 1;
        results.push({
          barcodeNumber: row.barcodeNumber,
          systemId: "",
          itemId: "",
          matrixId,
          status: "failed",
          message: String(e?.message || "Unable to create/update item in matrix."),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      forceMatrix,
      itemAttributeSetId,
      createdMatrices,
      createdItems,
      updatedItems,
      existingItems,
      failures,
      rows: results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Unable to create Lightspeed matrix items.") },
      { status: 400 }
    );
  }
}
