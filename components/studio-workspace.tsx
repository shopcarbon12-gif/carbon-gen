"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FEMALE_PANEL_MAPPING_TEXT,
  FEMALE_POSE_LIBRARY,
  MALE_PANEL_MAPPING_TEXT,
  MALE_POSE_LIBRARY,
  getPoseLibraryForGender,
} from "@/lib/panelPoseLibraries";

const panels = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

const ITEM_TYPE_OPTIONS = [
  { value: "hoodie", label: "Hoodie" },
  { value: "jacket", label: "Jacket" },
  { value: "coat", label: "Coat" },
  { value: "t-shirt", label: "T-Shirt" },
  { value: "shirt", label: "Shirt" },
  { value: "sweatshirt", label: "Sweatshirt" },
  { value: "sweater", label: "Sweater" },
  { value: "pants", label: "Pants" },
  { value: "jeans", label: "Jeans" },
  { value: "shorts", label: "Shorts" },
  { value: "skirt", label: "Skirt" },
  { value: "dress", label: "Dress" },
  { value: "jumpsuit", label: "Jumpsuit" },
  { value: "activewear set", label: "Activewear Set" },
  { value: "full outfit set", label: "Full Outfit Set" },
  { value: "shoes", label: "Shoes" },
  { value: "bag", label: "Bag" },
  { value: "accessories", label: "Accessories" },
  { value: "other apparel item", label: "Other Apparel Item" },
];

const CATALOG_PAGE_SIZE = 10;
const SPLIT_TARGET_WIDTH = 770;
const SPLIT_TARGET_HEIGHT = 1155;

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
  uploadedUrl: string | null;
  uploading: boolean;
  uploadError: string | null;
};

type SplitCrop = {
  panel: number;
  side: "left" | "right";
  poseNumber: number;
  fileName: string;
  imageBase64: string;
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

const IMAGE_FILE_EXT_RE = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|tif|tiff|webp)$/i;

