import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST() {
  try {
    const store = await cookies();
    const isAuthed = store.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = store.get("carbon_gen_user_id")?.value?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing user session" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("models").delete().eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Reset failed" }, { status: 500 });
  }
}

