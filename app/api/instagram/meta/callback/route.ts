import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolvePublicAppOrigin } from "@/lib/resolvePublicAppOrigin";
import { readSession } from "@/lib/userAuth";
import { exchangeCodeForConnection } from "@/lib/instagram-meta-oauth";
import { writeInstagramConnection } from "@/lib/instagramConnectionRepository";
import { META_OAUTH_STATE_COOKIE, metaRedirectUri } from "@/lib/instagram-meta-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta / Facebook Login OAuth redirect target (Instagram Graph setup).
 * Registered in Meta → Facebook Login → Settings → Valid OAuth Redirect URIs.
 *
 * Completes the connect flow: exchanges the code for a long-lived Page access
 * token and stores it, so the storefront feed has credentials without anyone
 * pasting a token into an environment variable.
 */
export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    const login = new URL("/login", resolvePublicAppOrigin(req));
    login.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const base = resolvePublicAppOrigin(req);
  const settled = (params: Record<string, string>) => {
    const url = new URL("/studio/instagram-widget/sources", base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    /* One-shot state: cleared however this ends, so a stale value cannot be
       replayed against a later attempt. */
    res.cookies.set({ name: META_OAUTH_STATE_COOKIE, value: "", path: "/", maxAge: 0 });
    return res;
  };

  const err =
    String(req.nextUrl.searchParams.get("error_description") || "").trim() ||
    String(req.nextUrl.searchParams.get("error") || "").trim();
  if (err) return settled({ meta_instagram_error: err });

  const code = String(req.nextUrl.searchParams.get("code") || "").trim();
  if (!code) return settled({ meta_instagram_error: "Meta returned no authorization code." });

  /* CSRF: the state minted before redirecting must come back unchanged. */
  const expected = req.cookies.get(META_OAUTH_STATE_COOKIE)?.value || "";
  const got = String(req.nextUrl.searchParams.get("state") || "");
  if (!expected || !got || expected !== got) {
    return settled({
      meta_instagram_error:
        "Connection expired or was started in another tab. Try connecting again.",
    });
  }

  const appId = String(process.env.META_APP_ID || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  if (!appId || !appSecret) {
    return settled({
      meta_instagram_error:
        "META_APP_ID and META_APP_SECRET must be set on the server before connecting.",
    });
  }

  const result = await exchangeCodeForConnection({
    code,
    appId,
    appSecret,
    redirectUri: metaRedirectUri(base),
  });
  if (!result.ok) return settled({ meta_instagram_error: result.error });

  try {
    await writeInstagramConnection(result.connection);
  } catch (e) {
    console.error("[instagram-connect] could not store connection:", e);
    return settled({
      meta_instagram_error: "Connected to Meta, but saving the connection failed.",
    });
  }

  return settled({
    meta_instagram_connected:
      result.connection.username || result.connection.pageName || "1",
  });
}
