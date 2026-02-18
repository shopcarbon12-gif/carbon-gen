import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import { checkGenerateRateLimit } from "@/lib/ratelimit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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

function extFromContentType(contentType: string) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  return "png";
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

async function downloadReferenceAsFile(url: string, index: number) {
  const attempts = [url];
  const encoded = encodeURI(url);
  if (encoded !== url) attempts.push(encoded);

  let lastError: string | null = null;
  for (const attempt of attempts) {
    try {
      const { bytes, contentType } = await fetchRemoteImageBytes(attempt, {
        timeoutMs: getImageFetchTimeoutMs(),
        maxBytes: getImageFetchMaxBytes(),
      });
      const ext = extFromContentType(contentType);
      return toFile(bytes, `item-ref-${index + 1}.${ext}`, { type: contentType });
    } catch (err: any) {
      lastError = err?.message || "Image fetch failed";
    }
  }

  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/";
    const pos = parsed.pathname.indexOf(marker);
    if (pos >= 0) {
      const rest = parsed.pathname.slice(pos + marker.length);
      const slash = rest.indexOf("/");
      if (slash > 0) {
        const bucket = rest.slice(0, slash);
        const objectPath = decodeURIComponent(rest.slice(slash + 1));
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.storage.from(bucket).download(objectPath);
        if (!error && data) {
          const contentType = data.type || "image/png";
          const ext = extFromContentType(contentType);
          const bytes = Buffer.from(await data.arrayBuffer());
          return toFile(bytes, `item-ref-${index + 1}.${ext}`, { type: contentType });
        }
      }
    }
  } catch {
    // Keep original error below.
  }

  throw new Error(
    `Item reference image fetch failed at index ${index + 1}${
      lastError ? ` (${lastError})` : ""
    }`
  );
}

function isOpenAiAuthError(err: unknown) {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const message = String((err as any)?.message || "");
  if (status === 401) return true;
  return /incorrect api key|invalid api key|api key provided/i.test(message);
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
  const rawText = (process.env.OPENAI_IMAGE_TIMEOUT_MS || "").trim();
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

    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY on server." }, { status: 500 });
    }

    const imageTimeoutMs = getImageTimeoutMs();
    const imageModel = (process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5").trim() || "gpt-image-1.5";

    const downloaded = await Promise.allSettled(
      allRefs.slice(0, 10).map((url, index) => downloadReferenceAsFile(url, index))
    );
    const referenceFiles = downloaded
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof downloadReferenceAsFile>>> => r.status === "fulfilled")
      .map((r) => r.value);

    if (!referenceFiles.length) {
      return NextResponse.json(
        { error: "Could not download any item reference images." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });
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
    ].join("\n");

    const edited = await withTimeout(
      openai.images.edit({
        model: imageModel,
        image: referenceFiles,
        prompt,
        size: "1536x1024",
        quality: "high",
        input_fidelity: "high",
      }),
      imageTimeoutMs,
      "OpenAI item front/back generation"
    );

    const imageBase64 = edited.data?.[0]?.b64_json ?? null;
    if (!imageBase64) {
      return NextResponse.json(
        { error: "OpenAI returned no image for front/back generation." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      imageBase64,
      referencesUsed: referenceFiles.length,
      size: "1536x1024",
    });
  } catch (e: any) {
    if (isOpenAiAuthError(e)) {
      return NextResponse.json(
        {
          error:
            "OpenAI authentication failed on server. Update OPENAI_API_KEY in production env and redeploy.",
        },
        { status: 500 }
      );
    }
    const status = Number(e?.status || e?.statusCode || 0);
    if (status === 429) {
      return NextResponse.json(
        { error: "OpenAI rate limit reached. Please retry in a moment." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: e?.message || "Failed to generate front/back flat item image." },
      { status: 500 }
    );
  }
}
