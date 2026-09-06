import fs from "node:fs";
import path from "node:path";
import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";
import { getCarbonAppDataDir } from "@/lib/carbonAppDataDir";

/**
 * Stored Meta / Instagram connection.
 *
 * The Page access token lives here rather than in an environment variable so
 * connecting is a button in the studio instead of a manual trip through Graph
 * Explorer, and so reconnecting later never needs a redeploy.
 *
 * Env vars still win when present (see readInstagramCredentials): that keeps
 * the original META_PAGE_ACCESS_TOKEN path working and gives a way to pin
 * credentials without touching the database.
 *
 * Same storage shape as instagramSectionConfigRepository — Postgres in
 * production, a JSON file when no database is configured, so local dev works
 * with nothing running.
 */

export type InstagramConnection = {
  /** Instagram Business Account id — the `ig_user_id` Graph media calls use. */
  igUserId: string;
  /** Facebook Page the Instagram account is linked to. */
  pageId: string;
  pageName?: string;
  /** @username, for showing which account is connected. */
  username?: string;
  /**
   * Page access token. Derived from a long-lived user token, so Meta issues it
   * without an expiry — but that is Meta's promise, not ours, so expiresAt is
   * recorded when they do return one and surfaced in the studio.
   */
  pageAccessToken: string;
  expiresAt?: string | null;
  connectedAt: string;
};

const SCOPE = "default";

function hasCoolifySqlHint() {
  return Boolean(
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
      (process.env.COOLIFY_DATABASE_URL_FILE || "").trim() ||
      (process.env.DATABASE_URL_FILE || "").trim() ||
      process.env.COOLIFY_FQDN,
  );
}

function useSql() {
  return hasSqlDatabaseConfigured() || hasCoolifySqlHint();
}

let _tableEnsured = false;
async function ensureTable() {
  if (_tableEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS instagram_connection (
      scope TEXT PRIMARY KEY,
      connection JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  _tableEnsured = true;
}

function filePath() {
  return path.join(getCarbonAppDataDir(), "instagram-connection.json");
}

function readFile(): InstagramConnection | null {
  try {
    const raw = fs.readFileSync(filePath(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, InstagramConnection>;
    return parsed?.[SCOPE] ?? null;
  } catch {
    return null;
  }
}

function writeFile(conn: InstagramConnection | null) {
  const file = filePath();
  let all: Record<string, InstagramConnection> = {};
  try {
    all = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, InstagramConnection>;
  } catch {
    all = {};
  }
  if (conn) all[SCOPE] = conn;
  else delete all[SCOPE];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf8");
}

export async function readInstagramConnection(): Promise<InstagramConnection | null> {
  if (!useSql()) return readFile();
  try {
    await ensureTable();
    const rows = await sqlQuery<{ connection: InstagramConnection }>(
      `SELECT connection FROM instagram_connection WHERE scope = $1 LIMIT 1`,
      [SCOPE],
    );
    return rows[0]?.connection ?? null;
  } catch (e) {
    console.error("[instagram-connection] read failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function writeInstagramConnection(conn: InstagramConnection): Promise<void> {
  if (!useSql()) {
    writeFile(conn);
    return;
  }
  await ensureTable();
  await sqlQuery(
    `INSERT INTO instagram_connection (scope, connection, updated_at)
       VALUES ($1, $2::jsonb, now())
     ON CONFLICT (scope) DO UPDATE
       SET connection = EXCLUDED.connection, updated_at = now()`,
    [SCOPE, JSON.stringify(conn)],
  );
}

export async function clearInstagramConnection(): Promise<void> {
  if (!useSql()) {
    writeFile(null);
    return;
  }
  await ensureTable();
  await sqlQuery(`DELETE FROM instagram_connection WHERE scope = $1`, [SCOPE]);
}

/**
 * Credentials for a Graph media call, whatever the source.
 *
 * Environment variables take precedence deliberately: they are the explicit,
 * operator-set value, and letting a stored connection silently override them
 * would make a pinned token impossible to reason about.
 */
export async function readInstagramCredentials(): Promise<
  { igUserId: string; accessToken: string; source: "env" | "connection" } | null
> {
  const envId = String(process.env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID || "").trim();
  const envToken = String(process.env.META_PAGE_ACCESS_TOKEN || "").trim();
  if (envId && envToken) return { igUserId: envId, accessToken: envToken, source: "env" };

  const conn = await readInstagramConnection();
  if (conn?.igUserId && conn?.pageAccessToken) {
    return { igUserId: conn.igUserId, accessToken: conn.pageAccessToken, source: "connection" };
  }
  return null;
}
