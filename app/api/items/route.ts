import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function sanitizeFileName(input: string) {
  const base = input.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return base || "catalog-image.jpg";
}

function guessFileNameFromUrl(rawUrl: string, index: number) {
  try {
    const parsed = new URL(rawUrl);
    const segment = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    if (segment) return sanitizeFileName(segment);
  } catch {
    // Fall back to index-based name below.
  }
  return `catalog-image-${index + 1}.jpg`;
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const inputUrls = Array.isArray(body?.urls)
        ? body.urls.filter((u: unknown): u is string => typeof u === "string" && !!u.trim())
        : [];
      if (!inputUrls.length) {
        return NextResponse.json(
          { error: "No Shopify image URLs selected." },
          { status: 400 }
        );
      }

      const bucket = (process.env.SUPABASE_STORAGE_BUCKET_ITEMS || "").trim();
      if (!bucket) {
        return NextResponse.json({ error: "Missing SUPABASE_STORAGE_BUCKET_ITEMS" }, { status: 500 });
      }

      const supabase = getSupabaseAdmin();
      const batchId = crypto.randomUUID();
      const urls: string[] = [];

      for (let i = 0; i < inputUrls.length; i += 1) {
        const sourceUrl = inputUrls[i];
        const remote = await fetch(sourceUrl);
        if (!remote.ok) {
          return NextResponse.json(
            { error: `Failed to fetch catalog image (${remote.status})` },
            { status: 502 }
          );
        }

        const arrayBuffer = await remote.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const remoteContentType = remote.headers.get("content-type") || "application/octet-stream";
        const safeName = guessFileNameFromUrl(sourceUrl, i);
        const path = `items/shopify/${batchId}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, bytes, { contentType: remoteContentType });

        if (uploadError) {
          return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        urls.push(publicUrl);
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
