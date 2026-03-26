import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { isRequestAuthed } from "@/lib/auth";
import { readSession } from "@/lib/userAuth";
import { getDropboxAccessTokenForSession } from "@/lib/dropbox";
import { INSTAGRAM_HERO_HEIGHT, INSTAGRAM_HERO_WIDTH } from "@/lib/instagram-widget-constants";
import { uploadBytesToStorage } from "@/lib/storageProvider";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

function extAndContentTypeFromDropbox(pathLower: string, headerCt: string): { ext: string; contentType: string } {
  const ct = headerCt.split(";")[0].trim().toLowerCase();
  if (ct.includes("webm")) return { ext: ".webm", contentType: "video/webm" };
  if (ct.includes("quicktime")) return { ext: ".mov", contentType: "video/quicktime" };
  if (ct === "video/ogg" || ct.includes("ogg")) return { ext: ".ogv", contentType: "video/ogg" };
  if (ct === "video/mp4" || ct.includes("mp4")) return { ext: ".mp4", contentType: "video/mp4" };

  const m = pathLower.match(/\.([a-z0-9]+)$/i);
  const e = m ? m[1].toLowerCase() : "";
  if (e === "webm") return { ext: ".webm", contentType: "video/webm" };
  if (e === "mov") return { ext: ".mov", contentType: "video/quicktime" };
  if (e === "ogv") return { ext: ".ogv", contentType: "video/ogg" };
  if (e === "m4v" || e === "mp4") return { ext: ".mp4", contentType: "video/mp4" };
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
  if (!session.isAuthed || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { path_lower?: string };
  try {
    body = (await req.json()) as { path_lower?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pathLower = String(body?.path_lower || "").trim();
  if (!pathLower || !pathLower.startsWith("/")) {
    return NextResponse.json({ error: "path_lower is required" }, { status: 400 });
  }

  const accessToken = await getDropboxAccessTokenForSession({
    userId: session.userId,
    username: session.username,
  });
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "Dropbox is not connected" }, { status: 400 });
  }

  const arg = JSON.stringify({ path: pathLower });
  const dl = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": arg,
    },
  });

  if (!dl.ok) {
    const errText = await dl.text().catch(() => "");
    return NextResponse.json(
      { ok: false, error: `Dropbox download failed: ${dl.status} ${errText.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const arrayBuf = await dl.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  const headerCt = dl.headers.get("content-type") || "";
  const pathExt = pathLower.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  const ctBase = headerCt.split(";")[0].trim().toLowerCase();
  const isVideo = ctBase.startsWith("video/") || VIDEO_EXTS.has(pathExt);

  if (isVideo) {
    if (buf.length > MAX_VIDEO_BYTES) {
      return NextResponse.json({ ok: false, error: "Video too large (max 80 MB)" }, { status: 413 });
    }
    const { ext, contentType } = extAndContentTypeFromDropbox(pathLower, headerCt);
    const safeStem = pathLower
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9.\-_/]/g, "_")
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") || "dropbox-hero";
    const path = `items/instagram-hero/${Date.now()}-${crypto.randomUUID()}-${safeStem}${ext}`;

    const uploaded = await uploadBytesToStorage({
      path,
      bytes: new Uint8Array(buf),
      contentType,
    });

    const ok = await verifyPublicUrl(uploaded.url);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Upload succeeded but URL could not be verified." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      kind: "video" as const,
      url: uploaded.url,
    });
  }

  if (buf.length > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large (max 25 MB)" }, { status: 413 });
  }

  let out: Buffer;
  try {
    out = await sharp(buf)
      .rotate()
      .resize(INSTAGRAM_HERO_WIDTH, INSTAGRAM_HERO_HEIGHT, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Image processing failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const path = `items/instagram-hero/${Date.now()}-${crypto.randomUUID()}-dropbox-hero.jpg`;
  const uploaded = await uploadBytesToStorage({
    path,
    bytes: new Uint8Array(out),
    contentType: "image/jpeg",
  });

  const ok = await verifyPublicUrl(uploaded.url);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Upload succeeded but URL could not be verified." },
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
