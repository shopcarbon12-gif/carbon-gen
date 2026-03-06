import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { deleteModelByIdForUser, deleteModelsByIds, listModelsForUser } from "@/lib/modelsRepository";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(req: NextRequest) {
  try {
    const store = await cookies();
    const isAuthed = store.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId =
      store.get("carbon_gen_user_id")?.value?.trim() ||
      store.get("carbon_gen_username")?.value?.trim() ||
      DEFAULT_SESSION_USER_ID;

    const body = await req.json().catch(() => ({}));
    const modelId = String(body?.model_id || "").trim();
    if (!modelId) {
      return NextResponse.json({ error: "Missing model_id" }, { status: 400 });
    }

    const scopedModels = await listModelsForUser(userId);
    if (scopedModels.length > 0) {
      await deleteModelByIdForUser(modelId, userId);
    } else {
      // Legacy/cross-domain sessions can show global models when no scoped rows exist.
      await deleteModelsByIds([modelId], null);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
