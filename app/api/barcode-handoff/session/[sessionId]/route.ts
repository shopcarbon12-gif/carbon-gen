import { NextResponse } from "next/server";

import {
  consumeBarcodeFromSession,
  getBarcodeHandoffSession,
  isBarcodeSessionConnected,
  markBarcodeSessionConnected,
  markBarcodeSessionDisconnected,
  saveBarcodeToSession,
} from "@/lib/barcode-handoff-store";

export const dynamic = "force-dynamic";

function sanitizeBarcodeInput(value: string) {
  return String(value || "").replace(/[^0-9cC]/g, "").toUpperCase();
}

function isValidBarcode(value: string) {
  return /^\d{7,9}$/.test(value) || /^C\d{6,8}$/.test(value);
}

function normalizeSessionId(value: string) {
  return String(value || "").trim();
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
    const consumedBarcode = consumeBarcodeFromSession(sessionId);
    if (!consumedBarcode) {
      const existing = getBarcodeHandoffSession(sessionId);
      if (!existing) {
        return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
      }
      return NextResponse.json({
        sessionId,
        ready: false,
        connected: isBarcodeSessionConnected(existing),
        expiresAt: new Date(existing.expiresAt).toISOString(),
      });
    }
    return NextResponse.json({
      sessionId,
      ready: true,
      barcode: consumedBarcode,
    });
  }

  const existing = getBarcodeHandoffSession(sessionId);
  if (!existing) {
    return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
  }

  return NextResponse.json({
    sessionId,
    ready: Boolean(existing.barcode),
    connected: isBarcodeSessionConnected(existing),
    barcode: existing.barcode || null,
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

  const action = String(payload?.action || "").trim().toLowerCase();
  if (action === "connect") {
    const connected = markBarcodeSessionConnected(sessionId);
    if (!connected) {
      return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      sessionId,
      connectedAt: connected.connectedAt ? new Date(connected.connectedAt).toISOString() : null,
      expiresAt: new Date(connected.expiresAt).toISOString(),
    });
  }
  if (action === "disconnect") {
    const disconnected = markBarcodeSessionDisconnected(sessionId);
    if (!disconnected) {
      return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      sessionId,
      disconnectedAt: disconnected.disconnectedAt
        ? new Date(disconnected.disconnectedAt).toISOString()
        : null,
      expiresAt: new Date(disconnected.expiresAt).toISOString(),
    });
  }

  const normalizedBarcode = sanitizeBarcodeInput(String(payload?.barcode || ""));
  if (!isValidBarcode(normalizedBarcode)) {
    return NextResponse.json(
      { error: "Barcode must be 7-9 digits, or C + 6-8 digits." },
      { status: 400 }
    );
  }

  const updated = saveBarcodeToSession(sessionId, normalizedBarcode);
  if (!updated) {
    return NextResponse.json({ error: "Session expired or not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    barcode: normalizedBarcode,
    receivedAt: updated.receivedAt ? new Date(updated.receivedAt).toISOString() : null,
  });
}
