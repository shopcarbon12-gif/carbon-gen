import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const prompt = normalizeText(body?.prompt);
  const itemType = normalizeText(body?.itemType) || "apparel product";

  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const directedPrompt = [
    `Professional ecommerce image of ${itemType}.`,
    "Lighting: clean studio softbox, neutral white background.",
    "Framing: product-forward, retail catalog quality, no clutter.",
    `Base intent: ${prompt}`,
  ].join(" ");

  return NextResponse.json({
    prompt: directedPrompt,
    source: "local-director",
  });
}
