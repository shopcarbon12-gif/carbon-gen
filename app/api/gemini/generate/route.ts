import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkGenerateRateLimit } from "@/lib/ratelimit";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fetchRemoteImageBytes,
  getImageFetchMaxBytes,
  getImageFetchTimeoutMs,
  normalizeRemoteImageUrl,
} from "@/lib/remoteImage";

const FALLBACK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAFx0lEQVR42u3UwQkAIBDAMHX/nc8lBK4jUZBkn2tmdgDg53YHAH4MIAgQCBAECAQIAgQCBAECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIBggCBAEEAQYBAgCBAIEAQIBAgECAIEAQQBAgECAIEAgQBAgECAQIhD8eQ9JCmqo2AAAAAElFTkSuQmCC";

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

type RefImageData = { mimeType: string; data: string; url: string };

async function downloadReferenceAsBase64(url: string, index: number): Promise<RefImageData> {
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
      return {
        mimeType: String(contentType || "image/png"),
        data: bytes.toString("base64"),
        url,
      };
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
          const bytes = Buffer.from(await data.arrayBuffer());
          return { mimeType: contentType, data: bytes.toString("base64"), url };
        }
      }
    }
  } catch { /* keep original error */ }

  throw new Error(
    `Reference image fetch failed at index ${index + 1}${lastError ? ` (${lastError})` : ""}`
  );
}

function buildReferenceDownloadErrorDetails(params: {
  allRefs: string[];
  downloaded: PromiseSettledResult<RefImageData>[];
  modelFilesCount: number;
  itemFilesCount: number;
  modelAnchorCount: number;
  itemAnchorCount: number;
}) {
  const { allRefs, downloaded, modelFilesCount, itemFilesCount, modelAnchorCount, itemAnchorCount } =
    params;
  const failedIndexes = downloaded
    .map((result, idx) => ({ result, idx }))
    .filter(({ result }) => result.status === "rejected")
    .map(({ idx }) => idx + 1);
  const malformedCount = allRefs.filter((url) => /%0d|%0a|\r|\n/i.test(String(url || ""))).length;
  const total = allRefs.length;
  const failed = failedIndexes.length;

  const notes: string[] = [];
  if (modelAnchorCount > 0 && modelFilesCount === 0) notes.push("No model reference image could be downloaded.");
  if (itemAnchorCount > 0 && itemFilesCount === 0) notes.push("No item reference image could be downloaded.");
  if (malformedCount > 0) notes.push("Some reference links are malformed (line-break characters detected).");
  if (!notes.length) notes.push("Please re-upload the reference images and try again.");

  return { details: `Failed to download ${failed}/${total} reference image(s). ${notes.join(" ")}`, failedIndexes };
}

function fallbackGenerateResponse(reason: string) {
  return NextResponse.json({ imageBase64: FALLBACK_PNG_BASE64, degraded: true, warning: reason });
}

function isAuthError(err: unknown) {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const message = String((err as any)?.message || "");
  if (status === 401 || status === 403) return true;
  return /api key|invalid key|unauthorized|forbidden/i.test(message);
}

function buildSwimwearSafetyRetryPrompt(basePrompt: string) {
  return [
    basePrompt, "",
    "SWIMWEAR RETRY SAFETY MODE:",
    "- Professional ecommerce catalog image only.",
    "- Adult model (25+) in standard commercial swimwear presentation.",
    "- Neutral pose, neutral expression, non-suggestive composition.",
    "- No erotic intent, no intimate framing, no provocative posture.",
    "- Focus on garment fit, color, and material details.",
    "- Seamless pure white studio background only.",
  ].join("\n");
}

