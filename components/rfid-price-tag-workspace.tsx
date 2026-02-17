"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogItem, LabelMapping, RfidSettings } from "@/lib/rfid";
import { DEFAULT_RFID_SETTINGS } from "@/lib/rfid";
import StudioStatusBar from "@/components/studio-status-bar";

type SessionMeResponse = {
  user?: {
    role?: string | null;
  } | null;
};

type LogsPageResponse = {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  mappings?: LabelMapping[];
  error?: string;
};

type SettingsDraft = {
  companyPrefix: string;
  companyPrefixBits: string;
  itemNumberBits: string;
  serialBits: string;
  printerIp: string;
  printerPort: string;
  labelWidthDots: string;
  labelHeightDots: string;
  labelShiftX: string;
  labelShiftY: string;
};

type PrintDraft = {
  lightspeedSystemId: string;
  qty: string;
  customSku: string;
  itemName: string;
  color: string;
  size: string;
  upc: string;
  retailPrice: string;
  countryCode: string;
  printerIp: string;
  printerPort: string;
};

type LastBatch = {
  lightspeedSystemId: string;
  itemNumber: number;
  labels: Array<{ epc: string; serialNumber: number }>;
  zpl: string;
};

type ProgressTone = "idle" | "working" | "success" | "error";
type ProgressTask = "settings" | "catalog" | "save" | "print" | "preview";
type SortDirection = "asc" | "desc";
type LogsSortField =
  | "printedAt"
  | "lightspeedSystemId"
  | "itemName"
  | "skuUpc"
  | "epc"
  | "serialNumber";
type LogsSortState = {
  field: LogsSortField;
  direction: SortDirection;
};
type BatchSortField = "epc" | "serialNumber";
type BatchSortState = {
  field: BatchSortField;
  direction: SortDirection;
};

type ProgressStage = {
  at: number;
  pct: number;
  text: string;
  sub: string;
};

const TASK_LABELS: Record<ProgressTask, string> = {
  settings: "Settings Sync",
  catalog: "Catalog Search",
  save: "Label Generation",
  print: "Label Generation + Print",
  preview: "Label Preview",
};

const TASK_STAGES: Record<ProgressTask, ProgressStage[]> = {
  settings: [
    { at: 0, pct: 12, text: "Validating settings...", sub: "Checking EPC bit layout and printer fields" },
    { at: 1, pct: 46, text: "Saving profile...", sub: "Writing RFID and layout settings" },
    { at: 2, pct: 82, text: "Applying configuration...", sub: "Refreshing page state with new defaults" },
  ],
  catalog: [
    { at: 0, pct: 10, text: "Preparing query...", sub: "Normalizing search input" },
    { at: 1, pct: 38, text: "Authorizing Lightspeed...", sub: "Refreshing access token if needed" },
    { at: 2, pct: 72, text: "Searching catalog...", sub: "Scanning SKU, UPC, EAN, and descriptions" },
    { at: 3, pct: 88, text: "Formatting results...", sub: "Deduplicating and ranking matches" },
  ],
  save: [
    { at: 0, pct: 12, text: "Validating label request...", sub: "Checking system ID, qty, and fields" },
    { at: 1, pct: 42, text: "Building EPC labels...", sub: "Deriving item number and serial range" },
    { at: 2, pct: 76, text: "Saving EPC mappings...", sub: "Storing generated mappings" },
    { at: 3, pct: 90, text: "Finalizing batch...", sub: "Preparing ZPL output and table refresh" },
  ],
  print: [
    { at: 0, pct: 10, text: "Validating print request...", sub: "Checking label payload and printer target" },
    { at: 1, pct: 38, text: "Building EPC labels...", sub: "Generating EPC and ZPL for each tag" },
    { at: 2, pct: 68, text: "Saving EPC mappings...", sub: "Persisting generated serial mapping rows" },
    { at: 3, pct: 86, text: "Sending to printer...", sub: "Pushing batch ZPL to printer socket" },
  ],
  preview: [
    { at: 0, pct: 16, text: "Validating preview fields...", sub: "Checking Lightspeed ID and layout inputs" },
    { at: 1, pct: 48, text: "Building preview ZPL...", sub: "Generating one preview label payload" },
    { at: 2, pct: 84, text: "Rendering image preview...", sub: "Requesting Labelary render output" },
  ],
};

const DEFAULT_PRINT_DRAFT: PrintDraft = {
  lightspeedSystemId: "",
  qty: "1",
  customSku: "",
  itemName: "",
  color: "",
  size: "",
  upc: "",
  retailPrice: "",
  countryCode: "",
  printerIp: "",
  printerPort: "",
};

const LOGS_PAGE_SIZE = 20;

function toSettingsDraft(settings: RfidSettings): SettingsDraft {
  return {
    companyPrefix: String(settings.companyPrefix),
    companyPrefixBits: String(settings.companyPrefixBits),
    itemNumberBits: String(settings.itemNumberBits),
    serialBits: String(settings.serialBits),
    printerIp: String(settings.printerIp || ""),
    printerPort: String(settings.printerPort),
    labelWidthDots: String(settings.labelWidthDots),
    labelHeightDots: String(settings.labelHeightDots),
    labelShiftX: String(settings.labelShiftX),
    labelShiftY: String(settings.labelShiftY),
  };
}

