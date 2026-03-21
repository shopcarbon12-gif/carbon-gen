"use client";

import { useEffect, useMemo, useState } from "react";

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
  widgetLabel: "Accessibility",
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
    <main className="page">
      <style jsx global>{`
        .app-bg-top-photo,
        .app-bg-top-fade {
          display: block !important;
          --app-bg-top-cut: 245px;
          clip-path: inset(0 0 calc(100% - var(--app-bg-top-cut)) 0);
        }
      `}</style>

      <section className="header-card">
        <div>
          <h1>Accessibility Widget Builder</h1>
          <p>
            This is a custom in-house implementation for `app.shopcarbon.com/accessibility`, built from
            scratch so design and behavior are fully controlled by your team.
          </p>
        </div>
        <div className="header-badges">
          <div className="pill">Legal-safe custom build</div>
          <div className={`pill status-pill ${readiness.ready ? "ready" : "blocked"}`}>
            {readiness.ready ? "Compliance readiness: Ready" : "Compliance readiness: Blocked"}
          </div>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Brand & Layout</h2>
          <label>
            Settings scope
            <input
              value={settingsScope}
              onChange={(e) => setSettingsScope(e.target.value)}
              placeholder="default"
            />
          </label>
          <label>
            Profile name
            <input
              value={settings.profileName}
              onChange={(e) => setSettings((prev) => ({ ...prev, profileName: e.target.value }))}
            />
          </label>

          <label>
            Widget label
            <input
              value={settings.widgetLabel}
              onChange={(e) => setSettings((prev) => ({ ...prev, widgetLabel: e.target.value }))}
            />
          </label>
          <label>
            Default widget language
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  language: e.target.value as AccessibilitySettings["language"],
                }))
              }
            >
              <option value="en">English</option>
              <option value="es">Espanol</option>
              <option value="pt-BR">Portugues (Brasil)</option>
              <option value="he">Hebrew</option>
            </select>
          </label>

          <div className="row">
            <label>
              Brand color
              <input
                type="color"
                value={settings.brandColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, brandColor: e.target.value }))}
              />
            </label>
            <label>
              Panel color
              <input
                type="color"
                value={settings.panelColor}
                onChange={(e) => setSettings((prev) => ({ ...prev, panelColor: e.target.value }))}
              />
            </label>
          </div>

          <div className="row">
            <label>
              Position
              <select
                value={settings.position}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, position: e.target.value as WidgetPosition }))
                }
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showTextLabel}
              onChange={(e) => setSettings((prev) => ({ ...prev, showTextLabel: e.target.checked }))}
            />
            Show text label next to icon
          </label>

          <label>
            Accessibility statement URL
            <input
              type="url"
              value={settings.statementUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, statementUrl: e.target.value }))}
              placeholder="https://www.shopcarbon.com/pages/accessibility"
            />
          </label>

          <label>
            Accessibility feedback URL
            <input
              type="url"
              value={settings.feedbackUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, feedbackUrl: e.target.value }))}
              placeholder="https://www.shopcarbon.com/pages/contact"
            />
          </label>

          <label>
            Accessibility support email
            <input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => setSettings((prev) => ({ ...prev, supportEmail: e.target.value }))}
              placeholder="elior@carbonjeanscompany.com"
            />
          </label>

          <label>
            Monthly compliance report email
            <input
              type="email"
              value={settings.monthlyReportEmail}
              onChange={(e) => setSettings((prev) => ({ ...prev, monthlyReportEmail: e.target.value }))}
              placeholder="elior@carbonjeanscompany.com"
            />
          </label>
          <label>
            Accessibility owner
            <input
              value={settings.accessibilityOwner}
              onChange={(e) => setSettings((prev) => ({ ...prev, accessibilityOwner: e.target.value }))}
              placeholder="Owner name"
            />
          </label>
          <label>
            Owner role/title
            <input
              value={settings.accessibilityOwnerRole}
              onChange={(e) => setSettings((prev) => ({ ...prev, accessibilityOwnerRole: e.target.value }))}
              placeholder="Accessibility owner"
            />
          </label>
          <label>
            Response SLA (hours)
            <input
              type="number"
              min={1}
              max={720}
              value={settings.responseSlaHours}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  responseSlaHours: Math.max(1, Math.min(720, Number(e.target.value) || 1)),
                }))
              }
            />
          </label>
          <label>
            Remediation log URL
            <input
              type="url"
              value={settings.remediationLogUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, remediationLogUrl: e.target.value }))}
              placeholder="https://..."
            />
          </label>
        </article>

        <article className="card">
          <h2>Design</h2>
          <p className="muted">
            Configure widget appearance, collapsed icon size, panel size, and exact site placement.
          </p>
          <div className="row">
            <label>
              Trigger style
              <select
                value={settings.triggerStyle}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    triggerStyle: e.target.value as AccessibilitySettings["triggerStyle"],
                  }))
                }
              >
                <option value="solid">Solid</option>
                <option value="outline">Outline</option>
                <option value="glass">Glass</option>
              </select>
            </label>
            <label>
              Corner radius: {settings.cornerRadius}px
              <input
                type="range"
                min={8}
                max={22}
                value={settings.cornerRadius}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, cornerRadius: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <div className="row">
            <label>
              Side offset: {settings.sideOffset}px
              <input
                type="range"
                min={8}
                max={72}
                value={settings.sideOffset}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, sideOffset: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Bottom offset: {settings.bottomOffset}px
              <input
                type="range"
                min={8}
                max={72}
                value={settings.bottomOffset}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, bottomOffset: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <div className="row">
            <label>
              Collapsed button size: {settings.triggerSize}px
              <input
                type="range"
                min={40}
                max={76}
                value={settings.triggerSize}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, triggerSize: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Icon size: {settings.iconSize}px
              <input
                type="range"
                min={14}
                max={34}
                value={settings.iconSize}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, iconSize: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <label>
            Panel width: {settings.panelWidth}px
            <input
              type="range"
              min={260}
              max={420}
              value={settings.panelWidth}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, panelWidth: Number(e.target.value) }))
              }
            />
          </label>
          <div className="actions">
            <button className="btn primary" onClick={installRuntimeWidgetOnPage}>
              {runtimeWidgetMounted ? "Reload widget on this page" : "Install widget on this page"}
            </button>
            <button
              className="btn"
              onClick={() => {
                removeRuntimeWidgetFromPage();
                setRuntimeWidgetMounted(false);
              }}
            >
              Remove widget from this page
            </button>
          </div>
          <p className="muted status-text">
            {runtimeWidgetMounted
              ? "Runtime widget is mounted on this page. Save settings and click reload to see latest managed config."
              : "Widget is not mounted on this page yet."}
          </p>
        </article>

        <article className="card">
          <h2>Feature Matrix</h2>
          <p className="muted">Pick which controls will be available in your widget panel.</p>
          <div className="feature-list">
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.textScale}
                onChange={(e) => updateFeature("textScale", e.target.checked)}
              />
              Text scaling controls
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.highContrast}
                onChange={(e) => updateFeature("highContrast", e.target.checked)}
              />
              High contrast mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.profiles}
                onChange={(e) => updateFeature("profiles", e.target.checked)}
              />
              Accessibility profiles
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.contrastModes}
                onChange={(e) => updateFeature("contrastModes", e.target.checked)}
              />
              Contrast variants (dark/light/invert/smart)
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.readableFont}
                onChange={(e) => updateFeature("readableFont", e.target.checked)}
              />
              Readable font mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.pauseAnimations}
                onChange={(e) => updateFeature("pauseAnimations", e.target.checked)}
              />
              Pause animations mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.highlightLinks}
                onChange={(e) => updateFeature("highlightLinks", e.target.checked)}
              />
              Highlight links mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.textSpacing}
                onChange={(e) => updateFeature("textSpacing", e.target.checked)}
              />
              Text spacing controls
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.lineHeight}
                onChange={(e) => updateFeature("lineHeight", e.target.checked)}
              />
              Line height controls
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.textAlign}
                onChange={(e) => updateFeature("textAlign", e.target.checked)}
              />
              Text alignment controls
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.saturation}
                onChange={(e) => updateFeature("saturation", e.target.checked)}
              />
              Color saturation controls
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.hideImages}
                onChange={(e) => updateFeature("hideImages", e.target.checked)}
              />
              Hide images mode
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.readingGuide}
                onChange={(e) => updateFeature("readingGuide", e.target.checked)}
              />
              Reading guide
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.readingMask}
                onChange={(e) => updateFeature("readingMask", e.target.checked)}
              />
              Reading mask
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.bigCursor}
                onChange={(e) => updateFeature("bigCursor", e.target.checked)}
              />
              Big cursor
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.pageStructure}
                onChange={(e) => updateFeature("pageStructure", e.target.checked)}
              />
              Page structure quick navigation
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.features.languageSelector}
                onChange={(e) => updateFeature("languageSelector", e.target.checked)}
              />
              Language selector
            </label>
          </div>
        </article>
      </section>

      <section className="card">
        <h2>Install Snippet</h2>
        <p className="muted">
          Paste this script in your storefront head section. It loads your custom widget from your own app
          domain.
        </p>
        <p className="muted">
          Recommended: managed scope snippet (loads latest saved settings server-side).
        </p>
        <textarea readOnly value={managedInstallSnippet} rows={2} />
        <div className="actions">
          <button className="btn primary" onClick={copyManagedSnippet}>
            {copyManagedState ? "Copied" : "Copy managed snippet"}
          </button>
        </div>
        <p className="muted">Static snapshot snippet (embeds current settings in URL):</p>
        <textarea readOnly value={installSnippet} rows={3} />
        <div className="actions">
          <button className="btn primary" onClick={copySnippet}>
            {copied ? "Copied" : "Copy Snippet"}
          </button>
          <button className="btn" onClick={saveSettings} disabled={settingsSaving || !canSaveSettings}>
            {settingsSaving ? "Saving..." : "Save settings"}
          </button>
        </div>
        <p className="muted status-text">
          {userLoading
            ? "Checking permissions..."
            : canSaveSettings
              ? "You can save settings (admin)."
              : "Save settings is admin-only. You can still test locally, but writes are blocked for non-admin users."}
        </p>
        {settingsLoading ? <p className="muted status-text">Loading saved settings...</p> : null}
        {!settingsLoading && settingsLoaded && settingsStatus ? (
          <p className="muted status-text">{settingsStatus}</p>
        ) : null}
      </section>

      <section className="card preview-card" style={previewStyles}>
        <h2>Live Preview (Behavior)</h2>
        <p>
          This preview demonstrates your selected controls on sample content before pushing into a live
          storefront.
        </p>
        <p>
          Carbon can deliver this exact feature set while keeping your dedicated design language, spacing,
          color palette, and icon style.
        </p>
        <a href="#accessibility-preview-anchor" className={previewLinkHighlight ? "link-highlight" : ""}>
          Preview link focus style
        </a>

        <div className="actions">
          {settings.features.textScale ? (
            <>
              <button className="btn" onClick={() => setPreviewTextScale((s) => Math.max(85, s - 10))}>
                A-
              </button>
              <button className="btn" onClick={() => setPreviewTextScale((s) => Math.min(150, s + 10))}>
                A+
              </button>
            </>
          ) : null}

          {settings.features.highContrast ? (
            <button className="btn" onClick={() => setPreviewContrast((v) => !v)}>
              Contrast {toButtonLabel(previewContrast)}
            </button>
          ) : null}

          {settings.features.readableFont ? (
            <button className="btn" onClick={() => setPreviewReadableFont((v) => !v)}>
              Readable Font {toButtonLabel(previewReadableFont)}
            </button>
          ) : null}

          {settings.features.highlightLinks ? (
            <button className="btn" onClick={() => setPreviewLinkHighlight((v) => !v)}>
              Link Highlight {toButtonLabel(previewLinkHighlight)}
            </button>
          ) : null}

          <button className="btn ghost" onClick={resetPreview}>
            Reset Preview
          </button>
        </div>

        <button
          className={`widget-trigger ${settings.position}`}
          style={{
            background: settings.brandColor,
            borderRadius: `${settings.cornerRadius}px`,
          }}
          onClick={() => setPreviewOpen((v) => !v)}
          aria-expanded={previewOpen}
          aria-label="Open accessibility panel preview"
        >
          <span aria-hidden>AA</span>
          {settings.showTextLabel ? <span>{settings.widgetLabel}</span> : null}
        </button>

        {previewOpen ? (
          <aside
            className={`widget-panel ${settings.position}`}
            style={{
              background: settings.panelColor,
              borderRadius: `${settings.cornerRadius}px`,
            }}
          >
            <h3>{settings.widgetLabel}</h3>
            <ul>
              {settings.features.textScale ? <li>Text scaling</li> : null}
              {settings.features.highContrast ? <li>High contrast</li> : null}
              {settings.features.readableFont ? <li>Readable fonts</li> : null}
              {settings.features.pauseAnimations ? <li>Pause animations</li> : null}
              {settings.features.highlightLinks ? <li>Highlight links</li> : null}
            </ul>
          </aside>
        ) : null}
      </section>

      <section className="card">
        <h2>Delivery Plan</h2>
        <ol>
          <li>Finalize visual language (button shape, icon, spacing, typography, motion).</li>
          <li>Hook settings to tenant storage so each shop has its own profile.</li>
          <li>Add analytics events for every feature toggle to measure adoption.</li>
          <li>Run QA for keyboard-only navigation, screen reader labels, and mobile viewport behavior.</li>
          <li>Launch staged rollout and compare accessibility engagement against your baseline.</li>
        </ol>
      </section>

      <section className="card">
        <h2>Compliance Coverage Snapshot (U.S. + Florida)</h2>
        <p className="muted">
          This widget helps with controls and reporting paths, but legal compliance still requires site-level
          remediation of templates, content, forms, media captions/transcripts, and keyboard navigation.
        </p>
        <ul className="coverage-list">
          <li>
            <strong>Widget keyboard support:</strong> Covered in widget runtime (button semantics + focus/escape
            handling).
          </li>
          <li>
            <strong>Accessibility statement:</strong>{" "}
            {settings.statementUrl.trim() ? "Configured in install config." : "Missing - add statement URL."}
          </li>
          <li>
            <strong>Issue reporting path:</strong>{" "}
            {settings.feedbackUrl.trim() || settings.supportEmail.trim()
              ? "Configured (URL and/or support email)."
              : "Missing - add feedback URL or support email."}
          </li>
          <li>
            <strong>Accessibility ownership + SLA:</strong>{" "}
            {readiness.hasOwner && readiness.hasSla
              ? `${settings.accessibilityOwner || "Owner"} assigned with ${settings.responseSlaHours}h response SLA.`
              : "Missing - assign owner and set response SLA."}
          </li>
          <li>
            <strong>Remediation log:</strong>{" "}
            {settings.remediationLogUrl.trim() ? "Configured and ready for audit evidence." : "Missing - add remediation log URL."}
          </li>
          <li>
            <strong>WCAG content/media/forms fixes:</strong> Not handled by widget alone - must be remediated in
            storefront code/content.
          </li>
        </ul>
        <div className="actions">
          <button className="btn primary" onClick={sendMonthlyTestReport} disabled={sendingMonthlyTest}>
            {sendingMonthlyTest ? "Sending..." : "Send test monthly report now"}
          </button>
        </div>
        {monthlyTestStatus ? <p className="muted status-text">{monthlyTestStatus}</p> : null}
      </section>

      <section className="card">
        <h2>Compliance Checklist Tracker</h2>
        <p className="muted">
          Track legal-readiness tasks for ADA/WCAG operations. This status is persisted and included in monthly report
          reminders.
        </p>
        <p>
          Completion:{" "}
          <strong>
            {checklistCompletion.done}/{checklistCompletion.total} ({checklistCompletion.percent}%)
          </strong>
        </p>
        <div className="feature-list">
          {checklistItems.map((item) => (
            <label key={item.key} className="switch">
              <input
                type="checkbox"
                checked={settings.complianceChecklist[item.key]}
                onChange={(e) => updateChecklist(item.key, e.target.checked)}
              />
              {item.label}
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Widget Usage (Last 30 Days)</h2>
        <p className="muted">
          This summary comes from runtime widget events and is included in the monthly compliance email.
        </p>
        <div className="actions">
          <button className="btn" onClick={refreshUsageSummary} disabled={usageLoading}>
            {usageLoading ? "Refreshing..." : "Refresh usage snapshot"}
          </button>
        </div>
        {usageSummary ? (
          <div className="usage-summary">
            <p>
              Total events: <strong>{usageSummary.totalEvents}</strong>
            </p>
            {usageSummary.byEvent.length > 0 ? (
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {usageSummary.byEvent.slice(0, 10).map((entry) => (
                    <tr key={entry.eventName}>
                      <td>{entry.eventName}</td>
                      <td>{entry.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">No events tracked yet.</p>
            )}
          </div>
        ) : null}
        {usageStatus ? <p className="muted status-text">{usageStatus}</p> : null}
      </section>

      <section className="card">
        <h2>Last Monthly Report Status</h2>
        <div className="actions">
          <button className="btn" onClick={refreshLastReportState} disabled={lastReportLoading}>
            {lastReportLoading ? "Refreshing..." : "Refresh report status"}
          </button>
        </div>
        {lastReportState ? (
          <div className="usage-summary">
            <p>
              Last attempt: <strong>{new Date(lastReportState.sentAt).toLocaleString()}</strong>
            </p>
            <p>
              Recipient: <strong>{lastReportState.sentTo}</strong>
            </p>
            <p>
              Month: <strong>{lastReportState.month}</strong>
            </p>
            <p>
              Status:{" "}
              <strong className={lastReportState.ok ? "status-ok" : "status-fail"}>
                {lastReportState.ok ? "Sent" : "Failed"}
              </strong>
            </p>
            {lastReportState.messageId ? (
              <p>
                Message ID: <code>{lastReportState.messageId}</code>
              </p>
            ) : null}
            {lastReportState.error ? <p className="muted">Error: {lastReportState.error}</p> : null}
          </div>
        ) : (
          <p className="muted">No monthly report attempt has been recorded yet.</p>
        )}
      </section>

      <section className="card">
        <h2>Law Watch Status</h2>
        <p className="muted">
          Daily automated check for accessibility law/regulation source updates (ADA.gov, Federal Register, Florida
          statutes, WCAG pages).
        </p>
        <div className="actions">
          <button className="btn" onClick={refreshLawWatchStatus} disabled={lawWatchLoading}>
            {lawWatchLoading ? "Refreshing..." : "Refresh law watch status"}
          </button>
          <button className="btn primary" onClick={runLawWatchNow} disabled={lawWatchRunning}>
            {lawWatchRunning ? "Running..." : "Run law watch now"}
          </button>
        </div>
        {lawWatchState ? (
          <div className="usage-summary">
            <p>
              Last check: <strong>{new Date(lawWatchState.checkedAt).toLocaleString()}</strong>
            </p>
            <p>
              Sources tracked: <strong>{lawWatchState.sources.length}</strong>
            </p>
            <p>
              Last detected changes: <strong>{lawWatchState.lastChanges.length}</strong>
            </p>
            <p>
              Last run status:{" "}
              <strong className={lawWatchState.lastRunOk ? "status-ok" : "status-fail"}>
                {lawWatchState.lastRunOk ? "OK" : "Issues detected"}
              </strong>
            </p>
            {lawWatchState.lastError ? <p className="muted">Error: {lawWatchState.lastError}</p> : null}
          </div>
        ) : (
          <p className="muted">No law watch run recorded yet.</p>
        )}
        {lawWatchStatus ? <p className="muted status-text">{lawWatchStatus}</p> : null}
      </section>

      <style jsx>{`
        .page {
          max-width: 1120px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .header-card,
        .card {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 18px;
          background: rgba(255, 255, 255, 0.035);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          display: grid;
          gap: 10px;
        }
        .header-card {
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 16px;
        }
        h1 {
          margin: 0;
          font-size: 1.35rem;
        }
        h2 {
          margin: 0;
          font-size: 1.06rem;
        }
        h3 {
          margin: 0;
          font-size: 0.98rem;
        }
        p {
          margin: 0;
          line-height: 1.45;
        }
        .muted {
          color: rgba(226, 232, 240, 0.86);
        }
        .pill {
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 7px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .header-badges {
          display: grid;
          gap: 8px;
          justify-items: end;
        }
        .status-pill.ready {
          border-color: rgba(16, 185, 129, 0.8);
          color: #a7f3d0;
        }
        .status-pill.blocked {
          border-color: rgba(248, 113, 113, 0.8);
          color: #fecaca;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        label {
          display: grid;
          gap: 6px;
          color: rgba(248, 250, 252, 0.95);
          font-weight: 600;
          font-size: 0.9rem;
        }
        input,
        select,
        textarea {
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(17, 24, 39, 0.6);
          color: #f8fafc;
          padding: 10px 12px;
          font-size: 0.9rem;
        }
        input[type="range"],
        input[type="color"] {
          padding: 0;
          min-height: 36px;
        }
        textarea {
          resize: vertical;
          min-height: 88px;
        }
        .row {
          display: grid;
          gap: 10px;
          grid-template-columns: 1fr 1fr;
        }
        .feature-list {
          display: grid;
          gap: 8px;
        }
        .switch {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
        }
        .switch input {
          width: 18px;
          height: 18px;
          margin: 0;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .btn {
          border: 1px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          border-radius: 10px;
          padding: 8px 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn.primary {
          background: #f3f4f6;
          color: #050505;
          border-color: #f3f4f6;
        }
        .btn.ghost {
          background: transparent;
        }
        .preview-card {
          position: relative;
          min-height: 280px;
          overflow: hidden;
        }
        .link-highlight {
          display: inline-block;
          border: 2px dashed #fbbf24;
          border-radius: 8px;
          padding: 3px 6px;
        }
        .widget-trigger {
          position: absolute;
          bottom: 18px;
          border: 0;
          color: #fff;
          padding: 10px 14px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .widget-trigger.right {
          right: 18px;
        }
        .widget-trigger.left {
          left: 18px;
        }
        .widget-panel {
          position: absolute;
          bottom: 72px;
          width: min(320px, calc(100% - 36px));
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 12px;
          display: grid;
          gap: 8px;
          color: #f8fafc;
        }
        .widget-panel.right {
          right: 18px;
        }
        .widget-panel.left {
          left: 18px;
        }
        .widget-panel ul {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 4px;
        }
        ol {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 6px;
        }
        .coverage-list {
          margin: 0;
          padding-left: 18px;
          display: grid;
          gap: 8px;
          line-height: 1.45;
        }
        .status-text {
          margin-top: 4px;
          font-size: 0.88rem;
        }
        .usage-summary p {
          margin: 4px 0;
        }
        .status-ok {
          color: #86efac;
        }
        .status-fail {
          color: #fca5a5;
        }
        .usage-table {
          width: 100%;
          max-width: 480px;
          border-collapse: collapse;
          margin-top: 6px;
        }
        .usage-table th,
        .usage-table td {
          border: 1px solid rgba(255, 255, 255, 0.24);
          padding: 6px 8px;
          text-align: left;
        }
        .usage-table th:last-child,
        .usage-table td:last-child {
          text-align: right;
        }
        .btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        @media (max-width: 920px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .header-card {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
