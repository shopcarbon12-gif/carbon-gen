"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState("Take or choose a photo, then send it to desktop.");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Live camera preview is not available in this browser.");
      return;
    }
    let cancelled = false;
    const start = async () => {
      setCameraBusy(true);
      setCameraError(null);
      setCameraReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        const video = cameraVideoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setCameraReady(true);
      } catch (e: any) {
        setCameraError(e?.message ? `Unable to open camera: ${e.message}` : "Unable to open camera.");
      } finally {
        if (!cancelled) setCameraBusy(false);
      }
    };
    void start();
    return () => {
      cancelled = true;
      const stream = cameraStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // Best-effort camera cleanup.
          }
        });
        cameraStreamRef.current = null;
      }
      const video = cameraVideoRef.current;
      if (video) video.srcObject = null;
    };
  }, []);

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

  async function captureAndSendPhoto() {
    const video = cameraVideoRef.current;
    if (!video) {
      setError("Camera preview is unavailable.");
      return;
    }
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (!width || !height) {
      setError("Camera is still warming up. Try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas capture is unavailable.");
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });
      if (!blob) throw new Error("Failed to capture photo.");
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      await submitFile(file);
    } catch (e: any) {
      setError(e?.message || "Failed to capture photo.");
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        overflowY: "auto",
        background: "#020617",
        color: "#f8fafc",
        padding: 12,
      }}
    >
      <div
        style={{
          maxWidth: 520,
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
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "4 / 5", background: "#000" }}>
          <video
            ref={cameraVideoRef}
            playsInline
            muted
            autoPlay
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
        {cameraError ? (
          <div style={{ textAlign: "center", color: "#fecaca", fontSize: 13 }}>{cameraError}</div>
        ) : null}
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
          disabled={busy || done || cameraBusy || !cameraReady}
          onClick={() => {
            void captureAndSendPhoto();
          }}
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
          {busy ? "Sending..." : cameraBusy ? "Opening camera..." : "Capture & Send"}
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
