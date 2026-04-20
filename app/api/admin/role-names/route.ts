import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listRoles } from "@/lib/authRepository";
import { isSuperAdminRole } from "@/lib/authRoleConstants";
import { sessionCanManageUsers } from "@/lib/roleAccess";

export async function GET(req: NextRequest) {
  if (!(await sessionCanManageUsers(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const roles = await listRoles();
    const names = roles
      .map((r) => String(r.name || "").trim())
      .filter(Boolean)
      .filter((name) => !isSuperAdminRole(name));
    return NextResponse.json({ names: names.sort() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list roles." }, { status: 500 });
  }
}
