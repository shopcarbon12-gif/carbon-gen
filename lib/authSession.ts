import type { NextRequest } from "next/server";
import { normalizeUsername, parseRole } from "@/lib/authRoleConstants";

export function readSession(req: NextRequest) {
  const bypass =
    process.env.NODE_ENV !== "production" &&
    (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true";
  const isAuthed = bypass || req.cookies.get("carbon_gen_auth_v1")?.value === "true";
  const userId = String(req.cookies.get("carbon_gen_user_id")?.value || "").trim();
  const username = normalizeUsername(String(req.cookies.get("carbon_gen_username")?.value || ""));
  const role = bypass ? "admin" : parseRole(req.cookies.get("carbon_gen_user_role")?.value || "");
  return { isAuthed, userId, username, role };
}

export function isAdminSession(req: NextRequest) {
  const bypass =
    process.env.NODE_ENV !== "production" &&
    (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true";
  if (bypass) return true;
  const session = readSession(req);
  return session.isAuthed && session.role === "admin";
}
