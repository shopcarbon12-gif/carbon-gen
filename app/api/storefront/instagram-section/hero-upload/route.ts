import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { isRequestAuthed } from "@/lib/auth";
import { canManageInstagramSection, readSession } from "@/lib/userAuth";
import { INSTAGRAM_HERO_HEIGHT, INSTAGRAM_HERO_WIDTH } from "@/lib/instagram-widget-constants";
import { uploadBytesToStorage } from "@/lib/storageProvider";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/ogg",
]);

function classifyHeroFile(file: File): "image" | "video" | null {
  const t = String(file.type || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (VIDEO_MIMES.has(t)) return "video";
  const n = String(file.name || "").toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(n)) return "video";
  if (/\.(jpe?g|png|gif|webp|avif)$/i.test(n)) return "image";
  return null;
}

function videoExtAndContentType(file: File): { ext: string; contentType: string } {
  const t = String(file.type || "").toLowerCase();
  if (t.includes("webm")) return { ext: ".webm", contentType: "video/webm" };
  if (t.includes("quicktime")) return { ext: ".mov", contentType: "video/quicktime" };
  if (t.includes("ogg")) return { ext: ".ogv", contentType: "video/ogg" };
  const n = String(file.name || "").toLowerCase();
  const m = n.match(/\.(mp4|webm|mov|m4v|ogv)$/i);
  if (m) {
    const e = m[1].toLowerCase();
    if (e === "webm") return { ext: ".webm", contentType: "video/webm" };
    if (e === "mov") return { ext: ".mov", contentType: "video/quicktime" };
    if (e === "ogv") return { ext: ".ogv", contentType: "video/ogg" };
  }
  return { ext: ".mp4", contentType: "video/mp4" };
}

async function verifyPublicUrl(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    return r.ok;
  } catch {
    try {
      const r = await fetch(url, { method: "GET", redirect: "follow" });
      return r.ok;
    } catch {
      return false;
    }
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const session = readSession(req);
  if (!canManageInstagramSection(session)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Use multipart form-data with field file" }, { status: 415 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const kind = classifyHeroFile(file);
  if (!kind) {
    return NextResponse.json(
      {
        error:
          "Unsupported type. Use an image (JPEG, PNG, WebP, GIF) or video (MP4, WebM, MOV).",
      },
      { status: 415 },
    );
  }

  const maxBytes = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: kind === "video" ? "Video too large (max 80 MB)" : "File too large (max 25 MB)" },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  if (kind === "video") {
    const { ext, contentType } = videoExtAndContentType(file);
    const rawName = String(file.name || `hero${ext}`).replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const baseName = rawName.replace(/\.(mp4|webm|mov|m4v|ogv)$/i, "") || "hero";
    const path = `items/instagram-hero/${Date.now()}-${crypto.randomUUID()}-${baseName}${ext}`;

    const uploaded = await uploadBytesToStorage({
      path,
      bytes: new Uint8Array(buf),
      contentType,
    });

    const ok = await verifyPublicUrl(uploaded.url);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Upload succeeded but URL could not be verified (HEAD/GET failed)." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      kind: "video" as const,
      url: uploaded.url,
    });
  }

  const lowerType = String(file.type || "").toLowerCase();
  const wantPng = lowerType.includes("png");
  let out: Buffer;
  let contentType: string;
  let ext: string;
  try {
    const pipeline = sharp(buf)
      .rotate()
      .resize(INSTAGRAM_HERO_WIDTH, INSTAGRAM_HERO_HEIGHT, { fit: "cover", position: "centre" });
    if (wantPng) {
      out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      contentType = "image/png";
      ext = ".png";
    } else {
      out = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      contentType = "image/jpeg";
      ext = ".jpg";
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Image processing failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const rawName = String(file.name || `hero${ext}`).replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const baseName = rawName.replace(/\.(jpe?g|png|webp|gif)$/i, "") || "hero";
  const path = `items/instagram-hero/${Date.now()}-${crypto.randomUUID()}-${baseName}${ext}`;

  const uploaded = await uploadBytesToStorage({
    path,
    bytes: new Uint8Array(out),
    contentType,
  });

  const ok = await verifyPublicUrl(uploaded.url);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Upload succeeded but URL could not be verified (HEAD/GET failed)." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    kind: "image" as const,
    url: uploaded.url,
    width: INSTAGRAM_HERO_WIDTH,
    height: INSTAGRAM_HERO_HEIGHT,
  });
}
