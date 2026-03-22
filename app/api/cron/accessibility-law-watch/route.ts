import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { isRequestAuthed } from "@/lib/auth";
import {
  readAccessibilityLawWatchState,
  writeAccessibilityLawWatchState,
  type AccessibilityLawWatchChange,
  type AccessibilityLawWatchSourceState,
} from "@/lib/accessibilityLawWatchState";

export const runtime = "nodejs";
export const maxDuration = 120;

type LawSource = {
  id: string;
  title: string;
  url: string;
};

const DEFAULT_REPORT_EMAIL = "elior@carbonjeanscompany.com";
const ACCESSIBILITY_FROM_EMAIL = "compliance@carbonjeanscompany.com";
const ACCESSIBILITY_FROM_NAME = "Carbon Compliance";

const DEFAULT_SOURCES: LawSource[] = [
  {
    id: "ada-law-regs",
    title: "ADA.gov Law, Regulations & Standards",
    url: "https://www.ada.gov/law-and-regs/",
  },
  {
    id: "ada-web-guidance",
    title: "ADA.gov Web Accessibility Guidance",
    url: "https://www.ada.gov/resources/web-guidance/",
  },
  {
    id: "federal-register-title-ii-web-rule",
    title: "Federal Register - ADA Title II Web Rule",
    url: "https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state",
  },
  {
    id: "fl-stat-760-08",
    title: "Florida Statute 760.08 Public Accommodations",
    url: "http://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0760/Sections/0760.08.html",
  },
  {
    id: "fl-stat-282-603",
    title: "Florida Statute 282.603 Accessibility of EIT",
    url: "http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&Search_String=&URL=0200-0299/0282/Sections/0282.603.html",
  },
  {
    id: "wcag-22",
    title: "W3C WCAG 2.2 Recommendation",
    url: "https://www.w3.org/TR/WCAG22/",
  },
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

function normalizeText(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function toHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function resolveSourcesFromEnv() {
  const raw = (process.env.ACCESSIBILITY_LAW_WATCH_SOURCES_JSON || "").trim();
  if (!raw) return DEFAULT_SOURCES;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SOURCES;
    const out = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          id: String(row.id || "").trim(),
          title: String(row.title || "").trim(),
          url: String(row.url || "").trim(),
        };
      })
      .filter((row) => row.id && row.title && /^https?:\/\//i.test(row.url));
    return out.length > 0 ? out : DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
}

