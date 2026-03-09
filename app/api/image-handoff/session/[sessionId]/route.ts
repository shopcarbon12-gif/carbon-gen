import { NextResponse } from "next/server";

import {
  consumeImageFromSession,
  getImageHandoffSession,
  saveImageToSession,
} from "@/lib/barcode-handoff-store";

export const dynamic = "force-dynamic";

const MAX_DATA_URL_LENGTH = 16_000_000;

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
    const consumed = consumeImageFromSession(sessionId);
    if (!consumed) {
      const existing = getImageHandoffSession(sessionId);
      if (!existing) {
        return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
      }
      return NextResponse.json({
        sessionId,
        ready: false,
        expiresAt: new Date(existing.expiresAt).toISOString(),
      });
    }
    return NextResponse.json({
      sessionId,
      ready: true,
      ...consumed,
    });
  }

  const existing = getImageHandoffSession(sessionId);
  if (!existing) {
    return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
  }

  return NextResponse.json({
    sessionId,
    ready: Boolean(existing.dataUrl),
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

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const fileName = String(payload?.fileName || "").trim() || "camera-upload.jpg";
  const mimeType = normalizeMimeType(String(payload?.mimeType || ""));
  const dataUrl = String(payload?.dataUrl || "");

  if (!mimeType) {
    return NextResponse.json({ error: "Only image uploads are allowed." }, { status: 400 });
  }
  if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
    return NextResponse.json({ error: "Invalid image payload." }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return NextResponse.json({ error: "Image is too large." }, { status: 413 });
  }

  const updated = saveImageToSession(sessionId, { fileName, mimeType, dataUrl });
  if (!updated) {
    return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    receivedAt: updated.receivedAt ? new Date(updated.receivedAt).toISOString() : null,
  });
}
