import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { readAccessibilityLawWatchState } from "@/lib/accessibilityLawWatchState";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const state = readAccessibilityLawWatchState();
  return NextResponse.json({ ok: true, state });
}

