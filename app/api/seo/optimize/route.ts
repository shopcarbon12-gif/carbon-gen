import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import OpenAI from "openai";
import { isRequestAuthed } from "@/lib/auth";
import { checkGenerateRateLimit } from "@/lib/ratelimit";
import { getOpenAiApiKey } from "@/lib/openaiConfig";
import { withTimeout, parseJsonObjectFromText, asStringArray } from "@/lib/seo/aiText";
import { scoreAll } from "@/lib/seo/deterministic";
import type { ProductContext, SeoFields, SeoFieldKey } from "@/lib/seo/types";
import { fetchRemoteImageBytes, normalizeRemoteImageUrl, getImageFetchTimeoutMs } from "@/lib/remoteImage";

const MODEL = (process.env.SEO_MODEL || "gpt-4o").trim() || "gpt-4o";
const TIMEOUT_MS = Math.max(20000, Math.min(Number(process.env.SEO_TIMEOUT_MS) || 90000, 150000));
const MAX_VISION_IMAGES = Math.max(1, Math.min(Number(process.env.SEO_MAX_IMAGES) || 6, 10));
const TARGET_SCORE = 97;
const MAX_REPAIRS = 2;
// A section already scoring at/above this is NOT regenerated (saves AI cost). When every
// generated field is here AND no image alt is missing, the whole product is skipped.
const SKIP_THRESHOLD = Math.max(50, Math.min(Number(process.env.SEO_SKIP_SCORE) || 97, 100));

// Fields the AI generates. The product TITLE and URL HANDLE are intentionally NOT
// generated or changed (names/URLs are preserved). Vendor/type preserved from Shopify.
// Image alt text is generated only for photos that are missing it (handled separately).
const GEN_FIELDS: SeoFieldKey[] = ["seoTitle", "metaDescription", "bodyHtml", "tags"];

function getClientKey(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0]?.trim() || "unknown";
}

const SCHEMA = `{
  "focusKeyword": string,
  "secondaryKeywords": string[],
  "proposed": {
    "seoTitle": string,            // 40-60 chars, focus keyword near the front. No brand/company name or placeholder.
    "metaDescription": string,     // 130-155 chars, include the focus keyword and a clear call to action (e.g. "Shop now").
    "bodyHtml": string,            // valid HTML with a <p> intro, a <ul> of 4-6 <li> feature/benefit bullets, and a closing <p>; 450-850 chars of text; include the focus keyword
    "tags": string[]               // 7-12 relevant, deduped, lowercase
  },
  "imageAlts": [ { "id": string, "alt": string } ],  // ONLY for the photo ids listed in the instruction; 60-125 chars, describe the visible product + color for accessibility and SEO
  "rationale": { "seoTitle": string, "metaDescription": string, "bodyHtml": string, "tags": string }
}`;

function buildGenInstruction(
  context: ProductContext,
  fieldsToGenerate: SeoFieldKey[],
  useVision: boolean,
  altImageIds: string[]
) {
  const colors = (context.colors || []).join(", ") || "(not specified)";
  return [
    "You are a senior e-commerce SEO strategist and apparel product-photo analyst.",
    "",
    "Generate SEO using ONLY these inputs:",
    `  • Product name: "${context.title}"`,
    `  • Color(s): ${colors}`,
    useVision ? "  • The product PHOTOS provided in this message (analyze them)." : "  • (No photos provided — use the name and color only.)",
    "",
    "Do NOT change or output the product title or the URL handle — they are fixed.",
    fieldsToGenerate.length
      ? `Generate ONLY these "proposed" fields (omit all others): ${fieldsToGenerate.join(", ")}.`
      : `Do NOT generate any "proposed" fields (leave "proposed" empty).`,
    altImageIds.length
      ? `Also write alt text in "imageAlts" for ONLY these photo ids: ${altImageIds.join(", ")}.`
      : `Leave "imageAlts" empty.`,
    "",
    "Ignore any pre-existing description, tags, or metadata. Base details (fabric, fit, neckline, sleeves, print/pattern, hardware, silhouette) ONLY on what you can SEE plus the name and color. Never invent attributes that aren't visible. Do NOT output any brand/company/vendor name or placeholder text.",
    "Follow the character/format targets EXACTLY — they are graded by an automated scorer; aim for a perfect score.",
    "",
    useVision && altImageIds.length ? `Photos are attached in order.` : "",
    "",
    "Return STRICT JSON only, no prose, with this exact shape:",
    SCHEMA,
  ].join("\n");
}

