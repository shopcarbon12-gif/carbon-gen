import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";
import { Resend } from "resend";

export const runtime = "nodejs";
export const maxDuration = 60;

const REPORT_EMAIL = "elior@carbonjeanscompany.com";

function isAuthorized(req: NextRequest) {
  if (isRequestAuthed(req)) return true;
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = (req.headers.get("authorization") || "").trim();
  if (auth === `Bearer ${secret}`) return true;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") === secret) return true;
  } catch { /* */ }
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function getShop(): Promise<string> {
  const envShop = normalizeShopDomain((process.env.SHOPIFY_SHOP_DOMAIN || "").trim());
  if (envShop) return envShop;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("shopify_tokens").select("shop").order("installed_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.shop) return normalizeShopDomain(data.shop) || data.shop;
  } catch { /* */ }
  return "";
}

type SyncActivity = {
  id: string;
  synced_at: string;
  items_checked: number;
  items_updated: number;
  variants_added: number;
  variants_deleted: number;
  products_archived: number;
  errors: number;
  duration_ms: number;
};

type SyncChange = {
  sync_id: string;
  parent_id: string;
  product_title: string | null;
  variant_sku: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const shop = await getShop();
    if (!shop) {
      return NextResponse.json({ ok: false, error: "No shop configured" }, { status: 400 });
    }

    const { neonQuery, ensureNeonReady } = await import("@/lib/neonDb");
    await ensureNeonReady();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const activities = await neonQuery<SyncActivity>(
      `SELECT id, synced_at, items_checked, items_updated, variants_added, variants_deleted, products_archived, errors, duration_ms
       FROM shopify_cart_sync_activity
       WHERE shop = $1 AND synced_at >= $2 AND synced_at <= $3
       ORDER BY synced_at ASC`,
      [shop, todayStart, todayEnd]
    );

    const runs = activities || [];
    const totalRuns = runs.length;
    const totalUpdated = runs.reduce((s, r) => s + r.items_updated, 0);
    const totalVariantsAdded = runs.reduce((s, r) => s + r.variants_added, 0);
    const totalVariantsDeleted = runs.reduce((s, r) => s + r.variants_deleted, 0);
    const totalArchived = runs.reduce((s, r) => s + r.products_archived, 0);
    const totalErrors = runs.reduce((s, r) => s + r.errors, 0);

    const allChangesRaw = await neonQuery<SyncChange>(
      `SELECT c.sync_id, c.parent_id, c.product_title, c.variant_sku, c.field, c.old_value, c.new_value, c.changed_at
       FROM shopify_cart_sync_changes c
       JOIN shopify_cart_sync_activity a ON a.id = c.sync_id
       WHERE a.shop = $1 AND c.changed_at >= $2 AND c.changed_at <= $3
       ORDER BY changed_at ASC`,
      [shop, todayStart, todayEnd]
    );

    const allChanges = allChangesRaw || [];
    // Keep one net row per (parent, sku, field): first old value -> latest new value.
    const netByKey = new Map<string, SyncChange>();
    for (const c of allChanges) {
      const key = `${c.parent_id}||${c.variant_sku || ""}||${c.field}`;
      const existing = netByKey.get(key);
      if (!existing) {
        netByKey.set(key, { ...c });
      } else {
        existing.new_value = c.new_value;
        existing.changed_at = c.changed_at;
        if (!existing.product_title && c.product_title) existing.product_title = c.product_title;
      }
    }
    const netChanges = Array.from(netByKey.values());

    // Group changes by product
    const byProduct = new Map<string, SyncChange[]>();
    for (const c of allChanges) {
      const key = c.product_title || c.parent_id;
      if (!byProduct.has(key)) byProduct.set(key, []);
      byProduct.get(key)!.push(c);
    }

    // Build email
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    let changesHtml = "";
    if (netChanges.length === 0) {
      changesHtml = "<p>No field-level changes recorded today.</p>";
    } else {
      changesHtml = `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 13px;">
        <thead style="background: #f0f0f0;">
          <tr>
            <th style="text-align:left;">Time</th>
            <th style="text-align:left;">Product</th>
            <th style="text-align:left;">Variant SKU</th>
            <th style="text-align:left;">Field</th>
            <th style="text-align:right;">Old Value</th>
            <th style="text-align:right;">New Value</th>
          </tr>
        </thead>
        <tbody>
          ${netChanges.map((c) => `<tr>
            <td>${new Date(c.changed_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</td>
            <td>${escapeHtml(c.product_title || c.parent_id)}</td>
            <td>${escapeHtml(c.variant_sku || "-")}</td>
            <td>${escapeHtml(c.field)}</td>
            <td style="text-align:right; color:#c00;">${escapeHtml(c.old_value || "-")}</td>
            <td style="text-align:right; color:#060;">${escapeHtml(c.new_value || "-")}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
    }

    const summaryHtml = `
      <table cellpadding="8" cellspacing="0" style="font-size: 14px; margin-bottom: 20px;">
        <tr><td><strong>Total sync runs:</strong></td><td>${totalRuns}</td></tr>
        <tr><td><strong>Items updated:</strong></td><td>${totalUpdated}</td></tr>
        <tr><td><strong>Variants added:</strong></td><td>${totalVariantsAdded}</td></tr>
        <tr><td><strong>Variants deleted:</strong></td><td>${totalVariantsDeleted}</td></tr>
        <tr><td><strong>Products archived:</strong></td><td>${totalArchived}</td></tr>
        <tr><td><strong>Errors:</strong></td><td style="color: ${totalErrors > 0 ? "#c00" : "inherit"};">${totalErrors}</td></tr>
        <tr><td><strong>Products changed:</strong></td><td>${byProduct.size}</td></tr>
        <tr><td><strong>Total raw field changes:</strong></td><td>${allChanges.length}</td></tr>
        <tr><td><strong>Net field changes:</strong></td><td>${netChanges.length}</td></tr>
      </table>`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Daily Sync Report</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="border-bottom: 2px solid #333; padding-bottom: 8px;">Daily Sync Report — ${escapeHtml(dateStr)}</h2>
  <p style="color: #666;">Shop: ${escapeHtml(shop)}</p>

  <h3>Summary</h3>
  ${summaryHtml}

  <h3>Net Changes (End-of-day)</h3>
  ${changesHtml}

  <p style="margin-top: 30px; color: #999; font-size: 11px;">Sent automatically by Carbon Cart Sync at ${now.toLocaleTimeString("en-US")}.</p>
</body>
</html>`;

    const apiKey = (process.env.RESEND_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "RESEND_API_KEY not configured" });
    }

    const resend = new Resend(apiKey);
    const fromEmail = (process.env.EMAIL_FROM || "").trim() || "sync@carbonjeanscompany.com";
    const fromName = (process.env.EMAIL_FROM_NAME || "").trim() || "Carbon Cart Sync";

    const noChangesToday = totalUpdated === 0 && totalVariantsAdded === 0 && totalVariantsDeleted === 0 && totalArchived === 0;
    const subject = noChangesToday
      ? `Daily Sync Report — ${dateStr} — No changes`
      : `Daily Sync Report — ${dateStr} — ${totalUpdated} items updated, ${netChanges.length} net changes`;

    const { error: sendErr } = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: REPORT_EMAIL,
      subject,
      html,
    });

    if (sendErr) {
      return NextResponse.json({ ok: false, error: sendErr.message });
    }

    let deletedActivity = 0;
    let deletedChanges = 0;
    try {
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
      const ccRes = await neonQuery<{ cnt: string }>(
        `SELECT count(*)::text AS cnt
         FROM shopify_cart_sync_changes c
         JOIN shopify_cart_sync_activity a ON a.id = c.sync_id
         WHERE a.shop = $1 AND c.changed_at <= $2`,
        [shop, endOfDay]
      );
      deletedChanges = parseInt(ccRes[0]?.cnt || "0", 10);

      const acRes = await neonQuery<{ cnt: string }>(
        `WITH d AS (DELETE FROM shopify_cart_sync_activity WHERE shop = $1 AND synced_at <= $2 RETURNING id)
         SELECT count(*)::text AS cnt FROM d`,
        [shop, endOfDay]
      );
      deletedActivity = parseInt(acRes[0]?.cnt || "0", 10);
    } catch {
      // best-effort cleanup
    }

    return NextResponse.json({
      ok: true,
      totalRuns,
      totalUpdated,
      totalChanges: allChanges.length,
      netChanges: netChanges.length,
      productsChanged: byProduct.size,
      emailSentTo: REPORT_EMAIL,
      cleanup: { deletedActivity, deletedChanges },
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || "Report failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
