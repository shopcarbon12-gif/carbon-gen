import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { normalizeShopDomain } from "@/lib/shopify";
import { upsertShopifyToken } from "@/lib/shopifyTokenRepository";

function verifyHmac(rawSearch: string, secret: string) {
  const search = String(rawSearch || "").replace(/^\?/, "");
  const params = new URLSearchParams(search);
  const hmac = (params.get("hmac") || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hmac)) return false;

  const entries = search
    .split("&")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .filter((pair) => {
      const key = pair.split("=")[0] || "";
      return key !== "hmac" && key !== "signature";
    })
    .sort()
    .join("&");
  const digest = createHmac("sha256", secret).update(entries).digest("hex");
  return timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
}

function resolveSettingsOrigin(req: NextRequest) {
  const redirectUri = (process.env.SHOPIFY_REDIRECT_URI || "").trim();
  if (redirectUri) {
    try {
      const origin = new URL(redirectUri).origin;
      if (/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return origin.replace(/^https:/i, "http:");
      }
      return origin;
    } catch {
      // fall through
    }
  }
  const incoming = req.nextUrl.origin;
  if (/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(incoming)) {
    return incoming.replace(/^https:/i, "http:");
  }
  return incoming;
}

function redirectToSettings(req: NextRequest, opts: { shop?: string | null; connected?: boolean; error?: string }) {
  const target = new URL("/settings", resolveSettingsOrigin(req));
  if (opts.shop) target.searchParams.set("shop", opts.shop);
  if (opts.connected) target.searchParams.set("connected", "1");
  if (opts.error) target.searchParams.set("shopify_error", opts.error.slice(0, 200));
  const res = NextResponse.redirect(target.toString());
  res.cookies.set("shopify_oauth_state", "", {
    maxAge: 0,
    sameSite: "none",
    secure: true,
    path: "/",
  });
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { searchParams } = url;

    const shop = normalizeShopDomain(searchParams.get("shop") || "");
    const code = (searchParams.get("code") || "").trim();
    const state = (searchParams.get("state") || "").trim();

    const clientId = (process.env.SHOPIFY_APP_CLIENT_ID || "").trim();
    const clientSecret = (process.env.SHOPIFY_APP_CLIENT_SECRET || "").trim();
    const redirectUri = (process.env.SHOPIFY_REDIRECT_URI || "").trim();

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectToSettings(req, { shop, error: "Missing Shopify app config." });
    }
    if (!shop) {
      return redirectToSettings(req, { error: "Invalid OAuth shop." });
    }
    if (!code) {
      return redirectToSettings(req, { shop, error: "Missing OAuth code." });
    }

    const cookieState = req.cookies.get("shopify_oauth_state")?.value || "";
    if (!state) {
      return redirectToSettings(req, { shop, error: "Missing OAuth state." });
    }
    // If state cookie exists, enforce exact match; if cookie is absent, rely on HMAC verification.
    if (cookieState && cookieState !== state) {
      return redirectToSettings(req, { shop, error: "Invalid OAuth state." });
    }

    if (!verifyHmac(url.search, clientSecret)) {
      return redirectToSettings(req, { shop, error: "Invalid OAuth HMAC." });
    }

    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenText = await tokenResp.text();
    let tokenJson: any = null;
    try {
      tokenJson = tokenText ? JSON.parse(tokenText) : null;
    } catch {
      tokenJson = null;
    }

    if (!tokenResp.ok || !tokenJson?.access_token) {
      const contentType = tokenResp.headers.get("content-type") || "";
      const shopifyFailureReason =
        tokenResp.headers.get("x-shopify-api-request-failure-reason") || "";
      const jsonError =
        tokenJson?.error_description || tokenJson?.error || tokenJson?.errors || null;
      const htmlSnippet = !tokenJson ? tokenText.slice(0, 160) : null;
      const detailText = String(jsonError || shopifyFailureReason || contentType || htmlSnippet || "Token exchange failed");
      return redirectToSettings(req, { shop, error: `Shopify token exchange failed: ${detailText}` });
    }

    await upsertShopifyToken({
      shop,
      accessToken: tokenJson.access_token,
      scope: tokenJson.scope || null,
      installedAt: new Date().toISOString(),
    });

    return redirectToSettings(req, { shop, connected: true });
  } catch (e: any) {
    return redirectToSettings(req, { error: e?.message || "Shopify callback failed." });
  }
}
