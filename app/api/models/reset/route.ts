import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveModelUserScope } from "@/lib/userScope";

export async function POST() {
  try {
    const store = await cookies();
    const isAuthed = store.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userScope = resolveModelUserScope(store.get("carbon_gen_user_id")?.value);

    const supabase = getSupabaseAdmin();
    if (userScope.legacyUserId) {
      await supabase
        .from("models")
        .update({ user_id: userScope.stableUserId })
        .neq("user_id", userScope.stableUserId);
    }

    const { error } = await supabase.from("models").delete().in("user_id", userScope.userIds);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Reset failed" }, { status: 500 });
  }
}
