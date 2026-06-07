import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { isRequestAuthed } from "@/lib/auth";
import { checkGenerateRateLimit } from "@/lib/ratelimit";
import { getOpenAiApiKey } from "@/lib/openaiConfig";
import { withTimeout, parseJsonObjectFromText, asStringArray } from "@/lib/seo/aiText";
import { scoreAll, blendLlmScores } from "@/lib/seo/deterministic";
import type { ProductContext, SeoFields, SeoFieldKey } from "@/lib/seo/types";

const MODEL = (process.env.SEO_MODEL || "gpt-4o").trim() || "gpt-4o";
const TIMEOUT_MS = Math.max(20000, Math.min(Number(process.env.SEO_TIMEOUT_MS) || 90000, 150000));
const MAX_VISION_IMAGES = Math.max(1, Math.min(Number(process.env.SEO_MAX_IMAGES) || 6, 10));

function getClientKey(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || "unknown";
}

const SCHEMA = `{
  "focusKeyword": string,
  "secondaryKeywords": string[],
  "proposed": {
    "seoTitle": string,            // <= 60 chars, focus keyword near front. Do NOT add any brand/company name or placeholder text.
    "metaDescription": string,     // 120-155 chars, benefit + keyword + call to action
    "handle": string,              // lowercase-hyphenated, keyword-rich, no stop words
    "title": string,               // descriptive H1
    "bodyHtml": string,            // valid HTML: short intro <p>, a <ul> of features/benefits you can SEE, a details <p>. 400-900 chars of text.
    "tags": string[],              // 5-12 relevant, deduped
    "productType": string,
    "vendor": string,
    "imageAlts": [{ "id": string, "altText": string }]  // 15-125 chars each, describe what is actually in THAT photo
  },
  "rationale": {
    "seoTitle": string, "metaDescription": string, "handle": string, "title": string,
    "bodyHtml": string, "tags": string, "productType": string, "vendor": string, "imageAlts": string
  },
  "llmScores": {
    "proposed": { "seoTitle": number, "metaDescription": number, "handle": number, "title": number, "bodyHtml": number, "tags": number, "productType": number, "vendor": number, "imageAlts": number }
  }
}`;

function buildInstruction(context: ProductContext, imageIds: string[], useVision: boolean) {
  const colors = (context.colors || []).join(", ") || "(not specified)";
  return [
    "You are a senior e-commerce SEO strategist and apparel product-photo analyst.",
    "",
    "IMPORTANT — generate SEO using ONLY these inputs:",
    `  • Product name: "${context.title}"`,
    `  • Color(s): ${colors}`,
    useVision
      ? "  • The product PHOTOS provided in this message (analyze them)."
      : "  • (No photos provided — work from the name and color only.)",
    "",
    "Do NOT use or assume any pre-existing description, tags, or metadata — treat them as unreliable and ignore them. Base every detail (fabric, fit, neckline, sleeves, print/pattern, hardware, silhouette) ONLY on what you can actually SEE in the photos plus the name and color. Never invent attributes that are not visible.",
    "Do NOT output any brand, company, or vendor name anywhere, and never use placeholder text like 'Brand'. Leave the product type and vendor unchanged (they are handled separately).",
    "Optimize for Google search ranking + click-through using current best practice. Natural language, benefit-led, no keyword stuffing.",
    "",
    useVision && imageIds.length
      ? `The photos are attached in order; their image ids (use these exact ids in imageAlts) are:\n${imageIds.map((id, i) => `  ${i + 1}. ${id}`).join("\n")}`
      : "",
    "",
    "Return STRICT JSON only, no prose, with this exact shape:",
    SCHEMA,
  ].join("\n");
}

