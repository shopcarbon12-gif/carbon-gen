"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  FEMALE_PANEL_MAPPING_TEXT,
  FEMALE_POSE_LIBRARY,
  MALE_PANEL_MAPPING_TEXT,
  MALE_POSE_LIBRARY,
  getPoseLibraryForGender,
} from "@/lib/panelPoseLibraries";

const panels = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

const CATALOG_PAGE_SIZE = 10;
const SPLIT_TARGET_WIDTH = 900;
const SPLIT_TARGET_HEIGHT = 1200;
const FLAT_SPLIT_TARGET_WIDTH = 900;
const FLAT_SPLIT_TARGET_HEIGHT = 1200;
const PUSH_TRANSFER_STORAGE_KEY = "cg_push_transfer_v1";
const ALT_GENERATION_BATCH_SIZE = 3;
const PUSH_STAGING_BATCH_SIZE = 4;
const GENERATION_STAGES: Array<{ at: number; text: string; sub: string }> = [
  { at: 0, text: "Initializing model...", sub: "Loading components" },
  { at: 12, text: "Understanding prompt...", sub: "Extracting style and intent" },
  { at: 28, text: "Composing scene...", sub: "Layout and perspective" },
  { at: 45, text: "Diffusing pixels...", sub: "Turning noise into structure" },
  { at: 65, text: "Adding lighting...", sub: "Shadows and highlights" },
  { at: 80, text: "Enhancing details...", sub: "Textures and micro-contrast" },
  { at: 92, text: "Final render pass...", sub: "Polishing output" },
];

type ShopifyCatalogProduct = {
  id: string;
  title: string;
  handle: string;
  barcodes?: string[];
  images: Array<{ id: string; url: string; altText: string }>;
};

type PreviousModelUpload = {
  id: string;
  path: string;
  fileName: string;
  modelName: string;
  gender: "male" | "female" | "";
  uploadedAt: string | null;
  url: string | null;
  previewUrl: string | null;
};

type SelectedCatalogImage = {
  id: string;
  url: string;
  title: string;
  source: "shopify" | "dropbox" | "generated_flat" | "final_results_storage";
  uploadedUrl: string | null;
  uploading: boolean;
  uploadError: string | null;
};

type ItemFlatSplitImage = {
  id: string;
  side: "front" | "back";
  fileName: string;
  imageBase64: string;
};

type SplitCrop = {
  panel: number;
  side: "left" | "right";
  poseNumber: number;
  fileName: string;
  imageBase64: string;
  uploadedUrl?: string | null;
};

type FinalResultUpload = {
  id: string;
  path: string;
  fileName: string;
  uploadedAt: string | null;
  url: string | null;
  previewUrl: string | null;
};

type DropboxImageResult = {
  id: string;
  title: string;
  pathLower: string;
  temporaryLink: string;
};

type DropboxFolderResult = {
  folderPath: string;
  webUrl: string;
  images: DropboxImageResult[];
};

type PushQueueImage = {
  id: string;
  sourceImageId: string;
  mediaId: string | null;
  url: string;
  title: string;
  source: "shopify" | "generated_split" | "device_upload";
  altText: string;
  generatingAlt: boolean;
  deleting: boolean;
};

type PushVariant = {
  id: string;
  color: string;
  position: number;
  imageUrl: string | null;
  assignedPushImageId: string | null;
  variantCount: number;
};

type BarcodeDetectionLike = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectionLike[]>;
};

type BarcodeDetectorCtorLike = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const IMAGE_FILE_EXT_RE = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|tif|tiff|webp)$/i;

function isImageLikeFile(file: File) {
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return IMAGE_FILE_EXT_RE.test(file.name || "");
}

function mergeUniqueFiles(existing: File[], incoming: File[]) {
  const next = [...existing];
  const seen = new Set(
    existing.map((f) => `${f.name}::${f.size}::${f.lastModified}::${f.type}`)
  );
  for (const file of incoming) {
    const key = `${file.name}::${file.size}::${file.lastModified}::${file.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(file);
  }
  return next;
}

function mergeUniqueByNameAndSize(existing: File[], incoming: File[]) {
  const seen = new Set(existing.map((f) => `${f.name}::${f.size}`));
  const out = [...existing];
  for (const file of incoming) {
    const key = `${file.name}::${file.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

function openInputPicker(input: HTMLInputElement | null) {
  if (!input) return;
  const picker = input as HTMLInputElement & { showPicker?: () => void };
  if (typeof picker.showPicker === "function") {
    try {
      picker.showPicker();
      return;
    } catch {
      // Fallback to click when showPicker is blocked/unavailable.
    }
  }
  input.click();
}

function sanitizeBarcodeInput(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^c0-9]/g, "")
    .slice(0, 9);
}

function normalizePromptInstruction(value: unknown, maxLen = 1200) {
  return String(value || "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, maxLen);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image for clothing type scan."));
    reader.readAsDataURL(file);
  });
}

async function fileToDetectionDataUrl(file: File, maxSide = 768) {
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error("Failed to decode image."));
        node.src = objectUrl;
      });

      const longest = Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
      const scale = Math.min(1, maxSide / longest);
      const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      const jpeg = canvas.toDataURL("image/jpeg", 0.82);
      if (jpeg && jpeg.startsWith("data:image/")) return jpeg;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // Fallback to original file encoding.
  }
  return fileToDataUrl(file);
}

function normalizeDetectedItemType(value: unknown) {
  const text = String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.;:!?]+$/g, "");
  if (!text) return "";
  return text.length > 60 ? text.slice(0, 60).trim() : text;
}

function inferItemTypeFromText(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  if (/\btank\b/.test(text)) return "tank top";
  if (/\b(t[\s-]?shirt|tee)\b/.test(text)) return "t-shirt";
  if (/\bhoodie\b/.test(text)) return "hoodie";
  if (/\bsweatshirt\b/.test(text)) return "sweatshirt";
  if (/\bsweater\b/.test(text)) return "sweater";
  if (/\bjacket\b/.test(text)) return "jacket";
  if (/\bcoat\b/.test(text)) return "coat";
  if (/\bjeans?\b/.test(text)) return "jeans";
  if (/\b(cargo|jogger|trouser|pants?)\b/.test(text)) return "pants";
  if (/\bshorts?\b/.test(text)) return "shorts";
  if (/\bskirt\b/.test(text)) return "skirt";
  if (/\bdress\b/.test(text)) return "dress";
  if (/\bjumpsuit\b/.test(text)) return "jumpsuit";
  if (/\b(swim|trunk|bikini)\b/.test(text)) return "swimwear";
  if (/\bshoe|sneaker|boot\b/.test(text)) return "shoes";
  if (/\bbag\b/.test(text)) return "bag";
  if (/\b(accessor|belt|hat|cap|scarf)\b/.test(text)) return "accessories";
  return "";
}

function isValidBarcode(value: string) {
  const v = String(value || "").trim();
  return /^(?:c\d{6,8}|\d{7,9})$/.test(v);
}

function extractBarcodeFromText(value: string) {
  const raw = String(value || "").toLowerCase();
  if (!raw) return "";
  const match = raw.match(/\b(c\d{6,8}|\d{7,9})\b/);
  return match ? String(match[1] || "").trim() : "";
}

function canonicalPreviousUploadName(fileName: string, path: string) {
  const fallback = path.split("/").pop() || path;
  let v = String(fileName || fallback || "").trim().toLowerCase();
  v = v.split("?")[0].split("#")[0];
  v = v.split("/").pop() || v;
  v = v.replace(/^\d{10,}-/, "");
  v = v.replace(/\s+/g, "_");

  const candidatePatterns = [
    /^chatgpt_image_/,
    /^image_/,
    /^img_/,
    /^dalle_/,
    /^openai_/,
    /^victor_?\d+\./,
    /^\d+\.(png|jpe?g|webp|gif|avif|heic|heif|tiff?|bmp)$/,
    /^(beige|black|white|gray|grey|blue|red|green|brown|tan|cream|navy)_/,
  ];

  for (let i = 0; i < 3; i += 1) {
    const idx = v.indexOf("_");
    if (idx <= 0) break;
    const tail = v.slice(idx + 1);
    if (candidatePatterns.some((re) => re.test(tail))) {
      v = tail;
      continue;
    }
    break;
  }

  return v.trim();
}

