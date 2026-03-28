import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/authSession";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    role: session.role,
    username: session.username,
  });
}
