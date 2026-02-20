import { NextResponse } from "next/server";
import { ensureLightspeedEnvLoaded } from "@/lib/loadLightspeedEnv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Debug endpoint: lists which LS_* env vars are defined (names only).
 * Calls ensureLightspeedEnvLoaded first to try loading from .env.local.
 */
export async function GET() {
  ensureLightspeedEnvLoaded();
  const keys = Object.keys(process.env)
    .filter((k) => k.startsWith("LS_"))
    .sort();
  const present: Record<string, boolean> = {};
  for (const k of keys) {
    const val = process.env[k];
    present[k] = Boolean(val && String(val).trim().length > 0);
  }
  return NextResponse.json({
    lsKeysFound: keys,
    lsKeysWithValue: present,
    hasClientId: present.LS_CLIENT_ID,
    hasClientSecret: present.LS_CLIENT_SECRET,
    hasRefreshToken: present.LS_REFRESH_TOKEN,
  });
}
