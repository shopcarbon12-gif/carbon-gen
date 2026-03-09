import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { lsGet, lsPost, lsPut, lsDelete } from "@/lib/lightspeedApi";
import { loadPosConfig } from "@/lib/lightspeedSaleCreate";
import {
  claimWebhookEvent,
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

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

async function findSyncRecord(shopifyOrderId: number): Promise<{ lsSaleId: string | null; status: string | null }> {
  try {
    const row = await getOrderSyncRecord(shopifyOrderId);
    return { lsSaleId: row.lsSaleId || null, status: row.status || null };
  } catch {
    return { lsSaleId: null, status: null };
  }
}

type LsSaleRecord = {
  saleID?: string;
  customerID?: string;
  referenceNumber?: string;
  referenceNumberSource?: string;
  completed?: string | boolean;
  voided?: string | boolean;
  SaleLines?: { SaleLine?: unknown };
};

async function fetchSaleById(saleId: string): Promise<LsSaleRecord | null> {
  const id = normalizeText(saleId);
  if (!id) return null;
  try {
    const result = await lsGet<any>(`Sale/${id}`, { load_relations: '["SaleLines"]' });
    return (result?.Sale || null) as LsSaleRecord | null;
  } catch {
    return null;
  }
}

async function fetchSalesByOrderRef(orderName: string): Promise<LsSaleRecord[]> {
  const ref = normalizeText(orderName);
  if (!ref) return [];
  try {
    const result = await lsGet<any>("Sale", {
      referenceNumber: `~,${ref}`,
      limit: "100",
      load_relations: '["SaleLines"]',
    });
    const rows = result?.Sale;
    const list: LsSaleRecord[] = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return list.filter((s) => normalizeText(s.referenceNumber) === ref);
  } catch {
    return [];
  }
}

async function resolveExpectedCustomerIds(order: any): Promise<Set<string>> {
  const ids = new Set<string>();
  const email = normalizeLower(order?.customer?.email);
  const phone =
    normalizeText(order?.customer?.phone).replace(/[^0-9+]/g, "") ||
    normalizeText(order?.shipping_address?.phone).replace(/[^0-9+]/g, "");
  if (email) {
    try {
      const byEmail = await lsGet<any>("Customer", {
        "Contact.Emails.ContactEmail.address": `~,${email}`,
        limit: "20",
      });
      const customers = Array.isArray(byEmail?.Customer) ? byEmail.Customer : byEmail?.Customer ? [byEmail.Customer] : [];
      for (const c of customers) {
        const id = normalizeText(c?.customerID);
        if (id) ids.add(id);
      }
    } catch { /* ignore */ }
  }
  if (phone && phone.length >= 7) {
    try {
      const byPhone = await lsGet<any>("Customer", {
        "Contact.Phones.ContactPhone.number": `~,${phone}`,
        limit: "20",
      });
      const customers = Array.isArray(byPhone?.Customer) ? byPhone.Customer : byPhone?.Customer ? [byPhone.Customer] : [];
      for (const c of customers) {
        const id = normalizeText(c?.customerID);
        if (id) ids.add(id);
      }
    } catch { /* ignore */ }
  }
  return ids;
}

function chooseBestSaleForCancellation(
  sales: LsSaleRecord[],
  orderName: string,
  syncedSaleId: string | null,
  expectedCustomerIds: Set<string>
): LsSaleRecord | null {
  const targetRef = normalizeText(orderName);
  const syncedId = normalizeText(syncedSaleId);
  let best: { sale: LsSaleRecord; score: number } | null = null;
  for (const sale of sales) {
    const saleId = normalizeText(sale.saleID);
    if (!saleId) continue;
    if (sale.voided === true || normalizeLower(sale.voided) === "true") continue;
    let score = 0;
    if (saleId === syncedId) score += 100;
    if (normalizeText(sale.referenceNumber) === targetRef) score += 40;
    if (normalizeLower(sale.referenceNumberSource) === "shopify") score += 20;
    if (expectedCustomerIds.has(normalizeText(sale.customerID))) score += 60;
    score += Math.min(30, Number.parseInt(saleId, 10) || 0);
    if (!best || score > best.score) best = { sale, score };
  }
  return best?.sale || null;
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
  const sale = await fetchSaleById(lsSaleId);
  if (!sale) {
    return { method: "sale_not_found", error: "Sale not found in Lightspeed" };
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
  const webhookId = normalizeText(req.headers.get("x-shopify-webhook-id"));

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
  if (webhookId) {
    const claimed = await claimWebhookEvent({
      webhookId,
      topic: topic || "orders/cancelled",
      shopDomain: normalizeText(req.headers.get("x-shopify-shop-domain")),
      shopifyOrderId: Number(orderId),
    });
    if (!claimed) {
      return NextResponse.json({ ok: true, orderId, orderName, action: "duplicate_webhook" });
    }
  }


  if (!orderId) {
    return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
  }

  console.log(
    `[webhook/orders-cancelled] Order ${orderName} (#${orderId}) cancelled in Shopify`
  );

  const { lsSaleId: syncedSaleId, status } = await findSyncRecord(orderId);
  const candidates: LsSaleRecord[] = [];
  const syncSale = await fetchSaleById(syncedSaleId || "");
  if (syncSale) candidates.push(syncSale);
  const refSales = await fetchSalesByOrderRef(orderName);
  for (const sale of refSales) {
    const id = normalizeText(sale.saleID);
    if (!id) continue;
    if (candidates.some((existing) => normalizeText(existing.saleID) === id)) continue;
    candidates.push(sale);
  }
  const expectedCustomerIds = await resolveExpectedCustomerIds(order);
  const selectedSale = chooseBestSaleForCancellation(candidates, orderName, syncedSaleId, expectedCustomerIds);
  const selectedSaleId = normalizeText(selectedSale?.saleID);

  if (!selectedSaleId) {
    console.log(`[webhook/orders-cancelled] No LS sale found for order ${orderName}`);
    await markOrderCancelled(orderId);
    return NextResponse.json({ ok: true, orderId, orderName, action: "no_ls_sale_found" });
  }

  if (status === "cancelled") {
    return NextResponse.json({ ok: true, orderId, orderName, action: "already_cancelled" });
  }

  const result = await handleCancellation(selectedSaleId, orderName);

  const errorDetail = result.error ? `${result.method}: ${result.error}` : undefined;
  await markOrderCancelled(orderId, result.returnSaleId, errorDetail);

  console.log(
    `[webhook/orders-cancelled] Order ${orderName} → LS Sale ${selectedSaleId}: method=${result.method}` +
    (result.returnSaleId ? `, returnSale=${result.returnSaleId}` : "") +
    (result.error ? `, error=${result.error}` : "")
  );

  return NextResponse.json({
    ok: true,
    orderId,
    orderName,
    originalLsSaleId: selectedSaleId,
    ...result,
  });
}
