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
    label: configured
      ? "App ID configured (token flow not wired yet)"
      : "META_APP_ID not set in environment",
    status: "offline" as const,
  });
}
