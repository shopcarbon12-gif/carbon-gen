import {
  FEMALE_PANEL_MAPPING_TEXT,
  MALE_PANEL_MAPPING_TEXT,
  getPoseLibraryForGender,
} from "@/lib/panelPoseLibraries";

export async function parseJsonResponse(resp: Response, endpoint?: string) {
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return resp.json();
  }

  const text = await resp.text();
  const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
  const isHtml = /<!doctype html|<html[\s>]/i.test(text);
  const where = endpoint ? ` (${endpoint})` : "";
  if (isHtml) {
    throw new Error(
      `Server returned HTML instead of JSON${where} (status ${resp.status}). ` +
        `This usually means a tunnel/proxy/origin issue. ` +
        `Try directly on http://localhost:3000 and restart cloudflared + dev server. ` +
        `Snippet: ${snippet || "<empty>"}`
    );
  }

  throw new Error(
    snippet ? `Unexpected response${where}: ${snippet}` : `Unexpected non-JSON response${where}`
  );
}

export function getPanelPosePair(gender: string, panelNumber: number): [number, number] {
  const g = String(gender || "").toLowerCase();
  if (g === "female") {
    if (panelNumber === 1) return [1, 2];
    if (panelNumber === 2) return [3, 4];
    if (panelNumber === 3) return [7, 5];
    return [6, 8];
  }
  if (panelNumber === 1) return [1, 2];
  if (panelNumber === 2) return [3, 4];
  if (panelNumber === 3) return [5, 6];
  return [7, 8];
}

export function getPanelButtonLabel(gender: string, panelNumber: number) {
  const [poseA, poseB] = getPanelPosePair(gender, panelNumber);
  return `Panel ${panelNumber} (Pose ${poseA} + ${poseB})`;
}

function extractPoseBlock(library: string, poseNumber: number) {
  const regex = new RegExp(`(POSE\\s+${poseNumber}\\s+[\\s\\S]*?)(?=\\nPOSE\\s+\\d+\\s+|$)`, "i");
  const match = library.match(regex);
  return match?.[1]?.trim() || `POSE ${poseNumber}`;
}

export function buildMasterPanelPrompt(args: {
  panelNumber: number;
  panelLabel: string;
  poseA: number;
  poseB: number;
  modelName: string;
  modelGender: string;
  modelRefs: string[];
  itemRefs: string[];
  itemType: string;
}) {
  const poseLibrary = getPoseLibraryForGender(args.modelGender);
  const mappingText =
    String(args.modelGender || "").toLowerCase() === "female"
      ? FEMALE_PANEL_MAPPING_TEXT
      : MALE_PANEL_MAPPING_TEXT;
  const poseABlock = extractPoseBlock(poseLibrary, args.poseA);
  const poseBBlock = extractPoseBlock(poseLibrary, args.poseB);
  const isFemalePanel3 =
    String(args.modelGender || "").toLowerCase() === "female" && args.panelNumber === 3;

  return [
    "CHATGPT-ONLY EXECUTION HARD LOCK (embedded by app)",
    "ITEM REFERENCE INTERPRETATION HARD LOCK:",
    "- Treat every uploaded item image as product reference only.",
    "- Item images may show a person, flat-lay, hanger, or mannequin.",
    "- Never copy any person identity/presentation from item refs (face, skin tone, hair, body type, pose, identity).",
    "- Human in item refs = temporary hanger/mannequin only. Not a character source.",
    "- Forbidden from item-ref humans: face shape, eyes, nose, lips, jawline, skin tone, hair texture/color/style/hairline, age cues, body proportions, tattoos, jewelry.",
    "- If any item ref conflicts with model identity, ignore the human and keep only garment details.",
    "- Identity source priority is absolute: MODEL refs first and only for person identity; item refs are garment-only.",
    "- Use item refs only for product attributes: shape, color, material, construction, and details.",
    "- If a full-body outfit image is provided, treat it as a single full-look reference (top, bottom, shoes, accessories).",
    "- If full-look + separate item images are both provided, detect matching parts and replace those parts in the full look with the separate uploaded item references.",
    "- Keep all non-replaced parts from the full-look reference unchanged.",
    "- CLOSE-UP LOCK: for MALE Pose 6 and FEMALE Pose 5, generate one close-up using section 0.5 item references.",
    "- If a set or multiple items are present, pick the most detailed item and use that for the single close-up.",
    "PANEL MAPPING IS IMMUTABLE. DO NOT REMAP.",
    mappingText,
    "Generate exactly ONE 2-up panel image.",
    "Age requirement: the model must be an adult 18+ only.",
    "Canvas 1540x1155; left frame 770x1155; right frame 770x1155; thin divider.",
    "No collage, no extra poses, no extra panels.",
    "Identity anchor override: use ONLY MODEL refs for face/body identity.",
    "Identity consistency lock: keep the same exact person identity across every generated panel in this run (same face structure, eyes, nose, lips, skin tone, and hairline).",
    "Do not drift identity panel-to-panel.",
    "Hard identity lock: this must be the exact same person across all panels in this generation batch.",
    "Do not change age appearance, facial proportions, skin tone, hairline, or ethnicity between panels.",
    "Item refs are product-only anchors; never copy identity from item photos.",
    "If an item photo shows a real person, treat that person as invisible except for clothing pixels.",
    "Outfit continuity lock: both left and right frames must represent the same selected outfit/look from item references (unless right frame is an intentional close-up of that same look).",
    "No outfit swaps, no colorway swaps, no garment substitutions across frames.",
    `Panel request: Panel ${args.panelNumber} (${args.panelLabel}).`,
    `Active pose priority: LEFT Pose ${args.poseA}, RIGHT Pose ${args.poseB}.`,
    "ONLY these two active poses are allowed in this image.",
    ...(isFemalePanel3
      ? [
          "FEMALE PANEL 3 CRITICAL LOCK (Pose 7 + Pose 5):",
          "- LEFT Pose 7 must show lower body from the same exact selected look (same bottom/color/fabric/details).",
          "- RIGHT Pose 5 must be a close-up of the most detailed item from that same selected look.",
          "- Do not introduce a different person identity, different outfit, or different colorway in either side.",
        ]
      : []),
    `LEFT ACTIVE POSE:\n${poseABlock}`,
    `RIGHT ACTIVE POSE:\n${poseBBlock}`,
    "All non-active poses are reference only and must not execute in this image.",
    "FULL POSE LIBRARY (REFERENCE ONLY):",
    poseLibrary,
    "Full-body framing lock (male + female): whenever an active pose is full-body, include full head and both feet entirely in frame. No cropping of head, hair, chin, toes, or shoes.",
    "Full-body no-crop applies to: Male poses 1,2,4 and Female poses 1,2,3,6.",
    "Camera framing rule for full-body active poses: fit the complete body from top of hair to bottom of shoes with visible white margin above the head and below the feet.",
    "If a full-body active pose would crop head or feet, zoom out and reframe until full body is fully visible.",
    "If an active pose is not full-body (e.g., close-up/lower-body/torso crop), follow that crop as defined.",
    `Model: ${args.modelName} (${args.modelGender}).`,
    `Model reference URLs: ${args.modelRefs.join(", ")}.`,
    `Item type: ${args.itemType}.`,
    `Item reference URLs: ${args.itemRefs.join(", ")}.`,
    "Pure white background, high-key studio light, faint contact shadow only.",
    "Hands rule: no hands in pockets.",
  ].join("\n");
}
