/**
 * Registers a sale/refund webhook with Lightspeed Retail API.
 * Call: POST /api/lightspeed/webhooks/register
 * Auth: CRON_SECRET or session
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshLightspeedRetailToken } from "@/lib/lightspeedApi";
import { isRequestAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function isAuthorized(req: NextRequest): boolean {
  if (isRequestAuthed(req)) return true;
  const secret = normalizeText(process.env.CRON_SECRET);
  if (!secret) return false;
  const auth = normalizeText(req.headers.get("authorization"));
  if (auth === `Bearer ${secret}`) return true;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("secret") === secret) return true;
  } catch { }
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let domainPrefix = normalizeText(process.env.LS_DOMAIN_PREFIX).toLowerCase();
  if (!domainPrefix) {
    try {
      const body = await req.json().catch(() => ({}));
      domainPrefix = normalizeText((body as { domainPrefix?: string })?.domainPrefix).toLowerCase();
    } catch { }
  }
  if (!domainPrefix) {
    return NextResponse.json(
      { ok: false, error: "LS_DOMAIN_PREFIX is required. Set it in Vercel env or pass { domainPrefix: 'us' } in the request body." },
      { status: 400 }
    );
  }

  const base = normalizeText(process.env.NEXT_PUBLIC_BASE_URL) || "https://app.shopcarbon.com";
  const callbackUrl = `${base.replace(/\/$/, "")}/api/lightspeed/webhooks/sale-update`;

  try {
    const token = await refreshLightspeedRetailToken(domainPrefix);
    const webhooksUrl = `https://${domainPrefix}.retail.lightspeed.app/api/2.0/webhooks`;

    // Try both JSON and form-encoded; Lightspeed docs vary by endpoint
    const jsonBody = { uri: callbackUrl, subscriptionScope: "sale.update" };
    const formBody = new URLSearchParams({ uri: callbackUrl, subscriptionScope: "sale.update" }).toString();

    let res = await fetch(webhooksUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(jsonBody),
    });

    if (res.status === 403 || res.status === 400) {
      res = await fetch(webhooksUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formBody,
      });
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const raw = String((data as { message?: string })?.message ?? (data as { error?: string })?.error ?? "").toLowerCase();
      let hint = "";
      if (raw.includes("token") || raw.includes("access") || raw.includes("invalid")) {
        hint = " Re-connect Lightspeed in Settings to refresh the token.";
      } else if (res.status === 403) {
        hint =
          " App may lack webhooks scope. Try adding manually: open https://us.merchantos.com/setup/api in Lightspeed and add webhook there.";
      }
      return NextResponse.json(
        {
          ok: false,
          error: ((data as { message?: string })?.message || (data as { error?: string })?.error || `HTTP ${res.status}`) + hint,
          detail: data,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Webhook registered.",
      callbackUrl,
      webhook: data,
    });
  } catch (e: unknown) {
    const msg = normalizeText((e as { message?: string } | null)?.message) || "Webhook registration failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
