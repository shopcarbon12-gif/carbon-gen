import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isCronAuthed } from "@/lib/auth";
import { claimNextShopifyPrintBridgeJob } from "@/lib/shopifyPrintBridgeQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  if (!isCronAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const workerId = normalizeText(body?.workerId || req.headers.get("x-worker-id")) || "bridge-worker";
    const job = await claimNextShopifyPrintBridgeJob(workerId);
    return NextResponse.json({ ok: true, job: job || null });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: normalizeText((e as { message?: string } | null)?.message) || "Failed to claim job" },
      { status: 500 }
    );
  }
}
