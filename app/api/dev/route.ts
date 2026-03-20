import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isLocalRequest(request: Request) {
  const forwardedHost = (request.headers.get("x-forwarded-host") || "").toLowerCase();
  const host = (request.headers.get("host") || "").toLowerCase();
  const candidate = forwardedHost || host;
  return (
    candidate.includes("localhost") ||
    candidate.includes("127.0.0.1") ||
    candidate.includes("[::1]")
  );
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (!isLocalRequest(request)) {
    return NextResponse.json({ ok: false, error: "Localhost only" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "carbon_gen_auth_v1",
    value: "true",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 60 * 60 * 12,
  });
  return res;
}

