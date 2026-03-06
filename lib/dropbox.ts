import { normalizeUsername } from "@/lib/userAuth";
import { ensureSqlReady, hasSqlDatabaseConfigured, sqlQuery } from "@/lib/sqlDb";
import { findUserByUsername } from "@/lib/authRepository";

export type DropboxTokenRow = {
  user_id: string;
  refresh_token: string;
  account_id: string | null;
  email: string | null;
  connected_at: string | null;
  updated_at: string | null;
};

type DropboxDbMode = "sql";

let sqlTableEnsured = false;

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function hasCoolifySqlHint() {
  return Boolean(
    (process.env.COOLIFY_DATABASE_URL || "").trim() ||
      (process.env.COOLIFY_DATABASE_URL_FILE || "").trim() ||
      (process.env.DATABASE_URL_FILE || "").trim() ||
      process.env.COOLIFY_FQDN
  );
}

function getDbMode(): DropboxDbMode {
  const hasSql = hasSqlDatabaseConfigured();
  if (!hasSql && !hasCoolifySqlHint()) {
    throw new Error("SQL database is not configured.");
  }
  return "sql";
}

async function ensureSqlTable() {
  if (sqlTableEnsured) return;
  await ensureSqlReady();
  await sqlQuery(`
    CREATE TABLE IF NOT EXISTS dropbox_tokens (
      user_id TEXT PRIMARY KEY,
      refresh_token TEXT NOT NULL,
      account_id TEXT,
      email TEXT,
      connected_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await sqlQuery(
    `CREATE INDEX IF NOT EXISTS idx_dropbox_tokens_connected_at ON dropbox_tokens(connected_at DESC NULLS LAST)`
  );
  sqlTableEnsured = true;
}

export function getDropboxConfig() {
  const appKey = env("DROPBOX_APP_KEY");
  const appSecret = env("DROPBOX_APP_SECRET");
  const redirectUri =
    env("DROPBOX_REDIRECT_URI") ||
    (env("NEXT_PUBLIC_BASE_URL") ? `${env("NEXT_PUBLIC_BASE_URL")}/api/dropbox/callback` : "");
  return { appKey, appSecret, redirectUri };
}

export async function getDropboxTokenRow(userId: string) {
  getDbMode();
  await ensureSqlTable();
  const rows = await sqlQuery<DropboxTokenRow>(
    `SELECT user_id, refresh_token, account_id, email, connected_at, updated_at
     FROM dropbox_tokens
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getLatestDropboxTokenRow() {
  getDbMode();
  await ensureSqlTable();
  const rows = await sqlQuery<DropboxTokenRow>(
    `SELECT user_id, refresh_token, account_id, email, connected_at, updated_at
     FROM dropbox_tokens
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`
  );
  return rows[0] || null;
}

async function getUserIdByUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const user = await findUserByUsername(normalized);
  return String((user as any)?.id || "").trim() || null;
}

export async function getDropboxTokenRowForSession(args: {
  userId: string;
  username?: string | null;
}) {
  const direct = await getDropboxTokenRow(args.userId);
  if (direct?.refresh_token) return direct;

  const byUsernameId = await getUserIdByUsername(String(args.username || ""));
  if (byUsernameId && byUsernameId !== args.userId) {
    const row = await getDropboxTokenRow(byUsernameId);
    if (row?.refresh_token) return row;
  }

  // Admin fallback: when using master-login/admin session, allow the most recently
  // connected Dropbox token to be used so Studio search still works.
  if (normalizeUsername(String(args.username || "")) === "admin") {
    const latest = await getLatestDropboxTokenRow();
    if (latest?.refresh_token) return latest;
  }

  return null;
}

export async function upsertDropboxToken(args: {
  userId: string;
  refreshToken: string;
  accountId?: string | null;
  email?: string | null;
}) {
  getDbMode();
  await ensureSqlTable();
  await sqlQuery(
    `INSERT INTO dropbox_tokens (user_id, refresh_token, account_id, email, connected_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (user_id) DO UPDATE SET
       refresh_token = EXCLUDED.refresh_token,
       account_id = EXCLUDED.account_id,
       email = EXCLUDED.email,
       updated_at = now()`,
    [args.userId, args.refreshToken, args.accountId || null, args.email || null]
  );
}

export async function deleteDropboxToken(userId: string) {
  getDbMode();
  await ensureSqlTable();
  await sqlQuery(`DELETE FROM dropbox_tokens WHERE user_id = $1`, [userId]);
}

export async function refreshDropboxAccessToken(refreshToken: string) {
  const { appKey, appSecret } = getDropboxConfig();
  if (!appKey || !appSecret) {
    throw new Error("Dropbox is not configured. Missing DROPBOX_APP_KEY/DROPBOX_APP_SECRET.");
  }
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("client_id", appKey);
  body.set("client_secret", appSecret);
  const resp = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.access_token) {
    throw new Error(json?.error_description || json?.error || "Failed to refresh Dropbox token.");
  }
  return String(json.access_token);
}

export async function getDropboxAccessTokenForUser(userId: string) {
  const row = await getDropboxTokenRow(userId);
  if (!row?.refresh_token) return null;
  return refreshDropboxAccessToken(row.refresh_token);
}

export async function getDropboxAccessTokenForSession(args: {
  userId: string;
  username?: string | null;
}) {
  const row = await getDropboxTokenRowForSession(args);
  if (!row?.refresh_token) return null;
  return refreshDropboxAccessToken(row.refresh_token);
}
