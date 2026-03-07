import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { normalizeShopDomain } from "@/lib/shopify";
import { buildFulfillmentLabelZpl, maybePrintWebhookLabel } from "@/lib/shopifyPrinter";
import { hasShopifyWebhookSecretConfigured, verifyShopifyWebhookHmac } from "@/lib/shopifyWebhookAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const hmacHeader = normalizeText(req.headers.get("x-shopify-hmac-sha256"));
  const shopDomain = normalizeText(req.headers.get("x-shopify-shop-domain"));
  const topic = normalizeText(req.headers.get("x-shopify-topic"));
  const webhookId = normalizeText(req.headers.get("x-shopify-webhook-id"));

  if (hasShopifyWebhookSecretConfigured() && !verifyShopifyWebhookHmac(rawBody, hmacHeader)) {
    console.error("[webhook/fulfillments-create] HMAC verification failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (topic && topic !== "fulfillments/create") {
    return NextResponse.json({ ok: true, skipped: true, reason: `Unexpected topic: ${topic}` });
  }

  let fulfillment: any;
  try {
    fulfillment = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fulfillmentId = normalizeText(fulfillment?.id);
  if (!fulfillmentId) {
    return NextResponse.json({ error: "Invalid fulfillment payload" }, { status: 400 });
  }

  const shop =
    normalizeShopDomain(shopDomain) ||
    normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN)) ||
    "__default__";

  try {
    const result = await maybePrintWebhookLabel({
      shop,
      topic: "fulfillments/create",
      webhookId,
      zpl: buildFulfillmentLabelZpl(fulfillment),
      title: `Shopify fulfillment ${normalizeText(fulfillment?.name || fulfillmentId)}`,
    });
    return NextResponse.json({
      ok: true,
      fulfillmentId,
      printed: result.ok && !result.skipped,
      reason: result.reason,
    });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      fulfillmentId,
      error: normalizeText((e as { message?: string } | null)?.message) || "Print failed",
    });
  }
}