function toLlmScoreMap(obj: any): Partial<Record<SeoFieldKey, number>> {
  const out: Partial<Record<SeoFieldKey, number>> = {};
  const keys: SeoFieldKey[] = [
    "seoTitle", "metaDescription", "handle", "title", "bodyHtml", "tags", "productType", "vendor", "imageAlts",
  ];
  for (const k of keys) {
    const v = Number(obj?.[k]);
    if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rate: any = await checkGenerateRateLimit(getClientKey(req));
    if (!rate.success) {
      return NextResponse.json({ error: rate.error || "Too many requests." }, { status: 429 });
    }

    const apiKey = getOpenAiApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured on server." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const context = body?.context as ProductContext | undefined;
    const current = body?.current as SeoFields | undefined;
    const useVision = body?.useVision !== false; // default ON
    if (!context || !current) {
      return NextResponse.json({ error: "Missing context or current SEO fields." }, { status: 400 });
    }

    // Image list comes from the pulled product, but ONLY the URLs/ids are used —
    // never the existing alt text — to keep generation free of stale references.
    const images = (current.imageAlts || [])
      .filter((a) => /^https?:\/\//i.test(String(a.url || "")))
      .slice(0, MAX_VISION_IMAGES);
    const imageIds = images.map((a) => a.id);
    const visionActive = useVision && images.length > 0;

    const instruction = buildInstruction(context, imageIds, visionActive);
    const userContent: any[] = [{ type: "text", text: instruction }];
    if (visionActive) {
      for (const img of images) {
        userContent.push({ type: "image_url", image_url: { url: img.url, detail: "auto" } });
      }
    }

    const openai = new OpenAI({ apiKey });
    const completion: any = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You generate apparel e-commerce SEO from a product name, its color, and its photos only. You ignore any pre-existing copy. Return only valid JSON.",
          },
          { role: "user", content: userContent },
        ],
      }),
      TIMEOUT_MS,
      "SEO optimize"
    );

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = parseJsonObjectFromText(raw);
    if (!parsed || !parsed.proposed) {
      return NextResponse.json({ error: "Optimizer returned no usable result. Please retry." }, { status: 502 });
    }

    const focusKeyword = String(parsed.focusKeyword || "").trim();
    const secondaryKeywords = asStringArray(parsed.secondaryKeywords, 8);

    // Map proposed alts back onto the pulled image list (preserve id + url).
    const altById = new Map<string, string>();
    const proposedAltsArr = Array.isArray(parsed.proposed.imageAlts) ? parsed.proposed.imageAlts : [];
    proposedAltsArr.forEach((a: any, i: number) => {
      const id = String(a?.id || images[i]?.id || "").trim();
      if (id) altById.set(id, String(a?.altText || "").trim());
    });
    const proposedImageAlts = (current.imageAlts || []).map((img) => ({
      id: img.id,
      url: img.url,
      altText: altById.get(img.id) ?? "",
    }));

    const proposed: SeoFields = {
      title: String(parsed.proposed.title || context.title || "").trim(),
      seoTitle: String(parsed.proposed.seoTitle || "").trim(),
      metaDescription: String(parsed.proposed.metaDescription || "").trim(),
      handle: String(parsed.proposed.handle || current.handle || "").trim().toLowerCase(),
      bodyHtml: String(parsed.proposed.bodyHtml || "").trim(),
      tags: asStringArray(parsed.proposed.tags, 20),
      // Vendor & product type are reliable catalog facts — preserve them as-is
      // rather than letting the model invent them from name+color+photos.
      productType: String(current.productType || "").trim(),
      vendor: String(current.vendor || "").trim(),
      imageAlts: proposedImageAlts,
      focusKeyword,
      secondaryKeywords,
    };

    // Score both sides against the SAME focus keyword. Current is scored
    // deterministically only (it is NOT shown to the model); proposed blends
    // deterministic rules with the model's self-assessment.
    const currentWithKw: SeoFields = { ...current, focusKeyword, secondaryKeywords };
    const currentScorecard = scoreAll(currentWithKw);
    const proposedScorecard = blendLlmScores(scoreAll(proposed), toLlmScoreMap(parsed.llmScores?.proposed));

    const rationale: Partial<Record<SeoFieldKey, string>> = {};
    if (parsed.rationale && typeof parsed.rationale === "object") {
      for (const [k, v] of Object.entries(parsed.rationale)) {
        rationale[k as SeoFieldKey] = String(v || "").trim();
      }
    }

    return NextResponse.json({
      focusKeyword,
      secondaryKeywords,
      visionUsed: visionActive,
      imagesAnalyzed: visionActive ? images.length : 0,
      proposed,
      currentScorecard,
      proposedScorecard,
      rationale,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SEO optimize failed" }, { status: 500 });
  }
}
