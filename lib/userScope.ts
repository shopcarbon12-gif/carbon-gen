export function resolveStableUserId() {
  const configured = (process.env.APP_USER_ID || "").trim();
  if (configured) return configured;
  return "carbon_single_user";
}

export function resolveModelUserScope(rawCookieUserId?: string | null) {
  const stableUserId = resolveStableUserId();
  const legacyUserId = String(rawCookieUserId || "").trim();

  if (legacyUserId && legacyUserId !== stableUserId) {
    return {
      stableUserId,
      legacyUserId,
      userIds: [stableUserId, legacyUserId],
    };
  }

  return {
    stableUserId,
    legacyUserId: null,
    userIds: [stableUserId],
  };
}
