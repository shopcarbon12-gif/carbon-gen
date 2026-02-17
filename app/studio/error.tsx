"use client";

import { useEffect } from "react";

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Studio route error:", error);
  }, [error]);

  return (
    <div className="studio-error">
      <div className="studio-error-card">
        <div className="studio-error-title">Workspace temporarily failed to render.</div>
        <div className="studio-error-body">
          {error?.message || "Unknown render error."}
        </div>
        <button type="button" className="studio-error-btn" onClick={() => reset()}>
          Reload Workspace
        </button>
      </div>
      <style jsx>{`
        .studio-error {
          min-height: calc(100vh - 58px);
          display: grid;
          place-items: center;
          padding: 24px;
        }
        .studio-error-card {
          width: min(760px, 94vw);
          border-radius: 16px;
          border: 1px solid rgba(248, 113, 113, 0.45);
          background: rgba(30, 12, 20, 0.82);
          padding: 18px;
          display: grid;
          gap: 10px;
          color: rgba(254, 242, 242, 0.98);
        }
        .studio-error-title {
          font-size: 0.98rem;
          font-weight: 700;
        }
        .studio-error-body {
          font-size: 0.9rem;
          color: rgba(254, 226, 226, 0.96);
          word-break: break-word;
        }
        .studio-error-btn {
          width: fit-content;
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid rgba(248, 250, 252, 0.9);
          background: rgba(255, 255, 255, 0.14);
          color: #fff;
          font-weight: 700;
          padding: 8px 14px;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

