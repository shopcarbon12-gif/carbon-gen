import { normalizeShopDomain } from "@/lib/shopify";
import { loadShopifyCartConfig, upsertShopifyCartConfig } from "@/lib/shopifyCartConfigRepository";
import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";

export type ShopifyPrinterTriggerTopic = "orders/create" | "fulfillments/create";

export type ShopifyPrinterConfig = {
  enabled: boolean;
  triggerTopic: ShopifyPrinterTriggerTopic;
  copies: number;
  labelSize: "4x6";
};

export type ShopifyPrinterResolvedConfig = ShopifyPrinterConfig & {
  apiKey: string;
  printerId: number | null;
  hasApiKey: boolean;
  apiKeyMasked: string;
  backend: "database" | "memory";
  envManaged: true;
  warning?: string;
};

const DEFAULT_CONFIG: ShopifyPrinterConfig = {
  enabled: false,
  triggerTopic: "fulfillments/create",
  copies: 1,
  labelSize: "4x6",
};

const fallbackWebhookSeen = new Set<string>();
let webhookTableEnsured = false;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function toPositiveInt(value: unknown, fallback: number) {
  const n = Number.parseInt(normalizeText(value), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function resolvePrinterShop(raw: string | null | undefined) {
  const requested = normalizeShopDomain(normalizeText(raw) || "") || "";
  if (requested) return requested;
  return normalizeShopDomain(normalizeText(process.env.SHOPIFY_SHOP_DOMAIN) || "") || "__default__";
}

export function maskApiKey(raw: string) {
  const key = normalizeText(raw);
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

function normalizeTriggerTopic(value: unknown): ShopifyPrinterTriggerTopic {
  const v = normalizeText(value).toLowerCase();
  if (v === "orders/create") return "orders/create";
  return "fulfillments/create";
}

function normalizeConfig(raw: Record<string, unknown> | null | undefined): ShopifyPrinterConfig {
  const section = (raw || {}) as Record<string, unknown>;
  return {
    enabled: section.enabled === true,
    triggerTopic: normalizeTriggerTopic(section.triggerTopic),
    copies: Math.min(5, Math.max(1, toPositiveInt(section.copies, 1))),
    labelSize: "4x6",
  };
}

function withEnvConfig(config: ShopifyPrinterConfig) {
  const envApiKey = normalizeText(process.env.PRINTNODE_API_KEY);
  const envPrinterId = toPositiveInt(process.env.PRINTNODE_PRINTER_ID, 0);
  return {
    ...config,
    apiKey: envApiKey,
    printerId: envPrinterId > 0 ? envPrinterId : null,
  };
}

export async function loadShopifyPrinterConfig(shop: string): Promise<ShopifyPrinterResolvedConfig> {
  try {
    const config = await loadShopifyCartConfig(shop);
    const section = normalizeConfig((config.shopifyPrinter || {}) as Record<string, unknown>);
    const resolved = withEnvConfig(section);
    return {
      ...resolved,
      hasApiKey: Boolean(resolved.apiKey),
      apiKeyMasked: maskApiKey(resolved.apiKey),
      backend: "database",
      envManaged: true,
    };
  } catch (e: unknown) {
    const fallback = withEnvConfig(DEFAULT_CONFIG);
    return {
      ...fallback,
      hasApiKey: Boolean(fallback.apiKey),
      apiKeyMasked: maskApiKey(fallback.apiKey),
      backend: "memory",
      envManaged: true,
      warning: normalizeText((e as { message?: string } | null)?.message) || "Failed to load printer config.",
    };
  }
}

export async function saveShopifyPrinterConfig(
  shop: string,
  input: Partial<ShopifyPrinterConfig>
): Promise<{ backend: "database" | "memory"; warning?: string }> {
  const existing = await loadShopifyPrinterConfig(shop);
  const next: ShopifyPrinterConfig = {
    enabled: input.enabled === true,
    triggerTopic: normalizeTriggerTopic(input.triggerTopic || existing.triggerTopic),
    copies: Math.min(5, Math.max(1, toPositiveInt(input.copies, existing.copies || 1))),
    labelSize: "4x6",
  };
  try {
    const config = await loadShopifyCartConfig(shop);
    const merged = {
      ...config,
      shopifyPrinter: next,
    };
    await upsertShopifyCartConfig(shop, merged);
    return { backend: "database" };
  } catch (e: unknown) {
    return {
      backend: "memory",
      warning: normalizeText((e as { message?: string } | null)?.message) || "Failed to persist printer config.",
    };
  }
}

function zplSafe(value: unknown) {
  return normalizeText(value).replace(/[\^~]/g, " ").replace(/\s+/g, " ").trim();
}

function build4x6Zpl(lines: string[]) {
  const clipped = lines.filter(Boolean).slice(0, 8);
  const rows = clipped.map((line, idx) => `^FO50,${110 + idx * 70}^A0N,46,46^FD${zplSafe(line)}^FS`).join("\n");
  return `^XA
^PW812
^LL1218
^CI28
^FO50,30^A0N,54,54^FDCARBON - SHOPIFY LABEL^FS
${rows}
^XZ`;
}

export function buildOrderLabelZpl(order: any) {
  const shipping = order?.shipping_address || {};
  return build4x6Zpl([
    `ORDER ${normalizeText(order?.name || order?.order_number || order?.id || "")}`,
    `${normalizeText(shipping?.first_name)} ${normalizeText(shipping?.last_name)}`.trim(),
    normalizeText(shipping?.address1),
    normalizeText(shipping?.address2),
    `${normalizeText(shipping?.city)}, ${normalizeText(shipping?.province)} ${normalizeText(shipping?.zip)}`.trim(),
    normalizeText(shipping?.country),
    normalizeText(shipping?.phone),
  ]);
}

export function buildFulfillmentLabelZpl(fulfillment: any) {
  const destination = fulfillment?.destination || {};
  return build4x6Zpl([
    `FULFILLMENT ${normalizeText(fulfillment?.name || fulfillment?.id || "")}`,
    `ORDER ${normalizeText(fulfillment?.order_id || "")}`,
    `${normalizeText(destination?.first_name)} ${normalizeText(destination?.last_name)}`.trim(),
    normalizeText(destination?.address1),
    normalizeText(destination?.address2),
    `${normalizeText(destination?.city)}, ${normalizeText(destination?.province)} ${normalizeText(destination?.zip)}`.trim(),
    normalizeText(destination?.country),
    normalizeText(destination?.phone),
  ]);
}

export async function getPrintNodePrinterStatus(apiKey: string, printerId: number) {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch(`https://api.printnode.com/printers/${printerId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(normalizeText(body?.message || body?.error || `PrintNode status failed (${res.status})`));
  }
  return {
    id: Number(body?.id || printerId),
    name: normalizeText(body?.name),
    state: normalizeText(body?.state || "unknown"),
    online: normalizeText(body?.state).toLowerCase() === "online",
  };
}

export async function sendPrintNodeZplJob(params: {
  apiKey: string;
  printerId: number;
  zpl: string;
  title: string;
  copies?: number;
}) {
  const auth = Buffer.from(`${params.apiKey}:`).toString("base64");
  const content = Buffer.from(params.zpl, "utf8").toString("base64");
  const copies = Math.min(5, Math.max(1, toPositiveInt(params.copies, 1)));
  for (let i = 0; i < copies; i += 1) {
    const res = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        printerId: params.printerId,
        title: params.title,
        contentType: "raw_base64",
        content,
        source: "Carbon Shopify Printer",
      }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(normalizeText(body?.message || body?.error || `PrintNode print failed (${res.status})`));
    }
  }
}

async function ensureWebhookLogTable() {
  if (webhookTableEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS shopify_printer_webhook_log (
      webhook_id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      topic TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  webhookTableEnsured = true;
}

export async function shouldProcessWebhook(
  webhookId: string,
  shop: string,
  topic: string
): Promise<boolean> {
  const id = normalizeText(webhookId);
  if (!id) return true;
  if (!hasSqlDatabaseConfigured()) {
    if (fallbackWebhookSeen.has(id)) return false;
    fallbackWebhookSeen.add(id);
    return true;
  }
  try {
    await ensureWebhookLogTable();
    await sqlQuery(
      `INSERT INTO shopify_printer_webhook_log (webhook_id, shop, topic)
       VALUES ($1, $2, $3)`,
      [id, shop, topic]
    );
    return true;
  } catch {
    return false;
  }
}

export async function maybePrintWebhookLabel(params: {
  shop: string;
  topic: ShopifyPrinterTriggerTopic;
  webhookId: string;
  zpl: string;
  title: string;
}) {
  const config = await loadShopifyPrinterConfig(params.shop);
  if (!config.enabled) return { ok: true, skipped: true as const, reason: "disabled" };
  if (config.triggerTopic !== params.topic) {
    return { ok: true, skipped: true as const, reason: "topic_not_enabled" };
  }
  if (!config.apiKey || !config.printerId) {
    return { ok: false, skipped: true as const, reason: "missing_printnode_config" };
  }
  const shouldProcess = await shouldProcessWebhook(params.webhookId, params.shop, params.topic);
  if (!shouldProcess) return { ok: true, skipped: true as const, reason: "duplicate_webhook" };

  await sendPrintNodeZplJob({
    apiKey: config.apiKey,
    printerId: config.printerId,
    zpl: params.zpl,
    title: params.title,
    copies: config.copies,
  });
  return { ok: true, skipped: false as const, reason: "" };
}
