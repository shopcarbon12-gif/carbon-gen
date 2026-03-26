"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProfileModeStrip, type ProfileModeId } from "@/components/profile-mode-strip";
import { PremiumSegmentedNav, type PremiumSegmentedTabId } from "@/components/premium-segmented-nav";
import { PremiumToggle } from "@/components/premium-toggle";
import carbonWordmark from "./assets-local/carbon-long-white.png";
import { RefreshIcon } from "./RefreshIcon";
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
  panelTheme: "dark" | "light";
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
    tooltips: boolean;
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

type MonthlyReportServiceState = {
  configured: boolean;
  fromEmail: string;
  fromName: string;
};

type ChecklistHistoryEntry = {
  month: string;
  completed: number;
  total: number;
  percent: number;
  sentAt: string;
  ok: boolean;
};

type AccessibilityExportPayload = {
  generatedAt: string;
  scope: string;
  usageWindowDays: number;
  settings: {
    statementUrl: string;
    feedbackUrl: string;
    supportEmail: string;
    monthlyReportEmail: string;
    accessibilityOwner: string;
    accessibilityOwnerRole: string;
    responseSlaHours: number;
    remediationLogUrl: string;
  };
  checklist: {
    done: number;
    total: number;
    percent: number;
    items: Array<{ key: string; label: string; done: boolean }>;
  };
  usageSummary: UsageSummary;
  lastMonthlyReportStatus: MonthlyReportState | null;
  checklistTrendHistory: ChecklistHistoryEntry[];
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

type IntegrationState = "online" | "offline" | "checking";

type IntegrationItem = {
  id: string;
  name: string;
  endpoint: string;
  settingsHref: string;
  status: "online" | "offline";
  label: string;
};

function integrationPriority(item: IntegrationItem) {
  const key = `${item.id} ${item.name} ${item.endpoint}`.toLowerCase();
  if (key.includes("shopify")) return 0;
  if (key.includes("lightspeed") || key.includes(" ls ")) return 1;
  if (key.includes("dropbox")) return 2;
  if (key.includes("core") || key.includes("/api/health")) return 3;
  return 9;
}

const defaultSettings: AccessibilitySettings = {
  profileName: "Carbon Accessibility",
  brandColor: "#6d28d9",
  panelColor: "#111827",
  triggerStyle: "solid",
  position: "right",
  sideOffset: 10,
  bottomOffset: 10,
  triggerSize: 52,
  iconSize: 26,
  panelWidth: 400,
  cornerRadius: 22,
  widgetLabel: "Carbon Assist",
  logoUrl: "",
  logoAlt: "Carbon Assist",
  logoVariant: "wordmark",
  logoMaxHeight: 32,
  language: "en",
  showTextLabel: true,
  statementUrl: "https://www.shopcarbon.com/pages/accessibility",
  feedbackUrl: "https://www.shopcarbon.com/pages/contact-us",
  supportEmail: "support@shopcarbon.com",
  panelTheme: "dark",
  monthlyReportEmail: "elior@carbonjeanscompany.com",
  accessibilityOwner: "Elior",
  accessibilityOwnerRole: "Accessibility Owner",
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
    tooltips: true,
  },
};

/** Brand / placement defaults — keep in sync with `DEFAULT_CONFIG` in `app/accessibility/widget/route.ts`. */
const brandPlacementDefaults: Pick<
  AccessibilitySettings,
  | "brandColor"
  | "panelColor"
  | "panelTheme"
  | "position"
  | "triggerStyle"
  | "sideOffset"
  | "bottomOffset"
  | "triggerSize"
  | "cornerRadius"
  | "panelWidth"
> = {
  brandColor: "#6d28d9",
  panelColor: "#111827",
  panelTheme: "dark",
  position: "right",
  triggerStyle: "solid",
  sideOffset: 10,
  bottomOffset: 10,
  triggerSize: 52,
  cornerRadius: 22,
  panelWidth: 400,
};

type AssistWidgetProfileKey = "clear" | "blind" | "lowVision" | "motor" | "dyslexia" | "adhd" | "seizure";

const ASSIST_SHELL_PILLS: { key: AssistWidgetProfileKey; label: string }[] = [
  { key: "blind", label: "Blind" },
  { key: "lowVision", label: "Low Vision" },
  { key: "motor", label: "Motor" },
  { key: "dyslexia", label: "Dyslexia" },
  { key: "adhd", label: "ADHD" },
  { key: "seizure", label: "Seizure Safe" },
];

function widgetKeyToStripMode(key: string): ProfileModeId | null {
  switch (key) {
    case "clear":
      return "retail";
    case "lowVision":
      return "low-vision";
    case "motor":
      return "motor";
    case "dyslexia":
      return "dyslexia";
    case "adhd":
      return "adhd";
    default:
      return null;
  }
}

function stripModeToWidgetKey(id: ProfileModeId): AssistWidgetProfileKey | null {
  if (id === "new") return null;
  const m: Record<Exclude<ProfileModeId, "new">, AssistWidgetProfileKey> = {
    retail: "clear",
    "low-vision": "lowVision",
    motor: "motor",
    dyslexia: "dyslexia",
    adhd: "adhd",
  };
  return m[id];
}

/** Payload shape expected by GET /accessibility/widget (must match route.ts normalizeConfigObject). */
function toWidgetEmbedConfig(settings: AccessibilitySettings) {
  return {
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
    panelTheme: settings.panelTheme,
    features: settings.features,
  };
}

function buildInstallSnippet(settings: AccessibilitySettings) {
  const encoded = encodeURIComponent(JSON.stringify(toWidgetEmbedConfig(settings)));
  return `<script src="https://app.shopcarbon.com/accessibility/widget?config=${encoded}&wrev=62" defer></script>`;
}

function buildManagedInstallSnippet(scope = "default") {
  return `<script src="https://app.shopcarbon.com/accessibility/widget?scope=${encodeURIComponent(scope)}&wrev=62" defer></script>`;
}

function toButtonLabel(enabled: boolean) {
  return enabled ? "ON" : "OFF";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Not available";
  return parsed.toLocaleString();
}

function normalizeUrlInput(value: string) {
  return value.toLowerCase();
}

function normalizeEmailInput(value: string) {
  return value.toLowerCase();
}

