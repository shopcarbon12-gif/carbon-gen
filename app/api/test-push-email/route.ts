import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed, isCronAuthed } from "@/lib/auth";
import { sendPushNotificationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/test-push-email
 * Sends a sample failure email to PUSH_NOTIFICATION_EMAIL or elior@carbonjeanscompany.com.
 * Requires auth (session cookie) or ?secret=CRON_SECRET
 */
export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req) && !isCronAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const toParam = req.nextUrl.searchParams.get("to")?.trim();
  const to =
    toParam ||
    (process.env.PUSH_NOTIFICATION_EMAIL || "").trim() ||
    "elior@carbonjeanscompany.com";

  const result = await sendPushNotificationEmail({
    to,
    shop: "30e7d3.myshopify.com",
    success: false,
    pushed: 0,
    totalVariants: 0,
    markedProcessed: 0,
    removedFromShopify: 0,
    error: `Error: Request timed out
[code: ABORT_ERR]

Stack:
Error: The operation was aborted
    at fetch (node:internal/deps/undici/undici:14676:11)
    at async fetchWithTimeout...
---

This is a test failure email. Your push notification setup is working.`,
    items: [],
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Failed to send test email", details: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Test failure email sent to ${to}`,
  });
}
