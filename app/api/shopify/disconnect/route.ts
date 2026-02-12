import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";

export async function POST(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const shop = normalizeShopDomain(String(body?.shop || ""));
    if (!shop) {
      return NextResponse.json(
        { error: "Missing or invalid shop domain." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("shopify_tokens").delete().eq("shop", shop);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const envTokenStillConfigured = Boolean(getShopifyAdminToken(shop));

    return NextResponse.json({
      ok: true,
      shop,
      disconnected: true,
      stillConnectedViaEnvToken: envTokenStillConfigured,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to disconnect Shopify store." },
      { status: 500 }
    );
  }
}
