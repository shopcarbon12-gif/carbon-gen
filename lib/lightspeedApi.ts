import { ensureLightspeedEnvLoaded } from "@/lib/loadLightspeedEnv";

ensureLightspeedEnvLoaded();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

const LS_FETCH_MAX_RETRIES = 3;
const LS_RATE_LIMIT_RETRY_ATTEMPTS = 3;
const IS_WORKER = typeof (globalThis as any).caches?.default !== "undefined";
const LS_MIN_REQUEST_INTERVAL_MS = IS_WORKER ? 400 : 180;

let lightspeedLastRequestAt = 0;
let lightspeedRequestChain = Promise.resolve();

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

async function resilientFetch(url: string, opts: RequestInit, timeoutMs = 30_000): Promise<Response> {
  for (let attempt = 1; attempt <= LS_FETCH_MAX_RETRIES; attempt++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isRetryable = /timeout|abort|network|ECONNRESET|ENOTFOUND|socket hang up|fetch failed/i.test(msg);
      if (!isRetryable || attempt >= LS_FETCH_MAX_RETRIES) throw err;
      await delay(1500 * attempt);
    }
  }
  throw new Error("resilientFetch: exhausted retries");
}

async function waitForLightspeedRequestSlot() {
  const next = lightspeedRequestChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, LS_MIN_REQUEST_INTERVAL_MS - (now - lightspeedLastRequestAt));
    if (waitMs > 0) await delay(waitMs);
    lightspeedLastRequestAt = Date.now();
  });
  lightspeedRequestChain = next.catch(() => undefined);
  await next;
}

function getTokenEndpointCandidates(domainPrefix: string) {
  const DEFAULT_LS_TOKEN_URL = "https://cloud.merchantos.com/oauth/access_token.php";
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
  const legacy = [
    "https://cloud.merchantos.com/oauth/access_token.php",
    "https://cloud.merchantos.com/auth/oauth/token",
  ];
  for (const ep of legacy) {
    if (!candidates.includes(ep)) candidates.push(ep);
  }
  return candidates.filter(Boolean);
}

const tokenCache = { token: "", expiresAt: 0 };
const CACHE_FALLBACK_MS = 9 * 60 * 1000;

export async function refreshLightspeedAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const clientId = normalizeText(process.env.LS_CLIENT_ID);
  const clientSecret = normalizeText(process.env.LS_CLIENT_SECRET);
  const refreshToken = normalizeText(process.env.LS_REFRESH_TOKEN);
  const domainPrefix = normalizeText(process.env.LS_DOMAIN_PREFIX).toLowerCase();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Lightspeed credentials missing. Set LS_CLIENT_ID, LS_CLIENT_SECRET, and LS_REFRESH_TOKEN.");
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
      const tokenResponse = await resilientFetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: payload,
      }, 12_000);

      const tokenRawBody = await tokenResponse.text();
      let tokenBody: Record<string, unknown> = {};
      try { tokenBody = JSON.parse(tokenRawBody); } catch { /* fallback */ }

      if (!tokenResponse.ok) {
        lastError = `Unable to refresh token at ${endpoint}: ${JSON.stringify(tokenBody)}`;
        continue;
      }

      const accessToken = normalizeText(tokenBody.access_token);
      if (!accessToken) {
        lastError = `Unable to refresh token at ${endpoint}: access token missing`;
        continue;
      }

      const expiresIn = Number.parseInt(normalizeText(tokenBody.expires_in), 10);
      const ttlMs = Number.isFinite(expiresIn) ? Math.max(30, expiresIn - 30) * 1000 : CACHE_FALLBACK_MS;
      tokenCache.token = accessToken;
      tokenCache.expiresAt = Date.now() + ttlMs;

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

const retailTokenCache: Record<string, { token: string; expiresAt: number }> = {};

