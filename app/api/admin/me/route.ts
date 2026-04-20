import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  sessionAllowsAppPermission,
  sessionCanManageRoles,
  sessionCanManageUsers,
} from "@/lib/roleAccess";
import { readSession } from "@/lib/userAuth";
import { WORKSPACE_PAGE_CATALOG, pagePermissionKeyFor } from "@/lib/workspacePageCatalog";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [manageUsers, manageRoles] = await Promise.all([
    sessionCanManageUsers(req),
    sessionCanManageRoles(req),
  ]);
  const pagePermissionEntries = await Promise.all(
    WORKSPACE_PAGE_CATALOG.map(async (page) => {
      const key = pagePermissionKeyFor(page.id);
      const allowed = await sessionAllowsAppPermission(req, key);
      return [page.id, allowed] as const;
    })
  );
  const pagePermissions = Object.fromEntries(pagePermissionEntries);
  const allowedPageIds = WORKSPACE_PAGE_CATALOG.filter((p) => Boolean(pagePermissions[p.id])).map((p) => p.id);

  return NextResponse.json({
    user: {
      id: session.userId || null,
      username: session.username || null,
      role: session.role || "user",
    },
    capabilities: {
      manageUsers,
      manageRoles,
    },
    pagePermissions,
    allowedPageIds,
  });
}
