import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShopDomain } from "@/lib/shopify";

function verifyHmac(query: URLSearchParams, secret: string) {
  const hmac = (query.get("hmac") || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hmac)) return false;

  const entries = Array.from(query.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(entries).digest("hex");
  return timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { searchParams } = url;

    const shop = normalizeShopDomain(searchParams.get("shop") || "");
    const code = (searchParams.get("code") || "").trim();
    const state = (searchParams.get("state") || "").trim();

    const clientId = (process.env.SHOPIFY_APP_CLIENT_ID || "").trim();
    const clientSecret = (process.env.SHOPIFY_APP_CLIENT_SECRET || "").trim();
    const redirectUri = (process.env.SHOPIFY_REDIRECT_URI || "").trim();

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json({ error: "Missing Shopify app config." }, { status: 500 });
    }
    if (!shop) {
      return NextResponse.json({ error: "Invalid OAuth shop." }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: "Missing OAuth code." }, { status: 400 });
    }

    const cookieState = req.cookies.get("shopify_oauth_state")?.value || "";
    if (!cookieState || !state || cookieState !== state) {
      return NextResponse.json({ error: "Invalid OAuth state." }, { status: 400 });
    }

    if (!verifyHmac(searchParams, clientSecret)) {
      return NextResponse.json({ error: "Invalid OAuth HMAC." }, { status: 400 });
    }

    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenText = await tokenResp.text();
    let tokenJson: any = null;
    try {
      tokenJson = tokenText ? JSON.parse(tokenText) : null;
    } catch {
      tokenJson = null;
    }

    if (!tokenResp.ok || !tokenJson?.access_token) {
      const contentType = tokenResp.headers.get("content-type") || "";
      const shopifyFailureReason =
        tokenResp.headers.get("x-shopify-api-request-failure-reason") || "";
      const jsonError =
        tokenJson?.error_description || tokenJson?.error || tokenJson?.errors || null;
      const htmlSnippet = !tokenJson ? tokenText.slice(0, 160) : null;
      return NextResponse.json(
        {
          error: "Failed to fetch access token.",
          details: jsonError || "Unexpected non-JSON response from Shopify.",
          shop,
          status: tokenResp.status,
          contentType,
          shopifyFailureReason: shopifyFailureReason || null,
          responseSnippet: htmlSnippet,
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("shopify_tokens").upsert(
      {
        shop,
        access_token: tokenJson.access_token,
        scope: tokenJson.scope || null,
        installed_at: new Date().toISOString(),
      },
      { onConflict: "shop" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const publicBase = new URL(redirectUri).origin;
    const redirectTarget = new URL("/settings", publicBase);
    redirectTarget.searchParams.set("shop", shop);
    redirectTarget.searchParams.set("connected", "1");
    const res = NextResponse.redirect(redirectTarget.toString());
    res.cookies.set("shopify_oauth_state", "", {
      maxAge: 0,
      sameSite: "none",
      secure: true,
      path: "/",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Shopify callback failed." },
      { status: 500 }
    );
  }
}
