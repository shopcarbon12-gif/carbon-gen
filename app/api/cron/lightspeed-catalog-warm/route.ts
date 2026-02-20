import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

function isAuthorized(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

/**
 * Warms the Lightspeed catalog cache so the inventory page loads fast without manual pull.
 * Call this via cron (e.g. every 15–30 min). Uses same CRON_SECRET as /api/cron/cleanup.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const base = req.nextUrl.origin;
    const params = new URLSearchParams({
      all: "1",
      pageSize: "20000",
      sortField: "customSku",
      sortDir: "asc",
      shops: "all",
      includeNoStock: "1",
      refresh: "1",
    });
    const response = await fetch(`${base}/api/lightspeed/catalog?${params.toString()}`, {
      cache: "no-store",
    });
    const json = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      total?: number;
      rows?: unknown[];
    };

    if (!response.ok || !json.ok) {
      return NextResponse.json(
        { ok: false, error: json?.error || "Catalog warm failed", status: response.status },
        { status: response.status >= 400 ? response.status : 500 }
      );
    }

    const total = typeof json.total === "number" ? json.total : (json.rows?.length ?? 0);
    return NextResponse.json({
      ok: true,
      warmed: true,
      total,
      timestamp: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || "Catalog warm failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
