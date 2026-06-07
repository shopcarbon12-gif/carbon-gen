import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { isRequestAuthed } from "@/lib/auth";
import { checkGenerateRateLimit } from "@/lib/ratelimit";
import { getOpenAiApiKey } from "@/lib/openaiConfig";
import { withTimeout, parseJsonObjectFromText, asStringArray } from "@/lib/seo/aiText";
import { scoreAll, blendLlmScores, stripHtml } from "@/lib/seo/deterministic";
import type { ProductContext, SeoFields, SeoFieldKey } from "@/lib/seo/types";

const MODEL = (process.env.SEO_MODEL || "gpt-4o").trim() || "gpt-4o";
const TIMEOUT_MS = Math.max(20000, Math.min(Number(process.env.SEO_TIMEOUT_MS) || 60000, 120000));

function getClientKey(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || "unknown";
}

function buildPrompt(context: ProductContext, current: SeoFields) {
  const imgs = (current.imageAlts || []).map((i, idx) => ({
    id: i.id,
    position: idx + 1,
    currentAlt: i.altText || "",
  }));
  return [
    "You are a senior e-commerce SEO strategist optimizing a Shopify product for Google search and social sharing.",
    "Optimize for ranking + click-through using current best practice. Do not keyword-stuff. Keep copy natural, specific, and benefit-led.",
    "",
    "PRODUCT CONTEXT:",
    JSON.stringify(context, null, 2),
    "",
    "CURRENT SEO:",
    JSON.stringify(
      {
        title: current.title,
        seoTitle: current.seoTitle,
        metaDescription: current.metaDescription,
        handle: current.handle,
        bodyText: stripHtml(current.bodyHtml).slice(0, 1200),
        tags: current.tags,
        productType: current.productType,
        vendor: current.vendor,
      },
      null,
      2
    ),
    "",
    "IMAGES (return one optimized alt per id):",
    JSON.stringify(imgs, null, 2),
    "",
    "Return STRICT JSON only, no prose, with this exact shape:",
    `{
  "focusKeyword": string,
  "secondaryKeywords": string[],
  "proposed": {
    "seoTitle": string,            // <= 60 chars, focus keyword near front, brand at end
    "metaDescription": string,     // 120-155 chars, benefit + keyword + call to action
    "handle": string,              // lowercase-hyphenated, keyword-rich, no stop words
    "title": string,               // descriptive H1
    "bodyHtml": string,            // valid HTML: short intro <p>, a <ul> of features/benefits, a details <p>. 400-900 chars of text.
    "tags": string[],              // 5-12 relevant, deduped
    "productType": string,
    "vendor": string,
    "imageAlts": [{ "id": string, "altText": string }]  // 15-125 chars each, descriptive, one per input image id
  },
  "rationale": {                   // one short sentence per field explaining the change
    "seoTitle": string, "metaDescription": string, "handle": string, "title": string,
    "bodyHtml": string, "tags": string, "productType": string, "vendor": string, "imageAlts": string
  },
  "llmScores": {                   // 0-100 quality scores for fair comparison
    "current": { "seoTitle": number, "metaDescription": number, "handle": number, "title": number, "bodyHtml": number, "tags": number, "productType": number, "vendor": number, "imageAlts": number },
    "proposed": { "seoTitle": number, "metaDescription": number, "handle": number, "title": number, "bodyHtml": number, "tags": number, "productType": number, "vendor": number, "imageAlts": number }
  }
}`,
    "If the current value is already excellent, keep it (and reflect that in scores).",
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
    if (!context || !current) {
      return NextResponse.json({ error: "Missing context or current SEO fields." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const completion: any = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a precise SEO optimizer that returns only valid JSON." },
          { role: "user", content: buildPrompt(context, current) },
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

    // Map proposed alts back onto the current image list (preserve id + url).
    const altById = new Map<string, string>();
    for (const a of Array.isArray(parsed.proposed.imageAlts) ? parsed.proposed.imageAlts : []) {
      const id = String(a?.id || "").trim();
      if (id) altById.set(id, String(a?.altText || "").trim());
    }
    const proposedImageAlts = (current.imageAlts || []).map((img) => ({
      id: img.id,
      url: img.url,
      altText: altById.get(img.id) ?? img.altText ?? "",
    }));

    const proposed: SeoFields = {
      title: String(parsed.proposed.title || current.title || "").trim(),
      seoTitle: String(parsed.proposed.seoTitle || "").trim(),
      metaDescription: String(parsed.proposed.metaDescription || "").trim(),
      handle: String(parsed.proposed.handle || current.handle || "").trim().toLowerCase(),
      bodyHtml: String(parsed.proposed.bodyHtml || "").trim(),
      tags: asStringArray(parsed.proposed.tags, 20),
      productType: String(parsed.proposed.productType || current.productType || "").trim(),
      vendor: String(parsed.proposed.vendor || current.vendor || "").trim(),
      imageAlts: proposedImageAlts,
      focusKeyword,
      secondaryKeywords,
    };

    // Score both sides against the SAME focus keyword for a fair comparison.
    const currentWithKw: SeoFields = { ...current, focusKeyword, secondaryKeywords };
    const currentDet = scoreAll(currentWithKw);
    const proposedDet = scoreAll(proposed);

    const llmScores = parsed.llmScores || {};
    const currentScorecard = blendLlmScores(currentDet, toLlmScoreMap(llmScores.current));
    const proposedScorecard = blendLlmScores(proposedDet, toLlmScoreMap(llmScores.proposed));

    const rationale: Partial<Record<SeoFieldKey, string>> = {};
    if (parsed.rationale && typeof parsed.rationale === "object") {
      for (const [k, v] of Object.entries(parsed.rationale)) {
        rationale[k as SeoFieldKey] = String(v || "").trim();
      }
    }

    return NextResponse.json({
      focusKeyword,
      secondaryKeywords,
      proposed,
      currentScorecard,
      proposedScorecard,
      rationale,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SEO optimize failed" }, { status: 500 });
  }
}
