import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { isRequestAuthed } from "@/lib/auth";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";
import { getAccessibilityUsageSummary } from "@/lib/accessibilityUsageRepository";
import { writeAccessibilityMonthlyReportState } from "@/lib/accessibilityMonthlyReportState";
import { upsertAccessibilityChecklistHistory } from "@/lib/accessibilityChecklistHistory";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_REPORT_EMAIL = "elior@carbonjeanscompany.com";
const DEFAULT_STATEMENT_URL = "https://www.shopcarbon.com/pages/accessibility";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESSIBILITY_FROM_EMAIL = "compliance@carbonjeanscompany.com";
const ACCESSIBILITY_FROM_NAME = "Carbon Compliance";
const CHECKLIST_LABELS: Array<{ key: string; label: string }> = [
  { key: "statementPublished", label: "Accessibility statement published" },
  { key: "issueChannelActive", label: "Issue channel active" },
  { key: "ownerAssigned", label: "Accessibility owner assigned" },
  { key: "responseSlaDefined", label: "Response SLA defined" },
  { key: "remediationLogActive", label: "Remediation log active" },
  { key: "keyboardAuditDone", label: "Keyboard audit completed" },
  { key: "contrastAuditDone", label: "Contrast audit completed" },
  { key: "altTextAuditDone", label: "Alt text audit completed" },
  { key: "formsAuditDone", label: "Forms audit completed" },
  { key: "captionsAuditDone", label: "Captions/transcripts audit completed" },
  { key: "monthlyRetestDone", label: "Monthly retest and evidence logged" },
];

function isAuthorized(req: NextRequest) {
  if (isRequestAuthed(req)) return true;
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = (req.headers.get("authorization") || "").trim();
  if (auth === `Bearer ${secret}`) return true;
  const xCron = (req.headers.get("x-cron-secret") || "").trim();
  if (xCron === secret) return true;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") === secret) return true;
  } catch {
    // ignore malformed URL
  }
  return false;
}

function buildMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendFailureWebhook(args: {
  reportTo: string;
  monthLabel: string;
  error: string;
}) {
  const webhookUrl = (process.env.ACCESSIBILITY_ALERT_WEBHOOK_URL || "").trim();
  if (!webhookUrl) return { ok: false as const, skipped: true };
  const message = [
    "Accessibility monthly report failed.",
    `Month: ${args.monthLabel}`,
    `Recipient: ${args.reportTo}`,
    `Error: ${args.error}`,
  ].join("\n");
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message,
        event: "accessibility_monthly_report_failure",
        month: args.monthLabel,
        recipient: args.reportTo,
        error: args.error,
        timestamp: new Date().toISOString(),
      }),
    });
    return { ok: res.ok as boolean, skipped: false as const, status: res.status };
  } catch {
    return { ok: false as const, skipped: false as const };
  }
}

