import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

type BarcodeHandoffSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  connectedAt: number | null;
  disconnectedAt: number | null;
  barcode: string | null;
  receivedAt: number | null;
};

type ImageHandoffSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  connectedAt: number | null;
  fileName: string | null;
  mimeType: string | null;
  dataUrl: string | null;
  receivedAt: number | null;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const barcodeSessions = new Map<string, BarcodeHandoffSession>();
const imageSessions = new Map<string, ImageHandoffSession>();
const STORE_FILE_PATH = resolve(process.cwd(), ".bridge/runtime/handoff-store.json");

function nowMs() {
  return Date.now();
}

function loadSessionsFromDisk() {
  if (!existsSync(STORE_FILE_PATH)) return;
  try {
    const raw = readFileSync(STORE_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      barcodeSessions?: BarcodeHandoffSession[];
      imageSessions?: ImageHandoffSession[];
    };
    barcodeSessions.clear();
    imageSessions.clear();
    for (const session of parsed.barcodeSessions || []) {
      if (session?.id) barcodeSessions.set(session.id, session);
    }
    for (const session of parsed.imageSessions || []) {
      if (session?.id) imageSessions.set(session.id, session);
    }
  } catch {
    // Best-effort disk restore.
  }
}

function persistSessionsToDisk() {
  try {
    mkdirSync(dirname(STORE_FILE_PATH), { recursive: true });
    const payload = JSON.stringify(
      {
        barcodeSessions: [...barcodeSessions.values()],
        imageSessions: [...imageSessions.values()],
      },
      null,
      2
    );
    const tempPath = `${STORE_FILE_PATH}.tmp`;
    writeFileSync(tempPath, payload, "utf8");
    renameSync(tempPath, STORE_FILE_PATH);
  } catch {
    // Best-effort disk persistence.
  }
}

function cleanupExpiredSessions() {
  loadSessionsFromDisk();
  const now = nowMs();
  let changed = false;
  for (const [id, session] of barcodeSessions.entries()) {
    if (session.expiresAt <= now) {
      barcodeSessions.delete(id);
      changed = true;
    }
  }
  for (const [id, session] of imageSessions.entries()) {
    if (session.expiresAt <= now) {
      imageSessions.delete(id);
      changed = true;
    }
  }
  if (changed) persistSessionsToDisk();
}

export function createBarcodeHandoffSession() {
  cleanupExpiredSessions();
  const createdAt = nowMs();
  const session: BarcodeHandoffSession = {
    id: randomUUID(),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    connectedAt: null,
    disconnectedAt: null,
    barcode: null,
    receivedAt: null,
  };
  barcodeSessions.set(session.id, session);
  persistSessionsToDisk();
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
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  persistSessionsToDisk();
  return session;
}

export function markBarcodeSessionConnected(sessionId: string) {
  const session = getBarcodeHandoffSession(sessionId);
  if (!session) return null;
  session.connectedAt = nowMs();
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  persistSessionsToDisk();
  return session;
}

export function markBarcodeSessionDisconnected(sessionId: string) {
  const session = getBarcodeHandoffSession(sessionId);
  if (!session) return null;
  session.disconnectedAt = nowMs();
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  persistSessionsToDisk();
  return session;
}

export function isBarcodeSessionConnected(session: BarcodeHandoffSession) {
  if (!session?.connectedAt) return false;
  if (!session?.disconnectedAt) return true;
  return session.connectedAt > session.disconnectedAt;
}

export function consumeBarcodeFromSession(sessionId: string) {
  const session = getBarcodeHandoffSession(sessionId);
  if (!session || !session.barcode) return null;
  const barcode = session.barcode;
  barcodeSessions.delete(sessionId);
  persistSessionsToDisk();
  return barcode;
}

export function createImageHandoffSession() {
  cleanupExpiredSessions();
  const createdAt = nowMs();
  const session: ImageHandoffSession = {
    id: randomUUID(),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    connectedAt: null,
    fileName: null,
    mimeType: null,
    dataUrl: null,
    receivedAt: null,
  };
  imageSessions.set(session.id, session);
  persistSessionsToDisk();
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
  persistSessionsToDisk();
  return session;
}

export function markImageSessionConnected(sessionId: string) {
  const session = getImageHandoffSession(sessionId);
  if (!session) return null;
  if (!session.connectedAt) {
    session.connectedAt = nowMs();
  }
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  persistSessionsToDisk();
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
  persistSessionsToDisk();
  return payload;
}
