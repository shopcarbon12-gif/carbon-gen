import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolvePublicAppOrigin } from "@/lib/resolvePublicAppOrigin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL("/api/logout", resolvePublicAppOrigin(req));
  return NextResponse.redirect(url, 307);
}
