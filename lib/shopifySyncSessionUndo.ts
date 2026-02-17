import type { StagingParent } from "@/lib/shopifyCartStaging";

export type UndoOperation =
  | { type: "restore_rows"; rows: StagingParent[] }
  | { type: "remove_rows"; parentIds: string[] };

export type SyncSessionTarget = "cart_inventory" | "shopify";

export type SyncUndoSession = {
  id: string;
  shop: string;
  target: SyncSessionTarget;
  action: string;
  note: string;
  createdAt: string;
  operations: UndoOperation[];
};

const MAX_SESSIONS_PER_SHOP = 120;
const memorySessions = new Map<string, SyncUndoSession[]>();

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function getShopKey(shop: string) {
  return normalizeLower(shop) || "__default_shop__";
}

function nextSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `sess-${Date.now()}-${rand}`;
}

function getBucket(shop: string) {
  const key = getShopKey(shop);
  const existing = memorySessions.get(key);
  if (existing) return existing;
  const created: SyncUndoSession[] = [];
  memorySessions.set(key, created);
  return created;
}

export function createUndoSession(args: {
  shop: string;
  target: SyncSessionTarget;
  action: string;
  note: string;
  operations: UndoOperation[];
}) {
  const session: SyncUndoSession = {
    id: nextSessionId(),
    shop: normalizeText(args.shop),
    target: args.target,
    action: normalizeText(args.action),
    note: normalizeText(args.note),
    createdAt: new Date().toISOString(),
    operations: Array.isArray(args.operations) ? args.operations : [],
  };

  const bucket = getBucket(session.shop);
  bucket.unshift(session);
  if (bucket.length > MAX_SESSIONS_PER_SHOP) {
    bucket.length = MAX_SESSIONS_PER_SHOP;
  }

  return session;
}

export function getUndoSession(shop: string, sessionId: string) {
  const key = normalizeLower(sessionId);
  if (!key) return null;
  return getBucket(shop).find((session) => normalizeLower(session.id) === key) || null;
}

export function takeUndoSession(shop: string, sessionId?: string) {
  const bucket = getBucket(shop);
  if (bucket.length < 1) return null;

  if (!normalizeText(sessionId)) {
    return bucket.shift() || null;
  }

  const id = normalizeLower(sessionId);
  const index = bucket.findIndex((session) => normalizeLower(session.id) === id);
  if (index < 0) return null;
  const [session] = bucket.splice(index, 1);
  return session || null;
}

export function listUndoSessions(shop: string, target?: SyncSessionTarget, limit = 20) {
  const constrained = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = getBucket(shop);
  if (!target) return rows.slice(0, constrained);
  return rows.filter((session) => session.target === target).slice(0, constrained);
}

