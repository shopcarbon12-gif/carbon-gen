import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const path = String(body?.path || "").trim();
    if (!path) {
      return NextResponse.json({ error: "Missing path." }, { status: 400 });
    }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET_ITEMS;
    if (!bucket) {
      return NextResponse.json(
        { error: "Missing SUPABASE_STORAGE_BUCKET_ITEMS" },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}
