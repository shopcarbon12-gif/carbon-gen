import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { isRequestAuthed } from "@/lib/auth";
import { readSession } from "@/lib/userAuth";
import { INSTAGRAM_HERO_HEIGHT, INSTAGRAM_HERO_WIDTH } from "@/lib/instagram-widget-constants";
import { uploadBytesToStorage } from "@/lib/storageProvider";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;

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
  if (!session.isAuthed || session.role !== "admin") {
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
  if (!String(file.type || "").toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
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
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    url: uploaded.url,
    width: INSTAGRAM_HERO_WIDTH,
    height: INSTAGRAM_HERO_HEIGHT,
  });
}
