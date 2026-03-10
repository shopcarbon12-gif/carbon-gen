import { randomUUID } from "crypto";

import { deleteStorageObjects, downloadStorageObject, uploadBytesToStorage } from "@/lib/storageProvider";

type ImageHandoffSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  connectedAt: number | null;
  disconnectedAt: number | null;
  fileName: string | null;
  mimeType: string | null;
  dataUrl: string | null;
  receivedAt: number | null;
};

const SESSION_TTL_MS = 10 * 60 * 1000;
const FALLBACK_SESSIONS = new Map<string, ImageHandoffSession>();
const STORAGE_PREFIX = "bridge/image-handoff/sessions";

function nowMs() {
  return Date.now();
}

function getSessionPath(sessionId: string) {
  return `${STORAGE_PREFIX}/${encodeURIComponent(String(sessionId || "").trim())}.json`;
}

function cloneSession(session: ImageHandoffSession) {
  return JSON.parse(JSON.stringify(session)) as ImageHandoffSession;
}

async function writeSessionToStorage(session: ImageHandoffSession) {
  const bytes = new TextEncoder().encode(JSON.stringify(session));
  await uploadBytesToStorage({
    path: getSessionPath(session.id),
    bytes,
    contentType: "application/json",
  });
}

async function readSessionFromStorage(sessionId: string): Promise<ImageHandoffSession | null> {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return null;
  const { body } = await downloadStorageObject(getSessionPath(normalizedSessionId));
  const text = Buffer.from(body).toString("utf8");
  const parsed = JSON.parse(text) as ImageHandoffSession;
  if (!parsed?.id) return null;
  return parsed;
}

async function deleteSessionFromStorage(sessionId: string) {
  await deleteStorageObjects([getSessionPath(sessionId)]);
}

function getSessionFromFallback(sessionId: string) {
  const session = FALLBACK_SESSIONS.get(sessionId) || null;
  if (!session) return null;
  if (session.expiresAt <= nowMs()) {
    FALLBACK_SESSIONS.delete(sessionId);
    return null;
  }
  return cloneSession(session);
}

function saveSessionToFallback(session: ImageHandoffSession) {
  FALLBACK_SESSIONS.set(session.id, cloneSession(session));
}

function isSessionConnected(session: ImageHandoffSession) {
  if (!session.connectedAt) return false;
  if (!session.disconnectedAt) return true;
  return session.connectedAt > session.disconnectedAt;
}

export async function createImageHandoffSession() {
  const createdAt = nowMs();
  const session: ImageHandoffSession = {
    id: randomUUID(),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
    connectedAt: null,
    disconnectedAt: null,
    fileName: null,
    mimeType: null,
    dataUrl: null,
    receivedAt: null,
  };
  try {
    await writeSessionToStorage(session);
  } catch {
    saveSessionToFallback(session);
  }
  return session;
}

export async function getImageHandoffSession(sessionId: string) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return null;
  try {
    const session = await readSessionFromStorage(normalizedSessionId);
    if (!session) return null;
    if (session.expiresAt <= nowMs()) {
      try {
        await deleteSessionFromStorage(normalizedSessionId);
      } catch {
        // Best effort cleanup.
      }
      return null;
    }
    return session;
  } catch {
    return getSessionFromFallback(normalizedSessionId);
  }
}

export async function markImageSessionConnected(sessionId: string) {
  const session = await getImageHandoffSession(sessionId);
  if (!session) return null;
  session.connectedAt = nowMs();
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  try {
    await writeSessionToStorage(session);
  } catch {
    saveSessionToFallback(session);
  }
  return session;
}

export async function markImageSessionDisconnected(sessionId: string) {
  const session = await getImageHandoffSession(sessionId);
  if (!session) return null;
  session.disconnectedAt = nowMs();
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  try {
    await writeSessionToStorage(session);
  } catch {
    saveSessionToFallback(session);
  }
  return session;
}

export async function saveImageToSession(
  sessionId: string,
  payload: { fileName: string; mimeType: string; dataUrl: string }
) {
  const session = await getImageHandoffSession(sessionId);
  if (!session) return null;
  session.fileName = payload.fileName;
  session.mimeType = payload.mimeType;
  session.dataUrl = payload.dataUrl;
  session.receivedAt = nowMs();
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  try {
    await writeSessionToStorage(session);
  } catch {
    saveSessionToFallback(session);
  }
  return session;
}

export async function consumeImageFromSession(sessionId: string) {
  const session = await getImageHandoffSession(sessionId);
  if (!session || !session.dataUrl || !session.fileName || !session.mimeType) return null;
  const payload = {
    fileName: session.fileName,
    mimeType: session.mimeType,
    dataUrl: session.dataUrl,
  };
  session.fileName = null;
  session.mimeType = null;
  session.dataUrl = null;
  session.receivedAt = null;
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  try {
    await writeSessionToStorage(session);
  } catch {
    saveSessionToFallback(session);
  }
  return payload;
}

export { isSessionConnected };
