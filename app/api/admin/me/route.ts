import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/userAuth";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.userId || null,
      username: session.username || null,
      role: session.role || "user",
    },
  });
}
