import { Resend } from "resend";

const FROM_EMAIL =
  (process.env.EMAIL_FROM || "").trim() || "onboarding@resend.dev";
const FROM_NAME = (process.env.EMAIL_FROM_NAME || "").trim() || "Carbon Cart Sync";

export type PushNotificationPayload = {
  to: string;
  shop: string;
  success: boolean;
  pushed: number;
  totalVariants: number;
  markedProcessed: number;
  removedFromShopify: number;
  archivedNotInCart?: number;
  productsCreated?: number;
  error?: string;
  items: Array<{ sku: string; title: string; brand: string; variants: number }>;
};

export async function sendPushNotificationEmail(
  payload: PushNotificationPayload
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const resend = new Resend(apiKey);

  const errForSubject = (payload.error || "Unknown error")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const subject = payload.success
    ? `Cart Push to Shopify: Success — ${payload.pushed} variant(s) updated`
    : `Cart Push to Shopify: Failed — ${errForSubject}`;

  const statusParts: string[] = [
    `Shop: ${payload.shop}`,
    `Status: ${payload.success ? "Success" : "Failed"}`,
    ...(payload.success
      ? [
          `Variants updated: ${payload.pushed}`,
          `Total variants processed: ${payload.totalVariants}`,
          `Products marked processed: ${payload.markedProcessed}`,
          ...(payload.productsCreated && payload.productsCreated > 0
            ? [`Products created: ${payload.productsCreated}`]
            : []),
          ...(payload.removedFromShopify > 0
            ? [`Products archived/removed: ${payload.removedFromShopify}`]
            : []),
          ...(payload.archivedNotInCart && payload.archivedNotInCart > 0
            ? [`Archived (not in cart): ${payload.archivedNotInCart}`]
            : []),
        ]
      : [`Error: ${payload.error || "Unknown"}`]),
  ];
  const statusText = statusParts.join("\n");
  const errorLogHtml =
    !payload.success && payload.error
      ? `<h3>Error log / why it failed</h3><pre style="background: #fee; padding: 12px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-word;">${escapeHtml(payload.error)}</pre>`
      : "";

  const itemsHtml =
    payload.items.length > 0
      ? `<h3>Items (${payload.items.length})</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%;"><thead><tr><th>SKU</th><th>Title</th><th>Brand</th><th>Variants</th></tr></thead><tbody>${payload.items
          .map(
            (i) =>
              `<tr><td>${escapeHtml(i.sku)}</td><td>${escapeHtml(i.title)}</td><td>${escapeHtml(i.brand)}</td><td>${i.variants}</td></tr>`
          )
          .join("")}</tbody></table>`
      : "<p>No items in this push.</p>";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Cart Push</title></head>
<body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
  <h2>${payload.success ? "✅ Cart Push to Shopify — Success" : "❌ Cart Push to Shopify — Failed"}</h2>
  <pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto;">${escapeHtml(statusText)}</pre>
  ${errorLogHtml}
  ${itemsHtml}
  <p style="margin-top: 24px; color: #666; font-size: 12px;">Sent by Carbon Cart Sync.</p>
</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: payload.to,
      subject,
      html,
    });
    if (error) {
      return { ok: false, error: String(error.message || error) };
    }
    return { ok: true };
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message || "Email send failed";
    return { ok: false, error: msg };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
