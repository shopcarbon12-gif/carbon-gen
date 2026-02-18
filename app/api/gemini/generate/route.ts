import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { checkGenerateRateLimit } from "@/lib/ratelimit";
import {
  fetchRemoteImageBytes,
  getImageFetchMaxBytes,
  getImageFetchTimeoutMs,
  normalizeRemoteImageUrl,
} from "@/lib/remoteImage";

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
      urls.push(normalizeRemoteImageUrl(raw, { allowDataUrl: true }));
    } catch (err: any) {
      errors.push(`${label} ref ${idx + 1}: ${err?.message || "Invalid URL"}`);
    }
  });
  return { urls, errors };
}

function toMimeType(value: string) {
  const clean = String(value || "").split(";")[0]?.trim();
  return clean || "image/png";
}

function dataUrlToInlinePart(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid data URL.");
  }
  const header = dataUrl.slice(0, comma);
  const mime = header.split(":")[1]?.split(";")[0] || "image/png";
  const data = dataUrl.slice(comma + 1);
  return { inlineData: { data, mimeType: mime } };
}

function safeHostFromUrl(url: string) {
  try {
    return new URL(url).hostname || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

async function urlToInlinePart(url: string, index: number, label: "Model" | "Item") {
  if (url.startsWith("data:image/")) {
    return dataUrlToInlinePart(url);
  }
  try {
    const { bytes, contentType } = await fetchRemoteImageBytes(url, {
      timeoutMs: getImageFetchTimeoutMs(),
      maxBytes: getImageFetchMaxBytes(),
    });
    const data = Buffer.from(bytes).toString("base64");
    return { inlineData: { data, mimeType: toMimeType(contentType) } };
  } catch (err: any) {
    const host = safeHostFromUrl(url);
    const reason = err?.message || "Image fetch failed";
    console.error(`Gemini ref fetch failed (${label} #${index + 1})`, {
      host,
      url,
      reason,
    });
    throw new Error(`${label} ref ${index + 1} fetch failed (${host}): ${reason}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAuthed =
      (process.env.NODE_ENV !== "production" &&
        (process.env.AUTH_BYPASS || "false").trim().toLowerCase() === "true") ||
      req.cookies.get("carbon_gen_auth_v1")?.value === "true";
    if (!isAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const key = getClientKey(req);
    const rate: any = await checkGenerateRateLimit(key);
    if (!rate.success) {
      if (rate.error) {
        return NextResponse.json({ error: rate.error }, { status: 500 });
      }
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers:
            typeof rate.reset === "number"
              ? { "RateLimit-Reset": String(rate.reset) }
              : undefined,
        }
      );
    }

    const { prompt, modelRefs, itemRefs } = await req.json().catch(() => ({}));
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const modelRefValues = Array.isArray(modelRefs) ? modelRefs : [];
    const itemRefValues = Array.isArray(itemRefs) ? itemRefs : [];
    const modelRefNormalization = normalizeReferenceUrls(modelRefValues, "Model");
    const itemRefNormalization = normalizeReferenceUrls(itemRefValues, "Item");
    const normalizedModelRefs = modelRefNormalization.urls;
    const normalizedItemRefs = itemRefNormalization.urls;
    const refErrors = [...modelRefNormalization.errors, ...itemRefNormalization.errors];
    if (refErrors.length) {
      return NextResponse.json(
        {
          error: "Invalid or blocked reference image URLs.",
          details: refErrors.join(" | "),
        },
        { status: 400 }
      );
    }

    if (!normalizedModelRefs.length) {
      return NextResponse.json({ error: "Missing model reference images" }, { status: 400 });
    }
    if (!normalizedItemRefs.length) {
      return NextResponse.json({ error: "Missing item reference images" }, { status: 400 });
    }
    if (normalizedModelRefs.length < 3) {
      return NextResponse.json(
        {
          error:
            "Locked model is under-specified. Upload/select at least 3 model reference images before generating.",
        },
        { status: 400 }
      );
    }

    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Gemini is not configured. Set GEMINI_API_KEY (and implement the provider in this route).",
        },
        { status: 500 }
      );
    }

    const modelName =
      (process.env.GEMINI_IMAGE_MODEL || "").trim() || "gemini-3-pro-image-preview";

    const ai = new GoogleGenAI({ apiKey });

    const itemParts = await Promise.all(
      normalizedItemRefs.map((url, index) => urlToInlinePart(url, index, "Item"))
    );
    const modelParts = await Promise.all(
      normalizedModelRefs
        .slice(0, 6)
        .map((url, index) => urlToInlinePart(url, index, "Model"))
    );

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { text: "GARMENT REFERENCE IMAGES (Item identity, color, and texture):" },
          ...itemParts,
          { text: "MODEL IDENTITY REFERENCE IMAGES (Target face, skin, and body for generation):" },
          ...modelParts,
          { text: prompt },
        ],
      },
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    const parts = response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part?.inlineData?.data) {
        return NextResponse.json({ imageBase64: part.inlineData.data });
      }
    }

    return NextResponse.json({ error: "No image data returned from Gemini." }, { status: 502 });
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : "Gemini generate failed";
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
