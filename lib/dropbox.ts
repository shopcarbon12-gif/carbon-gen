import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

