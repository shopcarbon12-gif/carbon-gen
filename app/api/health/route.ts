import { NextResponse } from "next/server";

/**
 * Liveness probe for reverse proxies (Coolify / Traefik). No DB or external calls.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
