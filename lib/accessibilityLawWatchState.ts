import fs from "node:fs";
import path from "node:path";

export type AccessibilityLawWatchSourceState = {
  id: string;
  title: string;
  url: string;
  hash: string;
  lastFetchedAt: string;
  lastStatus: "ok" | "error";
  lastError?: string;
  contentLength: number;
};

export type AccessibilityLawWatchChange = {
  id: string;
  title: string;
  url: string;
  previousHash: string | null;
  nextHash: string;
  detectedAt: string;
};

export type AccessibilityLawWatchState = {
  checkedAt: string;
  lastRunOk: boolean;
  lastError?: string;
  sources: AccessibilityLawWatchSourceState[];
  lastChanges: AccessibilityLawWatchChange[];
  lastEmailSentAt?: string;
};

function stateFilePath() {
  return path.join(process.cwd(), ".tmp", "accessibility-law-watch-state.json");
}

export function readAccessibilityLawWatchState(): AccessibilityLawWatchState | null {
  const file = stateFilePath();
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessibilityLawWatchState;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.checkedAt || !Array.isArray(parsed.sources)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAccessibilityLawWatchState(state: AccessibilityLawWatchState) {
  const file = stateFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