function parseIntLoose(value: string, fallback = 0) {
  const num = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(num) ? num : fallback;
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function toIsoIfValid(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const t = Date.parse(trimmed);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString();
}

function toCsvCell(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function inferSizeFromDescription(description: string) {
  const parts = String(description || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const tail = parts[parts.length - 1].toUpperCase();
  const commonSizes = new Set([
    "XXS",
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "XXXL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
  ]);
  if (commonSizes.has(tail)) return parts[parts.length - 1];
  if (/^\d{1,3}(\.\d+)?$/.test(tail)) return parts[parts.length - 1];
  return "";
}

function inferColorFromDescription(description: string, size: string) {
  const parts = String(description || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const upper = parts.map((part) => part.toUpperCase());
  const sizeUpper = String(size || "").toUpperCase();
  const lastIdx = parts.length - 1;
  const last = upper[lastIdx];
  const secondLast = upper[lastIdx - 1] || "";

  const multiWordColors = new Set([
    "OFF WHITE",
    "DARK BLUE",
    "LIGHT BLUE",
    "ROYAL BLUE",
    "NAVY BLUE",
    "SKY BLUE",
    "ROSE GOLD",
    "OLIVE GREEN",
    "ARMY GREEN",
    "LIGHT GREY",
    "DARK GREY",
    "HEATHER GREY",
  ]);

  if (sizeUpper && last === sizeUpper) {
    if (lastIdx >= 2) {
      const pair = `${upper[lastIdx - 2]} ${upper[lastIdx - 1]}`;
      if (multiWordColors.has(pair)) return `${parts[lastIdx - 2]} ${parts[lastIdx - 1]}`;
    }
    return parts[lastIdx - 1] || "";
  }

  if (secondLast) {
    const pair = `${secondLast} ${last}`;
    if (multiWordColors.has(pair)) return `${parts[lastIdx - 1]} ${parts[lastIdx]}`;
  }
  return parts[lastIdx] || "";
}

export default function RfidPriceTagWorkspace() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(
    toSettingsDraft(DEFAULT_RFID_SETTINGS)
  );
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsError, setSettingsError] = useState("");

  const [printDraft, setPrintDraft] = useState<PrintDraft>(DEFAULT_PRINT_DRAFT);
  const [addToInventory, setAddToInventory] = useState(false);
  const [actionBusy, setActionBusy] = useState<null | "save" | "preview" | "print">(null);
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");

  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState("");
  const [catalogError, setCatalogError] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState("");
  const [previewStatus, setPreviewStatus] = useState("");
  const [previewError, setPreviewError] = useState("");

  const [lastBatch, setLastBatch] = useState<LastBatch | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsRows, setLogsRows] = useState<LabelMapping[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsTotalRows, setLogsTotalRows] = useState(0);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logsFromInput, setLogsFromInput] = useState("");
  const [logsToInput, setLogsToInput] = useState("");
  const [logsDetailsInput, setLogsDetailsInput] = useState("");
  const [logsFrom, setLogsFrom] = useState("");
  const [logsTo, setLogsTo] = useState("");
  const [logsDetails, setLogsDetails] = useState("");
  const [selectedLogs, setSelectedLogs] = useState<Record<number, LabelMapping>>({});
  const [logsSortState, setLogsSortState] = useState<LogsSortState>({
    field: "printedAt",
    direction: "desc",
  });
  const [batchSortState, setBatchSortState] = useState<BatchSortState>({
    field: "serialNumber",
    direction: "asc",
  });

  const [progressTask, setProgressTask] = useState<ProgressTask | null>(null);
  const [progressTone, setProgressTone] = useState<ProgressTone>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [progressTitle, setProgressTitle] = useState("Ready.");
  const [progressSub, setProgressSub] = useState("Select a task to begin.");
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null);
  const [progressElapsedMs, setProgressElapsedMs] = useState(0);

  const epcBitsTotal = useMemo(() => {
    const cp = parseIntLoose(settingsDraft.companyPrefixBits, 0);
    const item = parseIntLoose(settingsDraft.itemNumberBits, 0);
    const serial = parseIntLoose(settingsDraft.serialBits, 0);
    return cp + item + serial;
  }, [settingsDraft.companyPrefixBits, settingsDraft.itemNumberBits, settingsDraft.serialBits]);
  const editLocked = isAdmin !== true;

  const refreshSettings = useCallback(async () => {
    const resp = await fetch("/api/rfid/settings", { cache: "no-store" });
    const json = (await resp.json().catch(() => ({}))) as {
      settings?: RfidSettings;
      error?: string;
    };
    if (!resp.ok) throw new Error(String(json?.error || "Failed to load RFID settings."));
    if (json.settings) {
      setSettingsDraft(toSettingsDraft(json.settings));
    }
  }, []);

  const loadLogsPage = useCallback(
    async (page = logsPage) => {
      setLogsBusy(true);
      setLogsError("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(LOGS_PAGE_SIZE));

        const fromIso = toIsoIfValid(logsFrom);
        const toIso = toIsoIfValid(logsTo);
        if (fromIso) params.set("from", fromIso);
        if (toIso) params.set("to", toIso);
        if (logsDetails.trim()) params.set("details", logsDetails.trim());

        const resp = await fetch(`/api/rfid/mappings/recent?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await resp.json().catch(() => ({}))) as LogsPageResponse;
        if (!resp.ok) throw new Error(String(json?.error || "Failed to load logs."));

        const rows = Array.isArray(json?.mappings) ? json.mappings : [];
        setLogsRows(rows);
        setLogsPage(Math.max(1, Number(json?.page || page || 1)));
        setLogsTotalPages(Math.max(1, Number(json?.totalPages || 1)));
        setLogsTotalRows(Math.max(0, Number(json?.total || 0)));
      } catch (e: any) {
        setLogsRows([]);
        setLogsTotalPages(1);
        setLogsTotalRows(0);
        setLogsError(String(e?.message || "Failed to load logs."));
      } finally {
        setLogsBusy(false);
      }
    },
    [logsDetails, logsFrom, logsPage, logsTo]
  );

  const refreshSessionRole = useCallback(async () => {
    try {
      const resp = await fetch("/api/admin/me", { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as SessionMeResponse;
      const role = String(json?.user?.role || "")
        .trim()
        .toLowerCase();
      setIsAdmin(resp.ok && role === "admin");
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([refreshSettings(), refreshSessionRole()]);
      } catch (e: any) {
        setActionError(String(e?.message || "Failed to initialize RFID workspace."));
      }
    })();
  }, [refreshSessionRole, refreshSettings]);

  useEffect(() => {
    if (!logsOpen) return;
    void loadLogsPage(logsPage);
  }, [loadLogsPage, logsOpen, logsPage]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  useEffect(() => {
    if (!progressTask || progressTone !== "working" || progressStartedAt === null) return;
    const stages = TASK_STAGES[progressTask];

    const tick = () => {
      const elapsed = Date.now() - progressStartedAt;
      setProgressElapsedMs(elapsed);
      const elapsedSeconds = Math.max(0, Math.floor(elapsed / 1000));
      let current = stages[0];
      for (const stage of stages) {
        if (elapsedSeconds >= stage.at) current = stage;
      }
      setProgressTitle(current.text);
      setProgressSub(current.sub);
      setProgressPct((prev) => {
        const target = Math.max(prev, current.pct);
        if (target >= 94) return target;
        return Math.min(94, target + 0.35);
      });
    };

    tick();
    const id = window.setInterval(tick, 180);
    return () => window.clearInterval(id);
  }, [progressStartedAt, progressTask, progressTone]);

  function startProgress(task: ProgressTask) {
    const stage = TASK_STAGES[task][0];
    setProgressTask(task);
    setProgressTone("working");
    setProgressPct(stage.pct);
    setProgressTitle(stage.text);
    setProgressSub(stage.sub);
    setProgressStartedAt(Date.now());
    setProgressElapsedMs(0);
  }

  function completeProgress(title: string, sub: string) {
    setProgressTone("success");
    setProgressPct(100);
    setProgressTitle(title);
    setProgressSub(sub);
  }

  function failProgress(message: string) {
    setProgressTone("error");
    setProgressPct(100);
    setProgressTitle("Task failed.");
    setProgressSub(message);
  }

  function setSettingField(field: keyof SettingsDraft, value: string) {
    if (isAdmin !== true) return;
    setSettingsDraft((prev) => ({ ...prev, [field]: value }));
  }

  async function saveSettings() {
    if (isAdmin !== true) {
      setSettingsStatus("");
      setSettingsError("Only admin users can edit settings.");
      return;
    }
    startProgress("settings");
    setSettingsBusy(true);
    setSettingsStatus("");
    setSettingsError("");
    try {
      const resp = await fetch("/api/rfid/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        settings?: RfidSettings;
        error?: string;
      };
      if (!resp.ok) throw new Error(String(json?.error || "Failed to save settings."));
      if (json.settings) setSettingsDraft(toSettingsDraft(json.settings));
      setSettingsStatus("Settings saved.");
      completeProgress("Settings saved.", "RFID printer profile and EPC layout were updated.");
    } catch (e: any) {
      const message = String(e?.message || "Failed to save settings.");
      setSettingsError(message);
      failProgress(message);
    } finally {
      setSettingsBusy(false);
    }
  }

  function applyCatalogItem(item: CatalogItem) {
    if (isAdmin !== true) return;
    const inferredSize = inferSizeFromDescription(item.description || "");
    const resolvedSize = item.size || inferredSize || "";
    const inferredColor = inferColorFromDescription(item.description || "", resolvedSize);
    const resolvedColor = item.color || inferredColor || "";
    setPrintDraft((prev) => ({
      ...prev,
      lightspeedSystemId: item.systemSku || item.itemId || prev.lightspeedSystemId,
      itemName: item.description || prev.itemName,
      customSku: item.customSku || prev.customSku,
      upc: item.upc || item.ean || prev.upc,
      retailPrice: item.retailPrice || prev.retailPrice,
      size: resolvedSize || prev.size,
      color: resolvedColor || prev.color,
    }));
    setCatalogStatus("Catalog item copied into print fields.");
    setCatalogError("");
  }

  async function runCatalogSearch() {
    if (isAdmin !== true) {
      setCatalogStatus("");
      setCatalogError("Only admin users can search and edit fields.");
      return;
    }
    startProgress("catalog");
    const query = catalogQuery.trim();
    if (query.length < 2) {
      setCatalogItems([]);
      setCatalogStatus("");
      const message = "Enter at least 2 characters.";
      setCatalogError(message);
      failProgress(message);
      return;
    }

    setCatalogBusy(true);
    setCatalogStatus("Searching catalog...");
    setCatalogError("");
    setCatalogItems([]);
    try {
      const resp = await fetch(
        `/api/rfid/catalog/search?q=${encodeURIComponent(query)}&limit=20`,
        { cache: "no-store" }
      );
      const json = (await resp.json().catch(() => ({}))) as {
        items?: CatalogItem[];
        error?: string;
      };
      if (!resp.ok) throw new Error(String(json?.error || "Catalog search failed."));
      const items = Array.isArray(json?.items) ? json.items : [];
      setCatalogItems(items);
      if (!items.length) {
        setCatalogStatus("");
        setCatalogError("No catalog items found.");
        completeProgress("Catalog search complete.", "No catalog items matched this query.");
      } else {
        setCatalogStatus(`Found ${items.length} item(s). Click one to autofill.`);
        completeProgress(
          `Found ${items.length} catalog item${items.length === 1 ? "" : "s"}.`,
          "Select one result to autofill the print form."
        );
      }
    } catch (e: any) {
      setCatalogStatus("");
      const message = String(e?.message || "Catalog search failed.");
      setCatalogError(message);
      failProgress(message);
    } finally {
      setCatalogBusy(false);
    }
  }

  async function submitLabelGeneration(printNow: boolean) {
    if (isAdmin !== true) {
      setActionStatus("");
      setActionError("Only admin users can generate labels.");
      return;
    }
    startProgress(printNow ? "print" : "save");
    setActionBusy(printNow ? "print" : "save");
    setActionStatus("");
    setActionError("");
    try {
      if (!printDraft.lightspeedSystemId.trim()) {
        throw new Error("Lightspeed System ID is required.");
      }
      const resp = await fetch("/api/rfid/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...printDraft,
          qty: parseIntLoose(printDraft.qty, 1),
          printNow,
          addToInventory,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        created?: number;
        itemNumber?: number;
        labels?: Array<{ epc: string; serialNumber: number }>;
        zpl?: string;
        printStatus?: { attempted: boolean; success: boolean; message: string };
        error?: string;
      };
      if (!resp.ok) throw new Error(String(json?.error || "Failed to generate labels."));

      const batch: LastBatch = {
        lightspeedSystemId: printDraft.lightspeedSystemId,
        itemNumber: Number(json.itemNumber || 0),
        labels: Array.isArray(json.labels) ? json.labels : [],
        zpl: String(json.zpl || ""),
      };
      setLastBatch(batch);
      if (printNow) {
        setActionStatus(
          String(json.printStatus?.message || `Saved ${Number(json.created || 0)} label mapping(s).`)
        );
        completeProgress(
          "Generate + print completed.",
          String(json.printStatus?.message || "Batch printed and mappings saved.")
        );
      } else {
        setActionStatus(`Saved ${Number(json.created || 0)} label mapping(s).`);
        completeProgress(
          "Label generation completed.",
          `Saved ${Number(json.created || 0)} EPC mapping(s).`
        );
      }
      if (logsOpen) {
        if (logsPage !== 1) setLogsPage(1);
        await loadLogsPage(1);
      }
    } catch (e: any) {
      const message = String(e?.message || "Failed to generate labels.");
      setActionError(message);
      failProgress(message);
    } finally {
      setActionBusy(null);
    }
  }

  async function previewLabel() {
    if (isAdmin !== true) {
      setActionStatus("");
      setActionError("Only admin users can preview labels.");
      return;
    }
    startProgress("preview");
    setActionBusy("preview");
    setPreviewOpen(true);
    setPreviewImage("");
    setPreviewStatus("Preparing preview...");
    setPreviewError("");
    try {
      if (!printDraft.lightspeedSystemId.trim()) {
        throw new Error("Lightspeed System ID is required.");
      }
      const resp = await fetch("/api/rfid/labels/preview-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...printDraft,
          qty: 1,
        }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        imageDataUrl?: string;
        error?: string;
      };
      if (!resp.ok) throw new Error(String(json?.error || "Unable to render preview."));
      setPreviewImage(String(json.imageDataUrl || ""));
      setPreviewStatus("Ready");
      completeProgress("Preview ready.", "Label preview image rendered successfully.");
    } catch (e: any) {
      setPreviewStatus("");
      const message = String(e?.message || "Unable to render preview.");
      setPreviewError(message);
      failProgress(message);
    } finally {
      setActionBusy(null);
    }
  }

  async function copyLastBatchZpl() {
    if (!lastBatch?.zpl) return;
    try {
      await navigator.clipboard.writeText(lastBatch.zpl);
      setActionStatus("Batch ZPL copied.");
      setActionError("");
    } catch {
      setActionError("Unable to copy ZPL.");
    }
  }

  function openLogsModal() {
    setLogsOpen(true);
    setLogsError("");
    setLogsPage(1);
    setSelectedLogs({});
  }

  function closeLogsModal() {
    setLogsOpen(false);
  }

  function applyLogFilters() {
    setSelectedLogs({});
    setLogsFrom(logsFromInput);
    setLogsTo(logsToInput);
    setLogsDetails(logsDetailsInput);
    setLogsPage(1);
  }

  function clearLogFilters() {
    setSelectedLogs({});
    setLogsFromInput("");
    setLogsToInput("");
    setLogsDetailsInput("");
    setLogsFrom("");
    setLogsTo("");
    setLogsDetails("");
    setLogsPage(1);
  }

  function toggleLogSelection(row: LabelMapping) {
    setSelectedLogs((prev) => {
      const next = { ...prev };
      if (next[row.id]) {
        delete next[row.id];
      } else {
        next[row.id] = row;
      }
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedLogs((prev) => {
      const next = { ...prev };
      if (checked) {
        for (const row of sortedLogsRows) next[row.id] = row;
      } else {
        for (const row of sortedLogsRows) delete next[row.id];
      }
      return next;
    });
  }

  function downloadSelectedLogs() {
    const rows = Object.values(selectedLogs).sort((a, b) => b.id - a.id);
    if (!rows.length) return;

    const headers = [
      "Printed At",
      "Lightspeed ID",
      "Item Name",
      "Custom SKU",
      "UPC",
      "EPC",
      "Serial",
      "Item Number",
      "Color",
      "Size",
      "Retail Price",
      "Country",
    ];

    const lines = [
      headers.join(","),
      ...rows.map((row) =>
        [
          toCsvCell(row.printedAt),
          toCsvCell(row.lightspeedSystemId),
          toCsvCell(row.itemName),
          toCsvCell(row.customSku),
          toCsvCell(row.upc),
          toCsvCell(row.epc),
          toCsvCell(row.serialNumber),
          toCsvCell(row.itemNumber),
          toCsvCell(row.color),
          toCsvCell(row.size),
          toCsvCell(row.retailPrice),
          toCsvCell(row.countryCode),
        ].join(",")
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rfid-logs-selected-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const selectedLogCount = useMemo(() => Object.keys(selectedLogs).length, [selectedLogs]);
  const sortedBatchLabels = useMemo(() => {
    if (!lastBatch?.labels?.length) return [];
    const next = [...lastBatch.labels];
    next.sort((a, b) => {
      if (batchSortState.field === "serialNumber") {
        return batchSortState.direction === "asc"
          ? a.serialNumber - b.serialNumber
          : b.serialNumber - a.serialNumber;
      }
      return batchSortState.direction === "asc"
        ? String(a.epc || "").localeCompare(String(b.epc || ""), undefined, {
            numeric: true,
            sensitivity: "base",
          })
        : String(b.epc || "").localeCompare(String(a.epc || ""), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    });
    return next;
  }, [batchSortState.direction, batchSortState.field, lastBatch?.labels]);

  const sortedLogsRows = useMemo(() => {
    if (!logsRows.length) return logsRows;
    const next = [...logsRows];
    next.sort((a, b) => {
      if (logsSortState.field === "printedAt") {
        const left = Date.parse(a.printedAt || "");
        const right = Date.parse(b.printedAt || "");
        const l = Number.isFinite(left) ? left : 0;
        const r = Number.isFinite(right) ? right : 0;
        return logsSortState.direction === "asc" ? l - r : r - l;
      }
      if (logsSortState.field === "serialNumber") {
        return logsSortState.direction === "asc"
          ? (a.serialNumber || 0) - (b.serialNumber || 0)
          : (b.serialNumber || 0) - (a.serialNumber || 0);
      }
      if (logsSortState.field === "skuUpc") {
        const left = `${a.customSku || ""} ${a.upc || ""}`.trim();
        const right = `${b.customSku || ""} ${b.upc || ""}`.trim();
        return logsSortState.direction === "asc"
          ? left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
          : right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" });
      }
      if (logsSortState.field === "lightspeedSystemId") {
        return logsSortState.direction === "asc"
          ? String(a.lightspeedSystemId || "").localeCompare(String(b.lightspeedSystemId || ""), undefined, {
              numeric: true,
              sensitivity: "base",
            })
          : String(b.lightspeedSystemId || "").localeCompare(String(a.lightspeedSystemId || ""), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      }
      if (logsSortState.field === "itemName") {
        return logsSortState.direction === "asc"
          ? String(a.itemName || "").localeCompare(String(b.itemName || ""), undefined, {
              numeric: true,
              sensitivity: "base",
            })
          : String(b.itemName || "").localeCompare(String(a.itemName || ""), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      }
      return logsSortState.direction === "asc"
        ? String(a.epc || "").localeCompare(String(b.epc || ""), undefined, {
            numeric: true,
            sensitivity: "base",
          })
        : String(b.epc || "").localeCompare(String(a.epc || ""), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    });
    return next;
  }, [logsRows, logsSortState.direction, logsSortState.field]);

  const allVisibleSelected = useMemo(
    () => sortedLogsRows.length > 0 && sortedLogsRows.every((row) => Boolean(selectedLogs[row.id])),
    [sortedLogsRows, selectedLogs]
  );

  function toggleLogsSort(field: LogsSortField) {
    setLogsSortState((prev) => {
      if (prev.field !== field) return { field, direction: "asc" };
      return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  }

  function toggleBatchSort(field: BatchSortField) {
    setBatchSortState((prev) => {
      if (prev.field !== field) return { field, direction: "asc" };
      return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  }

  const progressTaskLabel = progressTask ? TASK_LABELS[progressTask] : "RFID task status";
  const progressElapsedLabel = formatElapsed(progressElapsedMs);

  return (
    <main className="page">
      <StudioStatusBar
        tone={progressTone}
        message={progressTitle}
        meta={`${progressTaskLabel} | ${Math.round(progressPct)}% | ${progressSub} | ${progressElapsedLabel}`}
      />

      <fieldset className="lock-shell" disabled={editLocked}>
        <section className="glass-panel card">
        <h2>Print Labels</h2>
        <div className="catalog-search-panel">
          <label>
            <span className="control-label">Search Lightspeed Catalog</span>
            <div className="inline">
              <input
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Search by System ID, SKU, UPC, EAN, or description"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runCatalogSearch();
                  }
                }}
              />
              <button
                className="btn-base btn-outline search-btn"
                onClick={runCatalogSearch}
                disabled={catalogBusy}
              >
                {catalogBusy ? "Searching..." : "Search"}
              </button>
            </div>
          </label>
          {catalogStatus ? <p className="hint ok">{catalogStatus}</p> : null}
          {catalogError ? <p className="hint bad">{catalogError}</p> : null}
          <div className="catalog-results">
            {catalogItems.map((item) => (
              <button
                key={item.itemId || item.systemSku || item.customSku || item.upc}
                className="catalog-result"
                onClick={() => applyCatalogItem(item)}
              >
                <span className="catalog-result-title">{item.description || "(No description)"}</span>
                <span className="catalog-result-meta">
                  ID: {item.systemSku || item.itemId || "-"} | SKU: {item.customSku || "-"} | UPC/EAN:{" "}
                  {item.upc || item.ean || "-"} | Price: ${item.retailPrice || "0"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="actions">
          <label className="inventory-toggle">
            <input
              type="checkbox"
              checked={addToInventory}
              onChange={(e) => setAddToInventory(e.target.checked)}
            />
            Add to inventory
          </label>
          <button
            className="btn-base btn-primary"
            onClick={() => void previewLabel()}
            disabled={actionBusy !== null}
          >
            {actionBusy === "preview" ? "Preparing..." : "Preview Label"}
          </button>
          <button
            className="btn-base btn-primary"
            onClick={() => void submitLabelGeneration(true)}
            disabled={actionBusy !== null}
          >
            {actionBusy === "print" ? "Printing..." : "Print Tag"}
          </button>
        </div>
        <p className="hint">One EPC is generated per tag, and mappings are held in runtime memory.</p>
        {actionStatus ? <p className="status">{actionStatus}</p> : null}
        {actionError ? <p className="error">{actionError}</p> : null}
        </section>

        {lastBatch ? (
          <section className="glass-panel card">
          <h2>Last Generated Batch</h2>
          <p>
            <strong>Lightspeed System ID:</strong> {lastBatch.lightspeedSystemId}
          </p>
          <p>
            <strong>Derived Item Number:</strong> {lastBatch.itemNumber}
          </p>
          <table>
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className={`table-sort-btn ${batchSortState.field === "epc" ? "active" : ""}`}
                    onClick={() => toggleBatchSort("epc")}
                  >
                    <span>EPC</span>
                    <span className="sort-mark">
                      {batchSortState.field === "epc"
                        ? batchSortState.direction === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={`table-sort-btn ${batchSortState.field === "serialNumber" ? "active" : ""}`}
                    onClick={() => toggleBatchSort("serialNumber")}
                  >
                    <span>Serial</span>
                    <span className="sort-mark">
                      {batchSortState.field === "serialNumber"
                        ? batchSortState.direction === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedBatchLabels.map((label) => (
                <tr key={`${label.epc}-${label.serialNumber}`}>
                  <td>
                    <code>{label.epc}</code>
                  </td>
                  <td>{label.serialNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label>
            <span className="control-label">Batch ZPL</span>
            <textarea value={lastBatch.zpl} readOnly rows={12} />
          </label>
          <div className="actions">
            <button className="btn-base btn-outline" onClick={() => void copyLastBatchZpl()}>
              Copy ZPL
            </button>
          </div>
          </section>
        ) : null}

      </fieldset>

      <section className="glass-panel card">
        <h2>Logs</h2>
        <p className="hint">Open print logs, filter by time and item details, then export selected rows.</p>
        <div className="actions">
          <button className="btn-base btn-primary" onClick={openLogsModal}>
            Open Logs
          </button>
        </div>
      </section>

      <fieldset className="lock-shell" disabled={editLocked}>
        <section className="glass-panel card">
          <h2>RFID / Printer Settings</h2>
          {isAdmin === false ? (
            <p className="hint bad">Fields are locked. Only admin users can edit or run RFID actions.</p>
          ) : null}
          <div className="grid two-col">
            <label>
              <span className="control-label">Company Prefix (decimal)</span>
              <input
                value={settingsDraft.companyPrefix}
                onChange={(e) => setSettingField("companyPrefix", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Company Prefix Bits</span>
              <input
                value={settingsDraft.companyPrefixBits}
                onChange={(e) => setSettingField("companyPrefixBits", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Item Number Bits</span>
              <input
                value={settingsDraft.itemNumberBits}
                onChange={(e) => setSettingField("itemNumberBits", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Serial Bits</span>
              <input
                value={settingsDraft.serialBits}
                onChange={(e) => setSettingField("serialBits", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Default Printer IP</span>
              <input
                value={settingsDraft.printerIp}
                onChange={(e) => setSettingField("printerIp", e.target.value)}
                placeholder="192.168.1.3"
              />
            </label>
            <label>
              <span className="control-label">Default Printer Port</span>
              <input
                value={settingsDraft.printerPort}
                onChange={(e) => setSettingField("printerPort", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Label Width (dots)</span>
              <input
                value={settingsDraft.labelWidthDots}
                onChange={(e) => setSettingField("labelWidthDots", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Label Height (dots)</span>
              <input
                value={settingsDraft.labelHeightDots}
                onChange={(e) => setSettingField("labelHeightDots", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Horizontal Shift (dots)</span>
              <input
                value={settingsDraft.labelShiftX}
                onChange={(e) => setSettingField("labelShiftX", e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="control-label">Vertical Shift (dots)</span>
              <input
                value={settingsDraft.labelShiftY}
                onChange={(e) => setSettingField("labelShiftY", e.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>
          <div className="actions">
            <button className="btn-base btn-primary" onClick={saveSettings} disabled={settingsBusy}>
              {settingsBusy ? "Saving..." : "Save Settings"}
            </button>
            <p className={`hint ${epcBitsTotal === 96 ? "ok" : "bad"}`}>
              EPC bits must total 96. Current: {epcBitsTotal}
            </p>
          </div>
          {settingsStatus ? <p className="status">{settingsStatus}</p> : null}
          {settingsError ? <p className="error">{settingsError}</p> : null}
        </section>
      </fieldset>

      {logsOpen ? (
        <>
          <button aria-label="Close logs" className="preview-backdrop" onClick={closeLogsModal} />
          <section className="preview-modal logs-modal" role="dialog" aria-modal="true" aria-label="RFID Logs">
            <div className="preview-header">
              <h3>RFID Logs</h3>
              <button className="btn-base btn-outline close-btn" onClick={closeLogsModal}>
                Close
              </button>
            </div>

            <div className="grid logs-filter-grid">
              <label>
                <span className="control-label">From</span>
                <input
                  type="datetime-local"
                  value={logsFromInput}
                  onChange={(e) => setLogsFromInput(e.target.value)}
                />
              </label>
              <label>
                <span className="control-label">To</span>
                <input
                  type="datetime-local"
                  value={logsToInput}
                  onChange={(e) => setLogsToInput(e.target.value)}
                />
              </label>
              <label className="logs-detail-filter">
                <span className="control-label">Item Details</span>
                <input
                  value={logsDetailsInput}
                  onChange={(e) => setLogsDetailsInput(e.target.value)}
                  placeholder="ID, name, SKU, UPC, EPC, color, size"
                />
              </label>
            </div>

            <div className="actions">
              <button className="btn-base btn-outline" onClick={applyLogFilters} disabled={logsBusy}>
                Apply Filters
              </button>
              <button className="btn-base btn-outline" onClick={clearLogFilters} disabled={logsBusy}>
                Clear Filters
              </button>
              <button
                className="btn-base btn-primary"
                onClick={downloadSelectedLogs}
                disabled={selectedLogCount === 0}
              >
                Download Selected ({selectedLogCount})
              </button>
            </div>

            <p className="hint">Max 20 logs per page. Total matches: {logsTotalRows}.</p>
            {logsError ? <p className="error">{logsError}</p> : null}

            <div className="logs-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                        disabled={logsBusy || logsRows.length === 0}
                        aria-label="Select all visible logs"
                      />
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`table-sort-btn ${logsSortState.field === "printedAt" ? "active" : ""}`}
                        onClick={() => toggleLogsSort("printedAt")}
                      >
                        <span>Printed At</span>
                        <span className="sort-mark">
                          {logsSortState.field === "printedAt"
                            ? logsSortState.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`table-sort-btn ${logsSortState.field === "lightspeedSystemId" ? "active" : ""}`}
                        onClick={() => toggleLogsSort("lightspeedSystemId")}
                      >
                        <span>Lightspeed ID</span>
                        <span className="sort-mark">
                          {logsSortState.field === "lightspeedSystemId"
                            ? logsSortState.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`table-sort-btn table-sort-left ${logsSortState.field === "itemName" ? "active" : ""}`}
                        onClick={() => toggleLogsSort("itemName")}
                      >
                        <span>Item</span>
                        <span className="sort-mark">
                          {logsSortState.field === "itemName"
                            ? logsSortState.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`table-sort-btn ${logsSortState.field === "skuUpc" ? "active" : ""}`}
                        onClick={() => toggleLogsSort("skuUpc")}
                      >
                        <span>SKU / UPC</span>
                        <span className="sort-mark">
                          {logsSortState.field === "skuUpc"
                            ? logsSortState.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`table-sort-btn ${logsSortState.field === "epc" ? "active" : ""}`}
                        onClick={() => toggleLogsSort("epc")}
                      >
                        <span>EPC</span>
                        <span className="sort-mark">
                          {logsSortState.field === "epc"
                            ? logsSortState.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={`table-sort-btn ${logsSortState.field === "serialNumber" ? "active" : ""}`}
                        onClick={() => toggleLogsSort("serialNumber")}
                      >
                        <span>Serial</span>
                        <span className="sort-mark">
                          {logsSortState.field === "serialNumber"
                            ? logsSortState.direction === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logsBusy ? (
                    <tr>
                      <td colSpan={7}>Loading logs...</td>
                    </tr>
                  ) : sortedLogsRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No logs found for the selected filters.</td>
                    </tr>
                  ) : (
                    sortedLogsRows.map((row) => (
                      <tr key={`log-${row.id}-${row.epc}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedLogs[row.id])}
                            onChange={() => toggleLogSelection(row)}
                            aria-label={`Select log ${row.id}`}
                          />
                        </td>
                        <td>{new Date(row.printedAt).toLocaleString()}</td>
                        <td>{row.lightspeedSystemId}</td>
                        <td>{row.itemName || "-"}</td>
                        <td>
                          {row.customSku || "-"} / {row.upc || "-"}
                        </td>
                        <td>
                          <code>{row.epc}</code>
                        </td>
                        <td>{row.serialNumber}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="logs-pagination">
              <button
                className="btn-base btn-outline"
                onClick={() => setLogsPage((prev) => Math.max(1, prev - 1))}
                disabled={logsBusy || logsPage <= 1}
                aria-label="Previous logs page"
              >
                ◀
              </button>
              <span>
                Page {logsPage} / {logsTotalPages}
              </span>
              <button
                className="btn-base btn-outline"
                onClick={() => setLogsPage((prev) => Math.min(logsTotalPages, prev + 1))}
                disabled={logsBusy || logsPage >= logsTotalPages}
                aria-label="Next logs page"
              >
                ▶
              </button>
            </div>
          </section>
        </>
      ) : null}

      {previewOpen ? (
        <>
          <button
            aria-label="Close preview"
            className="preview-backdrop"
            onClick={() => setPreviewOpen(false)}
          />
          <section className="preview-modal" role="dialog" aria-modal="true" aria-label="Label Preview">
            <div className="preview-header">
              <h3>Label Preview</h3>
              <button className="btn-base btn-outline close-btn" onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
            {previewStatus ? <p className="status">{previewStatus}</p> : null}
            {previewError ? <p className="error">{previewError}</p> : null}
            <div className="preview-canvas">
              {previewImage ? <img src={previewImage} alt="Label preview" /> : null}
            </div>
          </section>
        </>
      ) : null}

      <style jsx>{`
        .page {
          max-width: 1220px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 12px;
          color: #f8fafc;
        }
        .card {
          padding: 18px;
          display: grid;
          gap: 10px;
        }
        .lock-shell {
          border: 0;
          margin: 0;
          padding: 0;
          min-inline-size: 0;
          display: grid;
          gap: 14px;
        }
        .lock-shell :is(input, textarea, select, button):disabled {
          cursor: not-allowed;
          opacity: 0.62;
        }
        h2,
        h3 {
          margin: 0;
          font-size: 1.95rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          line-height: 1.15;
        }
        .page :global(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])),
        .page :global(textarea),
        .page :global(select) {
          text-transform: none;
        }
        .page :global(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])::placeholder),
        .page :global(textarea::placeholder) {
          text-transform: none;
        }
        .grid {
          display: grid;
          gap: 10px;
        }
        .two-col {
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .three-col {
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .inventory-toggle {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.92rem;
          color: rgba(226, 232, 240, 0.9);
        }
        .inventory-toggle input {
          width: 16px;
          height: 16px;
        }
        .hint {
          margin: 0;
          color: rgba(226, 232, 240, 0.78);
          font-size: 0.9rem;
        }
        .hint.ok {
          color: #a7f3d0;
        }
        .hint.bad {
          color: #fecaca;
        }
        .status,
        .error {
          margin: 0;
          border-radius: 12px;
          padding: 8px 10px;
          border: 1px solid transparent;
          font-size: 0.92rem;
        }
        .status {
          border-color: rgba(16, 185, 129, 0.32);
          background: rgba(16, 185, 129, 0.14);
          color: #a7f3d0;
        }
        .error {
          border-color: rgba(248, 113, 113, 0.32);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
        }
        .catalog-search-panel {
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          padding: 12px;
          display: grid;
          gap: 8px;
        }
        .catalog-results {
          display: grid;
          gap: 8px;
        }
        .catalog-result {
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.07);
          color: #f8fafc;
          text-align: left;
          border-radius: 10px;
          min-height: 42px;
          padding: 10px;
          display: grid;
          gap: 4px;
          font: inherit;
          cursor: pointer;
        }
        .catalog-result:hover {
          border-color: rgba(255, 255, 255, 0.36);
          background: rgba(255, 255, 255, 0.12);
        }
        .catalog-result:disabled:hover {
          border-color: rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.07);
        }
        .catalog-result-title {
          font-weight: 700;
        }
        .catalog-result-meta {
          font-size: 0.84rem;
          color: rgba(226, 232, 240, 0.78);
        }
        .inline {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          overflow: hidden;
          border-radius: 12px;
        }
        th,
        td {
          border: 1px solid rgba(255, 255, 255, 0.18);
          padding: 8px;
          vertical-align: top;
        }
        th {
          text-align: left;
          background: rgba(255, 255, 255, 0.12);
          font-weight: 700;
        }
        .table-sort-btn {
          min-height: 0;
          border: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          font-weight: inherit;
          padding: 0;
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
        }
        .table-sort-btn.table-sort-left {
          justify-content: flex-start;
        }
        .table-sort-btn:hover,
        .table-sort-btn:focus-visible {
          transform: none !important;
          box-shadow: none !important;
          opacity: 1 !important;
          color: #fff;
          outline: none;
        }
        .table-sort-btn.active {
          color: #f8fafc;
        }
        .sort-mark {
          font-size: 0.72rem;
          line-height: 1;
          opacity: 0.9;
        }
        code {
          font-family: var(--font-geist-mono), Consolas, Menlo, Monaco, monospace;
          font-size: 0.84rem;
          word-break: break-all;
        }
        .preview-backdrop {
          position: fixed;
          inset: 0;
          border: 0;
          background: rgba(3, 8, 22, 0.7);
          z-index: 5000;
        }
        .preview-modal {
          position: fixed;
          z-index: 5001;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(840px, calc(100vw - 24px));
          max-height: calc(100vh - 28px);
          overflow: auto;
          background: rgba(5, 10, 25, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.24);
          border-radius: 18px;
          padding: 14px;
          display: grid;
          gap: 10px;
          box-shadow: 0 28px 64px rgba(2, 6, 23, 0.6);
        }
        .logs-modal {
          width: min(1140px, calc(100vw - 24px));
        }
        .logs-filter-grid {
          grid-template-columns: repeat(2, minmax(170px, 1fr));
          align-items: end;
        }
        .logs-detail-filter {
          grid-column: 1 / -1;
        }
        .logs-table-wrap {
          max-height: 50vh;
          overflow: auto;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .logs-pagination {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .logs-pagination span {
          font-size: 0.9rem;
          color: rgba(226, 232, 240, 0.9);
          min-width: 130px;
          text-align: center;
        }
        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .preview-header h3 {
          font-size: 1.35rem;
        }
        .close-btn {
          min-width: 96px;
        }
        .preview-canvas {
          min-height: 240px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: #f3f4f6;
          display: grid;
          place-items: center;
          overflow: auto;
          padding: 10px;
        }
        .preview-canvas img {
          max-width: 100%;
          height: auto;
        }
        .search-btn {
          min-width: 110px;
        }
        @media (max-width: 900px) {
          .inline {
            flex-direction: column;
            align-items: stretch;
          }
          h2,
          h3 {
            font-size: 1.5rem;
          }
          .logs-filter-grid {
            grid-template-columns: 1fr;
          }
          .logs-detail-filter {
            grid-column: auto;
          }
        }
      `}</style>
    </main>
  );
}

