import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { resolvePublicAppOrigin } from "@/lib/resolvePublicAppOrigin";
import { readSession } from "@/lib/userAuth";
import { metaAuthorizeUrl } from "@/lib/instagram-meta-oauth";
import { META_OAUTH_STATE_COOKIE, metaRedirectUri } from "@/lib/instagram-meta-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start the Meta connect flow — the target of the studio's "Connect Instagram"
 * button. Mints a one-shot state, stores it in a cookie for the callback to
 * check, and hands the operator to Meta's login dialog.
 */
export async function GET(req: NextRequest) {
  const session = readSession(req);
  const base = resolvePublicAppOrigin(req);

  if (!session.isAuthed) {
    const login = new URL("/login", base);
    login.searchParams.set("next", "/api/instagram/meta/connect");
    return NextResponse.redirect(login);
  }

  const appId = String(process.env.META_APP_ID || "").trim();
  if (!appId) {
    const back = new URL("/studio/instagram-widget/sources", base);
    back.searchParams.set(
      "meta_instagram_error",
      "META_APP_ID is not set on the server. Add META_APP_ID and META_APP_SECRET, then try again.",
    );
    return NextResponse.redirect(back);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(
    metaAuthorizeUrl({ appId, redirectUri: metaRedirectUri(base), state }),
  );
  res.cookies.set({
    name: META_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",   /* must survive the redirect back from facebook.com */
    secure: base.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  return res;
}
