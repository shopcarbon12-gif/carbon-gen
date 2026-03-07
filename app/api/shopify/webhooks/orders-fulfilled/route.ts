import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { normalizeShopDomain } from "@/lib/shopify";
import { buildOrderLabelZpl, maybePrintWebhookLabel } from "@/lib/shopifyPrinter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
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

  const secret = normalizeText(process.env.SHOPIFY_WEBHOOK_SECRET);

  if (secret && !verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    console.error("[webhook/orders-fulfilled] HMAC verification failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (topic && topic !== "orders/fulfilled") {
    return NextResponse.json({ ok: true, skipped: true, reason: `Unexpected topic: ${topic}` });
  }

  let order: any;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!order?.id) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  const shop =
    normalizeShopDomain(shopDomain) ||
    normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN)) ||
    "__default__";

  try {
    const result = await maybePrintWebhookLabel({
      shop,
      topic: "orders/fulfilled",
      webhookId,
      zpl: buildOrderLabelZpl(order),
      title: `Shopify fulfilled order ${normalizeText(order?.name || order?.id)}`,
    });
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderName: normalizeText(order?.name),
      printed: result.ok && !result.skipped,
      reason: result.reason,
    });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      orderId: order.id,
      orderName: normalizeText(order?.name),
      error: normalizeText((e as { message?: string } | null)?.message) || "Print failed",
    });
  }
}