function normalizeModelName(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatElapsedStopwatch(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export type StudioWorkspaceMode = "all" | "images" | "ops-seo";

type StudioWorkspaceProps = {
  mode?: StudioWorkspaceMode;
};

export default function StudioWorkspace({ mode = "all" }: StudioWorkspaceProps) {
  const [shop, setShop] = useState("");
  const [handle, setHandle] = useState("");
  const [productId, setProductId] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [altText, setAltText] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelGender, setModelGender] = useState("");
  const [modelFiles, setModelFiles] = useState<File[]>([]);
  const [itemFiles, setItemFiles] = useState<File[]>([]);
  const [itemType, setItemType] = useState("");
  const [, setItemTypeDetecting] = useState(false);
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemBarcodeSaved, setItemBarcodeSaved] = useState("");
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeScannerBusy, setBarcodeScannerBusy] = useState(false);
  const [barcodeScannerError, setBarcodeScannerError] = useState<string | null>(null);
  const [dropboxSearching, setDropboxSearching] = useState(false);
  const [dropboxResults, setDropboxResults] = useState<DropboxImageResult[]>([]);
  const [dropboxFolderResults, setDropboxFolderResults] = useState<DropboxFolderResult[]>([]);
  const [dropboxSearched, setDropboxSearched] = useState(false);
  const [dropboxListVisible, setDropboxListVisible] = useState(true);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ShopifyCatalogProduct[]>([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogResultsHidden, setCatalogResultsHidden] = useState(false);
  const [catalogQueryForResults, setCatalogQueryForResults] = useState("");
  const [catalogHasNextPage, setCatalogHasNextPage] = useState(false);
  const [catalogAfterCursorsByPage, setCatalogAfterCursorsByPage] = useState<Array<string | null>>([
    null,
  ]);
  const [pushSearchQuery, setPushSearchQuery] = useState("");
  const [pushCatalogLoading, setPushCatalogLoading] = useState(false);
  const [pushCatalogSearched, setPushCatalogSearched] = useState(false);
  const [pushCatalogProducts, setPushCatalogProducts] = useState<ShopifyCatalogProduct[]>([]);
  const [pushProductId, setPushProductId] = useState("");
  const [pushProductHandle, setPushProductHandle] = useState("");
  const [pushImages, setPushImages] = useState<PushQueueImage[]>([]);
  const [pushingImages, setPushingImages] = useState(false);
  const [draggingPushImageId, setDraggingPushImageId] = useState<string | null>(null);
  const [pushVariants, setPushVariants] = useState<PushVariant[]>([]);
  const [draggingVariantId, setDraggingVariantId] = useState<string | null>(null);
  const [selectedCatalogImages, setSelectedCatalogImages] = useState<SelectedCatalogImage[]>([]);
  const [itemUploadCount, setItemUploadCount] = useState<number | null>(null);
  const [modelUploadTotal, setModelUploadTotal] = useState(0);
  const [modelUploadDone, setModelUploadDone] = useState(0);
  const [modelUploading, setModelUploading] = useState(false);
  const [modelUploadPending, setModelUploadPending] = useState(0);
  const [modelDraftId, setModelDraftId] = useState<string | null>(null);
  const [modelUploads, setModelUploads] = useState<
    Array<{ name: string; url: string; path: string }>
  >([]);
  const [modelPreviewItems, setModelPreviewItems] = useState<
    Array<{
      id: string;
      name: string;
      localUrl: string;
      uploadedUrl?: string;
      path?: string;
    }>
  >([]);
  const modelPreviewRef = useRef<
    Array<{
      id: string;
      name: string;
      localUrl: string;
      uploadedUrl?: string;
      path?: string;
    }>
  >([]);
  const selectedCatalogImagesRef = useRef<SelectedCatalogImage[]>([]);
  const modelUploadingRef = useRef(false);
  const modelUploadPendingRef = useRef(0);
  const [models, setModels] = useState<
    Array<{
      model_id: string;
      name: string;
      gender: string;
      ref_image_urls: string[];
      created_at: string;
    }>
  >([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [itemReferenceUrls, setItemReferenceUrls] = useState<string[]>([]);
  const [itemStyleInstructions, setItemStyleInstructions] = useState("");
  const [regenerationComments, setRegenerationComments] = useState("");
  const [itemFlatCompositeBase64, setItemFlatCompositeBase64] = useState<string | null>(null);
  const [itemFlatSplitImages, setItemFlatSplitImages] = useState<ItemFlatSplitImage[]>([]);
  const [addingFlatSplitIds, setAddingFlatSplitIds] = useState<string[]>([]);
  const [itemFlatGenerating, setItemFlatGenerating] = useState(false);
  const modelPickerRef = useRef<HTMLInputElement | null>(null);
  const modelFolderRef = useRef<HTMLInputElement | null>(null);
  const itemPickerRef = useRef<HTMLInputElement | null>(null);
  const itemFolderRef = useRef<HTMLInputElement | null>(null);
  const itemCameraRef = useRef<HTMLInputElement | null>(null);
  const barcodeScannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeScannerRafRef = useRef<number | null>(null);
  const barcodeScannerStreamRef = useRef<MediaStream | null>(null);
  const finalResultPickerRef = useRef<HTMLInputElement | null>(null);
  const finalResultFolderRef = useRef<HTMLInputElement | null>(null);
  const pushPickerRef = useRef<HTMLInputElement | null>(null);
  const pushFolderRef = useRef<HTMLInputElement | null>(null);
  const [itemPreviews, setItemPreviews] = useState<Array<{ name: string; url: string }>>(
    []
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPanels, setSelectedPanels] = useState<number[]>([1]);
  const [panelGenerating, setPanelGenerating] = useState(false);
  const [panelsInFlight, setPanelsInFlight] = useState<number[]>([]);
  const [generatedPanels, setGeneratedPanels] = useState<Record<number, string>>({});
  const [generatedPanelHistoryByModel, setGeneratedPanelHistoryByModel] = useState<
    Record<string, number[]>
  >({});
  const [panelRequestHistoryByLock, setPanelRequestHistoryByLock] = useState<
    Record<string, number[]>
  >({});
  const [approvedPanels, setApprovedPanels] = useState<number[]>([]);
  const [splitCrops, setSplitCrops] = useState<SplitCrop[]>([]);
  const [selectedSplitKeys, setSelectedSplitKeys] = useState<string[]>([]);
  const [splitSendingToPush, setSplitSendingToPush] = useState(false);
  const [pushUploading, setPushUploading] = useState(false);
  const [finalResultFiles, setFinalResultFiles] = useState<File[]>([]);
  const [finalResultPreviews, setFinalResultPreviews] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [savingFinalResults, setSavingFinalResults] = useState(false);
  const [finalResultsVisible, setFinalResultsVisible] = useState(false);
  const [finalResultsLoading, setFinalResultsLoading] = useState(false);
  const [finalResultUploads, setFinalResultUploads] = useState<FinalResultUpload[]>([]);
  const [selectedFinalResultUploadIds, setSelectedFinalResultUploadIds] = useState<string[]>([]);
  const [emptyingFinalResults, setEmptyingFinalResults] = useState(false);
  const [previewModal, setPreviewModal] = useState<{
    imageBase64: string;
    title: string;
  } | null>(null);
  const [generateOpenAiResponse, setGenerateOpenAiResponse] = useState<string | null>(null);
  const [dialogMessages, setDialogMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [dialogInput, setDialogInput] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);
  const [chatNeedsAttention, setChatNeedsAttention] = useState(false);
  const [generationElapsedMs, setGenerationElapsedMs] = useState(0);
  const generationStartRef = useRef<number | null>(null);
  const generationRafRef = useRef<number | null>(null);
  const [progressLogoSrc, setProgressLogoSrc] = useState("/logo.svg");
  const [chatExpanded, setChatExpanded] = useState(false);
  const inlineChatLogRef = useRef<HTMLDivElement | null>(null);
  const sideChatLogRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const statusBarRef = useRef<HTMLElement | null>(null);
  const [statusBarHeight, setStatusBarHeight] = useState(0);
  const [previousModelUploads, setPreviousModelUploads] = useState<PreviousModelUpload[]>([]);
  const [previousModelUploadsLoading, setPreviousModelUploadsLoading] = useState(false);
  const [previousSort, setPreviousSort] = useState<"date_asc" | "date_desc" | "name_az">(
    "date_asc"
  );
  const [previousGenderFilter, setPreviousGenderFilter] = useState<"all" | "female" | "male">(
    "all"
  );
  const [brokenPreviousUploadIds, setBrokenPreviousUploadIds] = useState<string[]>([]);
  const [previousUploadsVisible, setPreviousUploadsVisible] = useState(false);
  const [emptyingBucket, setEmptyingBucket] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [installedAt, setInstalledAt] = useState<string | null>(null);
  const [dropboxConnected, setDropboxConnected] = useState<boolean | null>(null);
  const [dropboxEmail, setDropboxEmail] = useState<string | null>(null);
  const [pickerMaskVisible, setPickerMaskVisible] = useState(false);
  const pickerMaskTimerRef = useRef<number | null>(null);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [modelRegistryCollapsed, setModelRegistryCollapsed] = useState(true);
  const modelRegistryDefaultAppliedRef = useRef(false);
  const itemTypeDetectionSourceRef = useRef("");
  const itemTypeDetectionRequestRef = useRef(0);

  const lowestSelectedPanel = useMemo(() => {
    const sorted = [...selectedPanels].sort((a, b) => a - b);
    return sorted[0] || 1;
  }, [selectedPanels]);

  const resolvedItemType = useMemo(() => itemType.trim(), [itemType]);

  const detectItemTypeFromSource = useCallback(
    async (input: { sourceSignature: string; file?: File; imageUrl?: string; hintText?: string }) => {
      const sourceSignature = String(input.sourceSignature || "").trim();
      if (!sourceSignature) return;
      if (itemTypeDetectionSourceRef.current === sourceSignature) return;
      itemTypeDetectionSourceRef.current = sourceSignature;

      const fallbackType = inferItemTypeFromText(input.hintText);
      const requestId = itemTypeDetectionRequestRef.current + 1;
      itemTypeDetectionRequestRef.current = requestId;
      setItemTypeDetecting(true);

      try {
        let payload: Record<string, string> | null = null;
        if (input.file) {
          const imageDataUrl = await fileToDetectionDataUrl(input.file);
          if (imageDataUrl) payload = { imageDataUrl };
        } else if (input.imageUrl) {
          payload = { imageUrl: input.imageUrl };
        }

        if (!payload) {
          if (fallbackType && itemTypeDetectionRequestRef.current === requestId) {
            setItemType(fallbackType);
          }
          return;
        }

        const resp = await fetch("/api/openai/item-type", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await parseJsonResponse(resp, "/api/openai/item-type");
        if (!resp.ok) {
          throw new Error(json?.error || "Failed to detect clothing type.");
        }
        const detected = normalizeDetectedItemType(json?.itemType);
        if (itemTypeDetectionRequestRef.current !== requestId) return;
        if (detected) {
          setItemType(detected);
          return;
        }
        if (fallbackType) setItemType(fallbackType);
      } catch {
        if (fallbackType && itemTypeDetectionRequestRef.current === requestId) {
          setItemType(fallbackType);
        }
      } finally {
        if (itemTypeDetectionRequestRef.current === requestId) {
          setItemTypeDetecting(false);
        }
      }
    },
    []
  );

  const hidePickerMask = useCallback((delayMs = 180) => {
    if (typeof window === "undefined") return;
    if (pickerMaskTimerRef.current !== null) {
      window.clearTimeout(pickerMaskTimerRef.current);
      pickerMaskTimerRef.current = null;
    }
    pickerMaskTimerRef.current = window.setTimeout(() => {
      setPickerMaskVisible(false);
      pickerMaskTimerRef.current = null;
    }, delayMs);
  }, []);

  const openInputPickerWithMask = useCallback(
    (input: HTMLInputElement | null) => {
      setPickerMaskVisible(true);
      openInputPicker(input);
      hidePickerMask(1200);
    },
    [hidePickerMask]
  );

  const stopBarcodeScannerSession = useCallback(() => {
    if (typeof window !== "undefined" && barcodeScannerRafRef.current !== null) {
      window.cancelAnimationFrame(barcodeScannerRafRef.current);
      barcodeScannerRafRef.current = null;
    }
    const stream = barcodeScannerStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors during cleanup.
        }
      });
      barcodeScannerStreamRef.current = null;
    }
    const video = barcodeScannerVideoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!barcodeScannerOpen) {
      stopBarcodeScannerSession();
      return;
    }
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      const message = "Camera scanning is not available in this environment.";
      setBarcodeScannerError(message);
      setError(message);
      setBarcodeScannerOpen(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = "Camera access is not available in this browser.";
      setBarcodeScannerError(message);
      setError(message);
      setBarcodeScannerOpen(false);
      return;
    }
    const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtorLike })
      .BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      const message = "Live barcode scan is not supported on this browser. Use Chrome/Edge mobile.";
      setBarcodeScannerError(message);
      setError(message);
      setBarcodeScannerOpen(false);
      return;
    }

    let cancelled = false;
    let detectorBusy = false;
    const detector = new BarcodeDetectorCtor({
      formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e"],
    });

    const scanFrame = async () => {
      if (cancelled) return;
      const video = barcodeScannerVideoRef.current;
      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !detectorBusy
      ) {
        detectorBusy = true;
        try {
          const detections = await detector.detect(video);
          const raw = String(
            detections.find((row) => String(row?.rawValue || "").trim())?.rawValue || ""
          ).trim();
          if (raw) {
            const normalized = sanitizeBarcodeInput(raw);
            if (normalized) {
              setItemBarcode(normalized);
              setStatus(`Scanned barcode: ${normalized}`);
              setError(null);
              setBarcodeScannerError(null);
              setBarcodeScannerOpen(false);
              return;
            }
          }
        } catch {
          // Ignore per-frame detect errors while the stream is warming up.
        } finally {
          detectorBusy = false;
        }
      }
      barcodeScannerRafRef.current = window.requestAnimationFrame(() => {
        void scanFrame();
      });
    };

    const start = async () => {
      setBarcodeScannerBusy(true);
      setBarcodeScannerError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        barcodeScannerStreamRef.current = stream;
        const video = barcodeScannerVideoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        barcodeScannerRafRef.current = window.requestAnimationFrame(() => {
          void scanFrame();
        });
      } catch (e: any) {
        const message =
          e?.message
            ? `Unable to start camera scanner: ${e.message}`
            : "Unable to start camera scanner.";
        setBarcodeScannerError(message);
        setError(message);
        setBarcodeScannerOpen(false);
      } finally {
        if (!cancelled) setBarcodeScannerBusy(false);
      }
    };

    void start();
    return () => {
      cancelled = true;
      setBarcodeScannerBusy(false);
      stopBarcodeScannerSession();
    };
  }, [barcodeScannerOpen, stopBarcodeScannerSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qpShop = params.get("shop") || "";
    const stored = window.localStorage.getItem("shopify_shop") || "";
    const next = qpShop && qpShop.includes(".myshopify.com") ? qpShop : stored;
    if (next && next !== shop) {
      setShop(next);
      return;
    }

    let cancelled = false;
    fetch("/api/shopify/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const inferredShop = String(json?.shop || "").trim().toLowerCase();
        if (inferredShop && inferredShop.includes(".myshopify.com")) {
          setShop((prev) => prev || inferredShop);
          window.localStorage.setItem("shopify_shop", inferredShop);
        }
        if (typeof json?.connected === "boolean") {
          setConnected(Boolean(json.connected));
          setInstalledAt(json?.connected ? json?.installedAt || null : null);
        }
      })
      .catch(() => {
        // Ignore startup status probe errors; normal shop-specific checks still run.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dropbox/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (typeof json?.connected === "boolean") {
          setDropboxConnected(Boolean(json.connected));
          setDropboxEmail(json?.connected ? String(json?.email || "") || null : null);
        } else {
          setDropboxConnected(false);
          setDropboxEmail(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDropboxConnected(false);
        setDropboxEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = shop.trim();
    if (value) {
      window.localStorage.setItem("shopify_shop", value);
    }
  }, [shop]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Refresh should start with clean working inputs. Model registry remains server-backed.
    window.localStorage.removeItem("item_type_option");
    window.localStorage.removeItem("item_type_custom");
    window.localStorage.removeItem("item_type");
    window.localStorage.removeItem("item_barcode_draft");
    window.localStorage.removeItem("item_barcode_saved");
  }, []);

  useEffect(() => {
    const saved = itemBarcodeSaved.trim();
    if (!saved || !isValidBarcode(saved)) return;
    setPushSearchQuery((prev) => (prev.trim() ? prev : saved));
  }, [itemBarcodeSaved]);

  useEffect(() => {
    if (!pushProductId.trim()) {
      setPushVariants([]);
      return;
    }
  }, [pushProductId]);

  useEffect(() => {
    setGeneratedPanels({});
    setApprovedPanels([]);
    setSplitCrops([]);
    setSelectedSplitKeys([]);
    setPanelsInFlight([]);
    setGenerateOpenAiResponse(null);
  }, [selectedModelId]);

  useEffect(() => {
    if (!splitCrops.length) {
      setSelectedSplitKeys([]);
      return;
    }
    setSelectedSplitKeys(splitCrops.map((crop) => `${crop.panel}:${crop.side}`));
  }, [splitCrops]);

  useEffect(() => {
    if (!finalResultUploads.length) {
      setSelectedFinalResultUploadIds([]);
      return;
    }
    setSelectedFinalResultUploadIds((prev) =>
      prev.filter((id) => finalResultUploads.some((file) => file.id === id))
    );
  }, [finalResultUploads]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(PUSH_TRANSFER_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as {
        barcode?: unknown;
        images?: unknown;
      };
      const transferred = Array.isArray(parsed?.images) ? parsed.images : [];
      const rows: PushQueueImage[] = transferred.reduce((acc: PushQueueImage[], row: any, idx: number) => {
        const url = String(row?.url || "").trim();
        if (!url) return acc;
        acc.push({
          id: String(row?.id || `transfer:${idx}:${crypto.randomUUID()}`),
          sourceImageId: String(row?.sourceImageId || `transfer:${idx}`),
          mediaId: null,
          url,
          title: String(row?.title || `Transferred image ${idx + 1}`),
          source: "device_upload",
          altText: String(row?.altText || ""),
          generatingAlt: false,
          deleting: false,
        });
        return acc;
      }, []);

      if (rows.length) {
        setPushImages((prev) => (prev.length ? prev : rows));
        if (mode === "ops-seo") {
          setStatus(`Loaded ${rows.length} transferred image(s) for Shopify Push.`);
        }
      }

      const transferredBarcode = sanitizeBarcodeInput(String(parsed?.barcode || "")).trim();
      if (transferredBarcode && isValidBarcode(transferredBarcode)) {
        setItemBarcode((prev) => (prev.trim() ? prev : transferredBarcode));
        setItemBarcodeSaved((prev) => (prev.trim() ? prev : transferredBarcode));
        setPushSearchQuery((prev) => (prev.trim() ? prev : transferredBarcode));
      }
    } catch {
      // Ignore malformed transfer payloads.
    } finally {
      window.localStorage.removeItem(PUSH_TRANSFER_STORAGE_KEY);
    }
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isGenerating = panelGenerating || panelsInFlight.length > 0;
    if (!isGenerating) {
      if (generationRafRef.current !== null) {
        window.cancelAnimationFrame(generationRafRef.current);
        generationRafRef.current = null;
      }
      generationStartRef.current = null;
      return;
    }

    if (generationStartRef.current === null) {
      generationStartRef.current = performance.now();
      setGenerationElapsedMs(0);
    }

    const tick = (now: number) => {
      const start = generationStartRef.current ?? now;
      setGenerationElapsedMs(now - start);
      generationRafRef.current = window.requestAnimationFrame(tick);
    };

    generationRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (generationRafRef.current !== null) {
        window.cancelAnimationFrame(generationRafRef.current);
        generationRafRef.current = null;
      }
    };
  }, [panelGenerating, panelsInFlight.length]);

  function refreshModels() {
    fetch("/api/models/list", { cache: "no-store" })
      .then(async (r) => {
        let json: any = null;
        try {
          json = await r.json();
        } catch {
          json = null;
        }
        if (!r.ok) {
          throw new Error(json?.error || "Failed to load models");
        }
        return json;
      })
      .then((json) => {
        const nextModels = Array.isArray(json?.models) ? json.models : [];
        setModels(nextModels);

        // Default behavior:
        // - If there are registered models, start collapsed.
        // - If there are no models, keep it open.
        // Apply auto-collapse once, but always force open on empty.
        if (nextModels.length === 0) {
          setModelRegistryCollapsed(false);
          return;
        }
        if (!modelRegistryDefaultAppliedRef.current) {
          setModelRegistryCollapsed(true);
          modelRegistryDefaultAppliedRef.current = true;
        }
      })
      .catch((e: any) => {
        setError(e?.message || "Failed to load models");
        if (!modelRegistryDefaultAppliedRef.current) {
          setModelRegistryCollapsed(false);
          modelRegistryDefaultAppliedRef.current = true;
        }
      });
  }

  useEffect(() => {
    refreshModels();
    const onFocus = () => refreshModels();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(refreshModels, 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const value = shop.trim();
    if (!value) {
      setConnected(null);
      setInstalledAt(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/shopify/status?shop=${encodeURIComponent(value)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.connected) {
          setConnected(true);
          setInstalledAt(json?.installedAt || null);
        } else {
          setConnected(false);
          setInstalledAt(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setConnected(false);
        setInstalledAt(null);
      });

    return () => {
      cancelled = true;
    };
  }, [shop]);

  useEffect(() => {
    setWorkspaceHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFocus = () => hidePickerMask(180);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (pickerMaskTimerRef.current !== null) {
        window.clearTimeout(pickerMaskTimerRef.current);
        pickerMaskTimerRef.current = null;
      }
    };
  }, [hidePickerMask]);

  useEffect(() => {
    if (modelFolderRef.current) {
      modelFolderRef.current.webkitdirectory = true;
    }
    if (itemFolderRef.current) {
      itemFolderRef.current.webkitdirectory = true;
    }
    if (pushFolderRef.current) {
      pushFolderRef.current.webkitdirectory = true;
    }
  }, []);

  useEffect(() => {
    modelPreviewRef.current = modelPreviewItems;
  }, [modelPreviewItems]);

  useEffect(() => {
    selectedCatalogImagesRef.current = selectedCatalogImages;
  }, [selectedCatalogImages]);

  useEffect(() => {
    modelUploadingRef.current = modelUploading;
  }, [modelUploading]);

  useEffect(() => {
    modelUploadPendingRef.current = modelUploadPending;
    setModelUploading(modelUploadPending > 0);
  }, [modelUploadPending]);

  function getUploadedModelUrls() {
    return modelPreviewRef.current
      .map((item) => item.uploadedUrl)
      .filter((url): url is string => Boolean(url));
  }

  async function waitForModelUploads() {
    const start = Date.now();
    return new Promise<void>((resolve, reject) => {
      const timer = setInterval(() => {
        if (!modelUploadPendingRef.current) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > 120000) {
          clearInterval(timer);
          reject(new Error("Uploads are taking too long. Please try again."));
        }
      }, 300);
    });
  }

  async function waitForCatalogImports() {
    const start = Date.now();
    return new Promise<void>((resolve, reject) => {
      const timer = setInterval(() => {
        const hasPending = selectedCatalogImagesRef.current.some((img) => img.uploading);
        if (!hasPending) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > 120000) {
          clearInterval(timer);
          reject(new Error("Catalog image import is taking too long. Please try again."));
        }
      }, 300);
    });
  }

  function shortErrorDetails(value: unknown, maxLen = 220) {
    const text =
      typeof value === "string"
        ? value.trim()
        : value
          ? JSON.stringify(value)
          : "";
    if (!text) return "";
    return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
  }

  function isModerationBlockedErrorMessage(value: unknown) {
    const text = String(value || "");
    return (
      /blocked by safety moderation/i.test(text) ||
      /moderation[_\s-]*blocked/i.test(text) ||
      /safety_violations=\[sexual\]/i.test(text)
    );
  }

  function formatGenerateDebugPayload(json: any, panelNumber: number) {
    const source = json?.openaiRaw ?? json?.error ?? json;
    const text = typeof source === "string" ? source.trim() : JSON.stringify(source, null, 2);
    if (!text) return `Panel ${panelNumber}: generation failed`;
    const compact = text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
    return `Panel ${panelNumber}:\n${compact}`;
  }

  async function pullProduct() {
    setError(null);
    setStatus("Pulling product...");
    try {
      const resp = await fetch("/api/shopify/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop.trim(),
          handle: handle.trim() || null,
          productId: productId.trim() || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        const details =
          typeof json?.details === "string"
            ? json.details
            : json?.details
              ? JSON.stringify(json.details)
              : "";
        throw new Error(`${json.error || "Pull failed"}${details ? `: ${details}` : ""}`);
      }
      setStatus(`Pulled: ${json.product?.title || "OK"}`);
    } catch (e: any) {
      setError(e?.message || "Pull failed");
      setStatus(null);
    }
  }

  async function parseJsonResponse(resp: Response, endpoint?: string) {
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
      snippet
        ? `Unexpected response${where}: ${snippet}`
        : `Unexpected non-JSON response${where}`
    );
  }

  async function fetchJsonWithRetry(
    endpoint: string,
    init: RequestInit,
    retries = 1
  ): Promise<{ resp: Response; json: any }> {
    let attempt = 0;
    let lastError: any = null;
    while (attempt <= retries) {
      try {
        const resp = await fetch(endpoint, init);
        const json = await parseJsonResponse(resp, endpoint);
        return { resp, json };
      } catch (e: any) {
        lastError = e;
        const msg = String(e?.message || "");
        const isNetwork =
          /failed to fetch/i.test(msg) ||
          /networkerror/i.test(msg) ||
          /network request failed/i.test(msg);
        if (!isNetwork || attempt >= retries) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      attempt += 1;
    }
    const suffix =
      endpoint === "/api/generate"
        ? "Network issue while calling generation API. Check internet/VPN and retry."
        : "Network request failed.";
    throw new Error(`${lastError?.message || "Request failed"} ${suffix}`.trim());
  }

  async function pushSeo() {
    setError(null);
    setStatus("Pushing SEO...");
    try {
      const resp = await fetch("/api/shopify/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop.trim(),
          productId: productId.trim(),
          seoTitle: seoTitle.trim(),
          seoDescription: seoDescription.trim(),
          altText: altText.trim(),
        }),
      });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) throw new Error(json.error || "SEO push failed");
      setStatus("SEO updated.");
    } catch (e: any) {
      setError(e?.message || "SEO push failed");
      setStatus(null);
    }
  }

  async function createModel() {
    setError(null);
    setStatus("Uploading model...");
    try {
      const cleanedModelName = modelName.trim();
      if (!cleanedModelName) {
        throw new Error("Please enter a model name.");
      }
      const normalizedModelName = normalizeModelName(cleanedModelName);
      const duplicateNameExists = models.some(
        (m) => normalizeModelName(String(m.name || "")) === normalizedModelName
      );
      if (duplicateNameExists) {
        throw new Error("A model with this name already exists. Please choose a different name.");
      }
      if (modelGender !== "male" && modelGender !== "female") {
        throw new Error("Please select a model gender.");
      }
      const totalCount = modelPreviewRef.current.length || modelFiles.length;

      if (!modelFiles.length && !modelUploads.length) {
        throw new Error("Please add at least 3 reference images.");
      }
      if (totalCount < 3 && modelUploads.length < 3) {
        throw new Error("At least 3 model reference images are required.");
      }
      if (modelUploadingRef.current) {
        setStatus("Finishing uploads before saving...");
        await waitForModelUploads();
      }

      const finalUrls = getUploadedModelUrls();
      if (finalUrls.length < 3) {
        throw new Error("At least 3 model reference images are required.");
      }

      const resp = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanedModelName,
          gender: modelGender,
          urls: finalUrls,
        }),
      });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to save model.");
      }

      setStatus(`Model created: ${cleanedModelName || "OK"}`);
      setModelName("");
      setModelGender("");
      setModelFiles([]);
      modelPreviewItems.forEach((item) => URL.revokeObjectURL(item.localUrl));
      setModelUploads([]);
      setModelPreviewItems([]);
      setModelDraftId(null);
      refreshModels();
    } catch (e: any) {
      setError(e?.message || "Model upload failed");
      setStatus(null);
    } finally {
      setModelUploading(false);
    }
  }

  async function persistItemReferences(options?: { silentSuccess?: boolean }) {
    const silentSuccess = Boolean(options?.silentSuccess);
    if (!itemType.trim()) {
      throw new Error("Please enter clothing type.");
    }
    const activeBarcode = itemBarcodeSaved.trim();
    if (!activeBarcode) {
      throw new Error("Please save item barcode in section 0.5.");
    }
    if (!isValidBarcode(activeBarcode)) {
      throw new Error("Barcode must be 7-9 chars: digits only, or C + 6-8 digits.");
    }

    if (selectedCatalogImagesRef.current.some((img) => img.uploading)) {
      setStatus("Finishing catalog image imports...");
      await waitForCatalogImports();
    }

    const files = itemFiles || [];
    const shopifyUrls = selectedCatalogImagesRef.current
      .map((img) => (img.uploadedUrl ? img.uploadedUrl : ""))
      .filter(Boolean);
    if (!files.length && !shopifyUrls.length && !itemReferenceUrls.length) {
      throw new Error("Please add item references from device, Shopify catalog, or both.");
    }

    let uploadedUrls: string[] = [];
    if (files.length) {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));

      const resp = await fetch("/api/items", {
        method: "POST",
        body: form,
      });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) throw new Error(json.error || "Item upload failed");
      uploadedUrls = Array.isArray(json.urls) ? json.urls : [];
    }

    const merged = Array.from(new Set([...itemReferenceUrls, ...uploadedUrls, ...shopifyUrls]));
    const effectiveItemType = resolvedItemType;

    setItemReferenceUrls(merged);
    setItemUploadCount(merged.length);
    setItemFiles([]);

    if (!silentSuccess) {
      setStatus(
        `Saved item barcode "${activeBarcode}" with type "${effectiveItemType}" and ${merged.length} item reference image${
          merged.length === 1 ? "" : "s"
        } (${uploadedUrls.length} device + ${shopifyUrls.length} Shopify).`
      );
    }

    return { merged, effectiveItemType };
  }

  async function uploadItems() {
    setError(null);
    setStatus("Uploading item references...");
    try {
      await persistItemReferences();
    } catch (e: any) {
      setError(e?.message || "Item upload failed");
      setStatus(null);
    }
  }

  async function generateFlatFrontBackFromItemRefs() {
    setError(null);
    setItemFlatGenerating(true);
    setItemFlatSplitImages([]);
    setAddingFlatSplitIds([]);
    try {
      let effectiveItemRefs = itemReferenceUrls;
      let effectiveItemType = resolvedItemType;

      const hasPendingItemInputs =
        Boolean(itemFiles.length) || Boolean(selectedCatalogImages.length);
      if (!effectiveItemRefs.length || hasPendingItemInputs) {
        setStatus("Saving item references before flat generation...");
        const saved = await persistItemReferences({ silentSuccess: true });
        effectiveItemRefs = saved.merged;
        effectiveItemType = saved.effectiveItemType || effectiveItemType;
      }

      if (!effectiveItemRefs.length) {
        throw new Error(
          "Please add item references from device/cloud/catalog before generating front and back."
        );
      }

      setStatus("Generating flat front/back item image...");
      const { resp, json } = await fetchJsonWithRetry(
        "/api/openai/item-flat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            itemRefs: effectiveItemRefs,
            itemType: effectiveItemType,
          }),
        },
        1
      );

      if (!resp.ok) {
        const details = shortErrorDetails(json?.details);
        const baseMsg = json?.error || "Flat front/back generation failed";
        throw new Error(details ? `${baseMsg}: ${details}` : baseMsg);
      }

      const b64 = typeof json?.imageBase64 === "string" ? json.imageBase64 : "";
      if (!b64) {
        throw new Error("No front/back image returned from OpenAI.");
      }

      setItemFlatCompositeBase64(b64);
      const splitImages = await splitFlatFrontBackToThreeByFour(b64, itemBarcodeSaved.trim());
      setItemFlatSplitImages(splitImages);
      const refCount =
        Number(json?.referencesUsed) > 0 ? Number(json.referencesUsed) : effectiveItemRefs.length;
      setStatus(
        `Flat front/back generated and split to 3:4 (front + back) from ${refCount} item reference image(s).`
      );
    } catch (e: any) {
      setError(e?.message || "Flat front/back generation failed.");
      setStatus(null);
    } finally {
      setItemFlatGenerating(false);
    }
  }

  async function addFlatSplitToSelectedItems(crop: ItemFlatSplitImage, options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent);
    const existing = selectedCatalogImages.find((img) => img.id === crop.id);
    if (existing?.uploadedUrl) {
      if (!silent) setStatus(`${crop.side === "front" ? "Front" : "Back"} 3:4 flat is already in selected items.`);
      return;
    }
    if (addingFlatSplitIds.includes(crop.id)) return;

    const previewUrl = `data:image/png;base64,${crop.imageBase64}`;
    setAddingFlatSplitIds((prev) => [...prev, crop.id]);
    setError(null);
    setSelectedCatalogImages((prev) => {
      const nextRow: SelectedCatalogImage = {
        id: crop.id,
        url: previewUrl,
        title: crop.fileName,
        source: "generated_flat",
        uploadedUrl: existing?.uploadedUrl || null,
        uploading: true,
        uploadError: null,
      };
      return [...prev.filter((img) => img.id !== crop.id), nextRow];
    });

    try {
      const file = base64ToFile(crop.imageBase64, crop.fileName);
      const urls = await uploadFilesToItemsBucket([file], "items/generated-flat");
      const uploaded = String(urls[0] || "").trim();
      if (!uploaded) throw new Error("Generated flat split upload returned no URL.");

      setSelectedCatalogImages((prev) =>
        prev.map((img) =>
          img.id === crop.id
            ? { ...img, uploadedUrl: uploaded, uploading: false, uploadError: null }
            : img
        )
      );
      setItemReferenceUrls((prev) => Array.from(new Set([...prev, uploaded])));
      setItemUploadCount((prev) => (prev || 0) + 1);
      if (!silent) {
        setStatus(`Added ${crop.side === "front" ? "front" : "back"} 3:4 flat image to selected items.`);
      }
    } catch (e: any) {
      const message = e?.message || "Failed to add generated flat split image.";
      setSelectedCatalogImages((prev) =>
        prev.map((img) =>
          img.id === crop.id
            ? { ...img, uploading: false, uploadError: message }
            : img
        )
      );
      setError(message);
    } finally {
      setAddingFlatSplitIds((prev) => prev.filter((id) => id !== crop.id));
    }
  }

  async function addAllFlatSplitsToSelectedItems() {
    const pending = itemFlatSplitImages.filter((crop) => {
      const existing = selectedCatalogImages.find((img) => img.id === crop.id);
      return !existing?.uploadedUrl;
    });
    if (!pending.length) {
      setStatus("Front/back 3:4 flat images are already in selected items.");
      return;
    }
    for (const crop of pending) {
      // Keep one final summary status instead of one per item.
      await addFlatSplitToSelectedItems(crop, { silent: true });
    }
    setStatus(`Added ${pending.length} generated 3:4 flat image(s) to selected items.`);
  }

  async function loadCatalogImages(options?: {
    after?: string | null;
    page?: number;
    queryOverride?: string;
  }) {
    const shopValue = shop.trim();
    if (!shopValue) {
      setCatalogProducts([]);
      setCatalogSearched(false);
      setCatalogPage(1);
      setCatalogTotalPages(1);
      setCatalogResultsHidden(false);
      setCatalogHasNextPage(false);
      setCatalogAfterCursorsByPage([null]);
      return;
    }
    const query = String(options?.queryOverride ?? catalogQuery).trim();
    const page = Number(options?.page || 1);
    let after = options?.after ?? null;
    setCatalogLoading(true);
    setCatalogSearched(true);
    setCatalogResultsHidden(false);
    if (page === 1 && !after) {
      setCatalogTotalPages(1);
    }
    setError(null);
    try {
      let products: ShopifyCatalogProduct[] = [];
      let hasNextPage = false;
      let endCursor: string | null = null;
      let reportedTotalPages: number | null = null;

      // Always paginate at 10 products per page (query or no query).
      for (let guard = 0; guard < 25; guard += 1) {
        const params = new URLSearchParams({
          shop: shopValue,
          first: String(CATALOG_PAGE_SIZE),
        });
        if (query) params.set("q", query);
        if (after) params.set("after", after);

        const resp = await fetch(`/api/shopify/catalog?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await parseJsonResponse(resp);
        if (!resp.ok) throw new Error(json.error || "Failed to load Shopify catalog");

        products = Array.isArray(json.products) ? json.products : [];
        const totalPagesValue = Number(json?.totalPages);
        if (Number.isFinite(totalPagesValue) && totalPagesValue > 0) {
          reportedTotalPages = Math.trunc(totalPagesValue);
        }
        const pageInfo = json?.pageInfo || {};
        hasNextPage = Boolean(pageInfo?.hasNextPage);
        endCursor = pageInfo?.endCursor ? String(pageInfo.endCursor) : null;

        if (products.length > 0) break;
        if (!hasNextPage || !endCursor) break;
        after = endCursor;
      }

      setCatalogProducts(products);
      setCatalogQueryForResults(query);
      setCatalogPage(page);
      setCatalogTotalPages((prev) => {
        if (reportedTotalPages && reportedTotalPages > 0) return reportedTotalPages;
        if (hasNextPage) return Math.max(prev, page + 1);
        return Math.max(page, 1);
      });
      setCatalogHasNextPage(hasNextPage);
      setCatalogAfterCursorsByPage((prev) => {
        const next = [...prev];
        next[page - 1] = after;
        next[page] = endCursor;
        return next.slice(0, page + 2);
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load Shopify catalog");
      setCatalogProducts([]);
      setCatalogPage(1);
      setCatalogTotalPages(1);
      setCatalogResultsHidden(false);
      setCatalogHasNextPage(false);
      setCatalogAfterCursorsByPage([null]);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadCatalogNextPage() {
    if (catalogLoading || !catalogHasNextPage) return;
    const nextPage = catalogPage + 1;
    const nextAfter = catalogAfterCursorsByPage[catalogPage] || null;
    await loadCatalogImages({ queryOverride: catalogQueryForResults, page: nextPage, after: nextAfter });
  }

  async function loadCatalogPreviousPage() {
    if (catalogLoading || catalogPage <= 1) return;
    const prevPage = catalogPage - 1;
    const prevAfter = catalogAfterCursorsByPage[prevPage - 1] || null;
    await loadCatalogImages({ queryOverride: catalogQueryForResults, page: prevPage, after: prevAfter });
  }

  async function loadCatalogFirstPage() {
    if (catalogLoading || catalogPage === 1) return;
    await loadCatalogImages({ queryOverride: catalogQueryForResults, page: 1, after: null });
  }

  function onCatalogSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    loadCatalogImages();
  }

  async function loadPushCatalogProducts() {
    const shopValue = shop.trim();
    if (!shopValue) {
      setPushCatalogProducts([]);
      setPushCatalogSearched(false);
      return;
    }
    const query = pushSearchQuery.trim();
    setPushCatalogLoading(true);
    setPushCatalogSearched(true);
    setError(null);
    try {
      const params = new URLSearchParams({ shop: shopValue, first: "40" });
      if (query) params.set("q", query);
      const resp = await fetch(`/api/shopify/catalog?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) throw new Error(json.error || "Failed to load Shopify catalog");
      const products = Array.isArray(json.products) ? json.products : [];
      setPushCatalogProducts(products);
      const savedBarcode = itemBarcodeSaved.trim().toLowerCase();
      if (savedBarcode) {
        const exact = products.find((product: ShopifyCatalogProduct) =>
          (product.barcodes || []).some(
            (barcode) => String(barcode || "").trim().toLowerCase() === savedBarcode
          )
        );
        if (exact) {
          upsertPushQueueFromProduct(exact, { includeGenerated: true });
          return;
        }
      }
      if (products.length === 1) {
        upsertPushQueueFromProduct(products[0], { includeGenerated: true });
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load Shopify catalog");
      setPushCatalogProducts([]);
    } finally {
      setPushCatalogLoading(false);
    }
  }

  function onPushCatalogSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    loadPushCatalogProducts();
  }

  function buildGeneratedPushImages() {
    // Section 3 must use split outputs (or uploaded files), not unsplit panel images.
    return [] as PushQueueImage[];
  }

  async function loadCurrentShopifyImages(productIdValue: string, includeGenerated: boolean) {
    const shopValue = shop.trim();
    if (!shopValue || !productIdValue.trim()) return;
    const resp = await fetch("/api/shopify-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-product-media",
        shop: shopValue,
        productId: productIdValue,
      }),
    });
    const json = await parseJsonResponse(resp, "/api/shopify-push");
    if (!resp.ok) {
      throw new Error(json?.error || "Failed to load current Shopify images.");
    }
    const mediaRows = Array.isArray(json?.media) ? json.media : [];
    const currentRows = mediaRows.map((row: any) => ({
      id: `push:${productIdValue}:${String(row?.id || "")}`,
      sourceImageId: String(row?.id || ""),
      mediaId: String(row?.id || ""),
      url: String(row?.url || "").trim(),
      title: "Current Shopify image",
      source: "shopify" as const,
      altText: String(row?.altText || "").trim(),
      generatingAlt: false,
      deleting: false,
    })) as PushQueueImage[];
    const generatedRows = includeGenerated ? buildGeneratedPushImages() : [];
    const merged = [...currentRows, ...generatedRows];
    setPushImages(merged);
    return merged;
  }

  function upsertPushQueueFromProduct(product: ShopifyCatalogProduct, options?: { includeGenerated?: boolean }) {
    const productIdValue = String(product.id || "").trim();
    if (!productIdValue) return;
    setPushProductId(productIdValue);
    setPushProductHandle(String(product.handle || "").trim());
    setPushVariants([]);
    const includeGenerated = Boolean(options?.includeGenerated);
    void (async () => {
      try {
        const freshImages = await loadCurrentShopifyImages(productIdValue, includeGenerated);
        await pullPushVariants(productIdValue, freshImages);
        setStatus(`Loaded current Shopify images and color variants for ${product.title}.`);
      } catch (e: any) {
        setError(e?.message || "Failed to load current Shopify images.");
      }
    })();
  }

  function togglePushCatalogImage(
    product: ShopifyCatalogProduct,
    image: { id: string; url: string; altText: string }
  ) {
    const productIdValue = String(product.id || "").trim();
    if (!productIdValue) return;
    if (pushProductId && pushProductId !== productIdValue) {
      setError("You can only edit one product at a time in section 3.");
      return;
    }
    if (!pushProductId) {
      setPushProductId(productIdValue);
      setPushProductHandle(String(product.handle || "").trim());
    }
    const imageId = `push:${productIdValue}:${image.id}`;
    setPushImages((prev) => {
      const exists = prev.some((img) => img.id === imageId);
      if (exists) {
        return prev.filter((img) => img.id !== imageId);
      }
      return [
        ...prev,
        {
          id: imageId,
          sourceImageId: String(image.id || ""),
          mediaId: String(image.id || ""),
          url: String(image.url || "").trim(),
          title: String(image.altText || product.title || "Product image"),
          source: "shopify",
          altText: String(image.altText || "").trim(),
          generatingAlt: false,
          deleting: false,
        },
      ];
    });
  }

  async function removePushImageFromShopify(image: PushQueueImage) {
    if (!pushProductId.trim()) return;
    // Always remove from preview immediately; keep Shopify delete best-effort in background.
    setPushImages((prev) => prev.filter((img) => img.id !== image.id));
    if (!image.mediaId) return;
    setError(null);
    try {
      const resp = await fetch("/api/shopify-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-media",
          shop: shop.trim(),
          productId: pushProductId.trim(),
          mediaIds: [image.mediaId],
        }),
      });
      const json = await parseJsonResponse(resp, "/api/shopify-push");
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to remove Shopify image.");
      }
      setStatus("Removed image from Shopify.");
    } catch (e: any) {
      setStatus(`Image removed from preview. Shopify delete warning: ${e?.message || "failed"}`);
    }
  }

  function movePushImage(fromIndex: number, toIndex: number) {
    setPushImages((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function generateAltForPushImage(imageId: string) {
    const target = pushImages.find((img) => img.id === imageId);
    if (!target) return false;
    setPushImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, generatingAlt: true } : img))
    );
    setError(null);
    try {
      const resp = await fetch("/api/openai/image-alt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: target.url,
          itemType: resolvedItemType || "apparel item",
        }),
      });
      const json = await parseJsonResponse(resp, "/api/openai/image-alt");
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to generate alt text.");
      }
      const nextAlt = String(json?.altText || "").trim();
      if (!nextAlt) throw new Error("Alt text generation returned empty result.");
      setPushImages((prev) =>
        prev.map((img) =>
          img.id === imageId ? { ...img, altText: nextAlt, generatingAlt: false } : img
        )
      );
      return true;
    } catch (e: any) {
      setPushImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, generatingAlt: false } : img))
      );
      setError(e?.message || "Failed to generate alt text.");
      return false;
    }
  }

  async function generateAltForMissingPushImages() {
    const targets = pushImages.filter((image) => !image.altText.trim());
    if (!targets.length) {
      setStatus("No missing alt text to generate.");
      return;
    }
    let successCount = 0;
    let failCount = 0;
    for (let i = 0; i < targets.length; i += ALT_GENERATION_BATCH_SIZE) {
      const batch = targets.slice(i, i + ALT_GENERATION_BATCH_SIZE);
      setStatus(
        `Generating alt text ${i + 1}-${Math.min(i + batch.length, targets.length)} of ${
          targets.length
        }...`
      );
      const results = await Promise.all(batch.map((image) => generateAltForPushImage(image.id)));
      successCount += results.filter(Boolean).length;
      failCount += results.length - results.filter(Boolean).length;
    }
    if (failCount > 0) {
      setStatus(`Generated alt for ${successCount}/${targets.length} image(s). ${failCount} failed.`);
      return;
    }
    setStatus(`Generated missing alt text for ${successCount} image(s).`);
  }

  function movePushVariant(fromIndex: number, toIndex: number) {
    setPushVariants((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex < 0 ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((row, idx) => ({ ...row, position: idx + 1 }));
    });
  }

  function assignPushImageToVariant(variantId: string, pushImageId: string) {
    setPushVariants((prev) =>
      prev.map((variant) =>
        variant.id === variantId ? { ...variant, assignedPushImageId: pushImageId } : variant
      )
    );
  }

  function clearPushVariantAssignment(variantId: string) {
    setPushVariants((prev) =>
      prev.map((variant) =>
        variant.id === variantId ? { ...variant, assignedPushImageId: null } : variant
      )
    );
  }

  function autoAssignPushImageForColor(color: string, candidates?: PushQueueImage[]) {
    const pool = candidates && candidates.length ? candidates : pushImages;
    const key = String(color || "").trim().toLowerCase();
    if (!key) return pool[0]?.id || null;
    const matched = pool.find((img) => {
      const hay = `${img.title} ${img.altText} ${img.url}`.toLowerCase();
      return hay.includes(key);
    });
    return matched?.id || pool[0]?.id || null;
  }

  async function pullPushVariants(productIdOverride?: string, imagesForAuto?: PushQueueImage[]) {
    setError(null);
    setStatus("Pulling color variants...");
    const shopValue = shop.trim();
    const productIdValue = (productIdOverride || pushProductId || "").trim();
    if (!shopValue) {
      setError("Please enter your shop domain first.");
      setStatus(null);
      return;
    }
    if (!productIdValue) {
      setError("Select a product first, then pull variants.");
      setStatus(null);
      return;
    }
    try {
      const resp = await fetch("/api/shopify-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-variants",
          shop: shopValue,
          productId: productIdValue,
        }),
      });
      const json = await parseJsonResponse(resp, "/api/shopify-push");
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to pull variants.");
      }
      const rows = Array.isArray(json?.colors)
        ? json.colors
        : Array.isArray(json?.variants)
          ? json.variants
          : [];
      setPushVariants(
        rows.map((row: any, idx: number) => ({
          id: String(row?.id || ""),
          color: String(row?.color || ""),
          position: Number(row?.position || idx + 1),
          imageUrl: row?.imageUrl ? String(row.imageUrl) : null,
          assignedPushImageId: autoAssignPushImageForColor(String(row?.color || ""), imagesForAuto),
          variantCount: Number(row?.variantCount || 1),
        }))
      );
      setStatus(`Loaded ${rows.length} color group(s).`);
    } catch (e: any) {
      setError(e?.message || "Failed to pull variants.");
      setStatus(null);
    }
  }

  function saveItemBarcode() {
    const normalized = sanitizeBarcodeInput(itemBarcode).trim();
    if (!normalized) {
      setError("Type barcode first, then click Save Barcode.");
      return;
    }
    if (!isValidBarcode(normalized)) {
      setError("Barcode must be 7-9 chars: digits only, or C + 6-8 digits.");
      return;
    }
    setItemBarcodeSaved(normalized);
    setError(null);
    setStatus(`Saved barcode: ${normalized}`);
  }

  function openBarcodeScanner() {
    setError(null);
    setBarcodeScannerError(null);
    setBarcodeScannerOpen(true);
  }

  function clearSavedItemBarcode() {
    setItemBarcodeSaved("");
    setStatus("Saved barcode removed.");
    setError(null);
  }

  async function searchDropboxByBarcode() {
    if (dropboxListVisible && (dropboxResults.length > 0 || dropboxFolderResults.length > 0)) {
      setDropboxListVisible(false);
      setStatus("Dropbox list hidden.");
      return;
    }
    const barcode = sanitizeBarcodeInput(itemBarcode).trim() || itemBarcodeSaved.trim();
    if (!barcode) {
      setError("Type a barcode first, then search Dropbox.");
      return;
    }
    if (!isValidBarcode(barcode)) {
      setError("Barcode must be 7-9 chars: digits only, or C + 6-8 digits.");
      return;
    }
    setDropboxSearching(true);
    setDropboxSearched(true);
    setDropboxListVisible(true);
    setItemBarcodeSaved(barcode);
    setError(null);
    try {
      const resp = await fetch("/api/dropbox/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
      });
      const json = await parseJsonResponse(resp, "/api/dropbox/search");
      if (!resp.ok) {
        throw new Error(json?.error || "Dropbox search failed.");
      }
      const images = Array.isArray(json?.images) ? json.images : [];
      const folders = Array.isArray(json?.folders) ? json.folders : [];
      setDropboxFolderResults(
        folders.map((folder: any) => ({
          folderPath: String(folder?.folderPath || ""),
          webUrl: String(folder?.webUrl || ""),
          images: Array.isArray(folder?.images)
            ? folder.images.map((img: any) => ({
                id: String(img?.id || ""),
                title: String(img?.title || "Dropbox image"),
                pathLower: String(img?.pathLower || ""),
                temporaryLink: String(img?.temporaryLink || ""),
              }))
            : [],
        }))
      );
      setDropboxResults(
        images.map((img: any) => ({
          id: String(img?.id || ""),
          title: String(img?.title || "Dropbox image"),
          pathLower: String(img?.pathLower || ""),
          temporaryLink: String(img?.temporaryLink || ""),
        }))
      );
      setStatus(
        images.length
          ? `Dropbox search found ${images.length} image(s) for barcode ${barcode}.`
          : `No Dropbox images found for barcode ${barcode}.`
      );
    } catch (e: any) {
      setDropboxFolderResults([]);
      setDropboxResults([]);
      setError(e?.message || "Dropbox search failed.");
      setStatus(null);
    } finally {
      setDropboxSearching(false);
    }
  }

  function selectDropboxImage(img: DropboxImageResult) {
    toggleCatalogImage({
      id: `dropbox:${img.id}`,
      url: img.temporaryLink,
      title: img.title || "Dropbox image",
      barcode: itemBarcodeSaved.trim(),
      source: "dropbox",
    });
  }

  function getPrimaryBarcode(product: ShopifyCatalogProduct) {
    const values = (product.barcodes || []).map((v) => String(v || "").trim()).filter(Boolean);
    return values[0] || "";
  }

  function toggleCatalogImage(image: {
    id: string;
    url: string;
    title: string;
    barcode?: string;
    source?: "shopify" | "dropbox" | "generated_flat" | "final_results_storage";
  }) {
    const existing = selectedCatalogImages.find((img) => img.id === image.id);
    if (existing?.uploading) return;

    if (image.barcode?.trim()) setItemBarcode(image.barcode.trim());

    if (existing?.uploadError) {
      void importCatalogImageToBucket(image);
      return;
    }

    if (existing) {
      setSelectedCatalogImages((prev) => prev.filter((img) => img.id !== image.id));
      if (existing.uploadedUrl) {
        setItemReferenceUrls((prev) => prev.filter((url) => url !== existing.uploadedUrl));
      }
      return;
    }

    setSelectedCatalogImages((prev) => [
      ...prev,
      {
        ...image,
        source: image.source || "shopify",
        uploadedUrl: null,
        uploading: true,
        uploadError: null,
      },
    ]);
    if ((image.source || "shopify") !== "generated_flat") {
      void detectItemTypeFromSource({
        sourceSignature: `catalog:${image.id}:${image.url}`,
        imageUrl: image.url,
        hintText: `${image.title} ${image.url}`,
      });
    }
    void importCatalogImageToBucket(image);
  }

  async function importCatalogImageToBucket(image: { id: string; url: string; title: string }) {
    setError(null);
    setSelectedCatalogImages((prev) =>
      prev.map((img) =>
        img.id === image.id
          ? { ...img, uploading: true, uploadError: null }
          : img
      )
    );

    try {
      const resp = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [image.url] }),
      });
      const json = await parseJsonResponse(resp, "/api/items");
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to import selected catalog image.");
      }
      const uploaded = Array.isArray(json?.urls) ? String(json.urls[0] || "").trim() : "";
      if (!uploaded) {
        throw new Error("Catalog image import returned no uploaded URL.");
      }

      setSelectedCatalogImages((prev) =>
        prev.map((img) =>
          img.id === image.id
            ? { ...img, uploadedUrl: uploaded, uploading: false, uploadError: null }
            : img
        )
      );
      setItemReferenceUrls((prev) => Array.from(new Set([...prev, uploaded])));
      setItemUploadCount((prev) => {
        const next = prev ? prev + 1 : 1;
        return next;
      });
    } catch (e: any) {
      const message = e?.message || "Failed to import selected catalog image.";
      setSelectedCatalogImages((prev) =>
        prev.map((img) =>
          img.id === image.id
            ? { ...img, uploading: false, uploadError: message }
            : img
        )
      );
      setError(message);
    }
  }

  function formatProductBarcodes(product: ShopifyCatalogProduct) {
    const values = (product.barcodes || []).filter(Boolean);
    if (!values.length) return "N/A";
    if (values.length <= 3) return values.join(", ");
    return `${values.slice(0, 3).join(", ")} +${values.length - 3} more`;
  }

  async function pushImageToShopify() {
    setError(null);
    setStatus("Updating Shopify images...");
    setPushingImages(true);
    try {
      const shopValue = shop.trim();
      if (!shopValue) {
        throw new Error("Please enter your shop domain first.");
      }
      if (!pushProductId.trim()) {
        throw new Error("Select a product first.");
      }
      if (!pushImages.length) {
        throw new Error("No images selected for Shopify push.");
      }

      const stagedUrlById = new Map<string, string>();
      const dataRows = pushImages.filter((img) =>
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(String(img.url || ""))
      );
      for (let i = 0; i < dataRows.length; i += PUSH_STAGING_BATCH_SIZE) {
        const batch = dataRows.slice(i, i + PUSH_STAGING_BATCH_SIZE);
        setStatus(
          `Preparing images for Shopify (${i + 1}-${Math.min(i + batch.length, dataRows.length)} of ${dataRows.length})...`
        );
        const files = batch.map((img, idx) =>
          dataUrlToFile(String(img.url || ""), img.title || `push-image-${i + idx + 1}.png`)
        );
        const urls = await uploadFilesToItemsBucket(files);
        if (urls.length !== batch.length) {
          throw new Error("Failed to prepare all images for Shopify push.");
        }
        for (let j = 0; j < batch.length; j += 1) {
          stagedUrlById.set(batch[j].id, String(urls[j] || "").trim());
        }
      }

      const payloadImages = pushImages.map((img) => ({
        url: stagedUrlById.get(img.id) || img.url,
        altText: img.altText.trim(),
      }));
      const invalidSource = payloadImages.find((img) => !/^https?:\/\//i.test(String(img.url || "")));
      if (invalidSource) {
        throw new Error("Some push images could not be prepared. Re-add them before pushing.");
      }
      const imageIndexByPushId = new Map(pushImages.map((img, idx) => [img.id, idx]));
      const colorAssignments = pushVariants
        .filter((variant) => variant.assignedPushImageId && imageIndexByPushId.has(variant.assignedPushImageId))
        .map((variant) => ({
          color: variant.color,
          imageIndex: imageIndexByPushId.get(String(variant.assignedPushImageId)) as number,
        }));
      const colorOrder = pushVariants.map((variant) => variant.color).filter(Boolean);

      const resp = await fetch("/api/shopify-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace-product-images",
          shop: shopValue,
          productId: pushProductId.trim(),
          images: payloadImages,
          removeExisting: true,
          colorAssignments,
          colorOrder,
        }),
      });
      const json = await parseJsonResponse(resp, "/api/shopify-push");
      if (!resp.ok) {
        const details =
          typeof json?.details === "string"
            ? json.details
            : json?.details
              ? JSON.stringify(json.details)
              : "";
        throw new Error(
          `${json?.error || "Shopify image push failed"}${details ? `: ${details}` : ""}`
        );
      }

      const reorderWarning = String(json?.variantReorderWarning || "").trim();
      setStatus(
        reorderWarning
          ? `Shopify images updated. Variant order warning: ${reorderWarning}`
          : "Shopify product images and color assignments updated."
      );
      await loadPushCatalogProducts();
    } catch (e: any) {
      setError(e?.message || "Shopify image push failed");
      setStatus(null);
    } finally {
      setPushingImages(false);
    }
  }

  function filterImages(files: FileList | File[]) {
    return Array.from(files).filter((file) => isImageLikeFile(file));
  }

  async function handlePushFilesSelected(files: File[]) {
    const filtered = filterImages(files);
    if (!filtered.length) return;
    setPushUploading(true);
    setError(null);
    try {
      const settled = await Promise.allSettled(
        filtered.map(async (file) => ({ file, url: await fileToDataUrl(file) }))
      );
      const successes = settled
        .filter((row): row is PromiseFulfilledResult<{ file: File; url: string }> => row.status === "fulfilled")
        .map((row) => row.value);
      const failures = settled
        .filter((row): row is PromiseRejectedResult => row.status === "rejected")
        .map((row) => String(row.reason?.message || "Upload failed"));

      if (!successes.length) throw new Error(failures[0] || "No images could be read.");
      const uploadedRows: PushQueueImage[] = successes.map(({ file, url }, idx: number) => ({
        id: `upload:${Date.now()}:${idx}:${crypto.randomUUID()}`,
        sourceImageId: `upload:${idx}`,
        mediaId: null,
        url,
        title: file?.name || `Uploaded image ${idx + 1}`,
        source: "device_upload",
        altText: "",
        generatingAlt: false,
        deleting: false,
      }));
      setPushImages((prev) => [...prev, ...uploadedRows]);
      setStatus(
        failures.length
          ? `Added ${uploadedRows.length} image(s). ${failures.length} failed.`
          : `Added ${uploadedRows.length} uploaded image(s) to Shopify Push.`
      );
    } catch (e: any) {
      setError(e?.message || "Failed to upload images for Shopify Push.");
    } finally {
      setPushUploading(false);
    }
  }

  async function handleModelFilesSelected(files: File[]) {
    const filtered = filterImages(files);
    if (!filtered.length) return;

    const batchId = modelDraftId || crypto.randomUUID();
    if (!modelDraftId) setModelDraftId(batchId);

    setModelUploadPending((prev) => prev + filtered.length);
    setModelUploadTotal((prev) => prev + filtered.length);

    const localItems = filtered.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      name: file.name,
      localUrl: URL.createObjectURL(file),
    }));
    setModelPreviewItems((prev) => [...prev, ...localItems]);

    const results = await Promise.allSettled(
      filtered.map(async (file, index) => {
        const preview = localItems[index];
        const uploadForm = new FormData();
        uploadForm.append("batchId", batchId);
        uploadForm.append("file", file);
        try {
          const resp = await fetch("/api/models/upload", {
            method: "POST",
            body: uploadForm,
          });
          const json = await parseJsonResponse(resp);
          if (!resp.ok) {
            throw new Error(json.error || "File upload failed");
          }
          setModelPreviewItems((prev) =>
            prev.map((item) =>
              item.id === preview.id
                ? { ...item, uploadedUrl: json.url, path: json.path }
                : item
            )
          );
          setModelUploads((prev) => [
            ...prev,
            { name: file.name, url: json.url, path: json.path },
          ]);
          setModelUploadDone((prev) => prev + 1);
        } finally {
          setModelUploadPending((prev) => Math.max(0, prev - 1));
        }
      })
    );
    const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (failures.length) {
      setError(failures[0].reason?.message || "Some uploads failed.");
    }
  }

  async function removeModelUpload(target: { id: string; path?: string }) {
    const item = modelPreviewItems.find((p) => p.id === target.id);
    if (item?.localUrl) {
      URL.revokeObjectURL(item.localUrl);
    }
    setModelPreviewItems((prev) => prev.filter((p) => p.id !== target.id));
    if (item?.path) {
      setModelUploads((prev) => prev.filter((u) => u.path !== item.path));
      await fetch("/api/storage/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: item.path }),
      });
    }
  }

  async function removeModel(modelId: string) {
    await fetch("/api/models/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId }),
    });
    refreshModels();
  }

  async function resetModels() {
    await fetch("/api/models/reset", { method: "POST" });
    refreshModels();
  }

  async function loadPreviousModelUploads() {
    setPreviousModelUploadsLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/models/uploads", { cache: "no-store" });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to load previous model uploads");
      const files = Array.isArray(json?.files) ? json.files : [];
      const normalized: PreviousModelUpload[] = files.map((file: any) => {
        const genderRaw = String(file?.gender || "").trim().toLowerCase();
        const gender = genderRaw === "male" || genderRaw === "female" ? genderRaw : "";
        return {
          id: String(file?.id || ""),
          path: String(file?.path || ""),
          fileName: String(file?.fileName || ""),
          modelName: String(file?.modelName || ""),
          gender,
          uploadedAt: file?.uploadedAt ? String(file.uploadedAt) : null,
          url: file?.url ? String(file.url) : null,
          previewUrl: file?.previewUrl ? String(file.previewUrl) : file?.url ? String(file.url) : null,
        };
      });
      const dedupedByName = new Map<string, PreviousModelUpload>();
      for (const file of normalized.filter((row) => Boolean(row.id && row.path))) {
        const key = canonicalPreviousUploadName(file.fileName, file.path);
        const prev = dedupedByName.get(key);
        if (!prev) {
          dedupedByName.set(key, file);
          continue;
        }
        const prevTs = prev.uploadedAt ? new Date(prev.uploadedAt).getTime() : 0;
        const nextTs = file.uploadedAt ? new Date(file.uploadedAt).getTime() : 0;
        if (nextTs >= prevTs) {
          dedupedByName.set(key, file);
        }
      }

      setPreviousModelUploads(Array.from(dedupedByName.values()));
      setBrokenPreviousUploadIds([]);
    } catch (e: any) {
      setError(e?.message || "Failed to load previous model uploads");
      setPreviousModelUploads([]);
    } finally {
      setPreviousModelUploadsLoading(false);
    }
  }

  async function togglePreviousUploads() {
    if (previousUploadsVisible) {
      setPreviousUploadsVisible(false);
      return;
    }
    if (!previousModelUploads.length) {
      await loadPreviousModelUploads();
    }
    setPreviousUploadsVisible(true);
  }

  async function onPreviousUploadsPrimaryAction() {
    if (!previousUploadsVisible) {
      await togglePreviousUploads();
      return;
    }
    setPreviousUploadsVisible(false);
  }

  async function emptyBucket() {
    const ok = window.confirm(
      "This will permanently delete all files under models/ and items/ in storage. Continue?"
    );
    if (!ok) return;

    setEmptyingBucket(true);
    setError(null);
    try {
      const resp = await fetch("/api/storage/empty", { method: "POST" });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to empty storage");
      setStatus(`Storage emptied. Deleted ${json?.deleted ?? 0} file(s).`);
      setPreviousModelUploads([]);
      refreshModels();
    } catch (e: any) {
      setError(e?.message || "Failed to empty storage");
    } finally {
      setEmptyingBucket(false);
    }
  }

  function addPreviousUploadToRegistry(file: PreviousModelUpload) {
    if (!file.path || !file.url) {
      setError("Selected upload is missing file path or URL.");
      return;
    }
    setError(null);

    let addedCount = 0;

    setModelPreviewItems((prev) => {
      const existingByPath = new Set(prev.map((p) => p.path).filter(Boolean));
      const toAdd = existingByPath.has(file.path)
        ? []
        : [
            {
              id: `prev-${file.id}`,
              name: file.fileName,
              localUrl: file.previewUrl || file.url || "",
              uploadedUrl: file.url || undefined,
              path: file.path,
            },
          ].filter((x) => Boolean(x.localUrl));
      if (toAdd.length) addedCount += toAdd.length;
      return [...prev, ...toAdd];
    });

    setModelUploads((prev) => {
      const existing = new Set(prev.map((p) => p.path));
      const toAdd =
        existing.has(file.path) || !file.url
          ? []
          : [{ name: file.fileName, url: file.url as string, path: file.path }];
      return [...prev, ...toAdd];
    });

    if (addedCount > 0) {
      setStatus(`Added ${addedCount} previous upload(s) to Model Registry.`);
    } else {
      setStatus("This upload is already added to Model Registry.");
    }
  }

  const addedPreviousPaths = useMemo(
    () => new Set(modelUploads.map((file) => file.path).filter(Boolean)),
    [modelUploads]
  );

  const sortedPreviousModelUploads = useMemo(() => {
    const rows =
      previousGenderFilter === "all"
        ? [...previousModelUploads]
        : previousModelUploads.filter((row) => row.gender === previousGenderFilter);
    if (previousSort === "name_az") {
      rows.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" }));
      return rows;
    }
    if (previousSort === "date_desc") {
      rows.sort((a, b) => {
        const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return tb - ta;
      });
      return rows;
    }
    rows.sort((a, b) => {
      const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return ta - tb;
    });
    return rows;
  }, [previousModelUploads, previousSort, previousGenderFilter]);

  const showCatalogPagination = useMemo(
    () =>
      catalogSearched &&
      !catalogResultsHidden &&
      (catalogPage > 1 || catalogHasNextPage || catalogTotalPages > 1),
    [catalogSearched, catalogResultsHidden, catalogPage, catalogHasNextPage, catalogTotalPages]
  );

  const visibleCatalogProducts = useMemo(() => catalogProducts, [catalogProducts]);
  const selectedModelForGeneration = useMemo(
    () => models.find((m) => m.model_id === selectedModelId),
    [models, selectedModelId]
  );
  const pushColorMappingPreview = useMemo(
    () =>
      pushVariants.map((variant) => {
        const imageIndex = pushImages.findIndex((img) => img.id === variant.assignedPushImageId);
        const assignedImage = imageIndex >= 0 ? pushImages[imageIndex] : null;
        return {
          color: variant.color || "Color",
          variantCount: variant.variantCount,
          imagePosition: imageIndex >= 0 ? imageIndex + 1 : null,
          imageTitle: assignedImage?.title || "",
        };
      }),
    [pushVariants, pushImages]
  );

  function isDressItemType(value: string) {
    return String(value || "").trim().toLowerCase().includes("dress");
  }

  function isSwimwearItemType(value: string) {
    const t = String(value || "").trim().toLowerCase();
    if (!t) return false;
    return (
      t.includes("swimwear") ||
      t.includes("swim short") ||
      t.includes("swimshort") ||
      t.includes("swim trunk") ||
      t.includes("swim trunks") ||
      t.includes("bikini") ||
      t.includes("one-piece swimsuit") ||
      t.includes("one piece swimsuit") ||
      t.includes("swimsuit")
    );
  }

  function getSwimwearStyleLockLines(gender: string, itemTypeValue: string) {
    if (!isSwimwearItemType(itemTypeValue)) return [] as string[];
    const g = String(gender || "").trim().toLowerCase();
    const lines = [
      "SWIMWEAR SAFETY + STYLING LOCK (NON-NEGOTIABLE):",
      "- Keep the scene strictly ecommerce/catalog, neutral posture, and non-suggestive styling.",
      "- No erotic framing, no provocative posing, and no intimate context.",
      "- Use clean studio product-photography styling only.",
      "- Foot styling for swimwear: use clean flip-flops/sandals/water-shoes, or naturally uncovered feet when needed.",
    ];
    if (g === "male") {
      lines.push(
        "- Male swimwear rule: standard commercial swimwear presentation is allowed in neutral catalog styling."
      );
    } else if (g === "female") {
      lines.push(
        "- Female swimwear rule: keep standard swimwear coverage consistent with item references and neutral catalog styling."
      );
    }
    return lines;
  }

  function isFemaleDressPanelBlocked(modelGender: string, itemTypeValue: string, panelNumber: number) {
    return (
      String(modelGender || "").trim().toLowerCase() === "female" &&
      isDressItemType(itemTypeValue) &&
      panelNumber === 3
    );
  }

  useEffect(() => {
    const modelGender = String(selectedModelForGeneration?.gender || "").trim().toLowerCase();
    const shouldBlockPanel3 = isFemaleDressPanelBlocked(modelGender, resolvedItemType, 3);
    if (!shouldBlockPanel3) return;
    setSelectedPanels((prev) => {
      const next = prev.filter((panel) => panel !== 3);
      return next.length ? next : [1];
    });
  }, [selectedModelForGeneration?.gender, resolvedItemType]);

  function getPanelPosePair(gender: string, panelNumber: number): [number, number] {
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

  function getPanelButtonLabel(gender: string, panelNumber: number) {
    const [poseA, poseB] = getPanelPosePair(gender, panelNumber);
    return `Panel ${panelNumber} (Pose ${poseA} + ${poseB})`;
  }

  function uniqueSortedPanels(values: number[]) {
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }

  function buildPanelLockKey(modelId: string, itemTypeValue: string, refs: string[]) {
    const normalizedRefs = [...refs]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .sort();
    return [
      modelId.trim(),
      itemTypeValue.trim().toLowerCase(),
      normalizedRefs.join("|"),
    ].join("::");
  }

  function inferItemTypeCategory(itemTypeValue: string) {
    const t = String(itemTypeValue || "").trim().toLowerCase();
    if (!t) return "item";
    const has = (...keywords: string[]) => keywords.some((kw) => t.includes(kw));
    if (
      has(
        "full look",
        "full-look",
        "outfit",
        "set",
        "matching set",
        "two piece",
        "two-piece",
        "co-ord",
        "co ord"
      )
    ) {
      return "full-look";
    }
    if (
      has(
        "shirt",
        "tee",
        "t-shirt",
        "tshirt",
        "tank",
        "top",
        "blouse",
        "hoodie",
        "crewneck",
        "sweatshirt",
        "sweater",
        "polo",
        "jersey",
        "vest",
        "cardigan",
        "button-down",
        "button down"
      )
    ) {
      return "top";
    }
    if (
      has(
        "pant",
        "pants",
        "jean",
        "jeans",
        "short",
        "shorts",
        "skirt",
        "legging",
        "jogger",
        "cargo",
        "trouser",
        "bottom"
      )
    ) {
      return "bottom";
    }
    if (has("shoe", "sneaker", "boot", "heel", "sandal", "loafer", "trainer", "footwear")) {
      return "footwear";
    }
    if (has("jacket", "coat", "puffer", "overshirt", "outerwear", "windbreaker", "blazer")) {
      return "outerwear";
    }
    if (
      has(
        "bag",
        "hat",
        "cap",
        "belt",
        "scarf",
        "sock",
        "socks",
        "accessory",
        "jewelry",
        "jewellery",
        "watch",
        "glove",
        "gloves"
      )
    ) {
      return "accessory";
    }
    return "item";
  }

  function getCloseUpCategoryRule(itemTypeValue: string) {
    const category = inferItemTypeCategory(itemTypeValue);
    if (category === "top") {
      return "- Category lock: close-up must focus on TOP details only (not shorts/pants/shoes).";
    }
    if (category === "bottom") {
      return "- Category lock: close-up must focus on BOTTOM details only (not tops/shoes).";
    }
    if (category === "footwear") {
      return "- Category lock: close-up must focus on FOOTWEAR details only.";
    }
    if (category === "outerwear") {
      return "- Category lock: close-up must focus on OUTERWEAR details only.";
    }
    if (category === "accessory") {
      return "- Category lock: close-up must focus on ACCESSORY details only.";
    }
    if (category === "full-look") {
      return "- Category lock: choose the highest-detail hero component from the locked full look and keep the rest of the look unchanged.";
    }
    return "- Category lock: close-up must focus on the exact item type entered in section 0.5.";
  }

  function getPanelCriticalLockLines(gender: string, panelNumber: number, itemTypeValue = "") {
    const panelAdultLock = "- HARD AGE LOCK: the model is over 18+.";
    const lockedItemType = String(itemTypeValue || "").trim();
    const normalizedItemType =
      String(gender || "").trim().toLowerCase() === "female" && isSwimwearItemType(lockedItemType)
        ? "swimwear"
        : lockedItemType;
    const swimwearActive = isSwimwearItemType(lockedItemType);
    const footwearHardLockLine = swimwearActive
      ? "- Swimwear footwear lock: full-body frames may use flip-flops/water-shoes, or naturally uncovered feet."
      : "- Footwear hard lock: both full-body frames must show shoes. Barefoot is forbidden.";
    const footwearWhenFullBodyLine = swimwearActive
      ? "- Swimwear footwear lock: when a frame is full-body, use flip-flops/water-shoes, or naturally uncovered feet."
      : "- Footwear hard lock: when a frame is full-body, shoes must be worn and visible.";
    const closeUpSubjectLine = normalizedItemType
      ? `- CLOSE-UP SUBJECT LOCK: section 0.5 item type is "${normalizedItemType}". Close-up must show this item type only.`
      : "- CLOSE-UP SUBJECT LOCK: close-up must follow section 0.5 item type only.";
    const closeUpCategoryRule = getCloseUpCategoryRule(lockedItemType);
    const g = String(gender || "").toLowerCase();
    if (g === "female") {
      if (panelNumber === 1) {
        return [
          "FEMALE PANEL 1 CRITICAL LOCK (Pose 1 + Pose 2):",
          panelAdultLock,
          "- LEFT Pose 1 must be full-body front hero with head and feet fully visible.",
          "- RIGHT Pose 2 must be full-body back view with face visible over shoulder.",
          footwearHardLockLine,
          "- Same exact model identity and same selected look in both frames.",
        ];
      }
      if (panelNumber === 2) {
        return [
          "FEMALE PANEL 2 CRITICAL LOCK (Pose 3 + Pose 4):",
          panelAdultLock,
          "- LEFT Pose 3 must be full-body 3/4 front angle (25-35 degrees).",
          "- RIGHT Pose 4 must be upper-body with face visible; crop must match pose definition.",
          "- Do not swap sides, do not replace either side with another pose.",
        ];
      }
      if (panelNumber === 3) {
        return [
          "FEMALE PANEL 3 CRITICAL LOCK (Pose 7 + Pose 5):",
          panelAdultLock,
          "- LEFT Pose 7 must show lower body from the same exact selected look (same bottom/color/fabric/details).",
          "- RIGHT Pose 5 must be a close-up of the most detailed item from that same selected look.",
          closeUpSubjectLine,
          closeUpCategoryRule,
          "- Do not introduce a different person identity, different outfit, or different colorway in either side.",
        ];
      }
      return [
        "FEMALE PANEL 4 CRITICAL LOCK (Pose 6 + Pose 8):",
        panelAdultLock,
        "- LEFT Pose 6 must be relaxed full-body front with face visible.",
        "- RIGHT Pose 8 must be a single controlled creative shot from the same exact selected look.",
        footwearWhenFullBodyLine,
        "- Keep identity and outfit locked; no substitutions.",
      ];
    }
    if (panelNumber === 1) {
      return [
        "MALE PANEL 1 CRITICAL LOCK (Pose 1 + Pose 2):",
        panelAdultLock,
        "- LEFT Pose 1 must be full-body front neutral hero, straight-on camera.",
        "- RIGHT Pose 2 must be full-body lifestyle with subtle weight shift only.",
        "- Both frames must show full head and full feet in frame (no cropping).",
        footwearHardLockLine,
        "- Do not rotate LEFT frame into lifestyle angle. Do not replace RIGHT frame with torso crop.",
      ];
    }
    if (panelNumber === 2) {
      return [
        "MALE PANEL 2 CRITICAL LOCK (Pose 3 + Pose 4):",
        panelAdultLock,
        "- LEFT Pose 3 must be torso + head front crop (mid-thigh to head).",
        "- RIGHT Pose 4 must be full-body back view with full head and feet visible.",
        swimwearActive
          ? "- RIGHT Pose 4 swimwear footwear lock: use flip-flops/water-shoes, or naturally uncovered feet."
          : "- RIGHT Pose 4 footwear hard lock: shoes must be worn and visible. Barefoot is forbidden.",
        "- Same model identity, same selected look, no side swaps.",
      ];
    }
    if (panelNumber === 3) {
      return [
        "MALE PANEL 3 CRITICAL LOCK (Pose 5 + Pose 6):",
        panelAdultLock,
        "- LEFT Pose 5 must be lower body/legs crop (waist to feet).",
        "- RIGHT Pose 6 must be one close-up detail from the same selected item/look.",
        closeUpSubjectLine,
        closeUpCategoryRule,
        "- Do not replace close-up with full-body and do not change outfit.",
      ];
    }
    return [
      "MALE PANEL 4 CRITICAL LOCK (Pose 7 + Pose 8):",
      panelAdultLock,
      "- LEFT Pose 7 must be torso-back crop with over-shoulder head turn.",
      "- LEFT Pose 7 back-surface lock: keep the back clean. Do not invent or add any back print/graphic/logo design.",
      "- Only show a back design if that exact design is clearly present in the locked item references.",
      "- RIGHT Pose 8 must be a single controlled creative pose from the same selected look.",
      "- Keep the same identity and item lock in both frames.",
    ];
  }

  function extractPoseBlock(library: string, poseNumber: number) {
    const lib = String(library || "");
    const n = Number.isFinite(poseNumber) ? Math.trunc(poseNumber) : poseNumber;
    const patterns = [
      new RegExp(
        `(?:^|\\n\\s*)(POSE\\s+${n}\\s+[\\s\\S]*?)(?=\\n\\s*POSE\\s+\\d+\\s+|$)`,
        "i"
      ),
      new RegExp(
        `(?:^|\\n\\s*)(FEMALE\\s*[-—]\\s*POSE\\s+${n}[\\s\\S]*?)(?=\\n\\s*POSE\\s+\\d+\\s+|\\n\\s*FEMALE\\s*[-—]\\s*POSE\\s+\\d+|$)`,
        "i"
      ),
    ];
    for (const regex of patterns) {
      const match = lib.match(regex);
      if (match?.[1]?.trim()) return match[1].trim();
    }
    return `POSE ${poseNumber}`;
  }

  function buildMasterPanelPrompt(args: {
    panelNumber: number;
    panelLabel: string;
    poseA: number;
    poseB: number;
    modelName: string;
    modelGender: string;
    modelRefs: string[];
    itemRefs: string[];
    itemType: string;
    itemStyleInstructions?: string;
    regenerationComments?: string;
  }) {
    const poseLibrary = getPoseLibraryForGender(args.modelGender);
    const fullPoseLibraries = [
      "MALE POSE LIBRARY (ORIGINAL, UNCHANGED):",
      MALE_POSE_LIBRARY,
      "",
      "FEMALE POSE LIBRARY (ORIGINAL, UNCHANGED):",
      FEMALE_POSE_LIBRARY,
    ].join("\n");
    const mappingText =
      String(args.modelGender || "").toLowerCase() === "female"
        ? FEMALE_PANEL_MAPPING_TEXT
        : MALE_PANEL_MAPPING_TEXT;
    const poseABlock = extractPoseBlock(poseLibrary, args.poseA);
    const poseBBlock = extractPoseBlock(poseLibrary, args.poseB);
    const criticalLockLines = getPanelCriticalLockLines(
      args.modelGender,
      args.panelNumber,
      args.itemType
    );
    const swimwearActive = isSwimwearItemType(args.itemType);
    const swimwearStyleLines = getSwimwearStyleLockLines(args.modelGender, args.itemType);
    const closeUpCategoryRule = getCloseUpCategoryRule(args.itemType);
    const promptItemType =
      String(args.modelGender || "").trim().toLowerCase() === "female" &&
      isSwimwearItemType(args.itemType)
        ? "swimwear"
        : args.itemType.trim();
    const closeUpSubjectLine = promptItemType
      ? `- CLOSE-UP SUBJECT LOCK: the close-up subject must match section 0.5 item type "${promptItemType}" exactly.`
      : "- CLOSE-UP SUBJECT LOCK: the close-up subject must match section 0.5 item type exactly.";
    const styleInstructions = normalizePromptInstruction(args.itemStyleInstructions);
    const regenNotes = normalizePromptInstruction(args.regenerationComments);

    return [
      "CHATGPT-ONLY EXECUTION HARD LOCK (embedded by app)",
      "ITEM REFERENCE INTERPRETATION HARD LOCK:",
      "- Treat every uploaded item image as product reference only.",
      "- Item images may show a person, flat-lay, hanger, or mannequin.",
      "- Do not block item images because a person is wearing the product. Keep the image and use garment details only.",
      "- Never copy any person identity/presentation from item refs (face, skin tone, hair, body type, pose, identity).",
      "- Never copy presentation style from item refs (model styling, camera angle, background composition, pose styling).",
      "- Human in item refs = temporary hanger/mannequin only. Not a character source.",
      "- Forbidden from item-ref humans: face shape, eyes, nose, lips, jawline, skin tone, hair texture/color/style/hairline, age cues, body proportions, tattoos, jewelry.",
      "- If any item ref conflicts with model identity, ignore the human and keep only garment details.",
      "- Identity source priority is absolute: MODEL refs first and only for person identity; item refs are garment-only.",
      `- LOCKED ITEM TYPE PRIORITY: section 0.5 item type is "${promptItemType || args.itemType || "apparel item"}".`,
      "- When references include multiple garment categories, prioritize and render only details that match the locked item type.",
      "- Ignore conflicting category cues that do not match the locked item type.",
      "- Use item refs only for product attributes: shape, color, material, construction, and details.",
      "- If a full-body outfit image is provided, treat it as a single full-look reference and preserve the whole look structure (top, bottom, shoes, accessories).",
      "- If full-look + separate item images are both provided, match each extra item to the corresponding part in the full look and replace only those matched parts.",
      "- Keep all non-replaced parts from the full-look reference unchanged.",
      "- CLOSE-UP LOCK: for MALE Pose 6 and FEMALE Pose 5, generate one close-up using section 0.5 item references.",
      closeUpSubjectLine,
      closeUpCategoryRule,
      "- If a set or multiple items are present, choose the most detailed item that still matches the locked section 0.5 item type.",
      ...(styleInstructions
        ? [
            "ITEM STYLING INSTRUCTIONS (SECTION 0.5, APPLY WITH LOCKS):",
            "- Apply these fit/silhouette/style instructions while preserving exact product identity/details from item refs.",
            styleInstructions,
          ]
        : []),
      ...(regenNotes
        ? [
            "REGENERATION FEEDBACK (APPLY FOR THIS PASS):",
            "- Use these corrections to improve accuracy while preserving all hard locks above.",
            regenNotes,
          ]
        : []),
      "POSE SET SELECTION (HARD LOCK):",
      "- If MODEL.gender == male: use MALE POSE SET definitions unchanged.",
      "- If MODEL.gender == female: use FEMALE POSE SET definitions unchanged.",
      "- IMPORTANT: only panel-to-pose pairing changes by gender. Pose definitions stay unchanged.",
      "GENDER-SPECIFIC PANEL MAPPING (IMMUTABLE PER GENDER):",
      "PANEL MAPPING IS IMMUTABLE. DO NOT REMAP.",
      mappingText,
      "PANEL OUTPUT HARD LOCK:",
      "- Generate exactly ONE panel image.",
      "- Each panel is a 2-up canvas only: LEFT Pose A, RIGHT Pose B.",
      "- Never output 3+ poses in one canvas. No collage. No grids.",
      "POSE LIBRARIES (ORIGINAL, UNCHANGED) INCLUDED BELOW FOR REFERENCE:",
      fullPoseLibraries,
      "Generate exactly ONE 2-up panel image.",
      "Age requirement: the model must be an adult 18+ only.",
      `PANEL ${args.panelNumber} HARD AGE LOCK: the model is over 18+.`,
      "Canvas 1536x1024; left frame 768x1024; right frame 768x1024; thin divider.",
      "No collage, no extra poses, no extra panels.",
      "Identity anchor override: use ONLY MODEL refs for face/body identity.",
      "Run-level identity lock: across all selected panels in this run, preserve the same exact model face identity.",
      "Identity consistency lock: keep the same exact person identity across every generated panel in this run (same face structure, eyes, nose, lips, skin tone, and hairline).",
      "Do not drift identity panel-to-panel.",
      "Hard identity lock: this must be the exact same person across all panels in this generation batch.",
      "Face-geometry lock: keep the same eye shape/spacing, nose bridge/tip, lip contour, jawline, cheek structure, and brow shape as model refs.",
      "Skin-tone lock: preserve the exact model skin tone and undertone from model refs. Never lighten, darken, recolor, or stylistically shift skin tone.",
      "Do not change age appearance, facial proportions, skin tone, hairline, or ethnicity between panels.",
      "Item refs are product-only anchors; never copy identity from item photos.",
      "If an item photo shows a real person, treat that person as invisible except for clothing pixels.",
      "Item-photo human = mannequin/hanger only for product display. Never transfer face, hair, skin, body, age, tattoos, or jewelry traits.",
      "Fail-closed lock: if exact locked model identity and exact locked item look cannot both be shown, do not output an image.",
      "Outfit continuity lock: both left and right frames must represent the same selected outfit/look from item references (unless right frame is an intentional close-up of that same look).",
      "No outfit swaps, no colorway swaps, no garment substitutions across frames.",
      "GLOBAL BACK-DESIGN HARD LOCK (ALL GENDERS, ALL PANELS, ALL POSES):",
      "- For any back-facing frame, never invent, redesign, or hallucinate back graphics/logos/prints.",
      "- If item references include a clear back design, reproduce that exact back design only.",
      "- If item references do not include a clear back design, keep the back fully solid/clean in item color only.",
      "Photorealism hard lock: realistic human anatomy and skin texture. No CGI, no mannequin-like skin, no plastic look, no uncanny facial structure.",
      `Panel request: Panel ${args.panelNumber} (${args.panelLabel}).`,
      `Active pose priority: LEFT Pose ${args.poseA}, RIGHT Pose ${args.poseB}.`,
      `LEFT ACTIVE POSE ${args.poseA} HARD AGE LOCK: the model is over 18+.`,
      `RIGHT ACTIVE POSE ${args.poseB} HARD AGE LOCK: the model is over 18+.`,
      "POSE PROMPTING METHOD HARD LOCK:",
      "- Only two active poses are allowed in this generation call.",
      "- LEFT frame must execute ACTIVE Pose A only.",
      "- RIGHT frame must execute ACTIVE Pose B only.",
      "Pose execution hard lock: LEFT frame must execute only LEFT active pose. RIGHT frame must execute only RIGHT active pose.",
      "ONLY these two active poses are allowed in this image.",
      ...criticalLockLines,
      ...swimwearStyleLines,
      `LEFT ACTIVE POSE:\n${poseABlock}`,
      `RIGHT ACTIVE POSE:\n${poseBBlock}`,
      "All non-active poses are reference only and must not execute in this image.",
      "Full-body framing lock (male + female): whenever an active pose is full-body, include full head and both feet entirely in frame. No cropping of head, hair, chin, toes, or shoes.",
      "Full-body no-crop applies to: Male poses 1,2,4 and Female poses 1,2,3,6.",
      "3:4 split centering hard lock: each panel half is center-cropped to a final 3:4 portrait. Keep each active pose centered in its own half.",
      "3:4 safe-zone math lock (for 1536x1024 panel output): each half is 768x1024 (already 3:4). Keep head/body/garment details inside this center-safe zone.",
      swimwearActive
        ? "Swimwear footwear lock (full-body): use clean flip-flops/sandals/water-shoes, or naturally uncovered feet."
        : "Footwear hard lock (full-body): for every full-body active pose, the model must wear visible shoes. Barefoot and socks-only are forbidden.",
      swimwearActive
        ? "If swimwear footwear is not defined in item refs, keep feet natural or use simple neutral flip-flops consistently across selected panels."
        : "If footwear is not clearly defined in item refs, use clean neutral studio sneakers and keep the same pair consistent across all selected panels in this run.",
      "No-crop mapping lock: in any panel where the active pose is full-body (male/female mapping), frame top-of-hair to bottom-of-shoes with visible white margin.",
      "Camera framing rule for full-body active poses: fit the complete body from top of hair to bottom of shoes with visible white margin above the head and below the feet.",
      "If a full-body active pose would crop head or feet, zoom out and reframe until full body is fully visible.",
      "If an active pose is not full-body (e.g., close-up/lower-body/torso crop), follow that crop as defined.",
      `Model: ${args.modelName} (${args.modelGender}).`,
      `Item type: ${promptItemType || args.itemType}.`,
      "Pure white background, high-key studio light, faint contact shadow only.",
      "Background hard lock: keep a sharp, clean studio white background (no gray cast, no gradient, no vignette, no texture, no wrinkles).",
      "Background hard lock: use seamless pure white cyclorama look (#FFFFFF), no horizon line, and no color tint.",
      "Cross-panel consistency lock: keep the same white background tone and lighting style across all selected panels in this run.",
      "Hands rule: no hands in pockets.",
    ].join("\n");
  }

  async function generatePanels(
    mode: "generate" | "regenerate" | "generate_selected" | "regenerate_selected" = "generate"
  ) {
    setError(null);
    setGenerateOpenAiResponse(null);
    const requestedPanels = uniqueSortedPanels(selectedPanels).filter(
      (panelNumber) =>
        !isFemaleDressPanelBlocked(
          String(selectedModelForGeneration?.gender || ""),
          resolvedItemType,
          panelNumber
        )
    );
    if (!requestedPanels.length) {
      setError("Please select at least one panel.");
      return;
    }
    const useAllSelected = mode === "generate_selected" || mode === "regenerate_selected";
    const isRegenerate = mode === "regenerate" || mode === "regenerate_selected";
    const queue = useAllSelected ? requestedPanels : [requestedPanels[0]];
    const actionWord = isRegenerate ? "Regenerating" : "Generating";
    setStatus(
      `${actionWord} ${useAllSelected ? `selected panel(s): ${queue.join(", ")}` : `panel ${queue[0]}`}...`
    );
    setPanelGenerating(true);
    try {
      const selectedModel = models.find((m) => m.model_id === selectedModelId);
      if (!selectedModel) {
        throw new Error("Please select a model for generation.");
      }
      if (!Array.isArray(selectedModel.ref_image_urls) || selectedModel.ref_image_urls.length < 3) {
        throw new Error(
          "Locked model is missing enough references. Upload/select at least 3 model images before generating."
        );
      }
      let effectiveItemRefs = itemReferenceUrls;
      let effectiveItemType = resolvedItemType;
      const normalizedItemStyleInstructions = normalizePromptInstruction(itemStyleInstructions);
      const normalizedRegenerationComments = isRegenerate
        ? normalizePromptInstruction(regenerationComments)
        : "";

      if (!effectiveItemType) {
        throw new Error(
          "Please set the item type in section 0.5 before generating."
        );
      }

      const catalogUploadedUrls = selectedCatalogImagesRef.current
        .map((img) => String(img.uploadedUrl || "").trim())
        .filter((url) => url.length > 0);
      const hasUnsavedCatalogRefs = catalogUploadedUrls.some(
        (url) => !effectiveItemRefs.includes(url)
      );
      const hasPendingItemInputs =
        Boolean(itemFiles.length) ||
        selectedCatalogImagesRef.current.some((img) => img.uploading) ||
        hasUnsavedCatalogRefs;

      if (hasPendingItemInputs) {
        setStatus("Saving section 0.5 item references before generation...");
        const saved = await persistItemReferences({ silentSuccess: true });
        effectiveItemRefs = saved.merged;
        // Capture current resolved custom value (especially for "Other Apparel Item").
        effectiveItemType = saved.effectiveItemType || effectiveItemType;
        setStatus(
          `${actionWord} ${useAllSelected ? `selected panel(s): ${queue.join(", ")}` : `panel ${queue[0]}`}...`
        );
      }

      if (!effectiveItemRefs.length) {
        throw new Error(
          "Please upload/import item references first in section 0.5 before generating."
        );
      }

      const lockKey = buildPanelLockKey(selectedModel.model_id, effectiveItemType, effectiveItemRefs);
      const lockHistorySet = new Set(panelRequestHistoryByLock[lockKey] || []);

      if (isRegenerate) {
        const missing = queue.filter((panelNumber) => !lockHistorySet.has(panelNumber));
        if (missing.length) {
          throw new Error(
            `COST-SAFE ABORT: Regeneration is allowed only after requested panel(s) were generated for the current model/item. Missing: ${missing.join(", ")}.`
          );
        }
      }

      setPanelRequestHistoryByLock((prev) => ({
        ...prev,
        [lockKey]: uniqueSortedPanels([...(prev[lockKey] || []), ...queue]),
      }));
      setPanelsInFlight(queue);

      const generateOnePanel = async (panelNumber: number) => {
        try {
          const panelButtonLabel = getPanelButtonLabel(selectedModel.gender, panelNumber);
          const [poseA, poseB] = getPanelPosePair(selectedModel.gender, panelNumber);
          const prompt = buildMasterPanelPrompt({
            panelNumber,
            panelLabel: panelButtonLabel,
            poseA,
            poseB,
            modelName: selectedModel.name,
            modelGender: selectedModel.gender,
            modelRefs: selectedModel.ref_image_urls,
            itemRefs: effectiveItemRefs,
            itemType: effectiveItemType,
            itemStyleInstructions: normalizedItemStyleInstructions,
            regenerationComments: normalizedRegenerationComments,
          });

          const { resp, json } = await fetchJsonWithRetry(
            "/api/generate",
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({
                prompt,
                // Keep requested panel ratio; quality is controlled by the API route.
                size: "1536x1024",
                modelRefs: selectedModel.ref_image_urls,
                itemRefs: effectiveItemRefs,
                panelQa: {
                  panelNumber,
                  panelLabel: panelButtonLabel,
                  poseA,
                  poseB,
                  modelName: selectedModel.name,
                  modelGender: selectedModel.gender,
                  itemType: effectiveItemType,
                },
              }),
            },
            1
          );
          if (!resp.ok) {
            const openAiRelated =
              Boolean(json?.openaiRaw) ||
              /openai|policy|safety|content/i.test(String(json?.error || ""));
            if (openAiRelated) {
              appendGenerateRawResponse(formatGenerateDebugPayload(json, panelNumber));
            }
            const details = shortErrorDetails(json?.details);
            const baseMsg = json?.error || `Panel ${panelNumber} generation failed`;
            throw new Error(details ? `${baseMsg}: ${details}` : baseMsg);
          }
          if (json?.degraded) {
            const warning =
              typeof json?.warning === "string" && json.warning.trim()
                ? json.warning.trim()
                : "Generation returned a degraded fallback image.";
            throw new Error(`Panel ${panelNumber} generation failed: ${warning}`);
          }

          const b64 = json?.imageBase64 || null;
          if (!b64) {
            throw new Error(`No image returned for panel ${panelNumber}`);
          }
          return { panelNumber, b64 };
        } finally {
          setPanelsInFlight((prev) => prev.filter((id) => id !== panelNumber));
        }
      };

      if (useAllSelected) {
        const settled = await Promise.allSettled(queue.map((panelNumber) => generateOnePanel(panelNumber)));
        const succeeded: Record<number, string> = {};
        const failed: Array<{ panelNumber: number; message: string }> = [];

        for (let i = 0; i < settled.length; i += 1) {
          const result = settled[i];
          const panelNumber = queue[i];
          if (result.status === "fulfilled") {
            succeeded[result.value.panelNumber] = result.value.b64;
          } else {
            failed.push({
              panelNumber,
              message: result.reason?.message || "Unknown generation failure.",
            });
          }
        }

        const succeededPanels = Object.keys(succeeded)
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v))
          .sort((a, b) => a - b);

        if (succeededPanels.length) {
          setGeneratedPanels((prev) => ({ ...prev, ...succeeded }));
          setGeneratedPanelHistoryByModel((prev) => ({
            ...prev,
            [selectedModel.model_id]: uniqueSortedPanels([
              ...(prev[selectedModel.model_id] || []),
              ...succeededPanels,
            ]),
          }));
        }

        if (failed.length) {
          const uniqueFailed = Array.from(new Set(failed.map((entry) => entry.message)));
          const failedPanels = uniqueSortedPanels(
            failed
              .map((entry) => entry.panelNumber)
              .filter((value) => Number.isFinite(value))
          );
          const moderationOnly = failed.every((entry) =>
            isModerationBlockedErrorMessage(entry.message)
          );
          if (succeededPanels.length) {
            setStatus(
              `${actionWord} partial success. Completed panel(s): ${succeededPanels.join(", ")}.`
            );
          } else {
            setStatus(null);
          }
          if (moderationOnly) {
            const panelScope = failedPanels.length
              ? `panel(s): ${failedPanels.join(", ")}`
              : "selected panel(s)";
            throw new Error(
              `Generation was blocked by safety moderation for ${panelScope}. Try neutral front/back product shots, avoid tight body crops, and keep references product-focused.`
            );
          }
          throw new Error(uniqueFailed.join(" | "));
        }

        setStatus(`${actionWord} completed: panel(s) ${queue.join(", ")}.`);
      } else {
        const single = await generateOnePanel(queue[0]);
        setGeneratedPanels((prev) => ({ ...prev, [single.panelNumber]: single.b64 }));
        setGeneratedPanelHistoryByModel((prev) => ({
          ...prev,
          [selectedModel.model_id]: uniqueSortedPanels([
            ...(prev[selectedModel.model_id] || []),
            single.panelNumber,
          ]),
        }));
        setStatus(`${actionWord} completed: panel ${single.panelNumber}.`);
      }
    } catch (e: any) {
      setError(e?.message || "Panel generation failed");
      setStatus(null);
    } finally {
      setPanelsInFlight([]);
      setPanelGenerating(false);
    }
  }

  async function extractImagesFromDrop(e: React.DragEvent) {
    const items = Array.from(e.dataTransfer.items || []);
    const files: File[] = [];

    const walkEntry = async (entry: any, path = ""): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          entry.file((file: File) => {
            if (isImageLikeFile(file)) {
              files.push(file);
            }
            resolve();
          });
        });
        return;
      }
      if (entry.isDirectory) {
        const reader = entry.createReader();
        await new Promise<void>((resolve) => {
          const readBatch = () => {
            reader.readEntries(async (entries: any[]) => {
              if (!entries.length) return resolve();
              for (const child of entries) {
                await walkEntry(child, `${path}${entry.name}/`);
              }
              readBatch();
            });
          };
          readBatch();
        });
      }
    };

    for (const item of items) {
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry) {
        await walkEntry(entry);
      }
    }

    const fallbackFiles = e.dataTransfer.files?.length ? filterImages(e.dataTransfer.files) : [];
    return mergeUniqueByNameAndSize(files, fallbackFiles);
  }

  useEffect(() => {
    const previews = itemFiles.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setItemPreviews(previews);
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [itemFiles]);

  useEffect(() => {
    const latestFile = itemFiles.length ? itemFiles[itemFiles.length - 1] : null;
    const latestCatalogImage = selectedCatalogImages.length
      ? selectedCatalogImages[selectedCatalogImages.length - 1]
      : null;

    let sourceSignature = "";
    if (latestFile) {
      sourceSignature = `file:${latestFile.name}:${latestFile.size}:${latestFile.lastModified}`;
    } else if (latestCatalogImage && latestCatalogImage.source !== "generated_flat") {
      sourceSignature = `catalog:${latestCatalogImage.id}:${latestCatalogImage.url}`;
    }

    if (!sourceSignature) {
      itemTypeDetectionSourceRef.current = "";
      return;
    }
    if (latestFile) {
      void detectItemTypeFromSource({
        sourceSignature,
        file: latestFile,
        hintText: latestFile.name,
      });
      return;
    }
    if (latestCatalogImage) {
      void detectItemTypeFromSource({
        sourceSignature,
        imageUrl: latestCatalogImage.url,
        hintText: `${latestCatalogImage.title} ${latestCatalogImage.url}`,
      });
    }
  }, [itemFiles, selectedCatalogImages, detectItemTypeFromSource]);

  useEffect(() => {
    const previews = finalResultFiles.map((file) => ({
      id: `${file.name}::${file.size}::${file.lastModified}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    setFinalResultPreviews(previews);
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [finalResultFiles]);

  function removeItemFileAt(index: number) {
    setItemFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function removeCatalogSelection(id: string) {
    setSelectedCatalogImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.uploadedUrl) {
        setItemReferenceUrls((urls) => urls.filter((url) => url !== target.uploadedUrl));
      }
      return prev.filter((img) => img.id !== id);
    });
  }

  useEffect(() => {
    return () => {
      modelPreviewItems.forEach((p) => URL.revokeObjectURL(p.localUrl));
    };
  }, []);

  function toggleApprovedPanel(panelNumber: number) {
    setApprovedPanels((prev) => {
      if (prev.includes(panelNumber)) {
        return prev.filter((p) => p !== panelNumber);
      }
      return [...prev, panelNumber].sort((a, b) => a - b);
    });
  }

  function approveSelectedPanels() {
    const available = selectedPanels.filter((panelNumber) => Boolean(generatedPanels[panelNumber]));
    if (!available.length) {
      setError("Generate selected panels first, then approve.");
      return;
    }
    setError(null);
    setApprovedPanels((prev) =>
      Array.from(new Set([...prev, ...available])).sort((a, b) => a - b)
    );
    setStatus(`Approved panel(s): ${available.join(", ")}.`);
  }

  function approveAllGeneratedPanels() {
    const allGenerated = Object.keys(generatedPanels)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (!allGenerated.length) {
      setError("No generated panels to approve yet.");
      return;
    }
    setError(null);
    setApprovedPanels(allGenerated);
    setStatus(`Approved all generated panels: ${allGenerated.join(", ")}.`);
  }

  function loadBase64Image(b64: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load generated panel image"));
      img.src = `data:image/png;base64,${b64}`;
    });
  }

  async function splitPanelToThreeByFour(panel: number, b64: string) {
    const img = await loadBase64Image(b64);
    const halfW = Math.floor(img.width / 2);
    const halfH = img.height;
    const targetRatio = SPLIT_TARGET_WIDTH / SPLIT_TARGET_HEIGHT;

    function cropForSide(side: "left" | "right") {
      const sideOffsetX = side === "left" ? 0 : img.width - halfW;
      let srcX = sideOffsetX;
      let srcY = 0;
      let srcW = halfW;
      let srcH = halfH;
      const sourceRatio = halfW / halfH;

      // Normalize each half to strict 3:4 portrait via centered crop.
      if (sourceRatio > targetRatio) {
        srcW = Math.max(1, Math.round(halfH * targetRatio));
        srcX = sideOffsetX + Math.floor((halfW - srcW) / 2);
      } else if (sourceRatio < targetRatio) {
        srcH = Math.max(1, Math.round(halfW / targetRatio));
        srcY = Math.floor((halfH - srcH) / 2);
      }

      const canvas = document.createElement("canvas");
      canvas.width = SPLIT_TARGET_WIDTH;
      canvas.height = SPLIT_TARGET_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to initialize crop canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SPLIT_TARGET_WIDTH, SPLIT_TARGET_HEIGHT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        srcX,
        srcY,
        srcW,
        srcH,
        0,
        0,
        SPLIT_TARGET_WIDTH,
        SPLIT_TARGET_HEIGHT
      );
      const dataUrl = canvas.toDataURL("image/png");
      return dataUrl.replace(/^data:image\/png;base64,/, "");
    }

    return {
      left: cropForSide("left"),
      right: cropForSide("right"),
    };
  }

  async function splitFlatFrontBackToThreeByFour(
    b64: string,
    barcode: string
  ): Promise<ItemFlatSplitImage[]> {
    const img = await loadBase64Image(b64);
    const halfW = Math.floor(img.width / 2);
    const halfH = img.height;
    const targetRatio = FLAT_SPLIT_TARGET_WIDTH / FLAT_SPLIT_TARGET_HEIGHT;
    const safeBarcode = normalizeBarcodeForFileName(barcode);
    const token = Date.now();

    function cropHalf(side: "front" | "back", index: 0 | 1): ItemFlatSplitImage {
      const sideOffsetX = index === 0 ? 0 : img.width - halfW;
      let srcX = sideOffsetX;
      let srcY = 0;
      let srcW = halfW;
      let srcH = halfH;
      const sourceRatio = halfW / halfH;

      // Convert each half into strict 3:4 portrait via centered crop.
      if (sourceRatio > targetRatio) {
        srcW = Math.max(1, Math.round(halfH * targetRatio));
        srcX = sideOffsetX + Math.floor((halfW - srcW) / 2);
      } else if (sourceRatio < targetRatio) {
        srcH = Math.max(1, Math.round(halfW / targetRatio));
        srcY = Math.floor((halfH - srcH) / 2);
      }

      const canvas = document.createElement("canvas");
      canvas.width = FLAT_SPLIT_TARGET_WIDTH;
      canvas.height = FLAT_SPLIT_TARGET_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to initialize 3:4 flat split canvas.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, FLAT_SPLIT_TARGET_WIDTH, FLAT_SPLIT_TARGET_HEIGHT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        srcX,
        srcY,
        srcW,
        srcH,
        0,
        0,
        FLAT_SPLIT_TARGET_WIDTH,
        FLAT_SPLIT_TARGET_HEIGHT
      );
      const dataUrl = canvas.toDataURL("image/png");
      return {
        id: `flat-34:${token}:${side}`,
        side,
        fileName: `${safeBarcode}-flat-${side}-3x4.png`,
        imageBase64: dataUrl.replace(/^data:image\/png;base64,/, ""),
      };
    }

    return [cropHalf("front", 0), cropHalf("back", 1)];
  }

  function normalizeBarcodeForFileName(value: string) {
    const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    return cleaned || "no-barcode";
  }

  function buildSplitFileName(
    panel: number,
    side: "left" | "right",
    gender: string,
    barcode: string
  ) {
    const [poseA, poseB] = getPanelPosePair(gender, panel);
    const poseNumber = side === "left" ? poseA : poseB;
    const safeBarcode = normalizeBarcodeForFileName(barcode);
    return {
      poseNumber,
      fileName: `${safeBarcode}-pose${poseNumber}.png`,
    };
  }

  function downloadBase64Png(filename: string, b64: string) {
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${b64}`;
    a.download = filename;
    a.click();
  }

  function base64ToFile(base64: string, fileName: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: "image/png" });
  }

  function dataUrlToFile(dataUrl: string, fallbackName: string) {
    const raw = String(dataUrl || "");
    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
    if (!match) {
      throw new Error("Invalid image data payload.");
    }
    const mime = String(match[1] || "image/png").toLowerCase();
    const base64 = String(match[2] || "");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const ext =
      mime.includes("png")
        ? "png"
        : mime.includes("jpeg") || mime.includes("jpg")
          ? "jpg"
          : mime.includes("webp")
            ? "webp"
            : "png";
    const safe = String(fallbackName || "push-image").replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const finalName = safe.includes(".") ? safe : `${safe}.${ext}`;
    return new File([bytes], finalName, { type: mime });
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function uploadFilesToItemsBucket(files: File[], folderPrefix = "items") {
    if (!files.length) return [] as string[];
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    form.append("folderPrefix", folderPrefix);
    const resp = await fetch("/api/items", { method: "POST", body: form });
    const json = await parseJsonResponse(resp, "/api/items");
    if (!resp.ok) {
      throw new Error(json?.error || "Failed to upload image(s).");
    }
    return Array.isArray(json?.urls)
      ? json.urls.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [];
  }

  async function useSplitCropsInShopifyPush() {
    setSplitSendingToPush(true);
    setError(null);
    try {
      const readySelectedItems = selectedCatalogImagesRef.current.filter(
        (img) => !img.uploading && !img.uploadError && Boolean((img.uploadedUrl || img.url || "").trim())
      );

      const splitPool = selectedSplitKeys.length
        ? splitCrops.filter((crop) => selectedSplitKeys.includes(splitCropKey(crop)))
        : splitCrops;

      const selectedRows: PushQueueImage[] = readySelectedItems.map((img, idx) => ({
        id: `selected:${img.id}`,
        sourceImageId: `selected:${img.id}:${idx}`,
        mediaId: null,
        url: String(img.uploadedUrl || img.url || "").trim(),
        title: img.title || `Selected item ${idx + 1}`,
        source: "device_upload",
        altText: "",
        generatingAlt: false,
        deleting: false,
      }));

      const splitRows: PushQueueImage[] = [...splitPool]
        .sort((a, b) => a.poseNumber - b.poseNumber)
        .map((crop) => ({
          id: `split:${crop.poseNumber}:${crop.fileName}`,
          sourceImageId: `split:${crop.poseNumber}`,
          mediaId: null,
          url: `data:image/png;base64,${crop.imageBase64}`,
          title: crop.fileName,
          source: "generated_split" as const,
          altText: "",
          generatingAlt: false,
          deleting: false,
        }));

      // If user already chose Selected Items, those take priority.
      const pushRows = selectedRows.length ? selectedRows : splitRows;

      if (!pushRows.length) {
        throw new Error("No images are available for Shopify push.");
      }

      setPushImages((prev) => {
        const keep = prev.filter((img) => img.source === "shopify");
        const merged = [...keep, ...pushRows];
        const deduped = new Map<string, PushQueueImage>();
        merged.forEach((row) => {
          const key = `${row.id}::${row.url}`;
          if (!deduped.has(key)) deduped.set(key, row);
        });
        return [...deduped.values()];
      });

      const inferredBarcode =
        sanitizeBarcodeInput(itemBarcodeSaved).trim() ||
        extractBarcodeFromText(pushRows.map((row) => row.title).join(" "));
      if (inferredBarcode && isValidBarcode(inferredBarcode)) {
        setItemBarcode(inferredBarcode);
        setItemBarcodeSaved(inferredBarcode);
        setPushSearchQuery((prev) => (prev.trim() ? prev : inferredBarcode));
      }

      if (typeof window !== "undefined") {
        const transferPayload = {
          createdAt: Date.now(),
          barcode: inferredBarcode || "",
          images: pushRows.map((row) => ({
            id: row.id,
            sourceImageId: row.sourceImageId,
            url: row.url,
            title: row.title,
            altText: row.altText || "",
          })),
        };
        window.localStorage.setItem(PUSH_TRANSFER_STORAGE_KEY, JSON.stringify(transferPayload));
      }

      setStatus(`Prepared ${pushRows.length} image(s) for Shopify Push.`);

      if (!showOpsSections && typeof window !== "undefined") {
        window.location.href = "/studio/seo";
      }
    } catch (e: any) {
      setError(e?.message || "Failed to send split images to Shopify Push.");
    } finally {
      setSplitSendingToPush(false);
    }
  }

  async function splitToThreeByFour() {
    try {
      setError(null);
      const targetPanels = (approvedPanels.length ? approvedPanels : selectedPanels).filter(
        (panel) => Boolean(generatedPanels[panel])
      );
      if (!targetPanels.length) {
        throw new Error("No existing generated panels available to split (split never regenerates).");
      }

      const selectedModel = models.find((m) => m.model_id === selectedModelId);
      const gender = selectedModel?.gender || "female";
      const barcode = itemBarcodeSaved.trim();
      const allCrops: SplitCrop[] = [];
      for (const panel of targetPanels.sort((a, b) => a - b)) {
        const b64 = generatedPanels[panel];
        if (!b64) continue;
        const crops = await splitPanelToThreeByFour(panel, b64);
        const leftMeta = buildSplitFileName(panel, "left", gender, barcode);
        const rightMeta = buildSplitFileName(panel, "right", gender, barcode);
        allCrops.push(
          {
            panel,
            side: "left",
            poseNumber: leftMeta.poseNumber,
            fileName: leftMeta.fileName,
            imageBase64: crops.left,
          },
          {
            panel,
            side: "right",
            poseNumber: rightMeta.poseNumber,
            fileName: rightMeta.fileName,
            imageBase64: crops.right,
          }
        );
      }
      setSplitCrops(allCrops);
      setStatus(`Split complete (local crop only). ${allCrops.length} crop image(s) ready to download.`);
    } catch (e: any) {
      setError(e?.message || "Split failed");
      setStatus(null);
    }
  }

  function downloadSplitCrop(crop: SplitCrop) {
    downloadBase64Png(crop.fileName, crop.imageBase64);
  }

  function downloadAllSplitCrops() {
    if (!splitCrops.length) {
      setError("No split crops available to download.");
      return;
    }
    splitCrops.forEach((crop) => downloadSplitCrop(crop));
    setError(null);
    setStatus(`Downloading ${splitCrops.length} crop image(s).`);
  }

  function splitCropKey(crop: SplitCrop) {
    return `${crop.panel}:${crop.side}`;
  }

  function toggleSplitCropSelection(crop: SplitCrop) {
    const key = splitCropKey(crop);
    setSelectedSplitKeys((prev) =>
      prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]
    );
  }

  function downloadSelectedSplitCrops() {
    const selected = splitCrops.filter((crop) => selectedSplitKeys.includes(splitCropKey(crop)));
    if (!selected.length) {
      setError("No selected split crops to download.");
      return;
    }
    selected.forEach((crop) => downloadSplitCrop(crop));
    setError(null);
    setStatus(`Downloading ${selected.length} selected crop image(s).`);
  }

  async function loadFinalResultUploads() {
    setFinalResultsVisible(true);
    setFinalResultsLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/storage/list?prefix=final-results", { cache: "no-store" });
      const json = await parseJsonResponse(resp, "/api/storage/list?prefix=final-results");
      if (!resp.ok) throw new Error(json?.error || "Failed to load previous items.");
      const rows = Array.isArray(json?.files) ? json.files : [];
      const mapped: FinalResultUpload[] = rows
        .map((row: any) => {
          const path = String(row?.path || "").trim();
          const fileName = path.split("/").pop() || path;
          return {
            id: path || `final-result:${crypto.randomUUID()}`,
            path,
            fileName,
            uploadedAt: row?.uploadedAt ? String(row.uploadedAt) : null,
            url: row?.url ? String(row.url) : null,
            previewUrl: row?.url ? String(row.url) : null,
          };
        })
        .filter((row: FinalResultUpload) => row.path.startsWith("final-results/"))
        .sort((a: FinalResultUpload, b: FinalResultUpload) => {
          const ta = a.uploadedAt ? Date.parse(a.uploadedAt) : Number.NaN;
          const tb = b.uploadedAt ? Date.parse(b.uploadedAt) : Number.NaN;
          const safeA = Number.isFinite(ta) ? ta : 0;
          const safeB = Number.isFinite(tb) ? tb : 0;
          return safeB - safeA;
        });
      setFinalResultUploads(mapped);
      setSelectedFinalResultUploadIds([]);
      setStatus(`Loaded ${mapped.length} previous final result item(s).`);
    } catch (e: any) {
      setError(e?.message || "Failed to load previous items.");
    } finally {
      setFinalResultsLoading(false);
    }
  }

  async function toggleFinalResultUploadsVisibility() {
    if (finalResultsVisible) {
      setFinalResultsVisible(false);
      return;
    }
    await loadFinalResultUploads();
  }

  function toggleFinalResultUploadSelection(id: string) {
    setSelectedFinalResultUploadIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  }

  function addSelectedFinalResultsToShopifyPush() {
    const selected = finalResultUploads.filter((file) => selectedFinalResultUploadIds.includes(file.id));
    if (!selected.length) {
      setError("Select previous items first.");
      return;
    }

    const nextRows: SelectedCatalogImage[] = selected.reduce((acc: SelectedCatalogImage[], file) => {
        const imageUrl = String(file.url || file.previewUrl || "").trim();
        if (!imageUrl) return acc;
        acc.push({
          id: `final-upload:${file.id}`,
          url: imageUrl,
          title: file.fileName || "Final result item",
          source: "final_results_storage",
          uploadedUrl: imageUrl,
          uploading: false,
          uploadError: null,
        });
        return acc;
      }, []);

    if (!nextRows.length) {
      setError("Selected files do not have usable image URLs.");
      return;
    }

    const pushRows: PushQueueImage[] = nextRows.map((row, idx) => ({
      id: `final-push:${row.id}`,
      sourceImageId: `final-results:${idx}:${row.id}`,
      mediaId: null,
      url: String(row.uploadedUrl || row.url || "").trim(),
      title: row.title || "Final result item",
      source: "device_upload",
      altText: "",
      generatingAlt: false,
      deleting: false,
    }));

    setPushImages((prev) => {
      const merged = [...prev, ...pushRows];
      const deduped = new Map<string, PushQueueImage>();
      merged.forEach((img) => {
        const key = `${img.id}::${img.url}`;
        if (!deduped.has(key)) deduped.set(key, img);
      });
      return [...deduped.values()];
    });

    const inferredBarcode =
      sanitizeBarcodeInput(itemBarcodeSaved).trim() ||
      extractBarcodeFromText(selected.map((row) => `${row.fileName} ${row.path}`).join(" "));
    if (inferredBarcode && isValidBarcode(inferredBarcode)) {
      setItemBarcode(inferredBarcode);
      setItemBarcodeSaved(inferredBarcode);
      setPushSearchQuery((prev) => (prev.trim() ? prev : inferredBarcode));
    }

    setError(null);
    setStatus(`Added ${pushRows.length} previous item(s) to Shopify Push.`);
  }

  async function saveFinalResultsToStorage() {
    const splitFiles = splitCrops.map((crop) => base64ToFile(crop.imageBase64, crop.fileName));
    const extraFiles = [...finalResultFiles];
    if (!splitFiles.length && !extraFiles.length) {
      setError("No final result images to save.");
      return;
    }

    setSavingFinalResults(true);
    setError(null);
    try {
      const splitUrls = splitFiles.length
        ? await uploadFilesToItemsBucket(splitFiles, "final-results/split")
        : [];
      const extraUrls = extraFiles.length
        ? await uploadFilesToItemsBucket(extraFiles, "final-results/manual")
        : [];

      if (splitUrls.length) {
        setSplitCrops((prev) =>
          prev.map((crop, idx) => ({
            ...crop,
            uploadedUrl: splitUrls[idx] || crop.uploadedUrl || null,
          }))
        );
      }

      const savedCount = splitUrls.length + extraUrls.length;
      setStatus(`Saved ${savedCount} final result image(s) to storage.`);
      if (extraUrls.length) {
        setFinalResultFiles([]);
      }
      await loadFinalResultUploads();
    } catch (e: any) {
      setError(e?.message || "Failed to save final results.");
    } finally {
      setSavingFinalResults(false);
    }
  }

  async function emptyFinalResultsStorage() {
    const ok = window.confirm(
      "This will permanently delete final result files uploaded from this section. Continue?"
    );
    if (!ok) return;

    setEmptyingFinalResults(true);
    setError(null);
    try {
      const resp = await fetch("/api/storage/empty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "final-results" }),
      });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to empty final results storage.");
      setFinalResultUploads([]);
      setStatus(`Final results storage emptied. Deleted ${json?.deleted ?? 0} file(s).`);
    } catch (e: any) {
      setError(e?.message || "Failed to empty final results storage.");
    } finally {
      setEmptyingFinalResults(false);
    }
  }

  async function handleFinalResultFilesSelected(files: File[]) {
    if (!files.length) return;
    setFinalResultFiles((prev) => mergeUniqueFiles(prev, files));
    setStatus(`Added ${files.length} file(s) to Final Results queue.`);
    setError(null);
  }

  function removeFinalResultFileAt(index: number) {
    setFinalResultFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function buildAutoDialogPromptFromError(rawError: string) {
    const normalized = String(rawError || "").replace(/\s+/g, " ").trim();
    const clipped = normalized.length > 1200 ? `${normalized.slice(0, 1200)}...` : normalized;
    return `what is the reason i got these errors: ${clipped}`;
  }

  function appendGenerateRawResponse(payload: string) {
    const clean = String(payload || "").trim();
    if (!clean) return;
    setGenerateOpenAiResponse((prev) => {
      const next = prev ? `${prev}\n\n---\n${clean}` : clean;
      setDialogInput(buildAutoDialogPromptFromError(next));
      setChatNeedsAttention(true);
      return next;
    });
  }

  function buildDialogGenerationContextSummary() {
    const selectedModel = models.find((m) => m.model_id === selectedModelId);
    const selectedPanelsSorted = uniqueSortedPanels(selectedPanels);
    const approvedPanelsSorted = uniqueSortedPanels(approvedPanels);
    const generatedPanelNumbers = Object.keys(generatedPanels)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    const catalogUploadingCount = selectedCatalogImages.filter((img) => img.uploading).length;
    const catalogFailedCount = selectedCatalogImages.filter((img) => Boolean(img.uploadError)).length;
    const recentItemRefs = itemReferenceUrls.slice(-10);
    const normalizedStyleNotes = normalizePromptInstruction(itemStyleInstructions);
    const normalizedRegenNotes = normalizePromptInstruction(regenerationComments);

    return [
      `Selected model: ${selectedModel ? `${selectedModel.name} (${selectedModel.gender})` : "none"}`,
      `Item type (section 0.5): ${resolvedItemType || itemType || "not set"}`,
      `Saved barcode: ${itemBarcodeSaved || "not set"}`,
      `Saved item references count: ${itemReferenceUrls.length}`,
      `Pending device item files: ${itemFiles.length}`,
      `Selected cloud/catalog refs: ${selectedCatalogImages.length} (uploading: ${catalogUploadingCount}, failed: ${catalogFailedCount})`,
      `Selected panels: ${selectedPanelsSorted.length ? selectedPanelsSorted.join(", ") : "none"}`,
      `Panels currently generating: ${panelsInFlight.length ? panelsInFlight.join(", ") : "none"}`,
      `Generated panels available: ${generatedPanelNumbers.length ? generatedPanelNumbers.join(", ") : "none"}`,
      `Approved panels: ${approvedPanelsSorted.length ? approvedPanelsSorted.join(", ") : "none"}`,
      status ? `Latest status: ${status}` : "",
      error ? `Latest workspace error: ${error}` : "",
      normalizedStyleNotes ? `Item style instructions: ${normalizedStyleNotes}` : "",
      normalizedRegenNotes ? `Regeneration comments: ${normalizedRegenNotes}` : "",
      recentItemRefs.length ? `Recent item ref URLs: ${recentItemRefs.join(" | ")}` : "",
    ]
      .filter((line) => Boolean(line))
      .join("\n");
  }

  async function sendDialogMessage() {
    const text = dialogInput.trim();
    if (!text || dialogLoading) return;
    const next = [...dialogMessages, { role: "user" as const, content: text }];
    setDialogMessages(next);
    setDialogInput("");
    setChatNeedsAttention(false);
    setDialogLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/openai/dialog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          contextError: generateOpenAiResponse || "",
          contextSummary: buildDialogGenerationContextSummary(),
          contextScope: "studio_generation",
        }),
      });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) {
        const exact = json?.openaiRaw ?? json?.details ?? json;
        const exactText =
          typeof exact === "string" ? exact : JSON.stringify(exact, null, 2);
        setGenerateOpenAiResponse(exactText);
        throw new Error(json?.error || "OpenAI dialog failed");
      }
      const reply = typeof json?.reply === "string" ? json.reply : "";
      setDialogMessages((prev) => [...prev, { role: "assistant", content: reply || "(No response text)" }]);
    } catch (e: any) {
      setError(e?.message || "OpenAI dialog failed");
    } finally {
      setDialogLoading(false);
    }
  }

  async function copyErrorPayload() {
    try {
      const payload = generateOpenAiResponse || "";
      if (!payload.trim()) {
        setError("No error payload to copy.");
        return;
      }
      await navigator.clipboard.writeText(payload);
      setError(null);
      setStatus("Copied OpenAI error payload to clipboard.");
    } catch {
      setError("Failed to copy payload to clipboard.");
    }
  }

  function clearDialogChat() {
    setDialogMessages([]);
    setDialogInput("");
    setChatNeedsAttention(false);
    setStatus("Chat cleared.");
    setError(null);
  }

  const showCreativeSections = mode === "all" || mode === "images";
  const showOpsSections = mode === "all" || mode === "ops-seo";

  useEffect(() => {
    if (!showCreativeSections && chatExpanded) {
      setChatExpanded(false);
    }
  }, [showCreativeSections, chatExpanded]);

  useEffect(() => {
    const pageNode = pageRef.current;
    if (!pageNode) return;

    const contentNode = pageNode.closest(".content");
    const shellNode = pageNode.closest(".shell");
    const expanded = showCreativeSections && chatExpanded;

    if (contentNode) contentNode.classList.toggle("chat-expanded", expanded);
    if (shellNode) shellNode.classList.toggle("chat-expanded", expanded);

    return () => {
      if (contentNode) contentNode.classList.remove("chat-expanded");
      if (shellNode) shellNode.classList.remove("chat-expanded");
    };
  }, [chatExpanded, showCreativeSections]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const node = statusBarRef.current;
    if (!node) return;

    const sync = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setStatusBarHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    sync();
    let ro: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(() => sync());
      ro.observe(node);
    }
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    const logs = [inlineChatLogRef.current, sideChatLogRef.current];
    for (const node of logs) {
      if (!node) continue;
      node.scrollTop = node.scrollHeight;
    }
  }, [dialogMessages, dialogLoading]);

  const modelUploadCompleted = modelPreviewItems.filter((p) => Boolean(p.uploadedUrl)).length;
  const modelUploadTarget = modelPreviewItems.length || modelUploadTotal;
  const activeProgress: string[] = [];

  if (modelUploading || modelUploadPending > 0) {
    activeProgress.push(
      `Model uploads: ${modelUploadCompleted}/${modelUploadTarget || modelUploadCompleted || 0}`
    );
  }
  if (panelGenerating || panelsInFlight.length > 0) {
    activeProgress.push("Image generation in progress");
  }
  if (dropboxSearching) {
    activeProgress.push("Searching Dropbox");
  }
  if (catalogLoading || pushCatalogLoading) {
    activeProgress.push("Loading Shopify catalog");
  }
  if (pushUploading || pushingImages || splitSendingToPush) {
    activeProgress.push("Pushing images to Shopify");
  }
  if (savingFinalResults) {
    activeProgress.push("Saving final results");
  }
  if (finalResultsLoading) {
    activeProgress.push("Loading previous items");
  }
  if (emptyingFinalResults) {
    activeProgress.push("Emptying final results storage");
  }
  if (emptyingBucket) {
    activeProgress.push("Emptying storage");
  }

  const statusTone: "error" | "working" | "success" | "idle" = error
    ? "error"
    : activeProgress.length
      ? "working"
      : status
        ? "success"
        : "idle";
  const statusHeadline =
    error ||
    status ||
    (statusTone === "working"
      ? "Action in progress..."
      : "Ready. Start from Model Registry or Item References.");
  const isGeneratingNow = panelGenerating || panelsInFlight.length > 0;
  const generationStage = useMemo(() => {
    if (!isGeneratingNow) return null;
    const elapsedSeconds = Math.max(0, Math.floor(generationElapsedMs / 1000));
    let stage = GENERATION_STAGES[0];
    for (const candidate of GENERATION_STAGES) {
      if (elapsedSeconds >= candidate.at) stage = candidate;
    }
    return stage;
  }, [generationElapsedMs, isGeneratingNow]);
  const generationElapsedLabel = formatElapsedStopwatch(generationElapsedMs);
  const hasRawOpenAiResponse = Boolean(generateOpenAiResponse && generateOpenAiResponse.trim());

  function onStatusBarCopyRawResponse() {
    if (!hasRawOpenAiResponse) return;
    void copyErrorPayload();
  }

  const pageStyle = {
    ["--status-bar-height" as string]: `${statusBarHeight}px`,
  } as CSSProperties;

  return (
    <div
      ref={pageRef}
      className={`page ${workspaceHydrated ? "is-hydrated" : "is-hydrating"}`}
      style={pageStyle}
    >
      {pickerMaskVisible ? (
        <div className="picker-transition-mask" aria-hidden>
          <span className="picker-transition-label">Preparing upload...</span>
        </div>
      ) : null}
      <section
        ref={statusBarRef}
        className={`card status-bar ${statusTone} ${hasRawOpenAiResponse ? "copy-ready" : ""}`}
        aria-live="polite"
        aria-atomic="true"
        role={hasRawOpenAiResponse ? "button" : undefined}
        tabIndex={hasRawOpenAiResponse ? 0 : undefined}
        onClick={hasRawOpenAiResponse ? onStatusBarCopyRawResponse : undefined}
        onKeyDown={
          hasRawOpenAiResponse
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onStatusBarCopyRawResponse();
                }
              }
            : undefined
        }
      >
        <div className="status-bar-head">
          <div className="status-bar-title">prgress bar</div>
          <span className={`status-chip ${statusTone}`}>
            {statusTone === "error"
              ? "Error"
              : statusTone === "working"
                ? "Working"
                : statusTone === "success"
                  ? "Done"
                  : "Idle"}
          </span>
        </div>
        <div className="status-bar-message">
          {statusTone === "error" ? `Error: ${statusHeadline}` : statusHeadline}
        </div>
        {isGeneratingNow && generationStage ? (
          <div className="status-generation">
            <div className="status-generation-logo-wrap">
              <img
                src={progressLogoSrc}
                alt="Generation logo"
                className="status-generation-logo"
                onError={() =>
                  setProgressLogoSrc((prev) => (prev === "/logo.svg" ? "/logo.jpg" : prev))
                }
              />
            </div>
            <div className="status-generation-text">
              <div className="status-generation-stage">{generationStage.text}</div>
              <div className="status-generation-sub">{generationStage.sub}</div>
            </div>
            <div className="status-generation-time">{generationElapsedLabel}</div>
          </div>
        ) : null}
        {hasRawOpenAiResponse ? (
          <div className="status-bar-meta">OpenAI error found. Click this bar to copy raw response for AI Chat.</div>
        ) : activeProgress.length ? (
          <div className="status-bar-meta">{activeProgress.join(" | ")}</div>
        ) : null}
      </section>

      <main className="grid">
        {showCreativeSections ? (
          <>
        <section className="card">
          <div className="model-registry-header">
            <div className="card-title">Model Registry</div>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => setModelRegistryCollapsed((prev) => !prev)}
            >
              {modelRegistryCollapsed ? "Show Registry" : "Done and Hide"}
            </button>
          </div>
          {!modelRegistryCollapsed ? (
            <>
          <p className="muted">Upload a model profile.</p>
          <div className="row">
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Model name (e.g., Sarah)"
            />
            <select
              value={modelGender}
              onChange={(e) => setModelGender(e.target.value)}
            >
              <option value="">Gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>
          <div
            className="dropzone"
            data-integration-anchor="model-dropzone"
            role="button"
            tabIndex={0}
            onClick={() => openInputPickerWithMask(modelPickerRef.current)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const filtered = await extractImagesFromDrop(e);
              if (filtered.length) {
                setModelFiles(filtered);
                handleModelFilesSelected(filtered);
              }
            }}
          >
            <div>Drag & drop a folder (or images) here</div>
            <div className="muted">Click to select from your device. Only image files are used</div>
          </div>
          <input
            ref={modelPickerRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const filtered = filterImages(e.target.files || []);
              setModelFiles(filtered);
              handleModelFilesSelected(filtered);
            }}
          />
          <input
            ref={modelFolderRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const filtered = filterImages(e.target.files || []);
              setModelFiles(filtered);
              handleModelFilesSelected(filtered);
            }}
          />
          <div className="picker-row">
            <button
              className="ghost-btn"
              type="button"
              onClick={() => openInputPickerWithMask(modelPickerRef.current)}
            >
              Choose files
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => openInputPickerWithMask(modelFolderRef.current)}
            >
              Choose folder
            </button>
          </div>
          <div className="model-selected-area">
            <div className="model-selected-header">
              <div className="card-title">Selected Pictures</div>
              <div className="muted">
                {modelPreviewItems.length
                  ? `${modelPreviewItems.length} files ready`
                  : "No files selected"}
              </div>
            </div>
            {modelPreviewItems.length ? (
              <div className="preview-grid model-registry-grid">
                {modelPreviewItems.map((file) => (
                  <div className="preview-card model-registry-preview-card" key={file.id}>
                    <img className="model-registry-preview-image" src={file.localUrl} alt={file.name} />
                    {file.uploadedUrl ? (
                      <button
                        className="preview-remove"
                        onClick={() => removeModelUpload(file)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted centered">Selected pictures will appear here.</div>
            )}
          </div>
          <div className="row">
            <button className="btn ghost" type="button" onClick={onPreviousUploadsPrimaryAction}>
              {previousUploadsVisible
                ? "Hide Previous Uploads"
                : "Load Previous Model"}
            </button>
            <button
              className="ghost-btn danger match-load-font"
              type="button"
              onClick={emptyBucket}
              disabled={emptyingBucket}
            >
              {emptyingBucket ? "Emptying Storage..." : "Empty Storage"}
            </button>
          </div>
          <div className="row">
            <button className="btn" onClick={createModel}>
              Save Model
            </button>
          </div>
          {(modelUploading || modelPreviewItems.some((p) => !p.uploadedUrl)) && (
            <div className="muted centered">
              Uploading{" "}
              {modelPreviewItems.filter((p) => p.uploadedUrl).length}/
              {modelPreviewItems.length || modelUploadTotal}
            </div>
          )}
            </>
          ) : null}
          {!modelRegistryCollapsed ? (
            <div className="muted centered">
              Registry: {models.length} model{models.length === 1 ? "" : "s"}
            </div>
          ) : null}
          {!modelRegistryCollapsed && previousUploadsVisible ? (
            <div className="card">
              <div className="card-title">Previous Uploads (Model Registry)</div>
              <p className="muted">
                Shows model images uploaded from this section only. Duplicate files are merged and
                only the latest upload is shown once. Click any image to add it directly to Model
                Registry.
              </p>
              <div className="row">
                <select
                  value={previousSort}
                  onChange={(e) =>
                    setPreviousSort(e.target.value as "date_asc" | "date_desc" | "name_az")
                  }
                >
                  <option value="date_asc">Date (Oldest first)</option>
                  <option value="date_desc">Date (Newest first)</option>
                  <option value="name_az">Name (A-Z)</option>
                </select>
                <select
                  value={previousGenderFilter}
                  onChange={(e) =>
                    setPreviousGenderFilter(
                      e.target.value as "all" | "female" | "male"
                    )
                  }
                >
                  <option value="all">All genders</option>
                  <option value="female">Female only</option>
                  <option value="male">Male only</option>
                </select>
              </div>
              {previousModelUploadsLoading ? (
                <div className="muted centered">Loading previous uploads...</div>
              ) : sortedPreviousModelUploads.length ? (
                <div className="preview-grid previous-upload-grid">
                  {sortedPreviousModelUploads.map((file) => {
                    const selected = addedPreviousPaths.has(file.path);
                    return (
                      <div
                        key={file.id}
                        className={`preview-card previous-upload-card selectable ${
                          selected ? "selected" : ""
                        }`}
                        onClick={() => addPreviousUploadToRegistry(file)}
                      >
                        {file.previewUrl && !brokenPreviousUploadIds.includes(file.id) ? (
                          <img
                            className="previous-upload-image"
                            src={file.previewUrl}
                            alt="Previous upload preview"
                            onError={() =>
                              setBrokenPreviousUploadIds((prev) =>
                                prev.includes(file.id) ? prev : [...prev, file.id]
                              )
                            }
                          />
                        ) : (
                          <div className="muted centered">Preview unavailable</div>
                        )}
                        <div className="preview-name">{selected ? "Added" : "Click to add"}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="muted centered">No previous uploads found.</div>
              )}
            </div>
          ) : null}
          {models.length ? (
            <div className="model-list">
              {models.map((m) => (
                <div className="model-pill" key={m.model_id}>
                  <div className="model-info">
                    <span className="model-name">{m.name}</span>
                    <span className="model-meta">{m.gender}</span>
                  </div>
                  <button
                    className="model-remove"
                    type="button"
                    onClick={() => removeModel(m.model_id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted centered">No models yet.</div>
          )}
          {!modelRegistryCollapsed ? (
            <div className="centered">
              <button className="ghost-btn danger" type="button" onClick={resetModels}>
                Reset all models
              </button>
            </div>
          ) : null}
        </section>

        <section className="card">
          <div className="card-title">Item References</div>
          <p className="muted">
            Choose image source: upload from device/cloud apps or import existing product images from
            Shopify.
          </p>
          <div className="row">
            <input
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              placeholder="Clothing type"
            />
            <textarea
              value={itemStyleInstructions}
              onChange={(e) => setItemStyleInstructions(e.target.value)}
              placeholder="Optional - extra styling instruction for accuracy"
            />
          </div>
          <div className="row">
            <input
              value={itemBarcode}
              onChange={(e) => setItemBarcode(sanitizeBarcodeInput(e.target.value))}
              placeholder="Item barcode (required: 7-9 digits, or C + 6-8 digits)"
            />
            <button
              className="btn ghost mobile-only-control mobile-camera-trigger"
              type="button"
              onClick={openBarcodeScanner}
              disabled={barcodeScannerBusy}
            >
              <span className="camera-btn-inner">
                <svg
                  className="camera-btn-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 7h4l1.3-2h5.4L16 7h4v12H4z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>{barcodeScannerBusy ? "Opening..." : "Scan"}</span>
              </span>
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={saveItemBarcode}
              disabled={!isValidBarcode(itemBarcode)}
            >
              Save Barcode
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={searchDropboxByBarcode}
              disabled={
                dropboxSearching ||
                !isValidBarcode(sanitizeBarcodeInput(itemBarcode).trim() || itemBarcodeSaved.trim())
              }
            >
              {dropboxSearching
                ? "Searching Dropbox..."
                : dropboxListVisible && (dropboxResults.length > 0 || dropboxFolderResults.length > 0)
                  ? "Hide Dropbox List"
                  : "Search Dropbox by Barcode"}
            </button>
          </div>
          {barcodeScannerOpen ? (
            <div className="barcode-scanner-overlay" role="dialog" aria-modal="true">
              <div className="barcode-scanner-card">
                <div className="barcode-scanner-head">
                  <div className="card-title">Scan Barcode</div>
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={() => setBarcodeScannerOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="barcode-scanner-frame">
                  <video
                    ref={barcodeScannerVideoRef}
                    className="barcode-scanner-video"
                    playsInline
                    muted
                    autoPlay
                  />
                  <div className="barcode-scanner-guide" aria-hidden>
                    <div className="barcode-scanner-guide-box" />
                  </div>
                </div>
                <div className="muted centered">
                  Align Code128 barcode inside the frame.
                </div>
                {barcodeScannerError ? (
                  <div className="barcode-scanner-error">{barcodeScannerError}</div>
                ) : null}
              </div>
            </div>
          ) : null}
          {itemBarcodeSaved ? (
            <div className="barcode-chip-row">
              <span className="barcode-chip">Saved barcode: {itemBarcodeSaved}</span>
              <button className="barcode-chip-remove" type="button" onClick={clearSavedItemBarcode}>
                X
              </button>
            </div>
          ) : null}
          <div className="muted centered">
            Dropbox: {dropboxConnected ? "Connected" : "Not connected"}
            {dropboxEmail ? ` (${dropboxEmail})` : ""}
            {!dropboxConnected ? " - connect from Settings." : ""}
          </div>
          {dropboxSearched && !dropboxSearching && !dropboxResults.length ? (
            <div className="muted centered">No Dropbox images found for this barcode.</div>
          ) : null}
          {dropboxListVisible && dropboxFolderResults.length ? (
            <div className="card">
              <div className="card-title">Dropbox Matched Folders</div>
              <div className="dropbox-folder-list">
                {dropboxFolderResults.map((folder) => (
                  <div className="dropbox-folder-row" key={folder.folderPath}>
                    <span className="muted">{folder.folderPath}</span>
                    <a className="ghost-btn" href={folder.webUrl} target="_blank" rel="noreferrer">
                      Open In Dropbox
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {dropboxListVisible && dropboxResults.length ? (
            <div className="preview-grid item-catalog-grid">
              {dropboxResults.map((img) => {
                const selected = selectedCatalogImages.some((i) => i.id === `dropbox:${img.id}`);
                return (
                  <button
                    key={`dropbox-${img.id}`}
                    type="button"
                    className={`catalog-image ${selected ? "selected" : ""}`}
                    onClick={() => selectDropboxImage(img)}
                  >
                    <img src={img.temporaryLink} alt={img.title || "Dropbox image"} />
                    <span>{selected ? "Selected" : "Select from Dropbox"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="source-note muted">
            You can combine both sources: upload from device and select from Shopify catalog.
          </div>
          <div
            className="dropzone"
            role="button"
            tabIndex={0}
            onClick={() => openInputPickerWithMask(itemPickerRef.current)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const filtered = await extractImagesFromDrop(e);
              if (filtered.length) setItemFiles((prev) => mergeUniqueFiles(prev, filtered));
            }}
          >
            <div>Drag & drop a folder (or images) here</div>
            <div className="muted">Click to select from your device. Only image files are used</div>
          </div>
          <input
            ref={itemPickerRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) =>
              setItemFiles((prev) => mergeUniqueFiles(prev, filterImages(e.target.files || [])))
            }
          />
          <input
            ref={itemFolderRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) =>
              setItemFiles((prev) => mergeUniqueFiles(prev, filterImages(e.target.files || [])))
            }
          />
          <input
            ref={itemCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const filtered = filterImages(e.target.files || []);
              if (filtered.length) {
                setItemFiles((prev) => mergeUniqueFiles(prev, filtered));
              }
              e.currentTarget.value = "";
            }}
          />
          <div className="picker-row">
            <button
              className="ghost-btn"
              type="button"
              onClick={() => openInputPickerWithMask(itemPickerRef.current)}
            >
              Choose files
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => openInputPickerWithMask(itemFolderRef.current)}
            >
              Choose folder
            </button>
            <button
              className="ghost-btn mobile-only-control mobile-camera-trigger"
              type="button"
              onClick={() => openInputPickerWithMask(itemCameraRef.current)}
            >
              <span className="camera-btn-inner">
                <svg
                  className="camera-btn-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 7h4l1.3-2h5.4L16 7h4v12H4z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Camera</span>
              </span>
            </button>
          </div>
          <div className="model-selected-area item-selected-area">
            <div className="model-selected-header">
              <div className="card-title">Selected Pictures</div>
              <div className="muted">
                {itemFiles.length ? `${itemFiles.length} device files ready` : "No device files selected"} |{" "}
                {selectedCatalogImages.length
                  ? `${selectedCatalogImages.length} cloud/catalog images selected`
                  : "No cloud/catalog images selected"}
                {selectedCatalogImages.some((img) => img.uploading)
                  ? ` | ${selectedCatalogImages.filter((img) => img.uploading).length} uploading`
                  : ""}
                {itemUploadCount ? ` | Last upload: ${itemUploadCount} files` : ""}
              </div>
            </div>
            {!itemPreviews.length && !selectedCatalogImages.length ? (
              <div className="muted centered">Selected pictures will appear here.</div>
            ) : null}
            {itemPreviews.length ? (
              <div className="preview-grid item-selected-grid">
                {itemPreviews.map((file, idx) => (
                  <div className="preview-card" key={file.url}>
                    <button
                      type="button"
                      className="preview-remove-corner"
                      onClick={() => removeItemFileAt(idx)}
                      aria-label={`Remove ${file.name}`}
                    >
                      X
                    </button>
                    <img src={file.url} alt={file.name} />
                    <div className="preview-name">{file.name}</div>
                    <div className="preview-source">Source: Device upload</div>
                  </div>
                ))}
              </div>
            ) : null}
            {selectedCatalogImages.length ? (
              <div className="preview-grid item-selected-grid">
                {selectedCatalogImages.map((img) => (
                  <div className="preview-card item-catalog-selected-card" key={img.id}>
                    <button
                      type="button"
                      className="preview-remove-corner"
                      onClick={() => removeCatalogSelection(img.id)}
                      aria-label={`Remove ${img.title}`}
                    >
                      X
                    </button>
                    <img className="item-catalog-selected-image" src={img.url} alt={img.title} />
                    <div className="preview-name">
                      {img.uploading
                        ? "Uploading..."
                        : img.uploadError
                          ? "Upload failed (click product image to retry)"
                          : "Ready"}
                    </div>
                    <div className="preview-source">
                      Source:{" "}
                      {img.source === "dropbox"
                        ? "Dropbox"
                        : img.source === "generated_flat"
                          ? "Generated flat (3:4)"
                          : img.source === "final_results_storage"
                            ? "Final Results (storage)"
                          : "Shopify catalog"}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={generateFlatFrontBackFromItemRefs}
              disabled={itemFlatGenerating}
            >
              {itemFlatGenerating ? "Generating Front + Back..." : "Generate Flat Front + Back"}
            </button>
          </div>
          <div className="catalog-wrap">
              <div className="row">
                <input
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  onKeyDown={onCatalogSearchKeyDown}
                  placeholder="Search products (title, handle, SKU)"
                />
                <button className="btn ghost" type="button" onClick={() => loadCatalogImages()}>
                  {catalogLoading ? "Loading..." : "Search Catalog"}
                </button>
              </div>
              {catalogSearched && !catalogResultsHidden ? (
                <div className="row">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => setCatalogResultsHidden(true)}
                  >
                    Hide Catalog
                  </button>
                </div>
              ) : null}
              {!shop.trim() && (
                <div className="muted centered">
                  Enter your shop domain above to browse Shopify catalog images.
                </div>
              )}
              {shop.trim() && !catalogSearched && (
                <div className="muted centered">
                  Search by product name/handle, or leave search empty to browse 10 products per page.
                </div>
              )}
              {shop.trim() && catalogSearched && catalogResultsHidden ? (
                <div className="muted centered">
                  Catalog hidden. Click Search Catalog to show it again.
                </div>
              ) : null}
              {shop.trim() && catalogSearched && !catalogResultsHidden && !catalogLoading && !catalogProducts.length && (
                <div className="muted centered">No matching catalog products with images found.</div>
              )}
              {showCatalogPagination ? (
                <div className="catalog-pagination">
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={loadCatalogPreviousPage}
                    disabled={catalogLoading || catalogPage <= 1}
                  >
                    {"<-"}
                  </button>
                  <div className="muted centered">
                    Page {catalogPage} / {catalogTotalPages}
                  </div>
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={loadCatalogNextPage}
                    disabled={catalogLoading || !catalogHasNextPage}
                  >
                    {"->"}
                  </button>
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={loadCatalogFirstPage}
                    disabled={catalogLoading || catalogPage === 1}
                  >
                    Back to page 1
                  </button>
                </div>
              ) : null}
              {!catalogResultsHidden && catalogProducts.length ? (
                <div className="catalog-products">
                  {visibleCatalogProducts.map((product) => (
                    <div className="catalog-product" key={product.id}>
                      <div className="catalog-title">
                        {product.title}
                        <span className="muted">
                          {" "}
                          ({product.handle}) | Barcode: {formatProductBarcodes(product)}
                        </span>
                      </div>
                      <div className="preview-grid item-catalog-grid">
                        {product.images.map((img) => {
                          const selectedEntry = selectedCatalogImages.find((i) => i.id === img.id);
                          const selected = Boolean(selectedEntry);
                          const loading = Boolean(selectedEntry?.uploading);
                          const failed = Boolean(selectedEntry?.uploadError);
                          return (
                            <button
                              key={img.id}
                              type="button"
                              className={`catalog-image ${selected ? "selected" : ""}`}
                              disabled={loading}
                              onClick={() =>
                                toggleCatalogImage({
                                  id: img.id,
                                  url: img.url,
                                  title: product.title,
                                  barcode: getPrimaryBarcode(product),
                                  source: "shopify",
                                })
                              }
                            >
                              <img src={img.url} alt={img.altText || product.title} />
                              <span>
                                {loading
                                  ? "Uploading..."
                                  : failed
                                    ? "Retry upload"
                                    : selected
                                      ? "Selected"
                                      : "Select"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {catalogSearched && !catalogResultsHidden ? (
                <div className="row">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => setCatalogResultsHidden(true)}
                  >
                    Hide Catalog
                  </button>
                </div>
              ) : null}
              {showCatalogPagination ? (
                <div className="catalog-pagination">
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={loadCatalogPreviousPage}
                    disabled={catalogLoading || catalogPage <= 1}
                  >
                    {"<-"}
                  </button>
                  <div className="muted centered">
                    Page {catalogPage} / {catalogTotalPages}
                  </div>
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={loadCatalogNextPage}
                    disabled={catalogLoading || !catalogHasNextPage}
                  >
                    {"->"}
                  </button>
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={loadCatalogFirstPage}
                    disabled={catalogLoading || catalogPage === 1}
                  >
                    Back to page 1
                  </button>
                </div>
              ) : null}
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={uploadItems}>
              Save Item References + Type
            </button>
          </div>
          {itemFlatSplitImages.length ? (
            <div className="card">
              <div className="card-title">Generated Flat 3:4 Split (Front + Back)</div>
              <div className="row">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={addAllFlatSplitsToSelectedItems}
                  disabled={
                    !itemFlatSplitImages.length ||
                    addingFlatSplitIds.length > 0 ||
                    itemFlatSplitImages.every((crop) =>
                      selectedCatalogImages.some((img) => img.id === crop.id && Boolean(img.uploadedUrl))
                    )
                  }
                >
                  Add Front + Back To Selected Items
                </button>
              </div>
              <div className="preview-grid item-flat-preview-grid">
                {itemFlatSplitImages.map((crop) => {
                  const selectedEntry = selectedCatalogImages.find((img) => img.id === crop.id);
                  const isAdding = addingFlatSplitIds.includes(crop.id) || Boolean(selectedEntry?.uploading);
                  const isAdded = Boolean(selectedEntry?.uploadedUrl);
                  return (
                    <div className="preview-card item-flat-split-card" key={crop.id}>
                      <img
                        className="item-flat-preview-image"
                        src={`data:image/png;base64,${crop.imageBase64}`}
                        alt={`Generated ${crop.side} flat 3:4`}
                        onClick={() =>
                          setPreviewModal({
                            imageBase64: crop.imageBase64,
                            title: `${crop.side === "front" ? "Front" : "Back"} 3:4 Flat Preview`,
                          })
                        }
                      />
                      <div className="preview-name">
                        {crop.side === "front" ? "Front" : "Back"} | 3:4
                      </div>
                    <button
                      className="ghost-btn"
                      type="button"
                        onClick={() => void addFlatSplitToSelectedItems(crop)}
                        disabled={isAdding || isAdded}
                      >
                        {isAdded ? "Added To Selected Items" : isAdding ? "Adding..." : "Add To Selected Items"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : itemFlatCompositeBase64 ? (
            <div className="card">
              <div className="card-title">Generated Item Flat (Front + Back)</div>
              <div className="preview-grid item-flat-preview-grid">
                <div className="preview-card item-flat-preview-card">
                  <img
                    className="item-flat-preview-image"
                    src={`data:image/png;base64,${itemFlatCompositeBase64}`}
                    alt="Generated item flat front and back side by side"
                    onClick={() =>
                      setPreviewModal({
                        imageBase64: itemFlatCompositeBase64,
                        title: "Item Flat Front + Back Preview",
                      })
                    }
                  />
                  <div className="preview-name">Front + Back flat ecommerce output</div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card">
          <div className="card-title">Image Generation</div>
          <p className="muted">
            Select a panel and generate. Approve or regenerate. Split into 3:4 crops after approval.
          </p>
          <div className="row">
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
            >
              <option value="">Select model for generation</option>
              {models.map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {m.name} ({m.gender})
                </option>
              ))}
            </select>
          </div>
          <div className="panel-row">
            {panels.map((panel) => {
              const selected = selectedPanels.includes(panel.id);
              const panelLabel = getPanelButtonLabel(
                selectedModelForGeneration?.gender || "female",
                panel.id
              );
              const unavailableForDress = isFemaleDressPanelBlocked(
                String(selectedModelForGeneration?.gender || ""),
                resolvedItemType,
                panel.id
              );
              return (
                <button
                  key={panel.id}
                  className={`pill ${selected ? "active" : ""} ${unavailableForDress ? "unavailable" : ""}`}
                  disabled={unavailableForDress}
                  onClick={() => {
                    setSelectedPanels((prev) => {
                      if (unavailableForDress) return prev;
                      const has = prev.includes(panel.id);
                      if (has) {
                        const next = prev.filter((id) => id !== panel.id);
                        return next.length ? next : [panel.id];
                      }
                      return [...prev, panel.id].sort((a, b) => a - b);
                    });
                  }}
                >
                  {unavailableForDress ? `Panel ${panel.id} (Not available for dress)` : panelLabel}
                </button>
              );
            })}
          </div>
          <div className="panel-selection-summary">
            Selected panels: {[...selectedPanels].sort((a, b) => a - b).join(", ")}.
            Generate runs exactly the selected panel(s).
          </div>
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={() =>
                setSelectedPanels(
                  [1, 2, 3, 4].filter(
                    (panelNumber) =>
                      !isFemaleDressPanelBlocked(
                        String(selectedModelForGeneration?.gender || ""),
                        resolvedItemType,
                        panelNumber
                      )
                  )
                )
              }
            >
              Select All Panels
            </button>
          </div>
          <div className="panel-preview-grid">
            {[...selectedPanels].sort((a, b) => a - b).map((panelNumber) => {
              const b64 = generatedPanels[panelNumber];
              return (
                <div className="panel-preview-card" key={panelNumber}>
                  <div className="panel-preview-label">Panel {panelNumber}</div>
                  <div className="panel-preview">
                    {b64 ? (
                      <img
                        src={`data:image/png;base64,${b64}`}
                        alt={`Generated panel ${panelNumber}`}
                        className="panel-image"
                        onClick={() =>
                          setPreviewModal({
                            imageBase64: b64,
                            title: `Panel ${panelNumber} Preview`,
                          })
                        }
                      />
                    ) : (
                      <>
                        <div className="frame">
                          {panelsInFlight.includes(panelNumber) ? "Generating..." : "LEFT"}
                        </div>
                        <div className="divider" />
                        <div className="frame">RIGHT</div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`pill ${approvedPanels.includes(panelNumber) ? "active" : ""}`}
                    onClick={() => toggleApprovedPanel(panelNumber)}
                    disabled={!b64}
                  >
                    {approvedPanels.includes(panelNumber)
                      ? `Approved Panel ${panelNumber}`
                      : `Approve Panel ${panelNumber}`}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="generation-actions-layout">
            <div className="generation-button-stack">
              <button
                className="btn"
                onClick={() => generatePanels("generate_selected")}
                disabled={panelGenerating}
              >
                {panelGenerating
                  ? "Generating..."
                  : `Generate Selected (${selectedPanels.length})`}
              </button>
              <button
                className="btn ghost"
                onClick={() => generatePanels("regenerate_selected")}
                disabled={panelGenerating}
              >
                {panelGenerating
                  ? "Generating..."
                  : `Regenerate Selected (${selectedPanels.length})`}
              </button>
            </div>
            <div className="generation-comments-wrap">
              <textarea
                value={regenerationComments}
                onChange={(e) => setRegenerationComments(e.target.value)}
                placeholder='Regeneration comments to improve accuracy (example: "make fit less oversized", "match logo placement exactly", "keep sleeves tighter").'
              />
              <div className="muted generation-comments-note">
                This note is used when you click Regenerate Selected.
              </div>
            </div>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={approveSelectedPanels}>
              Approve Selected
            </button>
            <button className="btn ghost" onClick={splitToThreeByFour}>
              Split to 3:4
            </button>
          </div>
          <div className="card chat-inline-fallback">
            <div className="chat-side-head">
              <div className="card-title">ChatGPT</div>
              <span className={`chat-side-status ${dialogLoading ? "loading" : "ready"}`}>
                {dialogLoading ? "WORKING" : "READY"}
              </span>
            </div>
            <p className="chat-side-sub">Ask about generation issues, failures, or workflow.</p>
            <div ref={inlineChatLogRef} className="dialog-log">
              {dialogMessages.length ? (
                dialogMessages.map((msg, idx) => (
                  <div key={`${msg.role}-${idx}`} className={`dialog-msg ${msg.role}`}>
                    <strong>{msg.role === "user" ? "You" : "ChatGPT"}:</strong> {msg.content}
                  </div>
                ))
              ) : (
                <div className="muted centered">How can I help you today?</div>
              )}
            </div>
            <div className="row">
              <input
                className={chatNeedsAttention ? "chat-input-attention" : ""}
                value={dialogInput}
                onChange={(e) => {
                  setDialogInput(e.target.value);
                  setChatNeedsAttention(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendDialogMessage();
                  }
                }}
                placeholder="Message ChatGPT..."
              />
              <div className="chat-side-buttons">
                <button
                  className="btn chat-send-btn"
                  type="button"
                  onClick={sendDialogMessage}
                  disabled={dialogLoading || !dialogInput.trim()}
                >
                  {dialogLoading ? "Sending..." : "Send"}
                </button>
                <button
                  className="btn ghost chat-clear-btn"
                  type="button"
                  onClick={clearDialogChat}
                  disabled={!dialogMessages.length && !dialogInput.trim()}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Final Results</div>
            <div className="row">
              <button className="btn ghost" onClick={downloadAllSplitCrops} disabled={!splitCrops.length}>
                Download All Splits
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={downloadSelectedSplitCrops}
                disabled={!selectedSplitKeys.length}
              >
                Download Selected
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={useSplitCropsInShopifyPush}
                disabled={
                  splitSendingToPush ||
                  (!splitCrops.length &&
                    !selectedCatalogImages.some(
                      (img) => !img.uploading && !img.uploadError && Boolean((img.uploadedUrl || img.url || "").trim())
                    ))
                }
              >
                {splitSendingToPush ? "Sending Splits..." : "Use Pictures In Shopify Push"}
              </button>
            </div>
            <div className="row">
              <button
                className="btn ghost"
                type="button"
                onClick={saveFinalResultsToStorage}
                disabled={savingFinalResults || (!splitCrops.length && !finalResultFiles.length)}
              >
                {savingFinalResults ? "Saving..." : "Save Final Results"}
              </button>
            </div>
            <div
              className="dropzone"
              role="button"
              tabIndex={0}
              onClick={() => openInputPickerWithMask(finalResultPickerRef.current)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const filtered = await extractImagesFromDrop(e);
                if (filtered.length) void handleFinalResultFilesSelected(filtered);
              }}
            >
              <div>Add files/folders for Final Results (device/cloud)</div>
              <div className="muted">
                Drag and drop files/folders or choose from your device/cloud apps.
              </div>
            </div>
            <input
              ref={finalResultPickerRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => void handleFinalResultFilesSelected(filterImages(e.target.files || []))}
            />
            <input
              ref={finalResultFolderRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => void handleFinalResultFilesSelected(filterImages(e.target.files || []))}
            />
            <div className="picker-row">
              <button className="ghost-btn" type="button" onClick={() => openInputPickerWithMask(finalResultPickerRef.current)}>
                Choose files
              </button>
              <button className="ghost-btn" type="button" onClick={() => openInputPickerWithMask(finalResultFolderRef.current)}>
                Choose folder
              </button>
            </div>
            {finalResultPreviews.length ? (
              <div className="preview-grid final-extra-grid">
                {finalResultPreviews.map((file, idx) => (
                  <div className="preview-card split-result-card" key={file.id}>
                    <button
                      type="button"
                      className="preview-remove-corner"
                      onClick={() => removeFinalResultFileAt(idx)}
                      aria-label={`Remove ${file.name}`}
                    >
                      X
                    </button>
                    <img className="split-result-image" src={file.url} alt={file.name} />
                    <div className="preview-name">{file.name}</div>
                    <div className="preview-source">Source: Device/Cloud</div>
                  </div>
                ))}
              </div>
            ) : null}
            {splitCrops.length ? (
              <div className="preview-grid split-results-grid">
                {splitCrops.map((crop) => {
                  const selected = selectedSplitKeys.includes(splitCropKey(crop));
                  return (
                    <div
                      className={`preview-card split-result-card selectable ${selected ? "selected" : ""}`}
                      key={`${crop.panel}-${crop.side}`}
                      onClick={() => toggleSplitCropSelection(crop)}
                    >
                      <img
                        className="split-result-image"
                        src={`data:image/png;base64,${crop.imageBase64}`}
                        alt={`Pose ${crop.poseNumber} 3:4`}
                      />
                      <div className="preview-name">{crop.fileName}</div>
                      {crop.uploadedUrl ? <div className="preview-source">Saved</div> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted centered">No split results yet. Generate and split first.</div>
            )}
          </div>
        </section>
          </>
        ) : null}

        {showOpsSections ? (
          <>
        <section className="card">
          <div className="card-title">3) Shopify Push (Images)</div>
          <p className="muted">
            Search product once, manage all images (remove/reorder), edit or regenerate alt text, then push.
          </p>
          <div className="catalog-wrap">
            <div className="row">
              <input
                value={pushSearchQuery ?? ""}
                onChange={(e) => setPushSearchQuery(e.target.value)}
                onKeyDown={onPushCatalogSearchKeyDown}
                placeholder="Search by barcode, product name, handle, or SKU"
              />
              <button className="btn ghost" type="button" onClick={loadPushCatalogProducts}>
                {pushCatalogLoading ? "Loading..." : "Search Catalog + Load Current Images"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  const saved = itemBarcodeSaved.trim();
                  if (!saved) {
                    setError("Save barcode in section 0.5 first.");
                    return;
                  }
                  setPushSearchQuery(saved);
                  setTimeout(() => {
                    loadPushCatalogProducts();
                  }, 0);
                }}
                disabled={!itemBarcodeSaved.trim() || pushCatalogLoading}
              >
                Use 0.5 Barcode
              </button>
            </div>
            <div className="row">
              <button className="btn ghost" type="button" onClick={toggleFinalResultUploadsVisibility}>
                {finalResultsVisible ? "Hide Previous Items" : "Load Previous Items"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={addSelectedFinalResultsToShopifyPush}
                disabled={!selectedFinalResultUploadIds.length}
              >
                Add Selected To Shopify Push
              </button>
              <button
                className="ghost-btn danger match-load-font"
                type="button"
                onClick={emptyFinalResultsStorage}
                disabled={emptyingFinalResults}
              >
                {emptyingFinalResults ? "Emptying Storage..." : "Empty Storage"}
              </button>
            </div>
            <div
              className="dropzone"
              role="button"
              tabIndex={0}
              onClick={() => openInputPickerWithMask(pushPickerRef.current)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const filtered = await extractImagesFromDrop(e);
                if (filtered.length) void handlePushFilesSelected(filtered);
              }}
            >
              <div>Add images for Shopify Push (device/cloud)</div>
              <div className="muted">
                Drag and drop files/folders or choose from your device/cloud apps.
              </div>
            </div>
            <input
              ref={pushPickerRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => void handlePushFilesSelected(filterImages(e.target.files || []))}
            />
            <input
              ref={pushFolderRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => void handlePushFilesSelected(filterImages(e.target.files || []))}
            />
            <div className="picker-row">
              <button className="ghost-btn" type="button" onClick={() => openInputPickerWithMask(pushPickerRef.current)}>
                Choose files
              </button>
              <button className="ghost-btn" type="button" onClick={() => openInputPickerWithMask(pushFolderRef.current)}>
                Choose folder
              </button>
              <span className="muted">{pushUploading ? "Uploading..." : ""}</span>
            </div>
            {finalResultsVisible ? (
              finalResultsLoading ? (
                <div className="muted centered">Loading previous items...</div>
              ) : finalResultUploads.length ? (
                <div className="preview-grid previous-upload-grid">
                  {finalResultUploads.map((file) => (
                    <div
                      className={`preview-card previous-upload-card selectable ${
                        selectedFinalResultUploadIds.includes(file.id) ? "selected" : ""
                      }`}
                      key={file.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleFinalResultUploadSelection(file.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFinalResultUploadSelection(file.id);
                        }
                      }}
                    >
                      {file.previewUrl ? (
                        <img
                          className="previous-upload-image"
                          src={file.previewUrl}
                          alt={file.fileName || "Final result preview"}
                        />
                      ) : (
                        <div className="muted centered">Preview unavailable</div>
                      )}
                      <div className="preview-name">{file.fileName || file.path}</div>
                      <div className="preview-source">
                        {selectedFinalResultUploadIds.includes(file.id)
                          ? "Selected"
                          : "Click to select"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted centered">No previous items found.</div>
              )
            ) : null}
            {!shop.trim() && (
              <div className="muted centered">
                Enter your shop domain above to browse Shopify catalog images.
              </div>
            )}
            {shop.trim() && !pushCatalogSearched && (
              <div className="muted centered">
                Search by product name/handle or leave search empty to load recent catalog items.
              </div>
            )}
            {shop.trim() && pushCatalogSearched && !pushCatalogLoading && !pushCatalogProducts.length && (
              <div className="muted centered">No matching catalog products with images found.</div>
            )}
            {pushCatalogProducts.length ? (
              <div className="catalog-products">
                {pushCatalogProducts.map((product) => (
                  <div className="catalog-product" key={`push-${product.id}`}>
                    <div className="catalog-title">
                      {product.title}
                      <span className="muted">
                        {" "}
                        ({product.handle}) | Barcode: {formatProductBarcodes(product)}
                      </span>
                    </div>
                    <div className="row">
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => upsertPushQueueFromProduct(product)}
                      >
                        Load Current Shopify Images
                      </button>
                    </div>
                    <div className="preview-grid">
                      {product.images.map((img) => {
                        const selected = pushImages.some(
                          (row) =>
                            row.sourceImageId === img.id &&
                            pushProductId === String(product.id || "")
                        );
                        return (
                          <button
                            key={img.id}
                            type="button"
                            className={`catalog-image ${selected ? "selected" : ""}`}
                            onClick={() => togglePushCatalogImage(product, img)}
                          >
                            <img src={img.url} alt={img.altText || product.title} />
                            <span>{selected ? "Selected" : "Select"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="muted">
            Product: {pushProductId || "none"}{pushProductHandle ? ` (${pushProductHandle})` : ""}
          </div>
          {pushImages.length ? (
            <div className="push-queue-grid">
              {pushImages.map((img, index) => (
                <div
                  key={img.id}
                  className="push-queue-card"
                  draggable
                  onDragStart={(e) => {
                    setDraggingPushImageId(img.id);
                    e.dataTransfer.setData("text/push-image-id", img.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={() => {
                    if (!draggingPushImageId) return;
                    const from = pushImages.findIndex((row) => row.id === draggingPushImageId);
                    const to = pushImages.findIndex((row) => row.id === img.id);
                    movePushImage(from, to);
                    setDraggingPushImageId(null);
                  }}
                >
                  <button
                    type="button"
                    className="preview-remove-corner"
                    onClick={() => removePushImageFromShopify(img)}
                    disabled={img.deleting}
                    aria-label={`Remove image ${index + 1} from Shopify`}
                  >
                    {img.deleting ? "..." : "X"}
                  </button>
                  <img src={img.url} alt={img.title || `Shopify image ${index + 1}`} />
                  <div className="preview-name">Position {index + 1}</div>
                  <textarea
                    value={img.altText}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPushImages((prev) =>
                        prev.map((row) => (row.id === img.id ? { ...row, altText: value } : row))
                      );
                    }}
                    rows={3}
                    placeholder="Alt text (80-120 chars)"
                  />
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => generateAltForPushImage(img.id)}
                    disabled={img.generatingAlt}
                  >
                    {img.generatingAlt ? "Generating..." : "Regenerate Alt"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted centered">No images selected yet.</div>
          )}
          {pushVariants.length ? (
            <div className="push-variant-row">
              {pushVariants.map((variant) => {
                const assigned = pushImages.find((img) => img.id === variant.assignedPushImageId) || null;
                const previewUrl = assigned?.url || variant.imageUrl || "";
                return (
                  <div
                    key={variant.id}
                    className="push-variant-card"
                    draggable
                    onDragStart={() => setDraggingVariantId(variant.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedImageId =
                        e.dataTransfer.getData("text/push-image-id") || draggingPushImageId || "";
                      if (droppedImageId) {
                        assignPushImageToVariant(variant.id, droppedImageId);
                        setDraggingPushImageId(null);
                        return;
                      }
                      if (!draggingVariantId || draggingVariantId === variant.id) return;
                      const from = pushVariants.findIndex((row) => row.id === draggingVariantId);
                      const to = pushVariants.findIndex((row) => row.id === variant.id);
                      movePushVariant(from, to);
                      setDraggingVariantId(null);
                    }}
                  >
                    <div className="push-variant-title">
                      #{variant.position} {variant.color || "Color"} ({variant.variantCount})
                    </div>
                    <div className="push-variant-preview">
                      {previewUrl ? (
                        <img src={previewUrl} alt={variant.color || "Variant preview"} />
                      ) : (
                        <div className="muted centered">Drop image here</div>
                      )}
                    </div>
                    <div className="row">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => clearPushVariantAssignment(variant.id)}
                        disabled={!variant.assignedPushImageId}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {pushColorMappingPreview.length ? (
            <div className="card">
              <div className="card-title">Push Mapping Preview</div>
              <div className="muted">
                Color to image mapping that will be sent on push.
              </div>
              <div className="push-mapping-list">
                {pushColorMappingPreview.map((row, idx) => (
                  <div className="push-mapping-row" key={`${row.color}-${idx}`}>
                    <strong>{row.color}</strong>
                    <span className="muted">({row.variantCount} variants)</span>
                    <span>
                      {row.imagePosition
                        ? `Image #${row.imagePosition}`
                        : "No image assigned"}
                    </span>
                    <span className="muted">{row.imageTitle || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={generateAltForMissingPushImages}
              disabled={!pushImages.length || pushingImages}
            >
              Fill Missing Alt
            </button>
            <button className="btn" onClick={pushImageToShopify} disabled={!pushImages.length || pushingImages}>
              {pushingImages ? "Pushing..." : "Push Images (Replace Product Media)"}
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-title">2) Shopify Pull + SEO Studio</div>
          <p className="muted">
            Pull product data by handle or product ID, then edit SEO title/description and alt text.
          </p>
          <div className="row">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Handle (vintage-wash-hoodie)"
            />
            <input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="Product ID (gid://shopify/Product/...)"
            />
          </div>
          <button className="btn ghost" onClick={pullProduct}>
            Pull Product
          </button>
          <p className="muted">
            Generate or edit SEO title/description and accessibility alt text.
          </p>
          <input
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder="SEO Title"
          />
          <textarea
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            placeholder="SEO Description"
          />
          <textarea
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Alt Text (Accessibility)"
          />
          <button className="btn" onClick={pushSeo}>
            Push SEO
          </button>
        </section>
          </>
        ) : null}
      </main>

      {previewModal ? (
        <div className="preview-modal-overlay" onClick={() => setPreviewModal(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="preview-modal-close"
              onClick={() => setPreviewModal(null)}
              aria-label="Close preview"
            >
              X
            </button>
            <div className="preview-modal-title">{previewModal.title}</div>
            <img
              src={`data:image/png;base64,${previewModal.imageBase64}`}
              alt={previewModal.title}
              className="preview-modal-image"
            />
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .page {
          --page-inline-gap: 13px;
          padding: calc(var(--integration-panel-top, 89px) - 58px) 6vw 0;
          min-height: calc(100vh - 58px);
          min-height: calc(100dvh - 58px);
          display: block;
          overflow: visible;
          font-family: "Space Grotesk", system-ui, sans-serif;
          color: #0f172a;
        }
        .page.is-hydrating {
          visibility: hidden;
        }
        .page.is-hydrated {
          visibility: visible;
        }
        .picker-transition-mask {
          position: fixed;
          inset: 0;
          z-index: 120;
          pointer-events: none;
          display: grid;
          place-items: center;
          background: rgba(8, 6, 14, 0.54);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
        }
        .picker-transition-label {
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.42);
          background: rgba(24, 12, 39, 0.72);
          color: rgba(255, 255, 255, 0.96);
          padding: 9px 14px;
          font-size: 0.86rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        :global(.content:not(.menu-open)) .page {
          padding-left: var(--page-inline-gap);
          padding-right: 0;
        }
        :global(.content.menu-open) .page {
          padding-left: 0;
          padding-right: 0;
        }
        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 360px);
          gap: 24px;
          align-items: start;
          margin-bottom: 24px;
        }
        .eyebrow {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #0b6b58;
          font-weight: 700;
        }
        h1 {
          margin: 8px 0;
          font-size: clamp(2rem, 3.5vw, 3rem);
        }
        .connect-card {
          border: 1px solid #e2e8f0;
          background: #ffffff;
          border-radius: 16px;
          padding: 16px;
          display: grid;
          gap: 12px;
        }
        .card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          background: #ffffff;
          display: grid;
          gap: 10px;
        }
        .status-bar {
          position: fixed;
          top: var(--integration-panel-top, 89px);
          left: var(--page-inline-gap);
          right: calc(
                var(
                  --content-right-pad,
                  calc(
                var(--integration-panel-width, 255px) + var(--page-edge-gap, 13px) +
                  var(--content-api-gap, 13px)
              )
            )
          );
          z-index: 40;
          gap: 8px;
          will-change: right, left;
          transition:
            left var(--chat-expand-duration, 280ms)
              var(--chat-expand-ease, cubic-bezier(0.2, 0.85, 0.2, 1)),
            right var(--chat-expand-duration, 280ms)
              var(--chat-expand-ease, cubic-bezier(0.2, 0.85, 0.2, 1));
        }
        .status-bar.copy-ready {
          cursor: pointer;
        }
        .status-bar.copy-ready:hover {
          border-color: #93c5fd;
          box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.22), 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        .status-bar.copy-ready:focus-visible {
          outline: 2px solid #93c5fd;
          outline-offset: 2px;
        }
        :global(.content.menu-open) .status-bar {
          left: 280px;
        }
        :global(.content.no-integration-panel) .status-bar {
          right: var(--page-inline-gap);
        }
        .status-bar-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .status-bar-title {
          font-weight: 700;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          font-size: 0.74rem;
          color: #475569;
        }
        .status-chip {
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 3px 9px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .status-chip.idle {
          color: #94a3b8;
          border-color: #cbd5e1;
          background: #f1f5f9;
        }
        .status-chip.working {
          color: #7c2d12;
          border-color: #fdba74;
          background: #ffedd5;
        }
        .status-chip.success {
          color: #166534;
          border-color: #86efac;
          background: #dcfce7;
        }
        .status-chip.error {
          color: #991b1b;
          border-color: #fca5a5;
          background: #fee2e2;
        }
        .status-bar.idle {
          border-color: #dbe5f1;
        }
        .status-bar.working {
          border-color: #facc15;
          box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.15), 0 8px 24px rgba(0, 0, 0, 0.24);
        }
        .status-bar.success {
          border-color: #86efac;
          box-shadow: 0 0 0 1px rgba(134, 239, 172, 0.14), 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        .status-bar.error {
          border-color: #fca5a5;
          box-shadow: 0 0 0 1px rgba(252, 165, 165, 0.16), 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        .status-bar-message {
          font-size: 0.95rem;
          font-weight: 600;
          color: #0f172a;
          line-height: 1.35;
        }
        .status-bar-meta {
          font-size: 0.8rem;
          color: #475569;
          line-height: 1.25;
          word-break: break-word;
        }
        .status-generation {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.12);
        }
        .status-generation-logo-wrap {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          animation: status-logo-pulse 1.5s ease-in-out infinite;
        }
        .status-generation-logo {
          width: 40px;
          height: 40px;
          object-fit: contain;
          border-radius: 8px;
        }
        .status-generation-text {
          min-width: 0;
          display: grid;
          gap: 2px;
        }
        .status-generation-stage {
          font-size: 0.93rem;
          font-weight: 700;
          line-height: 1.2;
        }
        .status-generation-sub {
          font-size: 0.78rem;
          color: #64748b;
          line-height: 1.2;
        }
        .status-generation-time {
          font-size: 0.84rem;
          font-weight: 700;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          padding: 4px 10px;
          white-space: nowrap;
        }
        @keyframes status-logo-pulse {
          0%,
          100% {
            transform: scale(1);
            filter: drop-shadow(0 0 0 rgba(255, 255, 255, 0));
          }
          50% {
            transform: scale(1.04);
            filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.2));
          }
        }
        .card-title {
          font-weight: 700;
        }
        .model-registry-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .grid {
          display: grid;
          gap: 16px;
          overflow: visible;
          overscroll-behavior: contain;
          margin-top: calc(var(--status-bar-height, 96px) + 12px);
          width: calc(100% + var(--content-right-pad, 0px));
          margin-right: calc(-1 * var(--content-right-pad, 0px));
          padding-right: var(--content-right-pad, 0px);
          padding-bottom: 60px;
        }
        .muted {
          color: #64748b;
          font-size: 0.95rem;
        }
        input,
        textarea {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 0.95rem;
          width: 100%;
        }
        select {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 0.95rem;
          width: 100%;
          background: #fff;
        }
        .dropzone {
          border: 1px dashed #cbd5f5;
          border-radius: 12px;
          padding: 16px;
          background: #f8fafc;
          display: grid;
          gap: 6px;
          text-align: center;
          cursor: pointer;
        }
        .picker-row {
          display: flex;
          justify-content: center;
          gap: 10px;
        }
        .mobile-only-control {
          display: none;
        }
        .mobile-camera-trigger {
          align-items: center;
          justify-content: center;
        }
        .camera-btn-inner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .camera-btn-icon {
          width: 14px;
          height: 14px;
          display: block;
          flex-shrink: 0;
        }
        .barcode-scanner-overlay {
          position: fixed;
          inset: 0;
          z-index: 1100;
          background: rgba(2, 6, 23, 0.8);
          display: grid;
          place-items: center;
          padding: 14px;
        }
        .barcode-scanner-card {
          width: min(460px, 94vw);
          border: 1px solid rgba(255, 255, 255, 0.34);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.95);
          color: #f8fafc;
          padding: 12px;
          display: grid;
          gap: 10px;
        }
        .barcode-scanner-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .barcode-scanner-frame {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          background: #020617;
          aspect-ratio: 3 / 4;
        }
        .barcode-scanner-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .barcode-scanner-guide {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }
        .barcode-scanner-guide-box {
          width: 76%;
          height: 34%;
          border: 2px solid rgba(52, 211, 153, 0.95);
          border-radius: 10px;
          box-shadow: 0 0 0 999px rgba(2, 6, 23, 0.32);
        }
        .barcode-scanner-error {
          color: #fecaca;
          font-size: 0.85rem;
          text-align: center;
        }
        .model-selected-area {
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          padding: 12px;
          background: #0000001a;
          display: grid;
          gap: 10px;
        }
        .model-selected-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .source-note {
          margin-top: 2px;
        }
        .barcode-chip-row {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
        }
        .barcode-chip {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 0.85rem;
          color: #0f172a;
        }
        .barcode-chip-remove {
          border: 1px solid #fecaca;
          background: #fff;
          color: #b91c1c;
          border-radius: 999px;
          width: 26px;
          height: 26px;
          line-height: 1;
          cursor: pointer;
          font-weight: 700;
        }
        .catalog-wrap {
          display: grid;
          gap: 10px;
        }
        .dropbox-folder-list {
          display: grid;
          gap: 8px;
        }
        .dropbox-folder-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          background: #fff;
        }
        .catalog-products {
          display: grid;
          gap: 12px;
        }
        .catalog-pagination {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          justify-content: center;
        }
        .catalog-product {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px;
          display: grid;
          gap: 8px;
          background: #fff;
        }
        .push-queue-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          justify-content: center;
        }
        .push-queue-card {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          padding: 8px;
          width: 220px;
          display: grid;
          gap: 6px;
          position: relative;
          cursor: grab;
        }
        .push-queue-card img {
          width: 100%;
          height: 220px;
          display: block;
          object-fit: contain;
          object-position: center;
          border-radius: 8px;
          background: #f8fafc;
        }
        .push-queue-card textarea {
          min-height: 68px;
          resize: vertical;
        }
        .push-variant-row {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 4px;
          align-items: stretch;
          justify-content: center;
        }
        .push-variant-card {
          flex: 0 0 210px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          padding: 8px;
          display: grid;
          gap: 6px;
          cursor: grab;
        }
        .push-variant-title {
          font-size: 0.8rem;
          font-weight: 600;
          color: #0f172a;
        }
        .push-variant-preview {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
          min-height: 170px;
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        .push-variant-preview img {
          width: 100%;
          height: 170px;
          object-fit: contain;
          object-position: center;
        }
        .push-mapping-list {
          display: grid;
          gap: 6px;
        }
        .push-mapping-row {
          display: grid;
          grid-template-columns: minmax(120px, 180px) minmax(90px, 130px) minmax(140px, 180px) 1fr;
          align-items: center;
          gap: 8px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          padding: 8px 10px;
          font-size: 0.85rem;
        }
        .pull-product {
          width: 100%;
          text-align: left;
          cursor: pointer;
        }
        .catalog-title {
          font-weight: 600;
          font-size: 0.9rem;
        }
        .catalog-image {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px;
          background: #fff;
          display: grid;
          gap: 6px;
          width: 150px;
          justify-items: center;
          align-content: start;
          text-align: center;
          cursor: pointer;
          color: #64748b;
          font-size: 0.75rem;
        }
        .catalog-image.selected {
          border-color: #000000;
          background: #e7f4f1;
          color: #000000;
        }
        .catalog-image img {
          width: 100%;
          height: 140px;
          display: block;
          object-fit: contain;
          object-position: center;
          border-radius: 8px;
          background: #f8fafc;
        }
        .ghost-btn {
          border: 1px solid #e2e8f0;
          background: #0000002a;
          color: #ffffff;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 0.85rem;
          cursor: pointer;
        }
        .preview-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: center;
          margin: 0 auto;
          width: 100%;
          max-width: 900px;
        }
        .model-registry-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          max-width: 900px;
          justify-content: stretch;
          align-items: stretch;
        }
        :global(.content:not(.menu-open)) .model-registry-grid {
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          max-width: 1180px;
        }
        .item-catalog-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: stretch;
          gap: 10px;
          max-width: 1260px;
          margin: 0 auto;
        }
        .item-catalog-grid .catalog-image {
          width: 150px;
        }
        .item-catalog-grid .catalog-image img {
          height: 120px;
          object-fit: contain;
          object-position: center;
        }
        .item-selected-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: stretch;
          gap: 10px;
          max-width: 1260px;
          margin: 0 auto;
        }
        .item-selected-grid .preview-card {
          width: 200px;
        }
        .item-flat-preview-grid {
          max-width: 1260px;
        }
        .item-flat-preview-card {
          width: min(900px, 100%);
        }
        .item-flat-split-card {
          width: 200px;
        }
        .item-flat-split-card img.item-flat-preview-image {
          width: 100%;
          height: 240px;
          object-fit: contain;
          object-position: center;
          display: block;
          margin: 0 auto;
          border-radius: 8px;
          background: #f8fafc;
          cursor: zoom-in;
        }
        .item-flat-preview-card img.item-flat-preview-image {
          width: 100%;
          height: auto;
          min-height: 240px;
          max-height: 520px;
          object-fit: contain;
          object-position: center;
          display: block;
          margin: 0 auto;
          border-radius: 8px;
          background: #f8fafc;
          cursor: zoom-in;
        }
        .split-results-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: stretch;
          gap: 10px;
          max-width: 1260px;
          margin: 0 auto;
        }
        .split-results-grid .split-result-card,
        .final-extra-grid .split-result-card {
          width: 220px;
        }
        .split-result-card img.split-result-image {
          width: 100%;
          height: auto;
          aspect-ratio: 3 / 4;
          object-fit: contain;
          object-position: center;
          border-radius: 8px;
          background: #f8fafc;
          display: block;
          margin: 0 auto;
        }
        .preview-card {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px;
          background: #fff;
          display: grid;
          gap: 6px;
          width: 160px;
          text-align: center;
          position: relative;
        }
        .preview-card.selectable {
          cursor: pointer;
        }
        .preview-card.selectable.selected {
          border-color: #0b6b58;
          background: #e7f4f1;
        }
        .preview-remove-corner {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 20px;
          height: 20px;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: #b91c1c;
          font-size: 0.7rem;
          font-weight: 700;
          cursor: pointer;
          line-height: 1;
          display: grid;
          place-items: center;
          padding: 0;
        }
        .preview-remove {
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #b91c1c;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .preview-card img {
          width: 100%;
          height: 90px;
          object-fit: cover;
          border-radius: 8px;
        }
        .model-registry-preview-card {
          width: 200px;
        }
        .model-registry-preview-card img.model-registry-preview-image {
          width: 100%;
          height: auto;
          aspect-ratio: 3 / 4;
          object-fit: contain;
          border-radius: 8px;
          background: #f8fafc;
        }
        .item-catalog-selected-card {
          width: 200px;
        }
        .item-catalog-selected-card img.item-catalog-selected-image {
          width: 100%;
          height: 240px;
          object-fit: contain;
          object-position: center;
          display: block;
          margin: 0 auto;
          border-radius: 8px;
          background: #f8fafc;
        }
        .previous-upload-card {
          width: 200px;
        }
        .previous-upload-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          max-width: 100%;
          justify-content: stretch;
          align-items: stretch;
        }
        .previous-upload-grid .previous-upload-card {
          width: 100%;
        }
        .previous-upload-card img.previous-upload-image {
          width: 100%;
          height: auto;
          max-height: 280px;
          object-fit: contain;
          border-radius: 8px;
          background: #f8fafc;
        }
        .preview-name {
          font-size: 0.75rem;
          color: #64748b;
          word-break: break-word;
        }
        .preview-source {
          font-size: 0.72rem;
          color: #475569;
          font-weight: 600;
        }
        .model-list {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }
        .model-pill {
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 6px 10px;
          background: #f8fafc;
          display: inline-flex;
          gap: 10px;
          align-items: center;
          font-size: 0.8rem;
        }
        .model-info {
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }
        .model-remove {
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #b91c1c;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .ghost-btn.danger {
          color: #ffffff;
          background: #ff4b4b62;
          border-color: #ffffff;
        }
        .match-load-font {
          font-size: 1rem;
          font-weight: 600;
        }
        .model-name {
          font-weight: 600;
        }
        .model-meta {
          color: #64748b;
        }
        .centered {
          text-align: center;
        }
        textarea {
          min-height: 88px;
          resize: vertical;
        }
        .btn {
          border: 1px solid #ffffff;
          background: #ffffff;
          color: #000000;
          padding: 10px 14px;
          border-radius: 999px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn.ghost {
          background: transparent;
          color: #ffffff;
        }
        .btn.primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .row {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .generation-actions-layout {
          display: grid;
          gap: 10px;
          grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
          align-items: start;
        }
        .generation-button-stack {
          display: grid;
          gap: 10px;
        }
        .generation-button-stack .btn {
          width: 100%;
        }
        .generation-comments-wrap {
          display: grid;
          gap: 8px;
        }
        .generation-comments-wrap textarea {
          min-height: 88px;
        }
        .generation-comments-note {
          text-align: left;
        }
        .panel-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .panel-selection-summary {
          font-size: 0.85rem;
          color: #475569;
          padding: 6px 10px;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          width: fit-content;
          background: #f8fafc;
        }
        .pill {
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          border-radius: 999px;
          background: #f8fafc;
          cursor: pointer;
        }
        .pill.active {
          border-color: #ffffff;
          color: #ffffff;
          background: rgba(0, 0, 0, 0.4);
        }
        .pill.unavailable {
          opacity: 0.55;
          cursor: not-allowed;
          border-color: #e2e8f0;
          color: #64748b;
          background: #f1f5f9;
        }
        .panel-preview {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          height: clamp(150px, 18vw, 190px);
          overflow: hidden;
        }
        .panel-preview-grid {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .panel-preview-card {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 8px;
          background: #fff;
          display: grid;
          gap: 6px;
        }
        .panel-preview-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: #0f172a;
        }
        .panel-image {
          grid-column: 1 / -1;
          width: 100%;
          height: 100%;
          min-height: 0;
          object-fit: contain;
          object-position: center;
          background: #f8fafc;
          cursor: zoom-in;
        }
        .frame {
          display: grid;
          place-items: center;
          background: #f8fafc;
          color: #94a3b8;
          font-weight: 700;
        }
        .divider {
          width: 2px;
          background: #e2e8f0;
        }
        .status-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #64748b;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #cbd5f5;
        }
        .status-dot.on {
          background: #10b981;
        }
        .status-dot.off {
          background: #ef4444;
        }
        .top-actions {
          margin-top: 12px;
          display: flex;
          gap: 8px;
        }
        .logout-btn {
          border-color: #cbd5e1;
          color: #0f172a;
        }
        .openai-raw {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #f8fafc;
          padding: 10px;
          max-height: 220px;
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 0.8rem;
          margin: 0;
        }
        .dialog-log {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          padding: 10px;
          max-height: 220px;
          overflow: auto;
          display: grid;
          gap: 8px;
        }
        .dialog-msg {
          font-size: 0.85rem;
          line-height: 1.35;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .dialog-msg.user {
          background: #eef6ff;
          border-color: #cbd5e1;
        }
        .dialog-msg.assistant {
          background: #f3faf7;
          border-color: #c6f6d5;
        }
        .chat-inline-fallback {
          display: none;
        }
        .chat-side-panel {
          position: fixed;
          right: var(--page-edge-gap, 13px);
          top: calc(
            var(--integration-panel-top, 89px) + var(--integration-panel-height, 214px) +
              var(--content-api-gap, 13px)
          );
          bottom: 13px;
          width: min(var(--integration-panel-width, 255px), calc(100vw - 26px));
          z-index: 42;
          pointer-events: none;
          will-change: width, top;
          transition:
            width var(--chat-expand-duration, 280ms)
              var(--chat-expand-ease, cubic-bezier(0.2, 0.85, 0.2, 1)),
            top var(--chat-expand-duration, 280ms)
              var(--chat-expand-ease, cubic-bezier(0.2, 0.85, 0.2, 1));
        }
        .chat-side-card {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-rows: auto auto minmax(0, 1fr) auto;
          gap: 10px;
          pointer-events: auto;
          border-radius: 18px;
        }
        .chat-side-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .chat-side-head-left {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .chat-expand-btn {
          width: 24px;
          height: 24px;
          min-width: 24px;
          min-height: 24px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.42);
          background: rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.96);
          display: grid;
          place-items: center;
          line-height: 0;
          padding: 0;
          flex-shrink: 0;
          transition:
            background-color 160ms ease,
            border-color 160ms ease,
            color 160ms ease,
            transform 160ms ease;
        }
        .chat-expand-btn.expanded {
          background: #e2e8f0;
        }
        .chat-expand-btn:active {
          transform: translateY(1px);
        }
        .chat-expand-icon {
          width: 14px;
          height: 14px;
          display: block;
          transition:
            transform var(--chat-expand-duration, 280ms)
              var(--chat-expand-ease, cubic-bezier(0.2, 0.85, 0.2, 1));
        }
        .chat-side-title {
          margin: 0;
          font-weight: 800;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          line-height: 1.1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chat-side-status {
          border: 1px solid rgba(255, 255, 255, 0.55);
          border-radius: 999px;
          padding: 3px 10px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .chat-side-status.ready {
          color: rgba(255, 255, 255, 0.95);
          border-color: rgba(255, 255, 255, 0.62);
          background: rgba(255, 255, 255, 0.16);
        }
        .chat-side-status.loading {
          color: rgba(255, 255, 255, 0.98);
          border-color: rgba(253, 186, 116, 0.85);
          background: rgba(245, 158, 11, 0.2);
        }
        .chat-side-sub {
          margin: 0;
          font-size: 0.9rem;
          line-height: 1.35;
          color: rgba(226, 232, 240, 0.95);
        }
        .chat-window-log {
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 12px;
          background:
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.2) 0%,
              rgba(255, 255, 255, 0.14) 76%,
              rgba(187, 133, 255, 0.3) 100%
            );
          min-height: 0;
          overflow: auto;
          display: grid;
          gap: 8px;
          padding: 10px;
        }
        .chat-side-actions {
          display: grid;
          gap: 8px;
        }
        .chat-side-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .chat-send-btn {
          background: rgba(255, 255, 255, 0.72);
          border-color: rgba(255, 255, 255, 0.72);
          color: #16122b;
        }
        .chat-clear-btn {
          background: transparent;
          border-color: rgba(255, 255, 255, 0.62);
          color: rgba(255, 255, 255, 0.9);
        }
        .chat-input-attention {
          animation: chat-input-flicker 1.1s ease-in-out infinite;
        }
        @keyframes chat-input-flicker {
          0%,
          100% {
            border-color: #f59e0b;
            box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.34);
          }
          50% {
            border-color: #fdba74;
            box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.28);
          }
        }
        :global(.shell.chat-expanded) .chat-side-panel {
          top: var(--integration-panel-top, 89px);
          width: min(var(--chat-expanded-width, 560px), calc(100vw - 26px));
        }
        .preview-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          display: grid;
          place-items: center;
          z-index: 1000;
          padding: 16px;
        }
        .preview-modal {
          width: min(1100px, 95vw);
          max-height: 92vh;
          background: #fff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 12px;
          position: relative;
          display: grid;
          gap: 10px;
        }
        .preview-modal-title {
          font-weight: 700;
          color: #0f172a;
        }
        .preview-modal-image {
          width: 100%;
          max-height: calc(92vh - 80px);
          object-fit: contain;
          background: #f8fafc;
          border-radius: 8px;
        }
        .preview-modal-close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #0f172a;
          font-weight: 700;
          cursor: pointer;
          line-height: 1;
        }
        /* Bright glass overrides so Image Studio matches Motion Studio styling. */
        .page {
          color: #f8fafc;
          font-family: "Inter", var(--font-geist-sans), "Segoe UI", Roboto, Arial, sans-serif;
          --cg-fg: #f8fafc;
          --cg-muted: rgba(226, 232, 240, 0.9);
          --cg-border: rgba(255, 255, 255, 0.24);
          --cg-border-strong: rgba(255, 255, 255, 0.38);
          --cg-surface: rgba(255, 255, 255, 0.14);
          --cg-surface-soft: rgba(255, 255, 255, 0.1);
        }
        h1,
        .card-title,
        .catalog-title,
        .panel-preview-label,
        .preview-modal-title,
        .push-variant-title {
          color: var(--cg-fg);
        }
        .eyebrow {
          color: #34d399;
        }
        .muted,
        .preview-name,
        .preview-source,
        .panel-selection-summary,
        .status-row,
        .model-meta {
          color: var(--cg-muted);
        }
        .connect-card,
        .card,
        .catalog-product,
        .dropbox-folder-row,
        .push-queue-card,
        .push-variant-card,
        .push-mapping-row,
        .catalog-image,
        .preview-card,
        .model-pill,
        .panel-preview-card,
        .dialog-log,
        .openai-raw,
        .preview-modal {
          background: var(--cg-surface);
          border-color: var(--cg-border);
          color: var(--cg-fg);
          backdrop-filter: blur(14px) saturate(1.14);
          -webkit-backdrop-filter: blur(14px) saturate(1.14);
        }
        .dropzone,
        .push-variant-preview,
        .panel-image,
        .frame,
        .split-result-image,
        .model-registry-preview-card img.model-registry-preview-image,
        .item-catalog-selected-card img.item-catalog-selected-image,
        .previous-upload-card img.previous-upload-image,
        .catalog-image img,
        .push-queue-card img,
        .preview-modal-image,
        .dialog-msg,
        .dialog-msg.user,
        .dialog-msg.assistant {
          background: var(--cg-surface-soft);
          border-color: var(--cg-border);
        }
        input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
        textarea,
        select {
          background: rgba(255, 255, 255, 0.13);
          color: var(--cg-fg);
          border-color: rgba(255, 255, 255, 0.32);
          border-radius: 12px;
          min-height: 52px;
          padding: 10px 14px;
        }
        input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):focus,
        textarea:focus,
        select:focus {
          border-color: rgba(255, 255, 255, 0.5);
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.18);
        }
        input:not([type="checkbox"]):not([type="radio"]):not([type="range"])::placeholder,
        textarea::placeholder {
          color: var(--cg-muted);
        }
        .barcode-chip,
        .panel-selection-summary,
        .pill,
        .preview-remove-corner,
        .preview-remove,
        .model-remove,
        .preview-modal-close {
          background: var(--cg-surface-soft);
          border-color: var(--cg-border-strong);
          color: var(--cg-fg);
        }
        .divider {
          background: var(--cg-border);
        }
        .status-bar-title,
        .status-bar-meta {
          color: var(--cg-muted);
        }
        .status-bar-message {
          color: var(--cg-fg);
        }
        .chat-expand-btn {
          background: var(--cg-surface-soft);
          border-color: var(--cg-border-strong);
          color: var(--cg-fg);
        }
        .chat-expand-btn.expanded {
          background: var(--cg-surface);
        }
        @media (max-width: 1180px) {
          .chat-inline-fallback {
            display: grid;
          }
          .status-bar {
            left: var(--page-inline-gap);
            right: var(--page-inline-gap);
          }
          :global(.content.menu-open) .status-bar {
            left: var(--page-inline-gap);
          }
          .chat-side-panel {
            display: none;
          }
        }
        @media (max-width: 900px) {
          .mobile-only-control {
            display: inline-flex;
          }
          .generation-actions-layout {
            grid-template-columns: 1fr;
          }
          .status-bar {
            top: 78px;
            left: var(--page-inline-gap);
            right: var(--page-inline-gap);
          }
          :global(.content.menu-open) .status-bar {
            left: var(--page-inline-gap);
          }
          .hero {
            grid-template-columns: 1fr;
          }
          .item-catalog-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .item-selected-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .split-results-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .previous-upload-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .item-catalog-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .item-selected-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .split-results-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .previous-upload-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (min-width: 901px) and (max-width: 1280px) {
          .item-catalog-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .split-results-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (min-width: 1281px) and (max-width: 1600px) {
          .item-catalog-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
          .split-results-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
        @media (min-width: 901px) and (max-width: 1280px) {
          .previous-upload-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (min-width: 1281px) and (max-width: 1600px) {
          .previous-upload-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}

