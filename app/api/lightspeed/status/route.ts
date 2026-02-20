import { NextResponse } from "next/server";
import { ensureLightspeedEnvLoaded } from "@/lib/loadLightspeedEnv";

type ProbeResult = {
  attempted: boolean;
  success: boolean;
  endpoint: string | null;
  message: string;
};

const DEFAULT_LS_TOKEN_URL = "https://cloud.merchantos.com/oauth/access_token.php";
const PROBE_TIMEOUT_MS = 10_000;
const CACHE_MS = 60_000;

let statusCache:
  | {
      expiresAt: number;
      payload: Record<string, unknown>;
    }
  | null = null;

function parseTokenResponseBody(rawText: string) {
  const text = String(rawText || "").trim();
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
  const configuredRaw = (process.env.LS_OAUTH_TOKEN_URL || DEFAULT_LS_TOKEN_URL).trim();
  const resolvedConfigured = configuredRaw.replaceAll("<<domain_prefix>>", domainPrefix || "");
  const needsDomainPrefix = configuredRaw.includes("<<domain_prefix>>");
  const candidates: string[] = [];

  if (!needsDomainPrefix || domainPrefix) {
    candidates.push(resolvedConfigured);
  }

  if (domainPrefix) {
    candidates.push(`https://${domainPrefix}.retail.lightspeed.app/api/1.0/token`);
  }

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
    if (!candidates.includes(endpoint)) {
      candidates.push(endpoint);
    }
  }

  return [...new Set(candidates)].filter(Boolean);
}

async function probeLightspeedToken() {
  const clientId = String(process.env.LS_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.LS_CLIENT_SECRET || "").trim();
  const refreshToken = String(process.env.LS_REFRESH_TOKEN || "").trim();
  const domainPrefix = String(process.env.LS_DOMAIN_PREFIX || "").trim().toLowerCase();

  const credentialsReady = Boolean(clientId && clientSecret && refreshToken);
  if (!credentialsReady) {
    const missing: string[] = [];
    if (!clientId) missing.push("LS_CLIENT_ID");
    if (!clientSecret) missing.push("LS_CLIENT_SECRET");
    if (!refreshToken) missing.push("LS_REFRESH_TOKEN");
    return {
      credentialsReady,
      connected: false,
      probe: {
        attempted: false,
        success: false,
        endpoint: null,
        message: `Missing credentials: ${missing.join(", ")}`,
      } satisfies ProbeResult,
    };
  }

  const payload = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString();

  const endpoints = getTokenEndpointCandidates(domainPrefix);
  let lastMessage = "Token probe failed.";
  let lastEndpoint: string | null = null;

  for (const endpoint of endpoints) {
    lastEndpoint = endpoint;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload,
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });

      const rawBody = await response.text();
      const body = parseTokenResponseBody(rawBody);
      const accessToken = String(body?.access_token || "").trim();

      if (response.ok && accessToken) {
        return {
          credentialsReady,
          connected: true,
          probe: {
            attempted: true,
            success: true,
            endpoint,
            message: "Token refresh successful.",
          } satisfies ProbeResult,
        };
      }

      const detail = typeof body === "object" ? JSON.stringify(body) : String(body);
      lastMessage = `Token refresh rejected at ${endpoint}: ${detail.slice(0, 280)}`;
    } catch (e: any) {
      lastMessage = `Token refresh failed at ${endpoint}: ${String(e?.message || e)}`;
    }
  }

  return {
    credentialsReady,
    connected: false,
    probe: {
      attempted: true,
      success: false,
      endpoint: lastEndpoint,
      message: lastMessage,
    } satisfies ProbeResult,
  };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  ensureLightspeedEnvLoaded();
  const now = Date.now();
  const url = new URL(req.url);
  const forceRefresh = /^(1|true|yes)$/i.test(String(url.searchParams.get("refresh") || "").trim());
  if (!forceRefresh && statusCache && statusCache.expiresAt > now) {
    return NextResponse.json(statusCache.payload);
  }

  const clientIdSet = Boolean(String(process.env.LS_CLIENT_ID || "").trim());
  const clientSecretSet = Boolean(String(process.env.LS_CLIENT_SECRET || "").trim());
  const refreshTokenSet = Boolean(String(process.env.LS_REFRESH_TOKEN || "").trim());
  const domainPrefix = String(process.env.LS_DOMAIN_PREFIX || "").trim();
  const accountId = String(process.env.LS_ACCOUNT_ID || "").trim();
  const redirectUri = String(process.env.LS_REDIRECT_URI || "").trim();
  const apiBase = String(process.env.LS_API_BASE || "").trim();

  const probeResult = await probeLightspeedToken();
  const connected = Boolean(probeResult.connected);
  const payload = {
    ok: connected,
    connected,
    label: connected ? "Active" : "Offline",
    clientIdSet,
    clientSecretSet,
    refreshTokenSet,
    domainPrefix,
    accountId,
    redirectUri,
    apiBase,
    credentialsReady: probeResult.credentialsReady,
    probe: probeResult.probe,
    checkedAt: new Date().toISOString(),
  };

  statusCache = {
    expiresAt: now + CACHE_MS,
    payload,
  };

  return NextResponse.json(payload);
}

