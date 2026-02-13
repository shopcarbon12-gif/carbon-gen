import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeUsername } from "@/lib/userAuth";

export type DropboxTokenRow = {
  user_id: string;
  refresh_token: string;
  account_id: string | null;
  email: string | null;
  connected_at: string | null;
  updated_at: string | null;
};

function env(name: string) {
  return String(process.env[name] || "").trim();
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
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dropbox_tokens")
    .select("user_id,refresh_token,account_id,email,connected_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DropboxTokenRow | null) || null;
}

async function getLatestDropboxTokenRow() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("dropbox_tokens")
    .select("user_id,refresh_token,account_id,email,connected_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DropboxTokenRow | null) || null;
}

async function getUserIdByUsername(username: string) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id")
    .eq("username", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return String((data as any)?.id || "").trim() || null;
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
  const supabase = getSupabaseAdmin();
  const payload = {
    user_id: args.userId,
    refresh_token: args.refreshToken,
    account_id: args.accountId || null,
    email: args.email || null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("dropbox_tokens").upsert(payload, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function deleteDropboxToken(userId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("dropbox_tokens").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
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
