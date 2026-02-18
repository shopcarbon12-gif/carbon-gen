
"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

type Gender = "male" | "female";
type ImageSize = "1K" | "2K" | "4K";

type GeneratedPanel = {
  panelNumber: number;
  url: string;
  timestamp: number;
};

type ModelRecord = {
  model_id: string;
  name: string;
  gender: Gender;
  ref_image_urls: string[];
  created_at?: string;
};

type PendingPreview = {
  id: string;
  url: string;
  file: File;
};

type PendingRef = {
  id: string;
  previewUrl: string;
  source: "local" | "shopify" | "dropbox";
  file?: File;
  remoteUrl?: string;
  title?: string;
};

type ShopifyImage = {
  id: string;
  title: string;
  imageUrl: string;
};

type DropboxImage = {
  id: string;
  title: string;
  temporaryLink: string;
  pathLower: string;
};

type IntegrationConfig = {
  shopifyStore: string;
  dropboxBarcode: string;
};

type GenerationParams = {
  panelNumber: number;
  panelLabel: string;
  poseA: number;
  poseB: number;
  modelGender: Gender;
  itemType: string;
  modelId?: string;
  itemStyleInstructions?: string;
};

const PANEL_MAPPING: Record<Gender, Array<{ label: string; poseA: number; poseB: number }>> = {
  male: [
    { label: "Panel 1: Pose 1 + 2", poseA: 1, poseB: 2 },
    { label: "Panel 2: Pose 3 + 4", poseA: 3, poseB: 4 },
    { label: "Panel 3: Pose 5 + 6", poseA: 5, poseB: 6 },
    { label: "Panel 4: Pose 7 + 8", poseA: 7, poseB: 8 },
  ],
  female: [
    { label: "Panel 1: Pose 1 + 2", poseA: 1, poseB: 2 },
    { label: "Panel 2: Pose 3 + 4", poseA: 3, poseB: 4 },
    { label: "Panel 3: Pose 7 + 5", poseA: 7, poseB: 5 },
    { label: "Panel 4: Pose 6 + 8", poseA: 6, poseB: 8 },
  ],
};

const SIZE_TO_API: Record<ImageSize, "1024x1024" | "1536x1024" | "1024x1536"> = {
  "1K": "1024x1024",
  "2K": "1536x1024",
  "4K": "1536x1024",
};

const DEFAULT_CONFIG: IntegrationConfig = {
  shopifyStore: "",
  dropboxBarcode: "",
};
const getPose8Variation = (itemType: string): string => {
  const t = itemType.toLowerCase();
  if (
    t.includes("jacket") ||
    t.includes("puffer") ||
    t.includes("coat") ||
    t.includes("vest") ||
    t.includes("overshirt")
  ) {
    return "8C: Walking Across Frame (Controlled Mid-Step) - Default for Outerwear.";
  }
  if (
    t.includes("pant") ||
    t.includes("jean") ||
    t.includes("denim") ||
    t.includes("cargo") ||
    t.includes("short") ||
    t.includes("skirt") ||
    t.includes("trouser")
  ) {
    return "8E: Seated Edge (Cube/Bench) - Default for Bottoms.";
  }
  return "8B: Seated Stool - 3/4 Angle (25-35 deg) - Default for Tops/Dresses.";
};

