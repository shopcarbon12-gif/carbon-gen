"use client";

import { useEffect, useMemo, useState } from "react";
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
  skipped?: boolean; // every section already >= threshold and no alt missing
  imageAltsAdded?: Array<{ id: string; altText: string }>;
}
interface CatalogProduct {
  id: string;
  title: string;
  handle: string;
}
interface BulkRow {
  id: string;
  title: string;
  handle: string;
  image: string | null;
  optimizedAt: string | null; // metafield -> permanent highlight when set
  selected: boolean;
  oldScore?: number;
  newScore?: number;
  proposed?: SeoFields;
  imageAltsAdded?: Array<{ id: string; altText: string }>;
  skipped?: boolean; // already fully optimized — nothing to push
  status: string; // "", auditing…, optimizing…, ready, skip (already good), pushing…, updated, error:…
}
// Title and URL handle are intentionally NOT generated/changed. Vendor/type are
// preserved from Shopify. Image alt is generated only when a photo is missing it.
const FIELD_ORDER: SeoFieldKey[] = ["seoTitle", "metaDescription", "bodyHtml", "tags"];

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

export default function SeoStudio({ shop, onProgress }: { shop: string; onProgress?: (msg: string | null) => void }) {
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
  const [wmsName, setWmsName] = useState<string>("");
  const [wmsDesiredHandle, setWmsDesiredHandle] = useState<string>("");
  const [wmsApplying, setWmsApplying] = useState(false);

  // ---- bulk mode state ----
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkCursor, setBulkCursor] = useState<string | null>(null);
  const [bulkHasNext, setBulkHasNext] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkProgressText, setBulkProgressText] = useState("");

  // Report active work up to the page's "Progress" status bar.
  useEffect(() => {
    if (!onProgress) return;
    if (busy) onProgress(status || "Working on SEO…");
    else if (bulkLoading) onProgress("Loading products with images…");
    else if (bulkWorking) onProgress(bulkProgressText || "Bulk SEO in progress…");
    else if (wmsApplying) onProgress("Updating URL handle…");
    else onProgress(null);
  }, [busy, bulkLoading, bulkWorking, wmsApplying, status, bulkProgressText, onProgress]);
  useEffect(() => () => onProgress?.(null), [onProgress]);

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

  async function loadWmsHandle(ctx: ProductContext) {
    setWmsName("");
    setWmsDesiredHandle("");
    const barcode = (ctx.barcodes || [])[0] || "";
    if (!barcode) return;
    try {
      const resp = await fetch(`/api/lightspeed/catalog?q=${encodeURIComponent(barcode)}&pageSize=20`, { cache: "no-store" });
      const json = await resp.json();
      if (!resp.ok) return;
      const rows = (Array.isArray(json.rows) ? json.rows : []).filter(
        (r: any) => String(r.upc || "").trim() === barcode
      );
      // Distinct WMS item names sharing this barcode. One = unambiguous WMS name.
      // More than one = the UPC is shared by separate products, so follow the
      // product's OWN item name (its title) instead of guessing.
      const names = Array.from(
        new Set(rows.map((r: any) => wmsBaseName(r.description, r.color, r.size)).filter(Boolean))
      ) as string[];
      const name = names.length === 1 ? names[0] : names.length > 1 ? ctx.title : "";
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
    for (const f of FIELD_ORDER) {
      if (decisions[f] !== "proposed") continue;
      if (f === "tags") fields.tags = editedProposed.tags;
      else (fields as any)[f] = (editedProposed as any)[f];
    }
    // Add generated alt text for photos that were missing it (title/handle never change).
    if (optimize?.imageAltsAdded && optimize.imageAltsAdded.length) {
      fields.imageAlts = optimize.imageAltsAdded;
    }
    if (!Object.keys(fields).length) {
      setError("Nothing accepted to publish. Toggle a field to ‘Use proposed’.");
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
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Publish failed");
      const bits = [`Published: ${(json.updatedFields || []).join(", ") || "nothing"}`];
      if (json.redirectCreated) bits.push("301 redirect created for old URL");
      if (json.altResults?.updated) bits.push(`${json.altResults.updated} alt texts updated`);
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
  function patchRow(id: string, patch: Partial<BulkRow>) {
    setBulkRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function toggleAllBulk(on: boolean) {
    // Select-all only touches rows that still need work (not the updated ones).
    setBulkRows((rows) => rows.map((r) => (r.status === "updated" ? r : { ...r, selected: on })));
  }

  async function loadBulkPage(reset: boolean) {
    if (!shop.trim()) {
      setError("Set the shop domain first.");
      return;
    }
    setBulkLoading(true);
    setError(null);
    try {
      const after = reset ? "" : bulkCursor || "";
      const url = `/api/seo/bulk-list?shop=${encodeURIComponent(shop.trim())}&target=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      const resp = await fetch(url, { cache: "no-store" });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Load failed");
      const incoming: BulkRow[] = (json.products || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        image: p.image,
        optimizedAt: p.optimizedAt,
        selected: false,
        status: p.optimizedAt ? "updated" : "",
      }));
      setBulkRows((prev) => (reset ? incoming : [...prev, ...incoming.filter((n) => !prev.some((x) => x.id === n.id))]));
      setBulkCursor(json.pageInfo?.endCursor || null);
      setBulkHasNext(Boolean(json.pageInfo?.hasNextPage));
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setBulkLoading(false);
    }
  }

  async function generateBulkSelected() {
    const targets = bulkRows.filter((r) => r.selected && r.status !== "updated");
    if (!targets.length) {
      setError("Select at least one row to generate.");
      return;
    }
    setBulkWorking(true);
    setError(null);
    let done = 0;
    const generateOne = async (t: BulkRow) => {
      try {
        patchRow(t.id, { status: "auditing…" });
        const a = await (
          await fetch("/api/shopify/seo-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shop: shop.trim(), productId: t.id }),
          })
        ).json();
        if (a.error) throw new Error(a.error);
        patchRow(t.id, { oldScore: a.scorecard.overall, status: "optimizing…" });
        const o: OptimizeResponse & { error?: string } = await (
          await fetch("/api/seo/optimize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ context: a.context, current: a.current, useVision: true }),
          })
        ).json();
        if (o.error) throw new Error(o.error);
        if (o.skipped) {
          patchRow(t.id, { newScore: o.proposedScorecard.overall, skipped: true, status: "skip (already ≥ target)" });
        } else {
          patchRow(t.id, {
            newScore: o.proposedScorecard.overall,
            proposed: o.proposed,
            imageAltsAdded: o.imageAltsAdded || [],
            skipped: false,
            status: "ready",
          });
        }
      } catch (e: any) {
        patchRow(t.id, { status: `error: ${String(e?.message || "failed").slice(0, 40)}` });
      } finally {
        done += 1;
        setBulkProgressText(`Generated ${done}/${targets.length}…`);
      }
    };
    // Run ALL selected rows together (capped concurrency to respect API rate limits).
    const queue = [...targets];
    const CONCURRENCY = 6;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const t = queue.shift();
          if (t) await generateOne(t);
        }
      })
    );
    setBulkWorking(false);
    setBulkProgressText("");
    setStatus("Generated. Review old → new scores, then push the ones you approve. Items already ≥ target were skipped (no AI cost).");
  }

  async function pushBulkSelected() {
    const targets = bulkRows.filter((r) => r.selected && r.proposed && r.status === "ready");
    if (!targets.length) {
      setError("Generate first, then keep the approved rows selected and push.");
      return;
    }
    setBulkWorking(true);
    setError(null);
    let done = 0;
    const pushOne = async (t: BulkRow) => {
      try {
        patchRow(t.id, { status: "pushing…" });
        const p = t.proposed!;
        const resp = await fetch("/api/shopify/seo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: shop.trim(),
            productId: t.id,
            markOptimized: true,
            // Title and handle are deliberately NOT sent (never changed).
            fields: {
              seoTitle: p.seoTitle,
              metaDescription: p.metaDescription,
              bodyHtml: p.bodyHtml,
              tags: p.tags,
              ...(t.imageAltsAdded && t.imageAltsAdded.length ? { imageAlts: t.imageAltsAdded } : {}),
            },
          }),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || "push failed");
        patchRow(t.id, { status: "updated", optimizedAt: new Date().toISOString(), selected: false });
      } catch (e: any) {
        patchRow(t.id, { status: `error: ${String(e?.message || "failed").slice(0, 40)}` });
      } finally {
        done += 1;
        setBulkProgressText(`Pushed ${done}/${targets.length} to Shopify…`);
      }
    };
    // Push all approved rows together (lower cap — Shopify GraphQL is rate-limited).
    const queue = [...targets];
    const CONCURRENCY = 3;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length) {
          const t = queue.shift();
          if (t) await pushOne(t);
        }
      })
    );
    setBulkWorking(false);
    setBulkProgressText("");
    setStatus("Pushed the selected items to Shopify — they're now highlighted as updated.");
  }

  const proposedScoreForField = (f: SeoFieldKey): FieldScore | undefined =>
    liveProposedScore?.fields[f] || optimize?.proposedScorecard.fields[f];

  return (
    <div className="seo-studio">
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <button className="btn" onClick={() => loadBulkPage(true)} disabled={bulkLoading} type="button">
              {bulkLoading ? "Loading…" : "Load products with images"}
            </button>
            {bulkRows.length ? (
              <span className="muted" style={{ fontSize: 12 }}>
                {bulkRows.length} loaded · {bulkRows.filter((r) => r.status === "updated").length} already updated
              </span>
            ) : null}
          </div>

          {bulkRows.length ? (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button className="btn ghost" type="button" onClick={generateBulkSelected} disabled={bulkWorking}>
                  ✨ Generate SEO for selected (scans photos)
                </button>
                <button className="btn" type="button" onClick={pushBulkSelected} disabled={bulkWorking}>
                  🚀 Push selected to Shopify
                </button>
              </div>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #334155", color: "#f8fafc" }}>
                    <th style={{ padding: "4px" }}>
                      <input
                        type="checkbox"
                        onChange={(e) => toggleAllBulk(e.target.checked)}
                        checked={bulkRows.length > 0 && bulkRows.every((r) => r.selected || r.status === "updated")}
                      />
                    </th>
                    <th>Product</th>
                    <th>Old</th>
                    <th></th>
                    <th>New</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((r) => (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid #1e293b",
                        background: r.status === "updated" ? "rgba(21,128,61,0.28)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "4px" }}>
                        <input
                          type="checkbox"
                          disabled={r.status === "updated"}
                          checked={r.selected}
                          onChange={(e) => patchRow(r.id, { selected: e.target.checked })}
                        />
                      </td>
                      <td style={{ padding: "4px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {r.image ? <img src={r.image} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 4 }} /> : null}
                          <span style={{ color: "#e2e8f0" }}>{r.title}</span>
                        </span>
                      </td>
                      <td>{typeof r.oldScore === "number" ? r.oldScore : "—"}</td>
                      <td>
                        <Delta from={r.oldScore} to={r.newScore} />
                      </td>
                      <td style={{ fontWeight: 700, color: typeof r.newScore === "number" ? "#86efac" : "#cbd5e1" }}>
                        {typeof r.newScore === "number" ? r.newScore : "—"}
                      </td>
                      <td style={{ color: r.status === "updated" ? "#86efac" : "#cbd5e1" }}>
                        {r.status === "updated" ? "✓ Updated" : r.status || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bulkHasNext ? (
                <button className="btn ghost" style={{ marginTop: 10 }} type="button" onClick={() => loadBulkPage(false)} disabled={bulkLoading}>
                  {bulkLoading ? "Loading…" : "Load next 100"}
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">Click “Load products with images” to begin. Already-optimized products appear highlighted in green.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
