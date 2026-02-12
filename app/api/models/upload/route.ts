import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const isAuthed = req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const batchId = String(form.get("batchId") || "").trim() || crypto.randomUUID();

    if (!file) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }

    const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
    if (!bucket) {
      return NextResponse.json(
        { error: "Missing SUPABASE_STORAGE_BUCKET_ITEMS" },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `models/${batchId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: file.type || "application/octet-stream" });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ url: publicUrl, path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
