import bcrypt from "bcryptjs";
import { countActiveAdmins, findUserByUsername } from "@/lib/authRepository";
import type { AppRole } from "@/lib/authRoleConstants";
import { normalizeUsername } from "@/lib/authRoleConstants";

export type { AppRole };
export {
  META_REVIEW_ROLE,
  normalizeUsername,
  parseRole,
  canManageInstagramSection,
  isMetaReviewRole,
} from "@/lib/authRoleConstants";
export { readSession, isAdminSession } from "@/lib/authSession";

export type AppUserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: AppRole;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export async function getUserByUsername(username: string): Promise<AppUserRow | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const row = await findUserByUsername(normalized);
  return (row as AppUserRow | null) || null;
}

export async function authenticateUser(username: string, password: string): Promise<AppUserRow | null> {
  const user = await getUserByUsername(username);
  if (!user || !user.is_active) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

export async function countAdmins(): Promise<number> {
  return countActiveAdmins();
}