async function fetchSourceSnapshot(source: LawSource): Promise<AccessibilityLawWatchSourceState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(source.url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": "Carbon-Accessibility-LawWatch/1.0",
      },
    });
    if (!response.ok) {
      return {
        id: source.id,
        title: source.title,
        url: source.url,
        hash: "",
        lastFetchedAt: new Date().toISOString(),
        lastStatus: "error",
        lastError: `HTTP ${response.status}`,
        contentLength: 0,
      };
    }
    const html = await response.text();
    const normalized = normalizeText(html).slice(0, 800000);
    return {
      id: source.id,
      title: source.title,
      url: source.url,
      hash: toHash(normalized),
      lastFetchedAt: new Date().toISOString(),
      lastStatus: "ok",
      contentLength: normalized.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return {
      id: source.id,
      title: source.title,
      url: source.url,
      hash: "",
      lastFetchedAt: new Date().toISOString(),
      lastStatus: "error",
      lastError: message,
      contentLength: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function detectChanges(
  previous: AccessibilityLawWatchSourceState[] | undefined,
  current: AccessibilityLawWatchSourceState[]
) {
  const prevMap = new Map((previous || []).map((item) => [item.id, item]));
  const changes: AccessibilityLawWatchChange[] = [];
  for (const source of current) {
    if (source.lastStatus !== "ok" || !source.hash) continue;
    const prev = prevMap.get(source.id);
    if (!prev || !prev.hash || prev.hash !== source.hash) {
      changes.push({
        id: source.id,
        title: source.title,
        url: source.url,
        previousHash: prev?.hash || null,
        nextHash: source.hash,
        detectedAt: new Date().toISOString(),
      });
    }
  }
  return changes;
}

async function sendLawWatchEmail(args: {
  to: string;
  changes: AccessibilityLawWatchChange[];
  checkedAt: string;
}) {
  const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!resendApiKey) {
    return { ok: false, error: "RESEND_API_KEY not configured" as const };
  }
  const resend = new Resend(resendApiKey);
  const subject = `Accessibility law-watch update: ${args.changes.length} source change(s) detected`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 780px; margin: 0 auto; padding: 20px; color: #111;">
  <h2 style="margin:0 0 10px;">Accessibility law-watch change detected</h2>
  <p style="margin:0 0 12px;">Checked at: ${args.checkedAt}</p>
  <p style="margin:0 0 12px;">
    One or more official legal/regulatory source pages changed. This is a signal to review updates and confirm compliance impact.
  </p>
  <table style="border-collapse: collapse; width: 100%;">
    <thead>
      <tr>
        <th style="border:1px solid #ddd; padding: 6px; text-align: left;">Source</th>
        <th style="border:1px solid #ddd; padding: 6px; text-align: left;">URL</th>
      </tr>
    </thead>
    <tbody>
      ${args.changes
        .map(
          (change) => `
            <tr>
              <td style="border:1px solid #ddd; padding: 6px;">${change.title}</td>
              <td style="border:1px solid #ddd; padding: 6px;"><a href="${change.url}">${change.url}</a></td>
            </tr>
          `
        )
        .join("")}
    </tbody>
  </table>
  <p style="margin-top: 14px; color:#555; font-size: 12px;">
    Triggered by /api/cron/accessibility-law-watch. Please manually review legal text changes before deciding remediation.
  </p>
</body>
</html>`;
  const result = await resend.emails.send({
    from: `${ACCESSIBILITY_FROM_NAME} <${ACCESSIBILITY_FROM_EMAIL}>`,
    to: args.to,
    subject,
    html,
  });
  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, messageId: result.data?.id || null };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const nowIso = new Date().toISOString();
  const previous = readAccessibilityLawWatchState();
  const sources = resolveSourcesFromEnv();
  const current = await Promise.all(sources.map((source) => fetchSourceSnapshot(source)));
  const detectedChanges = detectChanges(previous?.sources, current);

  const reportTo =
    (process.env.ACCESSIBILITY_LAW_WATCH_EMAIL || "").trim() ||
    (process.env.ACCESSIBILITY_REPORT_EMAIL || "").trim() ||
    DEFAULT_REPORT_EMAIL;

  let emailSent = false;
  let emailError: string | undefined;
  let emailMessageId: string | null = null;
  if (detectedChanges.length > 0 || force) {
    const mail = await sendLawWatchEmail({
      to: reportTo,
      changes: detectedChanges,
      checkedAt: nowIso,
    });
    emailSent = mail.ok;
    emailMessageId = "messageId" in mail ? (mail.messageId ?? null) : null;
    if (!mail.ok) {
      emailError = "error" in mail ? mail.error : "Email send failed";
    }
  }

  const hasFetchError = current.some((item) => item.lastStatus === "error");
  const state = {
    checkedAt: nowIso,
    lastRunOk: !hasFetchError,
    lastError: hasFetchError ? "One or more sources failed to fetch" : undefined,
    sources: current,
    lastChanges: detectedChanges,
    lastEmailSentAt: emailSent ? nowIso : previous?.lastEmailSentAt,
  };
  writeAccessibilityLawWatchState(state);

  return NextResponse.json({
    ok: true,
    checkedAt: nowIso,
    sourceCount: current.length,
    changedCount: detectedChanges.length,
    emailSent,
    emailMessageId,
    emailError,
    reportTo,
    force,
    hasFetchError,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
