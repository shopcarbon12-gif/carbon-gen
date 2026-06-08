"use client";

import { useMemo, useState } from "react";
import { scoreAll } from "@/lib/seo/deterministic";
import {
  type FieldScore,
  type Grade,
  type ProductContext,
  type Scorecard,
  type SeoFields,
  type SeoFieldKey,
  SEO_FIELD_LABELS,
} from "@/lib/seo/types";

type Mode = "single" | "bulk";
type Decision = "current" | "proposed";

interface AuditResponse {
  product: { id: string; title: string; onlineStoreUrl?: string | null };
  current: SeoFields;
  context: ProductContext;
  scorecard: Scorecard;
}
interface OptimizeResponse {
  focusKeyword: string;
  secondaryKeywords: string[];
  proposed: SeoFields;
  currentScorecard: Scorecard;
  proposedScorecard: Scorecard;
  rationale: Partial<Record<SeoFieldKey, string>>;
}
interface CatalogProduct {
  id: string;
  title: string;
  handle: string;
}
interface CollectionInfo {
  id: string;
  title: string;
  handle: string;
  smart: boolean;
  productsCount: number;
}

// Vendor, product type and image alt are intentionally NOT managed here:
// vendor/type are preserved from Shopify, and image alt lives in the Push section.
const FIELD_ORDER: SeoFieldKey[] = ["seoTitle", "metaDescription", "handle", "title", "bodyHtml", "tags"];

const TEXTAREA_FIELDS = new Set<SeoFieldKey>(["metaDescription", "bodyHtml"]);

function slugify(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
// WMS (Lightspeed) item name = the variant description with trailing color/size removed.
function wmsBaseName(description: string, color: string, size: string): string {
  let n = String(description || "").trim();
  for (const tok of [size, color]) {
    const t = String(tok || "").trim();
    if (t && n.toUpperCase().endsWith(t.toUpperCase())) n = n.slice(0, n.length - t.length).trim();
  }
  return n;
}

function gradeColor(grade: Grade): string {
  if (grade === "A" || grade === "B") return "#15803d";
  if (grade === "C") return "#b45309";
  return "#b91c1c";
}

function ScoreBadge({ fs }: { fs?: FieldScore }) {
  if (!fs) return null;
  return (
    <span
      title={fs.issues.join(" • ")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 700,
        color: "#fff",
        background: gradeColor(fs.grade),
        borderRadius: 6,
        padding: "1px 7px",
      }}
    >
      {fs.grade} · {fs.score}
    </span>
  );
}

function OverallBadge({ label, sc }: { label: string; sc?: Scorecard }) {
  if (!sc) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: gradeColor(sc.grade),
          border: `2px solid ${gradeColor(sc.grade)}`,
          borderRadius: 8,
          padding: "2px 10px",
        }}
      >
        {sc.grade} · {sc.overall}
      </span>
    </div>
  );
}

function Delta({ from, to }: { from?: number; to?: number }) {
  if (typeof from !== "number" || typeof to !== "number") return null;
  const d = to - from;
  if (d === 0) return <span className="muted" style={{ fontSize: 12 }}>no change</span>;
  const up = d > 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: up ? "#15803d" : "#b91c1c" }}>
      {up ? "▲" : "▼"} {Math.abs(d)}
    </span>
  );
}

function valueToText(field: SeoFieldKey, fields: SeoFields): string {
  if (field === "tags") return (fields.tags || []).join(", ");
  if (field === "imageAlts") return (fields.imageAlts || []).map((a) => a.altText).join(" | ");
  return String((fields as any)[field] ?? "");
}

function SerpPreview({ fields, shop }: { fields: SeoFields; shop: string }) {
  const url = `${shop.replace(".myshopify.com", "")} › products › ${fields.handle || "handle"}`;
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#fff", maxWidth: 600 }}>
      <div style={{ fontSize: 12, color: "#4d5156" }}>{url}</div>
      <div style={{ fontSize: 18, color: "#1a0dab", lineHeight: 1.3, marginTop: 2 }}>
        {(fields.seoTitle || fields.title || "Untitled").slice(0, 60)}
      </div>
      <div style={{ fontSize: 13, color: "#4d5156", marginTop: 2 }}>
        {(fields.metaDescription || "No meta description set.").slice(0, 160)}
      </div>
    </div>
  );
}

