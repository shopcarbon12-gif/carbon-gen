"use client";

type StudioStatusTone = "idle" | "working" | "success" | "error";

export default function StudioStatusBar(props: {
  title?: string;
  tone: StudioStatusTone;
  message: string;
  meta?: string;
}) {
  const title = String(props.title || "").trim() || "prgress bar";
  const message =
    String(props.message || "").trim() || "Ready. Start from Model Registry or Item References.";
  const meta = String(props.meta || "").trim();
  const chipLabel =
    props.tone === "error"
      ? "Error"
      : props.tone === "working"
        ? "Working"
        : props.tone === "success"
          ? "Done"
          : "Idle";

  return (
    <section className={`card status-bar ${props.tone}`} aria-live="polite" aria-atomic="true">
      <div className="status-bar-head">
        <div className="status-bar-title">{title}</div>
        <span className={`status-chip ${props.tone}`}>{chipLabel}</span>
      </div>
      <div className="status-bar-message">{message}</div>
      {meta ? <div className="status-bar-meta">{meta}</div> : null}

      <style jsx>{`
        .card {
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 16px;
          padding: 16px;
          background: rgba(92, 82, 106, 0.5);
          backdrop-filter: blur(12px) saturate(1.15);
          -webkit-backdrop-filter: blur(12px) saturate(1.15);
          display: grid;
          gap: 10px;
        }
        .status-bar {
          gap: 8px;
        }
        .status-bar-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .status-bar-title {
          font-weight: 700;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          font-size: 0.74rem;
          color: rgba(226, 232, 240, 0.8);
        }
        .status-chip {
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 10px;
          padding: 3px 9px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .status-chip.idle {
          color: rgba(226, 232, 240, 0.96);
          border-color: rgba(255, 255, 255, 0.52);
          background: rgba(255, 255, 255, 0.14);
        }
        .status-chip.working {
          color: #f8fafc;
          border-color: rgba(253, 186, 116, 0.85);
          background: rgba(245, 158, 11, 0.2);
        }
        .status-chip.success {
          color: #dcfce7;
          border-color: rgba(134, 239, 172, 0.85);
          background: rgba(22, 163, 74, 0.22);
        }
        .status-chip.error {
          color: #fecaca;
          border-color: rgba(252, 165, 165, 0.9);
          background: rgba(220, 38, 38, 0.2);
        }
        .status-bar.idle {
          border-color: rgba(255, 255, 255, 0.22);
        }
        .status-bar.working {
          border-color: rgba(250, 204, 21, 0.75);
          box-shadow: 0 0 0 1px rgba(250, 204, 21, 0.15), 0 8px 24px rgba(0, 0, 0, 0.24);
        }
        .status-bar.success {
          border-color: rgba(134, 239, 172, 0.75);
          box-shadow: 0 0 0 1px rgba(134, 239, 172, 0.14), 0 8px 24px rgba(0, 0, 0, 0.2);
        }
        .status-bar.error {
          border-color: rgba(252, 165, 165, 0.82);
          box-shadow: 0 0 0 1px rgba(252, 165, 165, 0.16), 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        .status-bar-message {
          font-size: 0.95rem;
          font-weight: 600;
          color: #f8fafc;
          line-height: 1.35;
        }
        .status-bar-meta {
          font-size: 0.8rem;
          color: rgba(226, 232, 240, 0.86);
          line-height: 1.25;
          word-break: break-word;
        }
      `}</style>
    </section>
  );
}

