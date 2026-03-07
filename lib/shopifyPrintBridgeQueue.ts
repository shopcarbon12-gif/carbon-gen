import { ensureSqlReady, sqlQuery } from "@/lib/sqlDb";

export type ShopifyPrintBridgeJob = {
  id: string;
  webhookId: string;
  shop: string;
  orderId: string;
  orderName: string;
  trackingNumber: string;
  status: "queued" | "processing" | "retry" | "done" | "failed";
  attemptCount: number;
  lastError: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

let _tableEnsured = false;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

async function ensureTable() {
  if (_tableEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS shopify_print_bridge_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      webhook_id TEXT UNIQUE NOT NULL,
      shop TEXT NOT NULL,
      order_id TEXT NOT NULL,
      order_name TEXT NOT NULL DEFAULT '',
      tracking_number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      attempt_count INT NOT NULL DEFAULT 0,
      worker_id TEXT NOT NULL DEFAULT '',
      locked_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      last_error TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await sqlQuery(`CREATE INDEX IF NOT EXISTS idx_print_bridge_jobs_status_created ON shopify_print_bridge_jobs(status, created_at ASC)`);
  await sqlQuery(`CREATE INDEX IF NOT EXISTS idx_print_bridge_jobs_shop_created ON shopify_print_bridge_jobs(shop, created_at DESC)`);
  _tableEnsured = true;
}

export async function enqueueShopifyPrintBridgeJob(input: {
  webhookId: string;
  shop: string;
  orderId: string | number;
  orderName?: string;
  trackingNumber?: string;
  payload?: Record<string, unknown>;
}) {
  await ensureTable();
  const webhookId = normalizeText(input.webhookId);
  const shop = normalizeText(input.shop);
  const orderId = normalizeText(input.orderId);
  if (!webhookId || !shop || !orderId) return { enqueued: false };
  await sqlQuery(
    `INSERT INTO shopify_print_bridge_jobs (
      webhook_id, shop, order_id, order_name, tracking_number, status, payload, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb, now())
    ON CONFLICT (webhook_id) DO NOTHING`,
    [
      webhookId,
      shop,
      orderId,
      normalizeText(input.orderName),
      normalizeText(input.trackingNumber),
      JSON.stringify(input.payload || {}),
    ]
  );
  return { enqueued: true };
}

export async function claimNextShopifyPrintBridgeJob(workerId: string) {
  await ensureTable();
  const safeWorker = normalizeText(workerId) || "bridge-worker";
  const rows = await sqlQuery<{
    id: string;
    webhook_id: string;
    shop: string;
    order_id: string;
    order_name: string;
    tracking_number: string;
    status: string;
    attempt_count: number;
    last_error: string;
    payload: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `
      WITH pick AS (
        SELECT id
        FROM shopify_print_bridge_jobs
        WHERE status IN ('queued', 'retry')
          AND attempt_count < 8
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE shopify_print_bridge_jobs j
      SET
        status = 'processing',
        attempt_count = j.attempt_count + 1,
        worker_id = $1,
        locked_at = now(),
        updated_at = now()
      FROM pick
      WHERE j.id = pick.id
      RETURNING
        j.id, j.webhook_id, j.shop, j.order_id, j.order_name, j.tracking_number,
        j.status, j.attempt_count, j.last_error, j.payload, j.created_at, j.updated_at
    `,
    [safeWorker]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    webhookId: row.webhook_id,
    shop: row.shop,
    orderId: row.order_id,
    orderName: row.order_name,
    trackingNumber: row.tracking_number,
    status: row.status as ShopifyPrintBridgeJob["status"],
    attemptCount: Number(row.attempt_count || 0),
    lastError: normalizeText(row.last_error),
    payload: row.payload || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies ShopifyPrintBridgeJob;
}

export async function completeShopifyPrintBridgeJob(input: {
  id: string;
  success: boolean;
  error?: string;
}) {
  await ensureTable();
  const id = normalizeText(input.id);
  if (!id) return;
  const success = input.success === true;
  if (success) {
    await sqlQuery(
      `UPDATE shopify_print_bridge_jobs
       SET status = 'done', completed_at = now(), last_error = '', updated_at = now()
       WHERE id::text = $1`,
      [id]
    );
    return;
  }
  await sqlQuery(
    `UPDATE shopify_print_bridge_jobs
     SET
       status = CASE WHEN attempt_count >= 8 THEN 'failed' ELSE 'retry' END,
       last_error = $2,
       updated_at = now()
     WHERE id::text = $1`,
    [id, normalizeText(input.error).slice(0, 1800)]
  );
}
