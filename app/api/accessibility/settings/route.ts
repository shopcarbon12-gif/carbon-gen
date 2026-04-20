import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { hasFullAppAccess, readSession } from "@/lib/userAuth";
import {
  loadAccessibilityWidgetConfig,
  upsertAccessibilityWidgetConfig,
} from "@/lib/accessibilityConfigRepository";

export const runtime = "nodejs";
export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function parseScope(req: NextRequest) {
  try {
    const url = new URL(req.url);
    return (url.searchParams.get("scope") || "default").trim() || "default";
  } catch {
    return "default";
  }
}

export async function GET(req: NextRequest) {
  // Public read: same config served by /accessibility/widget; needed for anonymous builder page.
  try {
    const scope = parseScope(req);
    const config = await loadAccessibilityWidgetConfig(scope);
    return NextResponse.json({ ok: true, scope, config });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isRequestAuthed(req)) return unauthorized();
  const session = readSession(req);
  if (!session.isAuthed || !hasFullAppAccess(session.role)) {
    return NextResponse.json(
      { ok: false, error: "Forbidden: full-access role required to update accessibility settings" },
      { status: 403 }
    );
  }
  try {
    const scope = parseScope(req);
    const body = (await req.json()) as { config?: unknown };
    const rawConfig = body?.config;
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      return NextResponse.json({ ok: false, error: "Invalid config payload" }, { status: 400 });
    }
    await upsertAccessibilityWidgetConfig(rawConfig as Record<string, unknown>, scope);
    return NextResponse.json({ ok: true, scope });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

