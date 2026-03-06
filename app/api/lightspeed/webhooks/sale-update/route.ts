import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { lsGet } from "@/lib/lightspeedApi";
import { runDeltaSync } from "@/lib/cartInventoryDeltaSync";
import { loadSyncToggles } from "@/lib/shopifyCartConfig";
import { normalizeShopDomain } from "@/lib/shopify";
import { getMostRecentInstalledShop } from "@/lib/shopifyTokenRepository";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type LsItem = {
  itemID?: string;
  itemMatrixID?: string;
  customSku?: string;
  systemSku?: string;
};

type LsItemResponse = {
  Item?: LsItem | LsItem[];
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function webhookSecret(): string {
  return normalizeText(process.env.LS_SALE_WEBHOOK_SECRET) || normalizeText(process.env.CRON_SECRET);
}

function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const providedHex = normalizeLower(signatureHeader).replace(/^sha256=/, "");
  if (!expectedHex || !providedHex) return false;
  try {
    const provided = Buffer.from(providedHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

function collectFields(obj: unknown, fields: string[], out: string[] = []): string[] {
  if (!obj) return out;
  if (Array.isArray(obj)) {
    for (const row of obj) collectFields(row, fields, out);
    return out;
  }
  if (typeof obj !== "object") return out;
  const asRec = obj as Record<string, unknown>;
  for (const [key, value] of Object.entries(asRec)) {
    const keyLower = normalizeLower(key);
    if (fields.some((f) => keyLower === normalizeLower(f))) {
      const txt = normalizeText(value);
      if (txt) out.push(txt);
    }
    if (value && typeof value === "object") {
      collectFields(value, fields, out);
    }
  }
  return out;
}

async function resolveShopForSync(): Promise<string> {
  const envShop = normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN));
  if (envShop) return envShop;
  try {
    return await getMostRecentInstalledShop();
  } catch {
    return "";
  }
}

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

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = webhookSecret();
    if (!secret) {
      return NextResponse.json({ ok: false, error: "Webhook secret missing." }, { status: 500 });
    }

    const sig =
      normalizeText(req.headers.get("x-signature")) ||
      normalizeText(req.headers.get("x-lightspeed-signature")) ||
      normalizeText(req.headers.get("x-ls-signature")) ||
      normalizeText(req.headers.get("x-webhook-signature"));
    if (!verifySignature(rawBody, sig, secret)) {
      return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
    }

    let payload: Record<string, unknown> = {};
    const contentType = normalizeText(req.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      const payloadStr = params.get("payload");
      if (payloadStr) {
        try {
          payload = JSON.parse(decodeURIComponent(payloadStr)) as Record<string, unknown>;
        } catch {
          try {
            payload = JSON.parse(payloadStr) as Record<string, unknown>;
          } catch {}
        }
      }
    } else if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {}
    }
    const itemIds = Array.from(new Set(collectFields(payload, ["itemID", "itemId"])));
    const skus = Array.from(new Set(collectFields(payload, ["customSku", "sku", "systemSku"])));

    const parentIds = new Set<string>();
    for (const sku of skus) {
      const normalizedSku = normalizeLower(sku);
      if (normalizedSku) parentIds.add(`sku:${normalizedSku}`);
    }
    for (const itemId of itemIds) {
      const item = await fetchItemById(itemId);
      if (!item) continue;
      const parentId = parentIdFromItem(item);
      if (parentId) parentIds.add(parentId);
    }

    const shop = await resolveShopForSync();
    if (!shop) {
      return NextResponse.json({ ok: false, error: "No connected Shopify shop found." }, { status: 400 });
    }
    const toggles = await loadSyncToggles(shop);
    if (!toggles.shopifySyncEnabled || !toggles.shopifyAutoSyncEnabled) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        message: "Sync toggles disabled. Webhook accepted without sync.",
      });
    }

    const targets = Array.from(parentIds).slice(0, 10);
    let runs = 0;
    let errors = 0;
    for (const parentId of targets) {
      const res = await runDeltaSync(shop, { forceFullCheck: true, targetParentId: parentId });
      runs++;
      errors += Number(res.errors || 0);
    }

    return NextResponse.json({
      ok: errors === 0,
      shop,
      runs,
      errors,
      targets: targets.length,
      message: errors === 0 ? "Webhook sync completed." : "Webhook sync completed with errors.",
    });
  } catch (e: unknown) {
    const msg = normalizeText((e as { message?: string } | null)?.message) || "Webhook processing failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
