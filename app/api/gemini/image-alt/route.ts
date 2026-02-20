import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import {
  assertDataUrlSize,
  fetchRemoteImageBytes,
  getImageFetchMaxBytes,
  getImageFetchTimeoutMs,
  normalizeRemoteImageUrl,
} from "@/lib/remoteImage";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampAltLength(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117).trimEnd()}...`;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const idx = dataUrl.indexOf(";base64,");
  if (idx < 0 || !dataUrl.startsWith("data:")) return null;
  const mimeType = dataUrl.slice(5, idx);
  const data = dataUrl.slice(idx + 8);
  if (!mimeType || !data) return null;
  return { mimeType, data };
}

async function toGeminiImagePart(rawUrl: string): Promise<{ inlineData: { mimeType: string; data: string } }> {
  const url = normalizeText(rawUrl);
  if (!url) throw new Error("Empty image URL");

  if (url.startsWith("data:image/")) {
    assertDataUrlSize(url, getImageFetchMaxBytes());
    const parsed = parseDataUrl(url);
    if (!parsed) throw new Error("Invalid data URL format");
    return { inlineData: parsed };
  }

  const safeUrl = normalizeRemoteImageUrl(url);
  const { bytes, contentType } = await fetchRemoteImageBytes(safeUrl, {
    timeoutMs: getImageFetchTimeoutMs(),
    maxBytes: getImageFetchMaxBytes(),
  });
  return {
    inlineData: {
      mimeType: normalizeText(contentType) || "image/png",
      data: bytes.toString("base64"),
    },
  };
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

    const apiKey = normalizeText(process.env.GEMINI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = normalizeText(process.env.GEMINI_VISION_MODEL) || "gemini-2.5-flash";

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

    let imagePart: { inlineData: { mimeType: string; data: string } };
    try {
      imagePart = await toGeminiImagePart(imageUrl);
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Invalid or blocked image URL." },
        { status: 400 }
      );
    }

    const response = await ai.models.generateContent({
      model,
      config: { temperature: 0.2, maxOutputTokens: 180 },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, imagePart],
        },
      ],
    });

    const rawAlt = normalizeText(response.text || "");
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
