import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { normalizeShopDomain } from "@/lib/shopify";
import { buildOrderLabelWithTrackingZpl, buildOrderLabelZpl, maybePrintWebhookLabel } from "@/lib/shopifyPrinter";
import { hasShopifyWebhookSecretConfigured, verifyShopifyWebhookHmac } from "@/lib/shopifyWebhookAuth";
import { getCarrierLabelPdfUrlForOrder } from "@/lib/shopifyShippingLabel";
import { enqueueShopifyPrintBridgeJob } from "@/lib/shopifyPrintBridgeQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function isBridgeEnabled() {
  return normalizeText(process.env.SHOPIFY_PRINT_BRIDGE_ENABLED).toLowerCase() === "true";
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const hmacHeader = normalizeText(req.headers.get("x-shopify-hmac-sha256"));
  const shopDomain = normalizeText(req.headers.get("x-shopify-shop-domain"));
  const topic = normalizeText(req.headers.get("x-shopify-topic"));
  const webhookId = normalizeText(req.headers.get("x-shopify-webhook-id"));

  if (hasShopifyWebhookSecretConfigured() && !verifyShopifyWebhookHmac(rawBody, hmacHeader)) {
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
    const carrier = await getCarrierLabelPdfUrlForOrder({
      shop,
      orderId: normalizeText(order?.id),
    });

    if (webhookId) {
      await enqueueShopifyPrintBridgeJob({
        webhookId,
        shop,
        orderId: normalizeText(order?.id),
        orderName: normalizeText(order?.name),
        trackingNumber: carrier.trackingNumber || "",
        payload: {
          topic: "orders/fulfilled",
          trackingUrl: normalizeText(order?.tracking_url || ""),
        },
      });
    }

    const zpl = carrier.trackingNumber
      ? buildOrderLabelWithTrackingZpl(order, carrier.trackingNumber)
      : buildOrderLabelZpl(order);

    if (isBridgeEnabled()) {
      return NextResponse.json({
        ok: true,
        orderId: order.id,
        orderName: normalizeText(order?.name),
        printed: false,
        reason: "bridge_queued",
      });
    }

    const result = await maybePrintWebhookLabel({
      shop,
      topic: "orders/fulfilled",
      webhookId,
      zpl,
      title: `Shopify fulfilled order ${normalizeText(order?.name || order?.id)}`,
      labelPdfUrl: carrier.labelPdfUrl || "",
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
