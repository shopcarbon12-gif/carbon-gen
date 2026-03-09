"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type BarcodeDetectionLike = {
  rawValue?: string;
};

type BarcodeDetectorCtorLike = new (opts?: {
  formats?: string[];
}) => {
  detect(source: ImageBitmapSource): Promise<BarcodeDetectionLike[]>;
};

function sanitizeBarcodeInput(value: string) {
  return String(value || "").replace(/[^0-9cC]/g, "").toUpperCase();
}

function isValidBarcode(value: string) {
  return /^\d{7,9}$/.test(value) || /^C\d{6,8}$/.test(value);
}

export default function BarcodeScanSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = useMemo(() => String(params?.sessionId || "").trim(), [params]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackControlsRef = useRef<{ stop: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Point your camera at the barcode.");
  const [manualBarcode, setManualBarcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const cleanup = useCallback(() => {
    const fallbackControls = fallbackControlsRef.current;
    if (fallbackControls) {
      try {
        fallbackControls.stop();
      } catch {
        // Ignore fallback scanner cleanup errors.
      }
      fallbackControlsRef.current = null;
    }
    if (typeof window !== "undefined" && rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Best-effort camera cleanup.
        }
      });
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const submitBarcode = useCallback(
    async (value: string) => {
      const normalized = sanitizeBarcodeInput(value).trim();
      if (!isValidBarcode(normalized)) {
        setError("Barcode must be 7-9 digits, or C + 6-8 digits.");
        return false;
      }
      if (!sessionId) {
        setError("Missing handoff session id.");
        return false;
      }
      setSubmitting(true);
      setError(null);
      try {
        const response = await fetch(`/api/barcode-handoff/session/${encodeURIComponent(sessionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcode: normalized }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(String(json?.error || "Failed to submit barcode."));
        }
        setDone(true);
        setStatus(`Barcode sent: ${normalized}. You can close this page.`);
        cleanup();
        return true;
      } catch (e: any) {
        setError(e?.message || "Failed to submit barcode.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [cleanup, sessionId]
  );

  useEffect(() => {
    if (!sessionId || done) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not available in this browser.");
      return;
    }
    const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtorLike })
      .BarcodeDetector;

    let cancelled = false;
    let detectorBusy = false;
    const detector = new BarcodeDetectorCtor({
      formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e"],
    });

    const scanFrame = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !detectorBusy) {
        detectorBusy = true;
        try {
          const detections = await detector.detect(video);
          const raw = String(
            detections.find((row) => String(row?.rawValue || "").trim())?.rawValue || ""
          ).trim();
          if (raw) {
            const normalized = sanitizeBarcodeInput(raw);
            if (isValidBarcode(normalized)) {
              setManualBarcode(normalized);
              setStatus(`Detected: ${normalized}. Sending to desktop...`);
              await submitBarcode(normalized);
              return;
            }
          }
        } catch {
          // Ignore frame-level scanner errors.
        } finally {
          detectorBusy = false;
        }
      }
      rafRef.current = window.requestAnimationFrame(() => {
        void scanFrame();
      });
    };

    const startWithNativeDetector = async () => {
      setBusy(true);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        rafRef.current = window.requestAnimationFrame(() => {
          void scanFrame();
        });
      } catch (e: any) {
        setError(e?.message ? `Unable to start camera scanner: ${e.message}` : "Unable to start camera scanner.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    const startWithZxingFallback = async () => {
      setBusy(true);
      setError(null);
      try {
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        const zxing = (await import("@zxing/browser")) as any;
        const ReaderCtor = zxing?.BrowserMultiFormatReader;
        const NotFoundErrorCtor = zxing?.NotFoundException;
        if (!ReaderCtor) {
          throw new Error("Scanner fallback is unavailable.");
        }
        const reader = new ReaderCtor();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result: any, err: any) => {
            if (cancelled) return;
            if (result) {
              const raw = String(result?.getText?.() || result?.text || "").trim();
              const normalized = sanitizeBarcodeInput(raw);
              if (!isValidBarcode(normalized)) return;
              setManualBarcode(normalized);
              setStatus(`Detected: ${normalized}. Sending to desktop...`);
              void submitBarcode(normalized);
              return;
            }
            if (err && NotFoundErrorCtor && err instanceof NotFoundErrorCtor) {
              return;
            }
          }
        );
        if (cancelled) {
          try {
            controls?.stop?.();
          } catch {
            // Ignore stop errors.
          }
          return;
        }
        fallbackControlsRef.current = controls;
      } catch (e: any) {
        setError(e?.message ? `Unable to start camera scanner: ${e.message}` : "Unable to start camera scanner.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    if (BarcodeDetectorCtor) {
      void startWithNativeDetector();
    } else {
      void startWithZxingFallback();
    }
    return () => {
      cancelled = true;
      cleanup();
      setBusy(false);
    };
  }, [cleanup, done, sessionId, submitBarcode]);

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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong>Scan Barcode</strong>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{busy ? "Opening..." : "Ready"}</span>
        </div>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "4 / 5", background: "#000" }}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ textAlign: "center", opacity: 0.85, fontSize: 13 }}>{status}</div>
        {error ? (
          <div style={{ textAlign: "center", color: "#fecaca", fontSize: 13 }}>{error}</div>
        ) : null}
        <input
          value={manualBarcode}
          onChange={(event) => setManualBarcode(sanitizeBarcodeInput(event.target.value))}
          placeholder="Or type barcode manually"
          style={{
            width: "100%",
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 10,
            padding: "10px 12px",
            background: "rgba(2,6,23,0.7)",
            color: "#fff",
          }}
        />
        <button
          type="button"
          disabled={submitting || done || !isValidBarcode(sanitizeBarcodeInput(manualBarcode).trim())}
          onClick={() => {
            void submitBarcode(manualBarcode);
          }}
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
          {submitting ? "Sending..." : done ? "Sent" : "Send to Desktop"}
        </button>
      </div>
    </main>
  );
}
