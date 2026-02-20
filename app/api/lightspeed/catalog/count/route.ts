import { NextResponse } from "next/server";
import { ensureLightspeedEnvLoaded } from "@/lib/loadLightspeedEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LS_TOKEN_URL = "https://cloud.merchantos.com/oauth/access_token.php";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function getRSeriesResourceEndpoint(resource: string) {
  const accountId = normalizeText(process.env.LS_ACCOUNT_ID);
  if (!accountId) {
    throw new Error("LS_ACCOUNT_ID is missing.");
  }
  const base = normalizeText(process.env.LS_API_BASE || "https://api.lightspeedapp.com").replace(
    /\/+$/,
    ""
  );
  return `${base}/API/Account/${accountId}/${resource}.json`;
}

async function refreshToken(): Promise<string> {
  const clientId = normalizeText(process.env.LS_CLIENT_ID);
  const clientSecret = normalizeText(process.env.LS_CLIENT_SECRET);
  const refreshToken = normalizeText(process.env.LS_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("LS credentials missing.");
  }
  const endpoint = DEFAULT_LS_TOKEN_URL;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  const token = normalizeText(body?.access_token);
  if (!token) throw new Error("Token refresh failed.");
  return token;
}

export async function GET() {
  ensureLightspeedEnvLoaded();
  try {
    const accessToken = await refreshToken();
    const url = getRSeriesResourceEndpoint("Item");
    const fullUrl = `${url}?limit=1&offset=0&archived=false`;
    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text();
    const parsed = JSON.parse(raw || "{}") as { "@attributes"?: { count?: string }; Item?: unknown };
    const count = parseInt(parsed?.["@attributes"]?.count ?? "", 10);
    const items = Array.isArray(parsed?.Item)
      ? parsed.Item
      : parsed?.Item
        ? [parsed.Item]
        : [];
    return NextResponse.json({
      ok: true,
      itemCount: Number.isFinite(count) ? count : items.length,
      source: "Item",
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message, itemCount: null },
      { status: 500 }
    );
  }
}
