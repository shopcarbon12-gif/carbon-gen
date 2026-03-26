import fs from "node:fs";
import path from "node:path";
import { getCarbonAppDataDir } from "@/lib/carbonAppDataDir";

export type AccessibilityMonthlyReportState = {
  sentAt: string;
  sentTo: string;
  month: string;
  messageId: string | null;
  ok: boolean;
  error?: string;
};

function stateFilePath() {
  return path.join(getCarbonAppDataDir(), "accessibility-monthly-report-state.json");
}

export function readAccessibilityMonthlyReportState(): AccessibilityMonthlyReportState | null {
  const file = stateFilePath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessibilityMonthlyReportState;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.sentAt || !parsed.sentTo || !parsed.month) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAccessibilityMonthlyReportState(state: AccessibilityMonthlyReportState) {
  const file = stateFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

