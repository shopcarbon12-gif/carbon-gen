import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";
import { runCartPushAll } from "@/lib/cartInventoryPush";
import { loadSyncToggles } from "@/lib/shopifyCartConfig";

export const runtime = "nodejs";
export const maxDuration = 800;

function isAuthorized(req: NextRequest) {
  if (isRequestAuthed(req)) return true;
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = (req.headers.get("authorization") || "").trim();
  if (auth === `Bearer ${secret}`) return true;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") === secret) return true;
  } catch {
    /* req.url may be relative in some runtimes */
  }
  return false;
}

async function getShopForSync(): Promise<string> {
  const envShop = normalizeShopDomain(
    (process.env.SHOPIFY_SHOP_DOMAIN || "").trim()
  );
  if (envShop) return envShop;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("shopify_tokens")
      .select("shop")
      .order("installed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      const shop = (data as { shop?: string })?.shop;
      if (shop) return normalizeShopDomain(shop) || shop;
    }
  } catch {
    // fallback
  }
  return "";
}

/**
 * Automatic Cart Inventory → Shopify sync. Run via cron every 15–30 min.
 * Push all staged Cart Inventory items to Shopify; optionally sync LS later.
 * Call: GET/POST /api/cron/cart-sync with Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const shop = await getShopForSync();
    if (!shop) {
      return NextResponse.json(
        { ok: false, error: "No Shopify shop configured. Set SHOPIFY_SHOP_DOMAIN or connect a shop." },
        { status: 400 }
      );
    }

    const syncToggles = await loadSyncToggles(shop);
    if (!syncToggles.shopifySyncEnabled) {
      return NextResponse.json({
        ok: true,
        shop,
        skipped: true,
        message: "Shopify sync is disabled for this module. Skipped automatic sync.",
        timestamp: new Date().toISOString(),
      });
    }
    if (!syncToggles.shopifyAutoSyncEnabled) {
      return NextResponse.json({
        ok: true,
        shop,
        skipped: true,
        message: "15-min auto sync is paused. Manual push/remove still work.",
        timestamp: new Date().toISOString(),
      });
    }

    const notificationEmail =
      (process.env.PUSH_NOTIFICATION_EMAIL || "").trim() || null;

    const result = await runCartPushAll(shop, {
      notificationEmail,
    });

    if (!result.ok) {
      const errMsg = result.error || "Cart sync failed";
      console.error("[cart-sync] Cart inventory failed:", errMsg);
      return NextResponse.json(
        { ok: false, error: errMsg, detail: result.debug },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      shop,
      pushed: result.pushed ?? 0,
      totalVariants: result.totalVariants ?? 0,
      markedProcessed: result.markedProcessed ?? 0,
      removedFromShopify: result.removedFromShopify ?? 0,
      productsCreated: result.productsCreated ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const err = e as Error & { cause?: unknown };
    const msg = err?.message || "Cart sync failed";
    console.error("[cart-sync] Error:", msg, err);
    return NextResponse.json(
      { ok: false, error: msg, detail: String(err?.cause ?? "") },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
