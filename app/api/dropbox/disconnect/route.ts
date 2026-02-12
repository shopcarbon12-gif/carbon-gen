import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/userAuth";
import { deleteDropboxToken } from "@/lib/dropbox";

export async function POST(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.userId || session.username || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing session user id." }, { status: 400 });
  }

  try {
    await deleteDropboxToken(userId);
    return NextResponse.json({ disconnected: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to disconnect Dropbox." }, { status: 500 });
  }
}

