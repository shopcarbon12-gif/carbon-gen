import type { InstagramConnection } from "@/lib/instagramConnectionRepository";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Meta OAuth: turn the `code` from the login dialog into a stored connection.
 *
 * The important step is the middle one. The code exchange returns a *short*
 * lived user token (about an hour). Exchanging that for a long-lived user
 * token first is what makes the resulting Page token non-expiring — Meta
 * issues Page tokens without an expiry only when they are derived from a
 * long-lived user token. Skipping it produces a feed that works for an hour
 * and then dies quietly, which is the exact failure we are replacing.
 */

/**
 * OAuth scopes requested at the login dialog.
 *
 * Overridable via META_SCOPES because Meta renames these: the legacy Instagram
 * Graph API used `instagram_basic` + `pages_read_engagement`, while apps created
 * under the newer "Manage messaging & content on Instagram" use case only accept
 * the `instagram_business_*` names and reject the old ones outright ("Invalid
 * Scopes"). Which set applies depends on how the Meta app was provisioned, and
 * that cannot be detected from here — so it is configuration, not a constant,
 * and correcting it never needs a code change.
 */
const DEFAULT_SCOPES = [
  "pages_show_list",
  "instagram_business_basic",
].join(",");

export const META_SCOPES = String(process.env.META_SCOPES || "").trim() || DEFAULT_SCOPES;

export function metaAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", META_SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

type GraphError = { error?: { message?: string } };

async function graphGet<T>(url: URL): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Graph request failed" };
  }
  const json = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok) {
    const msg =
      typeof json?.error?.message === "string" && json.error.message.trim()
        ? json.error.message.trim()
        : `Graph HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, data: json as T };
}

type PageRow = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
};

export async function exchangeCodeForConnection(params: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}): Promise<{ ok: true; connection: InstagramConnection } | { ok: false; error: string }> {
  const { code, appId, appSecret, redirectUri } = params;

  /* 1 — code → short-lived user token */
  const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", appId);
  shortUrl.searchParams.set("client_secret", appSecret);
  shortUrl.searchParams.set("redirect_uri", redirectUri);
  shortUrl.searchParams.set("code", code);
  const short = await graphGet<{ access_token?: string }>(shortUrl);
  if (!short.ok) return { ok: false, error: `Code exchange failed: ${short.error}` };
  const shortToken = String(short.data.access_token || "").trim();
  if (!shortToken) return { ok: false, error: "Code exchange returned no access token" };

  /* 2 — short-lived → long-lived user token (what makes the Page token last) */
  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortToken);
  const long = await graphGet<{ access_token?: string; expires_in?: number }>(longUrl);
  if (!long.ok) return { ok: false, error: `Long-lived exchange failed: ${long.error}` };
  const longToken = String(long.data.access_token || "").trim();
  if (!longToken) return { ok: false, error: "Long-lived exchange returned no access token" };

  /* 3 — the Pages this user administers, with their Instagram links */
  const pagesUrl = new URL(`${GRAPH}/me/accounts`);
  pagesUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}",
  );
  pagesUrl.searchParams.set("limit", "100");
  pagesUrl.searchParams.set("access_token", longToken);
  const pages = await graphGet<{ data?: PageRow[] }>(pagesUrl);
  if (!pages.ok) return { ok: false, error: `Could not list Pages: ${pages.error}` };

  const rows = Array.isArray(pages.data.data) ? pages.data.data : [];
  const linked = rows.find((p) => p.instagram_business_account?.id && p.access_token);

  if (!linked) {
    /* Named precisely, because this is the common setup mistake: an Instagram
       account that is Personal, or not linked to a Page, cannot be read by the
       Graph API at all — no token will fix it. */
    return {
      ok: false,
      error:
        rows.length === 0
          ? "No Facebook Pages available to this account. The Instagram account must be Business or Creator and linked to a Page you administer."
          : "None of your Pages has a linked Instagram Business account. Link @shopcarbon to the Page in Meta Business settings, then reconnect.",
    };
  }

  const expiresIn = Number(long.data.expires_in);
  return {
    ok: true,
    connection: {
      igUserId: String(linked.instagram_business_account?.id || ""),
      pageId: String(linked.id || ""),
      pageName: linked.name ? String(linked.name) : undefined,
      username: linked.instagram_business_account?.username
        ? String(linked.instagram_business_account.username)
        : undefined,
      pageAccessToken: String(linked.access_token || ""),
      /* Page tokens from a long-lived user token normally carry no expiry;
         record one only if Meta actually returns it. */
      expiresAt:
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
      connectedAt: new Date().toISOString(),
    },
  };
}

/**
 * Ask Meta how long a token is actually good for. Used by the status endpoint
 * so a token nearing expiry is visible in the studio instead of discovered by
 * the feed going blank.
 */
export async function inspectToken(params: {
  token: string;
  appId: string;
  appSecret: string;
}): Promise<{ ok: true; expiresAt: string | null; valid: boolean } | { ok: false; error: string }> {
  const url = new URL(`${GRAPH}/debug_token`);
  url.searchParams.set("input_token", params.token);
  url.searchParams.set("access_token", `${params.appId}|${params.appSecret}`);
  const res = await graphGet<{ data?: { expires_at?: number; is_valid?: boolean } }>(url);
  if (!res.ok) return { ok: false, error: res.error };
  const expiresAt = Number(res.data.data?.expires_at);
  return {
    ok: true,
    valid: Boolean(res.data.data?.is_valid),
    /* 0 means "never expires", which is what we want to see here. */
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0
      ? new Date(expiresAt * 1000).toISOString()
      : null,
  };
}
