import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { loadAccessibilityWidgetConfig } from "@/lib/accessibilityConfigRepository";
import { getAccessibilityUsageSummary } from "@/lib/accessibilityUsageRepository";
import { readAccessibilityMonthlyReportState } from "@/lib/accessibilityMonthlyReportState";
import { readAccessibilityChecklistHistory } from "@/lib/accessibilityChecklistHistory";

export const runtime = "nodejs";
export const maxDuration = 30;

const CHECKLIST_LABELS: Array<{ key: string; label: string }> = [
  { key: "statementPublished", label: "Accessibility statement published" },
  { key: "issueChannelActive", label: "Issue channel active" },
  { key: "keyboardAuditDone", label: "Keyboard audit completed" },
  { key: "contrastAuditDone", label: "Contrast audit completed" },
  { key: "altTextAuditDone", label: "Alt text audit completed" },
  { key: "formsAuditDone", label: "Forms audit completed" },
  { key: "captionsAuditDone", label: "Captions/transcripts audit completed" },
  { key: "monthlyRetestDone", label: "Monthly retest and evidence logged" },
];

function toBool(value: unknown) {
  return Boolean(value);
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => csvEscape(row[h]));
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "json").trim().toLowerCase();
  const scope = (url.searchParams.get("scope") || "default").trim() || "default";
  const daysRaw = Number.parseInt(url.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, daysRaw)) : 30;

  const settings = await loadAccessibilityWidgetConfig(scope);
  const usageSummary = await getAccessibilityUsageSummary(days);
  const reportState = readAccessibilityMonthlyReportState();
  const checklistHistory = readAccessibilityChecklistHistory();

  const checklistRaw =
    settings.complianceChecklist &&
    typeof settings.complianceChecklist === "object" &&
    !Array.isArray(settings.complianceChecklist)
      ? (settings.complianceChecklist as Record<string, unknown>)
      : {};
  const checklistItems = CHECKLIST_LABELS.map((item) => ({
    key: item.key,
    label: item.label,
    done: toBool(checklistRaw[item.key]),
  }));
  const checklistDone = checklistItems.filter((item) => item.done).length;
  const checklistTotal = checklistItems.length;
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  const payload = {
    generatedAt: new Date().toISOString(),
    scope,
    usageWindowDays: days,
    settings: {
      statementUrl: String(settings.statementUrl || ""),
      feedbackUrl: String(settings.feedbackUrl || ""),
      supportEmail: String(settings.supportEmail || ""),
      monthlyReportEmail: String(settings.monthlyReportEmail || ""),
    },
    checklist: {
      done: checklistDone,
      total: checklistTotal,
      percent: checklistPercent,
      items: checklistItems,
    },
    usageSummary,
    lastMonthlyReportStatus: reportState,
    checklistTrendHistory: checklistHistory,
  };

  if (format === "csv") {
    const rows = [
      {
        generatedAt: payload.generatedAt,
        scope: payload.scope,
        usageWindowDays: payload.usageWindowDays,
        checklistDone,
        checklistTotal,
        checklistPercent,
        usageEvents: usageSummary.totalEvents,
        lastMonthlyReportSentAt: reportState?.sentAt || "",
        lastMonthlyReportOk: reportState ? String(reportState.ok) : "",
        lastMonthlyReportError: reportState?.error || "",
        statementUrl: payload.settings.statementUrl,
        feedbackUrl: payload.settings.feedbackUrl,
        supportEmail: payload.settings.supportEmail,
        monthlyReportEmail: payload.settings.monthlyReportEmail,
        trendCurrentMonth: checklistHistory.at(-1)?.month || "",
        trendCurrentPercent: checklistHistory.at(-1)?.percent ?? "",
        trendPrevMonth: checklistHistory.at(-2)?.month || "",
        trendPrevPercent: checklistHistory.at(-2)?.percent ?? "",
        trendSeries:
          checklistHistory
            .slice(-12)
            .map((entry) => `${entry.month}:${entry.percent}%`)
            .join(" | ") || "",
      },
    ];
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="accessibility-compliance-${scope}.csv"`,
      },
    });
  }

  return NextResponse.json({ ok: true, ...payload });
}

