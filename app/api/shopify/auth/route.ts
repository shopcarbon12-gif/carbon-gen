import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getShopifyAdminToken } from "@/lib/shopify";
import { upsertShopifyToken } from "@/lib/shopifyTokenRepository";

function isValidShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

function resolveSafeDashboardOrigin(req: NextRequest) {
  const incoming = req.nextUrl.origin;
  const isHttpsLocalhost = /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(incoming);
  if (!isHttpsLocalhost) return incoming;

  const redirectUri = (process.env.SHOPIFY_REDIRECT_URI || "").trim();
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      // fallback below
    }
  }

  // Last-resort local fallback if env is missing/malformed.
  return incoming.replace(/^https:/i, "http:");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shop = (searchParams.get("shop") || "").trim().toLowerCase();

  if (!shop || !isValidShop(shop)) {
    return NextResponse.json({ error: "Invalid shop." }, { status: 400 });
  }

  const clientId = (process.env.SHOPIFY_APP_CLIENT_ID || "").trim();
  const scopes =
    (process.env.SHOPIFY_SCOPES || "").trim() ||
    "read_products,write_products,write_files,read_locations,write_inventory,read_orders,read_customers,read_publications,write_publications";
  const redirectUri = (process.env.SHOPIFY_REDIRECT_URI || "").trim();
  const hasOauthConfig = Boolean(clientId && redirectUri);

  // Prefer OAuth when app credentials are configured.
  // Only auto-use static token mode when OAuth config is missing.
  const directToken = getShopifyAdminToken(shop);
  if (directToken && !hasOauthConfig) {
    await upsertShopifyToken({
      shop,
      accessToken: directToken,
      scope: scopes || null,
      installedAt: new Date().toISOString(),
    });

    const safeOrigin = resolveSafeDashboardOrigin(req);
    const redirectTarget = new URL(`/settings?shop=${encodeURIComponent(shop)}&connected=1`, safeOrigin);
    return NextResponse.redirect(redirectTarget.toString());
  }

  if (!hasOauthConfig) {
    return NextResponse.json({ error: "Missing Shopify app config." }, { status: 500 });
  }

  const state = crypto.randomUUID().replace(/-/g, "");
  const installUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  installUrl.searchParams.set("client_id", clientId);
  installUrl.searchParams.set("scope", scopes);
  installUrl.searchParams.set("redirect_uri", redirectUri);
  installUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(installUrl.toString());
  // Must be SameSite=None for Shopify admin/embedded flows; requires Secure.
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
  });
  return res;
}
