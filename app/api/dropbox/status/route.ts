import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/userAuth";
import { getDropboxTokenRowForSession } from "@/lib/dropbox";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.userId || session.username || "";
  const username = session.username || "";
  if (!userId) {
    return NextResponse.json({ connected: false, reason: "missing_user" });
  }

  try {
    const row = await getDropboxTokenRowForSession({ userId, username });
    if (!row?.refresh_token) {
      return NextResponse.json({ connected: false, reason: "not_connected" });
    }
    return NextResponse.json({
      connected: true,
      email: row.email || null,
      accountId: row.account_id || null,
      connectedAt: row.connected_at || null,
      updatedAt: row.updated_at || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { connected: false, reason: "error", error: e?.message || "Failed to read Dropbox status" },
      { status: 500 }
    );
  }
}
