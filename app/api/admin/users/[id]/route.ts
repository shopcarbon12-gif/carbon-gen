import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { deleteUserById, findUserById, roleExists, updateUserById } from "@/lib/authRepository";
import { countAdmins, isAdminSession, normalizeUsername, parseRole, readSession } from "@/lib/userAuth";

function toUser(row: any) {
  return {
    id: String(row?.id || ""),
    username: normalizeUsername(String(row?.username || "")),
    role: parseRole(row?.role),
    isActive: Boolean(row?.is_active),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
}

function validUsername(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,30}$/.test(value);
}

function parseRoleInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v || null;
}

function adminUsersErrorMessage(err: any) {
  const message = String(err?.message || "");
  if (
    message.toLowerCase().includes("relation") &&
    message.toLowerCase().includes("app_users") &&
    message.toLowerCase().includes("does not exist")
  ) {
    return "Missing app_users table. Run SQL auth bootstrap/migrations.";
  }
  return message || "Admin users operation failed";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const session = readSession(req);

    const target = await findUserById(id);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    if (typeof body?.username === "string") {
      const username = normalizeUsername(body.username);
      if (!validUsername(username)) {
        return NextResponse.json(
          { error: "Username must be 3-31 chars using letters, numbers, dot, underscore, or dash." },
          { status: 400 }
        );
      }
      updates.username = username;
    }

    if (Object.prototype.hasOwnProperty.call(body, "role")) {
      const role = parseRoleInput(body.role);
      if (!role) {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      if (!(await roleExists(role))) {
        return NextResponse.json({ error: `Role "${role}" does not exist.` }, { status: 400 });
      }
      updates.role = role;
    }

    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
      updates.is_active = Boolean(body.isActive);
    }

    if (typeof body?.password === "string" && body.password.trim()) {
      const password = body.password.trim();
      if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
      }
      updates.password_hash = await bcrypt.hash(password, 12);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No update fields provided." }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const targetIsActiveAdmin = target.role === "admin" && target.is_active === true;
    const willDemoteAdmin = targetIsActiveAdmin && updates.role && updates.role !== "admin";
    const willDeactivateAdmin = targetIsActiveAdmin && updates.is_active === false;

    if ((willDemoteAdmin || willDeactivateAdmin) && target.id === session.userId) {
      return NextResponse.json(
        { error: "You cannot remove your own active admin access in this session." },
        { status: 400 }
      );
    }

    if (willDemoteAdmin || willDeactivateAdmin) {
      const admins = await countAdmins();
      if (admins <= 1) {
        return NextResponse.json({ error: "At least one active admin must remain." }, { status: 400 });
      }
    }

    const data = await updateUserById(id, updates);
    return NextResponse.json({ user: toUser(data) });
  } catch (e: any) {
    return NextResponse.json({ error: adminUsersErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const session = readSession(req);
    if (id === session.userId) {
      return NextResponse.json({ error: "You cannot delete your own active account." }, { status: 400 });
    }

    const target = await findUserById(id);
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role === "admin" && target.is_active) {
      const admins = await countAdmins();
      if (admins <= 1) {
        return NextResponse.json({ error: "At least one active admin must remain." }, { status: 400 });
      }
    }

    await deleteUserById(id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: adminUsersErrorMessage(e) }, { status: 500 });
  }
}
