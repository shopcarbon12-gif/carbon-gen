/**
 * Lightspeed OAuth callback. Exchanges code for tokens.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const domainPrefix = searchParams.get("domain_prefix") || "us";
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const base = String(process.env.NEXT_PUBLIC_BASE_URL || "https://carbon-gen-iota.vercel.app").replace(/\/$/, "");
  const redirectUri = String(process.env.LS_REDIRECT_URI || "").trim() || base + "/api/lightspeed/callback";

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("ls_oauth_state")?.value;
  cookieStore.delete("ls_oauth_state");

  if (error) {
    return NextResponse.redirect(base + "/settings?ls_error=" + encodeURIComponent(error));
  }
  if (!code) {
    return NextResponse.redirect(base + "/settings?ls_error=no_code");
  }
  if (state !== expectedState) {
    return NextResponse.redirect(base + "/settings?ls_error=invalid_state");
  }

  const clientId = String(process.env.LS_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.LS_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(base + "/settings?ls_error=missing_credentials");
  }

  const tokenUrl = "https://" + domainPrefix + ".retail.lightspeed.app/api/1.0/token";
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }).toString();

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });

  const data = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) {
    const err = (data as { error?: string })?.error || String(data?.error_description || tokenRes.status);
    return NextResponse.redirect(base + "/settings?ls_error=" + encodeURIComponent(err));
  }

  const refreshToken = (data as { refresh_token?: string })?.refresh_token;
  const scope = (data as { scope?: string })?.scope || "";
  const hasWebhooks = scope.split(/\s+/).includes("webhooks");

  if (!refreshToken) {
    return NextResponse.redirect(base + "/settings?ls_error=no_refresh_token");
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lightspeed Connected</title></head><body style="font-family:sans-serif;max-width:600px;margin:2rem auto;padding:1rem">
<h1>Lightspeed OAuth Complete</h1>
<p>Scopes granted: ${scope}</p>
${hasWebhooks ? "<p><strong>Webhooks scope is included.</strong></p>" : "<p style='color:orange'>Warning: webhooks scope not granted. Re-connect to add it.</p>"}
<p>Copy the refresh token below and add it to <code>LS_REFRESH_TOKEN</code> in Vercel (Settings → Environment Variables):</p>
<input type="text" value="${refreshToken.replace(/"/g, "&quot;")}" readonly style="width:100%;padding:8px;font-family:monospace" id="tok" />
<button onclick="navigator.clipboard.writeText(document.getElementById('tok').value)">Copy</button>
<p><a href="${base}/settings">Go to Settings</a></p>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
