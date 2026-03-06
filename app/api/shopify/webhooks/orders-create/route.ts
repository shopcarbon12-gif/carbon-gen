import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  createLightspeedSale,
  loadPosConfig,
  type ShopifyOrder,
} from "@/lib/lightspeedSaleCreate";
import { normalizeShopDomain } from "@/lib/shopify";
import { buildOrderLabelZpl, maybePrintWebhookLabel } from "@/lib/shopifyPrinter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSecret(value: unknown): string {
  const raw = String(value ?? "");
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r\\n|\\n|\\r/g, "")
    .trim();
}

function resolveWebhookSecret(): string {
  return normalizeSecret(process.env.SHOPIFY_WEBHOOK_SECRET);
}

function verifyWebhookHmac(body: string, hmacHeader: string, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  const provided = Buffer.from(hmacHeader, "base64");
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  try {
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const hmacHeader = normalizeText(req.headers.get("x-shopify-hmac-sha256"));
  const shopDomain = normalizeText(req.headers.get("x-shopify-shop-domain"));
  const topic = normalizeText(req.headers.get("x-shopify-topic"));
  const webhookId = normalizeText(req.headers.get("x-shopify-webhook-id"));

  const secret = resolveWebhookSecret();

  if (secret && !verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    console.error("[webhook/orders-create] HMAC verification failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (topic && topic !== "orders/create") {
    return NextResponse.json({ ok: true, skipped: true, reason: `Unexpected topic: ${topic}` });
  }

  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!order?.id || !Array.isArray(order.line_items)) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  const shop =
    normalizeShopDomain(shopDomain) ||
    normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN)) ||
    "";

  console.log(
    `[webhook/orders-create] Processing order ${order.name} (#${order.id}) from ${shop || "unknown"}, ` +
    `${order.line_items.length} line items, total $${order.total_price}`
  );

  try {
    try {
      const printResult = await maybePrintWebhookLabel({
        shop,
        topic: "orders/create",
        webhookId,
        zpl: buildOrderLabelZpl(order),
        title: `Shopify order ${normalizeText(order.name || order.id)}`,
      });
      if (!printResult.skipped) {
        console.log(`[webhook/orders-create] Shopify printer: label sent for ${order.name}`);
      }
    } catch (printErr: unknown) {
      console.warn("[webhook/orders-create] Shopify printer failed:", printErr);
    }

    const posConfig = await loadPosConfig();
    const result = await createLightspeedSale(order, posConfig, shop);

    if (!result.ok) {
      console.error(`[webhook/orders-create] Failed for order ${order.name}: ${result.error}`);
      return NextResponse.json({
        ok: false,
        orderId: order.id,
        orderName: order.name,
        error: result.error,
        linesMatched: result.linesMatched,
        linesSkipped: result.linesSkipped,
        skippedItems: result.skippedItems,
      }, { status: 200 });
    }

    console.log(
      `[webhook/orders-create] Order ${order.name} → LS Sale ${result.saleId || "N/A"}, ` +
      `${result.linesMatched} matched, ${result.linesSkipped} skipped`
    );

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderName: order.name,
      lsSaleId: result.saleId,
      linesMatched: result.linesMatched,
      linesSkipped: result.linesSkipped,
      skippedItems: result.skippedItems,
    });
  } catch (e: any) {
    console.error(`[webhook/orders-create] Error processing order ${order.name}:`, e);
    return NextResponse.json({
      ok: false,
      orderId: order.id,
      orderName: order.name,
      error: String(e?.message || e),
    }, { status: 200 });
  }
}
