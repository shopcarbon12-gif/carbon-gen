import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = req.cookies.get("carbon_gen_user_id")?.value?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing user session" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("models")
      .select("model_id,name,gender,ref_image_urls,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ models: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load models" }, { status: 500 });
  }
}