/** Get a token for Retail API calls. Uses cloud.lightspeedapp.com per official Retail docs. */
export async function refreshLightspeedRetailToken(domainPrefix: string): Promise<string> {
  const key = (domainPrefix || "us").toLowerCase();
  const cached = retailTokenCache[key];
  if (cached?.token && cached.expiresAt > Date.now()) return cached.token;

  const clientId = normalizeText(process.env.LS_CLIENT_ID);
  const clientSecret = normalizeText(process.env.LS_CLIENT_SECRET);
  const refreshToken = normalizeText(process.env.LS_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Lightspeed credentials missing. Set LS_CLIENT_ID, LS_CLIENT_SECRET, and LS_REFRESH_TOKEN.");
  }

  const endpoint = "https://cloud.lightspeedapp.com/auth/oauth/token";
  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();

  const tokenResponse = await resilientFetch(
    endpoint,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: payload,
    },
    12_000
  );

  const tokenRawBody = await tokenResponse.text();
  let tokenBody: Record<string, unknown> = {};
  try {
    tokenBody = JSON.parse(tokenRawBody);
  } catch {
    /* fallback */
  }

  if (!tokenResponse.ok) {
    throw new Error(
      `Retail token failed: ${(tokenBody as { error?: string })?.error || tokenRawBody || tokenResponse.status}`
    );
  }

  const accessToken = normalizeText(tokenBody.access_token);
  if (!accessToken) throw new Error("Retail token response missing access_token");

  const expiresIn = Number.parseInt(normalizeText(tokenBody.expires_in), 10);
  const ttlMs = Number.isFinite(expiresIn) ? Math.max(30, expiresIn - 30) * 1000 : CACHE_FALLBACK_MS;
  retailTokenCache[key] = { token: accessToken, expiresAt: Date.now() + ttlMs };

  const newRefreshToken = normalizeText(tokenBody.refresh_token);
  if (newRefreshToken && newRefreshToken !== refreshToken) {
    process.env.LS_REFRESH_TOKEN = newRefreshToken;
  }

  return accessToken;
}

export function getAccountId(): string {
  const id = normalizeText(process.env.LS_ACCOUNT_ID);
  if (!id) throw new Error("LS_ACCOUNT_ID is missing.");
  return id;
}

function getApiBase(): string {
  return normalizeText(process.env.LS_API_BASE || "https://api.lightspeedapp.com").replace(/\/+$/, "");
}

export function buildResourceUrl(resource: string, query: Record<string, string | number> = {}): string {
  const base = getApiBase();
  const accountId = getAccountId();
  const prefix = /\/API$/i.test(base) ? base : `${base}/API`;
  const endpoint = `${prefix}/Account/${accountId}/${resource}.json`;
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(query)) {
    const str = normalizeText(value);
    if (str) url.searchParams.set(key, str);
  }
  return url.toString();
}

export async function lsGet<T = any>(resource: string, query: Record<string, string | number> = {}): Promise<T> {
  const accessToken = await refreshLightspeedAccessToken();
  const url = buildResourceUrl(resource, query);
  let lastError = `Lightspeed GET ${resource} failed.`;

  for (let attempt = 1; attempt <= LS_RATE_LIMIT_RETRY_ATTEMPTS; attempt++) {
    await waitForLightspeedRequestSlot();
    const response = await resilientFetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }, 20_000);
    const raw = await response.text();
    let body: any = {};
    try { body = JSON.parse(raw); } catch { body = { raw }; }

    if (response.ok) return body as T;

    const isRateLimited = response.status === 429 || /rate\s*limit/i.test(String(body?.message || ""));
    lastError = `Lightspeed GET ${resource}: ${body?.message || body?.error || raw}`;
    if (!isRateLimited || attempt >= LS_RATE_LIMIT_RETRY_ATTEMPTS) throw new Error(lastError);

    const retryAfter = Number.parseFloat(normalizeText(response.headers.get("retry-after")));
    await delay(Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1200 * attempt);
  }
  throw new Error(lastError);
}

export async function lsPost<T = any>(resource: string, body: unknown): Promise<T> {
  const accessToken = await refreshLightspeedAccessToken();
  const url = buildResourceUrl(resource);
  let lastError = `Lightspeed POST ${resource} failed.`;

  for (let attempt = 1; attempt <= LS_RATE_LIMIT_RETRY_ATTEMPTS; attempt++) {
    await waitForLightspeedRequestSlot();
    const response = await resilientFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, 20_000);
    const raw = await response.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    if (response.ok) return parsed as T;

    const isRateLimited = response.status === 429 || /rate\s*limit/i.test(String(parsed?.message || ""));
    lastError = `Lightspeed POST ${resource}: ${parsed?.message || parsed?.error || raw}`;
    if (!isRateLimited || attempt >= LS_RATE_LIMIT_RETRY_ATTEMPTS) throw new Error(lastError);

    const retryAfter = Number.parseFloat(normalizeText(response.headers.get("retry-after")));
    await delay(Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1200 * attempt);
  }
  throw new Error(lastError);
}

