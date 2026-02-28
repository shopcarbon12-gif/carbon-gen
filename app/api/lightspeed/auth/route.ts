/**
 * Starts Lightspeed OAuth with webhooks scope.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = "products:read sales:read customers:read inventory:read webhooks";

export async function GET(req: Request) {
  const clientId = String(process.env.LS_CLIENT_ID || "").trim();
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || "https://carbon-gen-iota.vercel.app").replace(/\/$/, "");
  const redirectUri = String(process.env.LS_REDIRECT_URI || "").trim() || base + "/api/lightspeed/callback";

  if (!clientId) {
    return NextResponse.redirect(base + "/settings?ls_error=missing_client_id");
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("ls_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
  });

  return NextResponse.redirect("https://secure.retail.lightspeed.app/connect?" + params.toString());
}
