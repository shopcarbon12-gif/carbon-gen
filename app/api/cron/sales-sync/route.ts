import { NextResponse } from "next/server";
import { ensureNeonReady, neonQuery } from "@/lib/neonDb";
import { lsGet } from "@/lib/lightspeedApi";
import { runDeltaSync } from "@/lib/cartInventoryDeltaSync";
import { loadSyncToggles } from "@/lib/shopifyCartConfig";
import { normalizeShopDomain } from "@/lib/shopify";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function normalizeText(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizeLower(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

async function resolveShopForSync(): Promise<string> {
    const envShop = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN));
    if (envShop) return envShop;
    try {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase
            .from("shopify_tokens")
            .select("shop")
            .order("installed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        const shop = normalizeShopDomain(normalizeText((data as { shop?: string } | null)?.shop));
        return shop || "";
    } catch {
        return "";
    }
}

type LsItem = {
    itemID?: string;
    itemMatrixID?: string;
    customSku?: string;
    systemSku?: string;
};

type LsItemResponse = {
    Item?: LsItem | LsItem[];
};

function parentIdFromItem(item: LsItem): string {
    const matrixId = normalizeLower(item.itemMatrixID);
    if (matrixId && matrixId !== "0") return `matrix:${matrixId}`;
    const sku = normalizeLower(item.customSku) || normalizeLower(item.systemSku);
    return sku ? `sku:${sku}` : "";
}

async function fetchItemById(itemId: string): Promise<LsItem | null> {
    const id = normalizeText(itemId);
    if (!id) return null;
    try {
        const res = await lsGet<LsItemResponse>("Item", { itemID: id, limit: 1 });
        const row = Array.isArray(res?.Item) ? res.Item[0] : res?.Item;
        return row || null;
    } catch {
        return null;
    }
}

async function getLastSyncTime(): Promise<string> {
    const rows = await neonQuery<{ last_sync_time: string }>(
        `SELECT last_sync_time FROM lightspeed_sales_sync_state WHERE id = 1`
    );
    if (rows.length > 0) {
        const d = new Date(rows[0].last_sync_time);
        return isNaN(d.getTime()) ? new Date(Date.now() - 3600000).toISOString() : d.toISOString();
    }
    // Default to 1 hour ago
    const t = new Date(Date.now() - 3600000).toISOString();
    await neonQuery(
        `INSERT INTO lightspeed_sales_sync_state (id, last_sync_time) VALUES (1, $1) ON CONFLICT (id) DO NOTHING`,
        [t]
    );
    return t;
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const authHeader = req.headers.get("authorization");
        const secret = process.env.CRON_SECRET;

        // Auth for cron jobs
        if (secret) {
            if (authHeader !== `Bearer ${secret}` && url.searchParams.get("secret") !== secret) {
                return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
            }
        }

        await ensureNeonReady();

        const shop = await resolveShopForSync();
        if (!shop) {
            return NextResponse.json({ ok: false, error: "No connected Shopify shop found." }, { status: 400 });
        }

        const toggles = await loadSyncToggles(shop);
        if (!toggles.shopifySyncEnabled || !toggles.shopifyAutoSyncEnabled) {
            return NextResponse.json({
                ok: true,
                skipped: true,
                message: "Sync toggles disabled. Cron accepted without sync.",
            });
        }

        let lastSyncTimeRaw = await getLastSyncTime();
        // Lightspeed API expects timestamp strings in ISO 8601 subset. Try format "YYYY-MM-DDTHH:MM:SS" 
        // Wait, lsGet just takes strings. Let's send the raw ISO. Lightspeed is usually happy with UTC ISO format.
        const lastSyncTimeStr = lastSyncTimeRaw.split(".")[0] + "+00:00"; // Strip ms

        // Fetch new sales since lastSyncTime. 
        // Notice `>` vs `>=`. Use `>=` to fetch sales that are newer. `timeStamp` is the standard query parameter.
        const queryParams: Record<string, string> = {
            timeStamp: `>,${lastSyncTimeStr}`,
            load_relations: JSON.stringify(["SaleLines"])
        };

        let newMaxTime = new Date().toISOString();
        // We update the sync state to 'now' immediately, but practically we'll capture max time of fetched sales.

        let salesRes: any;
        try {
            salesRes = await lsGet("Sale", queryParams);
        } catch (e: any) {
            console.error("Failed to fetch Sales from Lightspeed:", e.message);
            return NextResponse.json({ ok: false, error: "Lightspeed API fetch failed", detail: e.message }, { status: 502 });
        }

        const salesList = Array.isArray(salesRes?.Sale) ? salesRes.Sale : (salesRes?.Sale ? [salesRes.Sale] : []);

        if (salesList.length === 0) {
            // Advance the pointer since there were no sales.
            await neonQuery(`UPDATE lightspeed_sales_sync_state SET last_sync_time = $1 WHERE id = 1`, [newMaxTime]);
            return NextResponse.json({ ok: true, message: "No new sales to sync.", runs: 0, errors: 0 });
        }

        // Extract all item IDs from all SaleLines
        const itemIds = new Set<string>();
        for (const sale of salesList) {
            if (sale.timeStamp) {
                const tDate = new Date(sale.timeStamp);
                const maxDate = new Date(newMaxTime);
                if (tDate > maxDate) {
                    newMaxTime = tDate.toISOString();
                }
            }

            const lines = Array.isArray(sale?.SaleLines?.SaleLine) ? sale.SaleLines.SaleLine : (sale?.SaleLines?.SaleLine ? [sale.SaleLines.SaleLine] : []);
            for (const line of lines) {
                if (line?.itemID) {
                    itemIds.add(String(line.itemID));
                }
            }
        }

        const parentIds = new Set<string>();
        for (const itemId of Array.from(itemIds)) {
            const item = await fetchItemById(itemId);
            if (!item) continue;
            const parentId = parentIdFromItem(item);
            if (parentId) parentIds.add(parentId);
        }

        const targets = Array.from(parentIds).slice(0, 50); // limit to max 50 to avoid timeout
        let runs = 0;
        let errors = 0;

        for (const parentId of targets) {
            try {
                const res = await runDeltaSync(shop, { forceFullCheck: true, targetParentId: parentId });
                runs++;
                errors += Number(res.errors || 0);
            } catch (err: any) {
                console.error(`Delta sync failed for ${parentId}:`, err.message);
                errors++;
            }
        }

        // After attempting all sync tasks, advance the pointer to avoid re-syncing the same sales.
        await neonQuery(`UPDATE lightspeed_sales_sync_state SET last_sync_time = $1 WHERE id = 1`, [newMaxTime]);

        return NextResponse.json({
            ok: errors === 0,
            shop,
            runs,
            errors,
            targets: targets.length,
            message: errors === 0 ? "Cron sync completed." : "Cron sync completed with errors.",
        });

    } catch (err: any) {
        return NextResponse.json({ ok: false, error: "Internal Error", detail: err.message }, { status: 500 });
    }
}
