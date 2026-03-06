import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { insertRole, listRolePermissions, listRoles, upsertRolePermissions, upsertRoles } from "@/lib/authRepository";
import {
  defaultAllowedForRole,
  normalizeRoleName,
  PERMISSION_OPTIONS,
  SYSTEM_ROLES,
} from "@/lib/rolePermissions";
import { isAdminSession } from "@/lib/userAuth";

function missingTablesMessage(err: unknown) {
  const message = String((err as any)?.message || "");
  const low = message.toLowerCase();
  if (low.includes("app_roles") || low.includes("app_role_permissions")) {
    return "Missing roles tables. Run SQL auth bootstrap/migrations.";
  }
  return message || "Roles operation failed.";
}

async function seedSystemRoles() {
  const rolesPayload = SYSTEM_ROLES.map((name) => ({ name, is_system: true }));
  await upsertRoles(rolesPayload);

  const permsPayload = SYSTEM_ROLES.flatMap((roleName) =>
    PERMISSION_OPTIONS.map((perm) => ({
      role_name: roleName,
      permission_key: perm.key,
      allowed: defaultAllowedForRole(roleName, perm.key),
    }))
  );
  await upsertRolePermissions(permsPayload);
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await seedSystemRoles();
    const [roles, perms] = await Promise.all([listRoles(), listRolePermissions()]);

    const permissionsByRole: Record<string, Record<string, boolean>> = {};
    for (const role of roles || []) {
      permissionsByRole[String((role as any).name || "")] = {};
    }
    for (const row of perms || []) {
      const roleName = String((row as any).role_name || "");
      const key = String((row as any).permission_key || "");
      if (!permissionsByRole[roleName]) permissionsByRole[roleName] = {};
      permissionsByRole[roleName][key] = Boolean((row as any).allowed);
    }

    return NextResponse.json({
      permissions: PERMISSION_OPTIONS,
      roles: (roles || []).map((r: any) => ({
        name: String(r?.name || ""),
        isSystem: Boolean(r?.is_system),
        createdAt: r?.created_at || null,
        updatedAt: r?.updated_at || null,
        permissions: permissionsByRole[String(r?.name || "")] || {},
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: missingTablesMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await seedSystemRoles();
    const body = await req.json().catch(() => ({}));
    const name = normalizeRoleName(body?.name);
    const cloneFrom = normalizeRoleName(body?.cloneFrom);
    if (!name) {
      return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9_-]{1,30}$/.test(name)) {
      return NextResponse.json(
        { error: "Role name must be 2-31 chars using lowercase letters, numbers, underscore, or dash." },
        { status: 400 }
      );
    }

    await insertRole(name, false);

    const sourcePermissions: Record<string, boolean> = {};
    if (cloneFrom) {
      const data = await listRolePermissions(cloneFrom);
      for (const row of data || []) {
        sourcePermissions[String((row as any).permission_key || "")] = Boolean((row as any).allowed);
      }
    }

    const payload = PERMISSION_OPTIONS.map((perm) => ({
      role_name: name,
      permission_key: perm.key,
      allowed: Object.prototype.hasOwnProperty.call(sourcePermissions, perm.key)
        ? Boolean(sourcePermissions[perm.key])
        : false,
    }));
    await upsertRolePermissions(payload);

    return NextResponse.json({ ok: true, role: name }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: missingTablesMessage(e) }, { status: 500 });
  }
}
