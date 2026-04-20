import "server-only";

import type { NextRequest } from "next/server";
import { fetchRolePermissionAllowed } from "@/lib/authRepository";
import { readSession } from "@/lib/authSession";
import { isMetaReviewRole } from "@/lib/authRoleConstants";
import { defaultAllowedForRole } from "@/lib/rolePermissions";

export async function sessionAllowsAppPermission(req: NextRequest, permissionKey: string): Promise<boolean> {
  const session = readSession(req);
  if (!session.isAuthed) return false;
  if (isMetaReviewRole(session.role)) return false;
  const role = String(session.role || "").trim().toLowerCase();
  if (role === "admin") return true;

  const explicit = await fetchRolePermissionAllowed(role, permissionKey);
  if (explicit !== undefined) return explicit;
  return defaultAllowedForRole(role, permissionKey);
}

export async function sessionCanManageUsers(req: NextRequest): Promise<boolean> {
  return sessionAllowsAppPermission(req, "admin.users");
}

export async function sessionCanManageRoles(req: NextRequest): Promise<boolean> {
  return sessionAllowsAppPermission(req, "admin.roles");
}
