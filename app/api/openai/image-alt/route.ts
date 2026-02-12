import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampAltLength(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117).trimEnd()}...`;
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl = normalizeText(body?.imageUrl);
    const itemType = normalizeText(body?.itemType) || "apparel item";
    if (!imageUrl) {
      return NextResponse.json({ error: "Missing imageUrl" }, { status: 400 });
    }

    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });
    const prompt = [
      "Act as an SEO specialist and accessibility expert.",
      "Analyze the product image and write optimized alt text based only on what is visually present.",
      "Do not use the product name.",
      "Write one natural-sounding sentence (80-120 characters).",
      "Include relevant descriptive keywords but avoid repetition or stuffing.",
      'Do not use promotional language like "best", "cheap", or "high quality".',
      "Return only the alt text.",
      `Item type context: ${itemType}.`,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    const rawAlt = normalizeText(completion.choices?.[0]?.message?.content || "");
    if (!rawAlt) {
      return NextResponse.json({ error: "Alt generation returned empty content." }, { status: 500 });
    }

    const altText = clampAltLength(rawAlt);
    return NextResponse.json({ altText });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate image alt text." },
      { status: 500 }
    );
  }
}

