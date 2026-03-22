"use client";

import { useCallback, useEffect, useState } from "react";

type ComplianceChecklist = {
  statementPublished: boolean;
  issueChannelActive: boolean;
  ownerAssigned: boolean;
  responseSlaDefined: boolean;
  remediationLogActive: boolean;
  keyboardAuditDone: boolean;
  contrastAuditDone: boolean;
  altTextAuditDone: boolean;
  formsAuditDone: boolean;
  captionsAuditDone: boolean;
  monthlyRetestDone: boolean;
};

type UsageEvent = { eventName: string; count: number };

type LawWatchState = {
  checkedAt: string;
  lastRunOk: boolean;
  lastError?: string;
  sources: unknown[];
  lastChanges: unknown[];
};

const PANEL: React.CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,.1)",
  background: "rgba(113,49,154,.42)",
  backdropFilter: "blur(14px) saturate(1.2)",
  WebkitBackdropFilter: "blur(14px) saturate(1.2)",
  boxShadow: "0 24px 70px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.1)",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  color: "#f8fafc",
  fontFamily: "ui-sans-serif,system-ui,sans-serif",
  fontSize: 13,
};

const LABEL: React.CSSProperties = {
  margin: 0,
  fontSize: 9,
  fontWeight: 650,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "rgba(212,212,216,.5)",
};

const BTN: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 10,
  background: "rgba(255,255,255,.06)",
  color: "rgba(244,244,245,.85)",
  fontSize: "0.75rem",
  fontWeight: 650,
  padding: "7px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN,
  color: "#c4b5fd",
  borderColor: "rgba(124,58,237,.3)",
  background: "rgba(124,58,237,.12)",
};

export function AccessibilityRightRail() {
  const [checklist, setChecklist] = useState<ComplianceChecklist | null>(null);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [lawWatch, setLawWatch] = useState<LawWatchState | null>(null);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [settingsRes, usageRes, lawRes] = await Promise.all([
        fetch("/api/accessibility/settings?scope=default"),
        fetch("/api/accessibility/usage?scope=default"),
        fetch("/api/accessibility/law-watch-status"),
      ]);
      if (settingsRes.ok) {
        const d = await settingsRes.json();
        setChecklist(d?.complianceChecklist ?? null);
      }
      if (usageRes.ok) {
        const d = await usageRes.json();
        setEvents(d?.byEvent?.slice(0, 3) ?? []);
      }
      if (lawRes.ok) {
        const d = await lawRes.json();
        setLawWatch(d ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const values = checklist ? Object.values(checklist) : [];
  const total = values.length || 11;
  const done = values.filter(Boolean).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  async function sendTestReport() {
    setSending(true);
    setSendStatus(null);
    try {
      const res = await fetch(
        "/api/cron/accessibility-monthly-report?test=true&scope=default",
        { method: "POST" }
      );
      const d = res.ok ? await res.json().catch(() => null) : null;
      setSendStatus(res.ok ? "Sent ✓" : (d?.error ?? "Failed"));
    } catch {
      setSendStatus("Error");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Compliance Checklist */}
      <div style={PANEL}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.88rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Compliance Checklist
          </span>
        </div>
        <p style={LABEL}>Remediation progress</p>
        <div style={{ width: "100%", height: 5, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 999,
            background: "linear-gradient(90deg,#7c3aed,#a78bfa)",
            width: `${percent}%`, transition: "width 400ms ease",
          }} />
        </div>
        <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          {String(done).padStart(2, "0")} / {String(total).padStart(2, "0")}{" "}
          <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "rgba(212,212,216,.55)" }}>
            ({percent}%)
          </span>
        </p>
        {events.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,.07)" }}>
            {events.map((e) => (
              <p key={e.eventName} style={{ margin: 0, fontSize: "0.72rem", color: "rgba(212,212,216,.55)" }}>
                {e.eventName}: <strong style={{ color: "#f8fafc" }}>{e.count}</strong>
              </p>
            ))}
          </div>
        )}
        <button style={BTN} onClick={fetchAll}>
          View Log History ①
        </button>
      </div>

      {/* Law Watch Status */}
      <div style={PANEL}>
        <span style={{ fontSize: "0.88rem", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Law Watch Status
        </span>
        <p style={{ margin: 0, fontSize: "0.75rem", color: "rgba(212,212,216,.55)", lineHeight: 1.4 }}>
          Daily automated checks for accessibility regulation updates
          (ADA.gov, Federal Register, Florida statutes).
        </p>
        {lawWatch ? (
          <p style={{ margin: 0, fontSize: "0.78rem", color: "rgba(212,212,216,.6)" }}>
            Current Compliance:{" "}
            <span style={{ color: lawWatch.lastRunOk ? "#a7f3d0" : "#fca5a5" }}>
              {lawWatch.lastRunOk ? "●● OK" : "●● Issues"}
            </span>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.78rem", color: "rgba(212,212,216,.4)" }}>
            No run recorded yet.
          </p>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={BTN_PRIMARY} onClick={sendTestReport} disabled={sending}>
            {sending ? "Sending..." : "Send"}
          </button>
          <button style={BTN} onClick={fetchAll}>Refresh</button>
        </div>
        {sendStatus && (
          <p style={{ margin: 0, fontSize: "0.75rem", color: sendStatus.includes("✓") ? "#a7f3d0" : "#fca5a5" }}>
            {sendStatus}
          </p>
        )}
      </div>
    </>
  );
}
