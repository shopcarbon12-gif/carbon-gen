"use client";

// OpenAI V2 Generator — streamlined 3-step flow (Identify → Generate → Publish).
//
// New page. The original generator at /studio/images is untouched. Reuses the
// existing backend endpoints + the shared generation core in lib/panelGeneration.ts:
//   /api/models/list|/api/models|/api/models/upload|/api/models/delete
//   /api/shopify/catalog (live barcode/product search) + /api/shopify-push (variants/media/push)
//   /api/generate (gpt-image panel; split to 3:4 client-side) + /api/openai/image-alt
//   /api/barcode-handoff/session* (remote phone barcode scan)
//   /api/image-handoff/session*   (remote phone item-photo capture)
//
// Gender is a property of the chosen MODEL (catalog has no gender). The selected
// model's gender drives the pose set, exactly like the original generator.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMasterPanelPrompt,
  getPanelButtonLabel,
  getPanelPosePair,
  getSensitivityTier,
  normalizePromptInstruction,
  splitPanelToThreeByFour,
  uniqueSortedPanels,
} from "@/lib/panelGeneration";

const SHOP_STORAGE_KEY = "shopify_shop"; // shared app-wide so the connected store persists everywhere
const DROPBOX_ELIOR_FOLDER = "/elior perez"; // Dropbox folder to search for item photos by UPC

const PANELS = [1, 2, 3, 4];

const ITEM_TYPE_PRESETS = [
  "Jeans",
  "T-Shirt",
  "Tank Top",
  "Top",
  "Shirt",
  "Dress",
  "Coat",
  "Jacket",
  "Vest",
  "Pants",
  "Shorts",
  "Skirt",
  "Hoodie",
  "Swimwear",
];

const INSTRUCTION_PRESETS = [
  "super skinny fit",
  "skinny",
  "baggy",
  "oversized cut",
  "slim",
  "relaxed fit",
  "flare",
];

type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  barcodes?: string[];
  images: Array<{ id: string; url: string; altText: string }>;
};

type ModelRow = {
  model_id: string;
  name: string;
  gender: string;
  ref_image_urls: string[];
  created_at?: string;
};

// Local-preview + uploaded-url pair so thumbnails render instantly (fix for the
// "uploaded picture doesn't preview" bug) while the real upload completes.
type RefImg = { id: string; preview: string; url: string | null; uploading: boolean };

type ResultImage = {
  id: string;
  panel: number;
  side: "left" | "right";
  label: string;
  b64: string;
  selected: boolean;
  stagedUrl?: string;
  stagedPath?: string;
  alt?: string;
  altBusy?: boolean;
};

type CurrentMedia = { id: string; url: string; altText: string };

type VariantRow = {
  id: string;
  color: string;
  position: number;
  imageUrl: string | null;
  assignedResultId: string | null;
  variantCount: number;
};

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};
type BarcodeDetectorCtorLike = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function dataUrlFromB64(b64: string) {
  return `data:image/png;base64,${b64}`;
}

// R2_PUBLIC_URL_BASE isn't configured, so stored object URLs (model refs etc.) point at
// the private S3 endpoint and won't render directly. Route them through the authed
// /api/storage/preview proxy (browser sends the auth cookie). Pass data:/blob:/Shopify
// CDN URLs through unchanged.
function storagePreview(u: string): string {
  const s = String(u || "");
  if (!s || s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("/api/storage/preview")) return s;
  if (/(^https?:)?\/\/[^/]*cdn\.shopify(cdn)?\.(com|net)/i.test(s)) return s;
  return `/api/storage/preview?url=${encodeURIComponent(s)}`;
}

function b64ToFile(b64: string, fileName: string): File {
  const byteString = atob(b64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
  return new File([bytes], fileName, { type: "image/png" });
}

// Keep alphanumerics only; the chosen color variant carries the color/size identity.
function sanitizeBarcodeInput(value: string) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
}

