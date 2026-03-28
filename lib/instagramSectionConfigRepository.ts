import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";
import { getCarbonAppDataDir } from "@/lib/carbonAppDataDir";
import fs from "node:fs";
import path from "node:path";

export { INSTAGRAM_HERO_HEIGHT, INSTAGRAM_HERO_WIDTH } from "@/lib/instagram-widget-constants";

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
    CREATE TABLE IF NOT EXISTS instagram_section_config (
      scope TEXT PRIMARY KEY,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  _sqlTableEnsured = true;
}

/** Persisted widget + hero + profile row (theme supplies only the "FOLLOW US ON INSTAGRAM" heading). */
export type InstagramSectionStoredConfig = {
  heroImageUrl?: string;
  heroAlt?: string;
  heroLinkText?: string;
  heroLinkHref?: string;
  heroLinkFontSizeDesktopPx?: number;
  heroLinkFontSizeMobilePx?: number;
  heroLinkFontWeight?: number;
  heroLinkColor?: string;
  profileAvatarUrl?: string;
  profileBrandName?: string;
  profileHandle?: string;
  profilePostsCount?: string;
  profileFollowersCount?: string;
  profileFollowButtonLabel?: string;
  profileFollowButtonHref?: string;
  /** Horizontal feed: show prev/next chevrons. */
  feedSliderArrowsEnabled?: boolean;
  /** Horizontal feed: click-drag to scroll (desktop pointer). */
  feedSliderDragEnabled?: boolean;
  /** Arrow / autoplay step animation length in seconds (e.g. 0.6). */
  feedSliderAnimationSec?: number;
  /** Autoplay interval in seconds; 0 = disabled. */
  feedSliderAutoplaySec?: number;
};

function localFilePath() {
  return path.join(getCarbonAppDataDir(), "instagram-section-config.json");
}

function readLocalAll(): Record<string, InstagramSectionStoredConfig> {
  const file = localFilePath();
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, InstagramSectionStoredConfig> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        out[key] = value as InstagramSectionStoredConfig;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalAll(all: Record<string, InstagramSectionStoredConfig>) {
  const file = localFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
}

export async function loadInstagramSectionConfig(
  scope = "default"
): Promise<InstagramSectionStoredConfig> {
  const safeScope = normalizeText(scope) || "default";
  const mode = getDbMode();
  if (mode === "file") {
    const all = readLocalAll();
    return all[safeScope] || {};
  }
  await ensureSqlTable();
  const rows = await sqlQuery<{ config: unknown }>(
    `SELECT config FROM instagram_section_config WHERE scope = $1 LIMIT 1`,
    [safeScope]
  );
  const config = rows[0]?.config;
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as InstagramSectionStoredConfig)
    : {};
}

export async function upsertInstagramSectionConfig(
  config: InstagramSectionStoredConfig,
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
    `INSERT INTO instagram_section_config (scope, config, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (scope) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
    [safeScope, JSON.stringify(config || {})]
  );
}