function clampPx(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeSettings(settings: AccessibilitySettings): AccessibilitySettings {
  const rawLogoH = Number(settings.logoMaxHeight);
  const logoMaxHeight =
    Number.isFinite(rawLogoH) && rawLogoH > 0
      ? Math.max(12, Math.min(120, Math.round(rawLogoH)))
      : 32;
  const rawIcon = Number(settings.iconSize);
  const iconSize =
    Number.isFinite(rawIcon) && rawIcon > 0 ? clampPx(rawIcon, 14, 48) : 26;
  return {
    ...settings,
    logoMaxHeight,
    iconSize,
    statementUrl: normalizeUrlInput(settings.statementUrl || ""),
    feedbackUrl: normalizeUrlInput(settings.feedbackUrl || ""),
    supportEmail: normalizeEmailInput(settings.supportEmail || ""),
    monthlyReportEmail: normalizeEmailInput(settings.monthlyReportEmail || ""),
    remediationLogUrl: normalizeUrlInput(settings.remediationLogUrl || ""),
  };
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatUsageEventLabel(eventName: string) {
  const normalized = eventName.replace(/[_-]+/g, " ").trim();
  if (!normalized) return "Unknown event";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDisplayLabel(value: string) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!normalized) return "";
  const acronyms = new Map([
    ["api", "API"],
    ["ok", "OK"],
    ["sla", "SLA"],
    ["url", "URL"],
  ]);
  return normalized
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (acronyms.has(lower)) return acronyms.get(lower) as string;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function renderGlossyTriangleLabel(label: string, direction: "right" | "down" | "up" = "right") {
  const directionClass =
    direction === "down"
      ? styles.glossyTriangleDown
      : direction === "up"
        ? styles.glossyTriangleUp
        : styles.glossyTriangleRight;
  return (
    <span className={styles.buttonLabelWithTriangle}>
      <span>{label}</span>
      <span className={`${styles.glossyTriangle} ${directionClass}`} aria-hidden="true" />
    </span>
  );
}

export default function AccessibilityPage() {
  const [settingsScope, setSettingsScope] = useState("default");
  const [settings, setSettings] = useState<AccessibilitySettings>(normalizeSettings(defaultSettings));
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [logoMaxHeightDraft, setLogoMaxHeightDraft] = useState<string | null>(null);
  const [iconSizeDraft, setIconSizeDraft] = useState<string | null>(null);
  const [copyManagedState, setCopyManagedState] = useState(false);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageStatus, setUsageStatus] = useState<string | null>(null);
  const [lastReportState, setLastReportState] = useState<MonthlyReportState | null>(null);
  const [lastReportLoading, setLastReportLoading] = useState(false);
  const [reportService, setReportService] = useState<MonthlyReportServiceState | null>(null);
  const [lawWatchState, setLawWatchState] = useState<LawWatchState | null>(null);
  const [lawWatchLoading, setLawWatchLoading] = useState(false);
  const [lawWatchRunning, setLawWatchRunning] = useState(false);
  const [lawWatchStatus, setLawWatchStatus] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [integrationsRefreshing, setIntegrationsRefreshing] = useState(false);
  const [activeTopTab, setActiveTopTab] = useState<"docs" | "tickets" | "log-history" | "widget">("widget");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTextScale, setPreviewTextScale] = useState(100);
  const [previewContrast, setPreviewContrast] = useState(false);
  const [previewReadableFont, setPreviewReadableFont] = useState(false);
  const [previewLinkHighlight, setPreviewLinkHighlight] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingMonthlyTest, setSendingMonthlyTest] = useState(false);
  const [monthlyTestStatus, setMonthlyTestStatus] = useState<string | null>(null);
  const [runtimeWidgetMounted, setRuntimeWidgetMounted] = useState(false);
  const appliedAssistProfileRef = useRef<string>("clear");
  const [studioStripMode, setStudioStripMode] = useState<ProfileModeId | null>("retail");
  const [appliedAssistProfile, setAppliedAssistProfile] = useState<AssistWidgetProfileKey>("clear");
  const [activeModal, setActiveModal] = useState<null | "log-history" | "recipient">(null);
  const [logHistoryData, setLogHistoryData] = useState<AccessibilityExportPayload | null>(null);
  const [logHistoryLoading, setLogHistoryLoading] = useState(false);
  const [logHistoryStatus, setLogHistoryStatus] = useState<string | null>(null);
  const [sendingLogHistoryEmail, setSendingLogHistoryEmail] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState(defaultSettings.monthlyReportEmail);
  const [recipientSaving, setRecipientSaving] = useState(false);
  const [recipientStatus, setRecipientStatus] = useState<string | null>(null);

  const pushAssistProfileToWidget = useCallback((name: AssistWidgetProfileKey) => {
    appliedAssistProfileRef.current = name;
    setAppliedAssistProfile(name);
    setStudioStripMode(widgetKeyToStripMode(name));
    const g = window as Window & { __carbonA11yApplyStudioProfile?: (k: string) => void };
    if (typeof g.__carbonA11yApplyStudioProfile === "function") {
      g.__carbonA11yApplyStudioProfile(name);
    } else {
      setSettingsStatus("Open Preview to apply this profile to the live widget.");
    }
  }, []);

  const handleStudioProfileStripMode = useCallback(
    (id: ProfileModeId) => {
      if (id === "new") {
        const next = window.prompt(
          "New settings scope key (e.g. store-west) — letters, numbers, dashes:",
          ""
        );
        if (next?.trim()) {
          const trimmed = next.trim().replace(/\s+/g, "-");
          setSettingsScope(trimmed);
          setSettingsStatus(`Scope set to "${trimmed}". Publish or load settings for this scope.`);
          document.getElementById("snippets")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      const wk = stripModeToWidgetKey(id);
      if (wk) pushAssistProfileToWidget(wk);
    },
    [pushAssistProfileToWidget]
  );

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
  const panelOpenCount = useMemo(
    () => usageSummary?.byEvent.find((event) => event.eventName === "panel_open")?.count ?? 0,
    [usageSummary]
  );
  const assistClickthroughRate = useMemo(() => {
    if (!usageSummary?.totalEvents) return 0;
    return (panelOpenCount / usageSummary.totalEvents) * 100;
  }, [panelOpenCount, usageSummary]);
  const responseSlaDisplay = useMemo(() => {
    if (!settings.responseSlaHours) return "N/A";
    if (settings.responseSlaHours >= 24 && settings.responseSlaHours % 24 === 0) {
      return `${Math.round(settings.responseSlaHours / 24)}d`;
    }
    return `${settings.responseSlaHours}h`;
  }, [settings.responseSlaHours]);
  const canSaveSettings = currentUser?.role === "admin";
  const normalizedIntegrationState = (value: string): IntegrationState => {
    if (value === "online" || value === "offline") return value;
    return "checking";
  };

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
        setLogoMaxHeightDraft(null);
        setIconSizeDraft(null);
        setSettings((prev) => {
          const incoming = data.config || {};
          const incomingFeatures = incoming.features || {};
          const incomingChecklist = incoming.complianceChecklist || {};
          return normalizeSettings({
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
          });
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

  async function refreshIntegrations(manual = false) {
    if (manual) {
      setIntegrationsRefreshing(true);
    }

    try {
      const resp = await fetch("/api/integrations", { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      const payload =
        json && typeof json === "object" ? (json as { integrations?: unknown }) : {};
      const rows = Array.isArray(payload.integrations) ? payload.integrations : [];

      const next: IntegrationItem[] = rows
        .map((row: unknown): IntegrationItem | null => {
          if (!row || typeof row !== "object") return null;
          const value = row as Record<string, unknown>;
          const id = String(value.id || "").trim();
          const name = String(value.name || "").trim();
          const endpoint = String(value.endpoint || "").trim();
          const settingsHref = String(value.settingsHref || "/settings").trim() || "/settings";
          const status: IntegrationItem["status"] =
            value.status === "online" ? "online" : "offline";
          const label = String(value.label || (status === "online" ? "Online" : "Offline"));
          if (!id || !name) return null;
          return { id, name, endpoint, settingsHref, status, label };
        })
        .filter((row: IntegrationItem | null): row is IntegrationItem => Boolean(row))
        .sort((a, b) => {
          const order = integrationPriority(a) - integrationPriority(b);
          if (order !== 0) return order;
          return a.name.localeCompare(b.name);
        });

      setIntegrations(next);
    } catch {
      setIntegrations([]);
    } finally {
      setIntegrationsLoading(false);
      if (manual) setIntegrationsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshIntegrations(false);
    const timer = window.setInterval(() => {
      void refreshIntegrations(false);
    }, 45000);
    return () => window.clearInterval(timer);
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
      setUsageStatus(null);
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
      const data = (await res.json()) as {
        ok?: boolean;
        state?: MonthlyReportState | null;
        service?: MonthlyReportServiceState | null;
      };
      if (!res.ok || !data.ok) {
        setLastReportState(null);
        setReportService(null);
        return;
      }
      setLastReportState(data.state || null);
      setReportService(data.service || null);
    } catch {
      setLastReportState(null);
      setReportService(null);
    } finally {
      setLastReportLoading(false);
    }
  }

  useEffect(() => {
    void refreshLastReportState();
  }, []);

  useEffect(() => {
    setRecipientDraft(settings.monthlyReportEmail);
  }, [settings.monthlyReportEmail]);

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
      /* Layer 3 (Preview Surface): solid preview chrome only; outer panel + meta card use Pic2 glass */
      background: contrastBg,
      fontSize: `${previewTextScale}%`,
      fontFamily: previewReadableFont
        ? '"Atkinson Hyperlegible", "Segoe UI", Arial, sans-serif'
        : '"Inter", "Segoe UI", Arial, sans-serif',
      ["--preview-accent" as string]: settings.brandColor,
      ["--preview-panel" as string]: settings.panelColor,
    } as React.CSSProperties;
  }, [previewContrast, previewReadableFont, previewTextScale, settings.brandColor, settings.panelColor]);

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

  async function loadLogHistoryData() {
    setLogHistoryLoading(true);
    setLogHistoryStatus(null);
    try {
      const url = `/api/accessibility/export?scope=${encodeURIComponent(settingsScope || "default")}&days=30`;
      let res = await fetch(url, { method: "GET" });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch(url, { method: "GET" });
        }
      }
      const data = (await res.json()) as ({ ok?: boolean; error?: string } & Partial<AccessibilityExportPayload>);
      if (!res.ok || !data.ok) {
        setLogHistoryData(null);
        setLogHistoryStatus(data.error ? `Log history unavailable: ${data.error}` : "Log history unavailable.");
        return;
      }
      setLogHistoryData(data as AccessibilityExportPayload);
    } catch {
      setLogHistoryData(null);
      setLogHistoryStatus("Log history unavailable.");
    } finally {
      setLogHistoryLoading(false);
    }
  }

  async function openLogHistoryModal() {
    setActiveModal("log-history");
    await loadLogHistoryData();
  }

  function openRecipientModal() {
    setRecipientDraft(settings.monthlyReportEmail);
    setRecipientStatus(null);
    setActiveModal("recipient");
  }

  function closeModal() {
    setActiveModal(null);
    setLogHistoryStatus(null);
    setRecipientStatus(null);
  }

  async function downloadLogHistoryCsv() {
    setLogHistoryStatus(null);
    try {
      const url = `/api/accessibility/export?format=csv&scope=${encodeURIComponent(settingsScope || "default")}&days=30`;
      let res = await fetch(url, { method: "GET" });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch(url, { method: "GET" });
        }
      }
      if (!res.ok) {
        setLogHistoryStatus(`CSV download failed (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `accessibility-log-history-${(settingsScope || "default").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setLogHistoryStatus("CSV download failed.");
    }
  }

  async function emailLogHistoryLink() {
    const to = settings.monthlyReportEmail.trim().toLowerCase();
    if (!to) {
      setLogHistoryStatus("Add a monthly report recipient before sending the download link.");
      return;
    }
    setSendingLogHistoryEmail(true);
    setLogHistoryStatus(null);
    try {
      let res = await fetch("/api/accessibility/log-history-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to,
          scope: settingsScope || "default",
          days: 30,
        }),
      });
      if (res.status === 401) {
        const authRes = await fetch("/api/dev/local-auth-session", { method: "POST" });
        if (authRes.ok) {
          res = await fetch("/api/accessibility/log-history-email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              to,
              scope: settingsScope || "default",
              days: 30,
            }),
          });
        }
      }
      const data = (await res.json()) as { ok?: boolean; error?: string; sentTo?: string };
      if (!res.ok || !data.ok) {
        setLogHistoryStatus(data.error ? `Email failed: ${data.error}` : `Email failed (${res.status}).`);
        return;
      }
      setLogHistoryStatus(`Download link sent to ${data.sentTo || to}.`);
    } catch {
      setLogHistoryStatus("Email failed while sending the download link.");
    } finally {
      setSendingLogHistoryEmail(false);
    }
  }

  async function sendMonthlyTestReport() {
    const to = settings.monthlyReportEmail.trim().toLowerCase();
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

  async function persistSettings(nextSettings: AccessibilitySettings, successMessage?: string) {
    if (!canSaveSettings) {
      setSettingsStatus("Save blocked: admin role required.");
      return false;
    }
    const normalized = normalizeSettings(nextSettings);
    setLogoMaxHeightDraft(null);
    setIconSizeDraft(null);
    setSettings(normalized);
    setSettingsSaving(true);
    setSettingsStatus(null);
    try {
      const res = await fetch(
        `/api/accessibility/settings?scope=${encodeURIComponent(settingsScope || "default")}`,
        {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: normalized }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSettingsStatus(data.error ? `Save failed: ${data.error}` : `Save failed: HTTP ${res.status}`);
        return false;
      }
      setSettingsStatus(successMessage || `Settings saved for scope "${settingsScope || "default"}".`);
      return true;
    } catch {
      setSettingsStatus("Save failed: network error.");
      return false;
    } finally {
      setSettingsSaving(false);
    }
  }

  async function saveSettings() {
    await persistSettings(settings);
  }

  async function saveMonthlyRecipient() {
    const nextEmail = recipientDraft.trim().toLowerCase();
    if (!nextEmail) {
      setRecipientStatus("Enter a recipient email.");
      return;
    }
    setRecipientSaving(true);
    setRecipientStatus(null);
    const nextSettings = normalizeSettings({
      ...settings,
      monthlyReportEmail: nextEmail,
    });
    const ok = await persistSettings(nextSettings, "Monthly report recipient updated.");
    if (ok) {
      setRecipientDraft(nextEmail);
      closeModal();
      void refreshLastReportState();
    } else {
      setRecipientStatus("Save failed. Check the page status and try again.");
    }
    setRecipientSaving(false);
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
      const gw = window as unknown as Record<string, unknown>;
      delete gw.__carbonA11yRev;
      gw.__carbonA11yLoaded = false;
      delete gw.__carbonA11yStudioPreview;
      delete gw.__carbonA11yApplyStudioPreview;
      delete gw.__carbonA11yApplyStudioProfile;
    } catch {
      // no-op
    }
  }

  function installRuntimeWidgetOnPage() {
    removeRuntimeWidgetFromPage();
    const gw = window as Window & {
      __carbonA11yStudioPreview?: {
        textScale: number;
        highContrast: boolean;
        readableFont: boolean;
        highlightLinks: boolean;
      };
    };
    gw.__carbonA11yStudioPreview = {
      textScale: previewTextScale,
      highContrast: previewContrast,
      readableFont: previewReadableFont,
      highlightLinks: previewLinkHighlight,
    };
    const script = document.createElement("script");
    script.id = "carbon-a11y-runtime-script";
    script.defer = true;
    const cfg = encodeURIComponent(JSON.stringify(toWidgetEmbedConfig(settings)));
    const sc = encodeURIComponent(settingsScope || "default");
    script.src = `/accessibility/widget?config=${cfg}&scope=${sc}&wrev=62&_ts=${Date.now()}`;
    script.onload = () => {
      setRuntimeWidgetMounted(true);
      const g = window as Window & {
        __carbonA11yApplyStudioProfile?: (k: string) => void;
        __carbonA11yApplyStudioPreview?: () => void;
      };
      requestAnimationFrame(() => {
        g.__carbonA11yApplyStudioProfile?.(appliedAssistProfileRef.current);
        g.__carbonA11yApplyStudioPreview?.();
      });
    };
    script.onerror = () => setRuntimeWidgetMounted(false);
    document.body.appendChild(script);
  }

  function focusSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function activateTopTab(tab: "docs" | "tickets" | "log-history" | "widget") {
    setActiveTopTab(tab);
    if (tab === "docs") {
      focusSection("snippets");
      return;
    }
    if (tab === "tickets") {
      focusSection("config-console");
      return;
    }
    if (tab === "log-history") {
      focusSection("law-watch-rail");
      return;
    }
    focusSection("widget-surface");
  }

  function openWidgetPreview() {
    installRuntimeWidgetOnPage();
    setPreviewOpen(true);
  }

  function uninstallWidgetPreview() {
    removeRuntimeWidgetFromPage();
    setRuntimeWidgetMounted(false);
    setPreviewOpen(false);
  }

  /** Keep embedded widget prefs in sync with Configuration Console "Current preview" chips (separate from localStorage-only visits). */
  useEffect(() => {
    if (!runtimeWidgetMounted) return;
    const g = window as Window & {
      __carbonA11yStudioPreview?: {
        textScale: number;
        highContrast: boolean;
        readableFont: boolean;
        highlightLinks: boolean;
      };
      __carbonA11yApplyStudioPreview?: () => void;
    };
    g.__carbonA11yStudioPreview = {
      textScale: previewTextScale,
      highContrast: previewContrast,
      readableFont: previewReadableFont,
      highlightLinks: previewLinkHighlight,
    };
    g.__carbonA11yApplyStudioPreview?.();
  }, [
    runtimeWidgetMounted,
    previewTextScale,
    previewContrast,
    previewReadableFont,
    previewLinkHighlight,
  ]);

  useEffect(() => {
    return () => {
      removeRuntimeWidgetFromPage();
    };
  }, []);

  useEffect(() => {
    const previousRestoration =
      "scrollRestoration" in window.history ? window.history.scrollRestoration : undefined;

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (previousRestoration !== undefined) {
        window.history.scrollRestoration = previousRestoration;
      }
    };
  }, []);

  return (
    <main className={styles.page}>
      {/* TAB BAR */}
      <nav className={styles.tabBar}>
        <div className={styles.tabsRow}>
          <button
            type="button"
            className={`${styles.tab} ${activeTopTab === "docs" ? styles.tabActive : ""}`}
            onClick={() => activateTopTab("docs")}
            aria-current={activeTopTab === "docs" ? "page" : undefined}
          >
            Docs
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTopTab === "tickets" ? styles.tabActive : ""}`}
            onClick={() => activateTopTab("tickets")}
            aria-current={activeTopTab === "tickets" ? "page" : undefined}
          >
            Tickets
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTopTab === "log-history" ? styles.tabActive : ""}`}
            onClick={() => activateTopTab("log-history")}
            aria-current={activeTopTab === "log-history" ? "page" : undefined}
          >
            Log History
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTopTab === "widget" ? styles.tabActive : ""}`}
            onClick={() => activateTopTab("widget")}
            aria-current={activeTopTab === "widget" ? "page" : undefined}
          >
            Widget
          </button>
        </div>
        <div className={styles.toolbarCluster}>
          <label className={styles.scopeChip}>
            <span className={styles.scopeLabel}>Scope</span>
            <input
              className={styles.scopeChipInput}
              value={settingsScope}
              onChange={(event) => setSettingsScope(event.target.value)}
              placeholder="default"
              aria-label="Settings scope"
            />
          </label>
        <button
          type="button"
          className={styles.publishBtn}
          onClick={saveSettings}
          disabled={settingsSaving || !canSaveSettings}
        >
          {settingsSaving ? "Saving..." : renderGlossyTriangleLabel("Publish Changes")}
        </button>
        </div>
      </nav>

      {/* SUCCESS BANNER */}
      {settings.complianceChecklist.monthlyRetestDone && (
        <div className={styles.successBanner}>
          <div className={styles.bannerCheck}>OK</div>
          Monthly retest and evidence log completed
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className={styles.layout}>

        {/* LEFT COLUMN */}
        <div className={styles.mainCol}>

          {/* ACCESSIBILITY PANEL */}
          <section className={`${styles.glassPanel} ${styles.primaryPanel}`}>
            <div className={styles.panelUtilityBar}>
              <PremiumSegmentedNav
                activeTab={activeTopTab as PremiumSegmentedTabId}
                onTabChange={(id) => activateTopTab(id)}
                onPublish={saveSettings}
                publishDisabled={settingsSaving || !canSaveSettings}
                publishPending={settingsSaving}
              />
            </div>

            <div className={styles.profileSection}>
              <ProfileModeStrip value={studioStripMode} onModeChange={handleStudioProfileStripMode} />
            </div>

            <div
              id="widget-surface"
              className={`${styles.widgetStage} ${styles.widgetStagePic1} ${styles.lightOccupancy}`}
            >
              <div className={styles.widgetShell}>
                <div className={styles.widgetShellHeader}>
                  <div className={styles.widgetShellBrand}>
                    <span className={styles.widgetShellMark} aria-hidden="true" />
                    <span className={styles.widgetShellBrandText}>
                      <span className={styles.widgetShellBrandLead}>CARBON</span><span className={styles.widgetShellBrandTail}>ASSIST</span>
                    </span>
                  </div>
                </div>
                <div className={styles.widgetShellBody}>
                  <h3 className={styles.widgetShellTitle}>Accessibility preferences</h3>
                  <p className={styles.widgetShellCopy}>
                    Tune display, motion, and navigation for this site.
                  </p>
                  <div className={styles.widgetShellPills}>
                    {ASSIST_SHELL_PILLS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        className={`${styles.widgetShellPill} ${appliedAssistProfile === key ? styles.widgetShellPillActive : ""}`}
                        onClick={() => pushAssistProfileToWidget(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.widgetActionRail}>
                <div className={styles.widgetActionRow}>
                  <button type="button" className={styles.wpBtn} onClick={openWidgetPreview}>
                    {renderGlossyTriangleLabel(runtimeWidgetMounted ? "Reload Preview" : "Open Preview")}
                  </button>
                  <button type="button" className={styles.wpBtn} onClick={resetPreview}>
                    Reset
                  </button>
                  <button
                    type="button"
                    className={styles.wpBtn}
                    onClick={() => setPreviewOpen((value) => !value)}
                  >
                    {renderGlossyTriangleLabel(previewOpen ? "Hide" : "View", previewOpen ? "up" : "down")}
                  </button>
                </div>
                <div className={styles.widgetActionRow}>
                  <button type="button" className={styles.wpBtn} onClick={() => focusSection("snippets")}>
                    Installation Snippets
                  </button>
                  <button type="button" className={styles.wpBtn} onClick={uninstallWidgetPreview}>
                    Uninstall
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Accessibility</h2>
              <button type="button" className={styles.panelAction} onClick={() => focusSection("config-console")}>
                Configuration
              </button>
            </div>

            <div className={styles.headerCluster}>
              <p className={styles.panelSub}>
                {settingsLoading ? "Loading scoped settings..." : settingsLoaded ? "Settings synced for this scope." : "Scoped settings pending."}
              </p>
              <span className={styles.statusChip}>
                {userLoading ? "Checking role" : canSaveSettings ? "Admin unlocked" : "Read only"}
              </span>
            </div>

            {/* Brand row */}
            <div className={styles.brandRow}>
              <div className={styles.brandLeft}>
                <Image src={carbonWordmark} alt="Carbon Assist" className={styles.brandLogo} />
                <span className={styles.brandHex}>CA</span>
                <span>CARBON ASSIST</span>
              </div>
              <div className={styles.activeBadge}>Active</div>
            </div>

            {/* Profile strip */}
            <div className={styles.profileSection}>
              <span className={styles.profileLabel}>Accessibility preferences</span>
              <ProfileModeStrip value={studioStripMode} onModeChange={handleStudioProfileStripMode} />
            </div>

            {/* Widget preview card */}
            <div className={styles.widgetPreviewCard}>
              {/* Mini widget mockup on left */}
              <div className={styles.wpLeft}>
                <div className={styles.wpMiniHead}>
                  <div className={styles.wpMiniBrand}>
                    <span>CA</span> CARBON ASSIST
                  </div>
                  <button type="button" className={styles.wpMiniClose} onClick={uninstallWidgetPreview}>
                    X
                  </button>
                </div>
                <div className={styles.wpMiniTitle}>Accessibility preferences</div>
                <div className={styles.wpMiniSub}>Tune display, motion, and navigation for this site.</div>
                <div className={styles.wpMiniProfiles}>
                  {ASSIST_SHELL_PILLS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.wpMiniPill} ${appliedAssistProfile === key ? styles.wpMiniPillActive : ""}`}
                      onClick={() => pushAssistProfileToWidget(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Action buttons on right */}
              <div className={styles.wpRight}>
                <div className={styles.wpActionGroup}>
                  <button className={styles.wpBtn} onClick={installRuntimeWidgetOnPage}>
                    {renderGlossyTriangleLabel(runtimeWidgetMounted ? "Reload Preview" : "Open Preview")}
                  </button>
                  <button
                    type="button"
                    className={styles.wpBtn}
                    onClick={installRuntimeWidgetOnPage}
                    aria-label="Reload preview widget"
                  >
                    <RefreshIcon size={18} />
                  </button>
                  <button className={styles.wpBtn} onClick={() => setPreviewOpen(!previewOpen)}>View</button>
                </div>
                <div className={styles.wpActionGroup}>
                  <button className={styles.wpBtn} onClick={() => document.getElementById('snippets')?.scrollIntoView({behavior:'smooth'})}>
                    Installation Snippets
                  </button>
                  <button type="button" className={styles.wpBtn} onClick={uninstallWidgetPreview}>
                    Uninstall
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom action row */}
            <div className={styles.actionRow}>
              <button className={styles.outlineBtn} onClick={installRuntimeWidgetOnPage}>Open Preview</button>
              <button className={styles.outlineBtn} onClick={() => setPreviewOpen(!previewOpen)}>
                {renderGlossyTriangleLabel("View")}
              </button>
              <button className={styles.outlineBtn} onClick={() => document.getElementById('snippets')?.scrollIntoView({behavior:'smooth'})}>
                Installation Snippets
              </button>
              <button
                type="button"
                className={styles.outlineBtn}
                style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.4)" }}
                onClick={() => focusSection("config-console")}
              >
                Edit
              </button>
            </div>

            <div className={styles.inlineGrid}>
              <div className={styles.miniMetric}>
                <span className={styles.miniMetricLabel}>Readiness</span>
                <strong className={styles.miniMetricValue}>{readiness.ready ? "Ready" : "Pending"}</strong>
              </div>
              <div className={styles.miniMetric}>
                <span className={styles.miniMetricLabel}>Feature Matrix</span>
                <strong className={styles.miniMetricValue}>
                  {Object.values(settings.features).filter(Boolean).length}/{Object.keys(settings.features).length}
                </strong>
              </div>
              <div className={styles.miniMetric}>
                <span className={styles.miniMetricLabel}>Preview Widget</span>
                <strong className={styles.miniMetricValue}>{runtimeWidgetMounted ? "Mounted" : "Idle"}</strong>
              </div>
            </div>

            {previewOpen && (
              <div className={`${styles.previewPanel} ${styles.horizontalSurface} ${styles.lightOccupancy} ${styles.featuredHorizontalSurface}`}>
                <div className={styles.previewActions}>
                  {settings.features.textScale && (
                    <>
                      <button
                        type="button"
                        className={[styles.outlineBtn, previewTextScale !== 100 ? styles.previewChipOn : ""].filter(Boolean).join(" ")}
                        onClick={() => setPreviewTextScale((size) => Math.max(85, size - 10))}
                        aria-pressed={previewTextScale !== 100}
                      >
                        A-
                      </button>
                      <button
                        type="button"
                        className={[styles.outlineBtn, previewTextScale !== 100 ? styles.previewChipOn : ""].filter(Boolean).join(" ")}
                        onClick={() => setPreviewTextScale((size) => Math.min(150, size + 10))}
                        aria-pressed={previewTextScale !== 100}
                      >
                        A+
                      </button>
                    </>
                  )}
                  {settings.features.highContrast && (
                    <button
                      type="button"
                      className={[styles.outlineBtn, previewContrast ? styles.previewChipOn : ""].filter(Boolean).join(" ")}
                      onClick={() => setPreviewContrast((value) => !value)}
                      aria-pressed={previewContrast}
                    >
                      Contrast {toButtonLabel(previewContrast)}
                    </button>
                  )}
                  {settings.features.readableFont && (
                    <button
                      type="button"
                      className={[styles.outlineBtn, previewReadableFont ? styles.previewChipOn : ""].filter(Boolean).join(" ")}
                      onClick={() => setPreviewReadableFont((value) => !value)}
                      aria-pressed={previewReadableFont}
                    >
                      Readable Font {toButtonLabel(previewReadableFont)}
                    </button>
                  )}
                  {settings.features.highlightLinks && (
                    <button
                      type="button"
                      className={[styles.outlineBtn, previewLinkHighlight ? styles.previewChipOn : ""].filter(Boolean).join(" ")}
                      onClick={() => setPreviewLinkHighlight((value) => !value)}
                      aria-pressed={previewLinkHighlight}
                    >
                      Link Highlight {toButtonLabel(previewLinkHighlight)}
                    </button>
                  )}
                </div>
                <div className={styles.previewCanvas} style={previewStyles}>
                  <div>
                    <p className={styles.previewEyebrow}>Preview Surface</p>
                    <h3 className={styles.previewTitle}>Carbon Assist live behavior check</h3>
                    <p className={styles.previewText}>
                      Test contrast, font readability, text scaling, and focus emphasis before publishing settings.
                    </p>
                    <a
                      href="#preview-anchor"
                      className={`${styles.previewLink} ${previewLinkHighlight ? styles.previewLinkActive : ""}`}
                    >
                      Preview link focus style
                    </a>
                  </div>
                  <div
                    className={`${styles.previewMetaCard} ${styles.horizontalSurface} ${styles.lightOccupancy}`}
                  >
                    <span className={styles.previewMetaLabel}>Current preview</span>
                    <strong className={styles.previewMetaValue}>{previewTextScale}% scale</strong>
                    <p className={styles.previewMetaText}>
                      {previewContrast ? "High contrast enabled." : "Default contrast enabled."}{" "}
                      {previewReadableFont ? "Readable font on." : "Readable font off."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {settingsStatus && <p className={styles.inlineStatus}>{settingsStatus}</p>}
          </section>

          {/* INSTALLATION SNIPPETS */}
          <section id="snippets" className={styles.glassPanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Installation Snippets</h2>
              <button className={styles.panelAction} onClick={copySnippet}>
                {copied ? "Copied" : "Refresh"}
              </button>
            </div>

            <div className={styles.snippetSection}>
              <div>
                <div className={styles.snippetLabel}>Site Snippet</div>
                <div className={styles.snippetBox}>
                  <code className={styles.snippetCode}>
                    {installSnippet ? installSnippet.slice(0, 72) + '...' : '<script src="https://example.com/accessibility.js" async></script>'}
                  </code>
                  <button className={styles.snippetCopyBtn} onClick={copySnippet}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <div className={styles.snippetLabel}>App Snippet</div>
                <div className={styles.snippetBox}>
                  <code className={styles.snippetCode}>
                    {managedInstallSnippet ? managedInstallSnippet.slice(0, 72) + '...' : 'const carbonAssist = require("carbon-assist");'}
                  </code>
                  <button className={styles.snippetCopyBtn} onClick={copyManagedSnippet}>
                    {copyManagedState ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={styles.outlineBtn}
              style={{alignSelf:'flex-start'}}
              onClick={openWidgetPreview}
            >
              Check Installation
            </button>
          </section>

          {/* LAW WATCH STATUS */}
          <section id="law-watch-panel" className={styles.glassPanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Law Watch Status</h2>
              <button className={styles.panelAction} onClick={runLawWatchNow}>Reset</button>
            </div>
            <p className={styles.lawDesc}>
              Daily automated checks for accessibility law/regulation source updates (ADA.gov, Federal regulators,
              etc.)
            </p>
            <div className={styles.actionRow}>
              <button className={styles.outlineBtn} onClick={runLawWatchNow} disabled={lawWatchRunning}>
                {lawWatchRunning ? 'Refreshing...' : 'Refresh Status'}
              </button>
              <button className={styles.outlineBtn} style={{width:'42px',justifyContent:'center'}}>OK</button>
              <button className={styles.outlineBtn} onClick={runLawWatchNow} disabled={lawWatchRunning}>
                Run Law watch now
              </button>
            </div>
            {lawWatchStatus && <p className={styles.lawDesc} style={{color:'rgba(255,255,255,0.7)'}}>{lawWatchStatus}</p>}
          </section>

          <section
            id="config-console"
            className={styles.glassPanel}
            style={
              {
                ["--config-accent" as string]: settings.brandColor,
                ["--config-panel" as string]: settings.panelColor,
              } as React.CSSProperties
            }
          >
            <div className={styles.panelHeader}>
              <div>
                <h2 className={styles.panelTitle}>Configuration Console</h2>
                <p className={styles.panelSub}>
                  Preserve working behavior while tuning brand, placement, compliance, and feature access.
                </p>
              </div>
              <button
                type="button"
                className={styles.publishBtn}
                onClick={saveSettings}
                disabled={settingsSaving || !canSaveSettings}
                title={
                  !canSaveSettings
                    ? "Admin role required to save. Sign in as an admin user."
                    : "Save settings for the current scope"
                }
              >
                {settingsSaving ? "Saving..." : "Save Scope"}
              </button>
            </div>
            {!canSaveSettings && (
              <p className={styles.inlineStatus} role="status">
                Read-only: sign in as an <strong>admin</strong> to save. The button stays disabled until then.
              </p>
            )}
            {settingsStatus && <p className={styles.inlineStatus}>{settingsStatus}</p>}

            <div className={styles.configGrid}>
              <div className={`${styles.configCard} ${styles.horizontalSurface} ${styles.lightOccupancy}`}>
                <h3 className={styles.configTitle}>Identity</h3>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Profile name</span>
                    <input
                      className={styles.fieldInput}
                      value={settings.profileName}
                      onChange={(event) => setSettings((prev) => ({ ...prev, profileName: event.target.value }))}
                    />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Widget label</span>
                    <input
                      className={styles.fieldInput}
                      value={settings.widgetLabel}
                      onChange={(event) => setSettings((prev) => ({ ...prev, widgetLabel: event.target.value }))}
                    />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Logo URL</span>
                    <input
                      type="url"
                      className={styles.fieldInput}
                      value={normalizeUrlInput(settings.logoUrl || "")}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(event) => setSettings((prev) => ({ ...prev, logoUrl: normalizeUrlInput(event.target.value) }))}
                      placeholder="https://cdn.example.com/logo.svg"
                    />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Logo max height (px)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className={styles.fieldInput}
                      data-no-autocapitalize="true"
                      aria-label="Logo max height in pixels"
                      value={logoMaxHeightDraft ?? String(settings.logoMaxHeight)}
                      onFocus={() => setLogoMaxHeightDraft(String(settings.logoMaxHeight))}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        setLogoMaxHeightDraft(raw);
                        if (raw !== "") {
                          const n = parseInt(raw, 10);
                          if (Number.isFinite(n)) {
                            setSettings((p) => ({ ...p, logoMaxHeight: clampPx(n, 12, 120) }));
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        setLogoMaxHeightDraft(null);
                        setSettings((p) => {
                          if (raw === "") return { ...p, logoMaxHeight: p.logoMaxHeight };
                          const n = parseInt(raw, 10);
                          return {
                            ...p,
                            logoMaxHeight: Number.isFinite(n) ? clampPx(n, 12, 120) : p.logoMaxHeight,
                          };
                        });
                      }}
                    />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Launcher icon size (px)</span>
                    <span className={styles.fieldHint}>Floating button accessibility glyph (not the panel logo)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className={styles.fieldInput}
                      data-no-autocapitalize="true"
                      aria-label="Launcher icon size in pixels"
                      value={iconSizeDraft ?? String(settings.iconSize)}
                      onFocus={() => setIconSizeDraft(String(settings.iconSize))}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        setIconSizeDraft(raw);
                        if (raw !== "") {
                          const n = parseInt(raw, 10);
                          if (Number.isFinite(n)) {
                            setSettings((p) => ({ ...p, iconSize: clampPx(n, 14, 48) }));
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.replace(/\D/g, "");
                        setIconSizeDraft(null);
                        setSettings((p) => {
                          if (raw === "") return { ...p, iconSize: p.iconSize };
                          const n = parseInt(raw, 10);
                          return {
                            ...p,
                            iconSize: Number.isFinite(n) ? clampPx(n, 14, 48) : p.iconSize,
                          };
                        });
                      }}
                    />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Logo variant</span>
                    <select
                      className={styles.fieldSelect}
                      value={settings.logoVariant}
                      onChange={(event) => setSettings((prev) => ({ ...prev, logoVariant: event.target.value as AccessibilitySettings["logoVariant"] }))}
                    >
                      <option value="wordmark">Wordmark</option>
                      <option value="symbol">Symbol</option>
                      <option value="full">Full</option>
                    </select>
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Language</span>
                    <select
                      className={styles.fieldSelect}
                      value={settings.language}
                      onChange={(event) => setSettings((prev) => ({ ...prev, language: event.target.value as AccessibilitySettings["language"] }))}
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="pt-BR">Portuguese (Brazil)</option>
                      <option value="he">Hebrew</option>
                    </select>
                  </label>
                </div>
                <label className={styles.fieldToggle}>
                  <input
                    type="checkbox"
                    checked={settings.showTextLabel}
                    onChange={(event) => setSettings((prev) => ({ ...prev, showTextLabel: event.target.checked }))}
                  />
                  <span>Show launcher text label</span>
                </label>
              </div>

              <div className={`${styles.configCard} ${styles.horizontalSurface} ${styles.lightOccupancy}`}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px 14px",
                    marginBottom: "10px",
                  }}
                >
                  <h3 className={styles.configTitle} style={{ margin: 0 }}>
                    Brand and Placement
                  </h3>
                  <button
                    type="button"
                    className={styles.outlineBtn}
                    onClick={() => {
                      setSettings((prev) => normalizeSettings({ ...prev, ...brandPlacementDefaults }));
                      setSettingsStatus(
                        'Brand and placement reset to Carbon defaults. Click Publish Changes to push to the storefront (scope= snippet).'
                      );
                    }}
                  >
                    Default mode
                  </button>
                </div>
                <div className={styles.fieldGrid}>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Brand color</span>
                    <input type="color" className={styles.colorInput} value={settings.brandColor} onChange={(event) => setSettings((prev) => ({ ...prev, brandColor: event.target.value }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Panel color</span>
                    <input type="color" className={styles.colorInput} value={settings.panelColor} onChange={(event) => setSettings((prev) => ({ ...prev, panelColor: event.target.value }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Panel theme</span>
                    <select
                      className={styles.fieldSelect}
                      value={settings.panelTheme}
                      onChange={(event) =>
                        setSettings((prev) => ({
                          ...prev,
                          panelTheme: event.target.value === "light" ? "light" : "dark",
                        }))
                      }
                    >
                      <option value="dark">Dark glass (Carbon)</option>
                      <option value="light">Light gray (UserWay-style)</option>
                    </select>
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Position</span>
                    <select className={styles.fieldSelect} value={settings.position} onChange={(event) => setSettings((prev) => ({ ...prev, position: event.target.value as WidgetPosition }))}>
                      <option value="right">Right</option>
                      <option value="left">Left</option>
                    </select>
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Trigger style</span>
                    <select className={styles.fieldSelect} value={settings.triggerStyle} onChange={(event) => setSettings((prev) => ({ ...prev, triggerStyle: event.target.value as AccessibilitySettings["triggerStyle"] }))}>
                      <option value="solid">Solid</option>
                      <option value="outline">Outline</option>
                      <option value="glass">Glass</option>
                    </select>
                  </label>
                </div>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Side offset: {settings.sideOffset}px</span>
                  <input type="range" className={styles.rangeInput} min={8} max={72} value={settings.sideOffset} onChange={(event) => setSettings((prev) => ({ ...prev, sideOffset: Number(event.target.value) }))} />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Bottom offset: {settings.bottomOffset}px</span>
                  <input type="range" className={styles.rangeInput} min={8} max={72} value={settings.bottomOffset} onChange={(event) => setSettings((prev) => ({ ...prev, bottomOffset: Number(event.target.value) }))} />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Trigger size: {settings.triggerSize}px</span>
                  <input type="range" className={styles.rangeInput} min={40} max={96} value={settings.triggerSize} onChange={(event) => setSettings((prev) => ({ ...prev, triggerSize: Number(event.target.value) }))} />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Corner radius: {settings.cornerRadius}px</span>
                  <input type="range" className={styles.rangeInput} min={8} max={22} value={settings.cornerRadius} onChange={(event) => setSettings((prev) => ({ ...prev, cornerRadius: Number(event.target.value) }))} />
                </label>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Panel width: {settings.panelWidth}px</span>
                  <input type="range" className={styles.rangeInput} min={280} max={520} value={settings.panelWidth} onChange={(event) => setSettings((prev) => ({ ...prev, panelWidth: Number(event.target.value) }))} />
                </label>
              </div>

              <div className={`${styles.configCard} ${styles.horizontalSurface} ${styles.lightOccupancy}`}>
                <h3 className={styles.configTitle}>Compliance and Contact</h3>
                <div className={styles.fieldStack}>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Accessibility statement URL</span>
                    <input type="url" className={styles.fieldInput} value={normalizeUrlInput(settings.statementUrl)} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setSettings((prev) => ({ ...prev, statementUrl: normalizeUrlInput(event.target.value) }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Feedback URL</span>
                    <input type="url" className={styles.fieldInput} value={normalizeUrlInput(settings.feedbackUrl)} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setSettings((prev) => ({ ...prev, feedbackUrl: normalizeUrlInput(event.target.value) }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Support email</span>
                    <input type="email" className={styles.fieldInput} value={normalizeEmailInput(settings.supportEmail)} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setSettings((prev) => ({ ...prev, supportEmail: normalizeEmailInput(event.target.value) }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Monthly report email</span>
                    <input type="email" className={styles.fieldInput} value={normalizeEmailInput(settings.monthlyReportEmail)} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setSettings((prev) => ({ ...prev, monthlyReportEmail: normalizeEmailInput(event.target.value) }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Accessibility owner</span>
                    <input className={styles.fieldInput} value={settings.accessibilityOwner} onChange={(event) => setSettings((prev) => ({ ...prev, accessibilityOwner: event.target.value }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Owner role</span>
                    <input className={styles.fieldInput} value={settings.accessibilityOwnerRole} onChange={(event) => setSettings((prev) => ({ ...prev, accessibilityOwnerRole: event.target.value }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Remediation log URL</span>
                    <input type="url" className={styles.fieldInput} value={normalizeUrlInput(settings.remediationLogUrl)} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setSettings((prev) => ({ ...prev, remediationLogUrl: normalizeUrlInput(event.target.value) }))} />
                  </label>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Response SLA (hours)</span>
                    <input type="number" min={1} max={720} className={styles.fieldInput} value={settings.responseSlaHours} onChange={(event) => setSettings((prev) => ({ ...prev, responseSlaHours: Math.max(1, Math.min(720, Number(event.target.value) || 1)) }))} />
                  </label>
                </div>
                <div className={styles.checklistBlock}>
                  <div className={styles.checklistHeader}>
                    <span className={styles.configTitle}>Compliance Checklist</span>
                    <span className={styles.statusChip}>{checklistCompletion.done}/{checklistCompletion.total}</span>
                  </div>
                  <div className={styles.checklistGrid}>
                    {checklistItems.map((item) => (
                      <label key={item.key} className={styles.fieldToggle}>
                        <input
                          type="checkbox"
                          checked={settings.complianceChecklist[item.key]}
                          onChange={(event) => updateChecklist(item.key, event.target.checked)}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`${styles.configCard} ${styles.horizontalSurface} ${styles.lightOccupancy}`}>
                <h3 className={styles.configTitle}>Feature Matrix</h3>
                <div className={styles.featureMatrixList}>
                  {(Object.entries(settings.features) as Array<[keyof AccessibilitySettings["features"], boolean]>).map(([key, value]) => {
                    const labelId = `feature-matrix-${key}`;
                    return (
                      <div key={key} className={styles.featureMatrixRow}>
                        <span className={styles.featureMatrixLabel} id={labelId}>
                          {formatDisplayLabel(key)}
                        </span>
                        <PremiumToggle
                          aria-labelledby={labelId}
                          checked={value}
                          onChange={(event) => updateFeature(key, event.target.checked)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

        </div>{/* end mainCol */}

        {/* RIGHT RAIL */}
        <aside className={styles.rail}>
          <div className={styles.railStack}>
            <section className={`${styles.railCard} ${styles.metricCard} ${styles.apiStatusCard}`}>
              <div className={styles.apiHeader}>
                <span className={styles.apiTitle}>API STATUS</span>
                <button
                  type="button"
                  className={styles.iconActionBtn}
                  onClick={() => void refreshIntegrations(true)}
                  disabled={integrationsRefreshing}
                  aria-label={integrationsRefreshing ? "Refreshing API status" : "Refresh API status"}
                >
                  <RefreshIcon size={19} />
                </button>
              </div>
              <div className={`${styles.railInnerSurface} ${styles.verticalSurface} ${styles.lightOccupancy} ${styles.featuredVerticalSurface}`}>
                <div className={styles.apiList}>
                  {integrationsLoading && integrations.length === 0 ? (
                    <div className={styles.apiRow}>
                      <span className={styles.apiName}>Checking integrations</span>
                      <span className={styles.apiState}>
                        <span className={`${styles.apiDot} ${styles.apiDotChecking}`} />
                        <span className={styles.apiLabel}>Checking</span>
                      </span>
                    </div>
                  ) : integrations.length ? (
                    integrations.map((integration) => {
                      const state = normalizedIntegrationState(integration.status);
                      return (
                        <div key={integration.id} className={styles.apiRow}>
                          <span className={styles.apiName}>{integration.name}</span>
                          <span className={styles.apiState}>
                            <span
                              className={`${styles.apiDot} ${
                                state === "online"
                                  ? styles.apiDotOnline
                                  : state === "offline"
                                    ? styles.apiDotOffline
                                    : styles.apiDotChecking
                              }`}
                            />
                            <span className={styles.apiLabel}>{integration.label}</span>
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.apiEmpty}>No integrations found.</div>
                  )}
                </div>
              </div>
            </section>

            <section className={`${styles.railCard} ${styles.metricCard}`}>
              <div className={styles.metricCardHead}>
                <span className={styles.metricCardTitleWrap}>
                  <span className={styles.metricCardGlyph}>LOG</span>
                  <span className={styles.metricCardTitleText}>Compliance Checklist</span>
                </span>
              </div>
              <div className={`${styles.railInnerSurface} ${styles.verticalSurface} ${styles.lightOccupancy} ${styles.featuredVerticalSurface}`}>
                <div className={styles.progressWrap}>
                  <span className={styles.progressLabel}>Remediation progress</span>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${checklistCompletion.percent}%` }} />
                  </div>
                </div>
                <div className={styles.metricPrimaryRow}>
                  <span className={styles.metricPrimaryValue}>
                    {String(checklistCompletion.done).padStart(2, "0")} / {String(checklistCompletion.total).padStart(2, "0")}
                  </span>
                  <span className={styles.metricPrimaryMeta}>({checklistCompletion.percent}%)</span>
                </div>
                <div className={styles.metricSplitStats}>
                  <div className={styles.metricSplitItem}>
                    <strong>{responseSlaDisplay}</strong>
                    <span>Response SLA target</span>
                  </div>
                  <div className={styles.metricSplitItem}>
                    <strong>{formatPercent(assistClickthroughRate)}</strong>
                    <span>Assist clickthrough rate</span>
                  </div>
                </div>
                <button type="button" className={styles.metricFooterBtn} onClick={() => void openLogHistoryModal()}>
                  <span>View Log History</span>
                  <span className={styles.metricFooterIcon}>&gt;</span>
                </button>
              </div>
            </section>

            <section className={`${styles.railCard} ${styles.metricCard}`}>
              <div className={styles.metricCardHead}>
                <span className={styles.metricCardTitle}>Usage Snapshot</span>
                <button
                  type="button"
                  className={styles.iconActionBtn}
                  onClick={refreshUsageSummary}
                  disabled={usageLoading}
                  aria-label={usageLoading ? "Refreshing usage snapshot" : "Refresh usage snapshot"}
                >
                  <RefreshIcon size={19} />
                </button>
              </div>
              <div className={`${styles.railInnerSurface} ${styles.verticalSurface} ${styles.lightOccupancy}`}>
                {usageSummary ? (
                  <>
                    <div className={styles.metricPrimaryRow}>
                      <span className={styles.metricPrimaryValue}>{usageSummary.totalEvents}</span>
                      <span className={styles.metricPrimaryMeta}>events / {usageSummary.sinceDays} days</span>
                    </div>
                    <div className={styles.metricDetailList}>
                      {usageSummary.byEvent.slice(0, 3).map((event) => (
                        <div key={event.eventName} className={styles.metricDetailRow}>
                          <span>{formatUsageEventLabel(event.eventName)}</span>
                          <strong>{event.count}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className={styles.railStatus}>Usage data unavailable.</p>
                )}
                <button type="button" className={styles.metricFooterBtn} onClick={() => void openLogHistoryModal()}>
                  View Log History
                </button>
                {usageStatus && <p className={styles.railStatus}>{usageStatus}</p>}
              </div>
            </section>

            <section className={`${styles.railCard} ${styles.metricCard}`}>
              <div className={styles.metricCardHead}>
                <span className={styles.metricCardTitle}>Monthly Report</span>
              </div>
              <div className={`${styles.railInnerSurface} ${styles.verticalSurface} ${styles.lightOccupancy}`}>
                <div className={styles.metricDetailList}>
                  <div className={styles.metricDetailRow}>
                    <span>Recipient</span>
                    <button type="button" className={styles.metricInlineBtn} onClick={openRecipientModal}>
                      Update Recipient
                    </button>
                  </div>
                  <div className={styles.metricDetailRow}>
                    <span>Last sent</span>
                    <strong>{formatTimestamp(lastReportState?.sentAt)}</strong>
                  </div>
                  <div className={styles.metricDetailRow}>
                    <span>Status</span>
                    <span className={styles.metricIndicator}>
                      <span
                        className={`${styles.apiDot} ${
                          reportService?.configured ? styles.apiDotOnline : styles.apiDotOffline
                        }`}
                      />
                      <span className={styles.apiLabel}>{reportService?.configured ? "Connected" : "Offline"}</span>
                    </span>
                  </div>
                  <div className={styles.metricDetailRow}>
                    <span>From</span>
                    <strong>{reportService?.fromEmail || "Not configured"}</strong>
                  </div>
                </div>
                <div className={styles.metricButtonRow}>
                  <button
                    type="button"
                    className={styles.metricActionBtn}
                    onClick={sendMonthlyTestReport}
                    disabled={sendingMonthlyTest}
                  >
                    {sendingMonthlyTest ? "Sending..." : "Send Test"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.metricActionBtn} ${styles.metricIconBtn}`}
                    onClick={refreshLastReportState}
                    disabled={lastReportLoading}
                    aria-label={lastReportLoading ? "Refreshing monthly report status" : "Refresh monthly report status"}
                  >
                    <RefreshIcon size={20} />
                  </button>
                </div>
                {monthlyTestStatus && <p className={styles.railStatus}>{monthlyTestStatus}</p>}
              </div>
            </section>

            <section id="law-watch-rail" className={`${styles.railCard} ${styles.metricCard}`}>
              <div className={styles.metricCardHead}>
                <span className={styles.metricCardTitle}>Law Watch Status</span>
              </div>
              <div className={`${styles.railInnerSurface} ${styles.verticalSurface} ${styles.lightOccupancy}`}>
                <p className={styles.metricCopy}>
                  Daily automated checks for accessibility law and regulation updates.
                </p>
                <div className={styles.metricStatusBox}>
                  <span className={styles.metricStatusLabel}>Current Compliance</span>
                  <span className={styles.statusGreen}>{lawWatchState?.lastRunOk ? "Active" : "Attention"}</span>
                </div>
                <div className={styles.metricButtonRow}>
                  <button
                    type="button"
                    className={styles.metricActionBtn}
                    onClick={runLawWatchNow}
                    disabled={lawWatchRunning}
                  >
                    {lawWatchRunning ? "Running..." : "Run Now"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.metricActionBtn} ${styles.metricIconBtn}`}
                    onClick={refreshLawWatchStatus}
                    disabled={lawWatchLoading}
                    aria-label={lawWatchLoading ? "Refreshing law watch status" : "Refresh law watch status"}
                  >
                    <RefreshIcon size={20} />
                  </button>
                </div>
                {lawWatchStatus && <p className={styles.railStatus}>{lawWatchStatus}</p>}
              </div>
            </section>
          </div>

          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.railCardTitle}>STUDIO STATE</span>
              <button type="button" className={styles.railActionBtn} onClick={refreshCurrentUser}>
                Refresh
              </button>
            </div>
            <div className={styles.railRow}>
              <span>Scope</span>
              <span className={styles.railValue}>{settingsScope || "default"}</span>
            </div>
            <div className={styles.railRow}>
              <span>User</span>
              <span className={styles.railValue}>
                {userLoading ? "Checking..." : currentUser ? `${currentUser.username || "local"} / ${currentUser.role}` : "Unavailable"}
              </span>
            </div>
            <div className={styles.railRow}>
              <span>Preview widget</span>
              <span className={styles.railValue}>{runtimeWidgetMounted ? "Mounted" : "Idle"}</span>
            </div>
            <div className={styles.railRow}>
              <span>Settings</span>
              <span className={styles.railValue}>{settingsSaving ? "Saving" : settingsLoaded ? "Loaded" : "Pending"}</span>
            </div>
            {settingsStatus && <p className={styles.railStatus}>{settingsStatus}</p>}
          </section>

          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.complianceTitle}>Compliance Snapshot</span>
            </div>
            <div className={styles.progressWrap}>
              <span className={styles.progressLabel}>Remediation progress</span>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${checklistCompletion.percent}%` }} />
              </div>
            </div>
            <div className={styles.statsRow}>
              <span className={styles.statBig}>
                {String(checklistCompletion.done).padStart(2, "0")} / {String(checklistCompletion.total).padStart(2, "0")}
              </span>
              <span className={styles.statSuffix}>({checklistCompletion.percent}%)</span>
            </div>
            <div className={styles.statMeta}>
              <div className={styles.statMetaRow}>
                <span className={styles.statMetaNum}>{readiness.ready ? "Ready" : "Open"}</span>
                <span className={styles.statMetaLabel}>Deployment readiness</span>
              </div>
              <div className={styles.statMetaRow}>
                <span className={styles.statMetaNum}>{settings.complianceChecklist.monthlyRetestDone ? "Done" : "Open"}</span>
                <span className={styles.statMetaLabel}>Monthly retest state</span>
              </div>
            </div>
          </section>

          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.railCardTitle}>READINESS GATES</span>
            </div>
            <div className={styles.readinessList}>
              <div className={styles.readinessItem}>
                <span className={`${styles.readinessDot} ${readiness.hasStatement ? styles.readinessDotOn : styles.readinessDotOff}`} />
                <span className={styles.readinessLabel}>Statement URL</span>
              </div>
              <div className={styles.readinessItem}>
                <span className={`${styles.readinessDot} ${readiness.hasFeedbackPath ? styles.readinessDotOn : styles.readinessDotOff}`} />
                <span className={styles.readinessLabel}>Feedback path</span>
              </div>
              <div className={styles.readinessItem}>
                <span className={`${styles.readinessDot} ${readiness.hasMonthlyRecipient ? styles.readinessDotOn : styles.readinessDotOff}`} />
                <span className={styles.readinessLabel}>Monthly report recipient</span>
              </div>
              <div className={styles.readinessItem}>
                <span className={`${styles.readinessDot} ${readiness.hasOwner ? styles.readinessDotOn : styles.readinessDotOff}`} />
                <span className={styles.readinessLabel}>Accessibility owner</span>
              </div>
              <div className={styles.readinessItem}>
                <span className={`${styles.readinessDot} ${readiness.hasSla ? styles.readinessDotOn : styles.readinessDotOff}`} />
                <span className={styles.readinessLabel}>Response SLA</span>
              </div>
            </div>
          </section>

          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.railCardTitle}>USAGE SNAPSHOT</span>
              <button type="button" className={styles.railActionBtn} onClick={refreshUsageSummary} disabled={usageLoading}>
                {usageLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {usageSummary ? (
              <>
                <div className={styles.statsRow}>
                  <span className={styles.statBig}>{usageSummary.totalEvents}</span>
                  <span className={styles.statSuffix}>events / {usageSummary.sinceDays} days</span>
                </div>
                <div className={styles.railList}>
                  {usageSummary.byEvent.slice(0, 4).map((event) => (
                    <div key={event.eventName} className={styles.railListItem}>
                      <span>{formatUsageEventLabel(event.eventName)}</span>
                      <strong>{event.count}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className={styles.railStatus}>Usage data unavailable.</p>
            )}
            {usageStatus && <p className={styles.railStatus}>{usageStatus}</p>}
          </section>

          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.railCardTitle}>MONTHLY REPORT</span>
              <button type="button" className={styles.railActionBtn} onClick={refreshLastReportState} disabled={lastReportLoading}>
                {lastReportLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <div className={styles.railRow}>
              <span>Recipient</span>
              <span className={styles.railValue}>{settings.monthlyReportEmail || "Missing"}</span>
            </div>
            <div className={styles.railRow}>
              <span>Last sent</span>
              <span className={styles.railValue}>{formatTimestamp(lastReportState?.sentAt)}</span>
            </div>
            <div className={styles.railRow}>
              <span>Status</span>
              <span className={styles.railValue}>{lastReportState ? (lastReportState.ok ? "OK" : "Issue") : "None"}</span>
            </div>
            <div className={styles.railActions}>
              <button type="button" className={styles.lawBtn} onClick={sendMonthlyTestReport} disabled={sendingMonthlyTest}>
                {sendingMonthlyTest ? "Sending..." : "Send Test"}
              </button>
            </div>
            {monthlyTestStatus && <p className={styles.railStatus}>{monthlyTestStatus}</p>}
          </section>

          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.complianceTitle}>Law Watch Status</span>
              <button type="button" className={styles.railActionBtn} onClick={refreshLawWatchStatus} disabled={lawWatchLoading}>
                {lawWatchLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <p className={styles.lawDesc}>
              Daily automated checks for accessibility law and regulation updates (ADA.gov, Federal Register, Florida statutes).
            </p>
            <div className={styles.lawStatusBox}>
              <span className={styles.lawStatusLabel}>Last check: {formatTimestamp(lawWatchState?.checkedAt)}</span>
              <span className={styles.statusGreen}>{lawWatchState?.lastRunOk ? "OK" : "Attention"}</span>
            </div>
            {lawWatchState?.sources?.length ? (
              <div className={styles.railList}>
                {lawWatchState.sources.slice(0, 3).map((source) => (
                  <div key={source.id} className={styles.railListItem}>
                    <span>{source.title}</span>
                    <strong>{source.lastStatus}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {lawWatchState?.lastChanges?.length ? (
              <div className={styles.railList}>
                {lawWatchState.lastChanges.slice(0, 2).map((change) => (
                  <div key={change.id} className={styles.railListItem}>
                    <span>{change.title}</span>
                    <strong>{formatTimestamp(change.detectedAt)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={styles.lawActionRow}>
              <button type="button" className={styles.lawBtn} onClick={runLawWatchNow} disabled={lawWatchRunning}>
                {lawWatchRunning ? "Running..." : "Run Now"}
              </button>
              <button type="button" className={styles.lawBtn} onClick={refreshLawWatchStatus} disabled={lawWatchLoading}>
                Refresh
              </button>
            </div>
            {lawWatchStatus && <p className={styles.railStatus}>{lawWatchStatus}</p>}
            {lawWatchState?.lastError && <p className={styles.railStatus}>Last error: {lawWatchState.lastError}</p>}
          </section>

          {/* API STATUS */}
          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.railCardTitle}>API STATUS</span>
              <button className={styles.railCloseBtn}>X</button>
            </div>
            <div className={styles.railRow}>
              <span>Shopify</span>
              <span className={styles.dotActive}>Active</span>
            </div>
            <div className={styles.railRow}>
              <span>Lightspeed API</span>
              <span className={styles.dotActive}>Active</span>
            </div>
            <div className={styles.railRow}>
              <span>Dropbox</span>
              <span className={styles.dotActive}>Active</span>
            </div>
          </section>

          {/* CHATGPT */}
          <section className={styles.railCard}>
            <div className={styles.chatHead}>
              <div className={styles.chatTitle}>
                <span>CA</span> ChatGPT
              </div>
              <button type="button" className={styles.chatRefresh} aria-label="Refresh chat">
                <RefreshIcon size={18} />
              </button>
            </div>
            <p className={styles.chatSub}>Ask anything.</p>
            <div className={styles.chatLog}>No chat messages.</div>
            <div className={styles.chatInputRow}>
              <span>Message ChatGPT...</span>
              <span>&gt;</span>
            </div>
            <div className={styles.chatBtns}>
              <button className={styles.chatSendBtn}>Send</button>
              <button className={styles.chatClearBtn}>Clear</button>
            </div>
          </section>

          {/* COMPLIANCE CHECKLIST */}
          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.complianceTitle}>Compliance Checklist</span>
            </div>
            <div className={styles.progressWrap}>
              <span className={styles.progressLabel}>Remediation progress</span>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{width:`${checklistCompletion.percent}%`}} />
              </div>
            </div>
            <div className={styles.statsRow}>
              <span className={styles.statBig}>
                {String(checklistCompletion.done).padStart(2,'0')} / {String(checklistCompletion.total).padStart(2,'0')}
              </span>
              <span className={styles.statSuffix}>({checklistCompletion.percent}%)</span>
            </div>
            <div className={styles.statMeta}>
              <div className={styles.statMetaRow}>
                <span className={styles.statMetaNum}>1:38s</span>
                <span className={styles.statMetaLabel}>Avg. Automation<br/>Time</span>
              </div>
              <div className={styles.statMetaRow}>
                <span className={styles.statMetaNum}>3.6%</span>
                <span className={styles.statMetaLabel}>Assist Clickthrough<br/>Rate</span>
              </div>
            </div>
            <button className={styles.logLink}>View log history</button>
          </section>

          {/* LAW WATCH RAIL */}
          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.complianceTitle}>Law Watch Status</span>
            </div>
            <p className={styles.lawDesc} style={{fontSize:'12px',marginTop:'-4px'}}>
              Daily automated checks for accessibility law/regulation source updates (ADA.gov, Federal regulations, Florida statutes).
            </p>
            <div className={styles.lawStatusBox}>
              <span className={styles.lawStatusLabel}>Current Compliance:</span>
              <span className={styles.statusGreen}>Active/OK</span>
            </div>
            <div className={styles.lawActionRow}>
              <button className={styles.lawBtn}>Send</button>
              <button className={styles.lawBtn}>Clear</button>
            </div>
          </section>

        </aside>
      </div>

      {activeModal && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {activeModal === "log-history" ? (
              <>
                <div className={styles.modalHeader}>
                  <div>
                    <h2 className={styles.modalTitle}>Log History Export</h2>
                    <p className={styles.modalCopy}>
                      Review the latest accessibility usage and compliance snapshot, then download the CSV or email the export link.
                    </p>
                  </div>
                  <button type="button" className={styles.modalCloseBtn} onClick={closeModal} aria-label="Close log history">
                    X
                  </button>
                </div>

                {logHistoryLoading ? (
                  <div className={styles.modalStateBox}>Loading log history...</div>
                ) : logHistoryData ? (
                  <>
                    <div className={styles.modalSummaryGrid}>
                      <div className={styles.modalSummaryCard}>
                        <span className={styles.modalSummaryLabel}>Generated</span>
                        <strong>{formatTimestamp(logHistoryData.generatedAt)}</strong>
                      </div>
                      <div className={styles.modalSummaryCard}>
                        <span className={styles.modalSummaryLabel}>Scope</span>
                        <strong>{logHistoryData.scope}</strong>
                      </div>
                      <div className={styles.modalSummaryCard}>
                        <span className={styles.modalSummaryLabel}>Usage</span>
                        <strong>{logHistoryData.usageSummary.totalEvents} events</strong>
                      </div>
                      <div className={styles.modalSummaryCard}>
                        <span className={styles.modalSummaryLabel}>Checklist</span>
                        <strong>
                          {logHistoryData.checklist.done}/{logHistoryData.checklist.total} ({logHistoryData.checklist.percent}%)
                        </strong>
                      </div>
                    </div>

                    <div className={styles.modalHistoryBlock}>
                      <span className={styles.modalSectionLabel}>Recent monthly history</span>
                      {logHistoryData.checklistTrendHistory.length ? (
                        <div className={styles.modalHistoryList}>
                          {logHistoryData.checklistTrendHistory
                            .slice(-6)
                            .reverse()
                            .map((entry) => (
                              <div key={`${entry.month}-${entry.sentAt}`} className={styles.modalHistoryRow}>
                                <span>{entry.month}</span>
                                <strong>
                                  {entry.completed}/{entry.total} ({entry.percent}%)
                                </strong>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className={styles.modalStateBox}>No monthly checklist history yet.</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className={styles.modalStateBox}>No log history is available yet.</div>
                )}

                <div className={styles.modalActionRow}>
                  <button type="button" className={styles.metricActionBtn} onClick={downloadLogHistoryCsv}>
                    Download CSV
                  </button>
                  <button
                    type="button"
                    className={styles.metricActionBtn}
                    onClick={emailLogHistoryLink}
                    disabled={sendingLogHistoryEmail}
                  >
                    {sendingLogHistoryEmail ? "Sending..." : "Email link"}
                  </button>
                </div>
                {logHistoryStatus && <p className={styles.modalStatus}>{logHistoryStatus}</p>}
              </>
            ) : (
              <>
                <div className={styles.modalHeader}>
                  <div>
                    <h2 className={styles.modalTitle}>Monthly Report Recipient</h2>
                    <p className={styles.modalCopy}>
                      Update the recipient used for monthly accessibility reports and download-link emails.
                    </p>
                  </div>
                  <button type="button" className={styles.modalCloseBtn} onClick={closeModal} aria-label="Close recipient editor">
                    X
                  </button>
                </div>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>Recipient email</span>
                  <input
                    type="email"
                    className={styles.fieldInput}
                    value={normalizeEmailInput(recipientDraft)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(event) => setRecipientDraft(normalizeEmailInput(event.target.value))}
                  />
                </label>
                <div className={styles.modalActionRow}>
                  <button
                    type="button"
                    className={styles.metricActionBtn}
                    onClick={saveMonthlyRecipient}
                    disabled={recipientSaving}
                  >
                    {recipientSaving ? "Saving..." : "Save"}
                  </button>
                  <button type="button" className={styles.metricActionBtn} onClick={closeModal}>
                    Close
                  </button>
                </div>
                {recipientStatus && <p className={styles.modalStatus}>{recipientStatus}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

