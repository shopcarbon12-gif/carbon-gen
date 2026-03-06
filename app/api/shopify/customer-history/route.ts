import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCustomerLsHistory } from "@/lib/lightspeedRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

const ALLOWED_ORIGINS = [
  "https://shopcarbon.com",
  "https://www.shopcarbon.com",
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o));
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  const empty = { sales: [], synced_at: null };

  const email = normalizeText(req.nextUrl.searchParams.get("email")).toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Missing or invalid email" }, { status: 400, headers });
  }

  try {
    const data = await getCustomerLsHistory(email);
    if (!data || !Array.isArray(data.salesJson)) {
      return NextResponse.json(empty, { headers });
    }

    return NextResponse.json({
      sales: data.salesJson || [],
      synced_at: data.syncedAt,
    }, { headers });
  } catch (err: any) {
    console.warn("[customer-history] Caught error:", err?.message || err);
    return NextResponse.json(empty, { headers });
  }
}
