import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const urls = Array.isArray(body?.urls)
        ? body.urls.filter((u: unknown): u is string => typeof u === "string" && !!u.trim())
        : [];
      if (!urls.length) {
        return NextResponse.json(
          { error: "No Shopify image URLs selected." },
          { status: 400 }
        );
      }
      return NextResponse.json({ urls });
    }

    const form = await req.formData();
    const files = form.getAll("files").filter(Boolean) as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
    if (!bucket) {
      return NextResponse.json({ error: "Missing SUPABASE_STORAGE_BUCKET_ITEMS" }, { status: 500 });
    }

    const supabase = getSupabaseAdmin();
    const batchId = crypto.randomUUID();
    const urls: string[] = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `items/${batchId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, bytes, { contentType: file.type || "application/octet-stream" });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      urls.push(publicUrl);
    }

    return NextResponse.json({ urls });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Item upload failed" }, { status: 500 });
  }
}