export async function lsPut<T = any>(resource: string, body: unknown): Promise<T> {
  const accessToken = await refreshLightspeedAccessToken();
  const url = buildResourceUrl(resource);
  let lastError = `Lightspeed PUT ${resource} failed.`;

  for (let attempt = 1; attempt <= LS_RATE_LIMIT_RETRY_ATTEMPTS; attempt++) {
    await waitForLightspeedRequestSlot();
    const response = await resilientFetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, 20_000);
    const raw = await response.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    if (response.ok) return parsed as T;

    const isRateLimited = response.status === 429 || /rate\s*limit/i.test(String(parsed?.message || ""));
    lastError = `Lightspeed PUT ${resource}: ${parsed?.message || parsed?.error || raw}`;
    if (!isRateLimited || attempt >= LS_RATE_LIMIT_RETRY_ATTEMPTS) throw new Error(lastError);

    const retryAfter = Number.parseFloat(normalizeText(response.headers.get("retry-after")));
    await delay(Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1200 * attempt);
  }
  throw new Error(lastError);
}

export async function lsPostMultipart<T = any>(
  resource: string,
  formData: FormData,
  timeoutMs = 60_000,
): Promise<T> {
  const accessToken = await refreshLightspeedAccessToken();
  const url = buildResourceUrl(resource);
  let lastError = `Lightspeed POST multipart ${resource} failed.`;

  for (let attempt = 1; attempt <= LS_RATE_LIMIT_RETRY_ATTEMPTS; attempt++) {
    await waitForLightspeedRequestSlot();
    const response = await resilientFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      body: formData,
    }, timeoutMs);
    const raw = await response.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    if (response.ok) return parsed as T;

    const isRateLimited = response.status === 429 || /rate\s*limit/i.test(String(parsed?.message || ""));
    lastError = `Lightspeed POST multipart ${resource}: ${parsed?.message || parsed?.error || raw}`;
    if (!isRateLimited || attempt >= LS_RATE_LIMIT_RETRY_ATTEMPTS) throw new Error(lastError);

    const retryAfter = Number.parseFloat(normalizeText(response.headers.get("retry-after")));
    await delay(Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1200 * attempt);
  }
  throw new Error(lastError);
}

export function buildV3ResourceUrl(resource: string, query: Record<string, string | number> = {}): string {
  const base = getApiBase();
  const accountId = getAccountId();
  const prefix = /\/API$/i.test(base) ? base : `${base}/API`;
  const endpoint = `${prefix}/V3/Account/${accountId}/${resource}.json`;
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(query)) {
    const str = normalizeText(value);
    if (str) url.searchParams.set(key, str);
  }
  return url.toString();
}

export async function lsPostMultipartV3<T = any>(
  resource: string,
  formData: FormData,
  timeoutMs = 60_000,
): Promise<T> {
  const accessToken = await refreshLightspeedAccessToken();
  const url = buildV3ResourceUrl(resource);
  let lastError = `Lightspeed POST multipart V3 ${resource} failed.`;

  for (let attempt = 1; attempt <= LS_RATE_LIMIT_RETRY_ATTEMPTS; attempt++) {
    await waitForLightspeedRequestSlot();
    const response = await resilientFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      body: formData,
    }, timeoutMs);
    const raw = await response.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    if (response.ok) return parsed as T;

    const isRateLimited = response.status === 429 || /rate\s*limit/i.test(String(parsed?.message || ""));
    lastError = `Lightspeed POST multipart V3 ${resource}: ${parsed?.message || parsed?.error || raw}`;
    if (!isRateLimited || attempt >= LS_RATE_LIMIT_RETRY_ATTEMPTS) throw new Error(lastError);

    const retryAfter = Number.parseFloat(normalizeText(response.headers.get("retry-after")));
    await delay(Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1200 * attempt);
  }
  throw new Error(lastError);
}

export async function lsDelete(resource: string): Promise<void> {
  const accessToken = await refreshLightspeedAccessToken();
  const url = buildResourceUrl(resource);
  let lastError = `Lightspeed DELETE ${resource} failed.`;

  for (let attempt = 1; attempt <= LS_RATE_LIMIT_RETRY_ATTEMPTS; attempt++) {
    await waitForLightspeedRequestSlot();
    const response = await resilientFetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    }, 20_000);

    if (response.ok || response.status === 204) return;

    const raw = await response.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

    const isRateLimited = response.status === 429 || /rate\s*limit/i.test(String(parsed?.message || ""));
    lastError = `Lightspeed DELETE ${resource}: ${parsed?.message || parsed?.error || raw}`;
    if (!isRateLimited || attempt >= LS_RATE_LIMIT_RETRY_ATTEMPTS) throw new Error(lastError);

    const retryAfter = Number.parseFloat(normalizeText(response.headers.get("retry-after")));
    await delay(Number.isFinite(retryAfter) ? Math.max(1000, retryAfter * 1000) : 1200 * attempt);
  }
  throw new Error(lastError);
}
