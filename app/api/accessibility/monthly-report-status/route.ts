import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { readAccessibilityMonthlyReportState } from "@/lib/accessibilityMonthlyReportState";

export const runtime = "nodejs";
const ACCESSIBILITY_FROM_EMAIL = "compliance@carbonjeanscompany.com";
const ACCESSIBILITY_FROM_NAME = "Carbon Compliance";

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const state = readAccessibilityMonthlyReportState();
  const service = {
    configured: Boolean((process.env.RESEND_API_KEY || "").trim()),
    fromEmail: ACCESSIBILITY_FROM_EMAIL,
    fromName: ACCESSIBILITY_FROM_NAME,
  };
  return NextResponse.json({ ok: true, state, service });
}
