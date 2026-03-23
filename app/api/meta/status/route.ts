import { NextResponse } from "next/server";

/**
 * Lightweight status for Instagram / Meta Graph integration (Phase 2).
 * Returns offline until META_APP_ID + token flow exists.
 */
export async function GET() {
  const appId = String(process.env.META_APP_ID || "").trim();
  const configured = Boolean(appId);
  return NextResponse.json({
    ok: true,
    configured,
    label: configured ? "Not connected" : "Not configured",
    status: "offline" as const,
  });
}
