import { getShopifyAdminToken, normalizeShopDomain } from "@/lib/shopify";
import { getShopifyAccessToken } from "@/lib/shopifyTokenRepository";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

async function getTokenForShop(shop: string): Promise<string> {
  try {
    const dbToken = await getShopifyAccessToken(shop);
    if (dbToken) return dbToken;
  } catch {
    // fallback to env token
  }
  return getShopifyAdminToken(shop) || "";
}

function maybeUrl(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
}

function findReceiptLabelUrl(receipt: unknown): string {
  if (!receipt || typeof receipt !== "object") return "";
  const stack: unknown[] = [receipt];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    const entries = Object.entries(node as Record<string, unknown>);
    for (const [key, value] of entries) {
      const keyLc = key.toLowerCase();
      const asUrl = maybeUrl(value);
      if (asUrl && (keyLc.includes("label") || keyLc.includes("pdf") || keyLc.includes("url"))) {
        return asUrl;
      }
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return "";
}

export async function getCarrierLabelPdfUrlForOrder(params: {
  shop: string;
  orderId: string | number;
}): Promise<{ labelPdfUrl: string; trackingNumber: string }> {
  const shop = normalizeShopDomain(normalizeText(params.shop)) || "";
  const orderId = normalizeText(params.orderId);
  if (!shop || !orderId) return { labelPdfUrl: "", trackingNumber: "" };

  const token = await getTokenForShop(shop);
  if (!token) return { labelPdfUrl: "", trackingNumber: "" };

  const apiVersion = normalizeText(process.env.SHOPIFY_API_VERSION) || "2025-01";
  const url = `https://${shop}/admin/api/${apiVersion}/orders/${encodeURIComponent(orderId)}/fulfillments.json`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      cache: "no-store",
    });
    if (!res.ok) return { labelPdfUrl: "", trackingNumber: "" };
    const json = (await res.json().catch(() => ({}))) as { fulfillments?: any[] };
    const all = Array.isArray(json?.fulfillments) ? json.fulfillments : [];
    if (!all.length) return { labelPdfUrl: "", trackingNumber: "" };

    const active = all.filter((f) => normalizeText(f?.status).toLowerCase() !== "cancelled");
    const candidates = (active.length ? active : all).slice().sort((a, b) => {
      const at = Date.parse(String(a?.updated_at || a?.created_at || 0)) || 0;
      const bt = Date.parse(String(b?.updated_at || b?.created_at || 0)) || 0;
      return bt - at;
    });

    for (const fulfillment of candidates) {
      const trackingNumber = normalizeText(fulfillment?.tracking_number || fulfillment?.tracking_numbers?.[0]);
      const labelPdfUrl = findReceiptLabelUrl(fulfillment?.receipt);
      if (labelPdfUrl) {
        return { labelPdfUrl, trackingNumber };
      }
      if (trackingNumber) {
        return { labelPdfUrl: "", trackingNumber };
      }
    }
    return { labelPdfUrl: "", trackingNumber: "" };
  } catch {
    return { labelPdfUrl: "", trackingNumber: "" };
  }
}
