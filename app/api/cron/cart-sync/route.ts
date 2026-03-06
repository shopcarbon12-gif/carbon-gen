import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { normalizeShopDomain } from "@/lib/shopify";
import { runCartPushAll } from "@/lib/cartInventoryPush";
import { runDeltaSync } from "@/lib/cartInventoryDeltaSync";
import { loadSyncToggles } from "@/lib/shopifyCartConfig";
import { getMostRecentInstalledShop } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    return await getMostRecentInstalledShop();
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
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";

    if (!syncToggles.shopifyAutoSyncEnabled && !force) {
      return NextResponse.json({
        ok: true,
        shop,
        skipped: true,
        message: "Auto sync is paused. Manual push/remove still work.",
        timestamp: new Date().toISOString(),
      });
    }

    // Use delta sync (only changed items) instead of full push
    const mode = url.searchParams.get("mode") || "delta";

    if (mode === "full") {
      // Auto sync must not send push-completion emails.
      // Email notifications are manual-push only.
      const result = await runCartPushAll(shop, { notificationEmail: null });
      if (!result.ok) {
        console.error("[cart-sync] Full push failed:", result.error);
        return NextResponse.json(
          { ok: false, error: result.error || "Cart sync failed", detail: result.debug },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        shop,
        mode: "full",
        pushed: result.pushed ?? 0,
        totalVariants: result.totalVariants ?? 0,
        markedProcessed: result.markedProcessed ?? 0,
        removedFromShopify: result.removedFromShopify ?? 0,
        productsCreated: result.productsCreated ?? 0,
        timestamp: new Date().toISOString(),
      });
    }

    const forceFullCheck = url.searchParams.get("fullCheck") === "true";
    const targetParentId = url.searchParams.get("targetParent") || undefined;
    const deltaResult = await runDeltaSync(shop, { forceFullCheck: forceFullCheck || !!targetParentId, targetParentId });

    if (!deltaResult.ok) {
      console.error("[cart-sync] Delta sync errors:", deltaResult.errorDetails);
    }

    return NextResponse.json({
      ok: deltaResult.ok,
      shop,
      mode: "delta",
      itemsChecked: deltaResult.itemsChecked,
      itemsUpdated: deltaResult.itemsUpdated,
      variantsAdded: deltaResult.variantsAdded,
      variantsDeleted: deltaResult.variantsDeleted,
      productsArchived: deltaResult.productsArchived,
      pushed: deltaResult.pushed ?? 0,
      errors: deltaResult.errors,
      durationMs: deltaResult.durationMs,
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
