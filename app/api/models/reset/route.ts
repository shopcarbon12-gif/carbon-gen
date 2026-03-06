import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  deleteAllModelsForUser,
  deleteModelsByIds,
  listAllModelsAsc,
  listModelsForUser,
} from "@/lib/modelsRepository";

const DEFAULT_SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function POST() {
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

    const scopedModels = await listModelsForUser(userId);
    if (scopedModels.length > 0) {
      await deleteAllModelsForUser(userId);
    } else {
      // Legacy/cross-domain sessions can show global models when no scoped rows exist.
      const allRows = await listAllModelsAsc();
      const ids = allRows.map((row: any) => String(row?.model_id || "").trim()).filter(Boolean);
      await deleteModelsByIds(ids, null);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Reset failed" }, { status: 500 });
  }
}