const MALE_POSES: Record<number, { base: string; variations: string[] }> = {
  1: {
    base:
      "Full Body Front Hero: Full body; straight-on; head and feet fully visible. Arms relaxed at sides (1-2 inches from torso). Hands visible. Feet parallel. Chin slightly down.",
    variations: ["1A: Arms 1 inch away", "1B: Arms 2 inches away", "1C: Slight toe-out (5-10 deg)"],
  },
  2: {
    base:
      "Full Body Lifestyle: Full body; same scale as Pose 1. Subtle weight shift. Hands visible. Calm off-camera gaze.",
    variations: ["2A: Slight toe-out", "2B: Small heel lift", "2C: Calm off-camera gaze"],
  },
  3: {
    base:
      "Torso + Head Front: Crop mid-thigh up. Upright posture. Arms slightly back. Neckline/branding unobstructed.",
    variations: ["3A: Head neutral, eyes to camera", "3B: Head 5-10 deg angle", "3C: Calm off-camera gaze"],
  },
  4: {
    base:
      "Full Body Back View: Full body; straight-on back. Arms relaxed away from body. No twisting. Hands visible.",
    variations: ["4A: Arms slightly wider", "4B: Arms slightly closer", "4C: Head neutral vs tiny look-down"],
  },
  5: {
    base:
      "Lower Body / Legs: Crop waist to feet. Neutral stance. Emphasize drape, stacking, and hem finish. Waistband visible.",
    variations: ["5A: Feet parallel", "5B: Slight toe-out", "5C: Stance: hip-width"],
  },
  6: {
    base:
      "CLOSE-UP ITEM TYPE LOCK: Single frame focus ONLY on the specified item. Priority: Branding -> Hardware -> Construction -> Texture. High context, sharp macro focus.",
    variations: ["6A: Branding hero", "6B: Hardware hero", "6C: Construction/texture hero"],
  },
  7: {
    base:
      "Torso Back (Over-Shoulder): Crop mid-thigh up; back-facing. Head turns 20-30 deg over shoulder. Hands visible.",
    variations: ["7A: Head turn ~20 deg", "7B: Head turn ~30 deg", "7C: Look-over shoulder"],
  },
  8: {
    base:
      "Natural Variation (Controlled Creative): Output ONE creative image. Pure white background. Hands visible, no pockets. Calm attitude.",
    variations: ["8A: Seated Stool - Front", "8B: Seated Stool - 3/4 Angle", "8C: Walking Across Frame"],
  },
};
const FEMALE_POSES: Record<number, { base: string; variations: string[] }> = {
  1: {
    base:
      "Front Hero: Full body; head + feet visible. Subtle hip shift. Arms 1-2 inches from torso. Professional/premium.",
    variations: ["1A: Hip shift left", "1B: Hip shift right", "1C: Feet parallel"],
  },
  2: {
    base:
      "Back View (Face Visible): Full body; back-facing. Head turned 30-45 deg over shoulder. Arms away from torso. Face visible.",
    variations: ["2A: Head turn ~30 deg", "2B: Head turn ~45 deg", "2C: Look-over shoulder"],
  },
  3: {
    base:
      "3/4 Front Angle: Full body; rotated 25-35 deg. Weight shift only. Arms away from body to show waist shape.",
    variations: ["3A: Rotate ~25 deg", "3B: Rotate ~30 deg", "3C: Rotate ~35 deg"],
  },
  4: {
    base:
      "Upper Body (With Face): Crop mid-thigh up. Upright posture. Arms relaxed. Neckline/branding visible.",
    variations: ["4A: Head neutral, gaze to camera", "4B: Small head tilt", "4C: Calm off-camera gaze"],
  },
  5: {
    base:
      "CLOSE-UP ITEM TYPE LOCK: Single frame focus ONLY on specified item. Priority: Branding -> Hardware -> Construction -> Texture. Sharp macro focus.",
    variations: ["5A: Branding hero", "5B: Hardware hero", "5C: Construction hero"],
  },
  6: {
    base:
      "Relaxed Front Variation: Full body; front-facing. Casual but premium. No pockets. Face visible.",
    variations: ["6A: Both arms relaxed", "6B: One hand on thigh (no occlusion)", "6C: Off-camera gaze"],
  },
  7: {
    base:
      "Lower Body / Legs: Crop waist to feet. Neutral stance. Waistband, closure, and pockets clearly visible.",
    variations: ["7A: Toe-out left", "7B: Toe-out right", "7C: Stance width variation"],
  },
  8: {
    base:
      "Natural Variation (Controlled Creative): Output ONE creative image. Pure white background. Premium calm expression.",
    variations: ["8A: Seated Stool - Front", "8B: Seated Stool - 3/4 Angle", "8C: Controlled Walk-In"],
  },
};
const buildMasterPanelPrompt = (args: GenerationParams): string => {
  const library = args.modelGender === "male" ? MALE_POSES : FEMALE_POSES;
  const variationIdx = (args.panelNumber + (args.itemType.length % 3)) % 3;

  const poseAData = library[args.poseA];
  const poseBData = library[args.poseB];

  const getPoseDesc = (poseId: number, data: { base: string; variations: string[] }) => {
    if (!data) return `Pose ${poseId}`;
    if (poseId === 8) {
      return `${data.base} RULE: ${getPose8Variation(args.itemType)}`;
    }
    return `${data.base} VARIATION: ${data.variations[variationIdx]}`;
  };

  return [
    "SHOPIFY ECOM PHOTO GENERATOR - MASTER INSTRUCTION",
    "",
    "ROLE: Premium, photorealistic, Shopify-ready ecommerce product photos.",
    "",
    "1) IDENTITY LOCK (CRITICAL):",
    "- Use the exact facial features, skin tone, hair texture, and body type provided in the MODEL IDENTITY REFERENCE IMAGES.",
    "- Ensure the model identity is consistent across both frames in this diptych.",
    "- Do not blend the target model with people in garment references.",
    "",
    "2) ITEM FIDELITY (CRITICAL):",
    "- Generate the exact garment shown in the GARMENT REFERENCE IMAGES.",
    "- Preserve every seam, hardware detail, specific fabric texture, and branding placement.",
    "- If the garment reference shows a person wearing it, ignore that person and transfer the garment only.",
    "",
    "3) STUDIO SPECIFICATIONS:",
    "- CANVAS: 1536 x 1024 diptych (two 768 x 1024 frames side-by-side).",
    "- BACKGROUND: Pure white (#FFFFFF). No props or texture.",
    "- LIGHTING: Bright, even studio lighting. Sharp details.",
    "",
    "4) PANEL EXECUTION:",
    `- FRAME 1 (LEFT SIDE): ${getPoseDesc(args.poseA, poseAData)}`,
    `- FRAME 2 (RIGHT SIDE): ${getPoseDesc(args.poseB, poseBData)}`,
    "- HANDS: Always visible. Never in pockets.",
    "- CONSISTENCY: Frame 1 and Frame 2 must feature the same model wearing the same garment.",
    "",
    `ITEM TYPE TO GENERATE: ${args.itemType}`,
    `MODEL IDENTITY TO USE: ${args.modelId || "ASSIGNED"}`,
    args.itemStyleInstructions ? `STYLING NOTES: ${args.itemStyleInstructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

function normalizeModelId(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

async function safeJson(resp: Response) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

function mergeUniqueByName(existing: PendingPreview[], incoming: PendingPreview[]) {
  const seen = new Set(existing.map((p) => `${p.file.name}::${p.file.size}::${p.file.lastModified}`));
  const out = [...existing];
  for (const next of incoming) {
    const key = `${next.file.name}::${next.file.size}::${next.file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out;
}
export default function GeminiWorkspace() {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [panels, setPanels] = useState<GeneratedPanel[]>([]);
  const [draftModelId, setDraftModelId] = useState<string | null>(null);
  const [pendingGender, setPendingGender] = useState<Gender>("female");
  const [pendingModelPreviews, setPendingModelPreviews] = useState<PendingPreview[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [itemType, setItemType] = useState("");
  const [pendingItemRefs, setPendingItemRefs] = useState<PendingRef[]>([]);
  const [savedItemRefs, setSavedItemRefs] = useState<string[]>([]);
  const [savedItemType, setSavedItemType] = useState("");
  const [itemStyle, setItemStyle] = useState("");
  const [size, setSize] = useState<ImageSize>("4K");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [pickerModal, setPickerModal] = useState<{
    active: boolean;
    target: "model" | "item";
    source: "shopify" | "dropbox" | null;
  }>({ active: false, target: "model", source: null });
  const [shopifyCatalog, setShopifyCatalog] = useState<ShopifyImage[]>([]);
  const [dropboxCatalog, setDropboxCatalog] = useState<DropboxImage[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [config, setConfig] = useState<IntegrationConfig>(DEFAULT_CONFIG);

  const modelInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const isDraftActive = draftModelId && activeModelId === draftModelId;

  const activeModel = useMemo(
    () => models.find((m) => m.model_id === activeModelId) || null,
    [models, activeModelId]
  );

  const combinedModelList = useMemo(() => {
    const list = models.map((m) => ({
      id: m.model_id,
      label: m.name,
      gender: m.gender,
      isDraft: false,
    }));
    if (draftModelId) {
      const exists = list.some((m) => m.label.toLowerCase() === draftModelId.toLowerCase());
      if (!exists) {
        list.unshift({
          id: draftModelId,
          label: draftModelId,
          gender: pendingGender,
          isDraft: true,
        });
      }
    }
    return list;
  }, [models, draftModelId, pendingGender]);
  useEffect(() => {
    const stored = window.localStorage.getItem("gemini-config");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setConfig({
          shopifyStore: String(parsed?.shopifyStore || ""),
          dropboxBarcode: String(parsed?.dropboxBarcode || ""),
        });
      } catch {
        setConfig(DEFAULT_CONFIG);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("gemini-config", JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    return () => {
      pendingModelPreviews.forEach((p) => URL.revokeObjectURL(p.url));
      pendingItemRefs.forEach((p) => {
        if (p.source === "local") URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, [pendingModelPreviews, pendingItemRefs]);

  useEffect(() => {
    refreshModels();
  }, []);

  async function refreshModels() {
    try {
      const resp = await fetch("/api/models/list", { cache: "no-store" });
      const json = await safeJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to load models");
      const next = Array.isArray(json?.models) ? (json.models as ModelRecord[]) : [];
      setModels(next);
    } catch (err: any) {
      setError(err?.message || "Failed to load models");
    }
  }
  function addModelIdentity(id: string) {
    const cleanId = normalizeModelId(id);
    if (!cleanId) return;
    if (models.some((m) => m.name.toLowerCase() === cleanId.toLowerCase())) {
      setError("A model with this name already exists. Choose a new ID.");
      return;
    }
    setDraftModelId(cleanId);
    setActiveModelId(cleanId);
    setPendingGender("female");
    setPendingModelPreviews([]);
    setError(null);
  }

  function handleModelUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length || !draftModelId) return;

    const previews = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      url: URL.createObjectURL(file),
      file,
    }));

    setPendingModelPreviews((prev) => mergeUniqueByName(prev, previews).slice(0, 10));
    setStatusMessage(`Staged ${files.length} image(s)`);
    setTimeout(() => setStatusMessage(""), 2000);

    e.target.value = "";
  }

  function removePendingModelPreview(id: string) {
    setPendingModelPreviews((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function saveModel() {
    if (!draftModelId) {
      setError("Select a model identity first.");
      return;
    }
    if (pendingModelPreviews.length < 3) {
      setError("At least 3 model reference images are required.");
      return;
    }

    try {
      setError(null);
      const form = new FormData();
      form.append("name", draftModelId);
      form.append("gender", pendingGender);
      pendingModelPreviews.forEach((p) => form.append("files", p.file));
      const resp = await fetch("/api/models", { method: "POST", body: form });
      const json = await safeJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Model save failed");

      pendingModelPreviews.forEach((p) => URL.revokeObjectURL(p.url));
      setPendingModelPreviews([]);
      setDraftModelId(null);
      setActiveModelId(String(json?.model?.model_id || ""));
      setStatusMessage(`Identity ${draftModelId} saved`);
      setTimeout(() => setStatusMessage(""), 2500);
      refreshModels();
    } catch (err: any) {
      setError(err?.message || "Model save failed");
    }
  }

  async function deleteModel(modelId: string) {
    try {
      setError(null);
      await fetch("/api/models/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId }),
      });
      if (activeModelId === modelId) setActiveModelId("");
      refreshModels();
    } catch (err: any) {
      setError(err?.message || "Failed to delete model");
    }
  }
  function handleItemUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;

    const previews: PendingRef[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      previewUrl: URL.createObjectURL(file),
      source: "local",
      file,
      title: file.name,
    }));

    setPendingItemRefs((prev) => [...prev, ...previews].slice(0, 10));
    setStatusMessage(`Staged ${files.length} item reference(s)`);
    setTimeout(() => setStatusMessage(""), 2000);

    e.target.value = "";
  }

  function removePendingItemRef(id: string) {
    setPendingItemRefs((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.source === "local") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function saveItem() {
    if (!itemType.trim() || pendingItemRefs.length === 0) {
      setError("Item type and at least one reference are required.");
      return;
    }

    try {
      setError(null);
      const localFiles = pendingItemRefs.filter((p) => p.source === "local" && p.file);
      const remoteUrls = pendingItemRefs
        .filter((p) => p.source !== "local" && p.remoteUrl)
        .map((p) => String(p.remoteUrl));

      const urls: string[] = [];

      if (localFiles.length) {
        const form = new FormData();
        localFiles.forEach((p) => form.append("files", p.file as File));
        const resp = await fetch("/api/items", { method: "POST", body: form });
        const json = await safeJson(resp);
        if (!resp.ok) throw new Error(json?.error || "Item upload failed");
        if (Array.isArray(json?.urls)) urls.push(...json.urls);
      }

      if (remoteUrls.length) {
        const resp = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: remoteUrls }),
        });
        const json = await safeJson(resp);
        if (!resp.ok) throw new Error(json?.error || "Item import failed");
        if (Array.isArray(json?.urls)) urls.push(...json.urls);
      }

      if (!urls.length) throw new Error("No item references were saved.");

      setSavedItemRefs(urls);
      setSavedItemType(itemType.trim());
      setStatusMessage("Product SKU saved");
      setTimeout(() => setStatusMessage(""), 2500);
    } catch (err: any) {
      setError(err?.message || "Item save failed");
    }
  }
  async function openPicker(source: "shopify" | "dropbox", target: "model" | "item") {
    if (target === "model") {
      setError("Shopify/Dropbox import is for item references only.");
      return;
    }
    setPickerModal({ active: true, target, source });
    setIsLoadingCatalog(true);
    setError(null);
    try {
      if (source === "shopify") {
        const store = config.shopifyStore.trim();
        if (!store) throw new Error("Shopify store is missing. Set it in Connections.");
        const params = new URLSearchParams({ shop: store });
        const resp = await fetch(`/api/shopify/catalog?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await safeJson(resp);
        if (!resp.ok) throw new Error(json?.error || "Shopify catalog fetch failed");
        const products = Array.isArray(json?.products) ? json.products : [];
        const images: ShopifyImage[] = [];
        for (const product of products) {
          const title = String(product?.title || "Shopify product");
          const list = Array.isArray(product?.images) ? product.images : [];
          for (const img of list) {
            if (!img?.url) continue;
            images.push({
              id: String(img?.id || img?.url || crypto.randomUUID()),
              title,
              imageUrl: String(img.url),
            });
          }
        }
        setShopifyCatalog(images.slice(0, 120));
      } else {
        const barcode = config.dropboxBarcode.trim();
        if (!barcode) throw new Error("Dropbox barcode is missing. Set it in Connections.");
        const resp = await fetch("/api/dropbox/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcode }),
        });
        const json = await safeJson(resp);
        if (!resp.ok) throw new Error(json?.error || "Dropbox search failed");
        const images = Array.isArray(json?.images) ? json.images : [];
        setDropboxCatalog(
          images.map((img: any) => ({
            id: String(img?.id || ""),
            title: String(img?.title || "Dropbox image"),
            pathLower: String(img?.pathLower || ""),
            temporaryLink: String(img?.temporaryLink || ""),
          }))
        );
      }
    } catch (err: any) {
      setError(err?.message || "Catalog fetch failed");
      setPickerModal({ active: false, target: "model", source: null });
    } finally {
      setIsLoadingCatalog(false);
    }
  }

  function selectShopifyImage(url: string, title: string) {
    if (!url) return;
    setPendingItemRefs((prev) =>
      [
        ...prev,
        {
          id: `shopify:${Date.now()}:${crypto.randomUUID()}`,
          previewUrl: url,
          source: "shopify" as const,
          remoteUrl: url,
          title,
        },
      ].slice(0, 10)
    );
    setPickerModal({ active: false, target: "model", source: null });
  }

  function selectDropboxImage(file: DropboxImage) {
    if (!file.temporaryLink) return;
    setPendingItemRefs((prev) =>
      [
        ...prev,
        {
          id: `dropbox:${file.id}`,
          previewUrl: file.temporaryLink,
          source: "dropbox" as const,
          remoteUrl: file.temporaryLink,
          title: file.title,
        },
      ].slice(0, 10)
    );
    setPickerModal({ active: false, target: "model", source: null });
  }

  async function handleGenerate() {
    if (!activeModel) {
      setError("Select a saved model identity first.");
      return;
    }
    if (!savedItemRefs.length || !savedItemType.trim()) {
      setError("Save the item SKU blueprint before generating.");
      return;
    }

    if (!Array.isArray(activeModel.ref_image_urls) || activeModel.ref_image_urls.length < 3) {
      setError("Selected model is missing enough reference images.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setPanels([]);

    const newPanels: GeneratedPanel[] = [];
    for (let i = 0; i < 4; i += 1) {
      const panelNumber = i + 1;
      const configPair = PANEL_MAPPING[activeModel.gender][i];
      try {
        const prompt = buildMasterPanelPrompt({
          panelNumber,
          panelLabel: configPair.label,
          poseA: configPair.poseA,
          poseB: configPair.poseB,
          modelGender: activeModel.gender,
          itemType: savedItemType,
          modelId: activeModel.name,
          itemStyleInstructions: itemStyle,
        });

        const resp = await fetch("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            size: SIZE_TO_API[size],
            modelRefs: activeModel.ref_image_urls,
            itemRefs: savedItemRefs,
            panelQa: {
              panelNumber,
              panelLabel: configPair.label,
              poseA: configPair.poseA,
              poseB: configPair.poseB,
              modelName: activeModel.name,
              modelGender: activeModel.gender,
              itemType: savedItemType,
            },
          }),
        });

        const json = await safeJson(resp);
        if (!resp.ok) {
          const msg = json?.error || `Panel ${panelNumber} failed`;
          const details = json?.details ? `: ${json.details}` : "";
          throw new Error(`${msg}${details}`);
        }
        if (json?.degraded) {
          throw new Error(json?.warning || `Panel ${panelNumber} returned a fallback image`);
        }

        const b64 = json?.imageBase64 || null;
        if (!b64) throw new Error(`No image returned for panel ${panelNumber}`);
        const url = `data:image/png;base64,${b64}`;
        const panel = { panelNumber, url, timestamp: Date.now() };
        newPanels.push(panel);
        setPanels([...newPanels]);
      } catch (err: any) {
        setError(err?.message || "Generation failed");
        break;
      }
    }

    setIsGenerating(false);
  }
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-white selection:text-black antialiased">
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-zinc-900 px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-2xl">
            <i className="fa-solid fa-camera-retro text-black text-2xl"></i>
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-white">Gemini Generator</h1>
            <p className="text-[10px] text-zinc-400 uppercase tracking-[0.4em] font-black">Studio Panels</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {statusMessage && (
            <span className="text-[11px] font-black text-green-400 animate-pulse tracking-widest">
              {statusMessage}
            </span>
          )}
          <div className="flex gap-4">
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all flex items-center gap-2"
            >
              <i className="fa-solid fa-link text-zinc-500"></i> CONNECTIONS
            </button>
            <button
              onClick={() => setShowConfigModal(true)}
              className="p-2 text-zinc-400 hover:text-white transition-all transform hover:rotate-90 duration-500"
            >
              <i className="fa-solid fa-gear text-xl"></i>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        <aside className="w-full lg:w-[480px] p-8 border-r border-zinc-900 overflow-y-auto bg-[#0c0c0c] shrink-0 custom-scrollbar">
          <div className="space-y-12">
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-5">
                <h2 className="text-[11px] font-black text-zinc-200 uppercase tracking-[0.4em]">
                  01. Talent Identity
                </h2>
                <span className="text-[10px] text-zinc-500 font-mono font-bold tracking-widest">
                  {models.length} LOADED
                </span>
              </div>
              <div className="space-y-4">
                <input
                  placeholder="NEW MODEL ID (PRESS ENTER)"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-sm font-mono uppercase text-white focus:border-white focus:bg-zinc-950 outline-none transition-all placeholder:text-zinc-700 shadow-inner"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value;
                      if (val) {
                        addModelIdentity(val);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                />
                <div className="grid grid-cols-1 gap-2.5">
                  {combinedModelList.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setActiveModelId(m.id)}
                      className={`group p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between shadow-sm ${
                        activeModelId === m.id
                          ? "bg-white border-white text-black ring-4 ring-white/10"
                          : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-5">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black ${
                            activeModelId === m.id ? "bg-black text-white shadow-xl" : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {m.gender === "male" ? "M" : "F"}
                        </div>
                        <span className="text-xs font-black uppercase tracking-[0.15em]">{m.label}</span>
                        {m.isDraft && (
                          <span className="text-[9px] uppercase tracking-widest text-amber-400">Draft</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {activeModelId === m.id && (
                          <i className="fa-solid fa-fingerprint text-[10px] opacity-60"></i>
                        )}
                        {!m.isDraft && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteModel(m.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 hover:text-red-500 transition-all"
                          >
                            <i className="fa-solid fa-trash text-[12px]"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {activeModelId && (
                  <div className="p-7 bg-zinc-900/40 rounded-[2.5rem] border border-zinc-800 border-dashed space-y-7 animate-in fade-in slide-in-from-top-3 duration-500 shadow-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        {activeModelId} Profile Setup
                      </span>
                      <div className="flex gap-4">
                        <button
                          onClick={() => openPicker("shopify", "model")}
                          className="text-green-500 hover:scale-125 transition-transform"
                        >
                          <i className="fa-brands fa-shopify text-xl"></i>
                        </button>
                        <button
                          onClick={() => openPicker("dropbox", "model")}
                          className="text-blue-500 hover:scale-125 transition-transform"
                        >
                          <i className="fa-brands fa-dropbox text-xl"></i>
                        </button>
                      </div>
                    </div>

                    {isDraftActive ? (
                      <>
                        <div className="grid grid-cols-4 gap-3.5">
                          {pendingModelPreviews.map((r) => (
                            <div
                              key={r.id}
                              className="aspect-square rounded-2xl overflow-hidden border border-zinc-800 relative group shadow-lg ring-1 ring-zinc-800"
                            >
                              <img src={r.url} className="w-full h-full object-cover" />
                              <button
                                onClick={() => removePendingModelPreview(r.id)}
                                className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300"
                              >
                                <i className="fa-solid fa-xmark text-lg"></i>
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => modelInputRef.current?.click()}
                            className="aspect-square rounded-2xl border-2 border-dashed border-zinc-800 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-white hover:border-zinc-500 transition-all duration-300 bg-zinc-900/20"
                          >
                            <i className="fa-solid fa-user-plus text-2xl"></i>
                          </button>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => setPendingGender("male")}
                            className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                              pendingGender === "male"
                                ? "bg-zinc-100 text-black shadow-2xl scale-[1.02]"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                          >
                            Male
                          </button>
                          <button
                            onClick={() => setPendingGender("female")}
                            className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${
                              pendingGender === "female"
                                ? "bg-zinc-100 text-black shadow-2xl scale-[1.02]"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            }`}
                          >
                            Female
                          </button>
                        </div>

                        <button
                          onClick={saveModel}
                          className="w-full py-5 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] hover:bg-zinc-200 shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4"
                        >
                          <i className="fa-solid fa-id-card"></i> SAVE IDENTITY
                        </button>
                      </>
                    ) : activeModel ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-4 gap-3.5">
                          {activeModel.ref_image_urls.map((r, i) => (
                            <div
                              key={`${activeModel.model_id}-${i}`}
                              className="aspect-square rounded-2xl overflow-hidden border border-zinc-800 relative shadow-lg ring-1 ring-zinc-800"
                            >
                              <img src={r} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                          Saved model references are read-only. Delete and recreate to replace.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                        Select a model to continue.
                      </p>
                    )}

                    <input
                      type="file"
                      ref={modelInputRef}
                      onChange={handleModelUpload}
                      className="hidden"
                      multiple
                      accept="image/*"
                    />
                  </div>
                )}
              </div>
            </section>
            <section className="space-y-6">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-5">
                <h2 className="text-[11px] font-black text-zinc-200 uppercase tracking-[0.4em]">02. SKU Blueprint</h2>
              </div>
              <div className="space-y-7">
                <div className="space-y-2.5">
                  <label className="block text-[10px] text-zinc-400 uppercase font-black tracking-[0.2em]">
                    Item / Garment Type
                  </label>
                  <input
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-sm font-bold text-white focus:border-white focus:bg-zinc-950 outline-none transition-all placeholder:text-zinc-700 shadow-inner"
                    placeholder="e.g. Silk Wrap Dress, Linen Trousers"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="block text-[10px] text-zinc-400 uppercase font-black tracking-[0.2em]">
                    Style Notes (Optional)
                  </label>
                  <textarea
                    value={itemStyle}
                    onChange={(e) => setItemStyle(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-sm font-bold text-white focus:border-white focus:bg-zinc-950 outline-none transition-all placeholder:text-zinc-700 shadow-inner min-h-[90px]"
                    placeholder="Add any styling notes for this SKU"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] text-zinc-400 uppercase font-black tracking-[0.2em]">
                      Reference Materials
                    </label>
                    <div className="flex gap-4">
                      <button
                        onClick={() => openPicker("shopify", "item")}
                        className="text-green-500 hover:scale-110 transition-transform"
                      >
                        <i className="fa-brands fa-shopify text-xl"></i>
                      </button>
                      <button
                        onClick={() => openPicker("dropbox", "item")}
                        className="text-blue-500 hover:scale-110 transition-transform"
                      >
                        <i className="fa-brands fa-dropbox text-xl"></i>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3.5">
                    {pendingItemRefs.map((r) => (
                      <div
                        key={r.id}
                        className="aspect-square rounded-2xl border border-zinc-800 overflow-hidden relative group shadow-lg ring-1 ring-zinc-800"
                      >
                        <img src={r.previewUrl} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removePendingItemRef(r.id)}
                          className="absolute inset-0 bg-black/90 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300"
                        >
                          <i className="fa-solid fa-trash-can text-lg"></i>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => itemInputRef.current?.click()}
                      className="aspect-square rounded-2xl border-2 border-dashed border-zinc-800 flex items-center justify-center text-zinc-500 hover:bg-zinc-900 hover:text-white hover:border-zinc-500 transition-all duration-300 bg-zinc-900/20"
                    >
                      <i className="fa-solid fa-shirt text-2xl"></i>
                    </button>
                  </div>
                  <input
                    type="file"
                    ref={itemInputRef}
                    onChange={handleItemUpload}
                    className="hidden"
                    multiple
                    accept="image/*"
                  />
                </div>

                <button
                  onClick={saveItem}
                  className="w-full py-5 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] hover:bg-zinc-200 shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-4"
                >
                  <i className="fa-solid fa-bookmark"></i> SAVE SKU BLUEPRINT
                </button>
              </div>
            </section>
            <div className="pt-10 border-t border-zinc-900">
              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-zinc-400 uppercase font-black tracking-[0.2em]">
                    Studio Quality
                  </label>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                      size === "4K" ? "bg-white text-black" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {size === "4K" ? "MAX FIDELITY" : "FAST DRAFT"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {(["1K", "2K", "4K"] as ImageSize[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSize(s)}
                      className={`flex-1 py-3.5 rounded-xl text-[10px] font-black transition-all border ${
                        size === s
                          ? "bg-white border-white text-black shadow-xl scale-[1.02]"
                          : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !activeModelId || !savedItemType}
                className={`w-full py-7 rounded-[2rem] font-black text-xs uppercase tracking-[0.5em] flex items-center justify-center gap-5 transition-all shadow-[0_30px_60px_-15px_rgba(255,255,255,0.05)] ${
                  isGenerating
                    ? "bg-zinc-800 text-zinc-500 cursor-wait opacity-60"
                    : "bg-white text-black hover:bg-zinc-100 hover:scale-[1.02] active:scale-[0.98] active:bg-zinc-300"
                }`}
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin h-6 w-6 border-[3px] border-zinc-400 border-t-white rounded-full"></div>
                    SHOOT IN PROGRESS...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-bolt-lightning text-lg"></i> INITIATE STUDIO SESSION
                  </>
                )}
              </button>
              {error && (
                <div className="mt-8 p-6 bg-red-500/10 border border-red-500/20 rounded-2xl animate-in shake duration-500">
                  <p className="text-red-400 text-[11px] font-black text-center uppercase tracking-tighter leading-relaxed">
                    {error}
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-12 bg-[#0a0a0a] custom-scrollbar flex flex-col items-center">
          {panels.length === 0 && !isGenerating ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-12 select-none">
              <div className="relative">
                <div className="absolute inset-0 bg-white/10 blur-[120px] rounded-full scale-150 animate-pulse"></div>
                <i className="fa-solid fa-images text-[140px] text-zinc-800 relative shadow-2xl"></i>
              </div>
              <div className="space-y-6 max-w-lg">
                <h3 className="text-4xl font-bold text-zinc-200 uppercase tracking-[0.3em]">STUDIO READY</h3>
                <p className="text-zinc-500 text-xs uppercase font-black tracking-[0.6em] leading-loose">
                  Populate Model & SKU Registry to Begin Session
                </p>
                <div className="h-px w-20 bg-zinc-800 mx-auto"></div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-7xl mx-auto space-y-24 pb-64">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-20">
                {panels.map((p) => (
                  <div
                    key={p.panelNumber}
                    className="group relative bg-[#111] border border-zinc-800 rounded-[3.5rem] overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] transition-all hover:border-zinc-500 ring-1 ring-zinc-900"
                  >
                    <img
                      src={p.url}
                      className="w-full h-auto object-cover transition-transform duration-[2.5s] group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-12 bg-gradient-to-t from-black via-black/95 to-transparent translate-y-full group-hover:translate-y-0 transition-all duration-700 ease-[cubic-bezier(0.33,1,0.68,1)]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-white text-black rounded-2xl flex items-center justify-center font-black text-sm shadow-xl">
                            P{p.panelNumber}
                          </div>
                          <div>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white block">
                              ASSET READY
                            </span>
                            <span className="text-[9px] text-zinc-500 font-mono">{size} RAW PRO</span>
                          </div>
                        </div>
                        <a
                          href={p.url}
                          download={`gemini-panel-${savedItemType || "item"}-${p.panelNumber}.png`}
                          className="bg-white text-black px-10 py-4 rounded-full font-black text-[11px] uppercase tracking-widest hover:bg-zinc-200 hover:scale-105 transition-all shadow-2xl active:scale-95"
                        >
                          Download PNG
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
                {isGenerating &&
                  Array.from({ length: 4 - panels.length }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[4/3] bg-zinc-900/10 border-2 border-zinc-900 border-dashed rounded-[3.5rem] flex flex-col items-center justify-center animate-pulse"
                    >
                      <div className="h-14 w-14 border-[5px] border-zinc-800 border-t-zinc-300 rounded-full animate-spin mb-8"></div>
                      <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.5em]">
                        Rendering Frame {panels.length + i + 1}...
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>
      </div>
      {pickerModal.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/98 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="relative w-full max-w-6xl max-h-[85vh] bg-[#141414] border border-zinc-800 rounded-[4rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-12 border-b border-zinc-800 flex items-center justify-between bg-[#1a1a1a]">
              <div className="flex items-center gap-8">
                <div
                  className={`w-16 h-16 rounded-[2rem] flex items-center justify-center shadow-2xl ${
                    pickerModal.source === "shopify" ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400"
                  }`}
                >
                  {pickerModal.source === "shopify" ? (
                    <i className="fa-brands fa-shopify text-4xl"></i>
                  ) : (
                    <i className="fa-brands fa-dropbox text-4xl"></i>
                  )}
                </div>
                <div>
                  <h3 className="text-3xl font-bold uppercase tracking-widest text-white">Cloud Catalog Sync</h3>
                  <p className="text-[11px] text-zinc-400 font-black uppercase tracking-[0.2em] mt-1.5">
                    Importing from {pickerModal.source}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPickerModal({ active: false, target: "model", source: null })}
                className="w-14 h-14 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all transform hover:rotate-90 duration-300"
              >
                <i className="fa-solid fa-times text-2xl"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
              {isLoadingCatalog ? (
                <div className="h-96 flex flex-col items-center justify-center gap-8 text-zinc-400 font-black uppercase tracking-[0.5em] text-[13px]">
                  <div className="w-14 h-14 border-[5px] border-zinc-800 border-t-zinc-300 rounded-full animate-spin"></div>
                  Establishing Secure Handshake...
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-8">
                  {pickerModal.source === "shopify"
                    ? shopifyCatalog.map((p) => (
                        <button key={p.id} onClick={() => selectShopifyImage(p.imageUrl, p.title)} className="group space-y-4 text-left">
                          <div className="aspect-square bg-zinc-900 rounded-[2.5rem] overflow-hidden border border-zinc-800 group-hover:border-green-400 transition-all shadow-xl ring-1 ring-zinc-800">
                            <img src={p.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-1000" />
                          </div>
                          <p className="text-[10px] font-black uppercase text-zinc-400 truncate px-4 group-hover:text-white transition-colors">
                            {p.title}
                          </p>
                        </button>
                      ))
                    : dropboxCatalog.map((f) => (
                        <button key={f.id} onClick={() => selectDropboxImage(f)} className="group space-y-4 text-left">
                          <div className="aspect-square bg-zinc-900 rounded-[2.5rem] flex flex-col items-center justify-center border border-zinc-800 group-hover:border-blue-400 transition-all p-8 text-center shadow-xl ring-1 ring-zinc-800">
                            <i className="fa-solid fa-file-image text-5xl text-zinc-800 mb-4 group-hover:text-blue-900 transition-colors"></i>
                            <p className="text-[10px] font-black uppercase text-zinc-500 line-clamp-2 px-2 group-hover:text-zinc-200 transition-colors">
                              {f.title}
                            </p>
                          </div>
                        </button>
                      ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/99 backdrop-blur-3xl animate-in zoom-in-95 duration-500">
          <div className="relative w-full max-w-xl bg-[#141414] border border-zinc-800 rounded-[4rem] p-14 space-y-12 shadow-[0_50px_200px_rgba(0,0,0,0.9)]">
            <div className="text-center">
              <h3 className="text-4xl font-bold mb-3 text-white">Integrations</h3>
              <p className="text-[11px] text-zinc-500 font-black uppercase tracking-[0.5em]">API Handshake Settings</p>
            </div>
            <div className="space-y-10">
              <div className="space-y-5">
                <div className="flex items-center gap-4 text-green-400">
                  <i className="fa-brands fa-shopify text-3xl"></i>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">Shopify Store</span>
                </div>
                <input
                  placeholder="shop-name.myshopify.com"
                  value={config.shopifyStore || ""}
                  onChange={(e) => setConfig({ ...config, shopifyStore: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-xs font-mono text-white focus:border-white focus:bg-zinc-950 outline-none placeholder:text-zinc-700 transition-all"
                />
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  Uses connected store tokens from Settings. No token needed here.
                </p>
              </div>
              <div className="h-px bg-zinc-800/50"></div>
              <div className="space-y-5">
                <div className="flex items-center gap-4 text-blue-400">
                  <i className="fa-brands fa-dropbox text-3xl"></i>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">Dropbox Barcode</span>
                </div>
                <input
                  placeholder="C1234567 or 1234567"
                  value={config.dropboxBarcode || ""}
                  onChange={(e) => setConfig({ ...config, dropboxBarcode: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-xs font-mono text-white focus:border-white focus:bg-zinc-950 outline-none placeholder:text-zinc-700 transition-all"
                />
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  Dropbox search requires a barcode tied to your asset folder.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowConfigModal(false)}
              className="w-full bg-white text-black py-6 rounded-3xl font-black text-xs uppercase tracking-[0.5em] hover:bg-zinc-200 shadow-2xl transition-all active:scale-[0.97]"
            >
              SAVE CONNECTIONS
            </button>
          </div>
        </div>
      )}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1a1a1a;
          border-radius: 30px;
          border: 2px solid #0a0a0a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #333;
        }
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-8px);
          }
          75% {
            transform: translateX(8px);
          }
        }
        .shake {
          animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
      `}</style>
    </div>
  );
}
