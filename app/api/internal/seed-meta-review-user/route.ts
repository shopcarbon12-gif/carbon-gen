import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { constantTimeBearerMatches, ensureMetaReviewUser } from "@/lib/ensureMetaReviewUser";

export const runtime = "nodejs";

/**
 * One-time / rare: creates `meta-review@shopcarbon.com` (role meta_review) on the deployment DB.
 *
 * POST with header:
 *   Authorization: Bearer <META_REVIEW_SEED_API_SECRET>
 * Body JSON:
 *   { "password": "..." }   (min 8 chars; omit to use META_REVIEW_SEED_PASSWORD env on the server)
 *
 * Remove META_REVIEW_SEED_API_SECRET from env after use.
 */
export async function POST(req: NextRequest) {
  const apiSecret = String(process.env.META_REVIEW_SEED_API_SECRET || "").trim();
  if (!apiSecret) {
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 403 });
  }

  if (!constantTimeBearerMatches(apiSecret, req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { password?: string } = {};
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    body = {};
  }

  const fromBody = String(body?.password || "").trim();
  const fromEnv = String(process.env.META_REVIEW_SEED_PASSWORD || "").trim();
  const password = fromBody || fromEnv;
  if (!password || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Provide password in JSON body or set META_REVIEW_SEED_PASSWORD (min 8 chars)." },
      { status: 400 }
    );
  }

  try {
    const result = await ensureMetaReviewUser(password);
    return NextResponse.json(result);
  } catch (e: any) {
    const message = String(e?.message || "Seed failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