function buildGeneralSafetyRetryPrompt(basePrompt: string) {
  return [
    basePrompt, "",
    "Safety clarification: professional ecommerce apparel photos only.",
    "No nudity, no sexual context, neutral product-photography presentation.",
    "Background lock: seamless pure white studio background only (#FFFFFF), no tint.",
  ].join("\n");
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

type PanelQaInput = {
  panelNumber: number | null;
  panelLabel: string;
  poseA: number | null;
  poseB: number | null;
  modelName: string;
  modelGender: string;
  itemType: string;
};

function isFullBodyPose(gender: string, pose: number | null) {
  if (!Number.isFinite(Number(pose))) return false;
  const p = Number(pose);
  const g = String(gender || "").trim().toLowerCase();
  if (g === "female") return p === 1 || p === 2 || p === 3 || p === 6;
  return p === 1 || p === 2 || p === 4;
}

function isBackFacingPose(gender: string, pose: number | null) {
  if (!Number.isFinite(Number(pose))) return false;
  const p = Number(pose);
  const g = String(gender || "").trim().toLowerCase();
  if (g === "female") return p === 2;
  return p === 4 || p === 7;
}

function inferItemTypeCategory(itemTypeValue: string) {
  const t = String(itemTypeValue || "").trim().toLowerCase();
  if (!t) return "item";
  const has = (...keywords: string[]) => keywords.some((kw) => t.includes(kw));
  if (has("full look", "full-look", "outfit", "set", "matching set", "two piece", "two-piece", "co-ord", "co ord")) return "full-look";
  if (has("shirt", "tee", "t-shirt", "tshirt", "tank", "top", "blouse", "hoodie", "crewneck", "sweatshirt", "sweater", "polo", "jersey", "vest", "cardigan", "button-down", "button down")) return "top";
  if (has("pant", "pants", "jean", "jeans", "short", "shorts", "skirt", "legging", "jogger", "cargo", "trouser", "bottom")) return "bottom";
  if (has("shoe", "sneaker", "boot", "heel", "sandal", "loafer", "trainer", "footwear")) return "footwear";
  if (has("jacket", "coat", "puffer", "overshirt", "outerwear", "windbreaker", "blazer")) return "outerwear";
  if (has("bag", "hat", "cap", "belt", "scarf", "sock", "socks", "accessory", "jewelry", "jewellery", "watch", "glove", "gloves")) return "accessory";
  return "item";
}

function isSwimwearItemType(itemTypeValue: string) {
  const t = String(itemTypeValue || "").trim().toLowerCase();
  if (!t) return false;
  return t.includes("swimwear") || t.includes("swim short") || t.includes("swimshort") || t.includes("swim trunk") || t.includes("swim trunks") || t.includes("bikini") || t.includes("one-piece swimsuit") || t.includes("one piece swimsuit") || t.includes("swimsuit");
}

function getCloseUpCategoryQaRule(itemTypeValue: string) {
  const category = inferItemTypeCategory(itemTypeValue);
  if (category === "top") return "Expected close-up category: TOP only (not shorts/pants/shoes).";
  if (category === "bottom") return "Expected close-up category: BOTTOM only (not tops/shoes).";
  if (category === "footwear") return "Expected close-up category: FOOTWEAR only.";
  if (category === "outerwear") return "Expected close-up category: OUTERWEAR only.";
  if (category === "accessory") return "Expected close-up category: ACCESSORY only.";
  if (category === "full-look") return "Expected close-up category: one hero detail from the locked full look.";
  return "Expected close-up category: must match the exact section 0.5 item type.";
}

function hasPanel3CloseUpSubjectLock(panelQa: PanelQaInput) {
  const g = String(panelQa.modelGender || "").trim().toLowerCase();
  const panelNumber = Number(panelQa.panelNumber);
  const rightPose = Number(panelQa.poseB);
  if (!Number.isFinite(panelNumber) || !Number.isFinite(rightPose)) return false;
  if (g === "female") return panelNumber === 3 && rightPose === 5;
  return panelNumber === 3 && rightPose === 6;
}

function sanitizeText(value: unknown, maxLen = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function toIntOrNull(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normalizePanelQa(value: any): PanelQaInput {
  return {
    panelNumber: toIntOrNull(value?.panelNumber),
    panelLabel: sanitizeText(value?.panelLabel, 120),
    poseA: toIntOrNull(value?.poseA),
    poseB: toIntOrNull(value?.poseB),
    modelName: sanitizeText(value?.modelName, 120),
    modelGender: sanitizeText(value?.modelGender, 32).toLowerCase(),
    itemType: sanitizeText(value?.itemType, 120),
  };
}

function buildServerIdentityLockPrompt(panelQa: PanelQaInput) {
  const modelName = panelQa.modelName || "locked model";
  const modelGender = panelQa.modelGender || "model";
  const lockedItemType = panelQa.itemType || "apparel item";
  const backLockActive = isBackFacingPose(panelQa.modelGender, panelQa.poseA) || isBackFacingPose(panelQa.modelGender, panelQa.poseB);
  return [
    "SERVER-ENFORCED IDENTITY LOCK (NON-NEGOTIABLE):",
    `- Use ONLY MODEL reference images for person identity (${modelName}, ${modelGender}).`,
    "- Keep the same exact facial geometry from model refs: eye shape/spacing, nose bridge/tip, lip contour, jawline, cheek structure, brow shape, and hairline.",
    "- Keep the same exact skin tone and undertone from model refs.",
    "- Never lighten, darken, recolor, tan, bleach, or stylize skin tone away from model refs.",
    "- Never blend identity traits from item-reference humans or any unrelated person.",
    "- If identity fidelity conflicts with style, prioritize identity fidelity.",
    "SERVER-ENFORCED BACKGROUND LOCK (NON-NEGOTIABLE):",
    "- Use seamless pure white studio background only (#FFFFFF).",
    "- No pink tint, warm tint, cream cast, gray cast, gradient, vignette, texture, or wrinkles.",
    "- Keep the exact same white background tone and lighting across all generated panels.",
    "- Keep only a very faint neutral contact shadow on floor; no colored bounce light.",
    "SERVER-ENFORCED ITEM FIDELITY LOCK (NON-NEGOTIABLE):",
    `- Locked item type from section 0.5: "${lockedItemType}".`,
    "- Prioritize garment details that match this locked item type.",
    "- If references contain mixed categories, ignore details from categories that do not match the locked item type.",
    "- Garment design must match item-reference photos exactly.",
    "- Never invent, replace, remove, recolor, or restyle logos/graphics/prints/embroidery/patches.",
    "- If an item ref shows a back graphic/print, preserve that exact back design (position, scale, colors, and style).",
    "- If refs do not show a clear back graphic, keep back surface solid/clean in item color only.",
    "- GLOBAL BACK-DESIGN HARD LOCK (ALL GENDERS, ALL PANELS, ALL POSES): never invent or redesign back graphics.",
    ...(backLockActive ? [
      "BACK-VIEW STRICT LOCK ACTIVE:",
      "- At least one active pose is back-facing in this panel.",
      "- Back-facing frame must reflect the exact back design from refs; no substitutions.",
    ] : []),
  ].join("\n");
}

function parseJsonObjectFromText(text: string): Record<string, any> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      const parsed = JSON.parse(raw.slice(first, last + 1));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch { return null; }
  }
}

function asStrictBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (["true", "yes", "y", "pass", "ok"].includes(v)) return true;
  if (["false", "no", "n", "fail"].includes(v)) return false;
  return null;
}

function normalizeReasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).slice(0, 8);
}

function extractImageBase64FromResponse(result: any): string | null {
  const candidates = result?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      if (part?.inlineData?.data) return part.inlineData.data;
    }
  }
  return null;
}

function extractTextFromResponse(result: any): string {
  if (typeof result?.text === "string") return result.text.trim();
  const candidates = result?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

async function runPanelComplianceCheck(args: {
  ai: GoogleGenAI;
  imageBase64: string;
  modelRefImages: RefImageData[];
  itemRefImages: RefImageData[];
  panelQa: PanelQaInput;
  timeoutMs: number;
}) {
  const qaModel = (process.env.GEMINI_QA_MODEL || "gemini-2.5-flash").trim() || "gemini-2.5-flash";
  const panelName = args.panelQa.panelLabel || (args.panelQa.panelNumber ? `Panel ${args.panelQa.panelNumber}` : "Panel");
  const hasFullBodyActivePose = isFullBodyPose(args.panelQa.modelGender, args.panelQa.poseA) || isFullBodyPose(args.panelQa.modelGender, args.panelQa.poseB);
  const hasBackFacingActivePose = isBackFacingPose(args.panelQa.modelGender, args.panelQa.poseA) || isBackFacingPose(args.panelQa.modelGender, args.panelQa.poseB);
  const swimwearActive = isSwimwearItemType(args.panelQa.itemType);
  const closeUpSubjectLockActive = hasPanel3CloseUpSubjectLock(args.panelQa);
  const closeUpCategoryQaRule = getCloseUpCategoryQaRule(args.panelQa.itemType);

  const contextText = [
    "Expected lock context:",
    `- Panel: ${panelName}`,
    `- Left pose: ${args.panelQa.poseA ?? "unknown"}`,
    `- Right pose: ${args.panelQa.poseB ?? "unknown"}`,
    `- Model: ${args.panelQa.modelName || "unknown"} (${args.panelQa.modelGender || "unknown"})`,
    `- Item type: ${args.panelQa.itemType || "apparel item"}`,
    ...(hasFullBodyActivePose ? [
      swimwearActive
        ? "- Swimwear footwear lock active: full-body poses may use flip-flops/water-shoes, or naturally uncovered feet."
        : "- Footwear hard lock active: full-body poses must include visible shoes. Barefoot is forbidden.",
    ] : []),
    ...(closeUpSubjectLockActive ? [
      "- Close-up subject lock active for this panel.",
      `- Right-side close-up must match section 0.5 item type exactly: "${args.panelQa.itemType || "apparel item"}".`,
      `- ${closeUpCategoryQaRule}`,
    ] : []),
    ...(hasBackFacingActivePose ? [
      "- Back-view strict lock active for this panel.",
      "- Any back-facing frame must keep the exact back design from item refs (no invented/changed back graphics).",
      "- If item refs do not clearly show a back design, any added back graphic should fail.",
    ] : []),
    "- Identity fidelity lock active: generated person must match MODEL refs for facial geometry and skin tone/undertone.",
    "- Background lock active: seamless pure white studio background only (#FFFFFF), no tint.",
    "- 3:4 center-crop lock active: each left/right pose should be centered in its half so a center 3:4 crop keeps key subject details intact.",
  ].join("\n");

  const qaInstructions = [
    "Return JSON only with these keys:",
    '{ "pass": boolean, "reasons": string[] }',
    swimwearActive
      ? "For swimwear item type, uncovered feet are allowed; fail only if output is suggestive or mismatched to refs."
      : "If any full-body pose appears barefoot or socks-only, set pass=false.",
    "If close-up subject lock is active and the right close-up clearly focuses on a different item type/category than the locked section 0.5 item type, set pass=false.",
    "If back-view strict lock is active and back-facing design does not clearly match item refs, set pass=false.",
    "If either side appears significantly off-center such that a center 3:4 crop would cut key model/item content, set pass=false.",
    "If facial geometry or skin tone/undertone clearly drifts from MODEL refs, set pass=false.",
    "If background is not seamless pure white (any pink/warm/cream/gray tint, gradient, vignette, texture, or colored cast), set pass=false.",
    "Set pass=false only when you are clearly confident this output violates model/item/pose lock.",
    "If uncertain, set pass=true and include reason that result is inconclusive.",
  ].join("\n");

  const parts: any[] = [
    { text: contextText },
    { text: "MODEL reference images (identity lock):" },
    ...args.modelRefImages.slice(0, 4).map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    })),
    { text: "ITEM reference images (outfit lock):" },
    ...args.itemRefImages.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.data },
    })),
    { text: "Generated panel to audit:" },
    { inlineData: { mimeType: "image/png", data: args.imageBase64 } },
    { text: qaInstructions },
  ];

  const qaResponse = await withTimeout(
    args.ai.models.generateContent({
      model: qaModel,
      config: {
        systemInstruction: "You are a strict pass/fail QA gate for fashion ecommerce panel outputs. Fail the audit if model identity is not clearly from model refs, item/outfit is not clearly from item refs, or expected pose pairing is not respected. Treat face-geometry drift and skin-tone drift from model refs as identity failures. Also fail any non-pure-white/tinted background. No prose. Return JSON only.",
        temperature: 0,
        maxOutputTokens: 260,
      },
      contents: [{ role: "user", parts }],
    }),
    Math.max(30000, Math.min(args.timeoutMs, 90000)),
    "Gemini panel compliance check"
  );

  const raw = extractTextFromResponse(qaResponse).slice(0, 3000);
  const parsed = parseJsonObjectFromText(raw);
  if (!parsed) {
    return { decisive: false, pass: true, reasons: ["Compliance check returned unparsable output."], raw };
  }

  const passFlag = asStrictBoolean(parsed.pass);
  if (passFlag === null) {
    return { decisive: false, pass: true, reasons: ["Compliance check missing boolean pass field."], raw };
  }
  const reasons = normalizeReasons(parsed.reasons);
  return {
    decisive: true,
    pass: passFlag === true,
    reasons: reasons.length ? reasons : passFlag ? [] : ["Compliance check failed."],
    raw,
  };
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
      if (rate.error) return NextResponse.json({ error: rate.error }, { status: 500 });
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: typeof rate.reset === "number" ? { "RateLimit-Reset": String(rate.reset) } : undefined }
      );
    }

    const { prompt, size, modelRefs, itemRefs, panelQa } = await req.json();
    const normalizedPanelQa = normalizePanelQa(panelQa);

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
      return NextResponse.json({ error: "Invalid or blocked reference image URLs.", details: refErrors.join(" | ") }, { status: 400 });
    }

    if (!normalizedModelRefs.length) return NextResponse.json({ error: "Missing model reference images" }, { status: 400 });
    if (!normalizedItemRefs.length) return NextResponse.json({ error: "Missing item reference images" }, { status: 400 });
    if (normalizedModelRefs.length < 3) {
      return NextResponse.json({ error: "Locked model is under-specified. Upload/select at least 3 model reference images before generating." }, { status: 400 });
    }
    if (!normalizedPanelQa.modelName || !normalizedPanelQa.modelGender) {
      return NextResponse.json({ error: "Missing locked model context for generation. Please reselect your model and retry." }, { status: 400 });
    }
    if (normalizedPanelQa.poseA === null || normalizedPanelQa.poseB === null) {
      return NextResponse.json({ error: "Missing panel pose lock context. Please retry from the panel controls." }, { status: 400 });
    }

    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return fallbackGenerateResponse("GEMINI_API_KEY is not set. Returned local fallback image.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const imageTimeoutMs = getImageTimeoutMs();
    const imageModel = (process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview").trim();
    const swimwearActive = isSwimwearItemType(normalizedPanelQa.itemType);
    const lockedPrompt = prompt;

    const modelAnchors = normalizedModelRefs.slice(0, 3);
    const itemAnchors = normalizedItemRefs.slice(0, 3);
    const allRefs = [...modelAnchors, ...itemAnchors];

    const downloaded = await Promise.allSettled(
      allRefs.map((url, idx) => downloadReferenceAsBase64(url, idx))
    );

    const allRefImages = downloaded
      .filter((r): r is PromiseFulfilledResult<RefImageData> => r.status === "fulfilled")
      .map((r) => r.value);
    const modelFilesCount = downloaded.slice(0, modelAnchors.length).filter((r) => r.status === "fulfilled").length;
    const itemFilesCount = downloaded.slice(modelAnchors.length).filter((r) => r.status === "fulfilled").length;

    if (!allRefImages.length || modelFilesCount === 0 || itemFilesCount === 0) {
      const summary = buildReferenceDownloadErrorDetails({
        allRefs, downloaded, modelFilesCount, itemFilesCount,
        modelAnchorCount: modelAnchors.length, itemAnchorCount: itemAnchors.length,
      });
      return NextResponse.json({ error: "Unable to download required reference images.", details: summary.details, failedIndexes: summary.failedIndexes }, { status: 400 });
    }

    const modelRefImages = allRefImages.slice(0, modelFilesCount);
    const itemRefImages = allRefImages.slice(modelFilesCount);

    const modelImageParts = allRefImages.slice(0, modelFilesCount);
    const itemImageParts = allRefImages.slice(modelFilesCount);

    function buildImageLabels(): string {
      const lines: string[] = [];
      modelImageParts.forEach((_, i) => {
        lines.push(`- Image ${i + 1}: MODEL reference photo (person identity — replicate this exact person's face, skin tone, hair, body).`);
      });
      itemImageParts.forEach((_, i) => {
        const idx = modelFilesCount + i + 1;
        lines.push(`- Image ${idx}: ITEM reference photo (garment/product — replicate this exact garment's color, design, fabric, logos, prints, construction).`);
      });
      return lines.join("\n");
    }

    async function generateWithGemini(promptText: string): Promise<string | null> {
      const parts: any[] = [];
      let imageIndex = 1;

      modelImageParts.forEach((img) => {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      });
      const modelRange = modelImageParts.length === 1
        ? `Image ${imageIndex}`
        : `Images ${imageIndex}-${imageIndex + modelImageParts.length - 1}`;
      imageIndex += modelImageParts.length;

      itemImageParts.forEach((img) => {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      });
      const itemRange = itemImageParts.length === 1
        ? `Image ${imageIndex}`
        : `Images ${imageIndex}-${imageIndex + itemImageParts.length - 1}`;

      const promptLines = [
        `- ${modelRange}: Model reference photos (the person to replicate).`,
        `- ${itemRange}: Item reference photos (the garment to replicate).`,
        "",
        "Generate a NEW photo of the EXACT same person from the model references wearing the EXACT same garment from the item references.",
        "Background: seamless pure white studio (#FFFFFF), soft diffused lighting, faint floor shadow only.",
        "",
        promptText,
      ];

      parts.push({ text: promptLines.join("\n") });

      const result = await withTimeout(
        ai.models.generateContent({
          model: imageModel,
          config: {
            responseModalities: ["IMAGE"],
            temperature: 0.2,
            imageConfig: {
              aspectRatio: "3:2",
              imageSize: "4K",
            },
          },
          contents: [{ role: "user", parts }],
        }),
        imageTimeoutMs,
        "Gemini image generation"
      );
      return extractImageBase64FromResponse(result);
    }

    let b64: string | null = null;
    try {
      b64 = await generateWithGemini(lockedPrompt);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (isAuthError(err)) {
        return NextResponse.json({ error: "Gemini authentication failed on server. Update GEMINI_API_KEY in production env and redeploy." }, { status: 500 });
      }

      const looksLikeSafetyBlock =
        /safety|blocked|harm|policy|RECITATION|SAFETY/i.test(message) ||
        err?.response?.promptFeedback?.blockReason;

      if (!looksLikeSafetyBlock) {
        return fallbackGenerateResponse(err instanceof Error ? err.message : "Gemini image generation failed");
      }

      const retryPrompts = swimwearActive
        ? [
            buildSwimwearSafetyRetryPrompt(lockedPrompt),
            buildSwimwearSafetyRetryPrompt([lockedPrompt, "", "Additional constraints:", "- Keep camera farther and centered; avoid tight body framing.", "- Use straightforward front/back/product-detail composition only."].join("\n")),
          ]
        : [buildGeneralSafetyRetryPrompt(lockedPrompt)];

      let retryErr: any = null;
      for (let i = 0; i < retryPrompts.length; i++) {
        try {
          b64 = await generateWithGemini(retryPrompts[i]);
          if (b64) break;
        } catch (e: any) {
          retryErr = e;
        }
      }

      if (!b64) {
        return NextResponse.json({
          error: {
            type: "policy_refusal",
            code: "safety_blocked",
            message: "Generation was blocked by safety moderation for this reference set. Try a less revealing crop/reference mix or use neutral front/back product shots.",
          },
        }, { status: 403 });
      }
    }

    if (!b64) {
      return fallbackGenerateResponse("No image returned from provider.");
    }

    const strictLocksEnabled = (process.env.STRICT_PANEL_LOCKS || "true").trim().toLowerCase() !== "false";
    let qaWarning: string | null = null;
    if (strictLocksEnabled) {
      try {
        const qa = await runPanelComplianceCheck({
          ai, imageBase64: b64,
          modelRefImages, itemRefImages,
          panelQa: normalizedPanelQa, timeoutMs: imageTimeoutMs,
        });
        if (qa.decisive && !qa.pass) {
          qaWarning = "QA check flagged: " + qa.reasons.join(" | ");
          console.warn("Panel QA flagged (returning image with warning):", qa.raw);
        }
        if (!qa.decisive) {
          qaWarning = "Compliance check was inconclusive; generation was allowed.";
          console.warn("Compliance check inconclusive:", qa.raw);
        }
      } catch (qaErr: any) {
        qaWarning = "Compliance check unavailable; generation was allowed.";
        console.warn("Compliance check error:", qaErr?.message || qaErr);
      }
    }

    if (qaWarning) return NextResponse.json({ imageBase64: b64, warning: qaWarning });
    return NextResponse.json({ imageBase64: b64 });
  } catch (err: unknown) {
    console.error("Generate failed:", err);
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Gemini authentication failed on server. Update GEMINI_API_KEY in production env and redeploy." }, { status: 500 });
    }
    const reason = err instanceof Error ? err.message : "Generate failed";
    return fallbackGenerateResponse(reason);
  }
}
