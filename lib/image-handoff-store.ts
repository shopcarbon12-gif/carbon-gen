import { randomUUID } from "crypto";

import { deleteStorageObjects, downloadStorageObject, uploadBytesToStorage } from "@/lib/storageProvider";

type ImageHandoffSession = {
  id: string;
  createdAt: number;
  expiresAt: number;
  connectedAt: number | null;
  disconnectedAt: number | null;
  images: Array<{
    id: string;
    captureId: string;
    kind: "preview" | "source";
    fileName: string;
    mimeType: string;
    dataUrl: string | null;
    objectPath: string | null;
    receivedAt: number;
  }>;
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

function normalizeSessionShape(raw: any): ImageHandoffSession | null {
  if (!raw?.id) return null;
  const legacyImage =
    raw?.fileName && raw?.mimeType && raw?.dataUrl
      ? [
          {
            id: randomUUID(),
            captureId: randomUUID(),
            kind: "source",
            fileName: String(raw.fileName),
            mimeType: String(raw.mimeType),
            dataUrl: String(raw.dataUrl),
            objectPath: null,
            receivedAt: Number(raw.receivedAt || Date.now()),
          },
        ]
      : [];
  const images = Array.isArray(raw?.images)
    ? raw.images
        .map((entry: any) => {
          const fileName = String(entry?.fileName || "").trim();
          const mimeType = String(entry?.mimeType || "").trim();
          const dataUrl = entry?.dataUrl ? String(entry.dataUrl) : null;
          const objectPath = entry?.objectPath ? String(entry.objectPath).trim() : null;
          const kindRaw = String(entry?.kind || "").trim().toLowerCase();
          const kind = kindRaw === "preview" ? "preview" : "source";
          const receivedAt = Number(entry?.receivedAt || 0);
          if (!fileName || !mimeType || (!dataUrl && !objectPath) || !Number.isFinite(receivedAt))
            return null;
          return {
            id: String(entry?.id || randomUUID()),
            captureId: String(entry?.captureId || randomUUID()),
            kind,
            fileName,
            mimeType,
            dataUrl,
            objectPath,
            receivedAt,
          };
        })
        .filter(Boolean)
    : legacyImage;
  return {
    id: String(raw.id),
    createdAt: Number(raw.createdAt || Date.now()),
    expiresAt: Number(raw.expiresAt || Date.now() + SESSION_TTL_MS),
    connectedAt: raw.connectedAt ? Number(raw.connectedAt) : null,
    disconnectedAt: raw.disconnectedAt ? Number(raw.disconnectedAt) : null,
    images,
  };
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
  const parsed = normalizeSessionShape(JSON.parse(text));
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
    images: [],
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
  payload: {
    captureId?: string;
    kind?: "preview" | "source";
    fileName: string;
    mimeType: string;
    dataUrl?: string | null;
    objectPath?: string | null;
  }
) {
  const session = await getImageHandoffSession(sessionId);
  if (!session) return null;
  const normalizedDataUrl = payload.dataUrl ? String(payload.dataUrl) : null;
  const normalizedObjectPath = payload.objectPath ? String(payload.objectPath).trim() : null;
  if (!normalizedDataUrl && !normalizedObjectPath) return null;
  session.images.push({
    id: randomUUID(),
    captureId: String(payload.captureId || randomUUID()),
    kind: payload.kind === "preview" ? "preview" : "source",
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    dataUrl: normalizedDataUrl,
    objectPath: normalizedObjectPath,
    receivedAt: nowMs(),
  });
  if (session.images.length > 30) {
    session.images = session.images.slice(-30);
  }
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
  if (!session || !session.images.length) return null;
  const next = session.images.shift();
  if (!next) return null;
  const payload = {
    id: next.id,
    captureId: next.captureId,
    kind: next.kind,
    fileName: next.fileName,
    mimeType: next.mimeType,
    dataUrl: next.dataUrl || null,
    objectPath: next.objectPath || null,
  };
  session.expiresAt = nowMs() + SESSION_TTL_MS;
  try {
    await writeSessionToStorage(session);
  } catch {
    saveSessionToFallback(session);
  }
  return payload;
}

export { isSessionConnected };
