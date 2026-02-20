import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { checkGenerateRateLimit } from "@/lib/ratelimit";
import {
  fetchRemoteImageBytes,
  getImageFetchMaxBytes,
  getImageFetchTimeoutMs,
  normalizeRemoteImageUrl,
} from "@/lib/remoteImage";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getClientKey(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || "unknown";
}

function normalizeReferenceUrls(values: unknown[], label: string) {
  const urls: string[] = [];
  const errors: string[] = [];
  values.forEach((value, idx) => {
    const raw = typeof value === "string" ? value : "";
    if (!raw.trim()) return;
    try {
      urls.push(normalizeRemoteImageUrl(raw));
    } catch (err: any) {
      errors.push(`${label} ref ${idx + 1}: ${err?.message || "Invalid URL"}`);
    }
  });
  return { urls, errors };
}

async function downloadReferenceAsBase64(url: string): Promise<{ mimeType: string; data: string }> {
  const { bytes, contentType } = await fetchRemoteImageBytes(url, {
    timeoutMs: getImageFetchTimeoutMs(),
    maxBytes: getImageFetchMaxBytes(),
  });
  return {
    mimeType: normalizeText(contentType) || "image/png",
    data: bytes.toString("base64"),
  };
}

function isAuthError(err: unknown) {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const message = String((err as any)?.message || "");
  if (status === 401 || status === 403) return true;
  return /api key|invalid key|unauthorized|forbidden/i.test(message);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const timer = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getImageTimeoutMs() {
  const rawText = (process.env.GEMINI_IMAGE_TIMEOUT_MS || process.env.OPENAI_IMAGE_TIMEOUT_MS || "").trim();
  if (!rawText) return 120000;
  const raw = Number(rawText);
  if (!Number.isFinite(raw)) return 120000;
  return Math.max(30000, Math.min(240000, Math.floor(raw)));
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limitKey = getClientKey(req);
    const limit = await checkGenerateRateLimit(limitKey);
    if (!limit.success) {
      return NextResponse.json(
        { error: "Too many generation requests. Please wait and try again." },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const itemType = normalizeText(body?.itemType) || "apparel item";
    const itemRefs = Array.isArray(body?.itemRefs) ? body.itemRefs : [];
    const normalization = normalizeReferenceUrls(itemRefs, "Item");
    const allRefs = normalization.urls;
    if (normalization.errors.length) {
      return NextResponse.json(
        {
          error: "Invalid or blocked item reference URLs.",
          details: normalization.errors.join(" | "),
        },
        { status: 400 }
      );
    }

    if (!allRefs.length) {
      return NextResponse.json(
        { error: "Please provide item references first (device/catalog)." },
        { status: 400 }
      );
    }

    const apiKey = normalizeText(process.env.GEMINI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY on server." }, { status: 500 });
    }

    const imageTimeoutMs = getImageTimeoutMs();
    const ai = new GoogleGenAI({ apiKey });
    const imageModel = normalizeText(process.env.GEMINI_IMAGE_MODEL) || "gemini-3-pro-image-preview";

    const downloaded = await Promise.allSettled(
      allRefs.slice(0, 10).map((url) => downloadReferenceAsBase64(url))
    );
    const referenceImages = downloaded
      .filter((r): r is PromiseFulfilledResult<{ mimeType: string; data: string }> => r.status === "fulfilled")
      .map((r) => r.value);

    if (!referenceImages.length) {
      return NextResponse.json(
        { error: "Could not download any item reference images." },
        { status: 400 }
      );
    }

    const prompt = [
      `Create one ecommerce flat-lay image for a ${itemType}.`,
      "Output must be a side-by-side two-view composition.",
      "Left side: front view. Right side: back view.",
      "Keep both views centered, same scale, and fully visible.",
      "No model, no person, no mannequin, no hanger, no hands, no props.",
      "Use clean pure white studio background only.",
      "DETAIL PRIORITY: maximize fidelity to item-reference details above all else.",
      "Match exact garment construction and small elements from references: stitching/topstitching, seam lines, panels, hems, cuffs, ribbing, closures, labels, logos, graphics, trims, hardware, and fabric texture.",
      "Preserve garment color, texture, logos, print placement, trims, and seams from references.",
      "If strings exist (drawstrings, laces, ties, cords), keep them naturally loose and open with relaxed drape; never tight, over-pulled, or fully cinched.",
      "FAIL-STYLE RULE: reject any tight-string styling. No closed knots, no tight bows, no hard cinching at hood, waist, neck, or hem.",
      "If a reference shows strings pulled tight, reinterpret them into a natural open relaxed state while preserving material and color.",
      "Keep silhouette and proportions true to references. Do not simplify or genericize details.",
      "If the back design is unclear in references, keep back clean and consistent with the front garment.",
      "Final look: premium flat ecommerce product photography with crisp high-detail rendering.",
      "Generate a single image output.",
    ].join("\n");

    const imageParts = referenceImages.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    }));

    const imageLabels = referenceImages.map((_, i) =>
      `- Image ${i + 1}: Item reference photo (replicate this exact garment's color, design, fabric, logos, prints, construction).`
    ).join("\n");

    const combinedPrompt = [
      "Reference images provided above:",
      imageLabels,
      "",
      "CRITICAL: The generated flat-lay MUST show the EXACT same garment from the reference images. Copy every detail exactly.",
      "",
      prompt,
    ].join("\n");

    const result = await withTimeout(
      ai.models.generateContent({
        model: imageModel,
        config: {
          responseModalities: ["IMAGE"],
          temperature: 0.4,
          imageConfig: {
            aspectRatio: "3:2",
            imageSize: "4K",
          },
        },
        contents: [
          ...imageParts,
          combinedPrompt,
        ],
      }),
      imageTimeoutMs,
      "Gemini item front/back generation"
    );

    let imageBase64: string | null = null;
    const candidates = result.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if ((part as any).inlineData?.data) {
          imageBase64 = (part as any).inlineData.data;
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Gemini returned no image for front/back generation." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageBase64,
      referencesUsed: referenceImages.length,
      size: "4096x2731",
    });
  } catch (e: any) {
    if (isAuthError(e)) {
      return NextResponse.json(
        {
          error:
            "Gemini authentication failed on server. Update GEMINI_API_KEY in production env and redeploy.",
        },
        { status: 500 }
      );
    }
    const status = Number(e?.status || e?.statusCode || 0);
    if (status === 429) {
      return NextResponse.json(
        { error: "Gemini rate limit reached. Please retry in a moment." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: e?.message || "Failed to generate front/back flat item image." },
      { status: 500 }
    );
  }
}
