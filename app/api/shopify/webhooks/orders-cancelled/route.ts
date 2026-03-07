import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { lsGet, lsPost, lsPut, lsDelete } from "@/lib/lightspeedApi";
import { loadPosConfig } from "@/lib/lightspeedSaleCreate";
import {
  getOrderSyncRecord,
  updateOrderCancelledStatus,
} from "@/lib/lightspeedRepository";
import { hasShopifyWebhookSecretConfigured, verifyShopifyWebhookHmac } from "@/lib/shopifyWebhookAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

async function findSyncRecord(shopifyOrderId: number): Promise<{ lsSaleId: string | null; status: string | null }> {
  try {
    const row = await getOrderSyncRecord(shopifyOrderId);
    return { lsSaleId: row.lsSaleId || null, status: row.status || null };
  } catch {
    return { lsSaleId: null, status: null };
  }
}

async function markOrderCancelled(shopifyOrderId: number, returnSaleId?: string, errorDetail?: string): Promise<void> {
  try {
    const errorMessage = returnSaleId
      ? `Return sale: ${returnSaleId}`
      : errorDetail || null;
    await updateOrderCancelledStatus(shopifyOrderId, {
      status: "cancelled",
      errorMessage,
    });
  } catch { /* best effort */ }
}

async function handleCancellation(
  lsSaleId: string,
  orderName: string,
): Promise<{ method: string; returnSaleId?: string; error?: string }> {
  let sale: any;
  try {
    const result = await lsGet<any>(`Sale/${lsSaleId}`, {
      load_relations: '["SaleLines"]',
    });
    sale = result?.Sale;
  } catch (err: any) {
    return { method: "sale_not_found", error: String(err?.message || err) };
  }

  const isCompleted = sale?.completed === "true" || sale?.completed === true;
  const customerID = normalizeText(sale?.customerID) || undefined;

  // Non-completed: just delete it
  if (!isCompleted) {
    try {
      await lsDelete(`Sale/${lsSaleId}`);
      return { method: "deleted_draft" };
    } catch (err: any) {
      return { method: "delete_failed", error: String(err?.message || err) };
    }
  }

  // Completed: create a return sale with negative quantities to restock inventory
  const rawLines = sale?.SaleLines?.SaleLine;
  const saleLines = rawLines ? (Array.isArray(rawLines) ? rawLines : [rawLines]) : [];

  if (saleLines.length === 0) {
    return { method: "no_lines_to_return", error: "Completed sale has no lines" };
  }

  const returnLines = saleLines.map((line: any) => ({
    itemID: normalizeText(line.itemID),
    unitQuantity: String(-(Math.abs(Number(line.unitQuantity) || 1))),
    unitPrice: normalizeText(line.unitPrice),
  }));

  try {
    const posConfig = await loadPosConfig();
    const ds = posConfig.downloadSettings;

    const draftPayload: Record<string, unknown> = {
      employeeID: normalizeText(ds.employee) || "1",
      shopID: normalizeText(ds.shop) || "1",
      registerID: normalizeText(ds.register) || "1",
      completed: false,
      referenceNumber: `${orderName}-RETURN`,
      referenceNumberSource: "Shopify",
      SaleLines: { SaleLine: returnLines },
    };
    if (customerID && customerID !== "0") draftPayload.customerID = customerID;

    const draftReturn = await lsPost<any>("Sale", draftPayload);

    const returnSaleId = normalizeText(draftReturn?.Sale?.saleID);
    if (!returnSaleId) {
      return { method: "return_create_failed", error: "Return sale created but no saleID returned" };
    }

    const calcTotal = normalizeText(draftReturn?.Sale?.calcTotal) || "0";
    const paymentAmount = calcTotal;

    await lsPut(`Sale/${returnSaleId}`, {
      completed: true,
      SalePayments: {
        SalePayment: [{
          paymentTypeID: normalizeText(ds.paymentType) || "7",
          amount: paymentAmount,
        }],
      },
    });

    console.log(
      `[webhook/orders-cancelled] Created return sale ${returnSaleId} for original sale ${lsSaleId}`
    );

    return { method: "return_sale_created", returnSaleId };
  } catch (err: any) {
    return { method: "return_failed", error: String(err?.message || err) };
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const hmacHeader = normalizeText(req.headers.get("x-shopify-hmac-sha256"));
  const topic = normalizeText(req.headers.get("x-shopify-topic"));

  if (hasShopifyWebhookSecretConfigured() && !verifyShopifyWebhookHmac(rawBody, hmacHeader)) {
    console.error("[webhook/orders-cancelled] HMAC verification failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (topic && topic !== "orders/cancelled") {
    return NextResponse.json({ ok: true, skipped: true, reason: `Unexpected topic: ${topic}` });
  }

  let order: any;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orderId = order?.id;
  const orderName = normalizeText(order?.name);

  if (!orderId) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  console.log(
    `[webhook/orders-cancelled] Order ${orderName} (#${orderId}) cancelled in Shopify`
  );

  const { lsSaleId, status } = await findSyncRecord(orderId);

  if (!lsSaleId) {
    console.log(`[webhook/orders-cancelled] No LS sale found for order ${orderName}`);
    await markOrderCancelled(orderId);
    return NextResponse.json({ ok: true, orderId, orderName, action: "no_ls_sale_found" });
  }

  if (status === "cancelled") {
    return NextResponse.json({ ok: true, orderId, orderName, action: "already_cancelled" });
  }

  const result = await handleCancellation(lsSaleId, orderName);

  const errorDetail = result.error ? `${result.method}: ${result.error}` : undefined;
  await markOrderCancelled(orderId, result.returnSaleId, errorDetail);

  console.log(
    `[webhook/orders-cancelled] Order ${orderName} → LS Sale ${lsSaleId}: method=${result.method}` +
    (result.returnSaleId ? `, returnSale=${result.returnSaleId}` : "") +
    (result.error ? `, error=${result.error}` : "")
  );

  return NextResponse.json({
    ok: true,
    orderId,
    orderName,
    originalLsSaleId: lsSaleId,
    ...result,
  });
}
