"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

const IMAGE_UPLOAD_TIMEOUT_MS = 30_000;
const IMAGE_UPLOAD_RETRIES = 2;

async function postFormDataWithRetry(
  url: string,
  form: FormData,
  retries = IMAGE_UPLOAD_RETRIES,
  timeoutMs = IMAGE_UPLOAD_TIMEOUT_MS
) {
  let attempt = 0;
  let lastError: unknown = null;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
    attempt += 1;
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed.");
}

async function optimizeCameraTrack(track: MediaStreamTrack | null) {
  if (!track || track.kind !== "video" || typeof track.applyConstraints !== "function") return;
  const getCapabilities = (track as MediaStreamTrack & { getCapabilities?: () => any }).getCapabilities;
  const capabilities = typeof getCapabilities === "function" ? getCapabilities.call(track) : null;
  const constraints: any = {};
  if (capabilities?.width?.max) constraints.width = { ideal: capabilities.width.max };
  if (capabilities?.height?.max) constraints.height = { ideal: capabilities.height.max };
  if (capabilities?.focusMode && Array.isArray(capabilities.focusMode)) {
    if (capabilities.focusMode.includes("continuous")) {
      constraints.focusMode = "continuous";
    } else if (capabilities.focusMode.includes("single-shot")) {
      constraints.focusMode = "single-shot";
    }
  }
  if (capabilities && "torch" in capabilities) {
    constraints.advanced = [{ torch: true }];
  }
  if (!Object.keys(constraints).length) return;
  try {
    await track.applyConstraints(constraints);
  } catch {
    // Best-effort optimization. Some browsers reject unsupported constraints.
  }
}

export default function ImageUploadSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(() => String(params?.sessionId || "").trim(), [params]);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const closeAfterFlushRef = useRef(false);
  const [pendingCaptures, setPendingCaptures] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [status, setStatus] = useState("Take or choose a photo, then send it to desktop.");

  const notifyDisconnected = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(`/api/image-handoff/session/${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
        keepalive: true,
      });
    } catch {
      // Best-effort disconnect signal.
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const markConnected = async () => {
      try {
        await fetch(`/api/image-handoff/session/${encodeURIComponent(sessionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "connect" }),
        });
      } catch {
        // Best-effort: the next image upload still acts as an active signal.
      }
      if (!cancelled) {
        setStatus("Connected to desktop. Take or choose a photo, then send it.");
      }
    };
    void markConnected();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const onPageHide = () => {
      void notifyDisconnected();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [notifyDisconnected]);

  useEffect(() => {
    setBusy(pendingUploads > 0 || pendingCaptures > 0);
    if (pendingUploads === 0 && pendingCaptures === 0 && closeAfterFlushRef.current) {
      closeAfterFlushRef.current = false;
      if (typeof window !== "undefined") {
        try {
          window.close();
        } catch {
          // ignore
        }
        try {
          window.location.replace("about:blank");
        } catch {
          // ignore
        }
      }
    }
  }, [pendingUploads, pendingCaptures]);

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
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        await optimizeCameraTrack(stream.getVideoTracks?.()[0] || null);
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

  async function createPreviewFile(source: File, maxEdge = 1200, quality = 0.7) {
    try {
      const bitmap = await createImageBitmap(source);
      const srcW = Math.max(1, bitmap.width);
      const srcH = Math.max(1, bitmap.height);
      const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
      const outW = Math.max(1, Math.round(srcW * scale));
      const outH = Math.max(1, Math.round(srcH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return source;
      }
      ctx.drawImage(bitmap, 0, 0, outW, outH);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
      if (!blob) return source;
      return new File([blob], source.name.replace(/\.[^.]+$/, "") + "-preview.jpg", {
        type: "image/jpeg",
      });
    } catch {
      return source;
    }
  }

  function submitCapturePair(sourceFile: File, captureId: string) {
    if (!sessionId) {
      setError("Missing session id.");
      return;
    }
    if (!String(sourceFile.type || "").toLowerCase().startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setPendingUploads((count) => count + 2);
    uploadQueueRef.current = uploadQueueRef.current
      .then(async () => {
        const previewFile = await createPreviewFile(sourceFile);
        const previewForm = new FormData();
        previewForm.append("file", previewFile, previewFile.name || "camera-preview.jpg");
        previewForm.append("captureId", captureId);
        previewForm.append("kind", "preview");
        const previewResp = await postFormDataWithRetry(
          `/api/image-handoff/session/${encodeURIComponent(sessionId)}`,
          previewForm
        );
        const previewJson = await previewResp.json().catch(() => null);
        if (!previewResp.ok) throw new Error(String(previewJson?.error || "Failed to send preview image."));
      })
      .then(async () => {
        const sourceForm = new FormData();
        sourceForm.append("file", sourceFile, sourceFile.name || "camera-upload.jpg");
        sourceForm.append("captureId", captureId);
        sourceForm.append("kind", "source");
        const sourceResp = await postFormDataWithRetry(
          `/api/image-handoff/session/${encodeURIComponent(sessionId)}`,
          sourceForm
        );
        const sourceJson = await sourceResp.json().catch(() => null);
        if (!sourceResp.ok) throw new Error(String(sourceJson?.error || "Failed to send source image."));
      })
      .catch((e: any) => {
        setError(e?.message || "Failed to send image.");
      })
      .finally(() => {
        setPendingUploads((count) => Math.max(0, count - 2));
      });
  }

  function submitFile(file: File) {
    const captureId = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    submitCapturePair(file, captureId);
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
    setError(null);
    setPendingCaptures((count) => count + 1);
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
      submitFile(file);
      setStatus("Capture queued. Uploading in background...");
    } catch (e: any) {
      setError(e?.message || "Failed to capture photo.");
    } finally {
      setPendingCaptures((count) => Math.max(0, count - 1));
    }
  }

  function closeDeviceWindow() {
    void notifyDisconnected();
    if (pendingUploads > 0 || pendingCaptures > 0) {
      closeAfterFlushRef.current = true;
      setStatus(`Finishing ${pendingUploads} upload(s) and ${pendingCaptures} capture(s) before close...`);
      return;
    }
    if (typeof window === "undefined") return;
    try {
      window.close();
    } catch {
      // Ignore close errors and use fallback navigation.
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
            submitFile(file);
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
            submitFile(file);
          }}
        />
        <button
          type="button"
          disabled={cameraBusy || !cameraReady}
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
          {pendingUploads > 0 || pendingCaptures > 0
            ? `Sending... (${pendingUploads} upload / ${pendingCaptures} capture)`
            : cameraBusy
              ? "Opening camera..."
              : "Capture & Send"}
        </button>
        <button
          type="button"
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
          {pendingUploads > 0 || pendingCaptures > 0
            ? `Sending... (${pendingUploads} upload / ${pendingCaptures} capture)`
            : "Choose Existing Photo"}
        </button>
        <button
          type="button"
          onClick={() => {
            closeDeviceWindow();
          }}
          style={{
            width: "100%",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(15,23,42,0.9)",
            color: "#e2e8f0",
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </main>
  );
}
