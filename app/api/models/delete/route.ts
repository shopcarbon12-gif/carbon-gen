import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveModelUserScope } from "@/lib/userScope";

export async function POST(req: NextRequest) {
  try {
    const store = await cookies();
    const isAuthed = store.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userScope = resolveModelUserScope(store.get("carbon_gen_user_id")?.value);

    const body = await req.json().catch(() => ({}));
    const modelId = String(body?.model_id || "").trim();
    if (!modelId) {
      return NextResponse.json({ error: "Missing model_id" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (userScope.needsMigration) {
      await supabase
        .from("models")
        .update({ user_id: userScope.stableUserId })
        .neq("user_id", userScope.stableUserId);
    }
    const { error } = await supabase
      .from("models")
      .delete()
      .eq("model_id", modelId)
      .in("user_id", userScope.userIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
