import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import {
  getAccessibilityUsageSummary,
  recordAccessibilityUsageEvent,
} from "@/lib/accessibilityUsageRepository";

export const runtime = "nodejs";
export const maxDuration = 30;

function normalizeScope(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "default";
}

function normalizeEventName(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || "unknown";
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      scope?: unknown;
      eventName?: unknown;
      payload?: unknown;
    };
    const eventName = normalizeEventName(body.eventName);
    if (!eventName || eventName === "unknown") {
      return NextResponse.json({ ok: false, error: "eventName is required" }, { status: 400 });
    }

    await recordAccessibilityUsageEvent({
      scope: normalizeScope(body.scope),
      eventName,
      payload: normalizePayload(body.payload),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid usage payload" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const days = Number.parseInt(url.searchParams.get("days") || "30", 10);
  const summary = await getAccessibilityUsageSummary(Number.isFinite(days) ? days : 30);
  return NextResponse.json({ ok: true, summary });
}

