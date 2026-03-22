"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type WidgetPosition = "left" | "right";

type AccessibilitySettings = {
  profileName: string;
  brandColor: string;
  panelColor: string;
  triggerStyle: "solid" | "outline" | "glass";
  position: WidgetPosition;
  sideOffset: number;
  bottomOffset: number;
  triggerSize: number;
  iconSize: number;
  panelWidth: number;
  cornerRadius: number;
  widgetLabel: string;
  logoUrl: string;
  logoAlt: string;
  logoVariant: "symbol" | "full" | "wordmark";
  logoMaxHeight: number;
  language: "en" | "es" | "pt-BR" | "he";
  showTextLabel: boolean;
  statementUrl: string;
  feedbackUrl: string;
  supportEmail: string;
  monthlyReportEmail: string;
  accessibilityOwner: string;
  accessibilityOwnerRole: string;
  responseSlaHours: number;
  remediationLogUrl: string;
  complianceChecklist: {
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
  features: {
    textScale: boolean;
    highContrast: boolean;
    readableFont: boolean;
    pauseAnimations: boolean;
    highlightLinks: boolean;
    profiles: boolean;
    contrastModes: boolean;
    textSpacing: boolean;
    lineHeight: boolean;
    textAlign: boolean;
    saturation: boolean;
    hideImages: boolean;
    readingGuide: boolean;
    readingMask: boolean;
    bigCursor: boolean;
    pageStructure: boolean;
    languageSelector: boolean;
  };
};

type UsageSummary = {
  sinceDays: number;
  totalEvents: number;
  byEvent: Array<{ eventName: string; count: number }>;
};

type MonthlyReportState = {
  sentAt: string;
  sentTo: string;
  month: string;
  messageId: string | null;
  ok: boolean;
  error?: string;
};

type LawWatchSourceState = {
  id: string;
  title: string;
  url: string;
  lastStatus: "ok" | "error";
  lastError?: string;
  lastFetchedAt: string;
};

type LawWatchState = {
  checkedAt: string;
  lastRunOk: boolean;
  lastError?: string;
  sources: LawWatchSourceState[];
  lastChanges: Array<{ id: string; title: string; url: string; detectedAt: string }>;
  lastEmailSentAt?: string;
};

type CurrentUser = {
  role: string;
  username: string | null;
};

const defaultSettings: AccessibilitySettings = {
  profileName: "Carbon Accessibility",
  brandColor: "#6d28d9",
  panelColor: "#111827",
  triggerStyle: "solid",
  position: "right",
  sideOffset: 18,
  bottomOffset: 18,
  triggerSize: 52,
  iconSize: 20,
  panelWidth: 300,
  cornerRadius: 14,
  widgetLabel: "Carbon Assist",
  logoUrl: "",
  logoAlt: "Carbon Assist",
  logoVariant: "wordmark",
  logoMaxHeight: 32,
  language: "en",
  showTextLabel: true,
  statementUrl: "https://www.shopcarbon.com/pages/accessibility",
  feedbackUrl: "https://www.shopcarbon.com/pages/contact",
  supportEmail: "elior@carbonjeanscompany.com",
  monthlyReportEmail: "elior@carbonjeanscompany.com",
  accessibilityOwner: "Elior",
  accessibilityOwnerRole: "Accessibility owner",
  responseSlaHours: 48,
  remediationLogUrl: "",
  complianceChecklist: {
    statementPublished: false,
    issueChannelActive: false,
    ownerAssigned: false,
    responseSlaDefined: false,
    remediationLogActive: false,
    keyboardAuditDone: false,
    contrastAuditDone: false,
    altTextAuditDone: false,
    formsAuditDone: false,
    captionsAuditDone: false,
    monthlyRetestDone: false,
  },
  features: {
    textScale: true,
    highContrast: true,
    readableFont: true,
    pauseAnimations: true,
    highlightLinks: true,
    profiles: true,
    contrastModes: true,
    textSpacing: true,
    lineHeight: true,
    textAlign: true,
    saturation: true,
    hideImages: true,
    readingGuide: true,
    readingMask: true,
    bigCursor: true,
    pageStructure: true,
    languageSelector: true,
  },
};

function buildInstallSnippet(settings: AccessibilitySettings) {
  const config = {
    brandColor: settings.brandColor,
    panelColor: settings.panelColor,
    triggerStyle: settings.triggerStyle,
    position: settings.position,
    sideOffset: settings.sideOffset,
    bottomOffset: settings.bottomOffset,
    triggerSize: settings.triggerSize,
    iconSize: settings.iconSize,
    panelWidth: settings.panelWidth,
    cornerRadius: settings.cornerRadius,
    label: settings.widgetLabel,
    language: settings.language,
    showTextLabel: settings.showTextLabel,
    logoUrl: settings.logoUrl,
    logoAlt: settings.logoAlt,
    logoVariant: settings.logoVariant,
    logoMaxHeight: settings.logoMaxHeight,
    statementUrl: settings.statementUrl,
    feedbackUrl: settings.feedbackUrl,
    supportEmail: settings.supportEmail,
    features: settings.features,
  };
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `<script src="https://app.shopcarbon.com/accessibility/widget?config=${encoded}" defer></script>`;
}

function buildManagedInstallSnippet(scope = "default") {
  return `<script src="https://app.shopcarbon.com/accessibility/widget?scope=${encodeURIComponent(scope)}" defer></script>`;
}

function toButtonLabel(enabled: boolean) {
  return enabled ? "ON" : "OFF";
}

export default function AccessibilityPage() {
  const [settingsScope, setSettingsScope] = useState("default");
  const [settings, setSettings] = useState<AccessibilitySettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [copyManagedState, setCopyManagedState] = useState(false);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageStatus, setUsageStatus] = useState<string | null>(null);
  const [lastReportState, setLastReportState] = useState<MonthlyReportState | null>(null);
  const [lastReportLoading, setLastReportLoading] = useState(false);
  const [lawWatchState, setLawWatchState] = useState<LawWatchState | null>(null);
  const [lawWatchLoading, setLawWatchLoading] = useState(false);
  const [lawWatchRunning, setLawWatchRunning] = useState(false);
  const [lawWatchStatus, setLawWatchStatus] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTextScale, setPreviewTextScale] = useState(100);
  const [previewContrast, setPreviewContrast] = useState(false);
  const [previewReadableFont, setPreviewReadableFont] = useState(false);
  const [previewLinkHighlight, setPreviewLinkHighlight] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingMonthlyTest, setSendingMonthlyTest] = useState(false);
  const [monthlyTestStatus, setMonthlyTestStatus] = useState<string | null>(null);
  const [runtimeWidgetMounted, setRuntimeWidgetMounted] = useState(false);

  const installSnippet = useMemo(() => buildInstallSnippet(settings), [settings]);
  const managedInstallSnippet = useMemo(
    () => buildManagedInstallSnippet(settingsScope || "default"),
    [settingsScope]
  );
  const readiness = useMemo(() => {
    const hasStatement = Boolean(settings.statementUrl.trim());
    const hasFeedbackPath = Boolean(settings.feedbackUrl.trim() || settings.supportEmail.trim());
    const hasMonthlyRecipient = Boolean(settings.monthlyReportEmail.trim());
    const hasOwner = Boolean(settings.accessibilityOwner.trim());
    const hasSla = Number.isFinite(settings.responseSlaHours) && settings.responseSlaHours > 0;
    const ready = hasStatement && hasFeedbackPath && hasMonthlyRecipient && hasOwner && hasSla;
    return {
      ready,
      hasStatement,
      hasFeedbackPath,
      hasMonthlyRecipient,
      hasOwner,
      hasSla,
    };
  }, [
    settings.accessibilityOwner,
    settings.feedbackUrl,
    settings.monthlyReportEmail,
    settings.responseSlaHours,
    settings.statementUrl,
    settings.supportEmail,
  ]);
  const checklistItems = useMemo(
    () => [
      { key: "statementPublished", label: "Accessibility statement is published" },
      { key: "issueChannelActive", label: "Issue reporting channel is active" },
      { key: "ownerAssigned", label: "Accessibility owner is assigned" },
      { key: "responseSlaDefined", label: "Response SLA is defined" },
      { key: "remediationLogActive", label: "Remediation log is active and updated" },
      { key: "keyboardAuditDone", label: "Keyboard navigation audit completed" },
      { key: "contrastAuditDone", label: "Contrast audit completed" },
      { key: "altTextAuditDone", label: "Alt text audit completed" },
      { key: "formsAuditDone", label: "Forms and validation audit completed" },
      { key: "captionsAuditDone", label: "Captions/transcripts audit completed" },
      { key: "monthlyRetestDone", label: "Monthly retest and evidence log completed" },
    ] as const,
    []
  );
  const checklistCompletion = useMemo(() => {
    const values = Object.values(settings.complianceChecklist);
    const total = values.length;
    const done = values.filter(Boolean).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  }, [settings.complianceChecklist]);
  const canSaveSettings = currentUser?.role === "admin";

  useEffect(() => {
    let cancelled = false;
    async function loadSavedSettings() {
      setSettingsLoading(true);
      setSettingsStatus(null);
      try {
        const res = await fetch(
          `/api/accessibility/settings?scope=${encodeURIComponent(settingsScope || "default")}`,
          { method: "GET" }
        );
        if (!res.ok) {
          if (!cancelled) setSettingsStatus("Loaded defaults (saved settings unavailable).");
          return;
        }
        const data = (await res.json()) as { ok?: boolean; config?: Partial<AccessibilitySettings> };
        if (!data.ok || !data.config || cancelled) return;
        setSettings((prev) => {
          const incoming = data.config || {};
          const incomingFeatures = incoming.features || {};
          const incomingChecklist = incoming.complianceChecklist || {};
          return {
            ...prev,
            ...incoming,
            complianceChecklist: {
              ...prev.complianceChecklist,
              ...(incomingChecklist as AccessibilitySettings["complianceChecklist"]),
            },
            features: {
              ...prev.features,
              ...incomingFeatures,
            },
          };
        });
        setSettingsStatus(`Loaded saved settings for scope "${settingsScope || "default"}".`);
      } catch {
        if (!cancelled) setSettingsStatus("Loaded defaults (saved settings unavailable).");
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
          setSettingsLoaded(true);
        }
      }
    }
    void loadSavedSettings();
    return () => {
      cancelled = true;
    };
  }, [settingsScope]);

  async function refreshCurrentUser() {
    setUserLoading(true);
    try {
      let res = await fetch("/api/admin/me", { method: "GET" });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch("/api/admin/me", { method: "GET" });
        }
      }
      if (!res.ok) {
        setCurrentUser(null);
        return;
      }
      const data = (await res.json()) as { user?: { role?: string; username?: string | null } };
      setCurrentUser({
        role: String(data.user?.role || "user").trim().toLowerCase() || "user",
        username: data.user?.username ?? null,
      });
    } catch {
      setCurrentUser(null);
    } finally {
      setUserLoading(false);
    }
  }

  useEffect(() => {
    void refreshCurrentUser();
  }, []);

  async function refreshUsageSummary() {
    setUsageLoading(true);
    setUsageStatus(null);
    try {
      let res = await fetch("/api/accessibility/usage?days=30", { method: "GET" });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch("/api/accessibility/usage?days=30", { method: "GET" });
        }
      }
      const data = (await res.json()) as { ok?: boolean; summary?: UsageSummary; error?: string };
      if (!res.ok || !data.ok || !data.summary) {
        setUsageSummary(null);
        setUsageStatus(data.error ? `Usage unavailable: ${data.error}` : "Usage unavailable.");
        return;
      }
      setUsageSummary(data.summary);
      setUsageStatus("Usage snapshot refreshed.");
    } catch {
      setUsageSummary(null);
      setUsageStatus("Usage unavailable.");
    } finally {
      setUsageLoading(false);
    }
  }

  useEffect(() => {
    void refreshUsageSummary();
  }, []);

  async function refreshLastReportState() {
    setLastReportLoading(true);
    try {
      let res = await fetch("/api/accessibility/monthly-report-status", { method: "GET" });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch("/api/accessibility/monthly-report-status", { method: "GET" });
        }
      }
      const data = (await res.json()) as { ok?: boolean; state?: MonthlyReportState | null };
      if (!res.ok || !data.ok) {
        setLastReportState(null);
        return;
      }
      setLastReportState(data.state || null);
    } catch {
      setLastReportState(null);
    } finally {
      setLastReportLoading(false);
    }
  }

  useEffect(() => {
    void refreshLastReportState();
  }, []);

  async function refreshLawWatchStatus() {
    setLawWatchLoading(true);
    try {
      let res = await fetch("/api/accessibility/law-watch-status", { method: "GET" });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch("/api/accessibility/law-watch-status", { method: "GET" });
        }
      }
      const data = (await res.json()) as { ok?: boolean; state?: LawWatchState | null };
      if (!res.ok || !data.ok) {
        setLawWatchState(null);
        return;
      }
      setLawWatchState(data.state || null);
    } catch {
      setLawWatchState(null);
    } finally {
      setLawWatchLoading(false);
    }
  }

  async function runLawWatchNow() {
    setLawWatchRunning(true);
    setLawWatchStatus(null);
    try {
      let res = await fetch("/api/cron/accessibility-law-watch?force=true", { method: "POST" });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch("/api/cron/accessibility-law-watch?force=true", { method: "POST" });
        }
      }
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        changedCount?: number;
        emailSent?: boolean;
        hasFetchError?: boolean;
      };
      if (!res.ok || !data.ok) {
        setLawWatchStatus(data.error ? `Law watch failed: ${data.error}` : `Law watch failed (${res.status}).`);
        await refreshLawWatchStatus();
        return;
      }
      setLawWatchStatus(
        `Law watch complete. Changes detected: ${data.changedCount || 0}. Email sent: ${data.emailSent ? "yes" : "no"}.`
      );
      await refreshLawWatchStatus();
    } catch {
      setLawWatchStatus("Law watch failed: network error.");
    } finally {
      setLawWatchRunning(false);
    }
  }

  useEffect(() => {
    void refreshLawWatchStatus();
  }, []);

  const previewStyles = useMemo(() => {
    const contrastText = previewContrast ? "#ffffff" : "#f8fafc";
    const contrastBg = previewContrast ? "#000000" : "#0b1220";
    return {
      color: contrastText,
      background: contrastBg,
      fontSize: `${previewTextScale}%`,
      fontFamily: previewReadableFont
        ? '"Atkinson Hyperlegible", "Segoe UI", Arial, sans-serif'
        : '"Inter", "Segoe UI", Arial, sans-serif',
    };
  }, [previewContrast, previewReadableFont, previewTextScale]);

  function updateFeature(name: keyof AccessibilitySettings["features"], value: boolean) {
    setSettings((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [name]: value,
      },
    }));
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(installSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  async function copyManagedSnippet() {
    try {
      await navigator.clipboard.writeText(managedInstallSnippet);
      setCopyManagedState(true);
      window.setTimeout(() => setCopyManagedState(false), 1500);
    } catch {
      setCopyManagedState(false);
    }
  }

  function resetPreview() {
    setPreviewTextScale(100);
    setPreviewContrast(false);
    setPreviewReadableFont(false);
    setPreviewLinkHighlight(false);
  }

  function updateChecklist(
    key: keyof AccessibilitySettings["complianceChecklist"],
    value: boolean
  ) {
    setSettings((prev) => ({
      ...prev,
      complianceChecklist: {
        ...prev.complianceChecklist,
        [key]: value,
      },
    }));
  }

  async function sendMonthlyTestReport() {
    const to = settings.monthlyReportEmail.trim();
    if (!to) {
      setMonthlyTestStatus("Enter a monthly report email first.");
      return;
    }
    setSendingMonthlyTest(true);
    setMonthlyTestStatus(null);
    try {
      const url = `/api/cron/accessibility-monthly-report?to=${encodeURIComponent(to)}`;
      let res = await fetch(url, { method: "POST" });

      // Localhost-only convenience: if not authed, create a local auth cookie and retry once.
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch(url, { method: "POST" });
        }
      }

      const data = (await res.json()) as { ok?: boolean; error?: string; sentTo?: string };
      if (!res.ok || !data.ok) {
        setMonthlyTestStatus(data.error ? `Failed: ${data.error}` : `Failed: HTTP ${res.status}`);
        void refreshLastReportState();
        return;
      }
      setMonthlyTestStatus(`Sent monthly test report to ${data.sentTo || to}.`);
      void refreshLastReportState();
    } catch {
      setMonthlyTestStatus("Failed: network error while sending test report.");
    } finally {
      setSendingMonthlyTest(false);
    }
  }

  async function saveSettings() {
    if (!canSaveSettings) {
      setSettingsStatus("Save blocked: admin role required.");
      return;
    }
    setSettingsSaving(true);
    setSettingsStatus(null);
    try {
      const res = await fetch(
        `/api/accessibility/settings?scope=${encodeURIComponent(settingsScope || "default")}`,
        {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: settings }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSettingsStatus(data.error ? `Save failed: ${data.error}` : `Save failed: HTTP ${res.status}`);
        return;
      }
      setSettingsStatus(`Settings saved for scope "${settingsScope || "default"}".`);
    } catch {
      setSettingsStatus("Save failed: network error.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function removeRuntimeWidgetFromPage() {
    const existingWrap = document.getElementById("carbon-a11y-widget");
    if (existingWrap?.parentElement) existingWrap.parentElement.removeChild(existingWrap);
    const existingStyle = document.getElementById("carbon-a11y-style");
    if (existingStyle?.parentElement) existingStyle.parentElement.removeChild(existingStyle);
    const existingGuide = document.getElementById("carbon-a11y-guide-line");
    if (existingGuide?.parentElement) existingGuide.parentElement.removeChild(existingGuide);
    const existingMask = document.getElementById("carbon-a11y-reading-mask");
    if (existingMask?.parentElement) existingMask.parentElement.removeChild(existingMask);
    const runtimeScript = document.getElementById("carbon-a11y-runtime-script");
    if (runtimeScript?.parentElement) runtimeScript.parentElement.removeChild(runtimeScript);
    try {
      (window as unknown as Record<string, unknown>).__carbonA11yLoaded = false;
    } catch {
      // no-op
    }
  }

  function installRuntimeWidgetOnPage() {
    removeRuntimeWidgetFromPage();
    const script = document.createElement("script");
    script.id = "carbon-a11y-runtime-script";
    script.defer = true;
    script.src = `/accessibility/widget?scope=${encodeURIComponent(settingsScope || "default")}&_ts=${Date.now()}`;
    script.onload = () => setRuntimeWidgetMounted(true);
    script.onerror = () => setRuntimeWidgetMounted(false);
    document.body.appendChild(script);
  }

  return (
    <main className={styles.page}>
      {/* PRESERVED — background photo reveal */}
      <style jsx global>{`
        .app-bg-top-photo,
        .app-bg-top-fade {
          display: block !important;
          --app-bg-top-cut: 245px;
          clip-path: inset(0 0 calc(100% - var(--app-bg-top-cut)) 0);
        }
      `}</style>

      {/* A: Hero */}
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>Accessibility</h1>
        <p className={styles.heroSub}>
          Manage the accessibility assistant and site compliance status.
        </p>
      </header>

      {/* B: Tab bar + Publish Changes */}
      <nav className={styles.tabBar}>
        <div className={styles.tabs}>
          <button className={styles.tab}>Docs</button>
          <button className={styles.tab}>Tickets</button>
          <button className={styles.tab}>Log History</button>
          <button className={`${styles.tab} ${styles.tabActive}`}>Widget</button>
        </div>
        <button
          className={styles.publishBtn}
          onClick={saveSettings}
          disabled={settingsSaving || !canSaveSettings}
        >
          {settingsSaving ? "Saving..." : "Publish Changes \u203a"}
        </button>
      </nav>

      {/* C: Success banner */}
      {settings.complianceChecklist.monthlyRetestDone && (
        <div className={styles.successBanner} role="status">
          ✓ Monthly retest and evidence log completed
        </div>
      )}

      {/* D: Main content — single column */}
      <div className={styles.mainCol}>

          {/* CARD 1: Main Accessibility panel */}
          <section className={styles.card} aria-label="Widget overview">
            <div className={styles.cardHeaderRow}>
              <h2 className={styles.cardTitle}>Accessibility</h2>
              <input
                className={styles.scopeInput}
                value={settingsScope}
                onChange={(e) => setSettingsScope(e.target.value)}
                placeholder="default"
                aria-label="Settings scope"
              />
            </div>

            <div className={styles.brandRow}>
              <span className={styles.hexGlyph} aria-hidden>⬡</span>
              <span className={styles.brandName}>CARBON ASSIST</span>
              <span className={styles.activeDot}>Active</span>
            </div>

            <div className={styles.profileSection}>
              <span className={styles.profileLabel}>Accessibility preferences</span>
              <div className={styles.profileStrip}>
                {["Retail", "Low Vision", "Motor", "Dyslexia", "ADHD"].map((p) => (
                  <span key={p} className={styles.profilePill}>{p}</span>
                ))}
                <button className={styles.profilePillAdd}>New +</button>
              </div>
            </div>

            {/* Embedded widget preview sub-card — split layout */}
            <div className={styles.widgetPreviewCard}>
              <div className={styles.wpHead}>
                <div className={styles.wpBrand}>
                  <span className={styles.wpHex} aria-hidden>⬡</span>
                  <span className={styles.wpBrandText}>CARBON ASSIST</span>
                </div>
                <button className={styles.wpClose} aria-label="Close"
                  onClick={() => removeRuntimeWidgetFromPage()}>×</button>
              </div>
              <div className={styles.wpSplit}>
                <div className={styles.wpBody}>
                  <p className={styles.wpEyebrow}>Accessibility preferences</p>
                  <p className={styles.wpSubtitle}>
                    {settings.widgetLabel || "Carbon Assist"} — configure your accessibility experience
                  </p>
                  <div className={styles.wpProfiles}>
                    {["Blind", "Low Vision", "Motor", "Dyslexia", "ADHD", "Seizure Safe"].map((p) => (
                      <span key={p} className={styles.wpProfilePill}>{p}</span>
                    ))}
                  </div>
                </div>
                <div className={styles.wpActionsCol}>
                  <button className={styles.wpActionBtn} onClick={installRuntimeWidgetOnPage}>
                    {runtimeWidgetMounted ? "Reload Preview \u203a" : "Open Preview \u203a"}
                  </button>
                  <button className={styles.wpActionBtn}
                    onClick={() => { removeRuntimeWidgetFromPage(); setRuntimeWidgetMounted(false); }}
                    title="Remove widget from page">↺</button>
                  <button className={styles.wpActionBtn}
                    onClick={() => setPreviewOpen((v) => !v)}>
                    View {previewOpen ? "↑" : "↓"}
                  </button>
                  <button className={styles.wpActionBtn}
                    onClick={() => document.getElementById("snippets-card")?.scrollIntoView({ behavior: "smooth" })}>
                    Installation Snippets ↓
                  </button>
                  <button
                    className={`${styles.wpActionBtn} ${styles.wpActionBtnDanger}`}
                    onClick={() => { removeRuntimeWidgetFromPage(); setRuntimeWidgetMounted(false); }}>
                    Uninstall
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom action row below the preview card */}
            <div className={styles.actionRow}>
              <button className={styles.btn} onClick={installRuntimeWidgetOnPage}>
                Open Preview
              </button>
              <button className={styles.btn} onClick={() => setPreviewOpen((v) => !v)}>
                View {previewOpen ? "↑" : "↓"}
              </button>
              <button className={styles.iconBtn}
                onClick={() => { removeRuntimeWidgetFromPage(); setRuntimeWidgetMounted(false); }}>
                ↺
              </button>
              <button className={styles.btn}
                onClick={() => document.getElementById("snippets-card")?.scrollIntoView({ behavior: "smooth" })}>
                Installation Snippets ↓
              </button>
            </div>

            {/* Inline behavior preview */}
            {previewOpen && (
              <div style={{
                position: "relative", border: "1px solid rgba(255,255,255,.15)",
                borderRadius: 14, padding: 16, minHeight: 180,
                background: "rgba(0,0,0,.3)", marginTop: 8,
                ...(previewContrast ? { background: "#000", color: "#fff" } : {}),
                ...(previewReadableFont ? { fontFamily: "Georgia, serif" } : {}),
                fontSize: `${previewTextScale}%`,
              }}>
                <div className={styles.actionRow} style={{ marginBottom: 12 }}>
                  {settings.features.textScale && (
                    <>
                      <button className={styles.btn}
                        onClick={() => setPreviewTextScale((s) => Math.max(85, s - 10))}>A-</button>
                      <button className={styles.btn}
                        onClick={() => setPreviewTextScale((s) => Math.min(150, s + 10))}>A+</button>
                    </>
                  )}
                  {settings.features.highContrast && (
                    <button className={styles.btn}
                      onClick={() => setPreviewContrast((v) => !v)}>
                      Contrast {toButtonLabel(previewContrast)}
                    </button>
                  )}
                  {settings.features.readableFont && (
                    <button className={styles.btn}
                      onClick={() => setPreviewReadableFont((v) => !v)}>
                      Readable Font {toButtonLabel(previewReadableFont)}
                    </button>
                  )}
                  {settings.features.highlightLinks && (
                    <button className={styles.btn}
                      onClick={() => setPreviewLinkHighlight((v) => !v)}>
                      Link Highlight {toButtonLabel(previewLinkHighlight)}
                    </button>
                  )}
                  <button className={styles.iconBtn} onClick={resetPreview}>Reset</button>
                </div>
                <p>Preview sample text at {previewTextScale}% scale.</p>
                <a href="#accessibility-preview-anchor"
                  style={previewLinkHighlight ? { border: "2px dashed #fbbf24", borderRadius: 6, padding: "2px 6px" } : {}}>
                  Preview link focus style
                </a>
              </div>
            )}

            {settingsStatus && (
              <p className={styles.statusText} role="status">{settingsStatus}</p>
            )}
          </section>

          {/* CARD 2: Installation Snippets */}
          <section id="snippets-card" className={styles.card} aria-label="Installation snippets">
            <div className={styles.cardHeaderRow}>
              <h2 className={styles.cardTitle}>Installation Snippets</h2>
              <div className={styles.cardHeaderActions}>
                <span className={styles.iconBtn}>···</span>
                <span className={styles.iconBtn}>↺ Refresh</span>
              </div>
            </div>
            <div className={styles.snippetBlock}>
              <p className={styles.snippetLabel}>Site Snippet (static config)</p>
              <div className={styles.codeWrap}>
                <code className={styles.codeBlock}>{installSnippet}</code>
                <button className={styles.copyBtn} onClick={copySnippet}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className={styles.snippetBlock}>
              <p className={styles.snippetLabel}>App Snippet (managed scope)</p>
              <div className={styles.codeWrap}>
                <code className={styles.codeBlock}>{managedInstallSnippet}</code>
                <button className={styles.copyBtn} onClick={copyManagedSnippet}>
                  {copyManagedState ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <button className={styles.btn} onClick={installRuntimeWidgetOnPage}>
              Check Installation
            </button>
            {!canSaveSettings && (
              <p className={styles.statusText}>
                {userLoading ? "Checking permissions..." : "Admin role required to save settings."}
              </p>
            )}
          </section>

          {/* CARD 3: Law Watch Status */}
          <section className={styles.card} aria-label="Law watch status">
            <div className={styles.cardHeaderRow}>
              <h2 className={styles.cardTitle}>Law Watch Status</h2>
              <div className={styles.cardHeaderActions}>
                <span className={styles.iconBtn}>···</span>
                <button className={styles.iconBtn} onClick={refreshLawWatchStatus}
                  disabled={lawWatchLoading}>↺ Reset</button>
              </div>
            </div>
            <p className={styles.muted}>
              Daily automated check for accessibility law/regulation source updates
              (ADA.gov, Federal Register, Florida statutes, WCAG pages).
              {lawWatchState && ` Last check: ${new Date(lawWatchState.checkedAt).toLocaleDateString()}.
                Sources: ${lawWatchState.sources.length}. Changes: ${lawWatchState.lastChanges.length}.`}
            </p>
            <div className={styles.actionRow}>
              <button className={styles.btn} onClick={refreshLawWatchStatus} disabled={lawWatchLoading}>
                {lawWatchLoading ? "Refreshing..." : "Refresh Status"}
              </button>
              <button className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={runLawWatchNow} disabled={lawWatchRunning}>
                {lawWatchRunning ? "Running..." : "Run Law Watch now"}
              </button>
            </div>
            {lawWatchState && (
              <p className={styles.statusText}>
                Last run:{" "}
                <span className={lawWatchState.lastRunOk ? styles.statusOk : styles.statusFail}>
                  {lawWatchState.lastRunOk ? "OK" : "Issues detected"}
                </span>
                {lawWatchState.lastError && ` — ${lawWatchState.lastError}`}
              </p>
            )}
            {lawWatchStatus && <p className={styles.statusText} role="status">{lawWatchStatus}</p>}
          </section>

          {/* CARD 4: Configure (all settings forms — collapsible) */}
          <details className={`${styles.card} ${styles.configureDetails}`}>
            <summary className={styles.configureSummary}>
              <span>Configure Widget</span>
              <span className={styles.configureCaret}>▾</span>
            </summary>
            <div className={styles.configureBody}>

              {/* Identity */}
              <div className={styles.configureSection}>
                <p className={styles.configureSectionTitle}>Identity</p>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Profile name</label>
                    <input className={styles.formInput} value={settings.profileName}
                      onChange={(e) => setSettings((prev) => ({ ...prev, profileName: e.target.value }))} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Widget label</label>
                    <input className={styles.formInput} value={settings.widgetLabel}
                      onChange={(e) => setSettings((prev) => ({ ...prev, widgetLabel: e.target.value }))} />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Logo URL (optional)</label>
                  <input className={styles.formInput} value={settings.logoUrl}
                    onChange={(e) => setSettings((prev) => ({ ...prev, logoUrl: e.target.value }))}
                    placeholder="https://cdn.example.com/logo.svg" />
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Logo variant</label>
                    <select className={styles.formSelect} value={settings.logoVariant}
                      onChange={(e) => setSettings((prev) => ({ ...prev, logoVariant: e.target.value as AccessibilitySettings["logoVariant"] }))}>
                      <option value="wordmark">Wordmark</option>
                      <option value="symbol">Symbol</option>
                      <option value="full">Full</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Logo max height (px)</label>
                    <input type="number" className={styles.formInput} min={12} max={120}
                      value={settings.logoMaxHeight}
                      onChange={(e) => setSettings((prev) => ({ ...prev, logoMaxHeight: Number(e.target.value) || prev.logoMaxHeight }))} />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Language</label>
                    <select className={styles.formSelect} value={settings.language}
                      onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value as AccessibilitySettings["language"] }))}>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="pt-BR">Português (Brasil)</option>
                      <option value="he">Hebrew</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.featureToggle} style={{ paddingTop: 24 }}>
                      <input type="checkbox" checked={settings.showTextLabel}
                        onChange={(e) => setSettings((prev) => ({ ...prev, showTextLabel: e.target.checked }))} />
                      Show text label
                    </label>
                  </div>
                </div>
              </div>

              {/* Brand & Placement */}
              <div className={styles.configureSection}>
                <p className={styles.configureSectionTitle}>Brand & Placement</p>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Brand color</label>
                    <input type="color" className={styles.formInput} value={settings.brandColor}
                      onChange={(e) => setSettings((prev) => ({ ...prev, brandColor: e.target.value }))} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Panel color</label>
                    <input type="color" className={styles.formInput} value={settings.panelColor}
                      onChange={(e) => setSettings((prev) => ({ ...prev, panelColor: e.target.value }))} />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Position</label>
                    <select className={styles.formSelect} value={settings.position}
                      onChange={(e) => setSettings((prev) => ({ ...prev, position: e.target.value as WidgetPosition }))}>
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Trigger style</label>
                    <select className={styles.formSelect} value={settings.triggerStyle}
                      onChange={(e) => setSettings((prev) => ({ ...prev, triggerStyle: e.target.value as AccessibilitySettings["triggerStyle"] }))}>
                      <option value="solid">Solid</option>
                      <option value="outline">Outline</option>
                      <option value="glass">Glass</option>
                    </select>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Side offset: {settings.sideOffset}px</label>
                    <input type="range" className={styles.formInput} min={8} max={72}
                      value={settings.sideOffset}
                      onChange={(e) => setSettings((prev) => ({ ...prev, sideOffset: Number(e.target.value) }))} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Bottom offset: {settings.bottomOffset}px</label>
                    <input type="range" className={styles.formInput} min={8} max={72}
                      value={settings.bottomOffset}
                      onChange={(e) => setSettings((prev) => ({ ...prev, bottomOffset: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Button size: {settings.triggerSize}px</label>
                    <input type="range" className={styles.formInput} min={40} max={76}
                      value={settings.triggerSize}
                      onChange={(e) => setSettings((prev) => ({ ...prev, triggerSize: Number(e.target.value) }))} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Corner radius: {settings.cornerRadius}px</label>
                    <input type="range" className={styles.formInput} min={8} max={22}
                      value={settings.cornerRadius}
                      onChange={(e) => setSettings((prev) => ({ ...prev, cornerRadius: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Panel width: {settings.panelWidth}px</label>
                  <input type="range" className={styles.formInput} min={260} max={420}
                    value={settings.panelWidth}
                    onChange={(e) => setSettings((prev) => ({ ...prev, panelWidth: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Compliance & Contact */}
              <div className={styles.configureSection}>
                <p className={styles.configureSectionTitle}>Compliance & Contact</p>
                {[
                  { key: "statementUrl", label: "Accessibility statement URL", type: "url" },
                  { key: "feedbackUrl", label: "Feedback URL", type: "url" },
                  { key: "supportEmail", label: "Support email", type: "email" },
                  { key: "monthlyReportEmail", label: "Monthly report email", type: "email" },
                  { key: "accessibilityOwner", label: "Accessibility owner", type: "text" },
                  { key: "accessibilityOwnerRole", label: "Owner role", type: "text" },
                  { key: "remediationLogUrl", label: "Remediation log URL", type: "url" },
                ].map(({ key, label, type }) => (
                  <div key={key} className={styles.formGroup}>
                    <label className={styles.formLabel}>{label}</label>
                    <input type={type} className={styles.formInput}
                      value={(settings as Record<string, unknown>)[key] as string}
                      onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Response SLA (hours)</label>
                  <input type="number" className={styles.formInput} min={1} max={720}
                    value={settings.responseSlaHours}
                    onChange={(e) => setSettings((prev) => ({
                      ...prev, responseSlaHours: Math.max(1, Math.min(720, Number(e.target.value) || 1))
                    }))} />
                </div>
              </div>

              {/* Feature Matrix */}
              <div className={styles.configureSection}>
                <p className={styles.configureSectionTitle}>Feature Matrix</p>
                <div className={styles.featureGrid}>
                  {(Object.entries(settings.features) as Array<[keyof typeof settings.features, boolean]>).map(([key, val]) => (
                    <label key={key} className={styles.featureToggle}>
                      <input type="checkbox" checked={val}
                        onChange={(e) => updateFeature(key, e.target.checked)} />
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </details>

      </div>
    </main>
  );
}