function isImageLikeFile(file: File) {
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return IMAGE_FILE_EXT_RE.test(file.name || "");
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

function isValidBarcode(value: string) {
  const v = String(value || "").trim();
  return /^(?:c\d{6,8}|\d{7,9})$/.test(v);
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

export default function StudioWorkspace() {
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
  const [itemTypeCustom, setItemTypeCustom] = useState("");
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemBarcodeSaved, setItemBarcodeSaved] = useState("");
  const [dropboxSearching, setDropboxSearching] = useState(false);
  const [dropboxResults, setDropboxResults] = useState<DropboxImageResult[]>([]);
  const [dropboxFolderResults, setDropboxFolderResults] = useState<DropboxFolderResult[]>([]);
  const [dropboxSearched, setDropboxSearched] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearched, setCatalogSearched] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ShopifyCatalogProduct[]>([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogQueryForResults, setCatalogQueryForResults] = useState("");
  const [catalogHasNextPage, setCatalogHasNextPage] = useState(false);
  const [catalogAfterCursorsByPage, setCatalogAfterCursorsByPage] = useState<Array<string | null>>([
    null,
  ]);
  const [itemCatalogCollapsed, setItemCatalogCollapsed] = useState(false);
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
  const modelPickerRef = useRef<HTMLInputElement | null>(null);
  const modelFolderRef = useRef<HTMLInputElement | null>(null);
  const itemPickerRef = useRef<HTMLInputElement | null>(null);
  const itemFolderRef = useRef<HTMLInputElement | null>(null);
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
  const [previewModal, setPreviewModal] = useState<{
    imageBase64: string;
    title: string;
  } | null>(null);
  const [generateOpenAiResponse, setGenerateOpenAiResponse] = useState<string | null>(null);
  const [dialogMessages, setDialogMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [dialogInput, setDialogInput] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);
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

  const lowestSelectedPanel = useMemo(() => {
    const sorted = [...selectedPanels].sort((a, b) => a - b);
    return sorted[0] || 1;
  }, [selectedPanels]);

  const resolvedItemType = useMemo(() => {
    const selected = itemType.trim();
    if (selected === "other apparel item") {
      return itemTypeCustom.trim();
    }
    return selected;
  }, [itemType, itemTypeCustom]);

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
    setPanelsInFlight([]);
    setGenerateOpenAiResponse(null);
  }, [selectedModelId]);

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
        if (json?.models) setModels(json.models);
      })
      .catch((e: any) => {
        setError(e?.message || "Failed to load models");
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
    if (modelFolderRef.current) {
      modelFolderRef.current.webkitdirectory = true;
    }
    if (itemFolderRef.current) {
      itemFolderRef.current.webkitdirectory = true;
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
          `Try directly on http://localhost:3001 and restart cloudflared + dev server. ` +
          `Snippet: ${snippet || "<empty>"}`
      );
    }
    throw new Error(
      snippet
        ? `Unexpected response${where}: ${snippet}`
        : `Unexpected non-JSON response${where}`
    );
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
      throw new Error("Please select an item type from the list.");
    }
    if (itemType === "other apparel item" && !itemTypeCustom.trim()) {
      throw new Error("Please type the apparel item for 'Other Apparel Item'.");
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
    setItemCatalogCollapsed(true);
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
      setCatalogHasNextPage(false);
      setCatalogAfterCursorsByPage([null]);
      return;
    }
    const query = String(options?.queryOverride ?? catalogQuery).trim();
    const isEmptyQuery = query.length === 0;
    const page = Number(options?.page || 1);
    let after = options?.after ?? null;
    setCatalogLoading(true);
    setCatalogSearched(true);
    setError(null);
    try {
      let products: ShopifyCatalogProduct[] = [];
      let hasNextPage = false;
      let endCursor: string | null = null;

      // Empty-query mode is cursor-paginated at 10 products per page.
      // Skip empty pages that may occur after status filtering.
      for (let guard = 0; guard < 25; guard += 1) {
        const params = new URLSearchParams({ shop: shopValue });
        if (query) params.set("q", query);
        if (isEmptyQuery) {
          params.set("first", String(CATALOG_PAGE_SIZE));
          if (after) params.set("after", after);
        }

        const resp = await fetch(`/api/shopify/catalog?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await parseJsonResponse(resp);
        if (!resp.ok) throw new Error(json.error || "Failed to load Shopify catalog");

        products = Array.isArray(json.products) ? json.products : [];
        const pageInfo = json?.pageInfo || {};
        hasNextPage = Boolean(pageInfo?.hasNextPage);
        endCursor = pageInfo?.endCursor ? String(pageInfo.endCursor) : null;

        if (!isEmptyQuery) break;
        if (products.length > 0) break;
        if (!hasNextPage || !endCursor) break;
        after = endCursor;
      }

      setCatalogProducts(products);
      setCatalogQueryForResults(query);
      if (isEmptyQuery) {
        setCatalogPage(page);
        setCatalogHasNextPage(hasNextPage);
        setCatalogAfterCursorsByPage((prev) => {
          const next = [...prev];
          next[page - 1] = after;
          next[page] = endCursor;
          return next.slice(0, page + 2);
        });
      } else {
        setCatalogPage(1);
        setCatalogHasNextPage(false);
        setCatalogAfterCursorsByPage([null]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load Shopify catalog");
      setCatalogProducts([]);
      setCatalogPage(1);
      setCatalogHasNextPage(false);
      setCatalogAfterCursorsByPage([null]);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadCatalogNextPage() {
    if (catalogLoading || !catalogHasNextPage) return;
    if (catalogQueryForResults.trim()) return;
    const nextPage = catalogPage + 1;
    const nextAfter = catalogAfterCursorsByPage[catalogPage] || null;
    await loadCatalogImages({ queryOverride: catalogQueryForResults, page: nextPage, after: nextAfter });
  }

  async function loadCatalogPreviousPage() {
    if (catalogLoading || catalogPage <= 1) return;
    if (catalogQueryForResults.trim()) return;
    const prevPage = catalogPage - 1;
    const prevAfter = catalogAfterCursorsByPage[prevPage - 1] || null;
    await loadCatalogImages({ queryOverride: catalogQueryForResults, page: prevPage, after: prevAfter });
  }

  async function loadCatalogFirstPage() {
    if (catalogLoading || catalogPage === 1) return;
    if (catalogQueryForResults.trim()) return;
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
    const selectedBarcode = itemBarcodeSaved.trim();
    if (!selectedBarcode) return [] as PushQueueImage[];
    const panelNumbers = Object.keys(generatedPanels)
      .map((key) => Number(key))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    return panelNumbers
      .map((panelNumber) => {
        const b64 = generatedPanels[panelNumber];
        if (!b64) return null;
        const id = `generated:panel-${panelNumber}`;
        return {
          id,
          sourceImageId: id,
          mediaId: null,
          url: `data:image/png;base64,${b64}`,
          title: `Generated Panel ${panelNumber}`,
          altText: "",
          generatingAlt: false,
          deleting: false,
        } as PushQueueImage;
      })
      .filter((row): row is PushQueueImage => Boolean(row));
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
    if (!target) return;
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
    } catch (e: any) {
      setPushImages((prev) =>
        prev.map((img) => (img.id === imageId ? { ...img, generatingAlt: false } : img))
      );
      setError(e?.message || "Failed to generate alt text.");
    }
  }

  async function generateAltForMissingPushImages() {
    const targets = pushImages.filter((image) => !image.altText.trim());
    if (!targets.length) {
      setStatus("No missing alt text to generate.");
      return;
    }
    for (const image of targets) {
      // Sequential to keep OpenAI usage predictable and avoid burst failures.
      await generateAltForPushImage(image.id);
    }
    setStatus("Generated missing alt text.");
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

  function clearSavedItemBarcode() {
    setItemBarcodeSaved("");
    setStatus("Saved barcode removed.");
    setError(null);
  }

  async function searchDropboxByBarcode() {
    const barcode = itemBarcodeSaved.trim();
    if (!barcode) {
      setError("Save a barcode first, then search Dropbox.");
      return;
    }
    setDropboxSearching(true);
    setDropboxSearched(true);
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
        uploadedUrl: null,
        uploading: true,
        uploadError: null,
      },
    ]);
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

      const payloadImages = pushImages.map((img) => ({
        url: img.url,
        altText: img.altText.trim(),
      }));
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

  async function onLogout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
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
      "This will permanently delete all files under models/ and items/ in the bucket. Continue?"
    );
    if (!ok) return;

    setEmptyingBucket(true);
    setError(null);
    try {
      const resp = await fetch("/api/storage/empty", { method: "POST" });
      const json = await parseJsonResponse(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to empty bucket");
      setStatus(`Bucket emptied. Deleted ${json?.deleted ?? 0} file(s).`);
      setPreviousModelUploads([]);
      refreshModels();
    } catch (e: any) {
      setError(e?.message || "Failed to empty bucket");
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

  const isCatalogEmptyQueryResults = useMemo(
    () => catalogQueryForResults.trim().length === 0,
    [catalogQueryForResults]
  );
  const showCatalogPagination = useMemo(
    () =>
      isCatalogEmptyQueryResults &&
      catalogSearched &&
      (catalogPage > 1 || catalogHasNextPage),
    [isCatalogEmptyQueryResults, catalogSearched, catalogPage, catalogHasNextPage]
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
    const closeUpSubjectLine = lockedItemType
      ? `- CLOSE-UP SUBJECT LOCK: section 0.5 item type is "${lockedItemType}". Close-up must show this item type only.`
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
          "- Footwear hard lock: both full-body frames must show shoes. Barefoot is forbidden.",
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
        "- Footwear hard lock: when a frame is full-body, shoes must be worn and visible.",
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
        "- Footwear hard lock: both full-body frames must show shoes. Barefoot is forbidden.",
        "- Do not rotate LEFT frame into lifestyle angle. Do not replace RIGHT frame with torso crop.",
      ];
    }
    if (panelNumber === 2) {
      return [
        "MALE PANEL 2 CRITICAL LOCK (Pose 3 + Pose 4):",
        panelAdultLock,
        "- LEFT Pose 3 must be torso + head front crop (mid-thigh to head).",
        "- RIGHT Pose 4 must be full-body back view with full head and feet visible.",
        "- RIGHT Pose 4 footwear hard lock: shoes must be worn and visible. Barefoot is forbidden.",
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
    const closeUpCategoryRule = getCloseUpCategoryRule(args.itemType);
    const closeUpSubjectLine = args.itemType.trim()
      ? `- CLOSE-UP SUBJECT LOCK: the close-up subject must match section 0.5 item type "${args.itemType.trim()}" exactly.`
      : "- CLOSE-UP SUBJECT LOCK: the close-up subject must match section 0.5 item type exactly.";

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
      "- Use item refs only for product attributes: shape, color, material, construction, and details.",
      "- If a full-body outfit image is provided, treat it as a single full-look reference and preserve the whole look structure (top, bottom, shoes, accessories).",
      "- If full-look + separate item images are both provided, match each extra item to the corresponding part in the full look and replace only those matched parts.",
      "- Keep all non-replaced parts from the full-look reference unchanged.",
      "- CLOSE-UP LOCK: for MALE Pose 6 and FEMALE Pose 5, generate one close-up using section 0.5 item references.",
      closeUpSubjectLine,
      closeUpCategoryRule,
      "- If a set or multiple items are present, choose the most detailed item that still matches the locked section 0.5 item type.",
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
      "Canvas 1540x1155; left frame 770x1155; right frame 770x1155; thin divider.",
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
      `LEFT ACTIVE POSE:\n${poseABlock}`,
      `RIGHT ACTIVE POSE:\n${poseBBlock}`,
      "All non-active poses are reference only and must not execute in this image.",
      "Full-body framing lock (male + female): whenever an active pose is full-body, include full head and both feet entirely in frame. No cropping of head, hair, chin, toes, or shoes.",
      "Full-body no-crop applies to: Male poses 1,2,4 and Female poses 1,2,3,6.",
      "2:3 split centering hard lock: each panel half is center-cropped to a final 2:3 portrait. Keep each active pose centered in its own half.",
      "2:3 safe-zone math lock (for 1536x1024 panel output): each half 768x1024 is center-cropped to 682x1023. Keep head/body/garment details inside this inner center-safe zone.",
      "Footwear hard lock (full-body): for every full-body active pose, the model must wear visible shoes. Barefoot and socks-only are forbidden.",
      "If footwear is not clearly defined in item refs, use clean neutral studio sneakers and keep the same pair consistent across all selected panels in this run.",
      "No-crop mapping lock: in any panel where the active pose is full-body (male/female mapping), frame top-of-hair to bottom-of-shoes with visible white margin.",
      "Camera framing rule for full-body active poses: fit the complete body from top of hair to bottom of shoes with visible white margin above the head and below the feet.",
      "If a full-body active pose would crop head or feet, zoom out and reframe until full body is fully visible.",
      "If an active pose is not full-body (e.g., close-up/lower-body/torso crop), follow that crop as defined.",
      `Model: ${args.modelName} (${args.modelGender}).`,
      `Item type: ${args.itemType}.`,
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

      if (!effectiveItemType) {
        throw new Error(
          "Please set the item type in section 0.5 before generating."
        );
      }

      if (!effectiveItemRefs.length) {
        const hasPendingItemInputs =
          Boolean(itemFiles.length) || Boolean(selectedCatalogImages.length);
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
          });

          const resp = await fetch("/api/generate", {
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
          });

          const json = await parseJsonResponse(resp, "/api/generate");
          if (!resp.ok) {
            setGenerateOpenAiResponse((prev) =>
              prev
                ? `${prev}\n\n---\n${formatGenerateDebugPayload(json, panelNumber)}`
                : formatGenerateDebugPayload(json, panelNumber)
            );
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
        const failed: string[] = [];

        for (const result of settled) {
          if (result.status === "fulfilled") {
            succeeded[result.value.panelNumber] = result.value.b64;
          } else {
            failed.push(result.reason?.message || "Unknown generation failure.");
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
          const uniqueFailed = Array.from(new Set(failed));
          if (succeededPanels.length) {
            setStatus(
              `${actionWord} partial success. Completed panel(s): ${succeededPanels.join(", ")}.`
            );
          } else {
            setStatus(null);
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

    if (!files.length && e.dataTransfer.files?.length) {
      return filterImages(e.dataTransfer.files);
    }

    return files;
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

  async function splitPanelToTwoByThree(panel: number, b64: string) {
    const img = await loadBase64Image(b64);
    const halfW = Math.floor(img.width / 2);
    const halfH = img.height;

    function cropForSide(side: "left" | "right") {
      const sideOffsetX = side === "left" ? 0 : img.width - halfW;
      // Normalize every split to a strict 770x1155 output frame.
      const targetAspect = SPLIT_TARGET_WIDTH / SPLIT_TARGET_HEIGHT; // 2:3
      const sourceAspect = halfW / halfH;
      let cropW = halfW;
      let cropH = halfH;
      if (sourceAspect > targetAspect) {
        cropW = Math.round(halfH * targetAspect);
      } else {
        cropH = Math.round(halfW / targetAspect);
      }
      const cropX = sideOffsetX + Math.floor((halfW - cropW) / 2);
      const cropY = Math.floor((halfH - cropH) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = SPLIT_TARGET_WIDTH;
      canvas.height = SPLIT_TARGET_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to initialize crop canvas");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropW,
        cropH,
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
      fileName: `pose${poseNumber}-${safeBarcode}.png`,
    };
  }

  function downloadBase64Png(filename: string, b64: string) {
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${b64}`;
    a.download = filename;
    a.click();
  }

  async function splitToTwoByThree() {
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
        const crops = await splitPanelToTwoByThree(panel, b64);
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

  async function sendDialogMessage() {
    const text = dialogInput.trim();
    if (!text || dialogLoading) return;
    const next = [...dialogMessages, { role: "user" as const, content: text }];
    setDialogMessages(next);
    setDialogInput("");
    setDialogLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/openai/dialog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          contextError: generateOpenAiResponse || "",
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
    setStatus("OpenAI troubleshooting chat cleared.");
    setError(null);
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="eyebrow">Carbon Gen Studio</div>
          <h1>Image Generation + Shopify/SEO Control Center</h1>
          <p>
            OAuth-based Shopify connection, strict panel generation, and SEO + alt
            text control. This is the v1 build baseline.
          </p>
          <div className="top-actions">
            <button className="btn ghost logout-btn" type="button" onClick={onLogout}>
              Logout
            </button>
          </div>
        </div>
        <div className="connect-card">
          <div>
            <div className="card-title">Shopify Connection</div>
            <p className="muted">
              Manage connect/reconnect/disconnect from the Settings page.
            </p>
          </div>
          <div className="status-row">
            <span className={`status-dot ${connected ? "on" : "off"}`} />
            <span>
              {connected ? "Connected" : "Not connected"}
              {shop ? <em> - {shop}</em> : null}
              {connected && installedAt ? (
                <em> - Installed {new Date(installedAt).toLocaleString()}</em>
              ) : null}
            </span>
          </div>
          <a className="btn ghost" href="/settings">
            Open Shopify Settings
          </a>
        </div>
      </header>

      {(error || status) && (
        <div className="banner">
          {error && <span className="error">Error: {error}</span>}
          {status && <span>{status}</span>}
        </div>
      )}

      <main className="grid">
        <section className="card">
          <div className="card-title">0) Model Registry</div>
          <p className="muted">
            Upload a model profile (3+ reference photos). This becomes the identity anchor.
          </p>
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
            role="button"
            tabIndex={0}
            onClick={() => openInputPicker(modelPickerRef.current)}
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
            <div className="muted">
              Click to select from your device or cloud apps (Drive, Dropbox, OneDrive). Only
              image files are used.
            </div>
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
              onClick={() => openInputPicker(modelPickerRef.current)}
            >
              Choose files
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => openInputPicker(modelFolderRef.current)}
            >
              Choose folder
            </button>
          </div>
          <div className="muted centered">
            {modelPreviewItems.length
              ? `${modelPreviewItems.length} files ready`
              : "No files selected"}
          </div>
          {modelPreviewItems.length ? (
            <div className="preview-grid">
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
          ) : null}
          <div className="row">
            <button className="btn ghost" type="button" onClick={onPreviousUploadsPrimaryAction}>
              {previousUploadsVisible
                ? "Hide Previous Uploads"
                : "Load Previous Uploads"}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={emptyBucket}
              disabled={emptyingBucket}
            >
              {emptyingBucket ? "Emptying Bucket..." : "Empty Bucket (models + items)"}
            </button>
          </div>
          <button className="btn" onClick={createModel}>
            Save Model
          </button>
          {(modelUploading || modelPreviewItems.some((p) => !p.uploadedUrl)) && (
            <div className="muted centered">
              Uploading{" "}
              {modelPreviewItems.filter((p) => p.uploadedUrl).length}/
              {modelPreviewItems.length || modelUploadTotal}
            </div>
          )}
          <div className="muted centered">
            Registry: {models.length} model{models.length === 1 ? "" : "s"}
          </div>
          {previousUploadsVisible ? (
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
          ) : null}
          <div className="centered">
            <button className="ghost-btn danger" type="button" onClick={resetModels}>
              Reset all models
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-title">0.5) Item References</div>
          <p className="muted">
            Choose image source: upload from device/cloud apps or import existing product images from
            Shopify.
          </p>
          <div className="row">
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
            >
              <option value="">Select clothing type</option>
              {ITEM_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <input
              value={itemBarcode}
              onChange={(e) => setItemBarcode(sanitizeBarcodeInput(e.target.value))}
              placeholder="Item barcode (required: 7-9 digits, or C + 6-8 digits)"
            />
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
              disabled={dropboxSearching || !isValidBarcode(itemBarcodeSaved)}
            >
              {dropboxSearching ? "Searching Dropbox..." : "Search Dropbox by Barcode"}
            </button>
          </div>
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
          {dropboxFolderResults.length ? (
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
          {dropboxResults.length ? (
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
          {itemType === "other apparel item" ? (
            <div className="row">
              <input
                value={itemTypeCustom}
                onChange={(e) => setItemTypeCustom(e.target.value)}
                placeholder="Type apparel item (e.g., thermal fleece vest)"
              />
            </div>
          ) : null}
          <div className="source-note muted">
            You can combine both sources: upload from device and select from Shopify catalog.
          </div>
          <div
            className="dropzone"
            role="button"
            tabIndex={0}
            onClick={() => openInputPicker(itemPickerRef.current)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const filtered = await extractImagesFromDrop(e);
              if (filtered.length) setItemFiles(filtered);
            }}
          >
            <div>Drag & drop a folder (or images) here</div>
            <div className="muted">
              Click to select from your device or cloud apps (Drive, Dropbox, OneDrive). Only
              image files are used.
            </div>
          </div>
          <input
            ref={itemPickerRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => setItemFiles(filterImages(e.target.files || []))}
          />
          <input
            ref={itemFolderRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => setItemFiles(filterImages(e.target.files || []))}
          />
          <div className="picker-row">
            <button
              className="ghost-btn"
              type="button"
              onClick={() => openInputPicker(itemPickerRef.current)}
            >
              Choose files
            </button>
            <button
              className="ghost-btn"
              type="button"
              onClick={() => openInputPicker(itemFolderRef.current)}
            >
              Choose folder
            </button>
          </div>
          <div className="row">
            <button
              className="btn ghost"
              type="button"
              onClick={() => setItemCatalogCollapsed((prev) => !prev)}
            >
              {itemCatalogCollapsed ? "Show Catalog" : "Hide Catalog"}
            </button>
          </div>
          {!itemCatalogCollapsed ? (
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
              {shop.trim() && catalogSearched && !catalogLoading && !catalogProducts.length && (
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
                    Page {catalogPage}{catalogHasNextPage ? "" : " (last page)"}
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
              {catalogProducts.length ? (
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
                    Page {catalogPage}{catalogHasNextPage ? "" : " (last page)"}
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
              <div className="row">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => setItemCatalogCollapsed(true)}
                >
                  Hide Catalog
                </button>
              </div>
            </div>
          ) : (
            <div className="muted centered">
              Catalog is hidden. Selected catalog images are preserved.
            </div>
          )}
          <div className="muted centered">
            {itemFiles.length ? `${itemFiles.length} device files ready` : "No device files selected"} |{" "}
            {selectedCatalogImages.length
              ? `${selectedCatalogImages.length} Shopify images selected`
              : "No Shopify images selected"}
            {selectedCatalogImages.some((img) => img.uploading)
              ? ` | ${selectedCatalogImages.filter((img) => img.uploading).length} uploading`
              : ""}
            {itemUploadCount ? ` | Last upload: ${itemUploadCount} files` : ""}
          </div>
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
                </div>
              ))}
            </div>
          ) : null}
          <button className="btn" onClick={uploadItems}>
            Save Item References + Type
          </button>
        </section>

        <section className="card">
          <div className="card-title">1) Image Generation</div>
          <p className="muted">
            Select a panel and generate. Approve or regenerate. Split into 2:3 crops after approval.
          </p>
          <p className="muted">
            Split to 2:3 is a free local crop tool. It never regenerates images.
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
            <button className="btn ghost" type="button" onClick={() => setSelectedPanels([1])}>
              Panel 1 Only
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
          <div className="row">
            <button
              className="btn"
              onClick={() => generatePanels("generate_selected")}
              disabled={panelGenerating}
            >
              {panelGenerating
                ? "Generating..."
                : `Generate Selected (${selectedPanels.length})`}
            </button>
            <button className="btn ghost" onClick={approveSelectedPanels}>
              Approve Selected
            </button>
            <button className="btn ghost" onClick={approveAllGeneratedPanels}>
              Approve All Generated
            </button>
            <button
              className="btn ghost"
              onClick={() => generatePanels("regenerate")}
              disabled={panelGenerating}
            >
              Regenerate Panel {lowestSelectedPanel}
            </button>
            <button
              className="btn ghost"
              onClick={() => generatePanels("regenerate_selected")}
              disabled={panelGenerating}
            >
              Regenerate Selected ({selectedPanels.length})
            </button>
            <button className="btn ghost" onClick={splitToTwoByThree}>
              Split to 2:3
            </button>
          </div>
          <div className="card">
            <div className="card-title">1.1) OpenAI Raw Response</div>
            <p className="muted">
              Exact OpenAI/provider response for generation failures (including policy blocks).
            </p>
            {generateOpenAiResponse ? (
              <pre className="openai-raw">{generateOpenAiResponse}</pre>
            ) : (
              <div className="muted centered">No OpenAI error payload captured yet.</div>
            )}
            <div className="row">
              <button
                className="btn ghost"
                type="button"
                onClick={copyErrorPayload}
                disabled={!generateOpenAiResponse}
              >
                Copy Raw Response
              </button>
            </div>
          </div>
          <div className="card">
            <div className="card-title">1.2) OpenAI Troubleshooting Chat</div>
            <p className="muted">
              Ask follow-up questions directly and keep a continuous troubleshooting dialog.
            </p>
            <div className="dialog-log">
              {dialogMessages.length ? (
                dialogMessages.map((msg, idx) => (
                  <div key={`${msg.role}-${idx}`} className={`dialog-msg ${msg.role}`}>
                    <strong>{msg.role === "user" ? "You" : "Assistant"}:</strong> {msg.content}
                  </div>
                ))
              ) : (
                <div className="muted centered">No chat messages yet.</div>
              )}
            </div>
            <div className="row">
              <input
                value={dialogInput}
                onChange={(e) => setDialogInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendDialogMessage();
                  }
                }}
                placeholder="Ask OpenAI why a generation failed and how to fix it..."
              />
              <button
                className="btn"
                type="button"
                onClick={sendDialogMessage}
                disabled={dialogLoading || !dialogInput.trim()}
              >
                {dialogLoading ? "Sending..." : "Send"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={clearDialogChat}
                disabled={!dialogMessages.length && !dialogInput.trim()}
              >
                Clear Chat
              </button>
            </div>
          </div>
          {splitCrops.length ? (
            <div className="card">
              <div className="card-title">1.5) 2:3 Results</div>
              <div className="row">
                <button className="btn ghost" onClick={downloadAllSplitCrops}>
                  Download All Splits
                </button>
              </div>
              <div className="preview-grid split-results-grid">
                {splitCrops.map((crop) => (
                  <div className="preview-card split-result-card" key={`${crop.panel}-${crop.side}`}>
                    <img
                      className="split-result-image"
                      src={`data:image/png;base64,${crop.imageBase64}`}
                      alt={`Pose ${crop.poseNumber} 2:3`}
                    />
                    <div className="preview-name">
                      {crop.fileName}
                    </div>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => downloadSplitCrop(crop)}
                    >
                      Download
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

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
          padding: 32px 6vw 60px;
          font-family: "Space Grotesk", system-ui, sans-serif;
          color: #0f172a;
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
        .card-title {
          font-weight: 700;
        }
        .grid {
          display: grid;
          gap: 16px;
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
          height: 180px;
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
          flex: 0 0 180px;
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
          min-height: 120px;
          display: grid;
          place-items: center;
          overflow: hidden;
        }
        .push-variant-preview img {
          width: 100%;
          height: 120px;
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
          border-color: #0b6b58;
          background: #e7f4f1;
          color: #0b6b58;
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
          background: #fff;
          color: #0b6b58;
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
        .item-catalog-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          max-width: 100%;
          justify-content: stretch;
          align-items: stretch;
        }
        .item-catalog-grid .catalog-image {
          width: 100%;
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
        .split-results-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          max-width: 100%;
          justify-content: stretch;
          align-items: stretch;
        }
        .split-results-grid .split-result-card {
          width: 100%;
        }
        .split-result-image {
          width: 100%;
          height: auto;
          aspect-ratio: 2 / 3;
          object-fit: contain;
          border-radius: 8px;
          background: #f8fafc;
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
          height: auto;
          aspect-ratio: 3 / 4;
          object-fit: contain;
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
          color: #b91c1c;
          border-color: #fecaca;
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
          border: 1px solid #0b6b58;
          background: #0b6b58;
          color: white;
          padding: 10px 14px;
          border-radius: 999px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn.ghost {
          background: transparent;
          color: #0b6b58;
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
          border-color: #0b6b58;
          color: #0b6b58;
          background: #e7f4f1;
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
        .banner {
          margin: 12px 0 20px;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
          display: flex;
          gap: 12px;
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
        .error {
          color: #b91c1c;
          font-weight: 600;
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
        @media (max-width: 900px) {
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
          .item-selected-grid {
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
          .item-selected-grid {
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



