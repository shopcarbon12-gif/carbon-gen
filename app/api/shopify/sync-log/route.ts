import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed, isCronAuthed } from "@/lib/auth";
import { sqlQuery, ensureSqlReady } from "@/lib/sqlDb";
import { resolveShop } from "@/lib/shopifyCartConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req) && !isCronAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const shop = resolveShop(url.searchParams.get("shop"));
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);

    await ensureSqlReady();
    const data = await sqlQuery(
      `SELECT * FROM shopify_cart_sync_activity
       WHERE shop = $1
       ORDER BY synced_at DESC
       LIMIT $2`,
      [shop, limit]
    );

    return NextResponse.json({
      ok: true,
      shop,
      entries: data || [],
    });
  } catch (e: unknown) {
    const msg = (e as Error)?.message || "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ ok: true, entries: [], message: "Sync activity table not yet created." });
    }
    return NextResponse.json(
      { error: msg || "Failed to fetch sync log" },
      { status: 500 }
    );
  }
}
