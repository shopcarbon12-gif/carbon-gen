"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { idbAddGeneration } from "@/lib/indexeddb";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState(
    "a clean studio product photo of a black hoodie on a mannequin"
  );
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(
    () => !!imageBase64 && !loading && !saving,
    [imageBase64, loading, saving]
  );

  async function onGenerate() {
    setLoading(true);
    setError(null);
    setStatus(null);
    setImageBase64(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const b64 = data?.imageBase64 ?? null;
      if (!b64) throw new Error("No imageBase64 returned from API");

      setImageBase64(b64);
      setStatus("Generated. You can save it to Dashboard.");
    } catch (e: any) {
      setError(e?.message || "Generate failed");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!imageBase64) return;
    setSaving(true);
    setError(null);
    setStatus(null);

    try {
      const rec = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        prompt,
        imageBase64,
      };
      await idbAddGeneration(rec);
      setStatus("Saved to Dashboard.");
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function onDownload() {
    if (!imageBase64) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${imageBase64}`;
    a.download = `carbon-gen-${Date.now()}.png`;
    a.click();
  }

  async function onLogout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="page">
      <section className="glass-panel card">
        <div className="links">
          <Link href="/studio/images" className="chip">
            Image Studio
          </Link>
          <Link href="/dashboard" className="chip">
            Dashboard
          </Link>
          <Link href="/studio/seo" className="chip">
            Content & SEO
          </Link>
        </div>
      </section>

      <section className="glass-panel card">
        <label className="control-label" htmlFor="prompt">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />

        <div className="actions">
          <button className="btn-base btn-primary action-btn" onClick={onGenerate} disabled={loading}>
            {loading ? "Generating..." : "Generate"}
          </button>
          <button className="btn-base btn-outline action-btn" onClick={onSave} disabled={!canSave}>
            {saving ? "Saving..." : "Save to Dashboard"}
          </button>
          <button className="btn-base btn-outline action-btn" onClick={onDownload} disabled={!imageBase64}>
            Download PNG
          </button>
          <button className="btn-base btn-danger action-btn" onClick={onLogout}>
            Logout
          </button>
        </div>

        {error ? <p className="error">Error: {error}</p> : null}
        {status ? <p className="status">{status}</p> : null}
      </section>

      {imageBase64 ? (
        <section className="glass-panel card">
          <div className="preview-title">Generated Image</div>
          <div className="preview-wrap">
            <img src={`data:image/png;base64,${imageBase64}`} alt="Generated" />
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .page {
          max-width: 1140px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .card {
          padding: 18px;
          display: grid;
          gap: 12px;
        }
        .links {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .chip {
          text-decoration: none;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.04);
          color: #f8fafc;
          padding: 9px 14px;
          font-size: 0.84rem;
          font-weight: 700;
        }
        .chip:hover {
          border-color: rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.1);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .action-btn {
          min-width: 170px;
          padding: 10px 14px;
        }
        .error {
          margin: 0;
          color: #fca5a5;
          font-weight: 700;
        }
        .status {
          margin: 0;
          color: #86efac;
          font-weight: 700;
        }
        .preview-title {
          font-size: 1.05rem;
          font-weight: 700;
        }
        .preview-wrap {
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
          padding: 10px;
        }
        .preview-wrap img {
          width: 100%;
          border-radius: 10px;
          display: block;
        }
      `}</style>
    </main>
  );
}
