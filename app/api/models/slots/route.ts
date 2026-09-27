import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getStoragePublicUrl, tryGetStoragePathFromUrl, copyStorageObject } from "@/lib/storageProvider";
import { listModelsForUser, updateModelSlots } from "@/lib/modelsRepository";
import { pushModelToWms } from "@/lib/wmsModelSync";
import {
  MODEL_SLOT_ORDER,
  missingModelSlots,
  normalizeModelSlots,
  slotsToOrderedUrls,
  type ModelSlots,
} from "@/lib/modelSlots";

/**
 * POST /api/models/slots — assign photo roles to an EXISTING model.
 *
 * The models saved before slots existed hold an unordered pile of 6-8 photos.
 * This lets the operator say which four play which role without deleting and
 * re-creating the model (which would lose its id, and with it any downstream
 * reference to it).
 *
 * Writes `ref_slots` AND rewrites `ref_image_urls` to exactly the four slot
 * photos in canonical order, so the generator stops receiving whichever six
 * happened to be first. Body: { model_id, slots: { face_front: url, ... } }.
 */
export const dynamic = "force-dynamic";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Slot photos must live under this model's permanent prefix; a photo still in
 *  the sweepable uploads area is copied across first so a cleanup can't delete
 *  a reference the model depends on. Best-effort, mirroring the save path. */
async function ensurePermanent(url: string, modelId: string, index: number): Promise<string> {
  try {
    const srcPath = tryGetStoragePathFromUrl(url);
    if (!srcPath || !srcPath.startsWith("models/uploads/")) return url;
    const basename = srcPath.split("/").pop() || `${index}.bin`;
    const destPath = `models/saved/${modelId}/slot-${index}-${basename}`;
    await copyStorageObject(srcPath, destPath);
    return getStoragePublicUrl(destPath);
  } catch {
    return url;
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId =
      req.cookies.get("carbon_gen_user_id")?.value?.trim() ||
      req.cookies.get("carbon_gen_username")?.value?.trim() ||
      DEFAULT_SESSION_USER_ID;

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const modelId = String(body?.model_id || "").trim();
    if (!modelId) return NextResponse.json({ error: "model_id is required." }, { status: 400 });

    const slots = normalizeModelSlots(body?.slots);
    const missing = missingModelSlots(slots);
    if (missing.length) {
      return NextResponse.json(
        { error: `Fill every slot before saving. Missing: ${missing.join(", ")}.` },
        { status: 400 }
      );
    }

    // The model must belong to this user — listModelsForUser is already scoped.
    const mine = await listModelsForUser(userId);
    const model = mine.find((m) => m.model_id === modelId);
    if (!model) return NextResponse.json({ error: "Model not found." }, { status: 404 });

    const permanent: ModelSlots = {};
    for (let i = 0; i < MODEL_SLOT_ORDER.length; i += 1) {
      const key = MODEL_SLOT_ORDER[i];
      const url = slots[key];
      if (url) permanent[key] = await ensurePermanent(url, modelId, i);
    }

    const updated = await updateModelSlots({
      modelId,
      userId,
      slots: permanent,
      refImageUrls: slotsToOrderedUrls(permanent),
    });
    if (!updated) return NextResponse.json({ error: "Failed to save slots." }, { status: 500 });

    // Slots only matter downstream once the WMS has them — push straight away.
    const synced = await pushModelToWms(updated);
    return NextResponse.json({
      model: updated,
      wmsSynced: synced.ok,
      wmsSyncError: synced.ok ? undefined : synced.error,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to save slots." }, { status: 500 });
  }
}
