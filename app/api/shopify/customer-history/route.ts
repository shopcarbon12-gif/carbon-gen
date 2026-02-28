import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("customer_ls_history")
      .select("sales_json, synced_at")
      .eq("shopify_email", email)
      .maybeSingle();

    if (error || !data) {
      if (error) console.warn("[customer-history] Supabase error (table may not exist yet):", error.message);
      return NextResponse.json(empty, { headers });
    }

    return NextResponse.json({
      sales: data.sales_json || [],
      synced_at: data.synced_at,
    }, { headers });
  } catch (err: any) {
    console.warn("[customer-history] Caught error:", err?.message || err);
    return NextResponse.json(empty, { headers });
  }
}
