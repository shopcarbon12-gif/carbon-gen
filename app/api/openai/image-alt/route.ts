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

async function toModelImageUrl(rawUrl: string) {
  const url = normalizeText(rawUrl);
  if (!url) return "";
  if (url.startsWith("data:image/")) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const resp = await fetch(url, {
      headers: { Accept: "image/*,*/*;q=0.8", "User-Agent": "Mozilla/5.0" },
    });
    if (!resp.ok) return url;
    const contentType = normalizeText(resp.headers.get("content-type")) || "image/png";
    const bytes = Buffer.from(await resp.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return url;
  }
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

    const modelImageUrl = await toModelImageUrl(imageUrl);
    let rawAlt = "";
    try {
      const response = await client.responses.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_output_tokens: 180,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: modelImageUrl || imageUrl, detail: "auto" },
            ],
          },
        ],
      });
      rawAlt = normalizeText(response.output_text || "");
    } catch {
      rawAlt = "";
    }

    if (!rawAlt) {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: modelImageUrl || imageUrl } },
            ],
          },
        ],
      });
      rawAlt = normalizeText(completion.choices?.[0]?.message?.content || "");
    }

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
