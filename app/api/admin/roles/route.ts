import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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
    return "Missing roles tables. Run scripts/supabase_schema.sql in Supabase SQL editor.";
  }
  return message || "Roles operation failed.";
}

async function seedSystemRoles() {
  const supabase = getSupabaseAdmin();

  const rolesPayload = SYSTEM_ROLES.map((name) => ({ name, is_system: true }));
  const { error: roleErr } = await supabase.from("app_roles").upsert(rolesPayload, {
    onConflict: "name",
    ignoreDuplicates: false,
  });
  if (roleErr) throw new Error(roleErr.message);

  const permsPayload = SYSTEM_ROLES.flatMap((roleName) =>
    PERMISSION_OPTIONS.map((perm) => ({
      role_name: roleName,
      permission_key: perm.key,
      allowed: defaultAllowedForRole(roleName, perm.key),
    }))
  );
  const { error: permErr } = await supabase.from("app_role_permissions").upsert(permsPayload, {
    onConflict: "role_name,permission_key",
    ignoreDuplicates: false,
  });
  if (permErr) throw new Error(permErr.message);
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await seedSystemRoles();
    const supabase = getSupabaseAdmin();
    const [{ data: roles, error: rolesErr }, { data: perms, error: permsErr }] = await Promise.all([
      supabase.from("app_roles").select("name,is_system,created_at,updated_at").order("name"),
      supabase.from("app_role_permissions").select("role_name,permission_key,allowed"),
    ]);
    if (rolesErr) throw new Error(rolesErr.message);
    if (permsErr) throw new Error(permsErr.message);

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

    const supabase = getSupabaseAdmin();
    const { error: insertErr } = await supabase
      .from("app_roles")
      .insert({ name, is_system: false });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const sourcePermissions: Record<string, boolean> = {};
    if (cloneFrom) {
      const { data } = await supabase
        .from("app_role_permissions")
        .select("permission_key,allowed")
        .eq("role_name", cloneFrom);
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
    const { error: permErr } = await supabase.from("app_role_permissions").upsert(payload, {
      onConflict: "role_name,permission_key",
      ignoreDuplicates: false,
    });
    if (permErr) throw new Error(permErr.message);

    return NextResponse.json({ ok: true, role: name }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: missingTablesMessage(e) }, { status: 500 });
  }
}
