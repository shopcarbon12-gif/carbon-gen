import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isCronAuthed } from "@/lib/auth";
import { completeShopifyPrintBridgeJob } from "@/lib/shopifyPrintBridgeQueue";

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
    const id = normalizeText(body?.id);
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await completeShopifyPrintBridgeJob({
      id,
      success: body?.success === true,
      error: normalizeText(body?.error),
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: normalizeText((e as { message?: string } | null)?.message) || "Failed to update job" },
      { status: 500 }
    );
  }
}
