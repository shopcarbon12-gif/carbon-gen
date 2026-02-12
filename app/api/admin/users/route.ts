import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminSession, normalizeUsername, parseRole } from "@/lib/userAuth";

function userPayload(row: any) {
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

function adminUsersErrorMessage(err: any) {
  const message = String(err?.message || "");
  if (
    message.toLowerCase().includes("relation") &&
    message.toLowerCase().includes("app_users") &&
    message.toLowerCase().includes("does not exist")
  ) {
    return "Missing app_users table. Run scripts/supabase_schema.sql in Supabase SQL editor.";
  }
  return message || "Admin users operation failed";
}

async function roleExists(roleName: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_roles")
    .select("name")
    .eq("name", roleName)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.name);
}

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("app_users")
      .select("id,username,role,is_active,created_at,updated_at")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: (data || []).map(userPayload) });
  } catch (e: any) {
    return NextResponse.json({ error: adminUsersErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const username = normalizeUsername(String(body?.username || ""));
    const password = String(body?.password || "");
    const role = parseRole(body?.role);

    if (!validUsername(username)) {
      return NextResponse.json(
        { error: "Username must be 3-31 chars using letters, numbers, dot, underscore, or dash." },
        { status: 400 }
      );
    }
    if (password.trim().length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!(await roleExists(role))) {
      return NextResponse.json({ error: `Role "${role}" does not exist.` }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("app_users")
      .insert({
        username,
        password_hash: passwordHash,
        role,
        is_active: true,
      })
      .select("id,username,role,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: userPayload(data) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: adminUsersErrorMessage(e) }, { status: 500 });
  }
}
