import { randomUUID } from "crypto";

type BarcodeHandoffSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  barcode: string | null;
  receivedAt: number | null;
};

type ImageHandoffSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  fileName: string | null;
  mimeType: string | null;
  dataUrl: string | null;
  receivedAt: number | null;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const barcodeSessions = new Map<string, BarcodeHandoffSession>();
const imageSessions = new Map<string, ImageHandoffSession>();

function nowMs() {
  return Date.now();
}

function cleanupExpiredSessions() {
  const now = nowMs();
  for (const [id, session] of barcodeSessions.entries()) {
    if (session.expiresAt <= now) {
      barcodeSessions.delete(id);
    }
  }
  for (const [id, session] of imageSessions.entries()) {
    if (session.expiresAt <= now) {
      imageSessions.delete(id);
    }
  }
}

export function createBarcodeHandoffSession() {
  cleanupExpiredSessions();
  const createdAt = nowMs();
  const session: BarcodeHandoffSession = {
    id: randomUUID(),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    barcode: null,
    receivedAt: null,
  };
  barcodeSessions.set(session.id, session);
  return session;
}

export function getBarcodeHandoffSession(sessionId: string) {
  cleanupExpiredSessions();
  const session = barcodeSessions.get(sessionId) || null;
  if (!session) return null;
  if (session.expiresAt <= nowMs()) {
    barcodeSessions.delete(sessionId);
    return null;
  }
  return session;
}

export function saveBarcodeToSession(sessionId: string, barcode: string) {
  const session = getBarcodeHandoffSession(sessionId);
  if (!session) return null;
  session.barcode = barcode;
  session.receivedAt = nowMs();
  return session;
}

export function consumeBarcodeFromSession(sessionId: string) {
  const session = getBarcodeHandoffSession(sessionId);
  if (!session || !session.barcode) return null;
  const barcode = session.barcode;
  barcodeSessions.delete(sessionId);
  return barcode;
}

export function createImageHandoffSession() {
  cleanupExpiredSessions();
  const createdAt = nowMs();
  const session: ImageHandoffSession = {
    id: randomUUID(),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    fileName: null,
    mimeType: null,
    dataUrl: null,
    receivedAt: null,
  };
  imageSessions.set(session.id, session);
  return session;
}

export function getImageHandoffSession(sessionId: string) {
  cleanupExpiredSessions();
  const session = imageSessions.get(sessionId) || null;
  if (!session) return null;
  if (session.expiresAt <= nowMs()) {
    imageSessions.delete(sessionId);
    return null;
  }
  return session;
}

export function saveImageToSession(
  sessionId: string,
  payload: { fileName: string; mimeType: string; dataUrl: string }
) {
  const session = getImageHandoffSession(sessionId);
  if (!session) return null;
  session.fileName = payload.fileName;
  session.mimeType = payload.mimeType;
  session.dataUrl = payload.dataUrl;
  session.receivedAt = nowMs();
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  return session;
}

export function consumeImageFromSession(sessionId: string) {
  const session = getImageHandoffSession(sessionId);
  if (!session || !session.dataUrl || !session.fileName || !session.mimeType) return null;
  const payload = {
    fileName: session.fileName,
    mimeType: session.mimeType,
    dataUrl: session.dataUrl,
  };
  // Keep the session alive so multiple photos can be sent in one QR session.
  session.fileName = null;
  session.mimeType = null;
  session.dataUrl = null;
  session.receivedAt = null;
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  return payload;
}
