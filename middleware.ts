import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const loginPreview = req.nextUrl.searchParams.get("preview") === "1";
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

  if (isProtected && !isAuthed) {
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