export default function SeoStudio({ shop }: { shop: string }) {
  const [mode, setMode] = useState<Mode>("single");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // shared product search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);

  // ---- single mode state ----
  const [productId, setProductId] = useState("");
  const [handle, setHandle] = useState("");
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [optimize, setOptimize] = useState<OptimizeResponse | null>(null);
  const [editedProposed, setEditedProposed] = useState<SeoFields | null>(null);
  const [decisions, setDecisions] = useState<Partial<Record<SeoFieldKey, Decision>>>({});
  const [busy, setBusy] = useState(false);
  const [previewSide, setPreviewSide] = useState<Decision>("proposed");
  const [useVision, setUseVision] = useState(true);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [recommendedCollections, setRecommendedCollections] = useState<
    Array<{ id: string; title: string; reason: string; smart?: boolean; source?: "auto" | "suggested" }>
  >([]);
  const [collectionBarcodeLabel, setCollectionBarcodeLabel] = useState<string>("");
  const [wmsName, setWmsName] = useState<string>("");
  const [wmsDesiredHandle, setWmsDesiredHandle] = useState<string>("");
  const [wmsApplying, setWmsApplying] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<Record<string, boolean>>({});
  const [showAllCollections, setShowAllCollections] = useState(false);

  // ---- bulk mode state ----
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkRows, setBulkRows] = useState<
    Array<{ productId: string; title: string; current: SeoFields; context: ProductContext; proposed?: SeoFields; currentOverall?: number; proposedOverall?: number; publish: boolean; status: string }>
  >([]);
  const [bulkRunning, setBulkRunning] = useState(false);

  // Live deterministic re-score of the edited proposal.
  const liveProposedScore = useMemo<Scorecard | null>(() => {
    if (!editedProposed) return null;
    return scoreAll(editedProposed);
  }, [editedProposed]);

  async function runSearch() {
    if (!shop.trim()) {
      setError("Set the shop domain first.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ shop: shop.trim(), first: "30", includeCount: "0" });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const resp = await fetch(`/api/shopify/catalog?${params.toString()}`, { cache: "no-store" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Search failed");
      setSearchResults(Array.isArray(json.products) ? json.products : []);
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function ensureCollectionsLoaded(): Promise<CollectionInfo[]> {
    if (collections.length) return collections;
    try {
      const resp = await fetch(`/api/shopify/collections?shop=${encodeURIComponent(shop.trim())}`, { cache: "no-store" });
      const json = await resp.json();
      if (resp.ok && Array.isArray(json.collections)) {
        setCollections(json.collections);
        return json.collections;
      }
    } catch {
      /* non-fatal — recommendations just won't be available */
    }
    return [];
  }

  async function loadWmsHandle(ctx: ProductContext) {
    setWmsName("");
    setWmsDesiredHandle("");
    const barcode = (ctx.barcodes || [])[0] || "";
    if (!barcode) return;
    try {
      const resp = await fetch(`/api/lightspeed/catalog?q=${encodeURIComponent(barcode)}&pageSize=20`, { cache: "no-store" });
      const json = await resp.json();
      if (!resp.ok) return;
      const rows = Array.isArray(json.rows) ? json.rows : [];
      const row = rows.find((r: any) => String(r.upc || "").trim() === barcode) || rows[0];
      if (!row) return;
      const name = wmsBaseName(row.description, row.color, row.size);
      if (!name) return;
      setWmsName(name);
      setWmsDesiredHandle(slugify(name));
    } catch {
      /* non-fatal */
    }
  }

  async function applyWmsHandle() {
    if (!audit || !wmsDesiredHandle) return;
    setWmsApplying(true);
    setError(null);
    try {
      const resp = await fetch("/api/shopify/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop.trim(),
          productId: audit.product.id,
          fields: { handle: wmsDesiredHandle },
          oldHandle: audit.current.handle,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Handle update failed");
      setStatus(`Handle set to "${wmsDesiredHandle}"${json.redirectCreated ? " (301 redirect created)" : ""}.`);
      await runAudit({ productId: audit.product.id });
    } catch (e: any) {
      setError(e?.message || "Handle update failed");
    } finally {
      setWmsApplying(false);
    }
  }

  async function loadCollectionSuggestions(ctx: ProductContext) {
    try {
      const resp = await fetch("/api/seo/collection-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop.trim(),
          sku: (ctx.variantSkus || [])[0] || "",
          barcode: (ctx.barcodes || [])[0] || "",
          title: ctx.title,
          itemType: ctx.productType,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) return;
      const recs = Array.isArray(json.recommendations) ? json.recommendations : [];
      setCollectionBarcodeLabel(json.barcodeLabel || "");
      setRecommendedCollections(recs);
      // Pre-select everything we can actually add (non-smart). Smart collections
      // are rule-based and can't be edited manually, so leave them unchecked.
      setSelectedCollections(Object.fromEntries(recs.filter((r: { smart?: boolean }) => !r.smart).map((r: { id: string }) => [r.id, true])));
    } catch {
      /* non-fatal */
    }
  }

  async function runAudit(idOrHandle?: { productId?: string; handle?: string }) {
    const body = {
      shop: shop.trim(),
      productId: idOrHandle?.productId ?? productId.trim(),
      handle: idOrHandle?.handle ?? handle.trim(),
    };
    if (!body.productId && !body.handle) {
      setError("Enter a product handle or ID, or pick one from search.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Auditing current SEO…");
    setOptimize(null);
    setEditedProposed(null);
    setDecisions({});
    setRecommendedCollections([]);
    setSelectedCollections({});
    setCollectionBarcodeLabel("");
    void ensureCollectionsLoaded();
    try {
      const resp = await fetch("/api/shopify/seo-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Audit failed");
      setAudit(json);
      setProductId(json.product.id);
      setHandle(json.current.handle || "");
      setStatus(`Audited "${json.product.title}". Overall grade ${json.scorecard.grade} (${json.scorecard.overall}).`);
      void loadCollectionSuggestions(json.context);
      void loadWmsHandle(json.context);
    } catch (e: any) {
      setError(e?.message || "Audit failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function runOptimize() {
    if (!audit) return;
    setBusy(true);
    setError(null);
    setStatus("Generating optimized SEO with AI…");
    try {
      const resp = await fetch("/api/seo/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: audit.context, current: audit.current, useVision }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Optimize failed");
      setOptimize(json);
      setEditedProposed(json.proposed);
      // Default every field to "use proposed" — the user reviews and can switch
      // any back to current before publishing.
      const initial: Partial<Record<SeoFieldKey, Decision>> = {};
      for (const f of FIELD_ORDER) initial[f] = "proposed";
      setDecisions(initial);
      setStatus(`Proposed grade ${json.proposedScorecard.grade} (${json.proposedScorecard.overall}) vs current ${json.currentScorecard.grade} (${json.currentScorecard.overall}).`);
    } catch (e: any) {
      setError(e?.message || "Optimize failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  function setProposedField(field: SeoFieldKey, text: string) {
    setEditedProposed((prev) => {
      if (!prev) return prev;
      if (field === "tags") return { ...prev, tags: text.split(",").map((t) => t.trim()).filter(Boolean) };
      return { ...prev, [field]: text } as SeoFields;
    });
  }

  function setProposedAlt(id: string, text: string) {
    setEditedProposed((prev) => {
      if (!prev) return prev;
      return { ...prev, imageAlts: prev.imageAlts.map((a) => (a.id === id ? { ...a, altText: text } : a)) };
    });
  }

  async function publishSingle() {
    if (!audit || !editedProposed) return;
    const fields: Record<string, unknown> = {};
    let handleChanged = false;
    for (const f of FIELD_ORDER) {
      if (decisions[f] !== "proposed") continue;
      if (f === "tags") fields.tags = editedProposed.tags;
      else if (f === "imageAlts") {
        fields.imageAlts = editedProposed.imageAlts.map((a) => ({ id: a.id, altText: a.altText }));
      } else if (f === "metaDescription") fields.metaDescription = editedProposed.metaDescription;
      else if (f === "bodyHtml") fields.bodyHtml = editedProposed.bodyHtml;
      else (fields as any)[f] = (editedProposed as any)[f];
      if (f === "handle" && editedProposed.handle !== audit.current.handle) handleChanged = true;
    }
    const addToCollections = Object.keys(selectedCollections).filter((id) => selectedCollections[id]);
    if (!Object.keys(fields).length && !addToCollections.length) {
      setError("Nothing accepted to publish. Toggle a field to ‘Use proposed’ or select a collection.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Publishing accepted fields to Shopify…");
    try {
      const resp = await fetch("/api/shopify/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop.trim(),
          productId: audit.product.id,
          fields,
          oldHandle: handleChanged ? audit.current.handle : undefined,
          addToCollections,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Publish failed");
      const bits = [`Published: ${(json.updatedFields || []).join(", ") || "nothing"}`];
      if (json.redirectCreated) bits.push("301 redirect created for old URL");
      if (json.altResults?.updated) bits.push(`${json.altResults.updated} alt texts updated`);
      if (json.collectionResults?.added?.length) bits.push(`added to: ${json.collectionResults.added.join(", ")}`);
      if (json.collectionResults?.errors?.length) bits.push(`collection issues: ${json.collectionResults.errors.length} (smart collections can't be edited)`);
      setStatus(bits.join(". ") + ".");
      // re-audit to reflect new live state
      await runAudit({ productId: audit.product.id });
    } catch (e: any) {
      setError(e?.message || "Publish failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  // ---------- bulk ----------
  async function runBulk() {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length) {
      setError("Select at least one product.");
      return;
    }
    setBulkRunning(true);
    setError(null);
    const rows: typeof bulkRows = ids.map((id) => {
      const p = searchResults.find((r) => r.id === id);
      return { productId: id, title: p?.title || id, current: {} as SeoFields, context: {} as ProductContext, publish: true, status: "queued" };
    });
    setBulkRows(rows);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        row.status = "auditing…";
        setBulkRows([...rows]);
        const aResp = await fetch("/api/shopify/seo-audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shop: shop.trim(), productId: row.productId }),
        });
        const a = await aResp.json();
        if (!aResp.ok) throw new Error(a.error || "audit failed");
        row.current = a.current;
        row.context = a.context;
        row.currentOverall = a.scorecard.overall;
        // Skip products with no images — leave them completely unchanged.
        if (!(a.current?.imageAlts || []).length) {
          row.publish = false;
          row.status = "skipped (no images)";
          setBulkRows([...rows]);
          continue;
        }
        row.status = "optimizing…";
        setBulkRows([...rows]);
        const oResp = await fetch("/api/seo/optimize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: a.context, current: a.current, useVision }),
        });
        const o = await oResp.json();
        if (!oResp.ok) throw new Error(o.error || "optimize failed");
        row.proposed = o.proposed;
        row.proposedOverall = o.proposedScorecard.overall;
        row.status = "ready";
      } catch (e: any) {
        row.status = `error: ${e?.message || "failed"}`;
      }
      setBulkRows([...rows]);
    }
    setBulkRunning(false);
    setStatus("Bulk analysis complete. Review and publish the ones you want.");
  }

  async function publishBulk() {
    const rows = bulkRows.filter((r) => r.publish && r.proposed && r.status === "ready");
    if (!rows.length) {
      setError("No ready rows selected to publish.");
      return;
    }
    setBulkRunning(true);
    setError(null);
    for (const row of rows) {
      try {
        row.status = "publishing…";
        setBulkRows([...bulkRows]);
        const p = row.proposed!;
        const fields = {
          seoTitle: p.seoTitle,
          metaDescription: p.metaDescription,
          handle: p.handle,
          title: p.title,
          bodyHtml: p.bodyHtml,
          tags: p.tags,
          productType: p.productType,
          vendor: p.vendor,
          imageAlts: p.imageAlts.map((a) => ({ id: a.id, altText: a.altText })),
        };
        const resp = await fetch("/api/shopify/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: shop.trim(),
            productId: row.productId,
            fields,
            oldHandle: p.handle !== row.current.handle ? row.current.handle : undefined,
          }),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || "publish failed");
        row.status = "published ✓";
      } catch (e: any) {
        row.status = `error: ${e?.message || "failed"}`;
      }
      setBulkRows([...bulkRows]);
    }
    setBulkRunning(false);
    setStatus("Bulk publish complete.");
  }

  const proposedScoreForField = (f: SeoFieldKey): FieldScore | undefined =>
    liveProposedScore?.fields[f] || optimize?.proposedScorecard.fields[f];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`btn ${mode === "single" ? "" : "ghost"}`} onClick={() => setMode("single")} type="button">
          One product
        </button>
        <button className={`btn ${mode === "bulk" ? "" : "ghost"}`} onClick={() => setMode("bulk")} type="button">
          Bulk catalog
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", color: "#f8fafc", fontSize: 13 }}>
          <input type="checkbox" checked={useVision} onChange={(e) => setUseVision(e.target.checked)} />
          🔍 Analyze product photos (recommended)
        </label>
      </div>
      <p style={{ color: "#cbd5e1", fontSize: 12, marginTop: -6, marginBottom: 12 }}>
        SEO is generated from the product <strong>name + color + photos only</strong> — existing descriptions/tags are ignored.
        {mode === "bulk" ? " Products with no images are skipped and left unchanged." : ""}
      </p>

      {error ? (
        <p style={{ color: "#b91c1c", fontWeight: 600 }}>{error}</p>
      ) : null}
      {status ? <p className="muted">{status}</p> : null}

      {/* ---------------- SINGLE ---------------- */}
      {mode === "single" ? (
        <>
          <div className="row">
            <input
              suppressHydrationWarning
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search products (name, handle, barcode)"
            />
            <button className="btn ghost" onClick={runSearch} disabled={searching} type="button">
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {searchResults.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  className="btn ghost"
                  type="button"
                  onClick={() => runAudit({ productId: p.id })}
                  style={{ fontSize: 12 }}
                >
                  {p.title}
                </button>
              ))}
            </div>
          ) : null}
          <div className="row">
            <input
              suppressHydrationWarning
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="…or handle (vintage-wash-hoodie)"
            />
            <input
              suppressHydrationWarning
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="…or product ID / gid"
            />
            <button className="btn" onClick={() => runAudit()} disabled={busy} type="button">
              Audit SEO
            </button>
          </div>

          {audit ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <OverallBadge label="Current" sc={optimize?.currentScorecard || audit.scorecard} />
                {optimize ? <span style={{ fontSize: 18 }}>→</span> : null}
                {optimize ? <OverallBadge label="Proposed" sc={liveProposedScore || optimize.proposedScorecard} /> : null}
                {!optimize ? (
                  <button className="btn" onClick={runOptimize} disabled={busy} type="button">
                    ✨ Generate optimized SEO
                  </button>
                ) : null}
              </div>

              {wmsDesiredHandle ? (
                audit.current.handle === wmsDesiredHandle ? (
                  <div style={{ border: "1px solid #15803d", borderRadius: 10, padding: "8px 12px", marginBottom: 10, color: "#86efac", fontSize: 13 }}>
                    ✓ URL handle is in sync with the WMS name <strong>“{wmsName}”</strong> — nothing to change.
                  </div>
                ) : (
                  <div style={{ border: "1px solid #b45309", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, color: "#f8fafc", marginBottom: 4 }}>
                      🔁 URL handle differs from the WMS name <strong>“{wmsName}”</strong>:
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 8 }}>
                      <code>{audit.current.handle}</code> → <code style={{ color: "#86efac" }}>{wmsDesiredHandle}</code>
                    </div>
                    <button className="btn" type="button" onClick={applyWmsHandle} disabled={wmsApplying}>
                      {wmsApplying ? "Applying…" : "Set handle to WMS name (+301 redirect)"}
                    </button>
                  </div>
                )
              ) : null}

              {optimize ? (
                <>
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Focus keyword: <strong>{optimize.focusKeyword}</strong>
                    {optimize.secondaryKeywords?.length ? ` · also: ${optimize.secondaryKeywords.join(", ")}` : ""}
                  </div>

                  {FIELD_ORDER.map((f) => {
                    const curScore = optimize.currentScorecard.fields[f];
                    const proScore = proposedScoreForField(f);
                    const decision = decisions[f] || "proposed";
                    return (
                      <div key={f} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <strong>{SEO_FIELD_LABELS[f]}</strong>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <ScoreBadge fs={curScore} />
                            <span>→</span>
                            <ScoreBadge fs={proScore} />
                            <Delta from={curScore?.score} to={proScore?.score} />
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <div className="muted" style={{ fontSize: 11 }}>CURRENT</div>
                            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "#e2e8f0" }}>
                              {f === "imageAlts"
                                ? (audit.current.imageAlts || []).map((a, i) => `${i + 1}. ${a.altText || "(none)"}`).join("\n") || "(no images)"
                                : valueToText(f, audit.current) || "(empty)"}
                            </div>
                          </div>
                          <div>
                            <div className="muted" style={{ fontSize: 11 }}>PROPOSED (editable)</div>
                            {f === "imageAlts" ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {(editedProposed?.imageAlts || []).map((a) => (
                                  <input
                                    key={a.id}
                                    value={a.altText}
                                    onChange={(e) => setProposedAlt(a.id, e.target.value)}
                                    style={{ fontSize: 12 }}
                                  />
                                ))}
                              </div>
                            ) : TEXTAREA_FIELDS.has(f) ? (
                              <textarea
                                value={editedProposed ? valueToText(f, editedProposed) : ""}
                                onChange={(e) => setProposedField(f, e.target.value)}
                                rows={f === "bodyHtml" ? 6 : 3}
                                style={{ width: "100%", fontSize: 13 }}
                              />
                            ) : (
                              <input
                                value={editedProposed ? valueToText(f, editedProposed) : ""}
                                onChange={(e) => setProposedField(f, e.target.value)}
                                style={{ width: "100%", fontSize: 13 }}
                              />
                            )}
                          </div>
                        </div>

                        {optimize.rationale?.[f] ? (
                          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>💡 {optimize.rationale[f]}</div>
                        ) : null}

                        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                          <label style={{ fontSize: 12 }}>
                            <input
                              type="radio"
                              checked={decision === "current"}
                              onChange={() => setDecisions((d) => ({ ...d, [f]: "current" }))}
                            />{" "}
                            Keep current
                          </label>
                          <label style={{ fontSize: 12 }}>
                            <input
                              type="radio"
                              checked={decision === "proposed"}
                              onChange={() => setDecisions((d) => ({ ...d, [f]: "proposed" }))}
                            />{" "}
                            Use proposed
                          </label>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ margin: "12px 0" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>Google preview</strong>
                      <button className="btn ghost" style={{ fontSize: 11 }} type="button" onClick={() => setPreviewSide(previewSide === "proposed" ? "current" : "proposed")}>
                        Show {previewSide === "proposed" ? "current" : "proposed"}
                      </button>
                    </div>
                    <SerpPreview shop={shop} fields={previewSide === "proposed" && editedProposed ? editedProposed : audit.current} />
                  </div>

                  <div style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong style={{ color: "#f8fafc" }}>
                        📁 Recommended collections{collectionBarcodeLabel ? ` — ${collectionBarcodeLabel}` : ""}
                      </strong>
                      <button className="btn ghost" style={{ fontSize: 11 }} type="button" onClick={() => setShowAllCollections((s) => !s)}>
                        {showAllCollections ? "Hide all" : "Add another"}
                      </button>
                    </div>
                    {recommendedCollections.length ? (
                      recommendedCollections.map((rc) => (
                        <label key={rc.id} style={{ display: "block", fontSize: 13, color: "#e2e8f0", padding: "3px 0", opacity: rc.smart ? 0.6 : 1 }}>
                          <input
                            type="checkbox"
                            disabled={rc.smart}
                            checked={!!selectedCollections[rc.id]}
                            onChange={(e) => setSelectedCollections((s) => ({ ...s, [rc.id]: e.target.checked }))}
                          />{" "}
                          <strong>{rc.title}</strong>
                          <span style={{ fontSize: 10, marginLeft: 6, padding: "0 5px", borderRadius: 4, background: rc.source === "auto" ? "#15803d" : "#475569", color: "#fff" }}>
                            {rc.source === "auto" ? "match" : "suggested"}
                          </span>
                          {rc.smart ? <span style={{ fontSize: 11, color: "#f59e0b" }}> (smart — auto)</span> : null}
                          {rc.reason ? <span style={{ color: "#cbd5e1" }}> — {rc.reason}</span> : null}
                        </label>
                      ))
                    ) : (
                      <div style={{ color: "#cbd5e1", fontSize: 12 }}>No strong category matches found. Use “Add another” to pick manually.</div>
                    )}
                    {showAllCollections ? (
                      <div style={{ marginTop: 8, maxHeight: 180, overflow: "auto", borderTop: "1px solid #334155", paddingTop: 8 }}>
                        {collections
                          .filter((c) => !recommendedCollections.some((r) => r.id === c.id))
                          .map((c) => (
                            <label key={c.id} style={{ display: "block", fontSize: 12, color: "#e2e8f0", padding: "2px 0" }}>
                              <input
                                type="checkbox"
                                checked={!!selectedCollections[c.id]}
                                onChange={(e) => setSelectedCollections((s) => ({ ...s, [c.id]: e.target.checked }))}
                              />{" "}
                              {c.title}
                              {c.smart ? <span style={{ fontSize: 11, color: "#f59e0b" }}> (smart)</span> : null}
                            </label>
                          ))}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 6 }}>
                      Selected collections get the product added on publish. Smart (rule-based) collections can’t be edited here.
                    </div>
                  </div>

                  <button className="btn" onClick={publishSingle} disabled={busy} type="button">
                    🚀 Publish accepted fields to Shopify
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* ---------------- BULK ---------------- */}
      {mode === "bulk" ? (
        <>
          <div className="row">
            <input
              suppressHydrationWarning
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search products to optimize in bulk"
            />
            <button className="btn ghost" onClick={runSearch} disabled={searching} type="button">
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {searchResults.length ? (
            <div style={{ margin: "8px 0", maxHeight: 200, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
              {searchResults.map((p) => (
                <label key={p.id} style={{ display: "block", fontSize: 13, padding: "2px 0" }}>
                  <input
                    type="checkbox"
                    checked={!!selected[p.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                  />{" "}
                  {p.title} <span className="muted">/{p.handle}</span>
                </label>
              ))}
            </div>
          ) : null}
          <button className="btn" onClick={runBulk} disabled={bulkRunning} type="button">
            {bulkRunning ? "Working…" : "Audit + optimize selected"}
          </button>

          {bulkRows.length ? (
            <div style={{ marginTop: 12 }}>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th>Publish</th>
                    <th>Product</th>
                    <th>Current</th>
                    <th></th>
                    <th>Proposed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((r) => (
                    <tr key={r.productId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.publish}
                          onChange={(e) => setBulkRows((rows) => rows.map((x) => (x.productId === r.productId ? { ...x, publish: e.target.checked } : x)))}
                        />
                      </td>
                      <td>{r.title}</td>
                      <td>{typeof r.currentOverall === "number" ? r.currentOverall : "—"}</td>
                      <td><Delta from={r.currentOverall} to={r.proposedOverall} /></td>
                      <td>{typeof r.proposedOverall === "number" ? r.proposedOverall : "—"}</td>
                      <td className="muted">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn" onClick={publishBulk} disabled={bulkRunning} type="button" style={{ marginTop: 10 }}>
                🚀 Publish selected (accept all proposed)
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