function buildProposed(parsed: any, current: SeoFields, focusKeyword: string, secondaryKeywords: string[]): SeoFields {
  const p = parsed?.proposed || {};
  return {
    // Title and handle are never AI-generated — preserve them exactly.
    title: String(current.title || "").trim(),
    handle: String(current.handle || "").trim().toLowerCase(),
    seoTitle: String(p.seoTitle || current.seoTitle || "").trim(),
    metaDescription: String(p.metaDescription || current.metaDescription || "").trim(),
    bodyHtml: String(p.bodyHtml || current.bodyHtml || "").trim(),
    tags: p.tags != null ? asStringArray(p.tags, 20) : (current.tags || []),
    // Preserved (not AI-generated):
    productType: String(current.productType || "").trim(),
    vendor: String(current.vendor || "").trim(),
    imageAlts: current.imageAlts || [],
    focusKeyword,
    secondaryKeywords,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!isRequestAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rate: any = await checkGenerateRateLimit(getClientKey(req));
    if (!rate.success) return NextResponse.json({ error: rate.error || "Too many requests." }, { status: 429 });

    const apiKey = getOpenAiApiKey();
    if (!apiKey) return NextResponse.json({ error: "OpenAI API key not configured on server." }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const context = body?.context as ProductContext | undefined;
    const current = body?.current as SeoFields | undefined;
    const useVision = body?.useVision !== false;
    if (!context || !current) return NextResponse.json({ error: "Missing context or current SEO fields." }, { status: 400 });

    // ---- Decide what needs work — already-good sections are skipped to save AI cost ----
    const currentScores = scoreAll(current);
    const weakFields = GEN_FIELDS.filter((f) => (currentScores.fields[f]?.score ?? 0) < SKIP_THRESHOLD);
    const missingAlt = (current.imageAlts || []).filter(
      (a) => /^https?:\/\//i.test(String(a.url || "")) && !String(a.altText || "").trim()
    );

    // Every generated section already scores >= threshold AND no alt is missing → no AI call.
    if (!weakFields.length && !missingAlt.length) {
      return NextResponse.json({
        skipped: true,
        focusKeyword: String((current as any).focusKeyword || ""),
        secondaryKeywords: [],
        visionUsed: false,
        imagesAnalyzed: 0,
        proposed: { ...current },
        currentScorecard: currentScores,
        proposedScorecard: currentScores,
        imageAltsAdded: [],
        rationale: {},
      });
    }

    // Send photos, prioritising the ones missing alt text so they get captioned. Fetch
    // server-side and inline as base64 (OpenAI's own downloader 400s "Timeout while
    // downloading <url>" on slow/large CDN images; this server reaches the CDN reliably).
    const altIdSet = new Set(missingAlt.map((a) => String(a.id)));
    const candidateImages = (current.imageAlts || [])
      .filter((a) => /^https?:\/\//i.test(String(a.url || "")))
      .sort((a, b) => (altIdSet.has(String(b.id)) ? 1 : 0) - (altIdSet.has(String(a.id)) ? 1 : 0))
      .slice(0, MAX_VISION_IMAGES);
    const images: { id: string; dataUrl: string }[] = [];
    if (useVision) {
      for (const a of candidateImages) {
        try {
          const safeUrl = normalizeRemoteImageUrl(String(a.url));
          const { bytes, contentType } = await fetchRemoteImageBytes(safeUrl, { timeoutMs: getImageFetchTimeoutMs() });
          images.push({ id: String(a.id), dataUrl: `data:${contentType || "image/jpeg"};base64,${bytes.toString("base64")}` });
        } catch {
          // Unreachable / too-large image: analyze the rest rather than failing the request.
        }
      }
    }
    const visionActive = useVision && images.length > 0;
    const altImageIds = images.filter((img) => altIdSet.has(img.id)).map((img) => img.id);

    const openai = new OpenAI({ apiKey });
    const genContent: any[] = [{ type: "text", text: buildGenInstruction(context, weakFields, visionActive, altImageIds) }];
    if (visionActive) for (const img of images) genContent.push({ type: "image_url", image_url: { url: img.dataUrl, detail: "auto" } });

    const completion: any = await withTimeout(
      openai.chat.completions.create({
        model: MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You generate apparel e-commerce SEO from a product name, color, and photos only. Return only valid JSON." },
          { role: "user", content: genContent },
        ],
      }),
      TIMEOUT_MS,
      "SEO optimize"
    );
    const parsed = parseJsonObjectFromText(completion?.choices?.[0]?.message?.content || "");
    if (!parsed || (weakFields.length && !parsed.proposed)) {
      return NextResponse.json({ error: "Optimizer returned no usable result. Please retry." }, { status: 502 });
    }

    const focusKeyword = String(parsed.focusKeyword || "").trim();
    const secondaryKeywords = asStringArray(parsed.secondaryKeywords, 8);
    const rationale: Partial<Record<SeoFieldKey, string>> = {};
    if (parsed.rationale && typeof parsed.rationale === "object") {
      for (const [k, v] of Object.entries(parsed.rationale)) rationale[k as SeoFieldKey] = String(v || "").trim();
    }

    let proposed = buildProposed(parsed, current, focusKeyword, secondaryKeywords);
    // Sections already >= threshold are kept exactly as-is (never regenerated).
    for (const f of GEN_FIELDS) {
      if (!weakFields.includes(f)) {
        if (f === "tags") proposed.tags = current.tags || [];
        else (proposed as any)[f] = (current as any)[f];
      }
    }
    let proposedScorecard = scoreAll(proposed);

    // ---- Refinement: push the regenerated fields toward the target (weak ones only) ----
    for (let pass = 0; pass < MAX_REPAIRS; pass += 1) {
      const weak = weakFields.filter((f) => (proposedScorecard.fields[f]?.score ?? 0) < TARGET_SCORE);
      if (!weak.length) break;
      const repairPrompt = [
        "Improve ONLY these SEO fields so each fully satisfies its rule (they are auto-graded; aim for 100). Keep the same product, focus keyword, and visible facts.",
        `Focus keyword: "${focusKeyword}"`,
        "Current values and the problems to fix:",
        ...weak.map((f) => {
          const fs = proposedScorecard.fields[f];
          const val = f === "tags" ? (proposed.tags || []).join(", ") : String((proposed as any)[f] ?? "");
          return `• ${f}: ${JSON.stringify(val).slice(0, 600)}\n   issues: ${(fs?.issues || []).join(" ") || "raise quality"}`;
        }),
        "",
        "Targets: seoTitle 40-60 chars w/ keyword; metaDescription 130-155 chars w/ keyword + CTA; bodyHtml HTML (<p> + <ul> 4-6 <li> + <p>), 450-850 chars text, keyword present; tags 7-12 lowercase deduped.",
        `Return STRICT JSON only: { ${weak.map((f) => `"${f}": ${f === "tags" ? "string[]" : "string"}`).join(", ")} }`,
      ].join("\n");
      let repair: any = null;
      try {
        const rc: any = await withTimeout(
          openai.chat.completions.create({
            model: MODEL,
            temperature: 0.3,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You refine SEO fields to satisfy strict formatting rules. Return only valid JSON." },
              { role: "user", content: repairPrompt },
            ],
          }),
          TIMEOUT_MS,
          "SEO repair"
        );
        repair = parseJsonObjectFromText(rc?.choices?.[0]?.message?.content || "");
      } catch {
        break;
      }
      if (!repair) break;
      const merged: any = { proposed: { ...proposed } };
      for (const f of weak) {
        if (f === "tags" && repair.tags != null) merged.proposed.tags = asStringArray(repair.tags, 20);
        else if (repair[f] != null) merged.proposed[f] = repair[f];
      }
      proposed = buildProposed(merged, current, focusKeyword, secondaryKeywords);
      proposedScorecard = scoreAll(proposed);
    }

    const currentScorecard = scoreAll({ ...current, focusKeyword, secondaryKeywords });

    // ---- Never propose a change that scores worse than what's already there ----
    let clamped = false;
    for (const f of GEN_FIELDS) {
      const ps = proposedScorecard.fields[f]?.score ?? 0;
      const cs = currentScorecard.fields[f]?.score ?? 0;
      if (ps < cs) {
        if (f === "tags") proposed.tags = current.tags || [];
        else (proposed as any)[f] = (current as any)[f];
        clamped = true;
      }
    }
    if (clamped) proposedScorecard = scoreAll(proposed);

    // ---- Fill ONLY missing image alt from the AI; existing alts are left untouched ----
    const altMap = new Map<string, string>(
      (Array.isArray(parsed.imageAlts) ? parsed.imageAlts : [])
        .map((x: any) => [String(x?.id || ""), String(x?.alt || "").trim()] as [string, string])
        .filter((e: [string, string]) => e[0] && e[1])
    );
    const imageAltsAdded: Array<{ id: string; altText: string }> = [];
    proposed.imageAlts = (current.imageAlts || []).map((a) => {
      const id = String(a.id);
      const gen = altIdSet.has(id) ? altMap.get(id) || "" : "";
      if (gen) {
        imageAltsAdded.push({ id, altText: gen });
        return { ...a, altText: gen };
      }
      return a;
    });

    return NextResponse.json({
      skipped: false,
      focusKeyword,
      secondaryKeywords,
      visionUsed: visionActive,
      imagesAnalyzed: visionActive ? images.length : 0,
      proposed,
      currentScorecard,
      proposedScorecard,
      imageAltsAdded,
      rationale,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SEO optimize failed" }, { status: 500 });
  }
}
