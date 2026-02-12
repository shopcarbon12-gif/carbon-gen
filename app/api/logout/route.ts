import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function clearCookies(res: NextResponse) {
  res.cookies.set({
    name: "carbon_gen_auth_v1",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  res.cookies.set({
    name: "carbon_gen_user_id",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function wantsHtml(req: NextRequest) {
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

function redirectToLogin() {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: "/login" },
  });
}

function buildLogoutResponse(req: NextRequest) {
  if (wantsHtml(req)) {
    const res = redirectToLogin();
    clearCookies(res);
    return res;
  }
  const res = NextResponse.json({ success: true });
  clearCookies(res);
  return res;
}

export async function GET(req: NextRequest) {
  return buildLogoutResponse(req);
}

export async function POST(req: NextRequest) {
  return buildLogoutResponse(req);
}

export async function HEAD(req: NextRequest) {
  return buildLogoutResponse(req);
}
