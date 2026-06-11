"use client";

// OpenAI V2 Generator — streamlined 3-step flow (Identify → Generate → Publish).
//
// This is a NEW page. The original generator at /studio/images is untouched.
// It reuses the existing backend endpoints and the shared generation core in
// lib/panelGeneration.ts so output behavior matches the original generator:
//   - /api/models/list, /api/models, /api/models/upload, /api/models/delete
//   - /api/shopify/catalog            (barcode → product)
//   - /api/generate                   (gpt-image panel; we split to 3:4 client-side)
//   - /api/shopify-push               (get-product-media / get-variants / replace-product-images)
//   - /api/openai/image-alt           (auto SEO alt text)
//
// Gender is a property of the chosen MODEL (catalog has no gender). The selected
// model's gender drives the pose set, exactly like the original generator.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMasterPanelPrompt,
  getPanelButtonLabel,
  getPanelPosePair,
  getSensitivityTier,
  normalizePromptInstruction,
  splitPanelToThreeByFour,
  uniqueSortedPanels,
} from "@/lib/panelGeneration";

// IndexedDB hand-off keys — must match components/studio-workspace.tsx so the SEO
// Manager picks up the same transfer record.
const PUSH_TRANSFER_DB = "carbon_studio_transfer";
const PUSH_TRANSFER_STORE = "push";
const PUSH_TRANSFER_RECORD_ID = "current";
const SHOP_STORAGE_KEY = "cg_v2_shop_domain";

const PANELS = [1, 2, 3, 4];

