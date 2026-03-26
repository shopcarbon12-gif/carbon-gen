import fs from "node:fs";
import path from "node:path";
import { getCarbonAppDataDir } from "@/lib/carbonAppDataDir";
import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";

type DbMode = "sql" | "file";

type UsageEventPayload = Record<string, unknown>;

export type AccessibilityUsageEvent = {
  scope: string;
  eventName: string;
  payload: UsageEventPayload;
  createdAt: string;
};

export type AccessibilityUsageSummary = {
  sinceDays: number;
  totalEvents: number;
  byEvent: Array<{ eventName: string; count: number }>;
};

function normalizeText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function hasCoolifySqlHint() {
  return Boolean(
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
      (process.env.COOLIFY_DATABASE_URL_FILE || "").trim() ||
      (process.env.DATABASE_URL_FILE || "").trim() ||
      process.env.COOLIFY_FQDN
  );
}

function getDbMode(): DbMode {
  const hasSql = hasSqlDatabaseConfigured();
  if (hasSql || hasCoolifySqlHint()) return "sql";
  return "file";
}

function localFilePath() {
  return path.join(getCarbonAppDataDir(), "accessibility-widget-usage-events.json");
}

function readLocalEvents(): AccessibilityUsageEvent[] {
  const file = localFilePath();
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          scope: normalizeText(item.scope, "default"),
          eventName: normalizeText(item.eventName, "unknown"),
          payload:
            item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
              ? (item.payload as UsageEventPayload)
              : {},
          createdAt: normalizeText(item.createdAt, new Date().toISOString()),
        };
      });
  } catch {
    return [];
  }
}

function writeLocalEvents(events: AccessibilityUsageEvent[]) {
  const file = localFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(events, null, 2), "utf8");
}

function buildSummary(events: AccessibilityUsageEvent[], sinceDays: number): AccessibilityUsageSummary {
  const now = Date.now();
  const cutoffMs = now - sinceDays * 24 * 60 * 60 * 1000;
  const filtered = events.filter((event) => {
    const ms = Date.parse(event.createdAt);
    return Number.isFinite(ms) && ms >= cutoffMs;
  });

  const byEventMap = new Map<string, number>();
  for (const event of filtered) {
    byEventMap.set(event.eventName, (byEventMap.get(event.eventName) || 0) + 1);
  }

  const byEvent = Array.from(byEventMap.entries())
    .map(([eventName, count]) => ({ eventName, count }))
    .sort((a, b) => b.count - a.count);

  return {
    sinceDays,
    totalEvents: filtered.length,
    byEvent,
  };
}

let _sqlTableEnsured = false;

async function ensureSqlTable() {
  if (_sqlTableEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS accessibility_widget_usage_events (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'default',
      event_name TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await sqlQuery(
    `CREATE INDEX IF NOT EXISTS idx_accessibility_usage_created ON accessibility_widget_usage_events(created_at DESC)`
  );
  await sqlQuery(
    `CREATE INDEX IF NOT EXISTS idx_accessibility_usage_scope_event ON accessibility_widget_usage_events(scope, event_name, created_at DESC)`
  );
  _sqlTableEnsured = true;
}

export async function recordAccessibilityUsageEvent(input: {
  scope?: string;
  eventName: string;
  payload?: UsageEventPayload;
}) {
  const mode = getDbMode();
  const scope = normalizeText(input.scope, "default");
  const eventName = normalizeText(input.eventName, "unknown");
  const payload =
    input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
      ? input.payload
      : {};

  if (mode === "file") {
    const events = readLocalEvents();
    events.push({
      scope,
      eventName,
      payload,
      createdAt: new Date().toISOString(),
    });
    const keep = events.slice(-3000);
    writeLocalEvents(keep);
    return;
  }

  await ensureSqlTable();
  await sqlQuery(
    `INSERT INTO accessibility_widget_usage_events (scope, event_name, payload) VALUES ($1, $2, $3::jsonb)`,
    [scope, eventName, JSON.stringify(payload)]
  );
}

export async function getAccessibilityUsageSummary(sinceDays = 30): Promise<AccessibilityUsageSummary> {
  const safeDays = Number.isFinite(sinceDays) ? Math.max(1, Math.min(365, Math.round(sinceDays))) : 30;
  const mode = getDbMode();

  if (mode === "file") {
    return buildSummary(readLocalEvents(), safeDays);
  }

  await ensureSqlTable();
  const rows = await sqlQuery<{ event_name: string; count: string }>(
    `SELECT event_name, count(*)::text as count
     FROM accessibility_widget_usage_events
     WHERE created_at >= now() - ($1::text || ' days')::interval
     GROUP BY event_name
     ORDER BY count(*) DESC`,
    [String(safeDays)]
  );

  const byEvent = rows.map((row) => ({
    eventName: normalizeText(row.event_name, "unknown"),
    count: Number.parseInt(row.count || "0", 10) || 0,
  }));
  const totalEvents = byEvent.reduce((sum, item) => sum + item.count, 0);
  return {
    sinceDays: safeDays,
    totalEvents,
    byEvent,
  };
}

