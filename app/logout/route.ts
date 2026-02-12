import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL("/api/logout", req.url);
  return NextResponse.redirect(url, 307);
}
