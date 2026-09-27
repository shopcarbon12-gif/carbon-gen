import type { ModelRecord } from "@/lib/modelsRepository";

/**
 * Push a saved model to the WMS.
 *
 * Models are authored here, but the WMS Studio reads its OWN `models` table —
 * the two matched only because six rows were copied across on 2026-06-12 and
 * nobody added a model afterwards. Without this push, the first new or
 * re-slotted model would appear in carbon-gen and silently never reach the WMS.
 *
 * Deliberately best-effort and non-blocking: a save here must never fail
 * because the WMS is mid-deploy. A failed push is logged, and the next save of
 * that model re-sends it (the WMS upserts on model_id, so repeats are free).
 * Unconfigured = disabled, so local and preview environments stay inert.
 */
export function isWmsModelSyncConfigured() {
  return Boolean(
    (process.env.WMS_MODELS_SYNC_URL || "").trim() && (process.env.WMS_MODELS_SYNC_SECRET || "").trim()
  );
}

export async function pushModelToWms(model: ModelRecord | null): Promise<{ ok: boolean; error?: string }> {
  if (!model?.model_id) return { ok: false, error: "no model" };
  const url = (process.env.WMS_MODELS_SYNC_URL || "").trim();
  const secret = (process.env.WMS_MODELS_SYNC_SECRET || "").trim();
  if (!url || !secret) return { ok: false, error: "not configured" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wms-models-sync-secret": secret,
      },
      body: JSON.stringify({
        model_id: model.model_id,
        user_id: model.user_id,
        name: model.name,
        gender: model.gender,
        ref_image_urls: model.ref_image_urls,
        ref_slots: model.ref_slots && Object.keys(model.ref_slots).length ? model.ref_slots : null,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const error = `HTTP ${resp.status}${text ? ` ${text.slice(0, 200)}` : ""}`;
      console.warn("[wms-model-sync] push failed:", error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (e: any) {
    const error = e?.name === "AbortError" ? "timeout" : e?.message || "push failed";
    console.warn("[wms-model-sync] push failed:", error);
    return { ok: false, error };
  }
}
