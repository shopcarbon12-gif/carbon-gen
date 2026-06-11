import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { uploadBytesToStorage } from "@/lib/storageProvider";

const MAX_MODEL_UPLOAD_FILE_BYTES = Number.parseInt(
  process.env.MODEL_UPLOAD_MAX_FILE_BYTES || "",
  10
) || 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = (req.headers.get("content-type") || "").toLowerCase();

    // JSON { url } mode: fetch a remote image server-side (avoids browser CORS for
    // Dropbox temporary links / Shopify CDN) and store it. Backward-compatible: the
    // multipart file path below is unchanged.
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const sourceUrl = String(body?.url || "").trim();
      let host = "";
      try {
        host = new URL(sourceUrl).hostname.toLowerCase();
      } catch {
        return NextResponse.json({ error: "Invalid url." }, { status: 400 });
      }
      const allowed = /(^|\.)(dropboxusercontent\.com|dropbox\.com|shopify\.com|shopifycdn\.net)$/i.test(host);
      if (!allowed) {
        return NextResponse.json({ error: "URL host not allowed for import." }, { status: 400 });
      }
      const userId = req.cookies.get("carbon_gen_user_id")?.value?.trim() || "anonymous";
      const resp = await fetch(sourceUrl);
      if (!resp.ok) {
        return NextResponse.json({ error: `Failed to fetch source image (${resp.status}).` }, { status: 400 });
      }
      const ct = String(resp.headers.get("content-type") || "").toLowerCase();
      const buf = new Uint8Array(await resp.arrayBuffer());
      if (buf.byteLength > MAX_MODEL_UPLOAD_FILE_BYTES) {
        return NextResponse.json({ error: "Source image is too large." }, { status: 413 });
      }
      const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
      const path = `models/uploads/${userId}/${crypto.randomUUID()}/${Date.now()}-import.${ext}`;
      const uploaded = await uploadBytesToStorage({
        path,
        bytes: buf,
        contentType: ct.startsWith("image/") ? ct : "image/jpeg",
      });
      return NextResponse.json({ url: uploaded.url, path: uploaded.path });
    }

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Unsupported request body. Use multipart form-data or JSON { url }." },
        { status: 415 }
      );
    }
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form-data body. Please retry the upload." },
        { status: 400 }
      );
    }
    const file = form.get("file") as File | null;
    const batchId = String(form.get("batchId") || "").trim() || crypto.randomUUID();
    const userId = req.cookies.get("carbon_gen_user_id")?.value?.trim() || "anonymous";

    if (!file) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      return NextResponse.json(
        { error: "Unsupported file type. Only image uploads are allowed." },
        { status: 415 }
      );
    }
    if (file.size > MAX_MODEL_UPLOAD_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File is too large. Max size is ${Math.floor(
            MAX_MODEL_UPLOAD_FILE_BYTES / (1024 * 1024)
          )}MB.`,
        },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `models/uploads/${userId}/${batchId}/${Date.now()}-${safeName}`;

    const uploaded = await uploadBytesToStorage({
      path,
      bytes,
      contentType: file.type || "application/octet-stream",
    });
    return NextResponse.json({ url: uploaded.url, path: uploaded.path });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
