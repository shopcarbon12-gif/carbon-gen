import crypto from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Meta "Data deletion request" callback (App settings → Basic).
 * POST with form field `signed_request`. Responds with { url, confirmation_code } per Meta docs.
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

function base64UrlDecodeToString(input: string) {
  const padLen = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseSignedRequest(
  signedRequest: string,
  secret: string,
): { userId: string; raw: Record<string, unknown> } | null {
  const [encodedSig, payload] = signedRequest.split(".", 2);
  if (!encodedSig || !payload) return null;

  const sig = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest();
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  const raw = JSON.parse(base64UrlDecodeToString(payload)) as Record<string, unknown>;
  const userId = String(raw.user_id ?? "");
  if (!userId) return null;
  return { userId, raw };
}

/** Meta / health probes may GET this URL when validating the callback field. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    purpose: "facebook_data_deletion_callback",
    docs: "https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback",
  });
}

/** Some crawlers probe with HEAD; respond quickly with 2xx and no body. */
export async function HEAD() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const secret = String(process.env.META_APP_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ error: "META_APP_SECRET not configured" }, { status: 503 });
  }

  let signedRequest = "";
  const contentType = (req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    signedRequest = String(form.get("signed_request") || "");
  } else {
    try {
      const body = (await req.json()) as { signed_request?: string };
      signedRequest = String(body?.signed_request || "");
    } catch {
      signedRequest = "";
    }
  }

  if (!signedRequest) {
    return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
  }

  const parsed = parseSignedRequest(signedRequest, secret);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  const confirmationCode = crypto.randomBytes(16).toString("hex");
  const statusPage = new URL("https://shopcarbon.com/pages/facebook-data-deletion");
  statusPage.searchParams.set("data_deletion_request", confirmationCode);

  // TODO: enqueue deletion for Meta app-scoped user id `parsed.userId` when you store Facebook-linked users.

  return NextResponse.json({
    url: statusPage.toString(),
    confirmation_code: confirmationCode,
  });
}