const ITEM_TYPE_PRESETS = [
  "Jeans",
  "T-Shirt",
  "Shirt",
  "Dress",
  "Co-ord Set",
  "Jacket",
  "Shorts",
  "Skirt",
  "Hoodie",
  "Swimwear",
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

type ResultImage = {
  id: string;
  panel: number;
  side: "left" | "right";
  label: string;
  b64: string;
  selected: boolean;
  // populated when entering Publish
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

function dataUrlFromB64(b64: string) {
  return `data:image/png;base64,${b64}`;
}

function b64ToFile(b64: string, fileName: string): File {
  const byteString = atob(b64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) bytes[i] = byteString.charCodeAt(i);
  return new File([bytes], fileName, { type: "image/png" });
}

async function parseJson(resp: Response): Promise<any> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

async function savePushTransfer(payload: unknown): Promise<void> {
  const db: IDBDatabase = await new Promise((resolve, reject) => {
    const req = window.indexedDB.open(PUSH_TRANSFER_DB, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(PUSH_TRANSFER_STORE)) d.createObjectStore(PUSH_TRANSFER_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PUSH_TRANSFER_STORE, "readwrite");
      tx.objectStore(PUSH_TRANSFER_STORE).put(payload, PUSH_TRANSFER_RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
    });
  } finally {
    db.close();
  }
}

export default function OpenAiV2Workspace() {
  const [shop, setShop] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // step 1 — identify
  const [barcode, setBarcode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [candidates, setCandidates] = useState<CatalogProduct[]>([]);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [itemType, setItemType] = useState("");
  const [instruction, setInstruction] = useState("");

  // models
  const [models, setModels] = useState<ModelRow[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [addModelOpen, setAddModelOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mGender, setMGender] = useState<"female" | "male">("female");
  const [mRefUrls, setMRefUrls] = useState<string[]>([]);
  const [mBusy, setMBusy] = useState(false);
  const modelFileRef = useRef<HTMLInputElement | null>(null);

  // item references
  const [itemRefs, setItemRefs] = useState<string[]>([]);
  const [itemRefBusy, setItemRefBusy] = useState(false);
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

  const selectedModel = useMemo(
    () => models.find((m) => m.model_id === selectedModelId) || null,
    [models, selectedModelId]
  );
  const gender = selectedModel?.gender || "";
  const selectedResults = results.filter((r) => r.selected);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SHOP_STORAGE_KEY);
      if (saved) setShop(saved);
    } catch {
      /* ignore */
    }
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

  // ---------- step 1: barcode → product ----------
  async function lookup() {
    const shopValue = shop.trim();
    const code = barcode.trim();
    if (!shopValue) {
      setError("Enter your shop domain first (e.g. yourstore.myshopify.com).");
      return;
    }
    if (!code) {
      setError("Scan or type a barcode/SKU first.");
      return;
    }
    setError(null);
    setStatus("Looking up product…");
    setLookupBusy(true);
    setCandidates([]);
    try {
      const params = new URLSearchParams({ shop: shopValue, first: "40", includeCount: "0", q: code });
      const resp = await fetch(`/api/shopify/catalog?${params.toString()}`, { cache: "no-store" });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to search Shopify catalog.");
      const products: CatalogProduct[] = Array.isArray(json?.products) ? json.products : [];
      const lc = code.toLowerCase();
      const exact = products.find((p) =>
        (p.barcodes || []).some((b) => String(b || "").trim().toLowerCase() === lc)
      );
      if (exact) {
        selectProduct(exact);
      } else if (products.length === 1) {
        selectProduct(products[0]);
      } else if (products.length) {
        setCandidates(products);
        setStatus(`No exact barcode match — pick the product (${products.length} found).`);
      } else {
        setStatus("No matching product found. Check the barcode or shop domain.");
      }
    } catch (e: any) {
      setError(e?.message || "Lookup failed.");
      setStatus(null);
    } finally {
      setLookupBusy(false);
    }
  }

  function selectProduct(p: CatalogProduct) {
    setProduct(p);
    setCandidates([]);
    setStatus(`Matched: ${p.title}`);
  }

  // ---------- uploads (item refs + model refs share /api/models/upload) ----------
  async function uploadImages(files: File[]): Promise<Array<{ url: string; path: string }>> {
    const out: Array<{ url: string; path: string }> = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/models/upload", { method: "POST", body: fd });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Upload failed.");
      const url = String(json?.url || "").trim();
      if (!url) throw new Error("Upload returned no URL.");
      out.push({ url, path: String(json?.path || "").trim() });
    }
    return out;
  }

  async function onItemFiles(files: FileList | null) {
    const arr = [...(files || [])].filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setItemRefBusy(true);
    setError(null);
    try {
      const uploaded = await uploadImages(arr.slice(0, 8));
      setItemRefs((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (e: any) {
      setError(e?.message || "Failed to upload item references.");
    } finally {
      setItemRefBusy(false);
    }
  }

  async function onModelFiles(files: FileList | null) {
    const arr = [...(files || [])].filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setMBusy(true);
    setError(null);
    try {
      const uploaded = await uploadImages(arr.slice(0, 12));
      setMRefUrls((prev) => [...prev, ...uploaded.map((u) => u.url)]);
    } catch (e: any) {
      setError(e?.message || "Failed to upload model photos.");
    } finally {
      setMBusy(false);
    }
  }

  async function saveModel() {
    const name = mName.trim();
    if (!name) {
      setError("Give the model a name.");
      return;
    }
    if (mRefUrls.length < 3) {
      setError("Upload at least 3 model photos.");
      return;
    }
    setMBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, gender: mGender, urls: mRefUrls }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to save model.");
      const saved = json?.model as ModelRow | undefined;
      setAddModelOpen(false);
      setMName("");
      setMRefUrls([]);
      refreshModels();
      if (saved?.model_id) setSelectedModelId(saved.model_id);
      setStatus(`Saved model "${name}" (${mGender}) to the server.`);
    } catch (e: any) {
      setError(e?.message || "Failed to save model.");
    } finally {
      setMBusy(false);
    }
  }

  async function deleteModel(model: ModelRow) {
    if (!window.confirm(`Delete model "${model.name}"?\nIts photos are removed from the server.`)) return;
    try {
      const resp = await fetch("/api/models/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: model.model_id }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Failed to delete model.");
      if (selectedModelId === model.model_id) setSelectedModelId("");
      refreshModels();
      setStatus(`Deleted "${model.name}" and its photos from the server.`);
    } catch (e: any) {
      setError(e?.message || "Failed to delete model.");
    }
  }

  const canContinueToGenerate = Boolean(product && itemType.trim() && selectedModel && itemRefs.length);

  // ---------- step 2: generate ----------
  function togglePanel(panel: number) {
    setSelectedPanels((prev) =>
      prev.includes(panel) ? prev.filter((p) => p !== panel) : uniqueSortedPanels([...prev, panel])
    );
  }

  async function runGenerate() {
    if (!selectedModel) {
      setError("Select a model first.");
      return;
    }
    if (!Array.isArray(selectedModel.ref_image_urls) || selectedModel.ref_image_urls.length < 3) {
      setError("This model needs at least 3 reference photos.");
      return;
    }
    const effItemType = itemType.trim();
    if (getSensitivityTier(effItemType, selectedModel.gender) === "high") {
      setError(`Item type "${effItemType}" is blocked by app policy (intimates).`);
      return;
    }
    const chosen = genMode === "manual" ? uniqueSortedPanels(selectedPanels) : [...PANELS];
    if (!chosen.length) {
      setError("Pick at least one panel to generate.");
      return;
    }
    setError(null);
    setGenerating(true);
    setResults([]);
    const startProgress: Record<number, string> = {};
    if (poseFeas) setStatus("Running pose-feasibility check, then generating…");
    else setStatus("Generating panels…");
    chosen.forEach((p) => (startProgress[p] = "queued"));
    setPanelProgress(startProgress);

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
        itemRefs,
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
          itemRefs,
          panelQa: {
            panelNumber: panel,
            panelLabel,
            poseA,
            poseB,
            modelName: selectedModel.name,
            modelGender: selectedModel.gender,
            itemType: effItemType,
          },
        }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) {
        const msg =
          json?.error?.message || (typeof json?.error === "string" ? json.error : "") || "Generation failed";
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
    if (!product) {
      setError("No matched product to publish to.");
      return;
    }
    const picked = results.filter((r) => r.selected);
    if (!picked.length) {
      setError("Select at least one image to publish.");
      return;
    }
    setStep(3);
    setError(null);
    setPushed(false);
    setPublishBusy(true);
    setStatus("Preparing images and loading current product media…");
    try {
      // 1) stage selected crops → public URLs (+ storage paths)
      const stagedById = new Map<string, { url: string; path: string }>();
      for (const r of picked) {
        const file = b64ToFile(r.b64, `${product.handle}-${r.id}.png`);
        const [u] = await uploadImages([file]);
        stagedById.set(r.id, u);
      }
      setResults((prev) =>
        prev.map((r) =>
          stagedById.has(r.id)
            ? { ...r, stagedUrl: stagedById.get(r.id)!.url, stagedPath: stagedById.get(r.id)!.path }
            : r
        )
      );

      // 2) current media + variants in parallel
      const [mediaJson, variantsJson] = await Promise.all([
        fetch("/api/shopify-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-product-media", shop: shop.trim(), productId: product.id }),
        }).then(parseJson),
        fetch("/api/shopify-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get-variants", shop: shop.trim(), productId: product.id }),
        }).then(parseJson),
      ]);
      const media: CurrentMedia[] = Array.isArray(mediaJson?.media)
        ? mediaJson.media.map((m: any) => ({
            id: String(m?.id || ""),
            url: String(m?.url || ""),
            altText: String(m?.altText || ""),
          }))
        : [];
      setCurrentMedia(media);
      const rows = Array.isArray(variantsJson?.colors)
        ? variantsJson.colors
        : Array.isArray(variantsJson?.variants)
          ? variantsJson.variants
          : [];
      const firstPickedId = picked[0]?.id || null;
      setVariants(
        rows.map((row: any, idx: number) => {
          const color = String(row?.color || "");
          const match = picked.find((r) =>
            `${r.label} ${r.alt || ""}`.toLowerCase().includes(color.trim().toLowerCase())
          );
          return {
            id: String(row?.id || ""),
            color,
            position: Number(row?.position || idx + 1),
            imageUrl: row?.imageUrl ? String(row.imageUrl) : null,
            assignedResultId: match?.id || firstPickedId,
            variantCount: Number(row?.variantCount || 1),
          } as VariantRow;
        })
      );

      // 3) auto-generate SEO alt text for each staged image
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
              body: JSON.stringify({
                imageUrl: staged.url,
                storagePath: staged.path,
                itemType: itemType.trim() || "apparel item",
              }),
            });
            const json = await parseJson(resp);
            const alt = String(json?.altText || "").trim();
            setResults((prev) =>
              prev.map((x) =>
                x.id === r.id
                  ? { ...x, altBusy: false, alt: alt || `${product.title} – ${r.label}` }
                  : x
              )
            );
          } catch {
            setResults((prev) =>
              prev.map((x) =>
                x.id === r.id ? { ...x, altBusy: false, alt: `${product.title} – ${r.label}` } : x
              )
            );
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
    const missingAlt = picked.find((r) => !String(r.alt || "").trim());
    if (missingAlt) {
      setError("Every image needs alt text before publishing. Fill the missing one (or wait for auto-generation).");
      return;
    }
    const notStaged = picked.find((r) => !r.stagedUrl);
    if (notStaged) {
      setError("Some images are still being prepared. Try again in a moment.");
      return;
    }
    setError(null);
    setPushing(true);
    setStatus("Publishing to Shopify…");
    try {
      const images = picked.map((r) => ({
        url: r.stagedUrl as string,
        altText: String(r.alt || "").trim(),
        storagePath: String(r.stagedPath || ""),
      }));
      const indexByResult = new Map(picked.map((r, idx) => [r.id, idx]));
      const colorAssignments = variants
        .filter((v) => v.assignedResultId && indexByResult.has(v.assignedResultId))
        .map((v) => ({ color: v.color, imageIndex: indexByResult.get(v.assignedResultId as string) as number }));
      const colorOrder = variants.map((v) => v.color).filter(Boolean);

      const resp = await fetch("/api/shopify-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace-product-images",
          shop: shop.trim(),
          productId: product.id,
          images,
          removeExisting: pubMode === "replace",
          colorAssignments,
          colorOrder,
        }),
      });
      const json = await parseJson(resp);
      if (!resp.ok) throw new Error(json?.error || "Shopify push failed.");
      setPushed(true);
      setStatus(
        pubMode === "replace"
          ? `Replaced product media with ${images.length} new image(s). Alt text set on all.`
          : `Added ${images.length} new image(s) (kept existing). Alt text set on all.`
      );
    } catch (e: any) {
      setError(e?.message || "Shopify push failed.");
      setStatus(null);
    } finally {
      setPushing(false);
    }
  }

  async function openInSeoManager() {
    if (!product) return;
    const picked = results.filter((r) => r.selected && r.stagedUrl);
    try {
      await savePushTransfer({
        createdAt: Date.now(),
        barcode: barcode.trim(),
        images: picked.map((r) => ({
          id: r.id,
          sourceImageId: r.id,
          url: r.stagedUrl,
          title: r.label,
          altText: String(r.alt || ""),
        })),
      });
    } catch {
      /* best-effort; SEO page still opens */
    }
    window.location.href = "/studio/seo#publish-section";
  }

  function resetAll() {
    setStep(1);
    setBarcode("");
    setCandidates([]);
    setProduct(null);
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
        <label className="v2-lbl">Shopify store domain</label>
        <input
          className="v2-input"
          placeholder="yourstore.myshopify.com"
          value={shop}
          onChange={(e) => persistShop(e.target.value)}
        />
      </div>

      <div className="v2-stepper">
        {[
          { n: 1, t: "Identify & set up" },
          { n: 2, t: "Generate" },
          { n: 3, t: "Publish" },
        ].map((s) => (
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
          <div className="v2-row">
            <input
              className="v2-input"
              placeholder="Scan or type a barcode…"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <button className="v2-btn primary" disabled={lookupBusy} onClick={lookup}>
              {lookupBusy ? "Looking up…" : "Look up"}
            </button>
          </div>

          {candidates.length ? (
            <div className="v2-candidates">
              {candidates.map((p) => (
                <button key={p.id} className="v2-cand" onClick={() => selectProduct(p)}>
                  {p.images[0]?.url ? <img src={p.images[0].url} alt="" /> : <div className="v2-noimg" />}
                  <span>{p.title}</span>
                </button>
              ))}
            </div>
          ) : null}

          {product ? (
            <div className="v2-card good">
              <div className="v2-kv">
                <span>Matched product</span>
                <b>{product.title}</b>
              </div>
              <div className="v2-kv">
                <span>Handle</span>
                <span>/products/{product.handle}</span>
              </div>
              <div className="v2-kv">
                <span>Barcodes</span>
                <span>{(product.barcodes || []).join(", ") || "—"}</span>
              </div>
            </div>
          ) : null}

          <label className="v2-lbl mt">Item type</label>
          <input
            className="v2-input"
            placeholder="e.g. Jeans, Co-ord Set, Dress…"
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
          />
          <div className="v2-presets">
            {ITEM_TYPE_PRESETS.map((p) => (
              <button key={p} className="v2-chip" onClick={() => setItemType(p)}>
                {p}
              </button>
            ))}
          </div>

          <label className="v2-lbl mt">
            Item instruction <span className="v2-opt">optional</span>
          </label>
          <textarea
            className="v2-input"
            rows={2}
            placeholder="e.g. shirt — oversized / relaxed fit · jeans — super skinny, high-waist…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />

          <label className="v2-lbl mt">
            Model <span className="v2-opt">poses follow the model&apos;s gender</span>
          </label>
          <div className="v2-models">
            {models.map((m) => (
              <div
                key={m.model_id}
                className={`v2-model ${m.model_id === selectedModelId ? "sel" : ""}`}
                onClick={() => setSelectedModelId(m.model_id)}
              >
                <button
                  className="v2-del"
                  title="Delete model + its photos"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteModel(m);
                  }}
                >
                  ×
                </button>
                {m.ref_image_urls[0] ? <img src={m.ref_image_urls[0]} alt="" /> : <div className="v2-noimg" />}
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
              <input
                className="v2-input"
                placeholder="Model name (e.g. Sofia)"
                value={mName}
                onChange={(e) => setMName(e.target.value)}
              />
              <div className="v2-seg mt8">
                {(["female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    className={`v2-segbtn ${mGender === g ? "active" : ""}`}
                    onClick={() => setMGender(g)}
                  >
                    {g === "female" ? "Female" : "Male"}
                  </button>
                ))}
              </div>
              <input
                ref={modelFileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => onModelFiles(e.target.files)}
              />
              <button className="v2-drop mt8" onClick={() => modelFileRef.current?.click()}>
                {mBusy ? "Uploading…" : "Upload model photos (min 3)"}
              </button>
              <div className="v2-thumbs">
                {mRefUrls.map((u, i) => (
                  <div key={i} className="v2-thumb">
                    <img src={u} alt="" />
                    <span className="x" onClick={() => setMRefUrls((p) => p.filter((_, j) => j !== i))}>
                      ×
                    </span>
                  </div>
                ))}
              </div>
              <div className="v2-row mt8">
                <button className="v2-btn primary" disabled={mBusy} onClick={saveModel}>
                  💾 Save model to server
                </button>
                <button className="v2-btn ghost" onClick={() => setAddModelOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <div className="v2-hint">Models are stored on the server and reused across products. Deleting a model also deletes its photos from the server.</div>

          <label className="v2-lbl mt">Item reference photos</label>
          <input
            ref={itemFileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onItemFiles(e.target.files)}
          />
          <button className="v2-drop" onClick={() => itemFileRef.current?.click()}>
            {itemRefBusy ? "Uploading…" : "Upload item reference photos"}
          </button>
          <div className="v2-thumbs">
            {itemRefs.map((u, i) => (
              <div key={i} className="v2-thumb">
                <img src={u} alt="" />
                <span className="x" onClick={() => setItemRefs((p) => p.filter((_, j) => j !== i))}>
                  ×
                </span>
              </div>
            ))}
          </div>

          <div className="v2-actions">
            <div className="v2-spacer" />
            <button className="v2-btn primary" disabled={!canContinueToGenerate} onClick={() => setStep(2)}>
              Continue to Generate →
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="v2-panel">
          <h2>2 · Generate</h2>
          <p className="v2-lead">
            One run does panel generation + 3:4 split. Choose all panels (auto) or pick specific ones. Pose-feasibility runs only if you tick it.
          </p>

          <div className="v2-genopts">
            <div className="v2-optrow">
              <span className="v2-lbl" style={{ margin: 0 }}>Panels to generate</span>
              <div className="v2-seg">
                <button className={`v2-segbtn ${genMode === "auto" ? "active" : ""}`} onClick={() => setGenMode("auto")}>
                  Auto · all panels
                </button>
                <button className={`v2-segbtn ${genMode === "manual" ? "active" : ""}`} onClick={() => setGenMode("manual")}>
                  Manual · choose
                </button>
              </div>
            </div>
            {gender ? (
              <div className="v2-hint" style={{ marginTop: 8 }}>
                Using the <b>{gender}</b> pose set · model <b>{selectedModel?.name}</b>.
              </div>
            ) : null}
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
              <span>
                Run <b>pose-feasibility</b> check first
              </span>
              <small>optional — only runs when ticked (recommended for dresses / sets / swimwear)</small>
            </label>
          </div>

          <div className="v2-actions">
            <button className="v2-btn primary" disabled={generating} onClick={runGenerate}>
              {generating ? "Generating…" : results.length ? "↻ Regenerate" : "⚡ Generate"}
            </button>
            <button className="v2-btn ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <div className="v2-spacer" />
            <span className="v2-hint" style={{ margin: 0 }}>
              {results.length ? `${selectedResults.length} of ${results.length} selected` : ""}
            </span>
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
                    <button
                      className="v2-zoom"
                      title="Zoom in"
                      onClick={(e) => {
                        e.stopPropagation();
                        setZoom(r);
                      }}
                    >
                      ⛶
                    </button>
                    <img src={dataUrlFromB64(r.b64)} alt={r.label} />
                    <div className="v2-meta">{r.label}</div>
                  </div>
                ))}
              </div>
              <div className="v2-actions">
                <div className="v2-hint" style={{ margin: 0 }}>Untick anything you don&apos;t want.</div>
                <div className="v2-spacer" />
                <button className="v2-btn primary" disabled={!selectedResults.length} onClick={goToPublish}>
                  Continue to Publish →
                </button>
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
              <div className="v2-kv">
                <span>Publishing to</span>
                <b>{product.title}</b>
              </div>
              <div className="v2-kv">
                <span>New images</span>
                <span>{selectedResults.length}</span>
              </div>
            </div>
          ) : null}

          <label className="v2-lbl mt">Current images on this product</label>
          <div className="v2-curgrid">
            {currentMedia.length ? (
              currentMedia.map((m) => (
                <div key={m.id} className="v2-cur">
                  <img src={m.url} alt={m.altText} />
                </div>
              ))
            ) : (
              <div className="v2-hint" style={{ margin: 0 }}>{publishBusy ? "Loading…" : "No current images."}</div>
            )}
          </div>

          <div className="v2-choice">
            <div className={`v2-opt ${pubMode === "replace" ? "sel" : ""}`} onClick={() => setPubMode("replace")}>
              <span className="v2-dot" />
              <div>
                <b>Replace — wipe current &amp; upload new</b>
                <small>removes the images above, then adds the generated ones</small>
              </div>
            </div>
            <div className={`v2-opt ${pubMode === "add" ? "sel" : ""}`} onClick={() => setPubMode("add")}>
              <span className="v2-dot" />
              <div>
                <b>Keep current + add new</b>
                <small>existing images stay; generated ones are appended</small>
              </div>
            </div>
          </div>

          {variants.length ? (
            <>
              <label className="v2-lbl mt">Main image per variant</label>
              <div className="v2-variants">
                {variants.map((v) => (
                  <div key={v.id} className="v2-variant">
                    <div className="v2-vh">
                      <b>{v.color || "Variant"}</b>
                      <small>· {v.variantCount} variant(s) — pick the featured image</small>
                    </div>
                    <div className="v2-vpics">
                      {selectedResults.map((r) => (
                        <div
                          key={r.id}
                          className={`v2-vpic ${v.assignedResultId === r.id ? "main" : ""}`}
                          onClick={() => setVariantImage(v.id, r.id)}
                        >
                          <img src={r.stagedUrl || dataUrlFromB64(r.b64)} alt="" />
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
                <img src={r.stagedUrl || dataUrlFromB64(r.b64)} alt="" />
                <input
                  className="v2-input"
                  value={r.alt || ""}
                  placeholder={r.altBusy ? "Writing alt text…" : "Alt text…"}
                  onChange={(e) => setResultAlt(r.id, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="v2-actions">
            <button className="v2-btn primary" disabled={pushing || publishBusy || pushed} onClick={pushToShopify}>
              {pushing
                ? "Publishing…"
                : pushed
                  ? "✓ Published"
                  : pubMode === "replace"
                    ? "Push to Shopify · replace all media"
                    : "Push to Shopify · add to existing"}
            </button>
            {pushed ? (
              <button className="v2-btn cyan" onClick={openInSeoManager}>
                ✨ Optimize SEO
              </button>
            ) : null}
            <button className="v2-btn ghost" onClick={() => setStep(2)}>
              ← Back
            </button>
            {pushed ? (
              <button className="v2-btn ghost" onClick={resetAll}>
                ↺ Start another product
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {zoom ? (
        <div className="v2-lb" onClick={() => setZoom(null)}>
          <button className="v2-lbclose" onClick={() => setZoom(null)}>
            ×
          </button>
          <div className="v2-frame" onClick={(e) => e.stopPropagation()}>
            <img src={dataUrlFromB64(zoom.b64)} alt={zoom.label} />
            <div className="v2-cap">{zoom.label}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const V2_CSS = `
.v2-wrap{--bg:#0c0a15;--panel:#161226;--panel2:#1d1830;--line:#2c2640;--ink:#f3f0fb;--muted:#a79fc4;--accent:#8b5cf6;--accent2:#22d3ee;--good:#34d399;
  max-width:1000px;margin:0 auto;padding:8px 4px 80px;color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,"Segoe UI",Roboto,Arial,sans-serif}
.v2-wrap *{box-sizing:border-box}
.v2-head h1{font-size:22px;margin:0 0 2px}
.v2-sub{color:var(--muted);font-size:13px;margin:0 0 14px}
.v2-shop{margin:0 0 14px}
.v2-lbl{display:block;font-size:12px;color:var(--muted);font-weight:700;margin:0 0 6px;letter-spacing:.03em;text-transform:uppercase}
.v2-lbl.mt,.mt{margin-top:18px}
.v2-opt{font-size:10px;font-weight:800;border-radius:999px;padding:2px 8px;background:rgba(52,211,153,.14);color:#6ee7b7;border:1px solid rgba(52,211,153,.4);text-transform:none;letter-spacing:0}
.v2-input{width:100%;background:#120f1d;border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:11px 13px;font:inherit;font-size:14px;resize:vertical}
.v2-input:focus{outline:none;border-color:var(--accent)}
.v2-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.v2-stepper{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}
.v2-step{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:9px 14px;flex:1;min-width:170px;opacity:.55}
.v2-step.active{opacity:1;border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.v2-step.done{opacity:1;border-color:rgba(52,211,153,.45)}
.v2-num{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:var(--panel2);color:var(--muted);font-size:12px}
.v2-step.active .v2-num{background:var(--accent);color:#fff}
.v2-step.done .v2-num{background:var(--good);color:#062}
.v2-banner{border-radius:10px;padding:10px 13px;margin:0 0 14px;font-size:13px;font-weight:600}
.v2-banner.err{background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.45);color:#fda4af}
.v2-banner.ok{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.4);color:#a5f3fc}
.v2-panel{background:linear-gradient(180deg,var(--panel),var(--panel2));border:1px solid var(--line);border-radius:16px;padding:20px}
.v2-panel h2{margin:0 0 4px;font-size:18px}
.v2-lead{color:var(--muted);font-size:13px;margin:0 0 14px}
.v2-btn{font:inherit;cursor:pointer;border-radius:10px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);padding:11px 16px;font-weight:700}
.v2-btn:hover{border-color:#43395f}
.v2-btn.primary{background:linear-gradient(90deg,var(--accent),#6d28d9);border:none;color:#fff}
.v2-btn.primary:disabled{opacity:.4;cursor:not-allowed}
.v2-btn.ghost{background:transparent}
.v2-btn.cyan{background:linear-gradient(90deg,#0891b2,#22d3ee);border:none;color:#04222a}
.v2-card{background:#120f1d;border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:14px}
.v2-card.good{border-color:rgba(52,211,153,.4)}
.v2-kv{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed var(--line);font-size:14px}
.v2-kv:last-child{border-bottom:none}
.v2-kv span:first-child{color:var(--muted)}
.v2-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.v2-chip{font-size:12px;border:1px solid var(--line);border-radius:8px;padding:5px 10px;background:#120f1d;color:#d9d2f0;cursor:pointer}
.v2-chip:hover{border-color:var(--accent)}
.v2-candidates{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.v2-cand{display:flex;flex-direction:column;align-items:center;gap:5px;width:96px;border:1px solid var(--line);border-radius:10px;padding:8px;background:#120f1d;cursor:pointer;color:var(--ink);font-size:11px}
.v2-cand:hover{border-color:var(--accent)}
.v2-cand img{width:78px;height:78px;object-fit:cover;border-radius:8px}
.v2-noimg{width:78px;height:78px;border-radius:8px;background:#241d36}
.v2-models{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.v2-model{position:relative;border:1px solid var(--line);border-radius:12px;padding:8px;width:96px;text-align:center;cursor:pointer;background:#120f1d}
.v2-model.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.v2-model img{width:80px;height:80px;border-radius:8px;object-fit:cover;display:block}
.v2-model small{display:block;font-size:11px;margin-top:4px}
.v2-model small.muted{color:var(--muted)}
.v2-model .v2-del{position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);border:none;display:grid;place-items:center;font-size:12px;color:#fff;cursor:pointer;opacity:0}
.v2-model:hover .v2-del{opacity:1}
.v2-model.add{display:grid;place-items:center;color:var(--muted);border-style:dashed;min-height:113px}
.v2-plus{font-size:24px}
.v2-addmodel{margin-top:10px;background:#120f1d;border:1px solid var(--line);border-radius:12px;padding:14px}
.v2-seg{display:inline-flex;background:#0f0c18;border:1px solid var(--line);border-radius:10px;padding:3px}
.v2-seg.mt8,.mt8{margin-top:8px}
.v2-segbtn{background:transparent;border:none;padding:7px 12px;font-size:13px;border-radius:8px;color:var(--muted);cursor:pointer}
.v2-segbtn.active{background:var(--accent);color:#fff}
.v2-drop{display:block;width:100%;border:2px dashed #3a3157;border-radius:12px;padding:16px;text-align:center;color:var(--muted);background:#120f1d;cursor:pointer;font:inherit}
.v2-drop:hover{border-color:var(--accent2);color:var(--ink)}
.v2-thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.v2-thumb{position:relative;width:64px;height:84px;border-radius:9px;overflow:hidden;border:1px solid var(--line)}
.v2-thumb img{width:100%;height:100%;object-fit:cover}
.v2-thumb .x{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.6);border-radius:50%;width:18px;height:18px;display:grid;place-items:center;font-size:12px;color:#fff;cursor:pointer}
.v2-hint{font-size:12px;color:var(--muted);margin-top:10px}
.v2-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;align-items:center}
.v2-spacer{flex:1}
.v2-genopts{background:#120f1d;border:1px solid var(--line);border-radius:12px;padding:14px}
.v2-optrow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.v2-panelpick{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.v2-pp{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:9px;padding:7px 11px;background:#0f0c18;cursor:pointer;font-size:13px}
.v2-pp.on{border-color:var(--accent);color:var(--ink)}
.v2-check{display:flex;align-items:center;gap:9px;margin-top:13px;font-size:14px;cursor:pointer;flex-wrap:wrap}
.v2-check small{color:var(--muted)}
.v2-prog{margin-top:14px;background:#120f1d;border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.v2-progrow{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px dashed var(--line)}
.v2-progrow:last-child{border-bottom:none}
.v2-progstate{color:var(--muted)}
.v2-progstate.done{color:var(--good);font-weight:700}
.v2-progstate.failed{color:#fb7185;font-weight:700}
.v2-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:16px}
.v2-res{position:relative;background:#120f1d;border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer}
.v2-res.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.v2-res img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
.v2-meta{padding:7px 9px;font-size:12px;color:var(--muted)}
.v2-tick{position:absolute;top:7px;left:7px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.55);display:grid;place-items:center;font-size:13px;border:1px solid var(--line)}
.v2-res.sel .v2-tick{background:var(--accent);border-color:var(--accent);color:#fff}
.v2-qa{position:absolute;top:7px;right:7px;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:rgba(52,211,153,.18);color:#6ee7b7}
.v2-zoom{position:absolute;bottom:34px;right:7px;width:26px;height:26px;border-radius:8px;background:rgba(0,0,0,.6);border:1px solid var(--line);display:grid;place-items:center;font-size:13px;cursor:zoom-in;color:#fff}
.v2-zoom:hover{background:var(--accent);border-color:var(--accent)}
.v2-curgrid{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.v2-cur{width:62px;height:82px;border-radius:8px;overflow:hidden;border:1px solid var(--line)}
.v2-cur img{width:100%;height:100%;object-fit:cover}
.v2-choice{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.v2-opt{flex:1;min-width:230px;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#120f1d;cursor:pointer;display:flex;gap:11px;align-items:flex-start}
.v2-opt.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.v2-opt .v2-dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--muted);flex:none;margin-top:1px}
.v2-opt.sel .v2-dot{border-color:var(--accent);background:var(--accent);box-shadow:inset 0 0 0 3px #120f1d}
.v2-opt b{font-size:14px}
.v2-opt small{color:var(--muted);display:block;font-size:12px;margin-top:2px}
.v2-variants{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.v2-variant{background:#120f1d;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.v2-vh{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.v2-vh small{color:var(--muted);font-size:12px}
.v2-vpics{display:flex;gap:8px;flex-wrap:wrap}
.v2-vpic{position:relative;width:56px;height:74px;border-radius:8px;overflow:hidden;border:2px solid transparent;cursor:pointer}
.v2-vpic img{width:100%;height:100%;object-fit:cover;display:block}
.v2-vpic.main{border-color:var(--accent)}
.v2-vpic .star{position:absolute;top:2px;left:2px;font-size:11px;background:var(--accent);color:#fff;border-radius:5px;padding:0 4px;display:none}
.v2-vpic.main .star{display:block}
.v2-altlist{margin-top:10px;display:flex;flex-direction:column;gap:8px}
.v2-altrow{display:flex;gap:10px;align-items:center}
.v2-altrow img{width:34px;height:45px;border-radius:6px;object-fit:cover;flex:none}
.v2-lb{position:fixed;inset:0;background:rgba(4,3,10,.86);display:grid;place-items:center;z-index:50;padding:24px}
.v2-lbclose{position:absolute;top:18px;right:22px;font-size:28px;color:#fff;cursor:pointer;background:none;border:none}
.v2-frame{max-width:min(92vw,520px);max-height:92vh;display:flex;flex-direction:column;gap:10px}
.v2-frame img{width:100%;height:auto;border-radius:14px;border:1px solid var(--line);background:#15121f}
.v2-cap{color:#fff;font-weight:700}
`;
