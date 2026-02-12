const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_STABLE_USER_ID = "00000000-0000-4000-8000-000000000001";

function normalizeUuid(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  return UUID_RE.test(raw) ? raw : null;
}

export function resolveStableUserId() {
  const configured = normalizeUuid(process.env.APP_USER_ID || "");
  if (configured) return configured;
  return DEFAULT_STABLE_USER_ID;
}

export function resolveModelUserScope(rawCookieUserId?: string | null) {
  const stableUserId = resolveStableUserId();
  const legacyUserId = normalizeUuid(rawCookieUserId);
  const rawProvided = String(rawCookieUserId || "").trim().length > 0;
  const needsMigration = Boolean(rawProvided && (legacyUserId === null || legacyUserId !== stableUserId));

  if (legacyUserId && legacyUserId !== stableUserId) {
    return {
      stableUserId,
      legacyUserId,
      userIds: [stableUserId, legacyUserId],
      needsMigration,
    };
  }

  return {
    stableUserId,
    legacyUserId: null,
    userIds: [stableUserId],
    needsMigration,
  };
}
