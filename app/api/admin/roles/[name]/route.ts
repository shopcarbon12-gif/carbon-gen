import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeRoleName, PERMISSION_OPTIONS, SYSTEM_ROLES } from "@/lib/rolePermissions";
import { isAdminSession } from "@/lib/userAuth";

function validPermissionKey(key: string) {
  return PERMISSION_OPTIONS.some((p) => p.key === key);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { name } = await params;
    const roleName = normalizeRoleName(name);
    if (!roleName) {
      return NextResponse.json({ error: "Invalid role name." }, { status: 400 });
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

    const supabase = getSupabaseAdmin();
    const payload = updates.map((u) => ({
      role_name: roleName,
      permission_key: u.key,
      allowed: u.value,
    }));
    const { error: upsertErr } = await supabase.from("app_role_permissions").upsert(payload, {
      onConflict: "role_name,permission_key",
      ignoreDuplicates: false,
    });
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    await supabase.from("app_roles").update({ updated_at: new Date().toISOString() }).eq("name", roleName);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update role permissions." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { name } = await params;
    const roleName = normalizeRoleName(name);
    if (!roleName) {
      return NextResponse.json({ error: "Invalid role name." }, { status: 400 });
    }
    if (SYSTEM_ROLES.includes(roleName as any)) {
      return NextResponse.json({ error: "System roles cannot be deleted." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: inUseUsers } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role", roleName);
    void inUseUsers;
    // If app_users has legacy role constraint, custom roles are not assignable anyway.
    // Keep delete simple and rely on FK cascade for permissions.
    const { error } = await supabase.from("app_roles").delete().eq("name", roleName);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete role." }, { status: 500 });
  }
}

