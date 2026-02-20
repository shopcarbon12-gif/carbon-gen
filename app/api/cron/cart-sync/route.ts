import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

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

    const notificationEmail =
      (process.env.PUSH_NOTIFICATION_EMAIL || "").trim() || null;
    const vercelUrl = (process.env.VERCEL_URL || "").trim().replace(/^https?:\/\//, "") || "";
    const origin =
      req.nextUrl?.origin || (vercelUrl ? `https://${vercelUrl}` : "");
    if (!origin) {
      return NextResponse.json(
        { ok: false, error: "Could not resolve API origin (missing VERCEL_URL)." },
        { status: 500 }
      );
    }
    const secret = (process.env.CRON_SECRET || "").trim();
    const cartInventoryUrl = `${origin}/api/shopify/cart-inventory?secret=${encodeURIComponent(secret)}`;
    const resp = await fetch(cartInventoryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        action: "push-all",
        shop,
        ...(notificationEmail ? { notificationEmail } : {}),
      }),
      signal: AbortSignal.timeout(780_000),
    });

    const json = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      pushed?: number;
      totalVariants?: number;
      markedProcessed?: number;
      removedFromShopify?: number;
      debug?: unknown;
    };

    if (!resp.ok || json.ok === false) {
      const errMsg = json?.error || "Cart sync failed";
      console.error("[cart-sync] Cart inventory failed:", resp.status, errMsg);
      return NextResponse.json(
        { ok: false, error: errMsg, status: resp.status, detail: json.debug },
        { status: resp.status >= 400 && resp.status < 600 ? resp.status : 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      shop,
      pushed: json.pushed ?? 0,
      totalVariants: json.totalVariants ?? 0,
      markedProcessed: json.markedProcessed ?? 0,
      removedFromShopify: json.removedFromShopify ?? 0,
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
