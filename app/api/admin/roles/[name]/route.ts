import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { countUsersWithRole, deleteRole, touchRoleUpdatedAt, upsertRolePermissions } from "@/lib/authRepository";
import { isSuperAdminRole } from "@/lib/authRoleConstants";
import { normalizeRoleName, PERMISSION_OPTIONS, SYSTEM_ROLES } from "@/lib/rolePermissions";
import { sessionCanManageRoles } from "@/lib/roleAccess";

function validPermissionKey(key: string) {
  return PERMISSION_OPTIONS.some((p) => p.key === key);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!(await sessionCanManageRoles(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { name } = await params;
    const roleName = normalizeRoleName(name);
    if (!roleName) {
      return NextResponse.json({ error: "Invalid role name." }, { status: 400 });
    }
    if (isSuperAdminRole(roleName)) {
      return NextResponse.json({ error: "superadmin permissions are locked and cannot be changed." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const permissions = body?.permissions;
    if (!permissions || typeof permissions !== "object") {
      return NextResponse.json({ error: "permissions object is required." }, { status: 400 });
    }

    const updates = Object.entries(permissions)
      .map(([key, value]) => ({ key: String(key), value: Boolean(value) }))
      .filter((entry) => validPermissionKey(entry.key));
    if (!updates.length) {
      return NextResponse.json({ error: "No valid permission keys supplied." }, { status: 400 });
    }

    const payload = updates.map((u) => ({
      role_name: roleName,
      permission_key: u.key,
      allowed: u.value,
    }));
    await upsertRolePermissions(payload);

    await touchRoleUpdatedAt(roleName);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update role permissions." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!(await sessionCanManageRoles(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { name } = await params;
    const roleName = normalizeRoleName(name);
    if (!roleName) {
      return NextResponse.json({ error: "Invalid role name." }, { status: 400 });
    }
    if (isSuperAdminRole(roleName)) {
      return NextResponse.json({ error: "superadmin role is locked and cannot be deleted." }, { status: 403 });
    }
    if (SYSTEM_ROLES.includes(roleName as any)) {
      return NextResponse.json({ error: "System roles cannot be deleted." }, { status: 400 });
    }

    const assigned = await countUsersWithRole(roleName);
    if (assigned > 0) {
      return NextResponse.json(
        { error: `Cannot delete role "${roleName}" while ${assigned} user(s) still have it.` },
        { status: 400 }
      );
    }
    await deleteRole(roleName);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete role." }, { status: 500 });
  }
}

