export type AppRole = string;

/** Meta App Review: dashboard access limited to Instagram widget routes + allowlisted APIs. */
export const META_REVIEW_ROLE = "meta_review";
export const SUPER_ADMIN_ROLE = "superadmin";

/** Canonical username for the Meta App Review test account (seed + login hints). */
export const META_REVIEW_LOGIN_USERNAME = "meta-review@shopcarbon.com";

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

export function isSuperAdminRole(role: unknown) {
  const r = String(role || "").trim().toLowerCase();
  return r === SUPER_ADMIN_ROLE || r === "super_admin" || r === "super-admin";
}

/**
 * Roles that bypass the permission matrix and receive every app capability
 * (same behavior as the built-in `admin` role). Add aliases here (e.g. `superadmin`).
 */
const FULL_ACCESS_ROLES = new Set(["admin", SUPER_ADMIN_ROLE]);

export function hasFullAppAccess(role: unknown): boolean {
  const r = String(role || "").trim().toLowerCase();
  return FULL_ACCESS_ROLES.has(r);
}

/** Instagram section config + hero APIs (studio), not full admin. */
export function canManageInstagramSection(session: { isAuthed: boolean; role: string }) {
  if (!session.isAuthed) return false;
  const r = String(session.role || "").trim().toLowerCase();
  return hasFullAppAccess(r) || r === META_REVIEW_ROLE;
}