async function parseJson(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

type SeoProposed = { seoTitle: string; metaDescription: string; bodyHtml: string; tags: string[] };
type SeoScore = { overall: number; grade: string; fields: Record<string, { score: number } | undefined> };

export default function OpenAiV2Workspace() {
  const [shop, setShop] = useState("");
  const [shopConnected, setShopConnected] = useState(false);
  const [editShop, setEditShop] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // step 1 — identify
  const [barcode, setBarcode] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [productColors, setProductColors] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState("");
  const [itemType, setItemType] = useState("");
  const [instruction, setInstruction] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // models
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mGender, setMGender] = useState<"female" | "male">("female");
  const [mRefs, setMRefs] = useState<RefImg[]>([]);
  const [mBusy, setMBusy] = useState(false);
  const modelFileRef = useRef<HTMLInputElement | null>(null);

  // item references
  const [itemRefs, setItemRefs] = useState<RefImg[]>([]);
  const itemFileRef = useRef<HTMLInputElement | null>(null);

  // step 2 — generate
  const [genMode, setGenMode] = useState<"auto" | "manual">("auto");
  const [selectedPanels, setSelectedPanels] = useState<number[]>([1, 2, 3, 4]);
  const [poseFeas, setPoseFeas] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [panelProgress, setPanelProgress] = useState<Record<number, string>>({});
  const [results, setResults] = useState<ResultImage[]>([]);
  const [zoom, setZoom] = useState<ResultImage | null>(null);

  // step 3 — publish
  const [currentMedia, setCurrentMedia] = useState<CurrentMedia[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [pubMode, setPubMode] = useState<"replace" | "add">("replace");
  const [publishBusy, setPublishBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);

  // step 3 — SEO (inline optimize → review → publish)
  const [seoBusy, setSeoBusy] = useState(false);
  const [seo, setSeo] = useState<SeoProposed | null>(null);
  const [seoScore, setSeoScore] = useState<SeoScore | null>(null);
  const [seoCurrentOverall, setSeoCurrentOverall] = useState<number | null>(null);
  const [seoPublishing, setSeoPublishing] = useState(false);
  const [seoPublished, setSeoPublished] = useState(false);

  // ---- barcode scanner (local + remote) ----
  const [scanChooserOpen, setScanChooserOpen] = useState(false);
  const [scanLocalOpen, setScanLocalOpen] = useState(false);
  const [scanRemoteQr, setScanRemoteQr] = useState("");
  const [scanRemoteSession, setScanRemoteSession] = useState("");
  const [scanRemotePolling, setScanRemotePolling] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const scanRafRef = useRef<number | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanFallbackRef = useRef<{ stop: () => void } | null>(null);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- item-photo remote camera ----
  const [itemCamChooserOpen, setItemCamChooserOpen] = useState(false);
  const [itemCamRemoteQr, setItemCamRemoteQr] = useState("");
  const [itemCamRemoteSession, setItemCamRemoteSession] = useState("");
  const [itemCamRemotePolling, setItemCamRemotePolling] = useState(false);
  const [itemCamError, setItemCamError] = useState<string | null>(null);
  const itemCamPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemCamLastPayloadRef = useRef<string | null>(null);

  // ---- item reference: Shopify import + Dropbox search ----
  const [dropboxOpen, setDropboxOpen] = useState(false);
  const [dropboxBusy, setDropboxBusy] = useState(false);
  const [dropboxResults, setDropboxResults] = useState<Array<{ id: string; title: string; temporaryLink: string }>>([]);
  const [dropboxError, setDropboxError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === selectedModelId) || null,
    [models, selectedModelId]
  );
  const gender = selectedModel?.gender || "";
  const selectedResults = results.filter((r) => r.selected);
  const uploadedItemRefs = itemRefs.filter((r) => r.url).map((r) => r.url as string);
  const itemRefsUploading = itemRefs.some((r) => r.uploading);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SHOP_STORAGE_KEY);
      if (saved) setShop(saved);
    } catch {
      /* ignore */
    }
    // The connected store is permanent — pull it from API status (same source as the
    // other pages) so it never needs typing.
    fetch("/api/shopify/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        const inferred = String(json?.shop || "").trim().toLowerCase();
        if (inferred && inferred.includes(".myshopify.com")) {
          setShop(inferred);
          setShopConnected(typeof json?.connected === "boolean" ? Boolean(json.connected) : true);
          try {
            window.localStorage.setItem(SHOP_STORAGE_KEY, inferred);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        /* status probe optional */
      });
    refreshModels();
  }, []);

  function persistShop(value: string) {
    setShop(value);
    try {
      window.localStorage.setItem(SHOP_STORAGE_KEY, value.trim());
    } catch {
      /* ignore */
    }
  }

  function refreshModels() {
    fetch("/api/models/list", { cache: "no-store" })
      .then(async (r) => {
        const json = await parseJson(r);
        if (!r.ok) throw new Error(json?.error || "Failed to load models");
        return json;
      })
      .then((json) => {
        const next = Array.isArray(json?.models) ? (json.models as ModelRow[]) : [];
        setModels(next);
        setSelectedModelId((prev) => prev || (next[0]?.model_id ?? ""));
      })
      .catch((e: any) => setError(e?.message || "Failed to load models"));
  }

  // ---------- step 1: live barcode/product search ----------
  function onBarcodeChange(value: string) {
    setBarcode(value);
    setProduct(null);
    setProductColors([]);
    setSelectedColor("");
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 3) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    searchTimer.current = setTimeout(() => runSearch(q), 280);
  }

  async function runSearch(q: string) {
    const shopValue = shop.trim();
    if (!shopValue) {
      setError("Enter your shop domain first (e.g. yourstore.myshopify.com).");
      return;
    }
    setSearchBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ shop: shopValue, first: "12", includeCount: "0", q });
      const resp = await fetch(`/api/shopify/catalog?${params.toString()}`, { cache: "no-store" });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to search Shopify catalog.");
      const products: CatalogProduct[] = Array.isArray(json?.products) ? json.products : [];
      setSearchResults(products);
      setSearchOpen(true);
    } catch (e: any) {
      setError(e?.message || "Search failed.");
    } finally {
      setSearchBusy(false);
    }
  }

  async function selectProduct(p: CatalogProduct) {
    setProduct(p);
    setSearchOpen(false);
    setSearchResults([]);
    setStatus(`Matched: ${p.title}`);
    setProductColors([]);
    setSelectedColor("");
    // pull color variants so the operator must pick the color this upload is for
    try {
      const resp = await fetch("/api/shopify-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-variants", shop: shop.trim(), productId: p.id }),
      });
      const json = await parseJson(resp);
      const rows = Array.isArray(json?.colors) ? json.colors : Array.isArray(json?.variants) ? json.variants : [];
      const colors = Array.from(
        new Set(rows.map((r: any) => String(r?.color || "").trim()).filter(Boolean))
      ) as string[];
      setProductColors(colors);
      if (colors.length === 1) setSelectedColor(colors[0]);
    } catch {
      /* colors optional */
    }
  }

  // ---------- uploads (item refs + model refs share /api/models/upload) ----------
  async function uploadOne(file: File): Promise<{ url: string; path: string }> {
    const fd = new FormData();
    fd.append("file", file);
    const resp = await fetch("/api/models/upload", { method: "POST", body: fd });
    const json = await parseJson(resp);
    if (!resp.ok) throw new Error(json?.error || "Upload failed.");
    const url = String(json?.url || "").trim();
    if (!url) throw new Error("Upload returned no URL.");
    return { url, path: String(json?.path || "").trim() };
  }

  // Adds files to a RefImg list with an INSTANT local preview, then uploads.
  function addFilesToRefs(
    files: File[],
    setList: React.Dispatch<React.SetStateAction<RefImg[]>>
  ) {
    const entries: RefImg[] = files.map((f, i) => ({
      id: `ref-${Date.now()}-${i}-${Math.round(performance.now())}`,
      preview: URL.createObjectURL(f),
      url: null,
      uploading: true,
    }));
    setList((prev) => [...prev, ...entries]);
    entries.forEach((entry, i) => {
      uploadOne(files[i])
        .then(({ url }) => setList((prev) => prev.map((r) => (r.id === entry.id ? { ...r, url, uploading: false } : r))))
        .catch((e: any) => {
          setError(e?.message || "Upload failed.");
          setList((prev) => prev.filter((r) => r.id !== entry.id));
        });
    });
  }

  function onItemFiles(files: FileList | null) {
    const arr = [...(files || [])].filter((f) => f.type.startsWith("image/")).slice(0, 8);
    if (arr.length) addFilesToRefs(arr, setItemRefs);
  }

  // Add a remote image (Shopify CDN / Dropbox temp link) as an item reference:
  // show it immediately, then download + re-upload to our storage so /api/generate can fetch it.
  function importRemoteToItemRef(remoteUrl: string, name = "import.jpg") {
    const url = String(remoteUrl || "").trim();
    if (!url) return;
    const id = `ref-${Date.now()}-${Math.round(performance.now())}-${itemRefs.length}`;
    setItemRefs((prev) => [...prev, { id, preview: url, url: null, uploading: true }]);
    void name;
    (async () => {
      try {
        // Server-side fetch + store (avoids browser CORS on Dropbox/CDN links).
        const resp = await fetch("/api/models/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const json = await parseJson(resp);
        if (!resp.ok) throw new Error(json?.error || "Import failed.");
        const storedUrl = String(json?.url || "").trim();
        if (!storedUrl) throw new Error("Import returned no URL.");
        setItemRefs((prev) => prev.map((r) => (r.id === id ? { ...r, url: storedUrl, uploading: false } : r)));
      } catch (e: any) {
        setItemRefs((prev) => prev.filter((r) => r.id !== id));
        setError(e?.message || "Failed to import image.");
      }
    })();
  }

  // "Import from Shopify": pull all images from the matched product (all variants).
  function importFromShopify() {
    if (!product) {
      setError("Match a product by barcode first.");
      return;
    }
    const imgs = Array.isArray(product.images) ? product.images : [];
    if (!imgs.length) {
      setStatus("This product has no images on Shopify.");
      return;
    }
    // Shopify CDN URLs are directly usable by /api/generate, so no re-upload needed.
    const entries: RefImg[] = imgs.map((img, i) => ({
      id: `shopify-${img.id || i}-${Date.now()}`,
      preview: img.url,
      url: img.url,
      uploading: false,
    }));
    setItemRefs((prev) => [...prev, ...entries]);
    setStatus(`Imported ${entries.length} image(s) from Shopify.`);
  }

  // "Upload from Dropbox": search the UPC in the elior perez folder, show image files.
  async function openDropboxSearch() {
    const code = sanitizeBarcodeInput(barcode);
    if (!code) {
      setError("Scan or type the barcode/UPC first, then search Dropbox.");
      return;
    }
    setDropboxOpen(true);
    setDropboxBusy(true);
    setDropboxError(null);
    setDropboxResults([]);
    try {
      const resp = await fetch("/api/dropbox/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: code, root: DROPBOX_ELIOR_FOLDER }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Dropbox search failed.");
      const images = Array.isArray(json?.images) ? json.images : [];
      setDropboxResults(
        images.map((img: any) => ({
          id: String(img?.id || ""),
          title: String(img?.title || "Dropbox image"),
          temporaryLink: String(img?.temporaryLink || ""),
        })).filter((d: any) => d.temporaryLink)
      );
    } catch (e: any) {
      setDropboxError(e?.message || "Dropbox search failed.");
    } finally {
      setDropboxBusy(false);
    }
  }
  function onModelFiles(files: FileList | null) {
    const arr = [...(files || [])].filter((f) => f.type.startsWith("image/")).slice(0, 12);
    if (arr.length) addFilesToRefs(arr, setMRefs);
  }

  async function saveModel() {
    const name = mName.trim();
    if (!name) return setError("Give the model a name.");
    const urls = mRefs.filter((r) => r.url).map((r) => r.url as string);
    if (mRefs.some((r) => r.uploading)) return setError("Wait for model photos to finish uploading.");
    if (urls.length < 3) return setError("Upload at least 3 model photos.");
    setMBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, gender: mGender, urls }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to save model.");
      const saved = json?.model as ModelRow | undefined;
      setAddModelOpen(false);
      setMName("");
      setMRefs([]);
      // Optimistic: the /api/models/list endpoint has an 8s server cache, so a refetch
      // here would return stale data (without the new model). Update local state instead.
      if (saved?.model_id) {
        setModels((prev) => (prev.some((m) => m.model_id === saved.model_id) ? prev : [saved, ...prev]));
        setSelectedModelId(saved.model_id);
      }
      setStatus(`Saved model "${name}" (${mGender}) to the server.`);
    } catch (e: any) {
      setError(e?.message || "Failed to save model.");
    } finally {
      setMBusy(false);
    }
  }

  async function deleteModel(model: ModelRow) {
    if (!window.confirm(`Delete model "${model.name}"?\nIts photos are removed from the server.`)) return;
    // Optimistic removal up-front so the card disappears immediately (the list endpoint's
    // 8s cache otherwise re-adds it on refetch, which is why a manual refresh was needed).
    const remaining = models.filter((m) => m.model_id !== model.model_id);
    setModels(remaining);
    setSelectedModelId((prev) => (prev === model.model_id ? remaining[0]?.model_id ?? "" : prev));
    try {
      const resp = await fetch("/api/models/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: model.model_id }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to delete model.");
      setStatus(`Deleted "${model.name}" and its photos from the server.`);
    } catch (e: any) {
      // Roll back the optimistic removal on failure.
      setModels((prev) => (prev.some((m) => m.model_id === model.model_id) ? prev : [model, ...prev]));
      setError(e?.message || "Failed to delete model.");
    }
  }

  const canContinueToGenerate = Boolean(
    product && (productColors.length === 0 || selectedColor) && itemType.trim() && selectedModel && uploadedItemRefs.length && !itemRefsUploading
  );

  // ---------- barcode scanner: local camera ----------
  const stopLocalScan = useCallback(() => {
    if (scanFallbackRef.current) {
      try {
        scanFallbackRef.current.stop();
      } catch {
        /* ignore */
      }
      scanFallbackRef.current = null;
    }
    if (typeof window !== "undefined" && scanRafRef.current !== null) {
      window.cancelAnimationFrame(scanRafRef.current);
      scanRafRef.current = null;
    }
    const stream = scanStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
      scanStreamRef.current = null;
    }
    const v = scanVideoRef.current;
    if (v) v.srcObject = null;
  }, []);

  function acceptScannedBarcode(raw: string) {
    const normalized = sanitizeBarcodeInput(raw);
    if (!normalized) return;
    setScanLocalOpen(false);
    setScanChooserOpen(false);
    setScanRemotePolling(false);
    stopScanRemotePoll();
    stopLocalScan();
    onBarcodeChange(normalized);
    setStatus(`Scanned barcode: ${normalized}`);
  }

  useEffect(() => {
    if (!scanLocalOpen) {
      stopLocalScan();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setScanError("Camera is not available in this browser.");
      setScanLocalOpen(false);
      return;
    }
    const Ctor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtorLike }).BarcodeDetector;
    let cancelled = false;
    let busy = false;
    const detector = Ctor ? new Ctor({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e"] }) : null;

    const scanFrame = async () => {
      if (cancelled) return;
      const v = scanVideoRef.current;
      if (v && detector && v.readyState >= 2 && !busy) {
        busy = true;
        try {
          const dets = await detector.detect(v);
          const raw = String(dets.find((d) => String(d?.rawValue || "").trim())?.rawValue || "").trim();
          if (raw) {
            acceptScannedBarcode(raw);
            return;
          }
        } catch {
          /* warming up */
        } finally {
          busy = false;
        }
      }
      scanRafRef.current = window.requestAnimationFrame(() => void scanFrame());
    };

    const startNative = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        scanStreamRef.current = stream;
        const v = scanVideoRef.current;
        if (!v) throw new Error("Camera preview unavailable.");
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        scanRafRef.current = window.requestAnimationFrame(() => void scanFrame());
      } catch (e: any) {
        setScanError(e?.message ? `Unable to start camera: ${e.message}` : "Unable to start camera.");
        setScanLocalOpen(false);
      }
    };

    const startZxing = async () => {
      try {
        const v = scanVideoRef.current;
        if (!v) throw new Error("Camera preview unavailable.");
        const zxing = (await import("@zxing/browser")) as any;
        const ReaderCtor = zxing?.BrowserMultiFormatReader;
        if (!ReaderCtor) throw new Error("Barcode scanner fallback unavailable.");
        const reader = new ReaderCtor();
        const controls = await reader.decodeFromVideoDevice(undefined, v, (result: any) => {
          if (cancelled || !result) return;
          acceptScannedBarcode(String(result?.getText?.() || result?.text || "").trim());
        });
        if (cancelled) {
          try {
            controls?.stop?.();
          } catch {
            /* ignore */
          }
          return;
        }
        scanFallbackRef.current = controls;
      } catch (e: any) {
        setScanError(e?.message ? `Unable to start camera: ${e.message}` : "Unable to start camera.");
        setScanLocalOpen(false);
      }
    };

    if (Ctor) void startNative();
    else void startZxing();
    return () => {
      cancelled = true;
      stopLocalScan();
    };
  }, [scanLocalOpen, stopLocalScan]);

  // ---------- barcode scanner: remote QR ----------
  function stopScanRemotePoll() {
    if (scanPollRef.current !== null) {
      clearInterval(scanPollRef.current);
      scanPollRef.current = null;
    }
  }

  async function openRemoteBarcodeScan() {
    setScanError(null);
    setScanRemoteQr("");
    setScanRemoteSession("");
    setScanRemotePolling(false);
    stopScanRemotePoll();
    try {
      const resp = await fetch("/api/barcode-handoff/session", { method: "POST", cache: "no-store" });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to start remote scanner.");
      const sessionId = String(json?.sessionId || "").trim();
      const qr = String(json?.qrCodeUrl || "").trim();
      if (!sessionId || !qr) throw new Error("Invalid remote scanner response.");
      // QR renders inline inside the chooser (not a separate modal).
      setScanRemoteSession(sessionId);
      setScanRemoteQr(qr);
      setScanRemotePolling(true);
    } catch (e: any) {
      setScanError(e?.message || "Failed to open remote scanner.");
    }
  }

  useEffect(() => {
    if (!scanRemotePolling || !scanRemoteSession) {
      stopScanRemotePoll();
      return;
    }
    stopScanRemotePoll();
    const poll = async () => {
      try {
        const resp = await fetch(`/api/barcode-handoff/session/${encodeURIComponent(scanRemoteSession)}?consume=1`, { cache: "no-store" });
        const json = await parseJson(resp);
        if (resp.status === 404) throw new Error(String(json?.error || "Session expired."));
        if (!resp.ok) return;
        if (json?.connected && scanChooserOpen) {
          setStatus("Phone connected. Waiting for a scan…");
        }
        if (!json?.ready) return;
        acceptScannedBarcode(String(json?.barcode || ""));
      } catch (e: any) {
        setScanError(e?.message || "Remote scan failed.");
        setScanRemotePolling(false);
        stopScanRemotePoll();
      }
    };
    void poll();
    scanPollRef.current = setInterval(() => void poll(), 1200);
    return () => stopScanRemotePoll();
  }, [scanRemotePolling, scanRemoteSession, scanChooserOpen]);

  // ---------- item-photo remote camera ----------
  function stopItemCamPoll() {
    if (itemCamPollRef.current !== null) {
      clearTimeout(itemCamPollRef.current);
      itemCamPollRef.current = null;
    }
  }

  async function openItemCameraRemote() {
    setItemCamError(null);
    setItemCamRemoteQr("");
    setItemCamRemoteSession("");
    setItemCamRemotePolling(false);
    stopItemCamPoll();
    itemCamLastPayloadRef.current = null;
    try {
      const resp = await fetch("/api/image-handoff/session", { method: "POST", cache: "no-store" });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to start remote camera.");
      const sessionId = String(json?.sessionId || "").trim();
      const qr = String(json?.qrCodeUrl || "").trim();
      if (!sessionId || !qr) throw new Error("Invalid remote camera response.");
      // QR renders inline inside the chooser (not a separate modal).
      setItemCamRemoteSession(sessionId);
      setItemCamRemoteQr(qr);
      setItemCamRemotePolling(true);
    } catch (e: any) {
      setItemCamError(e?.message || "Failed to open remote camera.");
    }
  }

  useEffect(() => {
    if (!itemCamRemotePolling || !itemCamRemoteSession) {
      stopItemCamPoll();
      return;
    }
    stopItemCamPoll();
    const schedule = (ms: number) => {
      itemCamPollRef.current = setTimeout(() => void poll(), ms);
    };
    const poll = async () => {
      try {
        const resp = await fetch(`/api/image-handoff/session/${encodeURIComponent(itemCamRemoteSession)}?consume=1`, { cache: "no-store" });
        const json = await parseJson(resp);
        if (resp.status === 404) throw new Error(String(json?.error || "Session expired."));
        if (!resp.ok) {
          schedule(1800);
          return;
        }
        if (json?.connected && itemCamChooserOpen) {
          setStatus("Phone connected. Take photos — they appear here automatically.");
        }
        if (!json?.ready) {
          schedule(1000);
          return;
        }
        const fileName = String(json?.fileName || "").trim() || "camera-upload.jpg";
        const dataUrl = String(json?.dataUrl || "");
        const objectUrl = String(json?.objectUrl || "").trim();
        const sig = String(json?.id || "") || `${fileName}|${dataUrl.length}|${objectUrl}`;
        if (itemCamLastPayloadRef.current === sig) {
          schedule(1200);
          return;
        }
        itemCamLastPayloadRef.current = sig;
        let file: File | null = null;
        if (dataUrl) {
          file = b64ToFile(dataUrl.replace(/^data:[^,]+,/, ""), fileName);
        } else if (objectUrl) {
          const blob = await (await fetch(objectUrl, { cache: "no-store" })).blob();
          file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
        }
        if (file) addFilesToRefs([file], setItemRefs);
        setStatus(`Photo received: ${fileName}`);
        schedule(1200);
      } catch (e: any) {
        setItemCamError(e?.message || "Remote camera failed.");
        setItemCamRemotePolling(false);
        stopItemCamPoll();
      }
    };
    void poll();
    return () => stopItemCamPoll();
  }, [itemCamRemotePolling, itemCamRemoteSession, itemCamChooserOpen]);

  // ---------- step 2: generate ----------
  function togglePanel(panel: number) {
    setSelectedPanels((prev) =>
      prev.includes(panel) ? prev.filter((p) => p !== panel) : uniqueSortedPanels([...prev, panel])
    );
  }

  async function runGenerate() {
    if (!selectedModel) return setError("Select a model first.");
    if (!Array.isArray(selectedModel.ref_image_urls) || selectedModel.ref_image_urls.length < 3) {
      return setError("This model needs at least 3 reference photos.");
    }
    const effItemType = itemType.trim();
    if (getSensitivityTier(effItemType, selectedModel.gender) === "high") {
      return setError(`Item type "${effItemType}" is blocked by app policy (intimates).`);
    }
    const chosen = genMode === "manual" ? uniqueSortedPanels(selectedPanels) : [...PANELS];
    if (!chosen.length) return setError("Pick at least one panel to generate.");
    setError(null);
    setGenerating(true);
    setResults([]);
    const startProgress: Record<number, string> = {};
    chosen.forEach((p) => (startProgress[p] = "queued"));
    setPanelProgress(startProgress);
    setStatus(poseFeas ? "Running pose-feasibility check, then generating…" : "Generating panels…");

    const styleInstr = normalizePromptInstruction(instruction);

    const genOne = async (panel: number): Promise<ResultImage[]> => {
      setPanelProgress((prev) => ({ ...prev, [panel]: "generating…" }));
      const [poseA, poseB] = getPanelPosePair(selectedModel.gender, panel);
      const panelLabel = getPanelButtonLabel(selectedModel.gender, panel);
      const prompt = buildMasterPanelPrompt({
        panelNumber: panel,
        panelLabel,
        poseA,
        poseB,
        modelName: selectedModel.name,
        modelGender: selectedModel.gender,
        modelRefs: selectedModel.ref_image_urls,
        itemRefs: uploadedItemRefs,
        itemType: effItemType,
        itemStyleInstructions: styleInstr,
      });
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          prompt,
          size: "1536x1024",
          modelRefs: selectedModel.ref_image_urls,
          itemRefs: uploadedItemRefs,
          panelQa: { panelNumber: panel, panelLabel, poseA, poseB, modelName: selectedModel.name, modelGender: selectedModel.gender, itemType: effItemType },
        }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) {
        const msg = json?.error?.message || (typeof json?.error === "string" ? json.error : "") || "Generation failed";
        throw new Error(msg);
      }
      if (json?.degraded) throw new Error(String(json?.warning || "Generation returned a degraded image."));
      const b64 = json?.imageBase64;
      if (!b64) throw new Error("No image returned.");
      setPanelProgress((prev) => ({ ...prev, [panel]: "splitting 3:4…" }));
      const { left, right } = await splitPanelToThreeByFour(b64);
      setPanelProgress((prev) => ({ ...prev, [panel]: "done" }));
      return [
        { id: `p${panel}-l`, panel, side: "left", label: `Panel ${panel} · Pose ${poseA}`, b64: left, selected: true },
        { id: `p${panel}-r`, panel, side: "right", label: `Panel ${panel} · Pose ${poseB}`, b64: right, selected: true },
      ];
    };

    const settled = await Promise.allSettled(chosen.map((p) => genOne(p)));
    const ok: ResultImage[] = [];
    const failures: string[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") ok.push(...s.value);
      else {
        failures.push(`Panel ${chosen[i]}: ${s.reason?.message || "failed"}`);
        setPanelProgress((prev) => ({ ...prev, [chosen[i]]: "failed" }));
      }
    });
    setResults(ok);
    setGenerating(false);
    if (failures.length && ok.length) setStatus(`Some panels failed: ${failures.join(" | ")}`);
    else if (failures.length) {
      setStatus(null);
      setError(failures.join(" | "));
    } else setStatus(`Generated ${ok.length} images from ${chosen.length} panel(s).`);
  }

  function toggleResult(id: string) {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  }

  // ---------- step 3: publish ----------
  async function goToPublish() {
    if (!product) return setError("No matched product to publish to.");
    const picked = results.filter((r) => r.selected);
    if (!picked.length) return setError("Select at least one image to publish.");
    setStep(3);
    setError(null);
    setPushed(false);
    setPublishBusy(true);
    setStatus("Preparing images and loading current product media…");
    try {
      const stagedById = new Map<string, { url: string; path: string }>();
      for (const r of picked) {
        const u = await uploadOne(b64ToFile(r.b64, `${product.handle}-${r.id}.png`));
        stagedById.set(r.id, u);
      }
      setResults((prev) =>
        prev.map((r) => (stagedById.has(r.id) ? { ...r, stagedUrl: stagedById.get(r.id)!.url, stagedPath: stagedById.get(r.id)!.path } : r))
      );

      const [mediaJson, variantsJson] = await Promise.all([
        fetch("/api/shopify-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get-product-media", shop: shop.trim(), productId: product.id }) }).then(parseJson),
        fetch("/api/shopify-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get-variants", shop: shop.trim(), productId: product.id }) }).then(parseJson),
      ]);
      setCurrentMedia(
        Array.isArray(mediaJson?.media)
          ? mediaJson.media.map((m: any) => ({ id: String(m?.id || ""), url: String(m?.url || ""), altText: String(m?.altText || "") }))
          : []
      );
      const rows = Array.isArray(variantsJson?.colors) ? variantsJson.colors : Array.isArray(variantsJson?.variants) ? variantsJson.variants : [];
      const firstPickedId = picked[0]?.id || null;
      setVariants(
        rows.map((row: any, idx: number) => ({
          id: String(row?.id || ""),
          color: String(row?.color || ""),
          position: Number(row?.position || idx + 1),
          imageUrl: row?.imageUrl ? String(row.imageUrl) : null,
          assignedResultId: firstPickedId,
          variantCount: Number(row?.variantCount || 1),
        }) as VariantRow)
      );

      setStatus("Writing SEO alt text…");
      await Promise.all(
        picked.map(async (r) => {
          const staged = stagedById.get(r.id);
          if (!staged) return;
          setResults((prev) => prev.map((x) => (x.id === r.id ? { ...x, altBusy: true } : x)));
          try {
            const resp = await fetch("/api/openai/image-alt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrl: staged.url, storagePath: staged.path, itemType: itemType.trim() || "apparel item" }),
            });
            const json = await parseJson(resp);
            const alt = String(json?.altText || "").trim();
            setResults((prev) => prev.map((x) => (x.id === r.id ? { ...x, altBusy: false, alt: alt || `${product.title} – ${selectedColor || ""} ${r.label}`.replace(/\s+/g, " ").trim() } : x)));
          } catch {
            setResults((prev) => prev.map((x) => (x.id === r.id ? { ...x, altBusy: false, alt: `${product.title} – ${r.label}` } : x)));
          }
        })
      );
      setStatus("Ready to publish.");
    } catch (e: any) {
      setError(e?.message || "Failed to prepare publish step.");
      setStatus(null);
    } finally {
      setPublishBusy(false);
    }
  }

  function setVariantImage(variantId: string, resultId: string) {
    setVariants((prev) => prev.map((v) => (v.id === variantId ? { ...v, assignedResultId: resultId } : v)));
  }
  function setResultAlt(id: string, alt: string) {
    setResults((prev) => prev.map((r) => (r.id === id ? { ...r, alt } : r)));
  }

  async function pushToShopify() {
    if (!product) return;
    const picked = results.filter((r) => r.selected);
    if (picked.find((r) => !String(r.alt || "").trim())) return setError("Every image needs alt text before publishing.");
    if (picked.find((r) => !r.stagedUrl)) return setError("Some images are still being prepared. Try again in a moment.");
    setError(null);
    setPushing(true);
    setStatus("Publishing to Shopify…");
    try {
      const images = picked.map((r) => ({ url: r.stagedUrl as string, altText: String(r.alt || "").trim(), storagePath: String(r.stagedPath || "") }));
      const indexByResult = new Map(picked.map((r, idx) => [r.id, idx]));
      const colorAssignments = variants
        .filter((v) => v.assignedResultId && indexByResult.has(v.assignedResultId))
        .map((v) => ({ color: v.color, imageIndex: indexByResult.get(v.assignedResultId as string) as number }));
      const colorOrder = variants.map((v) => v.color).filter(Boolean);
      const resp = await fetch("/api/shopify-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replace-product-images", shop: shop.trim(), productId: product.id, images, removeExisting: pubMode === "replace", colorAssignments, colorOrder }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Shopify push failed.");
      setPushed(true);
      setStatus(pubMode === "replace" ? `Replaced product media with ${images.length} new image(s). Alt text set on all.` : `Added ${images.length} new image(s) (kept existing). Alt text set on all.`);
    } catch (e: any) {
      setError(e?.message || "Shopify push failed.");
      setStatus(null);
    } finally {
      setPushing(false);
    }
  }

  // Generate SEO (title, meta description, body, tags ONLY) and target a 98-100 score.
  // Nothing is sent to Shopify here — only after the operator clicks "Publish SEO".
  async function optimizeSeo() {
    if (!product) return;
    setSeoBusy(true);
    setError(null);
    setSeoPublished(false);
    setStatus("Auditing current SEO…");
    try {
      const auditResp = await fetch("/api/shopify/seo-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: shop.trim(), productId: product.id }),
      });
      const audit = await parseJson(auditResp);
      if (!auditResp.ok) throw new Error(audit?.error || "SEO audit failed.");
      setSeoCurrentOverall(typeof audit?.scorecard?.overall === "number" ? audit.scorecard.overall : null);

      setStatus("Generating optimized SEO (targeting 98–100)…");
      let best: any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const resp = await fetch("/api/seo/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: audit.context, current: audit.current, useVision: false }),
        });
        const json = await parseJson(resp);
        if (!resp.ok) throw new Error(json?.error || "SEO optimize failed.");
        if (!best || (json?.proposedScorecard?.overall ?? 0) > (best?.proposedScorecard?.overall ?? 0)) best = json;
        if ((json?.proposedScorecard?.overall ?? 0) >= 98) break;
      }
      const p = best?.proposed || {};
      setSeo({
        seoTitle: String(p.seoTitle || ""),
        metaDescription: String(p.metaDescription || ""),
        bodyHtml: String(p.bodyHtml || ""),
        tags: Array.isArray(p.tags) ? p.tags.map((t: any) => String(t)) : [],
      });
      const card = best?.proposedScorecard;
      setSeoScore(card ? { overall: card.overall, grade: card.grade, fields: card.fields || {} } : null);
      setStatus(`Generated SEO — score ${card?.overall ?? "?"}/100${card && card.overall < 98 ? " (below 98 — try Regenerate)" : ""}.`);
    } catch (e: any) {
      setError(e?.message || "SEO optimize failed.");
      setStatus(null);
    } finally {
      setSeoBusy(false);
    }
  }

  function setSeoField<K extends keyof SeoProposed>(key: K, value: SeoProposed[K]) {
    setSeo((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function publishSeo() {
    if (!product || !seo) return;
    setSeoPublishing(true);
    setError(null);
    setStatus("Publishing SEO to Shopify…");
    try {
      const resp = await fetch("/api/shopify/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop.trim(),
          productId: product.id,
          fields: {
            seoTitle: seo.seoTitle,
            metaDescription: seo.metaDescription,
            bodyHtml: seo.bodyHtml,
            tags: seo.tags,
          },
        }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "SEO publish failed.");
      setSeoPublished(true);
      setStatus("SEO published to Shopify. Task complete. ✓");
    } catch (e: any) {
      setError(e?.message || "SEO publish failed.");
      setStatus(null);
    } finally {
      setSeoPublishing(false);
    }
  }

  function resetAll() {
    setStep(1);
    setBarcode("");
    setSearchResults([]);
    setSearchOpen(false);
    setProduct(null);
    setProductColors([]);
    setSelectedColor("");
    setItemType("");
    setInstruction("");
    setItemRefs([]);
    setGenMode("auto");
    setSelectedPanels([1, 2, 3, 4]);
    setPoseFeas(false);
    setResults([]);
    setPanelProgress({});
    setCurrentMedia([]);
    setVariants([]);
    setPubMode("replace");
    setPushed(false);
    setSeo(null);
    setSeoScore(null);
    setSeoCurrentOverall(null);
    setSeoPublished(false);
    setError(null);
    setStatus(null);
  }

  // ---------- render ----------
  return (
    <div className="v2-wrap">
      <style>{V2_CSS}</style>

      <div className="v2-head">
        <h1>OpenAI V2 Generator</h1>
        <p className="v2-sub">Streamlined 3-step flow: identify the product, generate, publish. Same models &amp; output as the original generator.</p>
      </div>

      <div className="v2-shop">
        <label className="v2-lbl">Shopify store</label>
        {shop && !editShop ? (
          <div className="v2-shopval">
            <span className={`v2-dotled ${shopConnected ? "on" : ""}`} />
            <b>{shop}</b>
            <span className="muted">· {shopConnected ? "connected" : "saved"}</span>
            <button className="v2-shopedit" onClick={() => setEditShop(true)}>change</button>
          </div>
        ) : (
          <div className="v2-row">
            <input className="v2-input" placeholder="yourstore.myshopify.com" value={shop} onChange={(e) => persistShop(e.target.value)} />
            {shop ? <button className="v2-btn ghost" onClick={() => setEditShop(false)}>Done</button> : null}
          </div>
        )}
      </div>

      <div className="v2-stepper">
        {[{ n: 1, t: "Identify & set up" }, { n: 2, t: "Generate" }, { n: 3, t: "Publish" }].map((s) => (
          <div key={s.n} className={`v2-step ${step === s.n ? "active" : ""} ${step > s.n ? "done" : ""}`}>
            <span className="v2-num">{s.n}</span>
            <b>{s.t}</b>
          </div>
        ))}
      </div>

      {error ? <div className="v2-banner err">{error}</div> : null}
      {status ? <div className="v2-banner ok">{status}</div> : null}

      {step === 1 ? (
        <section className="v2-panel">
          <h2>1 · Identify &amp; set up</h2>

          <label className="v2-lbl">Barcode / SKU</label>
          <div className="v2-searchwrap">
            <div className="v2-row">
              <div className="v2-grow" style={{ position: "relative" }}>
                <input
                  className="v2-input"
                  placeholder="Scan or type — results appear as you type…"
                  value={barcode}
                  onChange={(e) => onBarcodeChange(e.target.value)}
                  onFocus={() => searchResults.length && setSearchOpen(true)}
                />
                {searchOpen && (searchResults.length || searchBusy) ? (
                  <div className="v2-dropdown">
                    {searchBusy ? <div className="v2-dd-empty">Searching…</div> : null}
                    {searchResults.map((p) => (
                      <button key={p.id} className="v2-dd-item" onClick={() => selectProduct(p)}>
                        {p.images[0]?.url ? <img src={p.images[0].url} alt="" /> : <div className="v2-noimg sm" />}
                        <span className="v2-dd-title">{p.title}</span>
                        <span className="v2-dd-bc">{(p.barcodes || [])[0] || ""}</span>
                      </button>
                    ))}
                    {!searchBusy && !searchResults.length ? <div className="v2-dd-empty">No matches.</div> : null}
                  </div>
                ) : null}
              </div>
              <button className="v2-btn" onClick={() => runSearch(barcode.trim())}>Look up</button>
              <button className="v2-btn" title="Scan with camera" onClick={() => { setScanError(null); setScanChooserOpen(true); void openRemoteBarcodeScan(); }}>📷 Scan</button>
            </div>
          </div>

          {product ? (
            <div className="v2-card good">
              <div className="v2-kv"><span>Matched product</span><b>{product.title}</b></div>
              <div className="v2-kv"><span>Handle</span><span>/products/{product.handle}</span></div>
              {productColors.length ? (
                <div className="v2-kv col">
                  <span>Choose color variant <b className="v2-req">required</b></span>
                  <div className="v2-colors">
                    {productColors.map((c) => (
                      <button key={c} className={`v2-color ${selectedColor === c ? "sel" : ""}`} onClick={() => setSelectedColor(c)}>{c}</button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <label className="v2-lbl mt">Item type</label>
          <input className="v2-input" placeholder="e.g. Jeans, Tank Top, Dress…" value={itemType} onChange={(e) => setItemType(e.target.value)} />
          <div className="v2-presets">
            {ITEM_TYPE_PRESETS.map((p) => (
              <button key={p} className="v2-chip" onClick={() => setItemType(p)}>{p}</button>
            ))}
          </div>

          <label className="v2-lbl mt">Item instruction (optional)</label>
          <input className="v2-input" placeholder="e.g. oversized cut, super skinny fit, high-waist…" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <div className="v2-presets">
            {INSTRUCTION_PRESETS.map((p) => (
              <button key={p} className="v2-chip" onClick={() => setInstruction(p)}>{p}</button>
            ))}
          </div>

          <label className="v2-lbl mt">Model</label>
          <div className="v2-models">
            {models.map((m) => (
              <div key={m.model_id} className={`v2-model ${m.model_id === selectedModelId ? "sel" : ""}`} onClick={() => setSelectedModelId(m.model_id)}>
                <button className="v2-del" title="Delete model + its photos" onClick={(e) => { e.stopPropagation(); deleteModel(m); }}>×</button>
                {m.ref_image_urls[0] ? <img src={storagePreview(m.ref_image_urls[0])} alt="" /> : <div className="v2-noimg" />}
                <small>{m.name}</small>
                <small className="muted">{m.gender}</small>
              </div>
            ))}
            <div className="v2-model add" onClick={() => setAddModelOpen((v) => !v)}>
              <div className="v2-plus">＋</div>
              <small>Add model</small>
            </div>
          </div>

          {addModelOpen ? (
            <div className="v2-addmodel">
              <label className="v2-lbl">New model</label>
              <input className="v2-input" placeholder="Model name (e.g. Sofia)" value={mName} onChange={(e) => setMName(e.target.value)} />
              <label className="v2-lbl" style={{ marginTop: 12 }}>Gender</label>
              <div className="v2-seg">
                {(["female", "male"] as const).map((g) => (
                  <button key={g} className={`v2-segbtn ${mGender === g ? "active" : ""}`} onClick={() => setMGender(g)}>{g === "female" ? "Female" : "Male"}</button>
                ))}
              </div>
              <input ref={modelFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onModelFiles(e.target.files)} />
              <button className="v2-drop mt8" onClick={() => modelFileRef.current?.click()}>{mBusy ? "Saving…" : "Upload model photos (min 3)"}</button>
              <div className="v2-thumbs">
                {mRefs.map((r) => (
                  <div key={r.id} className="v2-thumb">
                    <img src={r.preview} alt="" />
                    {r.uploading ? <span className="v2-uploading">…</span> : null}
                    <span className="x" onClick={() => setMRefs((p) => p.filter((x) => x.id !== r.id))}>×</span>
                  </div>
                ))}
              </div>
              <div className="v2-row mt8">
                <button className="v2-btn primary" disabled={mBusy} onClick={saveModel}>💾 Save model to server</button>
                <button className="v2-btn ghost" onClick={() => setAddModelOpen(false)}>Cancel</button>
              </div>
            </div>
          ) : null}
          <div className="v2-hint">Models are stored on the server and reused across products. Deleting a model also deletes its photos from the server.</div>

          <label className="v2-lbl mt">Item reference photos</label>
          <input ref={itemFileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onItemFiles(e.target.files)} />
          <div className="v2-row">
            <button className="v2-drop" onClick={() => itemFileRef.current?.click()}>Upload item reference photos</button>
            <button className="v2-btn" title="Capture with camera" onClick={() => { setItemCamError(null); setItemCamChooserOpen(true); void openItemCameraRemote(); }}>📷 Camera</button>
          </div>
          <div className="v2-row" style={{ marginTop: 8 }}>
            <button className="v2-btn" disabled={!product} title={product ? "Add all images of this product" : "Match a product first"} onClick={importFromShopify}>⬇ Import from Shopify</button>
            <button className="v2-btn" onClick={() => void openDropboxSearch()}>🗂 Upload from Dropbox</button>
          </div>
          <div className="v2-thumbs">
            {itemRefs.map((r) => (
              <div key={r.id} className="v2-thumb">
                <img src={r.preview} alt="" />
                {r.uploading ? <span className="v2-uploading">…</span> : null}
                <span className="x" onClick={() => setItemRefs((p) => p.filter((x) => x.id !== r.id))}>×</span>
              </div>
            ))}
          </div>

          <div className="v2-actions">
            <div className="v2-spacer" />
            <button className="v2-btn primary" disabled={!canContinueToGenerate} onClick={() => setStep(2)}>Continue to Generate →</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="v2-panel">
          <h2>2 · Generate</h2>
          <p className="v2-lead">One run does panel generation + 3:4 split. Choose all panels (auto) or pick specific ones. Pose-feasibility runs only if you tick it.</p>

          <div className="v2-genopts">
            <div className="v2-optrow">
              <span className="v2-lbl" style={{ margin: 0 }}>Panels to generate</span>
              <div className="v2-seg">
                <button className={`v2-segbtn ${genMode === "auto" ? "active" : ""}`} onClick={() => setGenMode("auto")}>Auto · all panels</button>
                <button className={`v2-segbtn ${genMode === "manual" ? "active" : ""}`} onClick={() => setGenMode("manual")}>Manual · choose</button>
              </div>
            </div>
            {genMode === "manual" ? (
              <div className="v2-panelpick">
                {PANELS.map((p) => (
                  <label key={p} className={`v2-pp ${selectedPanels.includes(p) ? "on" : ""}`}>
                    <input type="checkbox" checked={selectedPanels.includes(p)} onChange={() => togglePanel(p)} />
                    {getPanelButtonLabel(gender, p)}
                  </label>
                ))}
              </div>
            ) : null}
            <label className="v2-check">
              <input type="checkbox" checked={poseFeas} onChange={(e) => setPoseFeas(e.target.checked)} />
              <span>Run <b>pose-feasibility</b> check first</span>
              <small>optional — only runs when ticked (recommended for dresses / sets / swimwear)</small>
            </label>
          </div>

          <div className="v2-actions">
            <button className="v2-btn primary" disabled={generating} onClick={runGenerate}>{generating ? "Generating…" : results.length ? "↻ Regenerate" : "⚡ Generate"}</button>
            <button className="v2-btn ghost" onClick={() => setStep(1)}>← Back</button>
            <div className="v2-spacer" />
            <span className="v2-hint" style={{ margin: 0 }}>{results.length ? `${selectedResults.length} of ${results.length} selected` : ""}</span>
          </div>

          {generating || Object.keys(panelProgress).length ? (
            <div className="v2-prog">
              {uniqueSortedPanels(Object.keys(panelProgress).map(Number)).map((p) => (
                <div key={p} className="v2-progrow">
                  <span>Panel {p}</span>
                  <span className={`v2-progstate ${panelProgress[p]}`}>{panelProgress[p]}</span>
                </div>
              ))}
            </div>
          ) : null}

          {results.length ? (
            <>
              <div className="v2-results">
                {results.map((r) => (
                  <div key={r.id} className={`v2-res ${r.selected ? "sel" : ""}`} onClick={() => toggleResult(r.id)}>
                    <div className="v2-tick">{r.selected ? "✓" : ""}</div>
                    <div className="v2-qa">QA ✓</div>
                    <button className="v2-zoom" title="Zoom in" onClick={(e) => { e.stopPropagation(); setZoom(r); }}>⛶</button>
                    <img src={dataUrlFromB64(r.b64)} alt={r.label} />
                    <div className="v2-meta">{r.label}</div>
                  </div>
                ))}
              </div>
              <div className="v2-actions">
                <div className="v2-hint" style={{ margin: 0 }}>Untick anything you don&apos;t want.</div>
                <div className="v2-spacer" />
                <button className="v2-btn primary" disabled={!selectedResults.length} onClick={goToPublish}>Continue to Publish →</button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="v2-panel">
          <h2>3 · Publish</h2>
          <p className="v2-lead">Product is matched from the barcode. Review current media, choose replace vs add, confirm alt text &amp; the main image per variant, then push.</p>

          {product ? (
            <div className="v2-card good">
              <div className="v2-kv"><span>Publishing to</span><b>{product.title}{selectedColor ? ` · ${selectedColor}` : ""}</b></div>
              <div className="v2-kv"><span>New images</span><span>{selectedResults.length}</span></div>
            </div>
          ) : null}

          <label className="v2-lbl mt">Current images on this product</label>
          <div className="v2-curgrid">
            {currentMedia.length ? currentMedia.map((m) => (<div key={m.id} className="v2-cur"><img src={m.url} alt={m.altText} /></div>)) : <div className="v2-hint" style={{ margin: 0 }}>{publishBusy ? "Loading…" : "No current images."}</div>}
          </div>

          <div className="v2-choice">
            <div className={`v2-opt ${pubMode === "replace" ? "sel" : ""}`} onClick={() => setPubMode("replace")}>
              <span className="v2-dot" />
              <div><b>Replace — wipe current &amp; upload new</b><small>removes the images above, then adds the generated ones</small></div>
            </div>
            <div className={`v2-opt ${pubMode === "add" ? "sel" : ""}`} onClick={() => setPubMode("add")}>
              <span className="v2-dot" />
              <div><b>Keep current + add new</b><small>existing images stay; generated ones are appended</small></div>
            </div>
          </div>

          {variants.length ? (
            <>
              <label className="v2-lbl mt">Main image per variant</label>
              <div className="v2-variants">
                {variants.map((v) => (
                  <div key={v.id} className="v2-variant">
                    <div className="v2-vh"><b>{v.color || "Variant"}</b><small>· {v.variantCount} variant(s) — pick the featured image</small></div>
                    <div className="v2-vpics">
                      {selectedResults.map((r) => (
                        <div key={r.id} className={`v2-vpic ${v.assignedResultId === r.id ? "main" : ""}`} onClick={() => setVariantImage(v.id, r.id)}>
                          <img src={dataUrlFromB64(r.b64)} alt="" />
                          <span className="star">★</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <label className="v2-lbl mt">Alt text (SEO) on new images — auto-generated, editable</label>
          <div className="v2-altlist">
            {selectedResults.map((r) => (
              <div key={r.id} className="v2-altrow">
                <img src={dataUrlFromB64(r.b64)} alt="" />
                <input className="v2-input" value={r.alt || ""} placeholder={r.altBusy ? "Writing alt text…" : "Alt text…"} onChange={(e) => setResultAlt(r.id, e.target.value)} />
              </div>
            ))}
          </div>

          <div className="v2-actions">
            <button className="v2-btn primary" disabled={pushing || publishBusy || pushed} onClick={pushToShopify}>{pushing ? "Publishing…" : pushed ? "✓ Images published" : pubMode === "replace" ? "Push to Shopify · replace all media" : "Push to Shopify · add to existing"}</button>
            {pushed && !seo ? <button className="v2-btn cyan" disabled={seoBusy} onClick={optimizeSeo}>{seoBusy ? "Generating…" : "✨ Optimize SEO"}</button> : null}
            <button className="v2-btn ghost" onClick={() => setStep(2)}>← Back</button>
          </div>

          {seo ? (
            <div className="v2-seo">
              <div className="v2-seohead">
                <div className="v2-scorebig">
                  <span className="v2-scorenum">{seoScore?.overall ?? "—"}</span>
                  <span className="v2-scoremax">/100</span>
                  {seoScore ? <span className={`v2-grade g${seoScore.grade}`}>{seoScore.grade}</span> : null}
                </div>
                <div className="v2-scoremeta">
                  <div className="v2-scorelabel">SEO readiness score (Google on-page grader)</div>
                  {seoCurrentOverall != null ? <div className="v2-scoreprev">was {seoCurrentOverall}/100 before</div> : null}
                  {seoScore && seoScore.overall < 98 ? <div className="v2-scorewarn">Below 98 — click Regenerate to push it higher.</div> : null}
                </div>
                <button className="v2-btn ghost" disabled={seoBusy} onClick={optimizeSeo}>{seoBusy ? "…" : "↻ Regenerate"}</button>
              </div>

              <div className="v2-scorefields">
                {([["seoTitle", "SEO title"], ["metaDescription", "Meta description"], ["bodyHtml", "Body description"], ["tags", "Tags"]] as const).map(([k, label]) => (
                  <span key={k} className="v2-fieldscore">{label} <b>{seoScore?.fields?.[k]?.score ?? "—"}</b></span>
                ))}
              </div>

              <label className="v2-lbl mt">SEO title</label>
              <input className="v2-input" value={seo.seoTitle} onChange={(e) => setSeoField("seoTitle", e.target.value)} />

              <label className="v2-lbl mt">Meta description</label>
              <textarea className="v2-input" rows={2} value={seo.metaDescription} onChange={(e) => setSeoField("metaDescription", e.target.value)} />

              <label className="v2-lbl mt">Body description</label>
              <textarea className="v2-input" rows={6} value={seo.bodyHtml} onChange={(e) => setSeoField("bodyHtml", e.target.value)} />

              <label className="v2-lbl mt">Tags</label>
              <input className="v2-input" value={seo.tags.join(", ")} onChange={(e) => setSeoField("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />

              <div className="v2-actions">
                <button className="v2-btn primary" disabled={seoPublishing || seoPublished} onClick={publishSeo}>{seoPublishing ? "Publishing…" : seoPublished ? "✓ SEO published" : "Publish SEO to Shopify"}</button>
                {seoPublished ? <button className="v2-btn ghost" onClick={resetAll}>↺ Start another product</button> : null}
              </div>
            </div>
          ) : pushed ? (
            <div className="v2-actions">
              <button className="v2-btn ghost" onClick={resetAll}>↺ Start another product</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {zoom ? (
        <div className="v2-lb" onClick={() => setZoom(null)}>
          <button className="v2-lbclose" onClick={() => setZoom(null)}>×</button>
          <div className="v2-frame" onClick={(e) => e.stopPropagation()}>
            <img src={dataUrlFromB64(zoom.b64)} alt={zoom.label} />
            <div className="v2-cap">{zoom.label}</div>
          </div>
        </div>
      ) : null}

      {/* barcode scan chooser — this-device button + QR for another device inline under it */}
      {scanChooserOpen ? (
        <div className="v2-modal" onClick={() => { setScanChooserOpen(false); setScanRemotePolling(false); stopScanRemotePoll(); }}>
          <div className="v2-modalcard" onClick={(e) => e.stopPropagation()}>
            <div className="v2-modalhead"><b>Scan barcode</b><button className="v2-btn ghost" onClick={() => { setScanChooserOpen(false); setScanRemotePolling(false); stopScanRemotePoll(); }}>Close</button></div>
            <button className="v2-btn primary" style={{ width: "100%" }} onClick={() => { setScanChooserOpen(false); setScanRemotePolling(false); stopScanRemotePoll(); setScanError(null); setScanLocalOpen(true); }}>Use this device camera</button>
            <div className="v2-qrblock">
              <div className="v2-qrlabel">or scan with another device</div>
              {scanRemoteQr ? <img className="v2-qr" src={scanRemoteQr} alt="QR code" /> : <div className="v2-qr v2-qrloading">Loading QR…</div>}
              <div className="v2-hint" style={{ textAlign: "center" }}>Scan this QR on your phone, then scan the barcode there. The phone camera turns off automatically once scanned.</div>
            </div>
            {scanError ? <div className="v2-banner err" style={{ marginTop: 12 }}>{scanError}</div> : null}
          </div>
        </div>
      ) : null}

      {/* barcode local camera */}
      {scanLocalOpen ? (
        <div className="v2-modal" onClick={() => setScanLocalOpen(false)}>
          <div className="v2-modalcard" onClick={(e) => e.stopPropagation()}>
            <div className="v2-modalhead"><b>Scan barcode</b><button className="v2-btn ghost" onClick={() => setScanLocalOpen(false)}>Close</button></div>
            <div className="v2-scanframe"><video ref={scanVideoRef} className="v2-scanvideo" playsInline muted autoPlay /><div className="v2-scanguide" /></div>
            <div className="v2-hint" style={{ textAlign: "center" }}>Align the barcode inside the frame.</div>
            {scanError ? <div className="v2-banner err" style={{ marginTop: 12 }}>{scanError}</div> : null}
          </div>
        </div>
      ) : null}

      {/* item camera chooser — this-device button + QR for another device inline under it */}
      {itemCamChooserOpen ? (
        <div className="v2-modal" onClick={() => { setItemCamChooserOpen(false); setItemCamRemotePolling(false); stopItemCamPoll(); }}>
          <div className="v2-modalcard" onClick={(e) => e.stopPropagation()}>
            <div className="v2-modalhead"><b>Add item photos from camera</b><button className="v2-btn ghost" onClick={() => { setItemCamChooserOpen(false); setItemCamRemotePolling(false); stopItemCamPoll(); }}>Close</button></div>
            <button className="v2-btn primary" style={{ width: "100%" }} onClick={() => { setItemCamChooserOpen(false); setItemCamRemotePolling(false); stopItemCamPoll(); itemFileRef.current?.click(); }}>Use this device (file/camera)</button>
            <div className="v2-qrblock">
              <div className="v2-qrlabel">or use another device</div>
              {itemCamRemoteQr ? <img className="v2-qr" src={itemCamRemoteQr} alt="QR code" /> : <div className="v2-qr v2-qrloading">Loading QR…</div>}
              <div className="v2-hint" style={{ textAlign: "center" }}>Scan the QR on your phone, then take photos. Each appears here automatically — you can upload multiple.</div>
            </div>
            {itemCamError ? <div className="v2-banner err" style={{ marginTop: 12 }}>{itemCamError}</div> : null}
          </div>
        </div>
      ) : null}

      {/* Dropbox search results */}
      {dropboxOpen ? (
        <div className="v2-modal" onClick={() => setDropboxOpen(false)}>
          <div className="v2-modalcard v2-modalwide" onClick={(e) => e.stopPropagation()}>
            <div className="v2-modalhead"><b>Dropbox · elior perez</b><button className="v2-btn ghost" onClick={() => setDropboxOpen(false)}>Close</button></div>
            {dropboxBusy ? <div className="v2-hint">Searching “{barcode.trim()}”…</div> : null}
            {!dropboxBusy && !dropboxResults.length ? <div className="v2-hint">No image files found for “{barcode.trim()}”.</div> : null}
            {dropboxResults.length ? (
              <>
                <div className="v2-row" style={{ justifyContent: "space-between" }}>
                  <span className="v2-hint" style={{ margin: 0 }}>{dropboxResults.length} image(s) found</span>
                  <button className="v2-btn" onClick={() => { dropboxResults.forEach((d) => importRemoteToItemRef(d.temporaryLink, d.title)); setDropboxOpen(false); }}>Add all</button>
                </div>
                <div className="v2-dbgrid">
                  {dropboxResults.map((d) => (
                    <button key={d.id} className="v2-dbcell" onClick={() => { importRemoteToItemRef(d.temporaryLink, d.title); }} title={d.title}>
                      <img src={d.temporaryLink} alt={d.title} />
                      <span>{d.title}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {dropboxError ? <div className="v2-banner err" style={{ marginTop: 12 }}>{dropboxError}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const V2_CSS = `
.v2-wrap{
  --fg:#f8fafc;--muted:rgba(226,232,240,0.72);
  --panel-bg:rgba(255,255,255,0.06);--panel-border:rgba(255,255,255,0.12);
  --control-bg:rgba(12,8,22,0.42);--control-border:rgba(255,255,255,0.28);
  --accent:#4bc99a;--accent-border:rgba(75,201,154,0.6);
  max-width:1000px;margin:0 auto;padding:8px 4px 80px;color:var(--fg);
  font:15px/1.5 "Space Grotesk",system-ui,"Segoe UI",Roboto,Arial,sans-serif}
.v2-wrap *{box-sizing:border-box}
.v2-head h1{font-size:22px;margin:0 0 2px}
.v2-sub{color:var(--muted);font-size:13px;margin:0 0 14px}
.v2-shop{margin:0 0 14px}
.v2-shopval{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.05);border:1px solid var(--panel-border);border-radius:12px;padding:11px 14px;font-size:14px}
.v2-shopval .muted{color:var(--muted)}
.v2-dotled{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.35);flex:none}
.v2-dotled.on{background:var(--accent);box-shadow:0 0 0 3px rgba(75,201,154,.2)}
.v2-shopedit{margin-left:auto;background:none;border:none;color:#7dd3c0;font:inherit;font-size:13px;cursor:pointer;text-decoration:underline}
.v2-lbl{display:block;font-size:0.72rem;color:var(--muted);font-weight:700;margin:0 0 6px;letter-spacing:.1em;text-transform:uppercase}
.v2-lbl.mt,.mt{margin-top:18px}
.v2-req{color:#fca5a5;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.v2-input{width:100%;background:var(--control-bg);border:1px solid var(--control-border);border-radius:12px;color:var(--fg);padding:11px 14px;font:inherit;font-size:14px;min-height:48px}
.v2-input:focus{outline:none;border-color:rgba(255,255,255,.42);box-shadow:0 0 0 3px rgba(148,163,184,.14)}
.v2-input::placeholder{color:rgba(203,213,225,.62)}
.v2-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.v2-grow{flex:1;min-width:220px}
.v2-searchwrap{position:relative}
.v2-dropdown{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:20;background:rgba(20,16,30,0.96);backdrop-filter:blur(16px);border:1px solid var(--panel-border);border-radius:12px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45);max-height:340px;overflow-y:auto}
.v2-dd-item{display:flex;align-items:center;gap:10px;width:100%;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.06);color:var(--fg);padding:9px 12px;cursor:pointer;text-align:left;font:inherit}
.v2-dd-item:hover{background:rgba(255,255,255,.08)}
.v2-dd-item img{width:38px;height:38px;border-radius:7px;object-fit:cover;flex:none}
.v2-dd-title{flex:1;font-size:13px}
.v2-dd-bc{font-size:11px;color:var(--muted)}
.v2-dd-empty{padding:12px;color:var(--muted);font-size:13px}
.v2-noimg{width:80px;height:80px;border-radius:8px;background:rgba(255,255,255,.06)}
.v2-noimg.sm{width:38px;height:38px}
.v2-stepper{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}
.v2-step{display:flex;align-items:center;gap:8px;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:12px;padding:9px 14px;flex:1;min-width:170px;opacity:.6;backdrop-filter:blur(16px) saturate(1.1)}
.v2-step.active{opacity:1;border-color:var(--accent-border);box-shadow:0 0 0 1px var(--accent-border) inset}
.v2-step.done{opacity:1;border-color:rgba(75,201,154,.4)}
.v2-num{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:rgba(255,255,255,.1);color:var(--muted);font-size:12px}
.v2-step.active .v2-num{background:var(--accent);color:#04261b}
.v2-step.done .v2-num{background:var(--accent);color:#04261b}
.v2-banner{border-radius:12px;padding:10px 13px;margin:0 0 14px;font-size:13px;font-weight:600;backdrop-filter:blur(12px)}
.v2-banner.err{background:rgba(248,113,113,.14);border:1px solid rgba(248,113,113,.4);color:#fecaca}
.v2-banner.ok{background:rgba(75,201,154,.12);border:1px solid rgba(75,201,154,.4);color:#bbf7e3}
.v2-panel{background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:16px;padding:20px;backdrop-filter:blur(16px) saturate(1.1);box-shadow:0 2px 12px rgba(0,0,0,.08)}
.v2-panel h2{margin:0 0 4px;font-size:18px}
.v2-lead{color:var(--muted);font-size:13px;margin:0 0 14px}
.v2-btn{font:inherit;cursor:pointer;border-radius:10px;border:1.5px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:var(--fg);padding:10px 16px;font-weight:600;min-height:42px}
.v2-btn:hover{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.36)}
.v2-btn.primary{background:linear-gradient(180deg,#4bc99a 0%,#3fb88b 50%,#38a87e 100%);border:1px solid rgba(255,255,255,.35);color:#fff;font-weight:700}
.v2-btn.primary:hover{background:linear-gradient(180deg,#52d1a3 0%,#45c494 50%,#3fb88b 100%)}
.v2-btn.primary:disabled{opacity:.45;cursor:not-allowed}
.v2-btn.ghost{background:transparent;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.75)}
.v2-btn.cyan{background:linear-gradient(180deg,#22d3ee,#0891b2);border:none;color:#04222a;font-weight:700}
.v2-card{background:rgba(255,255,255,.05);border:1px solid var(--panel-border);border-radius:14px;padding:14px;margin-top:14px}
.v2-card.good{border-color:rgba(75,201,154,.4)}
.v2-kv{display:flex;justify-content:flex-start;gap:8px;padding:6px 0;border-bottom:1px dashed rgba(255,255,255,.1);font-size:14px}
.v2-kv span:first-child::after{content:":"}
.v2-kv:last-child{border-bottom:none}
.v2-kv.col{flex-direction:column;align-items:flex-start;gap:8px}
.v2-kv span:first-child{color:var(--muted)}
.v2-colors{display:flex;gap:8px;flex-wrap:wrap}
.v2-color{font-size:13px;border:1px solid var(--control-border);border-radius:9px;padding:7px 13px;background:var(--control-bg);color:var(--fg);cursor:pointer}
.v2-color.sel{border-color:var(--accent);background:rgba(75,201,154,.18);color:#fff}
.v2-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.v2-chip{font-size:12px;border:1px solid var(--control-border);border-radius:8px;padding:6px 11px;background:var(--control-bg);color:var(--fg);cursor:pointer}
.v2-chip:hover{border-color:var(--accent)}
.v2-models{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.v2-model{position:relative;border:1px solid var(--panel-border);border-radius:12px;padding:8px;width:96px;text-align:center;cursor:pointer;background:rgba(255,255,255,.04)}
.v2-model.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.v2-model img{width:80px;height:80px;border-radius:8px;object-fit:cover;display:block}
.v2-model small{display:block;font-size:11px;margin-top:4px}
.v2-model small.muted{color:var(--muted)}
.v2-model .v2-del{position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);border:none;display:grid;place-items:center;font-size:12px;color:#fff;cursor:pointer;opacity:0}
.v2-model:hover .v2-del{opacity:1}
.v2-model.add{display:grid;place-items:center;color:var(--muted);border-style:dashed;min-height:113px}
.v2-plus{font-size:24px}
.v2-addmodel{margin-top:10px;background:rgba(255,255,255,.04);border:1px solid var(--panel-border);border-radius:12px;padding:14px}
.v2-seg{display:inline-flex;background:rgba(0,0,0,.25);border:1px solid var(--panel-border);border-radius:10px;padding:3px;margin-top:6px}
.v2-segbtn{background:transparent;border:none;padding:7px 12px;font-size:13px;border-radius:8px;color:var(--muted);cursor:pointer;font:inherit}
.v2-segbtn.active{background:var(--accent);color:#04261b;font-weight:700}
.v2-drop{flex:1;min-width:220px;border:2px dashed rgba(255,255,255,.22);border-radius:12px;padding:14px;text-align:center;color:var(--muted);background:rgba(255,255,255,.03);cursor:pointer;font:inherit}
.v2-drop:hover{border-color:var(--accent);color:var(--fg)}
.v2-drop.mt8,.mt8{margin-top:8px}
.v2-thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.v2-thumb{position:relative;width:64px;height:84px;border-radius:9px;overflow:hidden;border:1px solid var(--panel-border);background:rgba(255,255,255,.04)}
.v2-thumb img{width:100%;height:100%;object-fit:cover}
.v2-thumb .x{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.6);border-radius:50%;width:18px;height:18px;display:grid;place-items:center;font-size:12px;color:#fff;cursor:pointer}
.v2-uploading{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.4);color:#fff;font-size:18px;letter-spacing:2px}
.v2-hint{font-size:12px;color:var(--muted);margin-top:10px}
.v2-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;align-items:center}
.v2-spacer{flex:1}
.v2-genopts{background:rgba(255,255,255,.04);border:1px solid var(--panel-border);border-radius:12px;padding:14px}
.v2-optrow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.v2-panelpick{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.v2-pp{display:flex;align-items:center;gap:7px;border:1px solid var(--panel-border);border-radius:9px;padding:7px 11px;background:rgba(0,0,0,.2);cursor:pointer;font-size:13px}
.v2-pp.on{border-color:var(--accent);color:var(--fg)}
.v2-check{display:flex;align-items:center;gap:9px;margin-top:13px;font-size:14px;cursor:pointer;flex-wrap:wrap}
.v2-check small{color:var(--muted)}
.v2-prog{margin-top:14px;background:rgba(255,255,255,.04);border:1px solid var(--panel-border);border-radius:12px;padding:10px 14px}
.v2-progrow{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.1)}
.v2-progrow:last-child{border-bottom:none}
.v2-progstate{color:var(--muted)}
.v2-progstate.done{color:var(--accent);font-weight:700}
.v2-progstate.failed{color:#fca5a5;font-weight:700}
.v2-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:16px}
.v2-res{position:relative;background:rgba(255,255,255,.04);border:1px solid var(--panel-border);border-radius:12px;overflow:hidden;cursor:pointer}
.v2-res.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.v2-res img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
.v2-meta{padding:7px 9px;font-size:12px;color:var(--muted)}
.v2-tick{position:absolute;top:7px;left:7px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.55);display:grid;place-items:center;font-size:13px;border:1px solid var(--panel-border)}
.v2-res.sel .v2-tick{background:var(--accent);border-color:var(--accent);color:#04261b}
.v2-qa{position:absolute;top:7px;right:7px;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(75,201,154,.2);color:#bbf7e3}
.v2-zoom{position:absolute;bottom:34px;right:7px;width:26px;height:26px;border-radius:8px;background:rgba(0,0,0,.6);border:1px solid var(--panel-border);display:grid;place-items:center;font-size:13px;cursor:zoom-in;color:#fff}
.v2-zoom:hover{background:var(--accent);border-color:var(--accent)}
.v2-curgrid{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.v2-cur{width:62px;height:82px;border-radius:8px;overflow:hidden;border:1px solid var(--panel-border)}
.v2-cur img{width:100%;height:100%;object-fit:cover}
.v2-choice{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.v2-opt{flex:1;min-width:230px;border:1px solid var(--panel-border);border-radius:12px;padding:12px 14px;background:rgba(255,255,255,.04);cursor:pointer;display:flex;gap:11px;align-items:flex-start}
.v2-opt.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.v2-opt .v2-dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--muted);flex:none;margin-top:1px}
.v2-opt.sel .v2-dot{border-color:var(--accent);background:var(--accent);box-shadow:inset 0 0 0 3px rgba(20,16,30,.9)}
.v2-opt b{font-size:14px}
.v2-opt small{color:var(--muted);display:block;font-size:12px;margin-top:2px}
.v2-variants{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.v2-variant{background:rgba(255,255,255,.04);border:1px solid var(--panel-border);border-radius:12px;padding:12px 14px}
.v2-vh{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.v2-vh small{color:var(--muted);font-size:12px}
.v2-vpics{display:flex;gap:8px;flex-wrap:wrap}
.v2-vpic{position:relative;width:56px;height:74px;border-radius:8px;overflow:hidden;border:2px solid transparent;cursor:pointer}
.v2-vpic img{width:100%;height:100%;object-fit:cover;display:block}
.v2-vpic.main{border-color:var(--accent)}
.v2-vpic .star{position:absolute;top:2px;left:2px;font-size:11px;background:var(--accent);color:#04261b;border-radius:5px;padding:0 4px;display:none}
.v2-vpic.main .star{display:block}
.v2-altlist{margin-top:10px;display:flex;flex-direction:column;gap:8px}
.v2-altrow{display:flex;gap:10px;align-items:center}
.v2-altrow img{width:34px;height:45px;border-radius:6px;object-fit:cover;flex:none}
.v2-lb{position:fixed;inset:0;background:rgba(4,3,10,.86);display:grid;place-items:center;z-index:60;padding:24px}
.v2-lbclose{position:absolute;top:18px;right:22px;font-size:28px;color:#fff;cursor:pointer;background:none;border:none}
.v2-frame{max-width:min(92vw,520px);max-height:92vh;display:flex;flex-direction:column;gap:10px}
.v2-frame img{width:100%;height:auto;border-radius:14px;border:1px solid var(--panel-border)}
.v2-cap{color:#fff;font-weight:700}
.v2-modal{position:fixed;inset:0;background:rgba(4,3,10,.8);display:grid;place-items:center;z-index:55;padding:20px}
.v2-modalcard{width:min(94vw,420px);background:rgba(20,16,30,0.97);border:1px solid var(--panel-border);border-radius:16px;padding:18px;backdrop-filter:blur(16px)}
.v2-modalhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.v2-modalactions{display:flex;flex-direction:column;gap:10px}
.v2-qr{display:block;margin:0 auto;width:240px;height:240px;border-radius:12px;background:#fff;padding:8px}
.v2-qrloading{display:grid;place-items:center;color:#888;font-size:13px}
.v2-qrblock{margin-top:14px;border-top:1px solid var(--panel-border);padding-top:14px}
.v2-qrlabel{text-align:center;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
.v2-modalwide{width:min(94vw,640px)}
.v2-dbgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-top:12px;max-height:60vh;overflow-y:auto}
.v2-dbcell{display:flex;flex-direction:column;gap:5px;background:rgba(255,255,255,.04);border:1px solid var(--panel-border);border-radius:10px;padding:6px;cursor:pointer;color:var(--fg);font:inherit}
.v2-dbcell:hover{border-color:var(--accent)}
.v2-dbcell img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:7px}
.v2-dbcell span{font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v2-scanframe{position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:4/3}
.v2-scanvideo{width:100%;height:100%;object-fit:cover}
.v2-scanguide{position:absolute;inset:18% 12%;border:2px solid rgba(75,201,154,.8);border-radius:10px;pointer-events:none}
.v2-seo{margin-top:16px;border-top:1px solid var(--panel-border);padding-top:16px}
.v2-seohead{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.v2-scorebig{display:flex;align-items:baseline;gap:4px}
.v2-scorenum{font-size:38px;font-weight:800;color:var(--accent)}
.v2-scoremax{font-size:15px;color:var(--muted)}
.v2-grade{margin-left:8px;font-size:14px;font-weight:800;border-radius:8px;padding:2px 9px;background:rgba(75,201,154,.18);color:#bbf7e3}
.v2-grade.gC,.v2-grade.gD,.v2-grade.gF{background:rgba(251,191,36,.18);color:#fcd34d}
.v2-scoremeta{flex:1;min-width:180px}
.v2-scorelabel{font-size:13px;font-weight:700}
.v2-scoreprev{font-size:12px;color:var(--muted)}
.v2-scorewarn{font-size:12px;color:#fcd34d;margin-top:2px}
.v2-scorefields{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.v2-fieldscore{font-size:12px;color:var(--muted);border:1px solid var(--panel-border);border-radius:8px;padding:5px 10px;background:rgba(255,255,255,.03)}
.v2-fieldscore b{color:var(--fg)}
`;
