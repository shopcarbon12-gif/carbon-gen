import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  createUser,
  findUserByUsername,
  updateUserById,
  upsertRoles,
} from "@/lib/authRepository";
import { META_REVIEW_LOGIN_USERNAME, normalizeUsername } from "@/lib/authRoleConstants";

const ROLE = "meta_review";

export type EnsureMetaReviewUserResult = { ok: true; action: "created" | "updated" };

/**
 * Idempotent: creates or updates the Meta App Review dashboard user in Postgres.
 */
export async function ensureMetaReviewUser(plainPassword: string): Promise<EnsureMetaReviewUserResult> {
  const password = String(plainPassword || "").trim();
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  await upsertRoles([{ name: ROLE, is_system: true }]);

  const username = normalizeUsername(META_REVIEW_LOGIN_USERNAME);
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await findUserByUsername(username);

  if (existing) {
    await updateUserById(existing.id, {
      password_hash: passwordHash,
      role: ROLE,
      is_active: true,
    });
    return { ok: true, action: "updated" };
  }

  await createUser({
    username,
    password_hash: passwordHash,
    role: ROLE,
    is_active: true,
  });
  return { ok: true, action: "created" };
}

export function constantTimeBearerMatches(expectedSecret: string, authHeader: string | null): boolean {
  const secret = String(expectedSecret || "").trim();
  if (!secret) return false;
  const raw = String(authHeader || "").trim();
  const prefix = "Bearer ";
  if (!raw.toLowerCase().startsWith(prefix.toLowerCase())) return false;
  const token = raw.slice(prefix.length).trim();
  if (!token) return false;
  try {
    const a = Buffer.from(secret, "utf8");
    const b = Buffer.from(token, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
