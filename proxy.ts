import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
  const protectedRoutes = [
    "/dashboard",
    "/generate",
    "/studio",
    "/vault",
    "/shopify",
    "/seo",
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
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/generate/:path*",
    "/studio/:path*",
    "/vault/:path*",
    "/shopify/:path*",
    "/seo/:path*",
    "/activity/:path*",
    "/settings/:path*",
    "/login",
  ],
};
