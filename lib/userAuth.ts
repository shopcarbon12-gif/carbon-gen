import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type AppRole = string;

export type AppUserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: AppRole;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export function normalizeUsername(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function parseRole(value: unknown): AppRole {
  const v = String(value || "").trim().toLowerCase();
  return v || "user";
}

export function readSession(req: NextRequest) {
  const bypass = (process.env.AUTH_BYPASS || "true").trim().toLowerCase() === "true";
  const isAuthed = bypass || req.cookies.get("carbon_gen_auth_v1")?.value === "true";
  const userId = String(req.cookies.get("carbon_gen_user_id")?.value || "").trim();
  const username = normalizeUsername(String(req.cookies.get("carbon_gen_username")?.value || ""));
  const role = bypass ? "admin" : parseRole(req.cookies.get("carbon_gen_user_role")?.value || "");
  return { isAuthed, userId, username, role };
}

export function isAdminSession(req: NextRequest) {
  const bypass = (process.env.AUTH_BYPASS || "true").trim().toLowerCase() === "true";
  if (bypass) return true;
  const session = readSession(req);
  return session.isAuthed && session.role === "admin";
}

export async function getUserByUsername(username: string): Promise<AppUserRow | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,username,password_hash,role,is_active,created_at,updated_at")
    .eq("username", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AppUserRow | null) || null;
}

export async function authenticateUser(username: string, password: string): Promise<AppUserRow | null> {
  const user = await getUserByUsername(username);
  if (!user || !user.is_active) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

export async function countAdmins(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("app_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return count || 0;
}
