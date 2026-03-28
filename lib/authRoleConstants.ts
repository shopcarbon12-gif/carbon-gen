export type AppRole = string;

/** Meta App Review: dashboard access limited to Instagram widget routes + allowlisted APIs. */
export const META_REVIEW_ROLE = "meta_review";

export function normalizeUsername(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function parseRole(value: unknown): AppRole {
  const v = String(value || "").trim().toLowerCase();
  return v || "user";
}

export function isMetaReviewRole(role: string) {
  return String(role || "").trim().toLowerCase() === META_REVIEW_ROLE;
}

/** Instagram section config + hero APIs (studio), not full admin. */
export function canManageInstagramSection(session: { isAuthed: boolean; role: string }) {
  if (!session.isAuthed) return false;
  const r = String(session.role || "").trim().toLowerCase();
  return r === "admin" || r === META_REVIEW_ROLE;
}