async function handleAccessibilityMonthlyReport(req: NextRequest): Promise<NextResponse> {
  const requestedTo = (new URL(req.url).searchParams.get("to") || "").trim();
  let savedConfig: Record<string, unknown> = {};
  try {
    savedConfig = await loadAccessibilityWidgetConfig("default");
  } catch {
    savedConfig = {};
  }

  const savedMonthlyReportEmail = String(savedConfig.monthlyReportEmail ?? "").trim();
  const savedStatementUrl = String(savedConfig.statementUrl ?? "").trim();
  const savedFeedbackUrl = String(savedConfig.feedbackUrl ?? "").trim();
  const savedSupportEmail = String(savedConfig.supportEmail ?? "").trim();
  const savedAccessibilityOwner = String(savedConfig.accessibilityOwner ?? "").trim();
  const savedAccessibilityOwnerRole = String(savedConfig.accessibilityOwnerRole ?? "").trim();
  const savedRemediationLogUrl = String(savedConfig.remediationLogUrl ?? "").trim();
  const savedResponseSlaHoursRaw = Number(savedConfig.responseSlaHours ?? 0);
  const savedResponseSlaHours =
    Number.isFinite(savedResponseSlaHoursRaw) && savedResponseSlaHoursRaw > 0
      ? Math.round(savedResponseSlaHoursRaw)
      : 0;
  const savedChecklistRaw =
    savedConfig.complianceChecklist &&
    typeof savedConfig.complianceChecklist === "object" &&
    !Array.isArray(savedConfig.complianceChecklist)
      ? (savedConfig.complianceChecklist as Record<string, unknown>)
      : {};

  const reportTo =
    (EMAIL_REGEX.test(requestedTo) ? requestedTo : "") ||
    (EMAIL_REGEX.test(savedMonthlyReportEmail) ? savedMonthlyReportEmail : "") ||
    (process.env.ACCESSIBILITY_REPORT_EMAIL || "").trim() ||
    DEFAULT_REPORT_EMAIL;
  const statementUrl =
    savedStatementUrl || (process.env.ACCESSIBILITY_STATEMENT_URL || "").trim() || DEFAULT_STATEMENT_URL;
  const feedbackUrl = savedFeedbackUrl || (process.env.ACCESSIBILITY_FEEDBACK_URL || "").trim();
  const supportEmail =
    (EMAIL_REGEX.test(savedSupportEmail) ? savedSupportEmail : "") ||
    (process.env.ACCESSIBILITY_SUPPORT_EMAIL || "").trim() ||
    reportTo;

  const now = new Date();
  const monthLabel = buildMonthLabel(now);
  const usageSummary = await getAccessibilityUsageSummary(30);
  const usageRows = usageSummary.byEvent
    .slice(0, 8)
    .map(
      (entry) =>
        `<tr><td style="border:1px solid #ddd; padding:6px;">${escapeHtml(entry.eventName)}</td><td style="border:1px solid #ddd; padding:6px; text-align:right;">${entry.count}</td></tr>`
    )
    .join("");
  const checklistRows = CHECKLIST_LABELS.map((item) => {
    const done = Boolean(savedChecklistRaw[item.key]);
    const statusText = done ? "Done" : "Pending";
    const statusColor = done ? "#166534" : "#92400e";
    return `<tr><td style="border:1px solid #ddd; padding:6px;">${escapeHtml(item.label)}</td><td style="border:1px solid #ddd; padding:6px; color:${statusColor};">${statusText}</td></tr>`;
  }).join("");
  const checklistDone = CHECKLIST_LABELS.filter((item) => Boolean(savedChecklistRaw[item.key])).length;
  const checklistTotal = CHECKLIST_LABELS.length;
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const historyEntryBase = {
    month: monthLabel,
    completed: checklistDone,
    total: checklistTotal,
    percent: checklistPercent,
    sentAt: now.toISOString(),
  };
  const subject = `Monthly Accessibility Compliance Review - ${monthLabel}`;
  const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!resendApiKey) {
    upsertAccessibilityChecklistHistory({ ...historyEntryBase, ok: false });
    writeAccessibilityMonthlyReportState({
      sentAt: now.toISOString(),
      sentTo: reportTo,
      month: monthLabel,
      messageId: null,
      ok: false,
      error: "RESEND_API_KEY not configured",
    });
    await sendFailureWebhook({
      reportTo,
      monthLabel,
      error: "RESEND_API_KEY not configured",
    });
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: Arial, sans-serif; color: #111; max-width: 780px; margin: 0 auto; padding: 20px;">
  <h2 style="margin:0 0 12px;">Monthly Accessibility Compliance Review</h2>
  <p style="margin:0 0 14px;">This is your scheduled monthly reminder for U.S.-wide ADA/WCAG readiness.</p>

  <table cellpadding="8" cellspacing="0" style="border-collapse:collapse; margin: 0 0 14px; width:100%;">
    <tr><td style="border:1px solid #ddd;"><strong>Period</strong></td><td style="border:1px solid #ddd;">${escapeHtml(monthLabel)}</td></tr>
    <tr><td style="border:1px solid #ddd;"><strong>Accessibility statement</strong></td><td style="border:1px solid #ddd;"><a href="${escapeHtml(statementUrl)}">${escapeHtml(statementUrl)}</a></td></tr>
    <tr><td style="border:1px solid #ddd;"><strong>Issue reporting URL</strong></td><td style="border:1px solid #ddd;">${feedbackUrl ? `<a href="${escapeHtml(feedbackUrl)}">${escapeHtml(feedbackUrl)}</a>` : "Not configured"}</td></tr>
    <tr><td style="border:1px solid #ddd;"><strong>Issue reporting email</strong></td><td style="border:1px solid #ddd;">${escapeHtml(supportEmail)}</td></tr>
    <tr><td style="border:1px solid #ddd;"><strong>Accessibility owner</strong></td><td style="border:1px solid #ddd;">${savedAccessibilityOwner ? escapeHtml(savedAccessibilityOwner) : "Not configured"}${savedAccessibilityOwnerRole ? ` (${escapeHtml(savedAccessibilityOwnerRole)})` : ""}</td></tr>
    <tr><td style="border:1px solid #ddd;"><strong>Response SLA</strong></td><td style="border:1px solid #ddd;">${savedResponseSlaHours > 0 ? `${savedResponseSlaHours} hours` : "Not configured"}</td></tr>
    <tr><td style="border:1px solid #ddd;"><strong>Remediation log</strong></td><td style="border:1px solid #ddd;">${savedRemediationLogUrl ? `<a href="${escapeHtml(savedRemediationLogUrl)}">${escapeHtml(savedRemediationLogUrl)}</a>` : "Not configured"}</td></tr>
  </table>

  <h3 style="margin:16px 0 8px;">Review checklist</h3>
  <ul style="margin:0 0 14px; padding-left:18px; line-height:1.5;">
    <li>Re-run critical flow checks (home, collection, PDP, cart, checkout handoff)</li>
    <li>Validate keyboard-only navigation and focus visibility</li>
    <li>Review contrast, alt text quality, and form error messaging</li>
    <li>Confirm complaint channel works and responses are tracked</li>
    <li>Log remediations and re-test evidence</li>
  </ul>

  <h3 style="margin:16px 0 8px;">Checklist tracker status</h3>
  <p style="margin:0 0 8px;">Completion: <strong>${checklistDone}/${checklistTotal} (${checklistPercent}%)</strong></p>
  <table style="border-collapse:collapse; width:100%; max-width:620px; margin:0 0 8px;">
    <thead><tr><th style="border:1px solid #ddd; padding:6px; text-align:left;">Task</th><th style="border:1px solid #ddd; padding:6px; text-align:left;">Status</th></tr></thead>
    <tbody>${checklistRows}</tbody>
  </table>

  <h3 style="margin:16px 0 8px;">Widget usage snapshot (last 30 days)</h3>
  <p style="margin:0 0 8px;">Total events tracked: <strong>${usageSummary.totalEvents}</strong></p>
  ${
    usageRows
      ? `<table style="border-collapse:collapse; width:100%; max-width:480px;">
          <thead><tr><th style="border:1px solid #ddd; padding:6px; text-align:left;">Event</th><th style="border:1px solid #ddd; padding:6px; text-align:right;">Count</th></tr></thead>
          <tbody>${usageRows}</tbody>
        </table>`
      : `<p style="margin:0 0 8px;">No usage events were recorded yet.</p>`
  }

  <p style="margin:0; color:#555; font-size:12px;">Triggered by <code>/api/cron/accessibility-monthly-report</code>.</p>
</body>
</html>`;

  const resend = new Resend(resendApiKey);
  const result = await resend.emails.send({
    from: `${ACCESSIBILITY_FROM_NAME} <${ACCESSIBILITY_FROM_EMAIL}>`,
    to: reportTo,
    subject,
    html,
  });

  if (result.error) {
    upsertAccessibilityChecklistHistory({ ...historyEntryBase, ok: false });
    writeAccessibilityMonthlyReportState({
      sentAt: now.toISOString(),
      sentTo: reportTo,
      month: monthLabel,
      messageId: null,
      ok: false,
      error: result.error.message,
    });
    await sendFailureWebhook({
      reportTo,
      monthLabel,
      error: result.error.message,
    });
    return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  }

  upsertAccessibilityChecklistHistory({ ...historyEntryBase, ok: true });
  writeAccessibilityMonthlyReportState({
    sentAt: now.toISOString(),
    sentTo: reportTo,
    month: monthLabel,
    messageId: result.data?.id || null,
    ok: true,
  });

  return NextResponse.json({
    ok: true,
    sentTo: reportTo,
    month: monthLabel,
    messageId: result.data?.id || null,
  });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await handleAccessibilityMonthlyReport(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[accessibility-monthly-report]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
