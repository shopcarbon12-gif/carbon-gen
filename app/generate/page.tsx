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

      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

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
      setStatus("Saved to IndexedDB. Open Dashboard to view it.");
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
    <div style={{ maxWidth: 1000, margin: "48px auto", fontFamily: "system-ui" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Generate</h1>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/studio/images">Image Studio</Link>
          <button
            onClick={onLogout}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ fontWeight: 600 }}>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          style={{
            width: "100%",
            padding: 12,
            fontFamily: "inherit",
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={onGenerate}
            disabled={loading}
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: loading ? "not-allowed" : "pointer",
              minWidth: 140,
            }}
          >
            {loading ? "Generating..." : "Generate"}
          </button>

          <button
            onClick={onSave}
            disabled={!canSave}
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: !canSave ? "not-allowed" : "pointer",
              minWidth: 180,
            }}
          >
            {saving ? "Saving..." : "Save to Dashboard"}
          </button>

          <button
            onClick={onDownload}
            disabled={!imageBase64}
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: !imageBase64 ? "not-allowed" : "pointer",
              minWidth: 140,
            }}
          >
            Download PNG
          </button>
        </div>

        {error && <div style={{ color: "crimson" }}>Error: {error}</div>}
        {status && <div style={{ color: "green" }}>{status}</div>}

        {imageBase64 && (
          <div style={{ marginTop: 10 }}>
            <h2 style={{ margin: "0 0 8px 0" }}>Generated image</h2>
            <img
              src={`data:image/png;base64,${imageBase64}`}
              alt="Generated"
              style={{
                maxWidth: "100%",
                border: "1px solid #ddd",
                borderRadius: 10,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
