import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/userAuth";
import { getDropboxConfig, upsertDropboxToken } from "@/lib/dropbox";

async function fetchDropboxAccountInfo(accessToken: string) {
  const resp = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "null",
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok) return { accountId: null, email: null };
  return {
    accountId: String(json?.account_id || "") || null,
    email: String(json?.email || "") || null,
  };
}

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const userId = session.userId || session.username || "";
  if (!userId) {
    return NextResponse.json({ error: "Missing session user id." }, { status: 401 });
  }

  const expectedState = String(req.cookies.get("carbon_gen_dropbox_oauth_state")?.value || "");
  const state = String(req.nextUrl.searchParams.get("state") || "");
  const code = String(req.nextUrl.searchParams.get("code") || "");
  const oauthError = String(req.nextUrl.searchParams.get("error_description") || req.nextUrl.searchParams.get("error") || "");
  const returnTo = String(req.cookies.get("carbon_gen_dropbox_oauth_return_to")?.value || "/settings");

  const clearAndRedirect = (path: string) => {
    const out = NextResponse.redirect(new URL(path, req.url));
    out.cookies.delete("carbon_gen_dropbox_oauth_state");
    out.cookies.delete("carbon_gen_dropbox_oauth_return_to");
    return out;
  };

  if (oauthError) {
    return clearAndRedirect(`${returnTo}?dropbox_error=${encodeURIComponent(oauthError)}`);
  }
  if (!expectedState || !state || expectedState !== state) {
    return clearAndRedirect(`${returnTo}?dropbox_error=${encodeURIComponent("Invalid Dropbox OAuth state")}`);
  }
  if (!code) {
    return clearAndRedirect(`${returnTo}?dropbox_error=${encodeURIComponent("Missing Dropbox auth code")}`);
  }

  const { appKey, appSecret, redirectUri } = getDropboxConfig();
  if (!appKey || !appSecret || !redirectUri) {
    return clearAndRedirect(
      `${returnTo}?dropbox_error=${encodeURIComponent("Dropbox OAuth config missing (key/secret/redirect)")}`
    );
  }

  try {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("client_id", appKey);
    body.set("client_secret", appSecret);
    body.set("redirect_uri", redirectUri);

    const tokenResp = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenJson: any = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok) {
      const msg = String(tokenJson?.error_description || tokenJson?.error || "Dropbox token exchange failed");
      return clearAndRedirect(`${returnTo}?dropbox_error=${encodeURIComponent(msg)}`);
    }

    const refreshToken = String(tokenJson?.refresh_token || "");
    const accessToken = String(tokenJson?.access_token || "");
    if (!refreshToken || !accessToken) {
      return clearAndRedirect(
        `${returnTo}?dropbox_error=${encodeURIComponent("Dropbox did not return refresh/access token")}`
      );
    }

    const account = await fetchDropboxAccountInfo(accessToken);
    await upsertDropboxToken({
      userId,
      refreshToken,
      accountId: account.accountId,
      email: account.email,
    });

    return clearAndRedirect(`${returnTo}?dropbox_connected=1`);
  } catch (e: any) {
    return clearAndRedirect(`${returnTo}?dropbox_error=${encodeURIComponent(e?.message || "Dropbox connect failed")}`);
  }
}

