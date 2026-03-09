"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export default function ImageUploadSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(() => String(params?.sessionId || "").trim(), [params]);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Take or choose a photo, then send it to desktop.");
  const [done, setDone] = useState(false);

  async function submitFile(file: File) {
    if (!sessionId) {
      setError("Missing session id.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await toDataUrl(file);
      if (!dataUrl.startsWith("data:image/")) {
        throw new Error("Please choose an image file.");
      }
      const response = await fetch(`/api/image-handoff/session/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name || "camera-upload.jpg",
          mimeType: file.type || "image/jpeg",
          dataUrl,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(json?.error || "Failed to send image."));
      }
      setDone(true);
      setStatus("Image sent. You can close this page.");
    } catch (e: any) {
      setError(e?.message || "Failed to send image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100dvh", background: "#020617", color: "#f8fafc", padding: 16 }}>
      <div
        style={{
          maxWidth: 460,
          margin: "0 auto",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 14,
          background: "rgba(15, 23, 42, 0.95)",
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <strong>Send Camera Photo</strong>
        <div style={{ textAlign: "center", opacity: 0.85, fontSize: 13 }}>{status}</div>
        {error ? <div style={{ textAlign: "center", color: "#fecaca", fontSize: 13 }}>{error}</div> : null}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            void submitFile(file);
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            void submitFile(file);
          }}
        />
        <button
          type="button"
          disabled={busy || done}
          onClick={() => cameraInputRef.current?.click()}
          style={{
            width: "100%",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(2,6,23,0.7)",
            color: "#fff",
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          {busy ? "Sending..." : "Use This Device Camera"}
        </button>
        <button
          type="button"
          disabled={busy || done}
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "100%",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "#0ea5e9",
            color: "#fff",
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          {busy ? "Sending..." : "Choose Existing Photo"}
        </button>
      </div>
    </main>
  );
}
