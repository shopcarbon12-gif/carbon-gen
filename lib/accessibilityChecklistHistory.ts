import fs from "node:fs";
import path from "node:path";

export type AccessibilityChecklistHistoryEntry = {
  month: string;
  completed: number;
  total: number;
  percent: number;
  sentAt: string;
  ok: boolean;
};

type AccessibilityChecklistHistoryFile = {
  entries: AccessibilityChecklistHistoryEntry[];
};

function historyFilePath() {
  return path.join(process.cwd(), ".tmp", "accessibility-checklist-history.json");
}

export function readAccessibilityChecklistHistory(): AccessibilityChecklistHistoryEntry[] {
  const file = historyFilePath();
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AccessibilityChecklistHistoryFile;
    if (!parsed || !Array.isArray(parsed.entries)) return [];
    return parsed.entries
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          month: String(row.month || "").trim(),
          completed: Number(row.completed || 0),
          total: Number(row.total || 0),
          percent: Number(row.percent || 0),
          sentAt: String(row.sentAt || "").trim(),
          ok: Boolean(row.ok),
        };
      })
      .filter((entry) => entry.month && entry.sentAt);
  } catch {
    return [];
  }
}

function writeAccessibilityChecklistHistory(entries: AccessibilityChecklistHistoryEntry[]) {
  const file = historyFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload: AccessibilityChecklistHistoryFile = { entries };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

export function upsertAccessibilityChecklistHistory(entry: AccessibilityChecklistHistoryEntry) {
  const current = readAccessibilityChecklistHistory();
  const withoutMonth = current.filter((row) => row.month !== entry.month);
  const merged = [...withoutMonth, entry]
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
    .slice(-24);
  writeAccessibilityChecklistHistory(merged);
  return merged;
}

