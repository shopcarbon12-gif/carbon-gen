import OpenAI from "openai";
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

function sanitizeItemType(value: unknown) {
  const text = normalizeText(value)
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.;:!?]+$/g, "");
  if (!text) return "";
  return text.length > 60 ? text.slice(0, 60).trim() : text;
}

async function toModelImageUrl(rawUrl: string) {
  const url = normalizeText(rawUrl);
  if (!url) return "";
  if (url.startsWith("data:image/")) {
    assertDataUrlSize(url, getImageFetchMaxBytes());
    return url;
  }

  const safeUrl = normalizeRemoteImageUrl(url);
  const { bytes, contentType } = await fetchRemoteImageBytes(safeUrl, {
    timeoutMs: getImageFetchTimeoutMs(),
    maxBytes: getImageFetchMaxBytes(),
  });
  return `data:${normalizeText(contentType) || "image/png"};base64,${bytes.toString("base64")}`;
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const imageUrl = normalizeText(body?.imageUrl);
    const imageDataUrl = normalizeText(body?.imageDataUrl);
    if (!imageUrl && !imageDataUrl) {
      return NextResponse.json({ error: "Missing imageUrl or imageDataUrl" }, { status: 400 });
    }

    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });
    let sourceImage = "";
    try {
      if (imageDataUrl) {
        assertDataUrlSize(imageDataUrl, getImageFetchMaxBytes());
        sourceImage = imageDataUrl;
      } else {
        sourceImage = await toModelImageUrl(imageUrl);
      }
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Invalid or blocked image URL." },
        { status: 400 }
      );
    }
    const prompt = [
      "You are a fashion ecommerce classifier.",
      "Identify the primary clothing product type in this image.",
      "Return only one short lowercase phrase (1 to 4 words).",
      "Examples: hoodie, t-shirt, tank top, jeans, cargo pants, skirt, dress, jacket, coat, shorts, sweater, sweatshirt, blazer, jumpsuit, swimsuit.",
      "If uncertain, return: apparel item.",
      "Return only the clothing type phrase and nothing else.",
    ].join("\n");

    let raw = "";
    try {
      const response = await client.responses.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_output_tokens: 40,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: sourceImage || imageUrl, detail: "auto" },
            ],
          },
        ],
      });
      raw = normalizeText(response.output_text || "");
    } catch {
      raw = "";
    }

    if (!raw) {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 40,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: sourceImage || imageUrl } },
            ],
          },
        ],
      });
      raw = normalizeText(completion.choices?.[0]?.message?.content || "");
    }

    const itemType = sanitizeItemType(raw) || "apparel item";
    return NextResponse.json({ itemType });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to detect clothing type." },
      { status: 500 }
    );
  }
}
