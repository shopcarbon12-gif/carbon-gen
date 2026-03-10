import { NextResponse } from "next/server";

import {
  consumeImageFromSession,
  getImageHandoffSession,
  markImageSessionConnected,
  markImageSessionDisconnected,
  saveImageToSession,
  isSessionConnected,
} from "@/lib/image-handoff-store";
import { uploadBytesToStorage } from "@/lib/storageProvider";

export const dynamic = "force-dynamic";

const MAX_DATA_URL_LENGTH = 16_000_000;
const MAX_IMAGE_BYTES = 12_000_000;
const HANDOFF_UPLOAD_PREFIX = "bridge/image-handoff/uploads";

function normalizeSessionId(value: string) {
  return String(value || "").trim();
}

function normalizeMimeType(value: string) {
  const mimeType = String(value || "").trim().toLowerCase();
  if (!mimeType.startsWith("image/")) return "";
  return mimeType;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId: rawSessionId } = await params;
  const sessionId = normalizeSessionId(rawSessionId);
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const consume = url.searchParams.get("consume") === "1";

  if (consume) {
    const consumed = await consumeImageFromSession(sessionId);
    if (!consumed) {
      const existing = await getImageHandoffSession(sessionId);
      if (!existing) {
        return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
      }
      return NextResponse.json({
        sessionId,
        ready: false,
        connected: isSessionConnected(existing),
        pendingCount: Array.isArray((existing as any).images) ? (existing as any).images.length : 0,
        expiresAt: new Date(existing.expiresAt).toISOString(),
      });
    }
    return NextResponse.json({
      sessionId,
      ready: true,
      ...consumed,
      objectUrl: consumed.objectPath
        ? `/api/storage/preview?path=${encodeURIComponent(consumed.objectPath)}`
        : null,
    });
  }

  const existing = await getImageHandoffSession(sessionId);
  if (!existing) {
    return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
  }

  return NextResponse.json({
    sessionId,
    ready: Array.isArray((existing as any).images) ? (existing as any).images.length > 0 : false,
    connected: isSessionConnected(existing),
    pendingCount: Array.isArray((existing as any).images) ? (existing as any).images.length : 0,
    expiresAt: new Date(existing.expiresAt).toISOString(),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId: rawSessionId } = await params;
  const sessionId = normalizeSessionId(rawSessionId);
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session id." }, { status: 400 });
  }

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  const isMultipart = contentType.includes("multipart/form-data");
  let payload: any = null;
  let fileName = "";
  let mimeType = "";
  let dataUrl = "";

  if (isMultipart) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart body." }, { status: 400 });
    }
    const upload = form.get("file");
    if (!(upload instanceof File)) {
      return NextResponse.json({ error: "Missing image file." }, { status: 400 });
    }
    fileName = String(upload.name || "").trim() || "camera-upload.jpg";
    mimeType = normalizeMimeType(String(upload.type || ""));
    if (!mimeType) {
      return NextResponse.json({ error: "Only image uploads are allowed." }, { status: 400 });
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large." }, { status: 413 });
    }
    const bytes = Buffer.from(await upload.arrayBuffer());
    const objectPath = `${HANDOFF_UPLOAD_PREFIX}/${encodeURIComponent(sessionId)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${encodeURIComponent(fileName)}`;
    await uploadBytesToStorage({
      path: objectPath,
      bytes,
      contentType: mimeType,
    });
    const updated = await saveImageToSession(sessionId, {
      fileName,
      mimeType,
      objectPath,
    });
    if (!updated) {
      return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      sessionId,
      pendingCount: Array.isArray((updated as any).images) ? (updated as any).images.length : null,
    });
  } else {
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
  }

  if (String(payload?.action || "").trim().toLowerCase() === "connect") {
    const connectedSession = await markImageSessionConnected(sessionId);
    if (!connectedSession) {
      return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      sessionId,
      connectedAt: connectedSession.connectedAt
        ? new Date(connectedSession.connectedAt).toISOString()
        : null,
      expiresAt: new Date(connectedSession.expiresAt).toISOString(),
    });
  }

  if (String(payload?.action || "").trim().toLowerCase() === "disconnect") {
    const disconnectedSession = await markImageSessionDisconnected(sessionId);
    if (!disconnectedSession) {
      return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      sessionId,
      disconnectedAt: disconnectedSession.disconnectedAt
        ? new Date(disconnectedSession.disconnectedAt).toISOString()
        : null,
      expiresAt: new Date(disconnectedSession.expiresAt).toISOString(),
    });
  }

  if (!isMultipart) {
    fileName = String(payload?.fileName || "").trim() || "camera-upload.jpg";
    mimeType = normalizeMimeType(String(payload?.mimeType || ""));
    dataUrl = String(payload?.dataUrl || "");
  }

  if (!mimeType) {
    return NextResponse.json({ error: "Only image uploads are allowed." }, { status: 400 });
  }
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
    return NextResponse.json({ error: "Invalid image payload." }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }

  const updated = await saveImageToSession(sessionId, { fileName, mimeType, dataUrl });
  if (!updated) {
    return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    pendingCount: Array.isArray((updated as any).images) ? (updated as any).images.length : null,
  });
}
