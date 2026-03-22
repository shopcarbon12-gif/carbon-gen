import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { isRequestAuthed } from "@/lib/auth";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESSIBILITY_FROM_EMAIL = "compliance@carbonjeanscompany.com";
const ACCESSIBILITY_FROM_NAME = "Carbon Compliance";

function buildOrigin(req: NextRequest) {
  const forwardedProto = (req.headers.get("x-forwarded-proto") || "").trim();
  const forwardedHost = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").trim();
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!resendApiKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as {
      to?: unknown;
      scope?: unknown;
      days?: unknown;
    };
    const scope = String(body.scope || "default").trim() || "default";
    const daysRaw = Number(body.days);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.round(daysRaw))) : 30;

    let configuredEmail = "";
    try {
      const settings = await loadAccessibilityWidgetConfig(scope);
      configuredEmail = String(settings.monthlyReportEmail || "").trim().toLowerCase();
    } catch {
      configuredEmail = "";
    }

    const requestedTo = String(body.to || "").trim().toLowerCase();
    const fallbackEmail = String(process.env.ACCESSIBILITY_REPORT_EMAIL || "").trim().toLowerCase();
    const to = EMAIL_REGEX.test(requestedTo)
      ? requestedTo
      : EMAIL_REGEX.test(configuredEmail)
        ? configuredEmail
        : fallbackEmail;

    if (!EMAIL_REGEX.test(to)) {
      return NextResponse.json({ ok: false, error: "A valid recipient email is required." }, { status: 400 });
    }

    const origin = buildOrigin(req);
    const csvUrl = `${origin}/api/accessibility/export?format=csv&scope=${encodeURIComponent(scope)}&days=${days}`;
    const dashboardUrl = `${origin}/accessibility`;
    const resend = new Resend(resendApiKey);

    const subject = `Accessibility log history export for ${scope}`;
    const html = `<!doctype html>
<html>
<body style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#111;">
  <h2 style="margin:0 0 12px;">Accessibility log history export</h2>
  <p style="margin:0 0 16px;">Your export is ready. Use the download link below to retrieve the latest CSV for the <strong>${scope}</strong> scope.</p>
  <p style="margin:0 0 16px;">
    <a href="${csvUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1f2937;color:#fff;text-decoration:none;">Download CSV</a>
  </p>
  <p style="margin:0 0 8px;">CSV link:</p>
  <p style="margin:0 0 16px;word-break:break-all;"><a href="${csvUrl}">${csvUrl}</a></p>
  <p style="margin:0 0 8px;">Admin page:</p>
  <p style="margin:0;word-break:break-all;"><a href="${dashboardUrl}">${dashboardUrl}</a></p>
</body>
</html>`;

    const result = await resend.emails.send({
      from: `${ACCESSIBILITY_FROM_NAME} <${ACCESSIBILITY_FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error.message || "Failed to send email." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sentTo: to,
      downloadUrl: csvUrl,
      messageId: result.data?.id || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send log history email.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
