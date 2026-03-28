import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolvePublicAppOrigin } from "@/lib/resolvePublicAppOrigin";
import { readSession } from "@/lib/userAuth";

/**
 * Meta / Facebook Login OAuth redirect target (Instagram Graph setup).
 * Registered in Meta → Facebook Login → Settings → Valid OAuth Redirect URIs.
 * Token exchange and state validation will be added when the connect flow is built.
 */
export async function GET(req: NextRequest) {
  const session = readSession(req);
  if (!session.isAuthed) {
    const login = new URL("/login", resolvePublicAppOrigin(req));
    login.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  const base = resolvePublicAppOrigin(req);
  const err =
    String(req.nextUrl.searchParams.get("error_description") || "").trim() ||
    String(req.nextUrl.searchParams.get("error") || "").trim();
  if (err) {
    return NextResponse.redirect(
      new URL(`/settings?meta_instagram_error=${encodeURIComponent(err)}`, base),
    );
  }

  const code = String(req.nextUrl.searchParams.get("code") || "").trim();
  if (code) {
    return NextResponse.redirect(
      new URL(
        `/settings?meta_instagram_notice=${encodeURIComponent("Meta OAuth code received. Token exchange is not wired yet — add META_APP_SECRET and complete the connect flow.")}`,
        base,
      ),
    );
  }

  return NextResponse.redirect(new URL("/settings", base));
}
