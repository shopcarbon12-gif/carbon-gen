import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { META_REVIEW_ROLE, SUPER_ADMIN_ROLE, parseRole } from "@/lib/authRoleConstants";

const AUTH_BYPASS_PAUSED_COOKIE = "carbon_gen_auth_bypass_paused";

const META_REVIEW_STATIC_ASSET =
  /\.(?:ico|png|jpe?g|gif|webp|svg|css|js|map|txt|xml|json|woff2?|ttf|eot|wasm)$/i;

const META_REVIEW_ALLOWED_API_PREFIXES = [
  "/api/login",
  "/api/logout",
  "/api/auth/session",
  "/api/studio/instagram-feed",
  "/api/storefront/instagram-section",
  "/api/instagram/meta/callback",
];

function isMetaReviewAllowedApi(pathname: string) {
  return META_REVIEW_ALLOWED_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

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

  if (META_REVIEW_STATIC_ASSET.test(pathname)) {
    return NextResponse.next();
  }

  // Public storefront widget script: every shopper loads it cross-site via <script>,
  // and none are logged into the admin app. It must bypass auth (the /accessibility
  // admin pages stay protected). Without this it 307-redirects to /login under the
  // "/accessibility" protected base and the widget never loads on the storefront.
  if (pathname === "/accessibility/widget") {
    return NextResponse.next();
  }

  // Public storefront Instagram widget script: loaded cross-site via <script>
  // by every shopper, none of whom have a Carbon session — same reasoning as
  // the accessibility widget above.
  if (pathname === "/instagram/widget") {
    return NextResponse.next();
  }

  // Public storefront Instagram feed: shopcarbon.com fetches it cross-origin
  // with no Carbon session, exactly like the widget script above. Without this
  // bypass the /api/ gate further down answers 401 and the homepage feed stays
  // empty. The route returns only post images and permalinks — never the token.
  if (pathname === "/api/public/instagram-feed") {
    return NextResponse.next();
  }

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
  const isProd = process.env.NODE_ENV === "production";
  const authBypass =
    !isProd && (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true";
  const bypassPaused = req.cookies.get(AUTH_BYPASS_PAUSED_COOKIE)?.value === "true";

  if (authBypass && !bypassPaused) {
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
      value: SUPER_ADMIN_ROLE,
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
      studioUrl.pathname = "/dashboard";
      return NextResponse.redirect(studioUrl);
    }
    return res;
  }

  const sessionRole = parseRole(req.cookies.get("carbon_gen_user_role")?.value || "");
  const isAuthedCookie = req.cookies.get("carbon_gen_auth_v1")?.value === "true";

  if (sessionRole === META_REVIEW_ROLE) {
    if (!isAuthedCookie) {
      if (pathname === "/login" || pathname.startsWith("/api/login")) {
        return NextResponse.next();
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }

    if (pathname.startsWith("/api/")) {
      if (isMetaReviewAllowedApi(pathname)) {
        return NextResponse.next();
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (pathname === "/logout") {
      return NextResponse.next();
    }

    if (pathname === "/login") {
      const u = req.nextUrl.clone();
      u.pathname = "/studio/instagram-widget";
      return NextResponse.redirect(u);
    }

    const igRoot = "/studio/instagram-widget";
    if (pathname === igRoot || pathname.startsWith(`${igRoot}/`)) {
      return NextResponse.next();
    }

    const redirectIg = req.nextUrl.clone();
    redirectIg.pathname = igRoot;
    return NextResponse.redirect(redirectIg);
  }

  const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
  function pathMatchesProtectedBase(pathname: string, base: string) {
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  const protectedBasePaths = [
    "/dashboard",
    "/generate",
    "/studio",
    "/vault",
    "/shopify",
    "/seo",
    "/ops",
    "/activity",
    "/settings",
    "/accessibility-statement",
    "/accessibility",
    "/image-upload",
    "/barcode-scan",
    "/preview",
    publicCollectionMappingPath,
  ];
  const isProtected =
    pathname === "/" ||
    protectedBasePaths.some((base) => pathMatchesProtectedBase(pathname, base));

  if (isProtected && !isAuthed) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && isAuthed) {
    const studioUrl = req.nextUrl.clone();
    studioUrl.pathname = parseRole(req.cookies.get("carbon_gen_user_role")?.value || "") === META_REVIEW_ROLE
      ? "/studio/instagram-widget"
      : "/dashboard";
    return NextResponse.redirect(studioUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/logout",
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
    "/accessibility",
    "/accessibility/:path*",
    "/accessibility-statement",
    "/accessibility-statement/:path*",
    "/image-upload/:path*",
    "/barcode-scan/:path*",
    "/preview/:path*",
  ],
};
