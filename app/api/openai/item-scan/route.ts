import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";
import {
  MALE_POSE_LIBRARY,
  FEMALE_POSE_LIBRARY,
} from "@/lib/panelPoseLibraries";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const POSE_NAMES_MALE = [
  "Full Body Front (Neutral Hero)",
  "Full Body Lifestyle (Controlled)",
  "Torso + Head (Front)",
  "Full Body Back View",
  "Lower Body / Legs",
  "Single Close-Up",
  "Torso Back (Over-Shoulder)",
  "Natural Variation (Creative)",
];

const POSE_NAMES_FEMALE = [
  "Front Hero",
  "Back View (Face Visible)",
  "3/4 Front Angle",
  "Upper Body (With Face)",
  "Single Close-Up",
  "Relaxed Front Variation",
  "Lower Body / Legs",
  "Natural Variation (Creative)",
];

type Gender = "male" | "female";

function parseGenders(raw: unknown): Gender[] {
  if (!Array.isArray(raw) || !raw.length) return ["male", "female"];
  const valid = raw
    .map((v) => String(v || "").trim().toLowerCase())
    .filter((v): v is Gender => v === "male" || v === "female");
  return valid.length ? valid : ["male", "female"];
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const imageDataUrls: string[] = Array.isArray(body?.imageDataUrls)
      ? body.imageDataUrls.filter((u: unknown) => typeof u === "string" && u.length > 0).slice(0, 4)
      : [];
    const imageUrls: string[] = Array.isArray(body?.imageUrls)
      ? body.imageUrls.filter((u: unknown) => typeof u === "string" && u.length > 0).slice(0, 4)
      : [];

    if (!imageDataUrls.length && !imageUrls.length) {
      return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
    }

    const itemType = normalizeText(body?.itemType);
    const genders = parseGenders(body?.genders);
    const includeMale = genders.includes("male");
    const includeFemale = genders.includes("female");

    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });

    const imageInputs: Array<{ type: "input_image"; image_url: string; detail: "low" }> = [];
    for (const dataUrl of imageDataUrls) {
      imageInputs.push({ type: "input_image", image_url: dataUrl, detail: "low" });
    }
    for (const url of imageUrls) {
      imageInputs.push({ type: "input_image", image_url: url, detail: "low" });
    }

    const genderLabel = includeMale && includeFemale
      ? "BOTH male and female"
      : includeFemale ? "female" : "male";

    const poseLibraryBlocks: string[] = [];
    if (includeMale) {
      poseLibraryBlocks.push("=== MALE POSE LIBRARY ===", MALE_POSE_LIBRARY, "");
    }
    if (includeFemale) {
      poseLibraryBlocks.push("=== FEMALE POSE LIBRARY ===", FEMALE_POSE_LIBRARY, "");
    }

    const jsonStructureParts: string[] = ["{"];
    if (includeMale) {
      jsonStructureParts.push(
        '  "male": [',
        '    { "pose": 1, "status": "green", "issue": "", "suggestion": "" },',
        "    ...",
        "  ]" + (includeFemale ? "," : ""),
      );
    }
    if (includeFemale) {
      jsonStructureParts.push(
        '  "female": [',
        '    { "pose": 1, "status": "green", "issue": "", "suggestion": "" },',
        "    ...",
        "  ]",
      );
    }
    jsonStructureParts.push("}");

    const systemPrompt = [
      "You are an expert AI image-generation policy consultant specializing in OpenAI's content policy / safety moderation system.",
      "You will receive reference images of a fashion item" +
        (itemType ? ` (item type: "${itemType}")` : "") +
        ".",
      `Your task: evaluate whether OpenAI's image generation API (gpt-image-1) will BLOCK or REFUSE to generate each of the following studio poses for ${genderLabel} models wearing this item, due to content policy violations (nudity, sexuality, suggestiveness, exposed intimate areas, etc.).`,
      "",
      "Context: we are generating professional e-commerce fashion catalog photos. The generation prompt includes a 'NON-SEXUAL PRODUCT CATALOG HARD LOCK' instruction. However, certain combinations of item type + pose can still trigger OpenAI's safety filter.",
      "",
      "For each pose, evaluate:",
      "- Whether the combination of this item type + this pose angle/framing will trigger OpenAI's content policy refusal (nudity, sexuality, suggestive framing).",
      "- Whether exposed skin areas (thighs, back, chest, midriff) in this pose could be flagged as too revealing for this item type.",
      "- Whether the camera angle or body positioning in this pose creates suggestive or intimate framing that OpenAI may refuse.",
      "- Whether the close-up or crop framing focuses on body areas that would be flagged.",
      "",
      ...poseLibraryBlocks,
      "Return ONLY valid JSON (no markdown fences, no extra text) in this exact structure:",
      ...jsonStructureParts,
      "",
      "Rules:",
      '- "status" must be "green" (will generate without policy block) or "red" (likely to be blocked by OpenAI content policy).',
      '- For green poses: "issue" and "suggestion" should be empty strings.',
      '- For red poses: "issue" should be a concise 1-sentence explanation of WHY OpenAI will likely block this pose for this item (e.g., "Back view of a bikini bottom exposes too much skin, triggering nudity filter").',
      '- For red poses: "suggestion" should be a concrete prompt instruction that can be ADDED to the generation command to avoid the block. Write it as a direct instruction to the AI image generator that ONLY modifies camera angle, framing, crop, or pose positioning. NEVER suggest adding clothing, accessories, cover-ups, wraps, overlays, or any physical items. Examples: "Frame the shot from waist-up only to avoid exposed leg areas", "Use a 3/4 front angle instead of direct back view", "Crop to upper body and face only", "Shift camera to a higher angle to reduce focus on lower body". The suggestion must be specific and actionable — changing only the angle, framing, or pose direction to keep it policy-safe while still showing the product.',
      "- Each array must have exactly 8 entries (pose 1 through 8).",
      "- Be strict: if there is any meaningful risk of OpenAI refusing to generate due to content policy, mark it red.",
      "- Focus ONLY on content policy / safety moderation risks. Do NOT flag poses for quality/accuracy/hallucination concerns — only flag poses that OpenAI will actively REFUSE to generate.",
    ].join("\n");

    const response = await client.responses.create({
      model: "gpt-5.2",
      temperature: 0,
      max_output_tokens: 2000,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: systemPrompt },
            ...imageInputs,
          ],
        },
      ],
    });

    const raw = normalizeText(response.output_text || "");
    let parsed: { male?: PoseResult[]; female?: PoseResult[] };
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response.", raw },
        { status: 502 }
      );
    }

    const normalize = (arr: PoseResult[], names: string[]) =>
      arr.slice(0, 8).map((entry, i) => ({
        pose: i + 1,
        name: names[i] || `Pose ${i + 1}`,
        status: entry.status === "red" ? ("red" as const) : ("green" as const),
        issue: typeof entry.issue === "string" ? entry.issue : "",
        suggestion: typeof entry.suggestion === "string" ? entry.suggestion : "",
      }));

    const result: { male: PoseResult[]; female: PoseResult[] } = {
      male: [],
      female: [],
    };

    if (includeMale && Array.isArray(parsed.male)) {
      result.male = normalize(parsed.male, POSE_NAMES_MALE);
    }
    if (includeFemale && Array.isArray(parsed.female)) {
      result.female = normalize(parsed.female, POSE_NAMES_FEMALE);
    }

    if (!result.male.length && !result.female.length) {
      return NextResponse.json(
        { error: "Malformed AI response structure.", raw },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Item scan failed." },
      { status: 500 }
    );
  }
}

interface PoseResult {
  pose: number;
  name?: string;
  status: "green" | "red";
  issue?: string;
  suggestion?: string;
}
