import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isTruthy(value: unknown): boolean {
  const v = normalize(value);
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isCoolifyRuntime(): boolean {
  return Boolean(
    normalize(process.env.COOLIFY_FQDN) ||
      normalize(process.env.COOLIFY_URL) ||
      normalize(process.env.COOLIFY_APP_ID) ||
      normalize(process.env.COOLIFY_BRANCH)
  );
}

function shouldBlockShopifyLiveUpdates(): boolean {
  if (!isCoolifyRuntime()) return false;
  return !isTruthy(process.env.SHOPIFY_LIVE_UPDATES_ON_COOLIFY);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();
  const legacyCollectionMappingPath = "/studio/shopify-collection-mapping";
  const publicCollectionMappingPath = "/shopify-collection-mapping";

  if (pathname === legacyCollectionMappingPath || pathname.startsWith(`${legacyCollectionMappingPath}/`)) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = pathname.replace(legacyCollectionMappingPath, publicCollectionMappingPath);
    return NextResponse.redirect(redirectUrl, { status: 308 });
  }

  if (shouldBlockShopifyLiveUpdates()) {
    const isWebhookIngress = pathname.startsWith("/api/shopify/webhooks/");
    const isCronSync = pathname === "/api/cron/cart-sync";
    const isShopifyMutation = pathname.startsWith("/api/shopify/") && method !== "GET";
    if (isWebhookIngress || isCronSync || isShopifyMutation) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          reason: "shopify_live_updates_disabled_on_coolify",
          message:
            "Shopify live updates are disabled on Coolify. Use localhost for development. Re-enable by setting SHOPIFY_LIVE_UPDATES_ON_COOLIFY=true when ready.",
        },
        { status: 503 }
      );
    }
  }

  const loginPreview = req.nextUrl.searchParams.get("preview") === "1";
  const isPublicCollectionMappingPath =
    pathname === publicCollectionMappingPath || pathname.startsWith(`${publicCollectionMappingPath}/`);
  const isProd = process.env.NODE_ENV === "production";
  const authBypass =
    !isProd && (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true";

  if (authBypass) {
    const res = NextResponse.next();
    res.cookies.set({
      name: "carbon_gen_auth_v1",
      value: "true",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    res.cookies.set({
      name: "carbon_gen_user_role",
      value: req.cookies.get("carbon_gen_user_role")?.value || "admin",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    if (!req.cookies.get("carbon_gen_username")?.value) {
      res.cookies.set({
        name: "carbon_gen_username",
        value: "guest",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
    if (!req.cookies.get("carbon_gen_user_id")?.value) {
      res.cookies.set({
        name: "carbon_gen_user_id",
        value: "00000000-0000-0000-0000-000000000001",
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
    }
    if (pathname === "/login" && !loginPreview) {
      const studioUrl = req.nextUrl.clone();
      studioUrl.pathname = "/studio/images";
      return NextResponse.redirect(studioUrl);
    }
    return res;
  }

  const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
  const protectedRoutes = [
    "/dashboard",
    "/generate",
    "/studio",
    "/vault",
    "/shopify",
    "/seo",
    "/ops",
    "/activity",
    "/settings",
  ];
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected && !isAuthed && !isPublicCollectionMappingPath) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && isAuthed) {
    const studioUrl = req.nextUrl.clone();
    studioUrl.pathname = "/studio/images";
    return NextResponse.redirect(studioUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/shopify-collection-mapping",
    "/shopify-collection-mapping/:path*",
    "/dashboard/:path*",
    "/generate/:path*",
    "/studio/:path*",
    "/vault/:path*",
    "/shopify/:path*",
    "/seo/:path*",
    "/ops/:path*",
    "/activity/:path*",
    "/settings/:path*",
    "/login",
  ],
};
