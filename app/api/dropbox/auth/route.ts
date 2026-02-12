import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSession } from "@/lib/userAuth";
import { getDropboxConfig } from "@/lib/dropbox";

export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { appKey, redirectUri } = getDropboxConfig();
  if (!appKey || !redirectUri) {
    return NextResponse.json(
      { error: "Dropbox OAuth is not configured. Missing DROPBOX_APP_KEY or DROPBOX_REDIRECT_URI." },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  const returnTo = String(req.nextUrl.searchParams.get("returnTo") || "/settings").trim() || "/settings";
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.searchParams.set("client_id", appKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("token_access_type", "offline");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set({
    name: "carbon_gen_dropbox_oauth_state",
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  res.cookies.set({
    name: "carbon_gen_dropbox_oauth_return_to",
    value: returnTo,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}

