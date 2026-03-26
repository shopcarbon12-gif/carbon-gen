import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";
import { getCarbonAppDataDir } from "@/lib/carbonAppDataDir";
import fs from "node:fs";
import path from "node:path";

type DbMode = "sql" | "file";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
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

let _sqlTableEnsured = false;

async function ensureSqlTable() {
  if (_sqlTableEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS accessibility_widget_config (
      scope TEXT PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  _sqlTableEnsured = true;
}

export type AccessibilityWidgetStoredConfig = Record<string, unknown>;

function localFilePath() {
  return path.join(getCarbonAppDataDir(), "accessibility-widget-config.json");
}

function readLocalAll(): Record<string, AccessibilityWidgetStoredConfig> {
  const file = localFilePath();
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, AccessibilityWidgetStoredConfig> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        out[key] = value as AccessibilityWidgetStoredConfig;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalAll(all: Record<string, AccessibilityWidgetStoredConfig>) {
  const file = localFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
}

export async function loadAccessibilityWidgetConfig(
  scope = "default"
): Promise<AccessibilityWidgetStoredConfig> {
  const safeScope = normalizeText(scope) || "default";
  const mode = getDbMode();
  if (mode === "file") {
    const all = readLocalAll();
    return all[safeScope] || {};
  }
  await ensureSqlTable();
  const rows = await sqlQuery<{ config: unknown }>(
    `SELECT config FROM accessibility_widget_config WHERE scope = $1 LIMIT 1`,
    [safeScope]
  );
  const config = rows[0]?.config;
  return config && typeof config === "object" ? (config as AccessibilityWidgetStoredConfig) : {};
}

export async function upsertAccessibilityWidgetConfig(
  config: AccessibilityWidgetStoredConfig,
  scope = "default"
): Promise<void> {
  const safeScope = normalizeText(scope) || "default";
  const mode = getDbMode();
  if (mode === "file") {
    const all = readLocalAll();
    all[safeScope] = config || {};
    writeLocalAll(all);
    return;
  }
  await ensureSqlTable();
  await sqlQuery(
    `INSERT INTO accessibility_widget_config (scope, config, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (scope) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
    [safeScope, JSON.stringify(config || {})]
  );
}

