import { createHmac, timingSafeEqual } from "crypto";

function normalizeSecret(value: unknown): string {
  const raw = String(value ?? "");
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\r\\n|\\n|\\r/g, "")
    .trim();
}

function getWebhookSecrets(): string[] {
  const primary = normalizeSecret(process.env.SHOPIFY_WEBHOOK_SECRET);
  const fallback = normalizeSecret(process.env.SHOPIFY_APP_CLIENT_SECRET);
  return [primary, fallback].filter(Boolean);
}

export function hasShopifyWebhookSecretConfigured() {
  return getWebhookSecrets().length > 0;
}

export function verifyShopifyWebhookHmac(body: string, hmacHeader: string): boolean {
  const providedRaw = String(hmacHeader || "").trim();
  if (!providedRaw) return false;
  const secrets = getWebhookSecrets();
  if (!secrets.length) return false;

  let provided: Buffer;
  try {
    provided = Buffer.from(providedRaw, "base64");
  } catch {
    return false;
  }

  for (const secret of secrets) {
    const expected = createHmac("sha256", secret).update(body, "utf8").digest();
    try {
      if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
        return true;
      }
    } catch {
      // continue to next secret
    }
  }

  return false;
}
