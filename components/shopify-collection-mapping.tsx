"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ShopifyMenuItemsTree from "@/components/shopify-menu-items-tree";
import { normalizeMenuPath } from "@/lib/shopifyCollectionSkuParser";
import {
  KPI_NEEDS_REVIEW_UNION_FILTER,
  classifyShopifyCollectionMappingRow,
  matchesShopifyCollectionMappingQueueTab,
  summarizeShopifyCollectionMappingWorkflows,
  type ShopifyCollectionMappingQueueTab,
  type ShopifyCollectionMappingRowWorkflow,
  type ShopifyCollectionMappingStatusBadgeTone,
} from "@/lib/shopifyCollectionMappingKpi";

type MenuNode = {
  nodeKey: string;
  label: string;
  parentKey: string | null;
  depth: number;
  enabled: boolean;
  collectionId: string | null;
  linkedTargetType?: string;
  linkedTargetLabel?: string;
  linkedTargetResourceId?: string | null;
  linkedTargetUrl?: string | null;
};

type ProductRow = {
  id: string;
  parentProductId?: string;
  title: string;
  handle?: string;
  itemType?: string;
  image: string | null;
  representativeSku?: string;
  relatedSkus?: string[];
  variantsCount?: number;
  upc: string;
  normalizedCode?: string;
  checkedNodeKeys: string[];
  currentDirectCollections?: string[];
  actionStatus?: "PROCESSED" | "FAILED" | "";
  parserType?: "NEW" | "LEGACY" | "UNKNOWN";
  routeKey?: string;
  digit?: string;
  barcodeLabel?: string;
  mappingDecision?: "AUTO_MAPPED" | "SUGGESTED" | "MANUAL_REVIEW";
  reviewReason?: string;
  autoMapSucceeded?: boolean;
  autoMapFailureCode?: string;
  autoMapFailureReason?: string;
  autoMapFailureDetails?: string[];
  reviewReasons?: string[];
  autoMappedPaths?: string[];
  directCollectionsToAssign?: string[];
  suggestedPaths?: string[];
  suggestedDirectCollections?: string[];
  isReviewed?: boolean;
  draft?: {
    isReviewed?: boolean;
    selectedSuggestionPaths?: string[];
    selectedSuggestionCollections?: string[];
    manualAddedPaths?: string[];
    manualRemovedPaths?: string[];
    mappingDecision?: "AUTO_MAPPED" | "SUGGESTED" | "MANUAL_REVIEW" | null;
    collectionSyncStatus?: "REVIEW" | "REMOVAL_PENDING" | "ADD_PENDING" | "SYNCED" | null;
    finalMenuPaths?: string[];
    finalDirectCollections?: string[];
    currentMatchesFinal?: boolean | null;
    updatedAt?: string | null;
  } | null;
};

type AdvancedDecisionFilter = "AUTO_MAPPED" | "SUGGESTED" | "MANUAL_REVIEW";

type RowStagingState = {
  autoMappedPaths: string[];
  selectedSuggestionPaths: string[];
  selectedSuggestionDirectCollections: string[];
  manualAddedPaths: string[];
  manualRemovedPaths: string[];
  finalMenuPaths: string[];
  finalMenuPathSet: Set<string>;
  finalDirectCollections: string[];
  currentMatchesFinal: boolean;
  collectionSyncStatus: "REVIEW" | "REMOVAL_PENDING" | "ADD_PENDING" | "SYNCED";
  mappingDecision: "AUTO_MAPPED" | "SUGGESTED" | "MANUAL_REVIEW";
  isReviewed: boolean;
  reviewReason: string;
  suggestionOptions: Array<{
    kind: "menu" | "collection";
    value: string;
    label: string;
    disabled: boolean;
    selected: boolean;
  }>;
};

type PlannerStatus = "readyToPush" | "noChange" | "skippedReview" | "skippedMissingData" | "failedPlanning";
type QueueJobState = "queued" | "running" | "completed" | "failed" | "skipped";
type QueueJobType =
  | "pull_products"
  | "auto_map"
  | "push_suggestions"
  | "push_manual_changes"
  | "push_all_final_changes"
  | "remove_all_collections";
type PushActionKind = "push-selected" | "push-all-final" | "remove-all-collections";

type PushPlannerRow = {
  rowId: string;
  title: string;
  plannerStatus: PlannerStatus;
  skippedReason: string;
  mappingDecision: "AUTO_MAPPED" | "SUGGESTED" | "MANUAL_REVIEW";
  collectionSyncStatus: "REVIEW" | "REMOVAL_PENDING" | "ADD_PENDING" | "SYNCED";
  currentCollections: string[];
  finalCollections: string[];
  collectionsToAdd: string[];
  collectionsToRemove: string[];
  noOp: boolean;
};

type PushPlanSummary = {
  totalRows: number;
  eligibleRows: number;
  skippedRows: number;
  addRows: number;
  removalRows: number;
  totalAdditions: number;
  totalRemovals: number;
  statusCounts: Record<PlannerStatus, number>;
};

type QueueJob = {
  id: string;
  type: QueueJobType;
  state: QueueJobState;
  startedAt: number;
  finishedAt: number;
  totalRows: number;
  completedRows: number;
  failedRows: number;
  skippedRows: number;
  note: string;
};

type PushPreviewModalState = {
  open: boolean;
  actionKind: PushActionKind;
  targetIds: string[];
  summary: PushPlanSummary;
  rows: PushPlannerRow[];
};

type MappingResponse = {
  ok: boolean;
  error?: string;
  warning?: string;
  shop?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  collections?: Array<{ id: string; title?: string; handle?: string }>;
  nodes?: MenuNode[];
  rows?: ProductRow[];
  types?: string[];
  linkTargets?: MenuLinkTargets;
  menu?: { id?: string; handle?: string; title?: string };
  summary?: {
    totalProducts?: number;
  };
};

type MappingExplainModalState = {
  open: boolean;
  rowId: string;
  title: string;
  image: string;
  itemType: string;
  upc: string;
  mappingDecision: "AUTO_MAPPED" | "SUGGESTED" | "MANUAL_REVIEW";
  collectionSyncStatus: "REVIEW" | "REMOVAL_PENDING" | "ADD_PENDING" | "SYNCED";
  actionStatus: "PROCESSED" | "FAILED" | "";
  currentMenuPaths: string[];
  autoMappedPaths: string[];
  suggestedMenuPaths: string[];
  suggestedDirectCollections: string[];
  directCollections: string[];
  finalMenuPaths: string[];
  finalDirectCollections: string[];
  autoMapFailureCode: string;
  autoMapFailureReason: string;
  autoMapFailureDetails: string[];
  statusLabel: "Needs Review" | "Ready to Push" | "Push Failed" | "Synced";
  statusBadgeTone: ShopifyCollectionMappingStatusBadgeTone;
  suggestionReady: boolean;
  manualChanges: boolean;
  isReviewed: boolean;
};

async function readJsonResponse<T>(resp: Response): Promise<T> {
  const text = await resp.text();
  const trimmed = String(text || "").trim();
  if (!trimmed) return {} as T;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Some upstream responses are prefixed/suffixed with non-JSON noise; salvage the JSON body when possible.
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // Fall through to a normalized error payload.
      }
    }
    return { ok: false, error: "Received malformed JSON response. Please retry." } as T;
  }
}

type MenuLinkTargetOption = {
  id: string;
  title: string;
  handle: string;
  url: string;
};

type MenuLinkTargets = {
  collections: MenuLinkTargetOption[];
  products: MenuLinkTargetOption[];
  pages: MenuLinkTargetOption[];
  blogs: MenuLinkTargetOption[];
};

type ToggleResponse = {
  ok: boolean;
  error?: string;
  warning?: string;
  product?: {
    id: string;
    checkedNodeKeys: string[];
  };
  products?: Array<{
    id: string;
    checkedNodeKeys: string[];
  }>;
};

type SortValue = "title-asc" | "title-desc" | "upc-asc" | "upc-desc";
type HeaderSortMode =
  | "product-az"
  | "product-za"
  | "picture-with-image"
  | "picture-without-image"
  | "suggested-with"
  | "suggested-without"
  | "status-synced"
  | "status-ready"
  | "status-review";

type DropPosition = "before" | "after" | "inside";
type MenuEditorMode = "add" | "edit";
type MenuLinkType = "COLLECTION" | "PRODUCT" | "PAGE" | "BLOG";
type PendingTreeOp =
  | {
      type: "add";
      tempNodeKey: string;
      parentKey: string | null;
      label: string;
      linkType: MenuLinkType;
      linkTargetId: string | null;
      linkValue: string;
    }
  | {
      type: "edit";
      nodeKey: string;
      label: string;
      linkType: MenuLinkType;
      linkTargetId: string | null;
      linkValue: string;
    }
  | {
      type: "move";
      nodeKey: string;
      targetKey: string;
      position: DropPosition;
    }
  | {
      type: "delete";
      nodeKey: string;
    }
  | {
      type: "visibility";
      nodeKey: string;
      enabled: boolean;
    };
type UndoActionType = "add" | "edit" | "move" | "delete" | "visibility";
type UndoEntry = {
  id: string;
  actionType: UndoActionType;
  title: string;
  details: string[];
  beforeNodes: MenuNode[];
  afterNodes: MenuNode[];
  createdAt: number;
};
const TREE_PANEL_MIN_WIDTH = 339;
const TREE_PANEL_MAX_WIDTH = 1600;
const TREE_PANEL_DEFAULT_WIDTH = 339;
const TREE_PANEL_COLLAPSED_WIDTH = 66;
const WORKSPACE_DEFAULT_HEIGHT = 850;
const WORKSPACE_MIN_HEIGHT = 850;
const WORKSPACE_TOP_ANCHOR_OFFSET = 37;
const WORKSPACE_MAX_HEIGHT = 5000;
const WORKSPACE_RESIZE_HANDLE_SPACE = 0;
type MoveDropTarget = { targetKey: string; position: DropPosition } | null;
const MENU_LINK_TYPE_OPTIONS: Array<{ value: MenuLinkType; label: string }> = [
  { value: "COLLECTION", label: "Collection" },
  { value: "PRODUCT", label: "Product" },
  { value: "PAGE", label: "Page" },
  { value: "BLOG", label: "Blog" },
];
const EMPTY_LINK_TARGETS: MenuLinkTargets = {
  collections: [],
  products: [],
  pages: [],
  blogs: [],
};
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const DEBUG_INGEST_URL = "http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692";
const DEBUG_INGEST_ENABLED =
  String(process.env.NEXT_PUBLIC_COLLECTION_MAPPING_DEBUG_INGEST || "")
    .trim()
    .toLowerCase() === "true";
const UI_PREFS_STORAGE_KEY = "shopify_collection_mapping_ui_prefs_v1";
const UI_PREFS_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DRAFT_AUTOSAVE_DEBOUNCE_MS = 550;

function normalizeMenuEditorLinkType(value: string): MenuLinkType {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "COLLECTION") return "COLLECTION";
  if (normalized === "PRODUCT") return "PRODUCT";
  if (normalized === "PAGE") return "PAGE";
  if (normalized === "BLOG") return "BLOG";
  return "COLLECTION";
}

function normalizeShopDomain(value: string) {
  return String(value || "").trim().toLowerCase();
}

function isValidShopDomain(value: string) {
  return SHOP_DOMAIN_RE.test(value);
}

function formatListPreview(values: string[] | undefined, fallback = "-") {
  const items = Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (items.length < 1) return fallback;
  if (items.length <= 2) return items.join(", ");
  return `${items.slice(0, 2).join(", ")} +${items.length - 2}`;
}

const UI_STATUS_LABELS: Record<string, string> = {
  MANUAL_REVIEW: "Needs Review",
  AUTO_MAPPED: "Mapped",
  SUGGESTED: "Suggestions",
  ADD_PENDING: "Ready to Push",
  REMOVAL_PENDING: "Ready to Push",
  SYNCED: "Synced",
  FAILED: "Push Failed",
  REVIEW: "Needs Review",
};

function getUiStatusLabel(status: string) {
  const key = String(status || "").trim().toUpperCase();
  return UI_STATUS_LABELS[key] || status;
}

function getLastPathSegment(path: string) {
  const normalized = normalizeMenuPath(path);
  if (!normalized) return "";
  if (normalized.startsWith("COLLECTION:")) return normalized.replace(/^COLLECTION:\s*/i, "").trim();
  const parts = normalized.split(">").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function getExpectedTopGenderFromUpc(upc: string): "MEN" | "WOMEN" | "" {
  const first = String(upc || "").trim().charAt(0);
  if (first === "1") return "MEN";
  if (first === "2") return "WOMEN";
  return "";
}

function getTopGenderFromPaths(paths: string[]): "MEN" | "WOMEN" | "" {
  let hasMen = false;
  let hasWomen = false;
  for (const rawPath of paths) {
    const normalized = normalizeMenuPath(rawPath);
    if (!normalized) continue;
    const first = String(normalized.split(">")[0] || "").trim().toUpperCase();
    if (first === "MEN") hasMen = true;
    if (first === "WOMEN") hasWomen = true;
  }
  if (hasMen && !hasWomen) return "MEN";
  if (hasWomen && !hasMen) return "WOMEN";
  return "";
}

function isPathUnderTopGender(path: string, topGender: "MEN" | "WOMEN") {
  const normalized = normalizeMenuPath(path);
  if (!normalized) return false;
  const first = String(normalized.split(">")[0] || "").trim().toUpperCase();
  return first === topGender;
}

function formatCompactPathSummary(paths: string[]) {
  const normalized = dedupeNormalizedPaths(paths || []);
  if (normalized.length < 1) return "-";
  const leaves = normalized.filter((path) => !normalized.some((other) => other !== path && other.startsWith(`${path} > `)));
  const roots = new Set(leaves.map((path) => path.split(">").map((part) => part.trim()).filter(Boolean)[0] || ""));
  if (roots.size === 1) {
    const root = Array.from(roots)[0];
    const formattedBranches = leaves
      .map((path) => path.split(">").map((part) => part.trim()).filter(Boolean).slice(1))
      .map((parts, index, allBranches) => {
        if (parts.length < 1) return "";
        if (index < 1) return parts.join(" > ");
        const prev = allBranches[index - 1] || [];
        let sharedCount = 0;
        while (
          sharedCount < parts.length - 1 &&
          sharedCount < prev.length &&
          parts[sharedCount] === prev[sharedCount]
        ) {
          sharedCount += 1;
        }
        return parts.slice(sharedCount).join(" > ") || parts[parts.length - 1] || "";
      })
      .filter(Boolean);
    return `${root} > ${formattedBranches.join(", ")}`;
  }
  return leaves.join(", ");
}

function getSuggestionTooltip(kind: "menu" | "collection", label: string) {
  return kind === "collection" ? "COLLECTION" : label;
}

function dedupeNormalizedPaths(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const normalized = normalizeMenuPath(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function dedupeCollectionHandles(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const normalized = String(raw || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function mapToSelectedRecord(values: string[] | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const value of values || []) {
    const key = String(value || "").trim();
    if (!key) continue;
    out[key] = true;
  }
  return out;
}

function selectedRecordToList(record: Record<string, boolean> | undefined): string[] {
  return Object.entries(record || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => String(key || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export default function ShopifyCollectionMapping() {
  const pathname = usePathname();
  const isStandaloneCollectionMappingRoute = pathname === "/shopify-collection-mapping";
  const [shop, setShop] = useState("");
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [lastSyncedNodes, setLastSyncedNodes] = useState<MenuNode[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [activeRowId, setActiveRowId] = useState("");
  const [selectedSuggestionPathsByRow, setSelectedSuggestionPathsByRow] = useState<Record<string, Record<string, boolean>>>({});
  const [selectedSuggestionCollectionsByRow, setSelectedSuggestionCollectionsByRow] = useState<Record<string, Record<string, boolean>>>({});
  const [manualAddedPathsByRow, setManualAddedPathsByRow] = useState<Record<string, Record<string, boolean>>>({});
  const [manualRemovedPathsByRow, setManualRemovedPathsByRow] = useState<Record<string, Record<string, boolean>>>({});
  const [reviewedByRow, setReviewedByRow] = useState<Record<string, boolean>>({});
  const [selectedNodes, setSelectedNodes] = useState<Record<string, boolean>>({});
  const [selectedUnmappedCollectionIds, setSelectedUnmappedCollectionIds] = useState<Record<string, boolean>>({});
  const [dismissedUnmappedCollectionIds, setDismissedUnmappedCollectionIds] = useState<Record<string, boolean>>({});
  const [unmappedCollectionOrder, setUnmappedCollectionOrder] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [treeSearch, setTreeSearch] = useState("");
  const [search, setSearch] = useState("");
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [appliedFilterTypes, setAppliedFilterTypes] = useState<string[]>([]);
  const [appliedFilterDecisions, setAppliedFilterDecisions] = useState<AdvancedDecisionFilter[]>([]);
  const [appliedFilterHasSuggestions, setAppliedFilterHasSuggestions] = useState(false);
  const [appliedFilterIncludeSynced, setAppliedFilterIncludeSynced] = useState(false);
  const [draftFilterTypes, setDraftFilterTypes] = useState<string[]>([]);
  const [draftTypeDropdownOpen, setDraftTypeDropdownOpen] = useState(false);
  const [draftFilterDecisions, setDraftFilterDecisions] = useState<AdvancedDecisionFilter[]>([]);
  const [draftFilterHasSuggestions, setDraftFilterHasSuggestions] = useState(false);
  const [draftFilterIncludeSynced, setDraftFilterIncludeSynced] = useState(false);
  const [showCommitMenu, setShowCommitMenu] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  // Default to full loaded product view on first load.
  const [activeQueueTab, setActiveQueueTab] = useState<ShopifyCollectionMappingQueueTab>("all");
  // Reports are consolidated behind a single modal trigger to reduce canvas clutter.
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [mappingExplainModal, setMappingExplainModal] = useState<MappingExplainModalState | null>(null);
  const [pushPreviewModal, setPushPreviewModal] = useState<PushPreviewModalState | null>(null);
  const [removeAllConfirmText, setRemoveAllConfirmText] = useState("");
  const [sort, setSort] = useState<SortValue>("title-asc");
  const [headerSortMode, setHeaderSortMode] = useState<HeaderSortMode>("product-az");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [collectionCount, setCollectionCount] = useState(0);
  const [collections, setCollections] = useState<Array<{ id: string; title: string; handle: string }>>([]);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showAuditReport, setShowAuditReport] = useState(false);
  const [auditOpening, setAuditOpening] = useState(false);
  const [auditGeneratedAt, setAuditGeneratedAt] = useState("");
  const [menuMeta, setMenuMeta] = useState<{ title: string; handle: string }>({
    title: "Main menu",
    handle: "main-menu",
  });
  const [showMenuEditor, setShowMenuEditor] = useState(false);
  const [menuEditorMode, setMenuEditorMode] = useState<MenuEditorMode>("add");
  const [menuEditorLabel, setMenuEditorLabel] = useState("");
  const [menuEditorLinkType, setMenuEditorLinkType] = useState<MenuLinkType>("COLLECTION");
  const [menuEditorLinkTargetId, setMenuEditorLinkTargetId] = useState("");
  const [menuEditorLinkQuery, setMenuEditorLinkQuery] = useState("");
  const [menuEditorComboboxOpen, setMenuEditorComboboxOpen] = useState(false);
  const [menuEditorAssetsLoading, setMenuEditorAssetsLoading] = useState(false);
  const [menuEditorParentKey, setMenuEditorParentKey] = useState<string | null>(null);
  const [menuEditorNodeKey, setMenuEditorNodeKey] = useState("");
  const [menuLinkTargets, setMenuLinkTargets] = useState<MenuLinkTargets>(EMPTY_LINK_TARGETS);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [pendingTreeOps, setPendingTreeOps] = useState<PendingTreeOp[]>([]);
  const [undoHistory, setUndoHistory] = useState<UndoEntry[]>([]);
  const [undoMenuOpen, setUndoMenuOpen] = useState(false);
  const [undoPreviewEntryId, setUndoPreviewEntryId] = useState("");
  const [undoSelectedEntryIds, setUndoSelectedEntryIds] = useState<string[]>([]);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const [undoResult, setUndoResult] = useState<{ ok: boolean; title: string; details: string[] } | null>(null);
  const [treePanelWidth, setTreePanelWidth] = useState(TREE_PANEL_DEFAULT_WIDTH);
  const [treePanelMinWidth, setTreePanelMinWidth] = useState(TREE_PANEL_MIN_WIDTH);
  const [treePaneCollapsed, setTreePaneCollapsed] = useState(false);
  const [pageDockRightInset, setPageDockRightInset] = useState(0);
  const [tableDockInsets, setTableDockInsets] = useState({ left: 0, right: 0, startOffset: 0, tableWrapTop: 0 });
  const [resizingPanes, setResizingPanes] = useState(false);
  const [resizingWorkspaceHeight, setResizingWorkspaceHeight] = useState(false);
  const [workspaceHeight, setWorkspaceHeight] = useState<number | null>(null);
  const [workspaceBaseHeight, setWorkspaceBaseHeight] = useState<number | null>(null);
  const [noticeHidden, setNoticeHidden] = useState(false);
  const [progressLingerUntil, setProgressLingerUntil] = useState(0);
  const paneResizeStart = useRef<{ x: number; width: number; minWidth: number; pointerId: number | null } | null>(null);
  const paneResizePointerClientX = useRef(0);
  const workspaceResizeStart = useRef<{
    clientY: number;
    height: number;
    scrollTop: number;
    pointerId: number | null;
  } | null>(null);
  const workspaceResizePointerClientY = useRef(0);
  const workspaceResizeCurrentRef = useRef<number | null>(null);
  const wasProgressBusyRef = useRef(false);
  const workspaceUserResizedRef = useRef(false);
  const treePaneUserResizedRef = useRef(false);
  const pageScrollRef = useRef<HTMLElement | null>(null);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const treePanelAutoWidthRef = useRef<HTMLDivElement | null>(null);
  const tempNodeCounterRef = useRef(0);
  const undoCounterRef = useRef(0);
  const commitMenuRef = useRef<HTMLDivElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const tableScrollDockWrapRef = useRef<HTMLDivElement | null>(null);
  const tableScrollDockRef = useRef<HTMLDivElement | null>(null);
  const tableScrollSpacerRef = useRef<HTMLDivElement | null>(null);
  const syncingTableScrollRef = useRef<"table" | "dock" | null>(null);
  const tableScrollDockVertThumbRef = useRef<HTMLDivElement | null>(null);
  const horizontalSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const horizontalDragActiveRef = useRef(false);
  const horizontalSnapInFlightRef = useRef(false);
  const ENABLE_HORIZONTAL_COLUMN_SNAP = false;
  const menuEditorComboboxRef = useRef<HTMLDivElement | null>(null);
  const loadDataAbortRef = useRef<AbortController | null>(null);
  const loadDataReqIdRef = useRef(0);
  const draftHydrationDoneRef = useRef(false);
  const syncedDraftClearInFlightRef = useRef(false);
  const lastDraftSavePayloadRef = useRef("");
  const syncedDraftClearedRowIdsRef = useRef<Set<string>>(new Set());

  const activeShop = useMemo(() => {
    const normalized = normalizeShopDomain(shop);
    return isValidShopDomain(normalized) ? normalized : "";
  }, [shop]);

  const isBusy = loading || saving || auditOpening;

  useEffect(() => {
    if (isBusy) {
      wasProgressBusyRef.current = true;
      setProgressLingerUntil(0);
      return;
    }
    if (!wasProgressBusyRef.current) return;
    wasProgressBusyRef.current = false;
    setProgressLingerUntil(Date.now() + 5000);
  }, [isBusy]);

  useEffect(() => {
    if (progressLingerUntil <= 0) return;
    const remaining = progressLingerUntil - Date.now();
    if (remaining <= 0) {
      setProgressLingerUntil(0);
      return;
    }
    const timer = window.setTimeout(() => setProgressLingerUntil(0), remaining + 20);
    return () => window.clearTimeout(timer);
  }, [progressLingerUntil]);

  const noticeState = useMemo(() => {
    if (error) return { tone: "error" as const, message: error };
    if (warning) return { tone: "warning" as const, message: warning };
    if (loading) return { tone: "progress" as const, message: "Loading..." };
    if (saving) return { tone: "progress" as const, message: "Saving changes..." };
    if (auditOpening) return { tone: "progress" as const, message: "Refreshing audit report..." };
    if (progressLingerUntil > Date.now()) return { tone: "progress" as const, message: "Loaded successfully." };
    return null;
  }, [error, warning, loading, saving, auditOpening, progressLingerUntil]);

  useEffect(() => {
    if (noticeState) setNoticeHidden(false);
  }, [noticeState?.tone, noticeState?.message]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        expiresAt?: number;
        savedAt?: number;
        activeQueueTab?: ShopifyCollectionMappingQueueTab;
        search?: string;
        sort?: SortValue;
        pageSize?: number;
        appliedFilterTypes?: string[];
        appliedFilterDecisions?: AdvancedDecisionFilter[];
        appliedFilterHasSuggestions?: boolean;
        appliedFilterIncludeSynced?: boolean;
      };
      const expiresAt = Number(parsed?.expiresAt || 0);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        window.localStorage.removeItem(UI_PREFS_STORAGE_KEY);
        return;
      }
      const allowedTabs: ShopifyCollectionMappingQueueTab[] = ["all", "needs-review", "ready-push", "push-failed", "synced"];
      const allowedSorts: SortValue[] = ["title-asc", "title-desc", "upc-asc", "upc-desc"];
      if (typeof parsed.search === "string") setSearch(parsed.search);
      if (allowedTabs.includes(parsed.activeQueueTab as ShopifyCollectionMappingQueueTab)) {
        setActiveQueueTab(parsed.activeQueueTab as ShopifyCollectionMappingQueueTab);
      }
      if (allowedSorts.includes(parsed.sort as SortValue)) {
        setSort(parsed.sort as SortValue);
      }
      if (Number.isFinite(Number(parsed.pageSize)) && Number(parsed.pageSize) > 0) {
        setPageSize(Math.min(500, Number(parsed.pageSize)));
      }
      if (Array.isArray(parsed.appliedFilterTypes)) setAppliedFilterTypes(parsed.appliedFilterTypes.map((v) => String(v || "")));
      if (Array.isArray(parsed.appliedFilterDecisions)) {
        setAppliedFilterDecisions(
          parsed.appliedFilterDecisions.filter((value): value is AdvancedDecisionFilter =>
            value === "AUTO_MAPPED" || value === "SUGGESTED" || value === "MANUAL_REVIEW"
          )
        );
      }
      if (typeof parsed.appliedFilterHasSuggestions === "boolean") {
        setAppliedFilterHasSuggestions(parsed.appliedFilterHasSuggestions);
      }
      if (typeof parsed.appliedFilterIncludeSynced === "boolean") {
        setAppliedFilterIncludeSynced(parsed.appliedFilterIncludeSynced);
      }
    } catch {
      // ignore malformed local prefs
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload = {
        savedAt: Date.now(),
        expiresAt: Date.now() + UI_PREFS_TTL_MS,
        activeQueueTab,
        search,
        sort,
        pageSize,
        appliedFilterTypes,
        appliedFilterDecisions,
        appliedFilterHasSuggestions,
        appliedFilterIncludeSynced,
      };
      window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage failures
    }
  }, [
    activeQueueTab,
    search,
    sort,
    pageSize,
    appliedFilterTypes,
    appliedFilterDecisions,
    appliedFilterHasSuggestions,
    appliedFilterIncludeSynced,
  ]);

  function withShopContext(input: Record<string, unknown>) {
    if (!activeShop) return input;
    return { ...input, shop: activeShop };
  }

  function debugIngest(payload: Record<string, unknown>) {
    if (!DEBUG_INGEST_ENABLED) return;
    fetch(DEBUG_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  function nextTempNodeKey() {
    tempNodeCounterRef.current += 1;
    return `temp-node-${Date.now()}-${tempNodeCounterRef.current}`;
  }

  function cloneNodes(rows: MenuNode[]) {
    return rows.map((row) => ({ ...row }));
  }

  function nextUndoId() {
    undoCounterRef.current += 1;
    return `undo-${Date.now()}-${undoCounterRef.current}`;
  }

  function appendUndoEntry(entry: Omit<UndoEntry, "id" | "createdAt">) {
    const next: UndoEntry = {
      ...entry,
      id: nextUndoId(),
      createdAt: Date.now(),
    };
    setUndoHistory((prev) => [next, ...prev].slice(0, 5));
  }



  function markTreeDirty() {
    setWarning("Tree has unsaved changes. Click Save to sync to Shopify.");
  }

  function getLinkOption(linkType: MenuLinkType, targetId: string | null) {
    const id = String(targetId || "").trim();
    if (!id) return null;
    const options =
      linkType === "COLLECTION"
        ? menuLinkTargets.collections
        : linkType === "PRODUCT"
          ? menuLinkTargets.products
          : linkType === "PAGE"
            ? menuLinkTargets.pages
            : menuLinkTargets.blogs;
    return options.find((option) => option.id === id) || null;
  }

  function removeLocalNodeAndChildren(rows: MenuNode[], nodeKey: string) {
    const toRemove = new Set<string>();
    const visit = (key: string) => {
      toRemove.add(key);
      for (const row of rows) {
        if (row.parentKey === key && !toRemove.has(row.nodeKey)) visit(row.nodeKey);
      }
    };
    visit(nodeKey);
    return rows.filter((row) => !toRemove.has(row.nodeKey));
  }

  function moveLocalNode(rows: MenuNode[], nodeKey: string, targetKey: string, position: DropPosition) {
    const nodeMap = new Map(rows.map((row) => [row.nodeKey, { ...row }]));
    const source = nodeMap.get(nodeKey);
    const target = nodeMap.get(targetKey);
    if (!source || !target || nodeKey === targetKey) return rows;

    const childMap = new Map<string | null, string[]>();
    for (const row of rows) {
      const parent = row.parentKey || null;
      const siblings = childMap.get(parent) || [];
      siblings.push(row.nodeKey);
      childMap.set(parent, siblings);
    }

    const subtree = new Set<string>();
    const walkSubtree = (key: string) => {
      subtree.add(key);
      for (const child of childMap.get(key) || []) walkSubtree(child);
    };
    walkSubtree(nodeKey);
    if (subtree.has(targetKey)) return rows;

    const sourceParent = source.parentKey || null;
    const sourceSiblings = (childMap.get(sourceParent) || []).filter((key) => key !== nodeKey);
    childMap.set(sourceParent, sourceSiblings);

    let nextParent: string | null = null;
    if (position === "inside") {
      nextParent = targetKey;
      const targetChildren = childMap.get(nextParent) || [];
      targetChildren.push(nodeKey);
      childMap.set(nextParent, targetChildren);
    } else {
      nextParent = target.parentKey || null;
      const siblings = childMap.get(nextParent) || [];
      const targetIndex = siblings.indexOf(targetKey);
      if (targetIndex < 0) return rows;
      const insertAt = position === "before" ? targetIndex : targetIndex + 1;
      siblings.splice(insertAt, 0, nodeKey);
      childMap.set(nextParent, siblings);
    }
    source.parentKey = nextParent;

    const ordered: MenuNode[] = [];
    const walkOrdered = (parent: string | null, depth: number) => {
      for (const key of childMap.get(parent) || []) {
        const row = nodeMap.get(key);
        if (!row) continue;
        row.depth = depth;
        ordered.push(row);
        walkOrdered(key, depth + 1);
      }
    };
    walkOrdered(null, 0);
    return ordered;
  }

  const nodeLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.nodeKey, node.label);
    }
    return map;
  }, [nodes]);

  const nodeByKey = useMemo(() => {
    return new Map(nodes.map((node) => [node.nodeKey, node]));
  }, [nodes]);

  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const node of nodes) {
      map.set(node.nodeKey, node.parentKey || null);
    }
    return map;
  }, [nodes]);

  const nodePathByKey = useMemo(() => {
    const map = new Map<string, string>();
    const buildPath = (nodeKey: string): string => {
      const cached = map.get(nodeKey);
      if (cached) return cached;
      const node = nodeByKey.get(nodeKey);
      if (!node) return "";
      const parentKey = node.parentKey || null;
      const self = normalizeMenuPath(node.label);
      if (!parentKey) {
        map.set(nodeKey, self);
        return self;
      }
      const parentPath = buildPath(parentKey);
      const full = normalizeMenuPath(parentPath ? `${parentPath} > ${self}` : self);
      map.set(nodeKey, full);
      return full;
    };
    for (const node of nodes) {
      buildPath(node.nodeKey);
    }
    return map;
  }, [nodes, nodeByKey]);

  const collectionTitleByHandle = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of collections) {
      const handle = String(row.handle || "").trim().toLowerCase();
      const title = String(row.title || "").trim();
      if (!handle || !title) continue;
      map.set(handle, title);
    }
    return map;
  }, [collections]);

  const getCollectionDisplayName = (handle: string) => {
    const key = String(handle || "").trim().toLowerCase();
    if (!key) return "";
    return collectionTitleByHandle.get(key) || key;
  };

  const nodeKeyByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const [nodeKey, path] of nodePathByKey.entries()) {
      const normalized = normalizeMenuPath(path);
      if (!normalized || map.has(normalized)) continue;
      map.set(normalized, nodeKey);
    }
    return map;
  }, [nodePathByKey]);

  const closeMenuPathSetWithAncestors = (paths: Set<string>) => {
    const closed = new Set<string>(paths);
    for (const path of Array.from(paths)) {
      const nodeKey = nodeKeyByPath.get(normalizeMenuPath(path));
      if (!nodeKey) continue;
      let current = parentMap.get(nodeKey) || null;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        const parentPath = normalizeMenuPath(nodePathByKey.get(current) || "");
        if (parentPath) closed.add(parentPath);
        seen.add(current);
        current = parentMap.get(current) || null;
      }
    }
    return closed;
  };

  const rowStagingById = useMemo(() => {
    const out = new Map<string, RowStagingState>();
    for (const row of rows) {
      const selectedSuggestionMap = selectedSuggestionPathsByRow[row.id] || {};
      const selectedSuggestionCollectionsMap = selectedSuggestionCollectionsByRow[row.id] || {};
      const manualAddedMap = manualAddedPathsByRow[row.id] || {};
      const manualRemovedMap = manualRemovedPathsByRow[row.id] || {};
      const currentAssigned = dedupeNormalizedPaths((row.checkedNodeKeys || []).map((key) => nodePathByKey.get(key) || key));
      const autoMappedPaths = dedupeNormalizedPaths(row.autoMappedPaths || []);
      const selectedSuggestionPaths = dedupeNormalizedPaths(
        Object.keys(selectedSuggestionMap).filter((path) => selectedSuggestionMap[path])
      );
      const selectedSuggestionDirectCollections = dedupeCollectionHandles(
        Object.keys(selectedSuggestionCollectionsMap).filter((handle) => selectedSuggestionCollectionsMap[handle])
      );
      const manualAddedPaths = dedupeNormalizedPaths(
        Object.keys(manualAddedMap).filter((path) => manualAddedMap[path])
      );
      const manualRemovedPaths = dedupeNormalizedPaths(
        Object.keys(manualRemovedMap).filter((path) => manualRemovedMap[path])
      );

      const currentSet = new Set(currentAssigned);
      const autoSet = new Set(autoMappedPaths);
      const currentDirectCollectionSet = new Set(dedupeCollectionHandles(row.directCollectionsToAssign || []));
      const manualAddedSet = new Set(manualAddedPaths);
      const suggestionPathBase = dedupeNormalizedPaths(row.suggestedPaths || []);
      const suggestionPathOptions = suggestionPathBase.map((path) => {
        const disabled = currentSet.has(path) || autoSet.has(path) || manualAddedSet.has(path);
        const selected = selectedSuggestionPaths.includes(path) && !disabled;
        return { kind: "menu" as const, value: path, label: path, disabled, selected };
      });
      const suggestionCollectionBase = dedupeCollectionHandles(row.suggestedDirectCollections || []);
      const suggestionCollectionOptions = suggestionCollectionBase.map((handle) => {
        const disabled = currentDirectCollectionSet.has(handle);
        const selected = selectedSuggestionDirectCollections.includes(handle) && !disabled;
        return {
          kind: "collection" as const,
          value: handle,
          label: `COLLECTION: ${handle}`,
          disabled,
          selected,
        };
      });
      const suggestionOptions = [...suggestionPathOptions, ...suggestionCollectionOptions];
      const effectiveSelectedSuggestions = suggestionPathOptions.filter((entry) => entry.selected).map((entry) => entry.value);
      const effectiveSelectedSuggestionCollections = suggestionCollectionOptions
        .filter((entry) => entry.selected)
        .map((entry) => entry.value);

      const finalSet = new Set<string>(currentAssigned);
      for (const path of autoMappedPaths) finalSet.add(path);
      for (const path of effectiveSelectedSuggestions) finalSet.add(path);
      for (const path of manualAddedPaths) finalSet.add(path);
      for (const path of manualRemovedPaths) finalSet.delete(path);
      const closedFinalSet = closeMenuPathSetWithAncestors(finalSet);
      const addedAncestorCount = Math.max(0, closedFinalSet.size - finalSet.size);
      const finalMenuPaths = Array.from(closedFinalSet);
      const currentDirectCollections = dedupeCollectionHandles(row.currentDirectCollections || []);
      const finalDirectCollections = dedupeCollectionHandles([
        ...currentDirectCollections,
        ...(row.directCollectionsToAssign || []),
        ...effectiveSelectedSuggestionCollections,
      ]);

      const hasReview = String(row.mappingDecision || "") === "MANUAL_REVIEW";
      const finalRefs = new Set([
        ...Array.from(closedFinalSet).map((path) => `PATH:${path}`),
        ...finalDirectCollections.map((handle) => `DIRECT:${handle}`),
      ]);
      const liveRefs = new Set([
        ...currentAssigned.map((path) => `PATH:${path}`),
        ...currentDirectCollections.map((handle) => `DIRECT:${handle}`),
      ]);
      let hasAdds = false;
      let hasRemovals = false;
      for (const ref of finalRefs) {
        if (!liveRefs.has(ref)) {
          hasAdds = true;
          break;
        }
      }
      for (const ref of liveRefs) {
        if (!finalRefs.has(ref)) {
          hasRemovals = true;
          break;
        }
      }
      const currentMatchesFinal = !hasAdds && !hasRemovals;
      let collectionSyncStatus: RowStagingState["collectionSyncStatus"] = "SYNCED";
      if (hasReview) {
        collectionSyncStatus = "REVIEW";
      } else if (hasAdds && hasRemovals) {
        collectionSyncStatus = "REMOVAL_PENDING";
      } else if (hasRemovals) {
        collectionSyncStatus = "REMOVAL_PENDING";
      } else if (hasAdds) {
        collectionSyncStatus = "ADD_PENDING";
      }

      let mappingDecision: RowStagingState["mappingDecision"] = row.mappingDecision || "MANUAL_REVIEW";
      if (!hasReview && effectiveSelectedSuggestions.length > 0) {
        mappingDecision = "SUGGESTED";
      }
      if (!hasReview && mappingDecision === "MANUAL_REVIEW" && (autoMappedPaths.length > 0 || finalDirectCollections.length > 0)) {
        mappingDecision = "AUTO_MAPPED";
      }

      const reasons: string[] = [];
      const isReviewed = Boolean(reviewedByRow[row.id] ?? row.isReviewed);
      if (row.reviewReason) reasons.push(row.reviewReason);
      const selectedSuggestionCount = effectiveSelectedSuggestions.length + effectiveSelectedSuggestionCollections.length;
      if (selectedSuggestionCount > 0) reasons.push(`Selected ${selectedSuggestionCount} suggestion(s).`);
      if (manualAddedPaths.length > 0) reasons.push(`Manually added ${manualAddedPaths.length} path(s).`);
      if (manualRemovedPaths.length > 0) reasons.push(`Manually removed ${manualRemovedPaths.length} path(s).`);
      if (addedAncestorCount > 0) reasons.push(`Ancestor closure applied (+${addedAncestorCount} parent/root path(s)).`);
      const reviewReason = reasons.filter(Boolean).join(" ");

      out.set(row.id, {
        autoMappedPaths,
        selectedSuggestionPaths: effectiveSelectedSuggestions,
        selectedSuggestionDirectCollections: effectiveSelectedSuggestionCollections,
        manualAddedPaths,
        manualRemovedPaths,
        finalMenuPaths,
        finalMenuPathSet: closedFinalSet,
        finalDirectCollections,
        currentMatchesFinal,
        collectionSyncStatus,
        mappingDecision,
        isReviewed,
        reviewReason,
        suggestionOptions,
      });
    }
    return out;
  }, [
    rows,
    nodePathByKey,
    selectedSuggestionPathsByRow,
    selectedSuggestionCollectionsByRow,
    manualAddedPathsByRow,
    manualRemovedPathsByRow,
    reviewedByRow,
    nodeKeyByPath,
    nodePathByKey,
    parentMap,
  ]);

  const selectedNodeKeys = useMemo(() => {
    return Object.keys(selectedNodes).filter((key) => Boolean(selectedNodes[key]));
  }, [selectedNodes]);

  const selectedNodeKeysWithParents = useMemo(() => {
    const out = new Set<string>(selectedNodeKeys);
    for (const key of selectedNodeKeys) {
      let current = parentMap.get(key) || null;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        out.add(current);
        seen.add(current);
        current = parentMap.get(current) || null;
      }
    }
    return Array.from(out);
  }, [selectedNodeKeys, parentMap]);

  const mappedSelectedNodeKeys = useMemo(() => {
    return selectedNodeKeysWithParents.filter((key) => Boolean(nodeByKey.get(key)?.collectionId));
  }, [nodeByKey, selectedNodeKeysWithParents]);

  const selectedDirectCollectionIds = useMemo(() => {
    return Object.keys(selectedUnmappedCollectionIds).filter((id) => Boolean(selectedUnmappedCollectionIds[id]));
  }, [selectedUnmappedCollectionIds]);

  const hasSelectedAssignTargets = mappedSelectedNodeKeys.length > 0 || selectedDirectCollectionIds.length > 0;
  const selectedProductCount = Object.values(selectedProducts).filter(Boolean).length;
  const selectedRowIds = useMemo(
    () => Object.keys(selectedProducts).filter((id) => Boolean(selectedProducts[id])),
    [selectedProducts]
  );
  const [manualTreeSelectionActive, setManualTreeSelectionActive] = useState(false);

  const rowWorkflowById = useMemo(() => {
    const out = new Map<string, ShopifyCollectionMappingRowWorkflow>();
    for (const row of rows) {
      const staging = rowStagingById.get(row.id);
      const suggestionReady = (staging?.suggestionOptions || []).some((option) => !option.disabled);
      const manualChanges =
        (staging?.selectedSuggestionPaths.length || 0) +
          (staging?.selectedSuggestionDirectCollections.length || 0) +
          (staging?.manualAddedPaths.length || 0) +
          (staging?.manualRemovedPaths.length || 0) >
        0;
      out.set(
        row.id,
        classifyShopifyCollectionMappingRow({
          mappingDecision: staging?.mappingDecision || row.mappingDecision || "MANUAL_REVIEW",
          collectionSyncStatus: staging?.collectionSyncStatus || "REVIEW",
          actionStatus: row.actionStatus || "",
          suggestionReady,
          manualChanges,
          isReviewed: Boolean(staging?.isReviewed ?? row.isReviewed),
          currentMatchesFinal: staging?.currentMatchesFinal,
        })
      );
    }
    return out;
  }, [rows, rowStagingById]);

  const moduleSummary = useMemo(
    () => summarizeShopifyCollectionMappingWorkflows(Array.from(rowWorkflowById.values())),
    [rowWorkflowById]
  );

  // Apply the active queue tab directly to table rows.
  const filteredRows = useMemo(() => {
    const appliedFilterTypeSet = new Set(appliedFilterTypes.map((value) => value.trim().toLowerCase()).filter(Boolean));
    const filtered = rows.filter((row) => {
      const workflow = rowWorkflowById.get(row.id);
      if (!workflow) return false;
      const matchesQueueTab = matchesShopifyCollectionMappingQueueTab(activeQueueTab, workflow);
      if (!matchesQueueTab) return false;
      const staging = rowStagingById.get(row.id);
      const rowDecision = String(staging?.mappingDecision || row.mappingDecision || "MANUAL_REVIEW")
        .trim()
        .toUpperCase() as AdvancedDecisionFilter;
      const suggestionReady = (staging?.suggestionOptions || []).some((option) => !option.disabled);
      if (
        appliedFilterDecisions.length > 0 &&
        !appliedFilterDecisions.some((decision) => {
          if (decision === "AUTO_MAPPED") return rowDecision === "AUTO_MAPPED";
          if (decision === "SUGGESTED") return suggestionReady || rowDecision === "SUGGESTED";
          if (decision === "MANUAL_REVIEW") return workflow.needsReview || rowDecision === "MANUAL_REVIEW";
          return false;
        })
      ) {
        return false;
      }
      if (appliedFilterTypeSet.size > 0) {
        const rowType = String(row.itemType || "").trim().toLowerCase();
        if (!rowType || !appliedFilterTypeSet.has(rowType)) return false;
      }
      if (appliedFilterHasSuggestions) {
        if (!suggestionReady) return false;
      }
      // Loaded/all view should always reflect the full loaded page size.
      // Keep secondary "Include Synced" filtering for non-all tabs only.
      if (activeQueueTab !== "all" && activeQueueTab !== "synced" && !appliedFilterIncludeSynced && workflow.statusBadgeTone === "synced") {
        return false;
      }
      return true;
    });
    const sorted = [...filtered];
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    const titleAsc = (left: ProductRow, right: ProductRow) => collator.compare(left.title || "", right.title || "");
    sorted.sort((left, right) => {
      const leftWorkflow = rowWorkflowById.get(left.id);
      const rightWorkflow = rowWorkflowById.get(right.id);
      const leftStaging = rowStagingById.get(left.id);
      const rightStaging = rowStagingById.get(right.id);
      switch (headerSortMode) {
        case "product-za":
          return titleAsc(right, left);
        case "picture-with-image":
        case "picture-without-image": {
          const leftHasImage = Boolean(left.image);
          const rightHasImage = Boolean(right.image);
          if (leftHasImage !== rightHasImage) {
            const withImageFirst = headerSortMode === "picture-with-image";
            return leftHasImage === withImageFirst ? -1 : 1;
          }
          return titleAsc(left, right);
        }
        case "suggested-with":
        case "suggested-without": {
          const leftHasSuggested = (leftStaging?.suggestionOptions || []).some((option) => !option.disabled);
          const rightHasSuggested = (rightStaging?.suggestionOptions || []).some((option) => !option.disabled);
          if (leftHasSuggested !== rightHasSuggested) {
            const withSuggestedFirst = headerSortMode === "suggested-with";
            return leftHasSuggested === withSuggestedFirst ? -1 : 1;
          }
          return titleAsc(left, right);
        }
        case "status-synced":
        case "status-ready":
        case "status-review": {
          const primaryStatus =
            headerSortMode === "status-synced"
              ? "Synced"
              : headerSortMode === "status-ready"
                ? "Ready to Push"
                : "Needs Review";
          const leftStatus = leftWorkflow?.statusLabel || "";
          const rightStatus = rightWorkflow?.statusLabel || "";
          const leftPrimary = leftStatus === primaryStatus;
          const rightPrimary = rightStatus === primaryStatus;
          if (leftPrimary !== rightPrimary) return leftPrimary ? -1 : 1;
          const statusOrder = collator.compare(leftStatus, rightStatus);
          if (statusOrder !== 0) return statusOrder;
          return titleAsc(left, right);
        }
        case "product-az":
        default:
          return titleAsc(left, right);
      }
    });
    return sorted;
  }, [
    activeQueueTab,
    rows,
    rowWorkflowById,
    rowStagingById,
    appliedFilterDecisions,
    appliedFilterTypes,
    appliedFilterHasSuggestions,
    appliedFilterIncludeSynced,
    headerSortMode,
  ]);

  const decisionLabelByKey = new Map<AdvancedDecisionFilter, string>([
    ["AUTO_MAPPED", "Auto-mapped"],
    ["SUGGESTED", "Has suggestions"],
    ["MANUAL_REVIEW", "Needs manual review"],
  ]);

  const appliedFilterChips = useMemo(() => {
    const chips: Array<{ id: string; kind: string; value?: string; label: string }> = [];
    for (const decision of appliedFilterDecisions) {
      chips.push({
        id: `decision-${decision}`,
        kind: "decision",
        value: decision,
        label: `Review Type: ${decisionLabelByKey.get(decision) || decision}`,
      });
    }
    for (const itemType of appliedFilterTypes) {
      chips.push({
        id: `type-${itemType.toLowerCase()}`,
        kind: "type",
        value: itemType,
        label: `Type: ${itemType}`,
      });
    }
    if (appliedFilterHasSuggestions) {
      chips.push({
        id: "has-suggestions",
        kind: "has-suggestions",
        label: "Only rows with suggestions",
      });
    }
    if (appliedFilterIncludeSynced) {
      chips.push({
        id: "include-synced",
        kind: "include-synced",
        label: "Include finished rows",
      });
    }
    return chips;
  }, [
    appliedFilterDecisions,
    appliedFilterTypes,
    appliedFilterHasSuggestions,
    appliedFilterIncludeSynced,
  ]);

  const draftFilterTypesLabel = useMemo(() => {
    if (draftFilterTypes.length < 1) return "All product types";
    if (draftFilterTypes.length === 1) return draftFilterTypes[0];
    return `${draftFilterTypes.length} product types selected`;
  }, [draftFilterTypes]);

  function openFiltersDrawer() {
    setDraftFilterTypes(appliedFilterTypes);
    setDraftFilterDecisions(appliedFilterDecisions);
    setDraftFilterHasSuggestions(appliedFilterHasSuggestions);
    setDraftFilterIncludeSynced(appliedFilterIncludeSynced);
    setDraftTypeDropdownOpen(false);
    setShowFiltersDrawer(true);
  }

  function applyAdvancedFilters() {
    setAppliedFilterTypes(draftFilterTypes);
    setAppliedFilterDecisions(draftFilterDecisions);
    setAppliedFilterHasSuggestions(draftFilterHasSuggestions);
    setAppliedFilterIncludeSynced(draftFilterIncludeSynced);
    setPage(1);
    setDraftTypeDropdownOpen(false);
  }

  function clearAdvancedFilters() {
    setDraftFilterTypes([]);
    setDraftFilterDecisions([]);
    setDraftFilterHasSuggestions(false);
    setDraftFilterIncludeSynced(false);
    setAppliedFilterTypes([]);
    setAppliedFilterDecisions([]);
    setAppliedFilterHasSuggestions(false);
    setAppliedFilterIncludeSynced(false);
    setPage(1);
    setDraftTypeDropdownOpen(false);
  }

  function removeAppliedFilterChip(chip: { kind: string; value?: string }) {
    if (chip.kind === "decision" && chip.value) {
      setAppliedFilterDecisions((prev) => prev.filter((value) => value !== chip.value));
    } else if (chip.kind === "type" && chip.value) {
      setAppliedFilterTypes((prev) => prev.filter((value) => value.toLowerCase() !== chip.value?.toLowerCase()));
    } else if (chip.kind === "has-suggestions") {
      setAppliedFilterHasSuggestions(false);
    } else if (chip.kind === "include-synced") {
      setAppliedFilterIncludeSynced(false);
    }
    setPage(1);
  }

  function cycleStatusHeaderSort() {
    setHeaderSortMode((prev) => {
      if (prev === "status-synced") return "status-ready";
      if (prev === "status-ready") return "status-review";
      return "status-synced";
    });
  }

  function getHeaderSortArrow(column: "picture" | "product" | "suggested" | "status") {
    if (column === "picture") {
      if (headerSortMode === "picture-with-image") return "↑";
      if (headerSortMode === "picture-without-image") return "↓";
      return "↕";
    }
    if (column === "product") {
      if (headerSortMode === "product-az") return "↑";
      if (headerSortMode === "product-za") return "↓";
      return "↕";
    }
    if (column === "suggested") {
      if (headerSortMode === "suggested-with") return "↑";
      if (headerSortMode === "suggested-without") return "↓";
      return "↕";
    }
    if (headerSortMode === "status-synced") return "↑";
    if (headerSortMode === "status-ready") return "→";
    if (headerSortMode === "status-review") return "↓";
    return "↕";
  }

  useEffect(() => {
    const tableWrap = tableWrapRef.current;
    const dock = tableScrollDockRef.current;
    const spacer = tableScrollSpacerRef.current;
    const pageEl = pageScrollRef.current;
    if (!tableWrap || !dock || !spacer) return;
    const table = tableWrap.querySelector("table");
    if (!(table instanceof HTMLElement)) return;

    let rafId = 0;
    const syncDockGeometry = () => {
      rafId = 0;
      const rect = tableWrap.getBoundingClientRect();
      const nextLeft = Math.max(0, Math.round(rect.left));
      const nextRight = Math.max(0, Math.round(window.innerWidth - rect.right));
      setTableDockInsets((prev) => {
        if (prev.left === nextLeft && prev.right === nextRight && prev.startOffset === 0) return prev;
        return { left: nextLeft, right: nextRight, startOffset: 0, tableWrapTop: prev.tableWrapTop };
      });
      const pageScrollbarWidth = pageEl ? Math.max(0, pageEl.offsetWidth - pageEl.clientWidth) : 0;
      setPageDockRightInset((prev) => (prev === pageScrollbarWidth ? prev : pageScrollbarWidth));
      const nextWidth = Math.max(table.scrollWidth, tableWrap.clientWidth);
      const nextWidthPx = `${nextWidth}px`;
      if (spacer.style.width !== nextWidthPx) spacer.style.width = nextWidthPx;
    };
    const queueGeometrySync = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(syncDockGeometry);
    };

    const syncFromTable = () => {
      if (syncingTableScrollRef.current === "dock") return;
      syncingTableScrollRef.current = "table";
      if (Math.abs(dock.scrollLeft - tableWrap.scrollLeft) > 0.5) {
        dock.scrollLeft = tableWrap.scrollLeft;
      }
      requestAnimationFrame(() => {
        if (syncingTableScrollRef.current === "table") syncingTableScrollRef.current = null;
      });
    };
    const syncFromDock = () => {
      if (syncingTableScrollRef.current === "table") return;
      syncingTableScrollRef.current = "dock";
      if (Math.abs(tableWrap.scrollLeft - dock.scrollLeft) > 0.5) {
        tableWrap.scrollLeft = dock.scrollLeft;
      }
      requestAnimationFrame(() => {
        if (syncingTableScrollRef.current === "dock") syncingTableScrollRef.current = null;
      });
    };

    queueGeometrySync();
    dock.scrollLeft = tableWrap.scrollLeft;
    tableWrap.addEventListener("scroll", syncFromTable, { passive: true });
    dock.addEventListener("scroll", syncFromDock, { passive: true });
    window.addEventListener("resize", queueGeometrySync);
    const resizeObserver = new ResizeObserver(queueGeometrySync);
    resizeObserver.observe(tableWrap);
    resizeObserver.observe(table);
    if (pageEl) resizeObserver.observe(pageEl);

    return () => {
      tableWrap.removeEventListener("scroll", syncFromTable);
      dock.removeEventListener("scroll", syncFromDock);
      window.removeEventListener("resize", queueGeometrySync);
      resizeObserver.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [rows.length, activeQueueTab, treePaneCollapsed, workspaceHeight]);

  useEffect(() => {
    const pageEl = pageScrollRef.current;
    const tableWrap = tableWrapRef.current;
    if (!pageEl || !tableWrap) return;
    const headerRow = tableWrap.querySelector("thead tr:last-child");
    if (!(headerRow instanceof HTMLElement)) return;

    let rafId = 0;

    const syncStickyHeaderOffset = () => {
      rafId = 0;
      const tableRect = tableWrap.getBoundingClientRect();
      const pageRect = pageEl.getBoundingClientRect();
      const headerHeight = headerRow.offsetHeight || 0;
      const desiredOffset = Math.max(0, Math.round(pageRect.top - tableRect.top));
      const maxOffset = Math.max(0, Math.round(tableRect.bottom - pageRect.top - headerHeight));
      const nextOffset = Math.max(0, Math.min(desiredOffset, maxOffset));
      tableWrap.style.setProperty("--page-table-head-offset", `${nextOffset}px`);
    };

    const queueSync = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(syncStickyHeaderOffset);
    };

    queueSync();
    pageEl.addEventListener("scroll", queueSync, { passive: true });
    window.addEventListener("resize", queueSync);

    const resizeObserver = new ResizeObserver(queueSync);
    resizeObserver.observe(pageEl);
    resizeObserver.observe(tableWrap);
    resizeObserver.observe(headerRow);

    return () => {
      pageEl.removeEventListener("scroll", queueSync);
      window.removeEventListener("resize", queueSync);
      resizeObserver.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
      tableWrap.style.removeProperty("--page-table-head-offset");
    };
  }, [rows.length, treePaneCollapsed, workspaceHeight, activeQueueTab]);

  const rowById = useMemo(() => {
    return new Map(rows.map((row) => [row.id, row]));
  }, [rows]);

  const plannerRowsById = useMemo(() => {
    const out = new Map<string, PushPlannerRow>();
    const toPathRefs = (paths: string[]) => paths.map((path) => `PATH:${normalizeMenuPath(path)}`);
    const toDirectRefs = (handles: string[]) => handles.map((handle) => `DIRECT:${String(handle || "").trim().toLowerCase()}`);
    for (const row of rows) {
      const staging = rowStagingById.get(row.id);
      if (!staging) {
        out.set(row.id, {
          rowId: row.id,
          title: row.title,
          plannerStatus: "failedPlanning",
          skippedReason: "Missing staging state.",
          mappingDecision: row.mappingDecision || "MANUAL_REVIEW",
          collectionSyncStatus: "REVIEW",
          currentCollections: [],
          finalCollections: [],
          collectionsToAdd: [],
          collectionsToRemove: [],
          noOp: true,
        });
        continue;
      }
      const mappingDecision = staging.mappingDecision;
      const collectionSyncStatus = staging.collectionSyncStatus;
      const currentPaths = dedupeNormalizedPaths((row.checkedNodeKeys || []).map((key) => nodePathByKey.get(key) || key));
      const finalPaths = dedupeNormalizedPaths(staging.finalMenuPaths || []);
      const currentDirect = dedupeCollectionHandles(row.currentDirectCollections || []);
      const finalDirect = dedupeCollectionHandles(staging.finalDirectCollections || []);
      const currentRefs = [...toPathRefs(currentPaths), ...toDirectRefs(currentDirect)];
      const finalRefs = [...toPathRefs(finalPaths), ...toDirectRefs(finalDirect)];
      const currentSet = new Set(currentRefs);
      const finalSet = new Set(finalRefs);
      const collectionsToAdd = finalRefs.filter((entry) => !currentSet.has(entry));
      const collectionsToRemove = currentRefs.filter((entry) => !finalSet.has(entry));
      const noOp = collectionsToAdd.length < 1 && collectionsToRemove.length < 1;
      let plannerStatus: PlannerStatus = "readyToPush";
      let skippedReason = "";
      const workflow = rowWorkflowById.get(row.id);
      if (!workflow) {
        plannerStatus = "failedPlanning";
        skippedReason = "Missing workflow state.";
      } else if (workflow.needsReview) {
        plannerStatus = "skippedReview";
        skippedReason = "Row is not approved for push yet.";
      } else if (!row.id || !row.title) {
        plannerStatus = "skippedMissingData";
        skippedReason = "Missing row identity fields.";
      } else if (finalRefs.length < 1) {
        plannerStatus = "skippedMissingData";
        skippedReason = "No final collections resolved.";
      } else if (noOp) {
        plannerStatus = "noChange";
        skippedReason = "No add/remove delta.";
      }
      out.set(row.id, {
        rowId: row.id,
        title: row.title,
        plannerStatus,
        skippedReason,
        mappingDecision,
        collectionSyncStatus,
        currentCollections: currentRefs,
        finalCollections: finalRefs,
        collectionsToAdd,
        collectionsToRemove,
        noOp,
      });
    }
    return out;
  }, [rows, rowStagingById, rowWorkflowById, nodePathByKey]);

  const allSelectedOnPage = useMemo(() => {
    if (filteredRows.length < 1) return false;
    return filteredRows.every((row) => Boolean(selectedProducts[row.id]));
  }, [filteredRows, selectedProducts]);

  function matchesMenuSearch(node: MenuNode, query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    const source = `${node.label} ${node.linkedTargetLabel || ""}`.toLowerCase();
    // Hard rule requested by product: "men" search must never include women entries.
    if (normalizedQuery === "men") {
      return /\bmen\b/.test(source) && !/\bwomen\b/.test(source);
    }
    const qTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (qTokens.length < 1) return true;
    const sourceTokens = source.split(/[^a-z0-9]+/).filter(Boolean);
    if (sourceTokens.length < 1) return false;
    return qTokens.every((token) => sourceTokens.some((sourceToken) => sourceToken.startsWith(token)));
  }

  const treeNodes = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return nodes;
    const include = new Set<string>();
    for (const node of nodes) {
      if (!matchesMenuSearch(node, q)) continue;
      include.add(node.nodeKey);
      let current = node.parentKey || null;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        include.add(current);
        seen.add(current);
        current = parentMap.get(current) || null;
      }
    }
    return nodes.filter((node) => include.has(node.nodeKey));
  }, [nodes, treeSearch, parentMap]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const node of nodes) {
      const parent = node.parentKey || "";
      if (!parent) continue;
      const current = map.get(parent) || [];
      current.push(node.nodeKey);
      map.set(parent, current);
    }
    return map;
  }, [nodes]);

  const collectionAudit = useMemo(() => {
    const titleById = new Map(collections.map((row) => [row.id, row.title]));
    const mappedNodeCollectionIds = nodes
      .map((node) => (node.collectionId ? String(node.collectionId) : ""))
      .filter(Boolean);
    const mappedUniqueIds = Array.from(new Set(mappedNodeCollectionIds));

    const mappedCountByCollection = new Map<string, number>();
    for (const id of mappedNodeCollectionIds) {
      mappedCountByCollection.set(id, (mappedCountByCollection.get(id) || 0) + 1);
    }

    const duplicates = Array.from(mappedCountByCollection.entries())
      .filter((entry) => entry[1] > 1)
      .map(([id, count]) => ({
        id,
        title: titleById.get(id) || id,
        count,
      }))
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));

    const unmapped = collections
      .filter((row) => !mappedUniqueIds.includes(row.id))
      .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));

    return {
      totalCollections: collections.length,
      mappedNodes: mappedNodeCollectionIds.length,
      mappedUniqueCollections: mappedUniqueIds.length,
      unmappedCount: unmapped.length,
      duplicatesCount: duplicates.length,
      unmapped,
      duplicates,
      generatedAt: new Date().toISOString(),
    };
  }, [collections, nodes]);

  const orderedUnmappedCollections = useMemo(() => {
    const rankById = new Map<string, number>();
    for (let index = 0; index < unmappedCollectionOrder.length; index += 1) {
      rankById.set(unmappedCollectionOrder[index], index);
    }
    return collectionAudit.unmapped
      .filter((row) => !dismissedUnmappedCollectionIds[row.id])
      .sort((left, right) => {
        const leftRank = rankById.has(left.id) ? Number(rankById.get(left.id)) : Number.MAX_SAFE_INTEGER;
        const rightRank = rankById.has(right.id) ? Number(rankById.get(right.id)) : Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      });
  }, [collectionAudit.unmapped, unmappedCollectionOrder, dismissedUnmappedCollectionIds]);

  const menuEditorAssetOptions = useMemo(() => {
    if (menuEditorLinkType === "COLLECTION") return menuLinkTargets.collections;
    if (menuEditorLinkType === "PRODUCT") return menuLinkTargets.products;
    if (menuEditorLinkType === "PAGE") return menuLinkTargets.pages;
    return [];
  }, [menuEditorLinkType, menuLinkTargets]);

  const filteredMenuEditorAssetOptions = useMemo(() => {
    const query = menuEditorLinkQuery.trim().toLowerCase();
    if (!query) return menuEditorAssetOptions;
    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length < 1) return menuEditorAssetOptions;
    return menuEditorAssetOptions.filter((option) => {
      const haystack = `${option.title || ""} ${option.handle || ""} ${option.url || ""} ${option.id}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [menuEditorAssetOptions, menuEditorLinkQuery]);

  const visibleTreeNodes = useMemo(() => {
    const hasSearch = treeSearch.trim().length > 0;
    if (hasSearch) return treeNodes;
    return treeNodes.filter((node) => {
      let current = node.parentKey || null;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        if (expandedNodes[current] === false) return false;
        seen.add(current);
        current = parentMap.get(current) || null;
      }
      return true;
    });
  }, [treeNodes, treeSearch, expandedNodes, parentMap]);

  const visibleTreeNodeIdSet = useMemo(() => {
    return new Set(visibleTreeNodes.map((node) => node.nodeKey));
  }, [visibleTreeNodes]);

  async function loadData(options?: { refreshProducts?: boolean; refreshCollections?: boolean }) {
    const requestId = loadDataReqIdRef.current + 1;
    loadDataReqIdRef.current = requestId;
    loadDataAbortRef.current?.abort();
    const controller = new AbortController();
    loadDataAbortRef.current = controller;
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const [sortField, sortDir] = sort.split("-") as ["title" | "upc", "asc" | "desc"];
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        q: search.trim(),
        sortField,
        sortDir,
      });
      if (activeShop) {
        params.set("shop", activeShop);
      }
      if (options?.refreshProducts) {
        params.set("refreshProducts", "true");
      }
      if (options?.refreshCollections) {
        params.set("refreshCollections", "true");
      }
      const resp = await fetch(`/api/collection-mapping?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (resp.status === 404) {
        // Localhost safety: when the API route resolves to an HTML 404 page, keep the UI stable instead of surfacing a JSON parse error.
        setNodes([]);
        setLastSyncedNodes([]);
        setRows([]);
        setCollections([]);
        setCollectionCount(0);
        setProductCount(0);
        setTotalPages(1);
        setPage(1);
        setWarning("Collection mapping API is currently unavailable on localhost (404).");
        setError("");
        return true;
      }
      const json = await readJsonResponse<MappingResponse>(resp);
      if (requestId !== loadDataReqIdRef.current) return false;
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Failed to load Shopify collection mapping.");
      }
      const responseShop = normalizeShopDomain(String(json.shop || ""));
      if (isValidShopDomain(responseShop)) {
        if (responseShop !== shop) {
          setShop(responseShop);
        }
        try {
          window.localStorage.setItem("shopify_shop", responseShop);
        } catch {
          // ignore storage failures
        }
      }

      const nextNodes = json.nodes || [];
      setNodes(nextNodes);
      setLastSyncedNodes(cloneNodes(nextNodes));
      const nextRows = Array.isArray(json.rows) ? json.rows : [];
      const nextSelectedSuggestionPathsByRow: Record<string, Record<string, boolean>> = {};
      const nextSelectedSuggestionCollectionsByRow: Record<string, Record<string, boolean>> = {};
      const nextManualAddedPathsByRow: Record<string, Record<string, boolean>> = {};
      const nextManualRemovedPathsByRow: Record<string, Record<string, boolean>> = {};
      const nextReviewedByRow: Record<string, boolean> = {};
      for (const row of nextRows) {
        const draft = row?.draft;
        if (!draft || typeof draft !== "object") continue;
        const rowId = String(row.id || "").trim();
        if (!rowId) continue;
        const selectedSuggestionPaths = mapToSelectedRecord(Array.isArray(draft.selectedSuggestionPaths) ? draft.selectedSuggestionPaths : []);
        const selectedSuggestionCollections = mapToSelectedRecord(
          Array.isArray(draft.selectedSuggestionCollections) ? draft.selectedSuggestionCollections : []
        );
        const manualAddedPaths = mapToSelectedRecord(Array.isArray(draft.manualAddedPaths) ? draft.manualAddedPaths : []);
        const manualRemovedPaths = mapToSelectedRecord(Array.isArray(draft.manualRemovedPaths) ? draft.manualRemovedPaths : []);
        if (Object.keys(selectedSuggestionPaths).length > 0) nextSelectedSuggestionPathsByRow[rowId] = selectedSuggestionPaths;
        if (Object.keys(selectedSuggestionCollections).length > 0) {
          nextSelectedSuggestionCollectionsByRow[rowId] = selectedSuggestionCollections;
        }
        if (Object.keys(manualAddedPaths).length > 0) nextManualAddedPathsByRow[rowId] = manualAddedPaths;
        if (Object.keys(manualRemovedPaths).length > 0) nextManualRemovedPathsByRow[rowId] = manualRemovedPaths;
        if (draft.isReviewed === true) nextReviewedByRow[rowId] = true;
      }
      setRows(nextRows);
      setSelectedSuggestionPathsByRow(nextSelectedSuggestionPathsByRow);
      setSelectedSuggestionCollectionsByRow(nextSelectedSuggestionCollectionsByRow);
      setManualAddedPathsByRow(nextManualAddedPathsByRow);
      setManualRemovedPathsByRow(nextManualRemovedPathsByRow);
      setReviewedByRow(nextReviewedByRow);
      syncedDraftClearedRowIdsRef.current.clear();
      draftHydrationDoneRef.current = true;
      const nextCollections = (json.collections || []).map((row) => ({
        id: String(row.id || ""),
        title: String(row.title || "").trim() || String(row.id || ""),
        handle: String((row as { handle?: string }).handle || "").trim().toLowerCase(),
      }));
      setCollections(nextCollections);
      setCollectionCount(nextCollections.length);
      setProductCount(Number(json.total || json.summary?.totalProducts || (json.rows || []).length));
      const nextTypeOptions = Array.isArray(json.types)
        ? json.types.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      setTypeOptions(nextTypeOptions);
      setMenuLinkTargets({
        collections: Array.isArray(json.linkTargets?.collections) ? json.linkTargets.collections : [],
        products: Array.isArray(json.linkTargets?.products) ? json.linkTargets.products : [],
        pages: Array.isArray(json.linkTargets?.pages) ? json.linkTargets.pages : [],
        blogs: Array.isArray(json.linkTargets?.blogs) ? json.linkTargets.blogs : [],
      });
      setMenuMeta({
        title: String(json.menu?.title || "Main menu").trim() || "Main menu",
        handle: String(json.menu?.handle || "main-menu").trim() || "main-menu",
      });
      setTotalPages(Math.max(1, Number(json.totalPages || 1)));
      if (json.page && Number.isFinite(Number(json.page))) {
        setPage(Math.max(1, Number(json.page)));
      }
      setWarning(String(json.warning || "").trim());
      setSelectedProducts((prev) => {
        const nextIds = new Set((json.rows || []).map((r: { id: string }) => String(r.id)));
        const out: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) {
          if (prev[key] && nextIds.has(key)) out[key] = prev[key];
        }
        return out;
      });
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      const message = err instanceof Error ? err.message : "Failed to load collection mapping.";
      setError(message);
      return false;
    } finally {
      if (requestId === loadDataReqIdRef.current) {
        setLoading(false);
      }
    }
  }

  async function loadMenuEditorAssets(linkType: MenuLinkType, options?: { force?: boolean }) {
    const hasCached =
      linkType === "COLLECTION"
        ? menuLinkTargets.collections.length > 0
        : linkType === "PRODUCT"
          ? menuLinkTargets.products.length > 0
          : menuLinkTargets.pages.length > 0;
    if (hasCached && !options?.force) return;
    setMenuEditorAssetsLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withShopContext({
          action: "fetch-link-assets",
          linkType,
        })),
      });
      const json = await readJsonResponse<MappingResponse>(resp);
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Failed to load Shopify assets.");
      }
      setMenuLinkTargets({
        collections: Array.isArray(json.linkTargets?.collections) ? json.linkTargets.collections : [],
        products: Array.isArray(json.linkTargets?.products) ? json.linkTargets.products : [],
        pages: Array.isArray(json.linkTargets?.pages) ? json.linkTargets.pages : [],
        blogs: Array.isArray(json.linkTargets?.blogs) ? json.linkTargets.blogs : [],
      });
      setWarning(String(json.warning || "").trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load Shopify assets.";
      setError(message);
    } finally {
      setMenuEditorAssetsLoading(false);
    }
  }

  function resetPageForDataQuery() {
    setPage(1);
  }

  function resetTreeSelectionToDefault() {
    setSelectedNodes({});
    setSelectedUnmappedCollectionIds({});
  }

  function buildCollapsedExpansionMap(rows: MenuNode[]) {
    const parentKeys = new Set<string>();
    const childCounts = new Map<string, number>();
    for (const row of rows) {
      const parentKey = String(row.parentKey || "").trim();
      if (!parentKey) continue;
      childCounts.set(parentKey, (childCounts.get(parentKey) || 0) + 1);
    }
    for (const [key, count] of childCounts.entries()) {
      if (count > 0) parentKeys.add(key);
    }
    const out: Record<string, boolean> = {};
    for (const key of parentKeys) out[key] = false;
    return out;
  }

  function collapseTreeToDefault(rows?: MenuNode[]) {
    setTreeSearch("");
    if (Array.isArray(rows)) {
      const collapsed = buildCollapsedExpansionMap(rows);
      setExpandedNodes(collapsed);
      // Ensure collapse wins over any queued expansion state updates.
      window.setTimeout(() => setExpandedNodes(collapsed), 0);
      return;
    }
    setExpandedNodes({});
  }

  function toggleUnmappedCollectionSelection(collectionId: string) {
    const normalized = String(collectionId || "").trim();
    if (!normalized) return;
    if (selectedRowIds.length < 1) return;
    setSelectedUnmappedCollectionIds((prev) => ({
      ...prev,
      [normalized]: !prev[normalized],
    }));
  }

  function reorderUnmappedCollection(sourceId: string, targetId: string) {
    const source = String(sourceId || "").trim();
    const target = String(targetId || "").trim();
    if (!source || !target || source === target) return;
    setUnmappedCollectionOrder((prev) => {
      const base = prev.length > 0 ? [...prev] : orderedUnmappedCollections.map((row) => row.id);
      const sourceIndex = base.indexOf(source);
      const targetIndex = base.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const next = [...base];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  }

  async function editUnmappedCollection(collectionId: string, nextTitleInput: string) {
    const target = collectionAudit.unmapped.find((row) => row.id === collectionId);
    if (!target) return;
    const nextTitle = nextTitleInput.trim();
    if (!nextTitle || nextTitle === target.title) return;

    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          withShopContext({
            action: "rename-collection-title",
            collectionId: target.id,
            title: nextTitle,
          })
        ),
      });
      const json = await readJsonResponse<MappingResponse>(resp);
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Failed to rename collection.");
      }
      await loadData({ refreshCollections: true });
      setWarning(`Collection renamed to "${nextTitle}".`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rename collection.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function deleteUnmappedCollectionCard(collectionId: string) {
    setDismissedUnmappedCollectionIds((prev) => ({ ...prev, [collectionId]: true }));
    setSelectedUnmappedCollectionIds((prev) => {
      if (!prev[collectionId]) return prev;
      const next = { ...prev };
      delete next[collectionId];
      return next;
    });
    setUnmappedCollectionOrder((prev) => prev.filter((id) => id !== collectionId));
  }

  function applyNodeSelection(nodeKey: string) {
    if (selectedRowIds.length < 1) return;
    if (selectedRowIds.length > 1) {
      setManualTreeSelectionActive(true);
    }
    if (activeRowId && selectedRowIds.length === 1) {
      const nodePath = normalizeMenuPath(nodePathByKey.get(nodeKey) || nodeLabelByKey.get(nodeKey) || "");
      if (!nodePath) return;
      const staging = rowStagingById.get(activeRowId);
      const currentlySelected = Boolean(staging?.finalMenuPathSet.has(nodePath));
      if (currentlySelected) {
        setManualRemovedPathsByRow((prev) => ({
          ...prev,
          [activeRowId]: { ...(prev[activeRowId] || {}), [nodePath]: true },
        }));
        setManualAddedPathsByRow((prev) => {
          const current = { ...(prev[activeRowId] || {}) };
          delete current[nodePath];
          return { ...prev, [activeRowId]: current };
        });
        setSelectedSuggestionPathsByRow((prev) => {
          const current = { ...(prev[activeRowId] || {}) };
          delete current[nodePath];
          return { ...prev, [activeRowId]: current };
        });
      } else {
        setManualAddedPathsByRow((prev) => ({
          ...prev,
          [activeRowId]: { ...(prev[activeRowId] || {}), [nodePath]: true },
        }));
        setManualRemovedPathsByRow((prev) => {
          const current = { ...(prev[activeRowId] || {}) };
          delete current[nodePath];
          return { ...prev, [activeRowId]: current };
        });
      }
      return;
    }

    const selectedCountBefore = Object.keys(selectedNodes).filter((key) => Boolean(selectedNodes[key])).length;
    const clickedAlreadySelected = Boolean(selectedNodes[nodeKey]);
    const next = new Set<string>(Object.keys(selectedNodes).filter((key) => Boolean(selectedNodes[key])));
    if (clickedAlreadySelected) {
      const stack = [nodeKey];
      const toRemove = new Set<string>();
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || toRemove.has(current)) continue;
        toRemove.add(current);
        const children = childrenByParent.get(current) || [];
        for (const child of children) stack.push(child);
      }
      for (const key of toRemove) next.delete(key);
    } else {
      next.add(nodeKey);
    }

    // Auto-select parent chain for every selected node.
    const closed = new Set<string>(next);
    for (const key of Array.from(next)) {
      let current = parentMap.get(key) || null;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        closed.add(current);
        seen.add(current);
        current = parentMap.get(current) || null;
      }
    }

    const out: Record<string, boolean> = {};
    for (const key of closed) out[key] = true;
    // #region agent log
    debugIngest({
        sessionId: "9da838",
        runId: "multi-select-debug",
        hypothesisId: "H1",
        location: "components/shopify-collection-mapping.tsx:applyNodeSelection",
        message: "selection_after_probe",
        data: {
          nodeKey,
          clickedAlreadySelected,
          selectedCountBefore,
          selectedCountAfter: Object.keys(out).length,
          selectedKeysAfter: Object.keys(out),
        },
        timestamp: Date.now(),
      });
    // #endregion
    setSelectedNodes(out);
  }

  useEffect(() => {
    const currentIds = collectionAudit.unmapped.map((row) => row.id);
    setUnmappedCollectionOrder((prev) => {
      const currentSet = new Set(currentIds);
      const kept = prev.filter((id) => currentSet.has(id));
      const keptSet = new Set(kept);
      const appended = currentIds.filter((id) => !keptSet.has(id));
      const next = [...kept, ...appended];
      if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) return prev;
      return next;
    });
  }, [collectionAudit.unmapped]);

  useEffect(() => {
    if (rows.length < 1) {
      setActiveRowId("");
      return;
    }
    const exists = rows.some((row) => row.id === activeRowId);
    if (!exists) {
      setActiveRowId("");
    }
  }, [rows, activeRowId]);

  const toClosedNodeSetFromPaths = (paths: string[]) => {
    const selected = new Set<string>();
    for (const path of paths) {
      const nodeKey = nodeKeyByPath.get(normalizeMenuPath(path));
      if (!nodeKey) continue;
      selected.add(nodeKey);
      let current = parentMap.get(nodeKey) || null;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        selected.add(current);
        seen.add(current);
        current = parentMap.get(current) || null;
      }
    }
    return selected;
  };

  useEffect(() => {
    if (selectedRowIds.length < 1) {
      setSelectedNodes({});
      setManualTreeSelectionActive(false);
      return;
    }

    if (selectedRowIds.length === 1) {
      const onlyRowId = selectedRowIds[0];
      const staging = rowStagingById.get(onlyRowId);
      if (!staging) {
        setSelectedNodes({});
        return;
      }
      const selected = toClosedNodeSetFromPaths(staging.finalMenuPaths || []);
      const next: Record<string, boolean> = {};
      for (const key of selected) next[key] = true;
      setSelectedNodes(next);
      setManualTreeSelectionActive(false);
      return;
    }

    const selectedSets = selectedRowIds.map((rowId) => {
      const staging = rowStagingById.get(rowId);
      if (!staging) return new Set<string>();
      return toClosedNodeSetFromPaths(staging.finalMenuPaths || []);
    });
    const first = selectedSets[0];
    const allEqual = selectedSets.every(
      (set) => set.size === first.size && Array.from(set).every((key) => first.has(key))
    );
    if (allEqual && !manualTreeSelectionActive) {
      const next: Record<string, boolean> = {};
      for (const key of first) next[key] = true;
      setSelectedNodes(next);
      return;
    }
    if (!manualTreeSelectionActive) {
      setSelectedNodes({});
    }
  }, [selectedRowIds, rowStagingById, nodeKeyByPath, parentMap, manualTreeSelectionActive]);

  useEffect(() => {
    const valid = new Set(rows.map((row) => row.id));
    const prune = (state: Record<string, Record<string, boolean>>) => {
      const next: Record<string, Record<string, boolean>> = {};
      for (const [rowId, values] of Object.entries(state)) {
        if (!valid.has(rowId)) continue;
        next[rowId] = values;
      }
      return next;
    };
    setSelectedSuggestionPathsByRow((prev) => prune(prev));
    setSelectedSuggestionCollectionsByRow((prev) => prune(prev));
    setManualAddedPathsByRow((prev) => prune(prev));
    setManualRemovedPathsByRow((prev) => prune(prev));
    setReviewedByRow((prev) => {
      const next: Record<string, boolean> = {};
      for (const [rowId, value] of Object.entries(prev)) {
        if (!valid.has(rowId)) continue;
        next[rowId] = Boolean(value);
      }
      return next;
    });
  }, [rows]);

  useEffect(() => {
    if (!draftHydrationDoneRef.current) return;
    if (!activeShop) return;
    const timer = window.setTimeout(() => {
      const drafts: Array<{ rowId: string; draft: Record<string, unknown> }> = [];
      for (const row of rows) {
        const rowId = String(row.id || "").trim();
        if (!rowId) continue;
        const selectedSuggestionPaths = selectedRecordToList(selectedSuggestionPathsByRow[rowId]);
        const selectedSuggestionCollections = selectedRecordToList(selectedSuggestionCollectionsByRow[rowId]);
        const manualAddedPaths = selectedRecordToList(manualAddedPathsByRow[rowId]);
        const manualRemovedPaths = selectedRecordToList(manualRemovedPathsByRow[rowId]);
        const staging = rowStagingById.get(rowId);
        const isReviewed = Boolean(reviewedByRow[rowId] ?? row.isReviewed);
        const hasDraft =
          isReviewed ||
          selectedSuggestionPaths.length > 0 ||
          selectedSuggestionCollections.length > 0 ||
          manualAddedPaths.length > 0 ||
          manualRemovedPaths.length > 0;
        if (!hasDraft) continue;
        drafts.push({
          rowId,
          draft: {
            isReviewed,
            selectedSuggestionPaths,
            selectedSuggestionCollections,
            manualAddedPaths,
            manualRemovedPaths,
            mappingDecision: staging?.mappingDecision || row.mappingDecision || null,
            collectionSyncStatus: staging?.collectionSyncStatus || null,
            finalMenuPaths: staging?.finalMenuPaths || [],
            finalDirectCollections: staging?.finalDirectCollections || [],
            currentMatchesFinal: typeof staging?.currentMatchesFinal === "boolean" ? staging.currentMatchesFinal : null,
          },
        });
      }
      const payloadHash = JSON.stringify(drafts);
      if (payloadHash === lastDraftSavePayloadRef.current) return;
      lastDraftSavePayloadRef.current = payloadHash;
      void fetch("/api/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withShopContext({ action: "set-row-draft-batch", drafts })),
      }).catch(() => {});
    }, DRAFT_AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    activeShop,
    rows,
    reviewedByRow,
    selectedSuggestionPathsByRow,
    selectedSuggestionCollectionsByRow,
    manualAddedPathsByRow,
    manualRemovedPathsByRow,
    rowStagingById,
  ]);

  useEffect(() => {
    if (!draftHydrationDoneRef.current) return;
    if (!activeShop) return;
    if (syncedDraftClearInFlightRef.current) return;
    const syncedWithDrafts = rows
      .filter((row) => {
        const workflow = rowWorkflowById.get(row.id);
        if (!workflow?.synced) return false;
        const rowId = String(row.id || "").trim();
        if (!rowId) return false;
        if (syncedDraftClearedRowIdsRef.current.has(rowId)) return false;
        const hasLocalDraft =
          rowId in reviewedByRow ||
          Boolean(selectedSuggestionPathsByRow[rowId]) ||
          Boolean(selectedSuggestionCollectionsByRow[rowId]) ||
          Boolean(manualAddedPathsByRow[rowId]) ||
          Boolean(manualRemovedPathsByRow[rowId]) ||
          Boolean(row.draft);
        return hasLocalDraft;
      })
      .map((row) => String(row.id || "").trim())
      .filter(Boolean);
    if (syncedWithDrafts.length < 1) return;
    syncedDraftClearInFlightRef.current = true;
    void fetch("/api/collection-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withShopContext({ action: "clear-row-drafts", rowIds: syncedWithDrafts })),
    })
      .catch(() => {})
      .finally(() => {
        syncedDraftClearInFlightRef.current = false;
      });
    for (const rowId of syncedWithDrafts) {
      syncedDraftClearedRowIdsRef.current.add(rowId);
    }
    setReviewedByRow((prev) => {
      const next = { ...prev };
      for (const rowId of syncedWithDrafts) delete next[rowId];
      return next;
    });
    setSelectedSuggestionPathsByRow((prev) => {
      const next = { ...prev };
      for (const rowId of syncedWithDrafts) delete next[rowId];
      return next;
    });
    setSelectedSuggestionCollectionsByRow((prev) => {
      const next = { ...prev };
      for (const rowId of syncedWithDrafts) delete next[rowId];
      return next;
    });
    setManualAddedPathsByRow((prev) => {
      const next = { ...prev };
      for (const rowId of syncedWithDrafts) delete next[rowId];
      return next;
    });
    setManualRemovedPathsByRow((prev) => {
      const next = { ...prev };
      for (const rowId of syncedWithDrafts) delete next[rowId];
      return next;
    });
  }, [
    activeShop,
    rows,
    rowWorkflowById,
    reviewedByRow,
    selectedSuggestionPathsByRow,
    selectedSuggestionCollectionsByRow,
    manualAddedPathsByRow,
    manualRemovedPathsByRow,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 180);
    return () => {
      window.clearTimeout(timer);
      loadDataAbortRef.current?.abort();
    };
  }, [search, sort, page, pageSize, activeShop]);

  useEffect(() => {
    const queryShop = normalizeShopDomain(new URLSearchParams(window.location.search).get("shop") || "");
    const storedShop = normalizeShopDomain(window.localStorage.getItem("shopify_shop") || "");
    const nextShop = isValidShopDomain(queryShop)
      ? queryShop
      : isValidShopDomain(storedShop)
        ? storedShop
        : "";
    if (nextShop) {
      setShop(nextShop);
      try {
        window.localStorage.setItem("shopify_shop", nextShop);
      } catch {
        // ignore storage failures
      }
    }
  }, []);

  useEffect(() => {
    if (window.location.search.length < 1) return;
    const nextUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeShop]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prevRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const pageEl = pageScrollRef.current;
    if (pageEl) pageEl.scrollTop = 0;
    return () => {
      window.history.scrollRestoration = prevRestoration;
    };
  }, []);

  useEffect(() => {
    setSelectedProducts({});
  }, [search, treeSearch, sort]);

  useEffect(() => {
    setExpandedNodes((prev) => {
      const parentKeys = new Set<string>();
      for (const [parentKey, childKeys] of childrenByParent.entries()) {
        if (parentKey && childKeys.length > 0) parentKeys.add(parentKey);
      }
      const next: Record<string, boolean> = {};
      for (const key of parentKeys) {
        next[key] = key in prev ? prev[key] : false;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key) => next[key] === prev[key])
      ) {
        return prev;
      }
      return next;
    });
  }, [childrenByParent]);

  useEffect(() => {
    if (!showMenuEditor) return;
    const selected = menuEditorAssetOptions.find((option) => option.id === menuEditorLinkTargetId);
    if (!selected) return;
    const nextLabel = selected.title || selected.handle || selected.id;
    setMenuEditorLinkQuery((prev) => (prev.trim() ? prev : nextLabel));
  }, [showMenuEditor, menuEditorAssetOptions, menuEditorLinkTargetId]);

  function downloadAuditCsv() {
    const lines: string[] = [];
    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    lines.push(`${csvCell("Collection Audit Report")}`);
    lines.push(`${csvCell("Generated At")},${csvCell(collectionAudit.generatedAt)}`);
    lines.push(`${csvCell("Total Shopify Collections")},${csvCell(collectionAudit.totalCollections)}`);
    lines.push(`${csvCell("Mapped Collections")},${csvCell(collectionAudit.mappedNodes)}`);
    lines.push(`${csvCell("Mapped Unique Collections")},${csvCell(collectionAudit.mappedUniqueCollections)}`);
    lines.push(`${csvCell("Unmapped Collections")},${csvCell(collectionAudit.unmappedCount)}`);
    lines.push(`${csvCell("Duplicate Mapped Collections")},${csvCell(collectionAudit.duplicatesCount)}`);
    lines.push("");
    lines.push(`${csvCell("Section")},${csvCell("Collection Title")},${csvCell("Collection ID")},${csvCell("Count")}`);

    for (const row of collectionAudit.unmapped) {
      lines.push(`${csvCell("Unmapped")},${csvCell(row.title)},${csvCell(row.id)},${csvCell("")}`);
    }
    for (const row of collectionAudit.duplicates) {
      lines.push(`${csvCell("Duplicate Mapping")},${csvCell(row.title)},${csvCell(row.id)},${csvCell(row.count)}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `collection-mapping-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImage]);

  useEffect(() => {
    if (!showCommitMenu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (commitMenuRef.current?.contains(target)) return;
      setShowCommitMenu(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [showCommitMenu]);

  useEffect(() => {
    if (!showFiltersDrawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraftTypeDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFiltersDrawer]);

  useEffect(() => {
    if (!showMenuEditor || !menuEditorComboboxOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuEditorComboboxRef.current?.contains(target)) return;
      setMenuEditorComboboxOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuEditorComboboxOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showMenuEditor, menuEditorComboboxOpen]);

  useEffect(() => {
    if (!resizingPanes) return;
    let rafId = 0;
    const getTargetWidth = () => {
      const start = paneResizeStart.current;
      if (!start) return null;
      const deltaX = paneResizePointerClientX.current - start.x;
      return Math.round(
        Math.min(TREE_PANEL_MAX_WIDTH, Math.max(start.minWidth, start.width + deltaX))
      );
    };
    const tick = () => {
      const targetWidth = getTargetWidth();
      if (targetWidth === null) return;
      setTreePanelWidth((prev) => {
        const delta = targetWidth - prev;
        if (Math.abs(delta) <= 1) return targetWidth;
        if (delta < 0) {
          // shrink: faster follow; cap at 18px/frame
          return Math.round(prev + Math.max(delta, -18));
        }
        // expand: smooth ease-in lerp
        return Math.round(prev + delta * 0.22);
      });
      rafId = window.requestAnimationFrame(tick);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!paneResizeStart.current) return;
      if (
        paneResizeStart.current.pointerId !== null &&
        event.pointerId !== paneResizeStart.current.pointerId
      ) {
        return;
      }
      paneResizePointerClientX.current = event.clientX;
    };
    const stopResize = () => {
      const targetWidth = getTargetWidth();
      if (targetWidth !== null) setTreePanelWidth(targetWidth);
      setResizingPanes(false);
      paneResizeStart.current = null;
    };
    const priorCursor = document.body.style.cursor;
    const priorUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    rafId = window.requestAnimationFrame(tick);
    return () => {
      document.body.style.cursor = priorCursor;
      document.body.style.userSelect = priorUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [resizingPanes]);

  useEffect(() => {
    if (!resizingWorkspaceHeight) return;
    let rafId = 0;
    const EDGE_THRESHOLD = 48;
    const getTargetHeight = () => {
      const start = workspaceResizeStart.current;
      if (!start) return null;
      const pageEl = pageScrollRef.current;
      const currentScrollTop =
        pageEl?.scrollTop ??
        window.scrollY ??
        document.documentElement.scrollTop ??
        document.body.scrollTop ??
        0;
      const deltaY =
        workspaceResizePointerClientY.current -
        start.clientY +
        (currentScrollTop - start.scrollTop);
      return Math.min(
        WORKSPACE_MAX_HEIGHT,
        Math.max(WORKSPACE_MIN_HEIGHT, Math.round(start.height + deltaY))
      );
    };
    const tick = () => {
      const start = workspaceResizeStart.current;
      if (!start) return;
      const pageEl = pageScrollRef.current;
      const clientY = workspaceResizePointerClientY.current;
      if (clientY > window.innerHeight - EDGE_THRESHOLD) {
        const distance = clientY - (window.innerHeight - EDGE_THRESHOLD);
        const scrollStep = Math.max(16, Math.min(42, Math.round(distance * 0.85)));
        if (pageEl) {
          pageEl.scrollTop = Math.min(pageEl.scrollHeight, pageEl.scrollTop + scrollStep);
        } else {
          window.scrollBy({ top: scrollStep, behavior: "auto" });
        }
      } else if (clientY < EDGE_THRESHOLD) {
        const distance = EDGE_THRESHOLD - clientY;
        const scrollStep = Math.max(16, Math.min(42, Math.round(distance * 0.85)));
        if (pageEl) {
          pageEl.scrollTop = Math.max(0, pageEl.scrollTop - scrollStep);
        } else {
          window.scrollBy({ top: -scrollStep, behavior: "auto" });
        }
      }
      const targetHeight = getTargetHeight();
      if (targetHeight !== null && Number.isFinite(targetHeight)) {
        const clamped = Math.min(WORKSPACE_MAX_HEIGHT, Math.max(WORKSPACE_MIN_HEIGHT, targetHeight));
        const prev = workspaceResizeCurrentRef.current;
        if (prev === null || Math.abs(clamped - prev) >= 1) {
          workspaceResizeCurrentRef.current = clamped;
          setWorkspaceHeight(clamped);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    const onPointerMove = (event: PointerEvent) => {
      const start = workspaceResizeStart.current;
      if (!start) return;
      if (start.pointerId !== null && event.pointerId !== start.pointerId) {
        return;
      }
      workspaceResizePointerClientY.current = event.clientY;
    };
    const stopResize = () => {
      const targetHeight = getTargetHeight();
      if (targetHeight !== null && Number.isFinite(targetHeight)) {
        const clamped = Math.min(WORKSPACE_MAX_HEIGHT, Math.max(WORKSPACE_MIN_HEIGHT, targetHeight));
        setWorkspaceHeight(clamped);
      }
      workspaceResizeCurrentRef.current = null;
      setResizingWorkspaceHeight(false);
      workspaceResizeStart.current = null;
    };
    const priorCursor = document.body.style.cursor;
    const priorUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    const targetHeight = getTargetHeight();
    if (targetHeight !== null && Number.isFinite(targetHeight)) {
      const clamped = Math.min(WORKSPACE_MAX_HEIGHT, Math.max(WORKSPACE_MIN_HEIGHT, targetHeight));
      workspaceResizeCurrentRef.current = clamped;
      setWorkspaceHeight(clamped);
    }
    rafId = window.requestAnimationFrame(tick);
    return () => {
      document.body.style.cursor = priorCursor;
      document.body.style.userSelect = priorUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [resizingWorkspaceHeight]);

  function measureTreePanelMinWidth(host: HTMLElement) {
    const panelWidth = host.clientWidth;
    const treeContent =
      host.querySelector<HTMLElement>(".treeContent") ||
      host.querySelector<HTMLElement>(".treeCanvas");
    const contentWidth = treeContent?.clientWidth || panelWidth;
    const chromeWidth = Math.max(0, panelWidth - contentWidth);
    let maxInnerRequired = 0;

    const treeRows = host.querySelectorAll<HTMLElement>(".treeRow");
    treeRows.forEach((row) => {
      if (row.offsetParent === null) return;
      const node = row.closest<HTMLElement>(".treeNode");
      const textWrap = row.querySelector<HTMLElement>(".treeText");
      const label = row.querySelector<HTMLElement>(".treeLabel");
      const target = row.querySelector<HTMLElement>(".treeTargetLabel");
      if (!textWrap || !label) return;
      const depthOffset = node
        ? (() => {
            const cs = window.getComputedStyle(node);
            const marginLeft = parseFloat(cs.marginLeft || "0") || 0;
            const paddingLeft = parseFloat(cs.paddingLeft || "0") || 0;
            const depth = Number(node.dataset.depth || "0") || 0;
            const indentStep = parseFloat(cs.getPropertyValue("--indent-step") || "36") || 36;
            return Math.max(marginLeft, paddingLeft, depth * indentStep);
          })()
        : 0;
      const textRequired = Math.max(label.scrollWidth, target?.scrollWidth || 0);
      const fixedWidth = row.offsetWidth - textWrap.clientWidth;
      maxInnerRequired = Math.max(maxInnerRequired, depthOffset + fixedWidth + textRequired);
    });

    const addButtons = host.querySelectorAll<HTMLElement>(".treeAddBtn, .treeAddChildBtn");
    addButtons.forEach((btn) => {
      if (btn.offsetParent === null) return;
      const text = btn.querySelector<HTMLElement>("span:last-child");
      if (!text) return;
      const node = btn.closest<HTMLElement>(".treeNode");
      const depthOffset = node
        ? (() => {
            const cs = window.getComputedStyle(node);
            const marginLeft = parseFloat(cs.marginLeft || "0") || 0;
            const paddingLeft = parseFloat(cs.paddingLeft || "0") || 0;
            const depth = Number(node.dataset.depth || "0") || 0;
            const indentStep = parseFloat(cs.getPropertyValue("--indent-step") || "36") || 36;
            return Math.max(marginLeft, paddingLeft, depth * indentStep);
          })()
        : 0;
      const fixedWidth = btn.offsetWidth - text.clientWidth;
      maxInnerRequired = Math.max(maxInnerRequired, depthOffset + fixedWidth + text.scrollWidth);
    });

    const unmappedCards = host.querySelectorAll<HTMLElement>(".unmappedCard");
    unmappedCards.forEach((card) => {
      if (card.offsetParent === null) return;
      const label = card.querySelector<HTMLElement>(".unmappedCardLabel");
      if (!label) return;
      const fixedWidth = card.offsetWidth - label.clientWidth;
      maxInnerRequired = Math.max(maxInnerRequired, fixedWidth + label.scrollWidth);
    });

    return Math.min(TREE_PANEL_MAX_WIDTH, Math.max(TREE_PANEL_MIN_WIDTH, Math.ceil(maxInnerRequired + chromeWidth + 8)));
  }

  function measureWorkspaceBaseHeightFromTree() {
    const treeHost = treePanelAutoWidthRef.current;
    if (!treeHost) return 0;
    const treeRoot = treeHost.querySelector<HTMLElement>(".gemTreePanel");
    const toolbar = treeHost.querySelector<HTMLElement>(".treeSearchBar");
    const treeContent = treeHost.querySelector<HTMLElement>(".treeContent");

    let total = 0;
    if (treeRoot) {
      const cs = window.getComputedStyle(treeRoot);
      total +=
        (parseFloat(cs.paddingTop) || 0) +
        (parseFloat(cs.paddingBottom) || 0) +
        (parseFloat(cs.borderTopWidth) || 0) +
        (parseFloat(cs.borderBottomWidth) || 0);
    }
    if (toolbar) {
      const cs = window.getComputedStyle(toolbar);
      total +=
        toolbar.getBoundingClientRect().height +
        (parseFloat(cs.marginTop) || 0) +
        (parseFloat(cs.marginBottom) || 0);
    }
    if (treeContent) {
      const contentRect = treeContent.getBoundingClientRect();
      let deepestBottom = 0;
      const cards = treeHost.querySelectorAll<HTMLElement>(
        ".treeRow, .unmappedCard, .treeAddBtn, .treeAddChildBtn, .treeRenderMore"
      );
      cards.forEach((card) => {
        if (card.offsetParent === null) return;
        const rect = card.getBoundingClientRect();
        const bottomInsideContent = rect.bottom - contentRect.top + treeContent.scrollTop;
        deepestBottom = Math.max(deepestBottom, bottomInsideContent);
      });
      const contentNeeded = Math.ceil(deepestBottom);
      total += contentNeeded;
    } else if (treeRoot) {
      total += treeRoot.scrollHeight;
    }

    return Math.ceil(Math.max(WORKSPACE_MIN_HEIGHT, total + 35));
  }

  useEffect(() => {
    const host = treePanelAutoWidthRef.current;
    if (!host) return;
    let rafId = 0;
    const sync = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const measured = measureWorkspaceBaseHeightFromTree();
        if (measured <= 0) return;
        setWorkspaceBaseHeight((prev) => {
          if (prev !== null && Math.abs(prev - measured) <= 1) return prev;
          return measured;
        });
      });
    };

    sync();
    const resizeObserver = new ResizeObserver(() => sync());
    resizeObserver.observe(host);
    const treeContent = host.querySelector<HTMLElement>(".treeContent");
    if (treeContent) resizeObserver.observe(treeContent);

    const mutationObserver = new MutationObserver(() => sync());
    mutationObserver.observe(host, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const intervalId = window.setInterval(() => {
      if (!workspaceUserResizedRef.current) sync();
    }, 280);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  // Compute the left/right insets + tableWrap top offset for the custom scroll docks.
  useEffect(() => {
    const grid = workspaceGridRef.current;
    if (!grid) return;
    const update = () => {
      const productPanel = grid.querySelector<HTMLElement>(".productPanel");
      const tableWrap = tableWrapRef.current;
      if (!productPanel) return;
      const rect = productPanel.getBoundingClientRect();
      const tableRect = tableWrap ? tableWrap.getBoundingClientRect() : null;
      const nextLeft = Math.round(rect.left);
      const nextRight = Math.round(window.innerWidth - rect.right);
      const nextTableWrapTop = tableRect ? Math.round(tableRect.top) : 0;
      setTableDockInsets((prev) => {
        if (prev.left === nextLeft && prev.right === nextRight && prev.tableWrapTop === nextTableWrapTop) return prev;
        return { left: nextLeft, right: nextRight, startOffset: nextLeft, tableWrapTop: nextTableWrapTop };
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(grid);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [treePanelWidth, treePaneCollapsed]);

  // Sync tableWrap horizontal scroll <-> custom scroll dock bidirectionally.
  useEffect(() => {
    const tableEl = tableWrapRef.current;
    const dockEl = tableScrollDockRef.current;
    const spacerEl = tableScrollSpacerRef.current;
    if (!tableEl || !dockEl || !spacerEl) return;

    const syncSpacerWidth = () => {
      const w = tableEl.scrollWidth;
      if (Math.abs(parseInt(spacerEl.style.width || "0") - w) > 1) {
        spacerEl.style.width = `${w}px`;
      }
    };
    syncSpacerWidth();

    const onTableScroll = () => {
      if (syncingTableScrollRef.current === "dock") return;
      syncingTableScrollRef.current = "table";
      dockEl.scrollLeft = tableEl.scrollLeft;
      syncingTableScrollRef.current = null;
    };

    const onDockScroll = () => {
      if (syncingTableScrollRef.current === "table") return;
      syncingTableScrollRef.current = "dock";
      tableEl.scrollLeft = dockEl.scrollLeft;
      syncingTableScrollRef.current = null;
    };

    tableEl.addEventListener("scroll", onTableScroll, { passive: true });
    dockEl.addEventListener("scroll", onDockScroll, { passive: true });

    const ro = new ResizeObserver(syncSpacerWidth);
    ro.observe(tableEl);

    return () => {
      tableEl.removeEventListener("scroll", onTableScroll);
      dockEl.removeEventListener("scroll", onDockScroll);
      ro.disconnect();
    };
  }, []);

  // Custom vertical scrollbar: sync tableWrap.scrollTop <-> thumb position, support drag.
  useEffect(() => {
    const tableEl = tableWrapRef.current;
    const thumbEl = tableScrollDockVertThumbRef.current;
    if (!tableEl || !thumbEl) return;

    const updateThumb = () => {
      const { scrollTop, scrollHeight, clientHeight } = tableEl;
      if (scrollHeight <= clientHeight) {
        thumbEl.style.display = "none";
        return;
      }
      thumbEl.style.display = "block";
      const trackH = clientHeight;
      const thumbH = Math.max(28, (clientHeight / scrollHeight) * trackH);
      const maxThumbTop = trackH - thumbH;
      const thumbTop = (scrollTop / (scrollHeight - clientHeight)) * maxThumbTop;
      thumbEl.style.height = `${thumbH}px`;
      thumbEl.style.top = `${thumbTop}px`;
    };

    tableEl.addEventListener("scroll", updateThumb, { passive: true });
    const ro = new ResizeObserver(updateThumb);
    ro.observe(tableEl);
    updateThumb();

    let dragActive = false;
    let dragStartY = 0;
    let dragStartScrollTop = 0;

    const onThumbMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      dragActive = true;
      dragStartY = e.clientY;
      dragStartScrollTop = tableEl.scrollTop;
      document.body.style.userSelect = "none";
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragActive) return;
      const { scrollHeight, clientHeight } = tableEl;
      const trackH = clientHeight;
      const thumbH = parseFloat(thumbEl.style.height || "28");
      const ratio = (scrollHeight - clientHeight) / (trackH - thumbH);
      tableEl.scrollTop = dragStartScrollTop + (e.clientY - dragStartY) * ratio;
    };
    const onMouseUp = () => {
      dragActive = false;
      document.body.style.userSelect = "";
    };

    thumbEl.addEventListener("mousedown", onThumbMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      tableEl.removeEventListener("scroll", updateThumb);
      ro.disconnect();
      thumbEl.removeEventListener("mousedown", onThumbMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (resizingPanes) return;
    const host = treePanelAutoWidthRef.current;
    if (!host) return;
    const raf = window.requestAnimationFrame(() => {
      const measuredMin = measureTreePanelMinWidth(host);
      setTreePanelMinWidth((prev) => (prev === TREE_PANEL_MIN_WIDTH ? prev : TREE_PANEL_MIN_WIDTH));
      setTreePanelWidth((prev) => {
        const clampedPrev = Math.min(TREE_PANEL_MAX_WIDTH, prev);
        if (!treePaneUserResizedRef.current) {
          return TREE_PANEL_DEFAULT_WIDTH;
        }
        return Math.max(TREE_PANEL_MIN_WIDTH, clampedPrev);
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [nodes, orderedUnmappedCollections, expandedNodes, treeSearch, resizingPanes]);

  async function moveMenuNode(nodeKey: string, nextDropTarget: MoveDropTarget) {
    if (!nodeKey || !nextDropTarget) return;
    setError("");
    const beforeNodes = cloneNodes(nodes);
    const afterNodes = moveLocalNode(cloneNodes(nodes), nodeKey, nextDropTarget.targetKey, nextDropTarget.position);
    const movedLabel = nodeByKey.get(nodeKey)?.label || "Menu item";
    const targetLabel = nodeByKey.get(nextDropTarget.targetKey)?.label || "Menu item";
    const placementText =
      nextDropTarget.position === "inside"
        ? `inside "${targetLabel}"`
        : nextDropTarget.position === "before"
          ? `above "${targetLabel}"`
          : `below "${targetLabel}"`;
    setNodes(afterNodes);
    setPendingTreeOps((prev) => [
      ...prev,
      {
        type: "move",
        nodeKey,
        targetKey: nextDropTarget.targetKey,
        position: nextDropTarget.position,
      },
    ]);
    appendUndoEntry({
      actionType: "move",
      title: `Moved "${movedLabel}"`,
      details: [`Placed ${placementText}.`],
      beforeNodes,
      afterNodes: cloneNodes(afterNodes),
    });
    markTreeDirty();
  }

  async function saveMenuTreeSection() {
    const currentMenuHandle = menuMeta.handle || "main-menu";
    if (pendingTreeOps.length < 1) {
      setWarning("No pending tree changes to save.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // #region agent log
      debugIngest({
          sessionId: "9da838",
          runId: "label-save-debug",
          hypothesisId: "H3",
          location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
          message: "save_pending_ops_probe",
          data: {
            count: pendingTreeOps.length,
            types: pendingTreeOps.map((op) => op.type),
          },
          timestamp: Date.now(),
        });
      // #endregion
      const tempKeyMap = new Map<string, string>();
      const visibilityBatch = new Map<string, boolean>();
      const resolveNodeKey = (raw: string | null) => {
        if (!raw) return null;
        let out = raw;
        const seen = new Set<string>();
        while (tempKeyMap.has(out) && !seen.has(out)) {
          seen.add(out);
          out = tempKeyMap.get(out) || out;
        }
        return out;
      };
      let latestJson: MappingResponse | null = null;
      // Save visibility first so it is not blocked by later move/add errors.
      for (const op of pendingTreeOps) {
        if (op.type !== "visibility") continue;
        const resolvedNodeKey = resolveNodeKey(op.nodeKey);
        if (!resolvedNodeKey) continue;
        visibilityBatch.set(resolvedNodeKey, op.enabled);
      }
      if (visibilityBatch.size > 0) {
        const payload: Record<string, unknown> = {
          action: "set-node-mapping-live-batch",
          menuHandle: currentMenuHandle,
          updates: Array.from(visibilityBatch.entries()).map(([nodeKey, enabled]) => ({ nodeKey, enabled })),
        };
        // #region agent log
        debugIngest({
            sessionId: "9da838",
            runId: "visibility-and-depth-debug",
            hypothesisId: "H6",
            location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
            message: "visibility_batch_payload_probe",
            data: {
              count: visibilityBatch.size,
              order: "before-other-ops",
            },
            timestamp: Date.now(),
          });
        // #endregion
        const resp = await fetch("/api/collection-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withShopContext(payload)),
        });
        const json = await readJsonResponse<MappingResponse>(resp);
        // #region agent log
        debugIngest({
            sessionId: "9da838",
            runId: "visibility-and-depth-debug",
            hypothesisId: "H6",
            location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
            message: "visibility_batch_response_probe",
            data: {
              httpOk: resp.ok,
              status: resp.status,
              jsonOk: Boolean(json.ok),
              error: String(json.error || ""),
              warning: String(json.warning || ""),
            },
            timestamp: Date.now(),
          });
        // #endregion
        if (!resp.ok || !json.ok) {
          throw new Error(json.error || "Save visibility failed.");
        }
        latestJson = json;
      }
      for (const op of pendingTreeOps) {
        if (op.type === "visibility") continue;
        let payload: Record<string, unknown> | null = null;
        if (op.type === "add") {
          payload = {
            action: "add-menu-node",
            menuHandle: currentMenuHandle,
            parentKey: resolveNodeKey(op.parentKey),
            label: op.label,
            linkType: op.linkType,
            linkTargetId: op.linkTargetId,
            linkValue: op.linkValue,
          };
        } else if (op.type === "edit") {
          const resolvedNodeKey = resolveNodeKey(op.nodeKey);
          if (!resolvedNodeKey) continue;
          // #region agent log
          debugIngest({
              sessionId: "9da838",
              runId: "label-save-debug",
              hypothesisId: "H3",
              location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
              message: "save_edit_op_probe",
              data: {
                nodeKey: resolvedNodeKey,
                label: op.label,
                linkType: op.linkType,
                linkTargetId: op.linkTargetId,
                linkValue: op.linkValue,
              },
              timestamp: Date.now(),
            });
          // #endregion
          payload = {
            action: "edit-menu-node",
            menuHandle: currentMenuHandle,
            nodeKey: resolvedNodeKey,
            label: op.label,
            linkType: op.linkType,
            linkTargetId: op.linkTargetId,
            linkValue: op.linkValue,
          };
        } else if (op.type === "move") {
          const resolvedNodeKey = resolveNodeKey(op.nodeKey);
          const resolvedTargetKey = resolveNodeKey(op.targetKey);
          if (!resolvedNodeKey || !resolvedTargetKey) continue;
          payload = {
            action: "move-menu-node",
            menuHandle: currentMenuHandle,
            nodeKey: resolvedNodeKey,
            targetKey: resolvedTargetKey,
            position: op.position,
          };
        } else if (op.type === "delete") {
          const resolvedNodeKey = resolveNodeKey(op.nodeKey);
          if (!resolvedNodeKey) continue;
          payload = {
            action: "delete-menu-node",
            menuHandle: currentMenuHandle,
            nodeKey: resolvedNodeKey,
          };
        }
        if (!payload) continue;
        // #region agent log
        debugIngest({
            sessionId: "9da838",
            runId: "visibility-and-depth-debug",
            hypothesisId: "H5",
            location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
            message: "save_op_payload_probe",
            data: {
              opType: op.type,
              action: String(payload.action || ""),
              nodeKey: String((payload.nodeKey as string) || ""),
              parentKey: String((payload.parentKey as string) || ""),
              enabled: typeof payload.enabled === "boolean" ? payload.enabled : null,
              syncMenuLink: payload.syncMenuLink === undefined ? null : Boolean(payload.syncMenuLink),
              label: String((payload.label as string) || ""),
            },
            timestamp: Date.now(),
          });
        // #endregion
        const resp = await fetch("/api/collection-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withShopContext(payload)),
        });
        const json = await readJsonResponse<MappingResponse & { createdNodeKey?: string }>(resp);
        // #region agent log
        debugIngest({
            sessionId: "9da838",
            runId: "visibility-and-depth-debug",
            hypothesisId: "H5",
            location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
            message: "save_op_response_probe",
            data: {
              opType: op.type,
              action: String(payload.action || ""),
              httpOk: resp.ok,
              status: resp.status,
              jsonOk: Boolean(json.ok),
              error: String(json.error || ""),
              warning: String(json.warning || ""),
              createdNodeKey: String(json.createdNodeKey || ""),
            },
            timestamp: Date.now(),
          });
        // #endregion
        if (op.type === "edit") {
          // #region agent log
          debugIngest({
              sessionId: "9da838",
              runId: "label-save-debug",
              hypothesisId: "H3",
              location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
              message: "save_edit_response_probe",
              data: {
                httpOk: resp.ok,
                jsonOk: Boolean(json.ok),
                warning: String(json.warning || ""),
                nodesCount: Array.isArray(json.nodes) ? json.nodes.length : -1,
              },
              timestamp: Date.now(),
            });
          // #endregion
        }
        if (!resp.ok || !json.ok) {
          const errorText = String(json.error || "Save menu failed.");
          const lowerError = errorText.toLowerCase();
          const isMoveDepthLimitError =
            op.type === "move" &&
            (lowerError.includes("more than 3 levels of nesting") ||
              lowerError.includes("up to 3 levels of nesting"));
          if (isMoveDepthLimitError) {
            // #region agent log
            debugIngest({
                sessionId: "9da838",
                runId: "visibility-and-depth-debug",
                hypothesisId: "H7",
                location: "components/shopify-collection-mapping.tsx:saveMenuTreeSection",
                message: "move_depth_skip_probe",
                data: {
                  nodeKey: String((payload.nodeKey as string) || ""),
                  targetKey: String((payload.targetKey as string) || ""),
                  position: String((payload.position as string) || ""),
                  error: errorText,
                },
                timestamp: Date.now(),
              });
            // #endregion
            continue;
          }
          throw new Error(errorText);
        }
        if (op.type === "add" && json.createdNodeKey) {
          tempKeyMap.set(op.tempNodeKey, json.createdNodeKey);
        }
        latestJson = json;
      }
      if (latestJson && Array.isArray(latestJson.nodes)) {
        applyMenuNodesFromResponse(latestJson);
      }
      collapseTreeToDefault(Array.isArray(latestJson?.nodes) ? latestJson.nodes : undefined);
      setPendingTreeOps([]);
      setWarning("Menu saved to Shopify.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save menu failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function applyMenuNodesFromResponse(json: MappingResponse) {
    const nextNodes = json.nodes || [];
    setNodes(nextNodes);
    setLastSyncedNodes(cloneNodes(nextNodes));
    setWarning(String(json.warning || "").trim());
    setSelectedNodes((prev) => {
      const out: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        if (prev[key] && nextNodes.some((node) => node.nodeKey === key)) out[key] = true;
      }
      return out;
    });
  }

  function openAddEditor(parentKey: string | null) {
    setMenuEditorMode("add");
    setMenuEditorLabel("");
    setMenuEditorLinkType("COLLECTION");
    setMenuEditorLinkTargetId("");
    setMenuEditorLinkQuery("");
    setMenuEditorComboboxOpen(true);
    setMenuEditorParentKey(parentKey);
    setMenuEditorNodeKey("");
    setShowMenuEditor(true);
    void loadMenuEditorAssets("COLLECTION", { force: true });
  }

  function openEditEditor(node: MenuNode) {
    const nextLinkType = normalizeMenuEditorLinkType(node.linkedTargetType || "");
    setMenuEditorMode("edit");
    setMenuEditorLabel(node.label);
    setMenuEditorLinkType(nextLinkType);
    setMenuEditorLinkTargetId(String(node.linkedTargetResourceId || "").trim());
    setMenuEditorLinkQuery(node.linkedTargetLabel || node.label);
    setMenuEditorComboboxOpen(true);
    setMenuEditorParentKey(node.parentKey || null);
    setMenuEditorNodeKey(node.nodeKey);
    setShowMenuEditor(true);
    void loadMenuEditorAssets(nextLinkType, { force: true });
  }

  function toggleNodeExpansion(nodeKey: string) {
    // Expand/collapse must toggle true/false from current value.
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: !Boolean(prev[nodeKey]),
    }));
  }

  function toggleRowSelectionFromRowClick(rowId: string) {
    const isSelected = Boolean(selectedProducts[rowId]);
    setSelectedProducts((prev) => ({
      ...prev,
      [rowId]: !isSelected,
    }));
    if (isSelected) {
      if (activeRowId === rowId) setActiveRowId("");
      return;
    }
    setActiveRowId(rowId);
  }

  function collapseAllTreeCards() {
    // Collapse all drawers and restore tree container to the default visible frame.
    setExpandedNodes({});
    setTreePaneCollapsed(false);
    setTreePanelWidth(TREE_PANEL_DEFAULT_WIDTH);
    treePaneUserResizedRef.current = false;
  }

  function toggleNodeVisibility(nodeKey: string) {
    const target = nodeByKey.get(nodeKey);
    if (!target) return;
    const nextEnabled = !target.enabled;
    const subtree = new Set<string>();
    const stack = [nodeKey];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || subtree.has(current)) continue;
      subtree.add(current);
      const children = childrenByParent.get(current) || [];
      for (const childKey of children) stack.push(childKey);
    }
    // #region agent log
    debugIngest({
        sessionId: "9da838",
        runId: "visibility-and-depth-debug",
        hypothesisId: "H3",
        location: "components/shopify-collection-mapping.tsx:toggleNodeVisibility",
        message: "visibility_subtree_probe",
        data: {
          nodeKey,
          nodeDepth: Number(target.depth || 0),
          isTopLevelParent: Number(target.depth || 0) <= 0,
          subtreeSize: subtree.size,
          enabledBefore: Boolean(target.enabled),
          enabledAfter: nextEnabled,
        },
        timestamp: Date.now(),
      });
    // #endregion
    const beforeNodes = cloneNodes(nodes);
    const afterNodes = cloneNodes(nodes).map((node) =>
      subtree.has(node.nodeKey) ? { ...node, enabled: nextEnabled } : node
    );
    setNodes(afterNodes);
    setPendingTreeOps((prev) => {
      const filtered = prev.filter((op) => !(op.type === "visibility" && subtree.has(op.nodeKey)));
      const visibilityOps: PendingTreeOp[] = Array.from(subtree).map((key) => ({
        type: "visibility",
        nodeKey: key,
        enabled: nextEnabled,
      }));
      return [...filtered, ...visibilityOps];
    });
    appendUndoEntry({
      actionType: "visibility",
      title: `${nextEnabled ? "Showed" : "Hid"} "${target.label}"`,
      details: [
        subtree.size > 1
          ? `Also updated ${subtree.size - 1} nested item(s).`
          : "Updated this item only.",
      ],
      beforeNodes,
      afterNodes: cloneNodes(afterNodes),
    });
    markTreeDirty();
  }

  function expandTreeForSearchResults(query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return;
    const matches = treeNodes.filter((node) => matchesMenuSearch(node, normalizedQuery));
    if (matches.length < 1) return;
    setExpandedNodes((prev) => {
      const next = { ...prev };
      for (const match of matches) {
        let current = match.parentKey || null;
        const seen = new Set<string>();
        while (current && !seen.has(current)) {
          next[current] = true;
          seen.add(current);
          current = parentMap.get(current) || null;
        }
      }
      return next;
    });
  }

  async function saveMenuEditor() {
    const label = menuEditorLabel.trim();
    const linkTargetId = menuEditorLinkTargetId.trim();
    if (!label || !linkTargetId) return;
    setError("");
    const linkOption = getLinkOption(menuEditorLinkType, linkTargetId);
    const linkValue = String(menuEditorLinkQuery || linkOption?.title || label).trim();
    const beforeNodes = cloneNodes(nodes);
    if (menuEditorMode === "add") {
      const tempNodeKey = nextTempNodeKey();
      const parentDepth =
        menuEditorParentKey && nodeByKey.has(menuEditorParentKey)
          ? Number(nodeByKey.get(menuEditorParentKey)?.depth || 0)
          : -1;
      const nextNode: MenuNode = {
        nodeKey: tempNodeKey,
        label,
        parentKey: menuEditorParentKey,
        depth: parentDepth + 1,
        enabled: true,
        collectionId: menuEditorLinkType === "COLLECTION" ? linkTargetId : null,
        linkedTargetType: menuEditorLinkType,
        linkedTargetLabel: linkOption?.title || linkValue,
        linkedTargetResourceId: linkTargetId || null,
        linkedTargetUrl: linkOption?.url || "",
      };
      const afterNodes = [...cloneNodes(nodes), nextNode];
      setNodes(afterNodes);
      setPendingTreeOps((prev) => [
        ...prev,
        {
          type: "add",
          tempNodeKey,
          parentKey: menuEditorParentKey,
          label,
          linkType: menuEditorLinkType,
          linkTargetId: linkTargetId || null,
          linkValue,
        },
      ]);
      appendUndoEntry({
        actionType: "add",
        title: `Added "${label}"`,
        details: [
          menuEditorParentKey
            ? `Added under "${nodeByKey.get(menuEditorParentKey)?.label || "parent item"}".`
            : "Added at the top level.",
          `Link kind: ${menuEditorLinkType.toLowerCase()}.`,
        ],
        beforeNodes,
        afterNodes: cloneNodes(afterNodes),
      });
    } else {
      const afterNodes = cloneNodes(nodes).map((row) =>
        row.nodeKey === menuEditorNodeKey
          ? {
              ...row,
              label,
              collectionId: menuEditorLinkType === "COLLECTION" ? linkTargetId : null,
              linkedTargetType: menuEditorLinkType,
              linkedTargetLabel: linkOption?.title || linkValue,
              linkedTargetResourceId: linkTargetId || null,
              linkedTargetUrl: linkOption?.url || row.linkedTargetUrl || "",
            }
          : row
      );
      setNodes(afterNodes);
      setPendingTreeOps((prev) => [
        ...prev,
        {
          type: "edit",
          nodeKey: menuEditorNodeKey,
          label,
          linkType: menuEditorLinkType,
          linkTargetId: linkTargetId || null,
          linkValue,
        },
      ]);
      appendUndoEntry({
        actionType: "edit",
        title: `Updated "${label}"`,
        details: [`Updated name or link.`, `Link kind: ${menuEditorLinkType.toLowerCase()}.`],
        beforeNodes,
        afterNodes: cloneNodes(afterNodes),
      });
    }
    markTreeDirty();
    setShowMenuEditor(false);
  }

  async function deleteMenuNode(nodeKey: string) {
    setError("");
    const deletedLabel = nodeByKey.get(nodeKey)?.label || "Menu item";
    const beforeNodes = cloneNodes(nodes);
    const afterNodes = removeLocalNodeAndChildren(cloneNodes(nodes), nodeKey);
    setNodes(afterNodes);
    setPendingTreeOps((prev) => [...prev, { type: "delete", nodeKey }]);
    appendUndoEntry({
      actionType: "delete",
      title: `Deleted "${deletedLabel}"`,
      details: ["This also removed nested items."],
      beforeNodes,
      afterNodes: cloneNodes(afterNodes),
    });
    markTreeDirty();
  }

  async function inlineEditMenuNode(
    node: MenuNode,
    next: { label: string; linkValue: string; linkType?: MenuLinkType; linkTargetId?: string | null; linkTargetLabel?: string }
  ) {
    const label = String(next.label || "").trim();
    const linkValue = String(next.linkValue || "").trim();
    if (!node.nodeKey || !label || !linkValue) return;
    // #region agent log
    debugIngest({
        sessionId: "9da838",
        runId: "label-save-debug",
        hypothesisId: "H2",
        location: "components/shopify-collection-mapping.tsx:inlineEditMenuNode",
        message: "inline_edit_enqueue_probe",
        data: {
          nodeKey: node.nodeKey,
          label,
          linkValue,
          linkType: next.linkType || node.linkedTargetType || "COLLECTION",
          explicitTargetId: String(next.linkTargetId || "").trim(),
        },
        timestamp: Date.now(),
      });
    // #endregion
    setError("");
    const linkType = normalizeMenuEditorLinkType(next.linkType || node.linkedTargetType || "COLLECTION");
    const priorTargetLabel = String(node.linkedTargetLabel || "").trim().toLowerCase();
    const nextTargetLabel = linkValue.toLowerCase();
    const keepTargetId = priorTargetLabel === nextTargetLabel;
    const existingTargetId = String(node.linkedTargetResourceId || "").trim();
    const explicitTargetId = String(next.linkTargetId || "").trim();
    const linkTargetId = explicitTargetId || (keepTargetId ? existingTargetId || null : null);
    const linkedTargetLabel = String(next.linkTargetLabel || linkValue).trim() || linkValue;
    const beforeNodes = cloneNodes(nodes);
    const afterNodes = cloneNodes(nodes).map((row) =>
      row.nodeKey === node.nodeKey
        ? {
            ...row,
            label,
            linkedTargetType: linkType,
            linkedTargetLabel,
            linkedTargetResourceId: linkTargetId,
          }
        : row
    );
    setNodes(afterNodes);
    setPendingTreeOps((prev) => [
      ...prev,
      {
        type: "edit",
        nodeKey: node.nodeKey,
        label,
        linkType,
        linkTargetId,
        linkValue: linkedTargetLabel,
      },
    ]);
    appendUndoEntry({
      actionType: "edit",
      title: `Updated "${label}"`,
      details: ["Updated name or link.", `Link kind: ${linkType.toLowerCase()}.`],
      beforeNodes,
      afterNodes: cloneNodes(afterNodes),
    });
    markTreeDirty();
  }

  async function toggleAssign(productId: string, checked: boolean) {
    if (!hasSelectedAssignTargets) return;
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withShopContext({
          action: "toggle-nodes",
          productId,
          nodeKeys: mappedSelectedNodeKeys,
          directCollectionIds: selectedDirectCollectionIds,
          checked,
        })),
      });
      const json = await readJsonResponse<ToggleResponse>(resp);
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Assign/unassign failed.");
      }
      if (json.warning) {
        setWarning(String(json.warning));
      }
      if (json.product?.id) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === json.product!.id
              ? {
                  ...row,
                  checkedNodeKeys: Array.isArray(json.product?.checkedNodeKeys)
                    ? json.product!.checkedNodeKeys
                    : row.checkedNodeKeys,
                }
              : row
          )
        );
      }
      resetTreeSelectionToDefault();
      setSelectedProducts({});
      await loadData({ refreshProducts: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Assign/unassign failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function bulkAssign(checked: boolean) {
    if (!hasSelectedAssignTargets) return;
    const ids = Object.keys(selectedProducts).filter((key) => Boolean(selectedProducts[key]));
    if (ids.length < 1) return;
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withShopContext({
          action: "bulk-toggle-nodes",
          productIds: ids,
          nodeKeys: mappedSelectedNodeKeys,
          directCollectionIds: selectedDirectCollectionIds,
          checked,
        })),
      });
      const json = await readJsonResponse<ToggleResponse>(resp);
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Bulk assign/unassign failed.");
      }
      const products = Array.isArray(json.products) ? json.products : [];
      if (products.length > 0) {
        const byId = new Map(products.map((row) => [row.id, row.checkedNodeKeys]));
        setRows((prev) =>
          prev.map((row) => {
            const nextKeys = byId.get(row.id);
            return nextKeys ? { ...row, checkedNodeKeys: nextKeys } : row;
          })
        );
      }
      resetTreeSelectionToDefault();
      setSelectedProducts({});
      await loadData({ refreshProducts: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk assign/unassign failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  function getToolbarTargetProductIds() {
    const selectedIds = Object.keys(selectedProducts).filter((key) => Boolean(selectedProducts[key]));
    if (selectedIds.length > 0) return selectedIds;
    if (activeRowId) return [activeRowId];
    return [];
  }

  function plannerSummaryFromRows(rowsToPlan: PushPlannerRow[]): PushPlanSummary {
    const statusCounts: Record<PlannerStatus, number> = {
      readyToPush: 0,
      noChange: 0,
      skippedReview: 0,
      skippedMissingData: 0,
      failedPlanning: 0,
    };
    let eligibleRows = 0;
    let addRows = 0;
    let removalRows = 0;
    let totalAdditions = 0;
    let totalRemovals = 0;
    for (const row of rowsToPlan) {
      statusCounts[row.plannerStatus] += 1;
      if (row.plannerStatus === "readyToPush") {
        eligibleRows += 1;
        if (row.collectionsToAdd.length > 0) addRows += 1;
        if (row.collectionsToRemove.length > 0) removalRows += 1;
        totalAdditions += row.collectionsToAdd.length;
        totalRemovals += row.collectionsToRemove.length;
      }
    }
    return {
      totalRows: rowsToPlan.length,
      eligibleRows,
      skippedRows: rowsToPlan.length - eligibleRows,
      addRows,
      removalRows,
      totalAdditions,
      totalRemovals,
      statusCounts,
    };
  }

  function openPushPreview(actionKind: PushActionKind, targetIds: string[]) {
    const normalizedTargetIds = Array.from(new Set(targetIds.filter((id) => rowById.has(id))));
    if (normalizedTargetIds.length < 1) {
      setWarning("No target rows available for planning.");
      return;
    }
    let rowsToPlan = normalizedTargetIds
      .map((id) => plannerRowsById.get(id))
      .filter((row): row is PushPlannerRow => Boolean(row));
    if (actionKind === "remove-all-collections") {
      rowsToPlan = rowsToPlan.map((row) => {
        if (row.plannerStatus !== "readyToPush" && row.plannerStatus !== "noChange") return row;
        const nextRemovals = [...row.currentCollections];
        const noOp = nextRemovals.length < 1;
        return {
          ...row,
          finalCollections: [],
          collectionsToAdd: [],
          collectionsToRemove: nextRemovals,
          noOp,
          plannerStatus: noOp ? "noChange" : "readyToPush",
          skippedReason: noOp ? "No collections to remove." : "",
        };
      });
    }
    const summary = plannerSummaryFromRows(rowsToPlan);
    setRemoveAllConfirmText("");
    setPushPreviewModal({
      open: true,
      actionKind,
      targetIds: normalizedTargetIds,
      summary,
      rows: rowsToPlan,
    });
  }

  function applySuggestionsForTargets() {
    const ids = getToolbarTargetProductIds();
    if (ids.length < 1) {
      setWarning("Select at least one row (or an active row) before applying suggestions.");
      return;
    }
    setSelectedSuggestionPathsByRow((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const staging = rowStagingById.get(id);
        if (!staging) continue;
        const current = { ...(next[id] || {}) };
        for (const option of staging.suggestionOptions) {
          if (option.disabled || option.kind !== "menu") continue;
          current[option.value] = true;
        }
        next[id] = current;
      }
      return next;
    });
    setSelectedSuggestionCollectionsByRow((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const staging = rowStagingById.get(id);
        if (!staging) continue;
        const current = { ...(next[id] || {}) };
        for (const option of staging.suggestionOptions) {
          if (option.disabled || option.kind !== "collection") continue;
          current[option.value] = true;
        }
        next[id] = current;
      }
      return next;
    });
    setWarning(`Applied available suggestions for ${ids.length} row(s).`);
  }

  function clearStagedChangesForTargets() {
    const ids = getToolbarTargetProductIds();
    if (ids.length < 1) {
      setWarning("Select at least one row (or an active row) before clearing staged changes.");
      return;
    }
    const clearByIds = (state: Record<string, Record<string, boolean>>) => {
      const next = { ...state };
      for (const id of ids) delete next[id];
      return next;
    };
    setSelectedSuggestionPathsByRow((prev) => clearByIds(prev));
    setSelectedSuggestionCollectionsByRow((prev) => clearByIds(prev));
    setManualAddedPathsByRow((prev) => clearByIds(prev));
    setManualRemovedPathsByRow((prev) => clearByIds(prev));
    setWarning(`Cleared staged changes for ${ids.length} row(s).`);
  }

  function pushSelectedScaffold() {
    const ids = Object.keys(selectedProducts).filter((key) => Boolean(selectedProducts[key]));
    if (ids.length < 1) {
      setWarning("Select products to push staged changes.");
      return;
    }
    openPushPreview("push-selected", ids);
  }

  function pushAllFinalChangesScaffold() {
    openPushPreview("push-all-final", rows.map((row) => row.id));
  }

  function removeAllCollectionsScaffold() {
    const ids = Object.keys(selectedProducts).filter((key) => Boolean(selectedProducts[key]));
    if (ids.length < 1) {
      setWarning("Select products before removing assignments.");
      return;
    }
    openPushPreview("remove-all-collections", ids);
  }

  function downloadCsvFile(filename: string, lines: string[]) {
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportPushSummaryReport() {
    const rowsToPlan = rows.map((row) => plannerRowsById.get(row.id)).filter((row): row is PushPlannerRow => Boolean(row));
    const summary = plannerSummaryFromRows(rowsToPlan);
    const lines = [
      "report,value",
      `total_rows,${summary.totalRows}`,
      `eligible_rows,${summary.eligibleRows}`,
      `skipped_rows,${summary.skippedRows}`,
      `add_rows,${summary.addRows}`,
      `removal_rows,${summary.removalRows}`,
      `total_additions,${summary.totalAdditions}`,
      `total_removals,${summary.totalRemovals}`,
    ];
    downloadCsvFile(`push-summary-${new Date().toISOString().slice(0, 10)}.csv`, lines);
  }

  function exportPushFailureReport() {
    const lines = ["title,status,reason"];
    for (const row of plannerRowsById.values()) {
      if (row.plannerStatus !== "failedPlanning") continue;
      lines.push(`"${row.title.replace(/"/g, '""')}",${row.plannerStatus},"${row.skippedReason.replace(/"/g, '""')}"`);
    }
    if (lines.length < 2) lines.push('"No failed planning rows",failedPlanning,"-"');
    downloadCsvFile(`push-failure-${new Date().toISOString().slice(0, 10)}.csv`, lines);
  }

  function exportSkippedReviewReport() {
    const lines = ["title,status,reason"];
    for (const row of plannerRowsById.values()) {
      if (row.plannerStatus !== "skippedReview") continue;
      lines.push(`"${row.title.replace(/"/g, '""')}",${row.plannerStatus},"${row.skippedReason.replace(/"/g, '""')}"`);
    }
    if (lines.length < 2) lines.push('"No skipped review rows",skippedReview,"-"');
    downloadCsvFile(`skipped-review-${new Date().toISOString().slice(0, 10)}.csv`, lines);
  }

  function exportCollectionDeltaReport() {
    const lines = ["title,status,adds,removals"];
    for (const row of plannerRowsById.values()) {
      const adds = row.collectionsToAdd.join(" | ");
      const removals = row.collectionsToRemove.join(" | ");
      lines.push(
        `"${row.title.replace(/"/g, '""')}",${row.plannerStatus},"${adds.replace(/"/g, '""')}","${removals.replace(/"/g, '""')}"`
      );
    }
    downloadCsvFile(`collection-delta-${new Date().toISOString().slice(0, 10)}.csv`, lines);
  }

  function executePushPreviewScaffold() {
    if (!pushPreviewModal) return;
    if (pushPreviewModal.actionKind === "remove-all-collections" && removeAllConfirmText.trim() !== "REMOVE ALL") {
      setError('Type "REMOVE ALL" to confirm destructive removal.');
      return;
    }
    setExecutionBusy(true);
    const queuedRows = pushPreviewModal.rows.filter((row) => row.plannerStatus === "readyToPush");
    const skippedRows = pushPreviewModal.rows.filter((row) => row.plannerStatus !== "readyToPush");
    const startedAt = Date.now();
    const jobId = `job-${startedAt}`;
    const typeMap: Record<PushActionKind, QueueJobType> = {
      "push-selected": "push_manual_changes",
      "push-all-final": "push_all_final_changes",
      "remove-all-collections": "remove_all_collections",
    };
    const jobType = typeMap[pushPreviewModal.actionKind];
    setQueueJobs((prev) => [
      {
        id: jobId,
        type: jobType,
        state: "queued",
        startedAt,
        finishedAt: 0,
        totalRows: pushPreviewModal.rows.length,
        completedRows: 0,
        failedRows: 0,
        skippedRows: skippedRows.length,
        note: `Dry-run scaffold: ${queuedRows.length} eligible, ${skippedRows.length} skipped.`,
      },
      ...prev,
    ]);
    window.setTimeout(() => {
      setQueueJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                state: "running",
                completedRows: Math.max(0, queuedRows.length - 1),
              }
            : job
        )
      );
      window.setTimeout(() => {
        setQueueJobs((prev) =>
          prev.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  state: "completed",
                  completedRows: queuedRows.length,
                  finishedAt: Date.now(),
                }
              : job
          )
        );
        setExecutionBusy(false);
      }, 700);
    }, 300);
    setWarning(
      `${pushPreviewModal.actionKind} execution scaffold queued (${queuedRows.length} eligible / ${skippedRows.length} skipped).`
    );
    setPushPreviewModal(null);
  }

  function toggleSuggestionSelection(rowId: string, kind: "menu" | "collection", value: string, disabled: boolean) {
    if (disabled) return;
    if (kind === "collection") {
      const normalizedHandle = String(value || "").trim().toLowerCase();
      if (!normalizedHandle) return;
      setSelectedSuggestionCollectionsByRow((prev) => {
        const current = { ...(prev[rowId] || {}) };
        current[normalizedHandle] = !current[normalizedHandle];
        return { ...prev, [rowId]: current };
      });
      return;
    }
    const normalizedPath = normalizeMenuPath(value);
    if (!normalizedPath) return;
    setSelectedSuggestionPathsByRow((prev) => {
      const current = { ...(prev[rowId] || {}) };
      current[normalizedPath] = !current[normalizedPath];
      return { ...prev, [rowId]: current };
    });
    setManualRemovedPathsByRow((prev) => {
      const current = { ...(prev[rowId] || {}) };
      delete current[normalizedPath];
      return { ...prev, [rowId]: current };
    });
  }

  async function applyGenderMismatchCorrection(
    row: ProductRow,
    staging: RowStagingState,
    expectedTopGender: "MEN" | "WOMEN",
    wrongTopGender: "MEN" | "WOMEN"
  ) {
    const wrongBranchPaths = dedupeNormalizedPaths(
      (staging.finalMenuPaths || []).filter((path) => isPathUnderTopGender(path, wrongTopGender))
    );
    const reMappedExpectedPaths = dedupeNormalizedPaths(
      (row.autoMappedPaths || []).filter((path) => isPathUnderTopGender(path, expectedTopGender))
    );
    if (wrongBranchPaths.length < 1 && reMappedExpectedPaths.length < 1) return;

    setManualRemovedPathsByRow((prev) => {
      const next = { ...(prev[row.id] || {}) };
      for (const path of wrongBranchPaths) next[path] = true;
      return { ...prev, [row.id]: next };
    });
    setManualAddedPathsByRow((prev) => {
      const next = { ...(prev[row.id] || {}) };
      for (const path of wrongBranchPaths) {
        delete next[path];
      }
      for (const path of reMappedExpectedPaths) {
        if (!next[path]) next[path] = true;
      }
      return { ...prev, [row.id]: next };
    });
    setSelectedSuggestionPathsByRow((prev) => {
      const next = { ...(prev[row.id] || {}) };
      for (const path of Object.keys(next)) {
        if (isPathUnderTopGender(path, wrongTopGender)) delete next[path];
      }
      return { ...prev, [row.id]: next };
    });

    setWarning(
      `Applied gender correction (${expectedTopGender}). Removed wrong ${wrongTopGender} branch and refreshed product mapping from Shopify rules.`
    );
    await loadData({ refreshProducts: true });
  }

  function openMappingDecisionExplanation(row: ProductRow, staging: RowStagingState) {
    const mappingDecision = staging?.mappingDecision || row.mappingDecision || "MANUAL_REVIEW";
    const collectionSyncStatus = staging?.collectionSyncStatus || "REVIEW";
    const workflow =
      rowWorkflowById.get(row.id) ||
      classifyShopifyCollectionMappingRow({
        mappingDecision,
        collectionSyncStatus,
        actionStatus: row.actionStatus || "",
        suggestionReady: (staging?.suggestionOptions || []).some((option) => !option.disabled),
        manualChanges:
          (staging?.selectedSuggestionPaths.length || 0) +
            (staging?.selectedSuggestionDirectCollections.length || 0) +
            (staging?.manualAddedPaths.length || 0) +
            (staging?.manualRemovedPaths.length || 0) >
          0,
        isReviewed: Boolean(staging?.isReviewed ?? row.isReviewed),
        currentMatchesFinal: staging?.currentMatchesFinal,
      });
    setMappingExplainModal({
      open: true,
      rowId: row.id,
      title: row.title,
      image: String(row.image || ""),
      itemType: String(row.itemType || "-"),
      upc: String(row.upc || "-"),
      mappingDecision,
      collectionSyncStatus,
      actionStatus: row.actionStatus || "",
      currentMenuPaths: dedupeNormalizedPaths(row.checkedNodeKeys.map((key) => nodePathByKey.get(key) || "").filter(Boolean)),
      autoMappedPaths: staging?.autoMappedPaths || row.autoMappedPaths || [],
      suggestedMenuPaths: staging?.suggestionOptions?.filter((option) => option.kind === "menu").map((option) => option.value) || row.suggestedPaths || [],
      suggestedDirectCollections:
        staging?.suggestionOptions?.filter((option) => option.kind === "collection").map((option) => option.value) ||
        row.suggestedDirectCollections ||
        [],
      directCollections: staging?.finalDirectCollections || [],
      finalMenuPaths: staging?.finalMenuPaths || [],
      finalDirectCollections: staging?.finalDirectCollections || [],
      autoMapFailureCode: String(row.autoMapFailureCode || ""),
      autoMapFailureReason: String(row.autoMapFailureReason || ""),
      autoMapFailureDetails: Array.isArray(row.autoMapFailureDetails) ? row.autoMapFailureDetails : [],
      statusLabel: workflow.statusLabel,
      statusBadgeTone: workflow.statusBadgeTone,
      suggestionReady: workflow.suggestionReady,
      manualChanges: workflow.manualChanges,
      isReviewed: workflow.isReviewed,
    });
  }

  function markModalRowNeedsReview() {
    if (!mappingExplainModal) return;
    const rowId = mappingExplainModal.rowId;
    const workflow = rowWorkflowById.get(rowId);
    setReviewedByRow((prev) => ({ ...prev, [rowId]: false }));
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              mappingDecision: "MANUAL_REVIEW",
            }
          : row
      )
    );
    setMappingExplainModal((prev) =>
      prev && prev.rowId === rowId
        ? {
            ...(() => {
              const nextWorkflow = classifyShopifyCollectionMappingRow({
                mappingDecision: "MANUAL_REVIEW",
                collectionSyncStatus: "REVIEW",
                actionStatus: prev.actionStatus,
                suggestionReady: prev.suggestionReady,
                manualChanges: prev.manualChanges,
                isReviewed: false,
              });
              return {
                ...prev,
                mappingDecision: "MANUAL_REVIEW",
                collectionSyncStatus: "REVIEW",
                statusLabel: nextWorkflow.statusLabel,
                statusBadgeTone: nextWorkflow.statusBadgeTone,
                isReviewed: false,
              };
            })(),
          }
        : prev
    );
    setWarning(
      workflow?.manualChanges
        ? "Marked as Needs Review. Existing staged changes were kept."
        : "Marked as Needs Review."
    );
  }

  function markModalRowReadyToPush() {
    if (!mappingExplainModal) return;
    const rowId = mappingExplainModal.rowId;
    const row = rowById.get(rowId);
    const staging = rowStagingById.get(rowId);
    if (!row || !staging) return;
    setReviewedByRow((prev) => ({ ...prev, [rowId]: true }));

    setSelectedSuggestionPathsByRow((prev) => {
      const current = { ...(prev[rowId] || {}) };
      for (const option of staging.suggestionOptions) {
        if (option.disabled || option.kind !== "menu") continue;
        const normalizedPath = normalizeMenuPath(option.value);
        if (!normalizedPath) continue;
        current[normalizedPath] = true;
      }
      return { ...prev, [rowId]: current };
    });
    setSelectedSuggestionCollectionsByRow((prev) => {
      const current = { ...(prev[rowId] || {}) };
      for (const option of staging.suggestionOptions) {
        if (option.disabled || option.kind !== "collection") continue;
        const normalizedHandle = String(option.value || "").trim().toLowerCase();
        if (!normalizedHandle) continue;
        current[normalizedHandle] = true;
      }
      return { ...prev, [rowId]: current };
    });

    const currentPaths = dedupeNormalizedPaths(row.checkedNodeKeys.map((key) => nodePathByKey.get(key) || "").filter(Boolean));
    const currentPathSet = new Set(currentPaths);
    setManualAddedPathsByRow((prev) => {
      const current = { ...(prev[rowId] || {}) };
      for (const path of staging.autoMappedPaths) {
        const normalizedPath = normalizeMenuPath(path);
        if (!normalizedPath || currentPathSet.has(normalizedPath)) continue;
        current[normalizedPath] = true;
      }
      return { ...prev, [rowId]: current };
    });

    setRows((prev) =>
      prev.map((candidate) =>
        candidate.id === rowId
          ? {
              ...candidate,
              mappingDecision: candidate.mappingDecision === "MANUAL_REVIEW" ? "SUGGESTED" : candidate.mappingDecision,
            }
          : candidate
      )
    );
    setMappingExplainModal((prev) =>
      prev && prev.rowId === rowId
        ? {
            ...(() => {
              const nextMappingDecision = prev.mappingDecision === "MANUAL_REVIEW" ? "SUGGESTED" : prev.mappingDecision;
              const nextWorkflow = classifyShopifyCollectionMappingRow({
                mappingDecision: nextMappingDecision,
                collectionSyncStatus: prev.collectionSyncStatus,
                actionStatus: prev.actionStatus,
                suggestionReady: true,
                manualChanges: true,
                isReviewed: true,
              });
              return {
                ...prev,
                mappingDecision: nextMappingDecision,
                statusLabel: nextWorkflow.statusLabel,
                statusBadgeTone: nextWorkflow.statusBadgeTone,
                suggestionReady: true,
                manualChanges: true,
                isReviewed: true,
              };
            })(),
          }
        : prev
    );
    setSelectedProducts((prev) => ({ ...prev, [rowId]: true }));
    setActiveRowId(rowId);
    setWarning("Suggestions were applied and this row is now approved for push.");
  }

  async function refreshProductsSection() {
    setSelectedProducts({});
    await loadData({ refreshProducts: true });
  }

  async function openAuditReport() {
    setAuditOpening(true);
    const ok = await loadData({ refreshCollections: true });
    if (ok) {
      setAuditGeneratedAt(new Date().toISOString());
      setShowAuditReport(true);
    }
    setAuditOpening(false);
  }

  function closeAuditReport() {
    setShowAuditReport(false);
    // Keep audit modal data fully ephemeral per user request.
    setAuditGeneratedAt("");
  }

  async function refreshMenuTreeSection() {
    const currentMenuHandle = menuMeta.handle || "main-menu";
    const fallbackNodes = lastSyncedNodes.length > 0 ? cloneNodes(lastSyncedNodes) : null;
    setSaving(true);
    setError("");
    // Refresh is a "discard local edits and re-sync" action.
    // Reset to last known server state immediately, even if the fetch later fails.
    if (fallbackNodes) {
      setNodes(fallbackNodes);
      collapseTreeToDefault(fallbackNodes);
      setPendingTreeOps([]);
      setSelectedNodes({});
      setSelectedUnmappedCollectionIds({});
    }
    try {
      const resp = await fetch("/api/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withShopContext({ action: "refresh-menu", menuHandle: currentMenuHandle })),
      });
      const json = await readJsonResponse<MappingResponse>(resp);
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Menu refresh failed.");
      }
      const nextNodes = json.nodes || [];
      const nextCollections = (json.collections || []).map((row) => ({
        id: String(row.id || ""),
        title: String(row.title || row.id || ""),
        handle: String((row as { handle?: string }).handle || "").trim().toLowerCase(),
      }));
      setNodes(nextNodes);
      setLastSyncedNodes(cloneNodes(nextNodes));
      setCollections(nextCollections);
      setCollectionCount(nextCollections.length);
      setPendingTreeOps([]);
      collapseTreeToDefault(nextNodes);
      setSelectedNodes({});
      setSelectedUnmappedCollectionIds({});
      setWarning(String(json.warning || "").trim());
    } catch (err) {
      if (fallbackNodes) {
        setNodes(fallbackNodes);
        collapseTreeToDefault(fallbackNodes);
        setPendingTreeOps([]);
        setSelectedNodes({});
        setSelectedUnmappedCollectionIds({});
        setWarning("Menu refresh fallback applied. Latest server menu snapshot is temporarily unavailable.");
        setError("");
        return;
      }
      const message = err instanceof Error ? err.message : "Menu refresh failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  const undoPreviewEntries = useMemo(() => {
    if (!undoPreviewEntryId) return [] as UndoEntry[];
    const index = undoHistory.findIndex((entry) => entry.id === undoPreviewEntryId);
    if (index < 0) return [] as UndoEntry[];
    return undoHistory.slice(0, index + 1);
  }, [undoHistory, undoPreviewEntryId]);

  const undoSelectedEntries = useMemo(() => {
    if (undoSelectedEntryIds.length < 1) return [] as UndoEntry[];
    const selected = new Set(undoSelectedEntryIds);
    return undoPreviewEntries.filter((entry) => selected.has(entry.id));
  }, [undoPreviewEntries, undoSelectedEntryIds]);

  function openUndoPreview(entryId: string) {
    const index = undoHistory.findIndex((entry) => entry.id === entryId);
    if (index < 0) return;
    const preview = undoHistory.slice(0, index + 1);
    setUndoPreviewEntryId(entryId);
    setUndoSelectedEntryIds(preview.map((entry) => entry.id));
    setUndoConfirmOpen(false);
    setUndoResult(null);
    setUndoMenuOpen(false);
  }

  function applyUndoSelection() {
    if (undoSelectedEntries.length < 1) {
      setUndoResult({ ok: false, title: "Undo failed", details: ["No undo actions were selected."] });
      setUndoConfirmOpen(false);
      return;
    }
    try {
      // #region agent log
      debugIngest({
          sessionId: "9da838",
          runId: "label-save-debug",
          hypothesisId: "H4",
          location: "components/shopify-collection-mapping.tsx:applyUndoSelection",
          message: "undo_selection_probe",
          data: {
            selectedCount: undoSelectedEntries.length,
            selectedTitles: undoSelectedEntries.map((entry) => entry.title),
          },
          timestamp: Date.now(),
        });
      // #endregion
      const ordered = [...undoPreviewEntries].reverse();
      let nextNodes = cloneNodes(nodes);
      const applied: string[] = [];
      const selected = new Set(undoSelectedEntryIds);
      for (const entry of ordered) {
        if (!selected.has(entry.id)) continue;
        nextNodes = cloneNodes(entry.beforeNodes);
        applied.push(entry.title);
      }
      setNodes(nextNodes);
      setPendingTreeOps([]);
      const appliedSet = new Set(undoSelectedEntryIds);
      setUndoHistory((prev) => prev.filter((entry) => !appliedSet.has(entry.id)));
      setUndoResult({
        ok: true,
        title: "Undo completed",
        details: [`Reverted ${applied.length} action(s).`, ...applied.map((row, idx) => `${idx + 1}. ${row}`)],
      });
      setWarning("Undo applied. Click Save to keep these changes.");
    } catch (errorValue) {
      const message = errorValue instanceof Error ? errorValue.message : "Undo process failed unexpectedly.";
      setUndoResult({ ok: false, title: "Undo failed", details: [message] });
    } finally {
      setUndoConfirmOpen(false);
      setUndoPreviewEntryId("");
      setUndoSelectedEntryIds([]);
    }
  }

  return (
    <>
      {isStandaloneCollectionMappingRoute ? (
        <div className="headerKpiOverlay" aria-label="Collection mapping summary">
          <div
            className={`headerKpiCard headerKpiCardLoaded${activeQueueTab === "all" ? " headerKpiCardActive" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setActiveQueueTab("all")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveQueueTab("all");
              }
            }}
          >
            <div className="headerKpiLabel">Loaded</div>
            <div className="headerKpiValue">{moduleSummary.totalLoaded}</div>
          </div>
          <div
            className={`headerKpiCard headerKpiCardReview${activeQueueTab === KPI_NEEDS_REVIEW_UNION_FILTER ? " headerKpiCardActive" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setActiveQueueTab(KPI_NEEDS_REVIEW_UNION_FILTER)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveQueueTab(KPI_NEEDS_REVIEW_UNION_FILTER);
              }
            }}
          >
            <div className="headerKpiLabel">Needs Review</div>
            <div className="headerKpiValue">{moduleSummary.reviewNeeded}</div>
          </div>
          <div
            className={`headerKpiCard headerKpiCardPending${activeQueueTab === "ready-push" ? " headerKpiCardActive" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setActiveQueueTab("ready-push")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveQueueTab("ready-push");
              }
            }}
          >
            <div className="headerKpiLabel">Ready to Push</div>
            <div className="headerKpiValue">{moduleSummary.readyToPush}</div>
          </div>
          <div
            className={`headerKpiCard headerKpiCardPushFailed${activeQueueTab === "push-failed" ? " headerKpiCardActive" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setActiveQueueTab("push-failed")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveQueueTab("push-failed");
              }
            }}
          >
            <div className="headerKpiLabel">Push Failed</div>
            <div className="headerKpiValue">{moduleSummary.pushFailed}</div>
          </div>
          <div
            className={`headerKpiCard headerKpiCardSynced${activeQueueTab === "synced" ? " headerKpiCardActive" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => setActiveQueueTab("synced")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveQueueTab("synced");
              }
            }}
          >
            <div className="headerKpiLabel">Synced</div>
            <div className="headerKpiValue">{moduleSummary.synced}</div>
          </div>
        </div>
      ) : null}
      <div className="pageNoticeFrame">
        <div className="noticeStandalone">
          <div className="noticeSlot">
            {noticeState && !noticeHidden ? (
              <div
                className={`noticeBar notice-${noticeState.tone}`}
                role={noticeState.tone === "error" ? "alert" : "status"}
                aria-live={noticeState.tone === "error" ? "assertive" : "polite"}
              >
                {noticeState.tone === "progress" ? (
                  <span className="noticeProgressTrack" aria-hidden="true">
                    <span className="noticeProgressFill" />
                  </span>
                ) : null}
                <div className="noticeText">{noticeState.message}</div>
                <button
                  type="button"
                  className="noticeCloseBtn"
                  aria-label="Dismiss notice"
                  onClick={() => setNoticeHidden(true)}
                >
                  x
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <main
        className={`page${workspaceHeight ? " pageExpanded" : ""}`}
        ref={pageScrollRef}
      >
      <div className="pageBody">
      <section
        className="card workspaceSection workspaceSectionExpanded"
        style={
          workspaceHeight != null && Number.isFinite(workspaceHeight) && workspaceUserResizedRef.current
            ? { minHeight: `${Math.max(0, workspaceHeight + WORKSPACE_RESIZE_HANDLE_SPACE)}px` }
            : undefined
        }
      >
        <div
          ref={workspaceGridRef}
          className="grid2 workspaceGridHost"
          style={{
            gridTemplateColumns: `${treePaneCollapsed ? TREE_PANEL_COLLAPSED_WIDTH : treePanelWidth}px ${treePaneCollapsed ? 0 : 11}px minmax(0, 1fr)`,
            gap: "0",
            transition: resizingPanes
              ? "none"
              : "grid-template-columns 1100ms cubic-bezier(0.22, 0.61, 0.36, 1), gap 1100ms cubic-bezier(0.22, 0.61, 0.36, 1)",
          }}
        >
          <div
            ref={treePanelAutoWidthRef}
            className={`card panel treePaneHost treeWorkspacePanel${treePaneCollapsed ? " treePaneHostCollapsed" : ""}`}
            style={{
              width: `${treePaneCollapsed ? TREE_PANEL_COLLAPSED_WIDTH : treePanelWidth}px`,
              minWidth: `${treePaneCollapsed ? TREE_PANEL_COLLAPSED_WIDTH : treePanelWidth}px`,
              maxWidth: `${treePaneCollapsed ? TREE_PANEL_COLLAPSED_WIDTH : treePanelWidth}px`,
            }}
          >
            <ShopifyMenuItemsTree
              menuTitle={menuMeta.title}
              menuHandle={menuMeta.handle}
              treeSearch={treeSearch}
              collapsed={treePaneCollapsed}
              onToggleCollapse={() => setTreePaneCollapsed((prev) => !prev)}
              onCollapseTreeCards={collapseAllTreeCards}
              onTreeSearchChange={setTreeSearch}
              onTreeSearchSubmit={expandTreeForSearchResults}
              onRefreshTree={() => {
                treePaneUserResizedRef.current = false;
                setTreePanelWidth(TREE_PANEL_DEFAULT_WIDTH);
                setTreePaneCollapsed(false);
                void refreshMenuTreeSection();
              }}
              undoEntries={undoHistory}
              undoMenuOpen={undoMenuOpen}
              onUndoMenuToggle={() => setUndoMenuOpen((prev) => !prev)}
              onUndoEntrySelect={openUndoPreview}
              onSaveTree={saveMenuTreeSection}
              saving={saving}
              nodes={nodes}
              nodeByKey={nodeByKey}
              childrenByParent={childrenByParent}
              visibleTreeNodeIdSet={visibleTreeNodeIdSet}
              expandedNodes={expandedNodes}
              selectedNodes={selectedNodes}
              unmappedCollections={orderedUnmappedCollections.map((row) => ({
                id: row.id,
                title: row.title,
                selected: Boolean(selectedUnmappedCollectionIds[row.id]),
              }))}
              onMoveNode={moveMenuNode}
              onInlineEditNode={inlineEditMenuNode}
              inlineLinkTargets={menuLinkTargets}
              onApplyNodeSelection={applyNodeSelection}
              onToggleNodeExpansion={toggleNodeExpansion}
              onToggleNodeVisibility={toggleNodeVisibility}
              onOpenEditEditor={openEditEditor}
              onOpenAddEditor={openAddEditor}
              onDeleteNode={(nodeKey) => {
                const ok = window.confirm("Delete this menu item and all nested children?");
                if (!ok) return;
                void deleteMenuNode(nodeKey);
              }}
              onToggleUnmappedCollection={toggleUnmappedCollectionSelection}
              onReorderUnmappedCollections={reorderUnmappedCollection}
              onEditUnmappedCollection={editUnmappedCollection}
              onDeleteUnmappedCollection={deleteUnmappedCollectionCard}
            />
          </div>
          <button
            type="button"
            className={`paneDivider ${resizingPanes ? "resizing" : ""}${treePaneCollapsed ? " paneDividerCollapsed" : ""}`}
            aria-label="Resize menu tree panel"
            onPointerDown={(event) => {
              if (treePaneCollapsed) return;
              try {
                (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
              } catch {}
              treePaneUserResizedRef.current = true;
              setResizingPanes(true);
              paneResizePointerClientX.current = event.clientX;
              paneResizeStart.current = {
                x: event.clientX,
                width: treePanelWidth,
                minWidth: treePanelMinWidth,
                pointerId: event.pointerId,
              };
            }}
          >
            <span className="paneDividerGrip" />
          </button>
          <main className={`card panel productPanel${treePaneCollapsed ? " treePaneCollapsed" : ""}`}>
            <div className="productControls">
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  resetPageForDataQuery();
                }}
                placeholder="Search products (title / sku / upc / type)"
                aria-label="Search products"
                className="productSearchInput"
              />
              <button
                type="button"
                className="productSearchBtn productIconBtn productIconBtnGreen quickTooltip"
                onClick={() => resetPageForDataQuery()}
                disabled={loading || saving}
                aria-label="Search products"
                data-tooltip="Search products"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M10.5 3a7.5 7.5 0 1 0 4.72 13.33l4.72 4.71a1 1 0 0 0 1.41-1.41l-4.7-4.71A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="productRefreshBtn productIconBtn quickTooltip"
                onClick={() => void refreshProductsSection()}
                disabled={loading || saving}
                aria-label="Refresh products"
                data-tooltip="Refresh products"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M12 4a8 8 0 0 1 7.6 5.6 1 1 0 1 1-1.9.6A6 6 0 1 0 16.8 16a1 1 0 1 1 1.4 1.4A8 8 0 1 1 12 4zm7.7 1.3V9a1 1 0 1 1-2 0V7.7h-1.3a1 1 0 1 1 0-2h2.3a1 1 0 0 1 1 1z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <div className="productControlsSpacer" />
              <button
                type="button"
                className="toolbarPlaceholderBtn productIconBtn quickTooltip"
                aria-label="Open more filters"
                data-tooltip="More filters"
                onClick={openFiltersDrawer}
                disabled={saving}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 .8 1.6l-5.8 7.73V19a1 1 0 0 1-1.45.9l-2-1A1 1 0 0 1 10 18v-3.67L4.2 6.6A1 1 0 0 1 4 6z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              {/* Consolidate all report/export entry points into one modal trigger on the right side. */}
              <button
                type="button"
                className="reportsTriggerBtn productIconBtn quickTooltip"
                onClick={() => setShowReportsModal(true)}
                disabled={loading || saving || auditOpening}
                aria-label="Open reports"
                data-tooltip="Reports"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M7 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.8a2 2 0 0 0-.55-1.38l-3.2-3.3A2 2 0 0 0 13.8 3H7zm6 1.5v3a1 1 0 0 0 1 1h3.06l-4.06-4zM8.5 12a1 1 0 0 1 1-1h5a1 1 0 1 1 0 2h-5a1 1 0 0 1-1-1zm0 3.5a1 1 0 0 1 1-1h5a1 1 0 1 1 0 2h-5a1 1 0 0 1-1-1z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <div className="commitMenuWrap" ref={commitMenuRef}>
                <button
                  type="button"
                  className="commitMenuTrigger"
                  disabled={saving || loading || executionBusy}
                  onClick={() => setShowCommitMenu((prev) => !prev)}
                >
                  COMMIT CHANGES
                  <span className="commitMenuArrow">{showCommitMenu ? "\u25B2" : "\u25BC"}</span>
                </button>
                {showCommitMenu && (
                  <div className="commitMenu" role="menu">
                    <div className="commitMenuSection">SAFE ACTIONS</div>
                    <div className="commitMenuSafeActions">
                      <button
                        type="button"
                        className="commitMenuItem commitMenuPushAction"
                        role="menuitem"
                        onClick={() => { setShowCommitMenu(false); pushSelectedScaffold(); }}
                        disabled={saving || loading || executionBusy || selectedProductCount < 1}
                      >
                        <span className="commitMenuItemTitle">Push selected ({selectedProductCount})</span>
                        <span className="commitMenuItemSub">Push only ready-to-push items</span>
                      </button>
                      <button
                        type="button"
                        className="commitMenuItem commitMenuPushAction"
                        role="menuitem"
                        onClick={() => { setShowCommitMenu(false); pushAllFinalChangesScaffold(); }}
                        disabled={saving || loading || executionBusy}
                      >
                        <span className="commitMenuItemTitle">Push all final changes</span>
                        <span className="commitMenuItemSub">All {rows.length} products will be updated</span>
                      </button>
                    </div>
                    <div className="commitMenuDivider" />
                    <div className="commitMenuSection">DESTRUCTIVE</div>
                    <button
                      type="button"
                      className="commitMenuItem commitMenuDanger"
                      role="menuitem"
                      onClick={() => { setShowCommitMenu(false); setShowRemoveConfirm(true); }}
                      disabled={saving || loading || executionBusy || selectedProductCount < 1}
                    >
                      <span className="commitMenuItemTitle">{"\u26A0"} Remove all from selected products ({selectedProductCount})</span>
                      <span className="commitMenuItemSub">Clears assignments only for selected products</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {appliedFilterChips.length > 0 ? (
              <div className="appliedFilterChips" aria-label="Applied filters">
                {appliedFilterChips.map((chip) => (
                  <span key={chip.id} className="appliedFilterChip">
                    {chip.label}
                    <button
                      type="button"
                      className="appliedFilterChipClose"
                      aria-label={`Remove ${chip.label}`}
                      onClick={() => removeAppliedFilterChip(chip)}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="tableWrap" ref={tableWrapRef}>
              <table>
                <thead>
                  <tr>
                    <th className="center stickyCheckboxCol">
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedProducts((prev) => {
                            const next = { ...prev };
                            for (const row of filteredRows) next[row.id] = checked;
                            return next;
                          });
                        }}
                        aria-label="Select all products"
                      />
                    </th>
                    <th className="center stickyEyeCol">View</th>
                    <th className="stickyPictureCol sortHead">
                      <span
                        className="sortHeadText"
                        onClick={() =>
                          setHeaderSortMode((prev) =>
                            prev === "picture-with-image" ? "picture-without-image" : "picture-with-image"
                          )
                        }
                      >
                        Picture <span className="sortArrow">{getHeaderSortArrow("picture")}</span>
                      </span>
                    </th>
                    <th className="productNameCol stickyProductNameCol sortHead">
                      <span
                        className="sortHeadText"
                        onClick={() => setHeaderSortMode((prev) => (prev === "product-az" ? "product-za" : "product-az"))}
                      >
                        Product <span className="sortArrow">{getHeaderSortArrow("product")}</span>
                      </span>
                    </th>
                    <th className="autoMappedCol">Auto Path</th>
                    <th className="suggestedCol sortHead">
                      <span
                        className="sortHeadText"
                        onClick={() =>
                          setHeaderSortMode((prev) =>
                            prev === "suggested-with" ? "suggested-without" : "suggested-with"
                          )
                        }
                      >
                        Suggested <span className="sortArrow">{getHeaderSortArrow("suggested")}</span>
                      </span>
                    </th>
                    <th className="mappingDecisionCol">Decision</th>
                    <th className="reviewedCol">Approved</th>
                    <th className="syncStatusCol sortHead">
                      <span className="sortHeadText" onClick={cycleStatusHeaderSort}>
                        Status <span className="sortArrow">{getHeaderSortArrow("status")}</span>
                      </span>
                    </th>
                    <th className="stage4HeadCol">Current → Final</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="empty">Loading Shopify products...</td>
                    </tr>
                  ) : filteredRows.length < 1 ? (
                    <tr>
                      <td colSpan={10} className="empty">No products match the current filter.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const staging = rowStagingById.get(row.id);
                      if (!staging) return null;
                      const currentCollectionsRaw = dedupeNormalizedPaths(
                        row.checkedNodeKeys.map((key) => nodePathByKey.get(key) || nodeLabelByKey.get(key) || key)
                      );
                      const currentCollections = formatCompactPathSummary(currentCollectionsRaw);
                      const finalCollectionsRaw = dedupeNormalizedPaths(staging.finalMenuPaths || []);
                      const finalCollections = formatCompactPathSummary(finalCollectionsRaw);
                      const finalDirectCollections = (staging.finalDirectCollections || [])
                        .map((handle) => getCollectionDisplayName(handle))
                        .join(", ");
                      const autoPathItems = (staging.autoMappedPaths || []).map((path) => ({
                        label: getLastPathSegment(path),
                        tooltip: path,
                      }));
                      const mappingDecision = staging.mappingDecision || row.mappingDecision || "MANUAL_REVIEW";
                      const workflow = rowWorkflowById.get(row.id);
                      if (!workflow) return null;
                      const selectedProductRow = Boolean(selectedProducts[row.id]);
                      const isActiveRow = row.id === activeRowId;
                      const isManualReviewRow = mappingDecision === "MANUAL_REVIEW";
                      const changedAddCount = Math.max(0, finalCollectionsRaw.length - currentCollectionsRaw.length);
                      const changedRemoveCount = Math.max(0, currentCollectionsRaw.length - finalCollectionsRaw.length);
                      const expectedTopGender = getExpectedTopGenderFromUpc(row.upc || "");
                      const currentTopGender = getTopGenderFromPaths(currentCollectionsRaw);
                      const showGenderMismatchSuggestion =
                        expectedTopGender !== "" &&
                        currentTopGender !== "" &&
                        expectedTopGender !== currentTopGender;
                      const suggestionOptionsCount = showGenderMismatchSuggestion ? 1 : staging.suggestionOptions.length;
                      const tableSuggestionLayoutClass =
                        suggestionOptionsCount >= 1 && suggestionOptionsCount <= 4
                          ? `suggestionChips tableSuggestionChips tableSuggestionChipsCount${suggestionOptionsCount}`
                          : "suggestionChips tableSuggestionChips";
                      const hasPendingFinalEdits =
                        staging.selectedSuggestionPaths.length +
                          staging.selectedSuggestionDirectCollections.length +
                          staging.manualAddedPaths.length +
                          staging.manualRemovedPaths.length >
                        0;
                      const finalCollectionsToneClass = hasPendingFinalEdits
                        ? "stage4ResultLineFinalPending"
                        : autoPathItems.length > 0
                          ? "stage4ResultLineFinalAuto"
                          : "stage4ResultLineFinal";
                      return (
                        <tr
                          key={row.id}
                          className={`${selectedProductRow ? "selectedProductRow " : ""}${isActiveRow ? "activeProductRow " : ""}${isManualReviewRow ? "manualReviewRow " : ""}statusTone-${workflow.statusBadgeTone}`.trim()}
                          onClick={() => toggleRowSelectionFromRowClick(row.id)}
                        >
                          <td className="center stickyCheckboxCol">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedProducts[row.id])}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                event.stopPropagation();
                                const checked = event.target.checked;
                                setSelectedProducts((prev) => ({ ...prev, [row.id]: checked }));
                                if (checked) {
                                  setActiveRowId(row.id);
                                } else if (activeRowId === row.id) {
                                  setActiveRowId("");
                                }
                              }}
                            />
                          </td>
                          <td className="center stickyEyeCol">
                            <button
                              type="button"
                              className="eyeActionBtn"
                              aria-label="Open row details"
                              onClick={(event) => {
                                event.stopPropagation();
                                openMappingDecisionExplanation(row, staging);
                              }}
                            >
                              <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
                                <path
                                  d="M2 12c2.8-4 6.4-6 10-6s7.2 2 10 6c-2.8 4-6.4 6-10 6s-7.2-2-10-6zm10-3a3 3 0 100 6 3 3 0 000-6z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                          </td>
                          <td className="center imgCell stickyPictureCol">
                            {row.image ? (
                              <button
                                type="button"
                                className="thumbBtn"
                                onClick={() => setPreviewImage(row.image)}
                                aria-label="Open product image preview"
                              >
                                <img className="thumb" src={row.image} alt={row.title} />
                              </button>
                            ) : (
                              <span className="thumbPlaceholder" aria-hidden="true" />
                            )}
                          </td>
                          <td className="productNameCol stickyProductNameCol">
                            <div>{row.title}</div>
                            <div className="muted tiny">UPC: {row.upc || "-"}</div>
                          </td>
                          <td className="autoMappedCol">
                            {autoPathItems.length > 0 ? (
                              <div className="autoPathChips">
                                {autoPathItems.map((item, index) => (
                                  <span
                                    key={`${row.id}-auto-${index}`}
                                    className="autoPathChip"
                                    data-tooltip={item.tooltip || undefined}
                                  >
                                    {item.label}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="muted small">-</span>
                            )}
                          </td>
                          <td className="suggestedCol">
                            {showGenderMismatchSuggestion ? (
                              <div className={tableSuggestionLayoutClass}>
                                <button
                                  type="button"
                                  className="suggestionChip genderMismatchSuggestion"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void applyGenderMismatchCorrection(
                                      row,
                                      staging,
                                      expectedTopGender,
                                      currentTopGender
                                    );
                                  }}
                                  data-tooltip="Click to remove the wrong gender category and re-map this item"
                                  aria-label="Fix wrong gender branch and re-map this item"
                                >
                                  {expectedTopGender === "MEN" ? "Men" : "Women"}
                                </button>
                              </div>
                            ) : staging?.suggestionOptions && staging.suggestionOptions.length > 0 ? (
                              <div className={tableSuggestionLayoutClass}>
                                {staging.suggestionOptions.map((option) => (
                                  <button
                                    key={`${row.id}-${option.kind}-${option.value}`}
                                    type="button"
                                    className={`suggestionChip${option.selected ? " selected" : ""}`}
                                    disabled={option.disabled}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      toggleSuggestionSelection(row.id, option.kind, option.value, option.disabled);
                                    }}
                                    data-tooltip={option.disabled ? "" : getSuggestionTooltip(option.kind, option.label)}
                                    aria-label={option.disabled ? "Already assigned or staged; cannot select." : option.label}
                                  >
                                    {option.kind === "collection" ? getCollectionDisplayName(option.value) : getLastPathSegment(option.value)}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="muted small">-</span>
                            )}
                          </td>
                          <td className="mappingDecisionCol">
                            <span className={`decisionBadge decision-${mappingDecision.toLowerCase()}`}>
                              {getUiStatusLabel(mappingDecision)}
                            </span>
                          </td>
                          <td className="reviewedCol">
                            <label className="reviewedCheckboxLabel" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={Boolean(staging.isReviewed)}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  const checked = event.target.checked;
                                  setReviewedByRow((prev) => ({ ...prev, [row.id]: checked }));
                                }}
                                aria-label={`Approve ${row.title} for push`}
                              />
                            </label>
                          </td>
                          <td className="syncStatusCol">
                            <span className={`syncBadge sync-${workflow.statusBadgeTone}`}>{workflow.statusLabel}</span>
                          </td>
                          <td className="stage4ResultCell">
                            <div className="stage4ResultBlock">
                              <div className="stage4ResultLine stage4ResultLineCurrent">
                                <b>Current:</b> {currentCollections || "-"}
                              </div>
                              <div className={`stage4ResultLine ${finalCollectionsToneClass}`}>
                                <b>Final:</b> {finalCollections || "-"}
                              </div>
                              <div className="stage4ResultLine stage4ResultLineCollections">
                                <b>Final Collections:</b> {finalDirectCollections || "-"}
                              </div>
                              <div className="stage4ResultLine stage4ResultLineChanged">
                                <b>Changed:</b>{" "}
                                <span className={changedAddCount > 0 ? "stage4ResultDeltaPositive" : "stage4ResultDeltaNeutral"}>
                                  +{changedAddCount}
                                </span>{" "}
                                /{" "}
                                <span className={changedRemoveCount > 0 ? "stage4ResultDeltaNegative" : "stage4ResultDeltaNeutral"}>
                                  -{changedRemoveCount}
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="topbar pagerBar">
              <div className="pagerNav">
                <button type="button" onClick={() => setPage(1)} disabled={page <= 1 || loading}>
                  {"<<"}
                </button>
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1 || loading}>
                  {"<"}
                </button>
                <span className="pagerPageLabel muted">Page {page} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages || loading}
                >
                  {">"}
                </button>
                <button type="button" onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading}>
                  {">>"}
                </button>
              </div>
              <label className="pagerPerPage" aria-label="Products per page">
                <span className="muted">Per page</span>
                <select
                  className="pagerPerPageSelect"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value) || 20);
                    setPage(1);
                  }}
                >
                  {[20, 50, 100, 200, 500].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </main>
        </div>
      </section>

      {/* Custom horizontal scroll dock — spans full right panel, replaces native horizontal scrollbar */}
      <div
        className="tableScrollDockWrap"
        ref={tableScrollDockWrapRef}
        style={{
          left: tableDockInsets.left,
          right: 0,
        }}
        aria-hidden="true"
      >
        <div className="tableScrollDock" ref={tableScrollDockRef}>
          <div className="tableScrollDockSpacer" ref={tableScrollSpacerRef} />
        </div>
      </div>

      {/* Custom vertical scroll dock — fixed on the right screen edge */}
      <div
        className="tableScrollDockVertWrap"
        style={{
          top: tableDockInsets.tableWrapTop,
          right: 0,
          bottom: 13,
        }}
        aria-hidden="true"
      >
        <div
          className="tableScrollDockVertThumb"
          ref={tableScrollDockVertThumbRef}
        />
      </div>

      {/* Consolidated reports modal centralizes all report/export actions and removes inline report links from the canvas. */}
      {showReportsModal ? (
        <div className="previewOverlay" onClick={() => setShowReportsModal(false)} role="dialog" aria-label="Reports">
          <div className="reportHubModal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="reportClose" onClick={() => setShowReportsModal(false)} aria-label="Close reports">
              X
            </button>
            <h3>Reports</h3>
            <div className="reportHubSection">
              <h4>Audit reports</h4>
              <div className="reportHubGrid">
                <button type="button" className="reportHubCard" onClick={() => void openAuditReport()}>
                  <span className="reportHubCardTitle">Master Audit</span>
                  <span className="reportHubCardDesc">Open the full collection audit modal with unmapped and duplicate findings.</span>
                </button>
                <button type="button" className="reportHubCard" onClick={exportPushSummaryReport}>
                  <span className="reportHubCardTitle">Batch Summary</span>
                  <span className="reportHubCardDesc">Export a rollup summary for the current push and staging lifecycle.</span>
                </button>
                <button type="button" className="reportHubCard" onClick={exportPushFailureReport}>
                  <span className="reportHubCardTitle">Errors & Review</span>
                  <span className="reportHubCardDesc">Export failed and skipped rows that need manual review attention.</span>
                </button>
                <button type="button" className="reportHubCard" onClick={exportCollectionDeltaReport}>
                  <span className="reportHubCardTitle">Collection Sync</span>
                  <span className="reportHubCardDesc">Export current vs final collection deltas for verification and QA.</span>
                </button>
              </div>
            </div>
            <div className="reportHubSection">
              <h4>Push reports</h4>
              <div className="reportHubGrid">
                <button type="button" className="reportHubCard" onClick={exportPushSummaryReport}>
                  <span className="reportHubCardTitle">Push Summary</span>
                  <span className="reportHubCardDesc">Download successful and skipped totals for the latest push run.</span>
                </button>
                <button type="button" className="reportHubCard" onClick={exportPushFailureReport}>
                  <span className="reportHubCardTitle">Push Failures</span>
                  <span className="reportHubCardDesc">Download failed push rows with failure details for debugging.</span>
                </button>
                <button type="button" className="reportHubCard" onClick={exportCollectionDeltaReport}>
                  <span className="reportHubCardTitle">Collection Delta</span>
                  <span className="reportHubCardDesc">Download add/remove deltas between current and final collection sets.</span>
                </button>
              </div>
            </div>
            <div className="reportHubFooter">
              <button type="button" onClick={downloadAuditCsv}>
                ⤓ Export CSV
              </button>
              <button type="button" onClick={exportSkippedReviewReport}>
                ⤓ Export skipped review
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <aside className={`filtersDrawer ${showFiltersDrawer ? "open" : ""}`} aria-label="Advanced filters">
        <div className="filtersDrawerHead">
          <strong>Advanced Filters</strong>
          <button
            type="button"
            className="btn ghost filtersDrawerCloseBtn"
            onClick={() => {
              setDraftTypeDropdownOpen(false);
              setShowFiltersDrawer(false);
            }}
          >
            ✕
          </button>
        </div>
        <div className="filtersDrawerBody">
          <div className="filtersField">
            <h4>Quick Filters</h4>
            <label className="filtersFieldOption">
              <input
                type="checkbox"
                checked={draftFilterHasSuggestions}
                onChange={(event) => setDraftFilterHasSuggestions(event.target.checked)}
              />
              <span>Has suggestions</span>
            </label>
            <label className="filtersFieldOption">
              <input
                type="checkbox"
                checked={draftFilterDecisions.includes("MANUAL_REVIEW")}
                onChange={(event) => {
                  setDraftFilterDecisions((prev) =>
                    event.target.checked ? [...prev, "MANUAL_REVIEW"] : prev.filter((value) => value !== "MANUAL_REVIEW")
                  );
                }}
              />
              <span>Needs manual review</span>
            </label>
            <label className="filtersFieldOption">
              <input
                type="checkbox"
                checked={draftFilterDecisions.includes("AUTO_MAPPED")}
                onChange={(event) => {
                  setDraftFilterDecisions((prev) =>
                    event.target.checked ? [...prev, "AUTO_MAPPED"] : prev.filter((value) => value !== "AUTO_MAPPED")
                  );
                }}
              />
              <span>Auto-mapped</span>
            </label>
          </div>
          <div className="filtersField">
            <h4>Visibility</h4>
            <label className="filtersFieldOption">
              <input
                type="checkbox"
                checked={draftFilterIncludeSynced}
                onChange={(event) => setDraftFilterIncludeSynced(event.target.checked)}
              />
              <span>Include finished rows</span>
            </label>
          </div>
          <div className="filtersField">
            <h4>Product Type</h4>
            {typeOptions.length > 0 ? (
              <div className="filtersTypeDropdown">
                <button
                  type="button"
                  className="filtersTypeDropdownBtn"
                  aria-expanded={draftTypeDropdownOpen || true}
                >
                  <span>{draftFilterTypesLabel}</span>
                  <span className="filtersTypeDropdownCaret">▲</span>
                </button>
                <div className="filtersTypeDropdownMenu" role="listbox" aria-label="Product types">
                  {typeOptions.map((itemType) => (
                    <label key={itemType} className="filtersTypeOption">
                      <input
                        type="checkbox"
                        checked={draftFilterTypes.some((value) => value.toLowerCase() === itemType.toLowerCase())}
                        onChange={(event) => {
                          setDraftFilterTypes((prev) => {
                            const exists = prev.some((value) => value.toLowerCase() === itemType.toLowerCase());
                            if (event.target.checked && !exists) return [...prev, itemType];
                            if (!event.target.checked && exists) {
                              return prev.filter((value) => value.toLowerCase() !== itemType.toLowerCase());
                            }
                            return prev;
                          });
                        }}
                      />
                      <span>{itemType}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="filtersFieldEmpty">No type options loaded yet.</div>
            )}
          </div>
        </div>
        <div className="filtersDrawerFoot">
          <button type="button" className="btn ghost" onClick={clearAdvancedFilters}>
            Clear All
          </button>
          <button type="button" className="btn primary" onClick={applyAdvancedFilters}>
            Apply Filters
          </button>
        </div>
      </aside>

      {previewImage ? (
        <div className="previewOverlay" onClick={() => setPreviewImage(null)} role="dialog" aria-label="Product image preview">
          <div className="previewContent" onClick={(event) => event.stopPropagation()}>
            <img src={previewImage} alt="Product preview" className="previewImg" />
            <button type="button" className="previewClose" onClick={() => setPreviewImage(null)} aria-label="Close image preview">
              ×
            </button>
          </div>
        </div>
      ) : null}

      {showAuditReport ? (
        <div className="previewOverlay" onClick={closeAuditReport} role="dialog" aria-label="Collection audit report">
          <div className="reportModal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="reportClose" onClick={closeAuditReport} aria-label="Close report">
              X
            </button>
            <h3>Collection Audit Report</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Generated: {new Date(auditGeneratedAt || collectionAudit.generatedAt).toLocaleString()}
            </p>
            <div className="kpi" style={{ marginTop: 10 }}>
              <div className="k">
                <div className="muted">Total Shopify Collections</div>
                <b>{collectionAudit.totalCollections}</b>
              </div>
              <div className="k">
                <div className="muted">Mapped Unique Collections</div>
                <b>{collectionAudit.mappedUniqueCollections}</b>
              </div>
              <div className="k">
                <div className="muted">Unmapped Collections</div>
                <b>{collectionAudit.unmappedCount}</b>
              </div>
              <div className="k">
                <div className="muted">Duplicate Mapped Collections</div>
                <b>{collectionAudit.duplicatesCount}</b>
              </div>
            </div>
            <div className="topbar" style={{ marginTop: 10, justifyContent: "space-between" }}>
              <span className="muted">Formal report includes unmapped and duplicate mappings.</span>
              <button type="button" className="primary" onClick={downloadAuditCsv}>
                Download CSV
              </button>
            </div>
            <div className="reportSection">
              <h4>Unmapped Collections ({collectionAudit.unmappedCount})</h4>
              <div className="reportList">
                {collectionAudit.unmapped.length ? (
                  collectionAudit.unmapped.map((row) => (
                    <div className="reportRow" key={row.id}>
                      <span>{row.title}</span>
                      <span className="muted small">{row.id}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty">No unmapped collections.</div>
                )}
              </div>
            </div>
            <div className="reportSection">
              <h4>Duplicate Mapped Collections ({collectionAudit.duplicatesCount})</h4>
              <div className="reportList">
                {collectionAudit.duplicates.length ? (
                  collectionAudit.duplicates.map((row) => (
                    <div className="reportRow" key={row.id}>
                      <span>{row.title}</span>
                      <span className="muted small">Mapped in {row.count} collections</span>
                    </div>
                  ))
                ) : (
                  <div className="empty">No duplicate mapped collections.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pushPreviewModal?.open ? (
        <div className="previewOverlay" onClick={() => setPushPreviewModal(null)} role="dialog" aria-label="Push dry run preview">
          <div className="editorModal" onClick={(event) => event.stopPropagation()}>
            <h3>Dry-Run Preview: {pushPreviewModal.actionKind}</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              Eligible rows: {pushPreviewModal.summary.eligibleRows} / {pushPreviewModal.summary.totalRows}. Skipped rows are excluded.
            </p>
            <div className="kpi" style={{ marginTop: 12 }}>
              <div className="k">
                <div className="muted">Rows Selected</div>
                <b>{pushPreviewModal.summary.totalRows}</b>
              </div>
              <div className="k">
                <div className="muted">Rows Eligible</div>
                <b>{pushPreviewModal.summary.eligibleRows}</b>
              </div>
              <div className="k">
                <div className="muted">Rows Skipped</div>
                <b>{pushPreviewModal.summary.skippedRows}</b>
              </div>
              <div className="k">
                <div className="muted">Total Additions</div>
                <b>{pushPreviewModal.summary.totalAdditions}</b>
              </div>
              <div className="k">
                <div className="muted">Total Removals</div>
                <b>{pushPreviewModal.summary.totalRemovals}</b>
              </div>
            </div>
            <div className="reportList" style={{ marginTop: 12, maxHeight: 280 }}>
              {pushPreviewModal.rows.map((row) => (
                <div key={row.rowId} className="reportRow">
                  <span>
                    <b>{row.title}</b> - {row.plannerStatus}
                  </span>
                  <span className="muted small">
                    +{row.collectionsToAdd.length} / -{row.collectionsToRemove.length}
                    {row.skippedReason ? ` | ${row.skippedReason}` : ""}
                  </span>
                </div>
              ))}
            </div>
            {pushPreviewModal.actionKind === "remove-all-collections" ? (
              <div className="editorField" style={{ marginTop: 12 }}>
                <label htmlFor="remove-all-confirm">Type REMOVE ALL to confirm destructive removal</label>
                <input
                  id="remove-all-confirm"
                  value={removeAllConfirmText}
                  onChange={(event) => setRemoveAllConfirmText(event.target.value)}
                  placeholder="REMOVE ALL"
                />
              </div>
            ) : null}
            <div className="topbar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" onClick={() => setPushPreviewModal(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={executePushPreviewScaffold} disabled={executionBusy}>
                {executionBusy ? "Queuing..." : "Confirm Scaffold Run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showMenuEditor ? (
        <div
          className="previewOverlay"
          onClick={() => {
            setShowMenuEditor(false);
            setMenuEditorComboboxOpen(false);
          }}
          role="dialog"
          aria-label="Menu item editor"
        >
          <div className="editorModal" onClick={(event) => event.stopPropagation()}>
            <h3>{menuEditorMode === "add" ? "Add Menu Item" : "Edit Menu Item"}</h3>
            <div className="editorField">
              <label htmlFor="menu-item-label">Name</label>
              <input
                id="menu-item-label"
                value={menuEditorLabel}
                onChange={(event) => setMenuEditorLabel(event.target.value)}
                placeholder="Menu item name"
                autoFocus
              />
            </div>
            <div className="editorLinkSection">
              <p className="editorLinkHeading">Link</p>
              <div className="editorField">
                <label htmlFor="menu-item-link-type">Asset category</label>
                <select
                  id="menu-item-link-type"
                  value={menuEditorLinkType}
                  onChange={(event) => {
                    const nextType = normalizeMenuEditorLinkType(event.target.value);
                    setMenuEditorLinkType(nextType);
                    setMenuEditorLinkTargetId("");
                    setMenuEditorLinkQuery("");
                    setMenuEditorComboboxOpen(true);
                    void loadMenuEditorAssets(nextType, { force: true });
                  }}
                >
                  {MENU_LINK_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="editorField">
                <label htmlFor="menu-item-link-search">Link</label>
                <div className="editorCombobox" ref={menuEditorComboboxRef}>
                  <input
                    id="menu-item-link-search"
                    value={menuEditorLinkQuery}
                    onFocus={() => setMenuEditorComboboxOpen(true)}
                    onChange={(event) => {
                      setMenuEditorLinkQuery(event.target.value);
                      setMenuEditorLinkTargetId("");
                      setMenuEditorComboboxOpen(true);
                    }}
                    placeholder="Search Shopify assets..."
                    autoComplete="off"
                  />
                  {menuEditorComboboxOpen ? (
                    <div className="editorAssetList" role="listbox" aria-label="Shopify asset results">
                      {menuEditorAssetsLoading ? (
                        <div className="editorAssetEmpty">Loading Shopify assets...</div>
                      ) : menuEditorAssetOptions.length < 1 ? (
                        <div className="editorAssetEmpty">No assets found in this category.</div>
                      ) : filteredMenuEditorAssetOptions.length < 1 ? (
                        <div className="editorAssetEmpty">No matching assets for this search.</div>
                      ) : (
                        filteredMenuEditorAssetOptions.map((option) => {
                          const active = menuEditorLinkTargetId === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={active ? "editorAssetOption active" : "editorAssetOption"}
                              onClick={() => {
                                setMenuEditorLinkTargetId(option.id);
                                setMenuEditorLinkQuery(option.title || option.handle || option.id);
                                setMenuEditorComboboxOpen(false);
                              }}
                              role="option"
                              aria-selected={active}
                            >
                              <span className="editorAssetTitle">{option.title || option.handle || option.id}</span>
                              <span className="editorAssetMeta">{option.handle || option.url || option.id}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="topbar" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowMenuEditor(false);
                  setMenuEditorComboboxOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void saveMenuEditor()}
                disabled={
                  saving ||
                  !menuEditorLabel.trim() ||
                  !menuEditorLinkTargetId.trim()
                }
              >
                {menuEditorMode === "add" ? "Add Item" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {undoPreviewEntries.length > 0 ? (
        <div
          className="previewOverlay"
          onClick={() => {
            setUndoPreviewEntryId("");
            setUndoSelectedEntryIds([]);
          }}
          role="dialog"
          aria-label="Undo actions preview"
        >
          <div className="editorModal" onClick={(event) => event.stopPropagation()}>
            <h3>Undo action preview</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              Review the selected tasks. Task 1 is the latest action.
            </p>
            <div className="reportList" style={{ marginTop: 12, maxHeight: 320 }}>
              {undoPreviewEntries.map((entry, index) => {
                const checked = undoSelectedEntryIds.includes(entry.id);
                return (
                  <label key={entry.id} className="typesOption" style={{ alignItems: "flex-start", padding: "8px 10px" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setUndoSelectedEntryIds((prev) =>
                          event.target.checked ? [...prev, entry.id] : prev.filter((id) => id !== entry.id)
                        );
                      }}
                    />
                    <span>
                      <b>Task {index + 1}</b> - {entry.title}
                      <br />
                      <span className="muted small">{entry.details.join(" | ")}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="topbar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setUndoPreviewEntryId("");
                  setUndoSelectedEntryIds([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={undoSelectedEntryIds.length < 1}
                onClick={() => setUndoConfirmOpen(true)}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {undoConfirmOpen ? (
        <div className="previewOverlay" onClick={() => setUndoConfirmOpen(false)} role="dialog" aria-label="Confirm undo">
          <div className="editorModal" onClick={(event) => event.stopPropagation()}>
            <h3>Confirm undo</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              You are about to revert {undoSelectedEntries.length} action(s).
            </p>
            <div className="reportList" style={{ marginTop: 12, maxHeight: 240 }}>
              {undoSelectedEntries.map((entry, index) => (
                <div key={entry.id} className="reportRow">
                  <span>{index + 1}. {entry.title}</span>
                  <span className="muted small">{entry.details.join(" | ")}</span>
                </div>
              ))}
            </div>
            <div className="topbar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" onClick={() => setUndoConfirmOpen(false)}>Back</button>
              <button type="button" className="primary" onClick={applyUndoSelection}>Confirm undo</button>
            </div>
          </div>
        </div>
      ) : null}

      {undoResult ? (
        <div className="previewOverlay" onClick={() => setUndoResult(null)} role="dialog" aria-label="Undo result">
          <div className="editorModal" onClick={(event) => event.stopPropagation()}>
            <h3>{undoResult.title}</h3>
            <div className="reportList" style={{ marginTop: 12, maxHeight: 280 }}>
              {undoResult.details.map((line, index) => (
                <div key={`${line}-${index}`} className="reportRow">
                  <span>{line}</span>
                </div>
              ))}
            </div>
            <div className="topbar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className="primary" onClick={() => setUndoResult(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {showRemoveConfirm ? (
        <div className="previewOverlay" onClick={() => setShowRemoveConfirm(false)} role="dialog" aria-label="Confirm remove from selected products">
          <div className="editorModal" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ color: "#fca5a5" }}>⚠ Remove from selected products?</h3>
            <p className="muted" style={{ marginTop: 8 }}>
              This will clear assignments for <strong style={{ color: "#e2e8f0" }}>{selectedProductCount} selected products</strong>.
            </p>
            <div className="topbar" style={{ justifyContent: "flex-end", marginTop: 16, gap: 8 }}>
              <button type="button" onClick={() => setShowRemoveConfirm(false)}>Cancel</button>
              <button
                type="button"
                className="dangerBtn"
                onClick={() => { setShowRemoveConfirm(false); removeAllCollectionsScaffold(); }}
              >
                Yes, Remove Selected
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {mappingExplainModal?.open ? (
        <div className="previewOverlay" onClick={() => setMappingExplainModal(null)} role="dialog" aria-label="Mapping decision details">
          <div className="editorModal mappingExplainModal" onClick={(event) => event.stopPropagation()}>
            <div className="mappingExplainHead">
              <div className="mappingExplainIdentity">
                <div className="mappingExplainThumb" aria-hidden="true">
                  {mappingExplainModal.image ? (
                    <img src={mappingExplainModal.image} alt="" />
                  ) : (
                    (mappingExplainModal.title || "")
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((part) => part.charAt(0))
                      .join("")
                      .toUpperCase() || "N/A"
                  )}
                </div>
                <div className="mappingExplainHeadMain">
                  <h3>{mappingExplainModal.title}</h3>
                  <div className="mappingExplainSub">
                    {mappingExplainModal.itemType || "-"} - UPC: {mappingExplainModal.upc || "-"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="mappingExplainCloseBtn"
                onClick={() => setMappingExplainModal(null)}
                aria-label="Close mapping decision dialog"
              >
                X
              </button>
            </div>
            <div className="mappingExplainBody">
              <div className="mappingExplainTopGrid">
                <div className="rowInspectorBlock">
                  <div className="mappingSectionTitle">IDENTITY</div>
                  <div className="mappingKvRow"><span>Title</span><b>{mappingExplainModal.title}</b></div>
                  <div className="mappingKvRow"><span>Type</span><b>{mappingExplainModal.itemType || "-"}</b></div>
                  <div className="mappingKvRow"><span>UPC</span><b>{mappingExplainModal.upc || "-"}</b></div>
                </div>
                <div className="rowInspectorBlock">
                  <div className="mappingSectionTitle">DECISION & STATUS</div>
                  <div className="mappingKvRow"><span>Decision</span><span className={`decisionBadge decision-${mappingExplainModal.mappingDecision.toLowerCase()}`}>{getUiStatusLabel(mappingExplainModal.mappingDecision)}</span></div>
                  <div className="mappingKvRow"><span>Approved</span><b>{mappingExplainModal.isReviewed ? "Yes" : "No"}</b></div>
                  <div className="mappingKvRow"><span>Sync Status</span><span className={`syncBadge sync-${mappingExplainModal.statusBadgeTone}`}>{mappingExplainModal.statusLabel}</span></div>
                  <div className="muted tiny"><b>Auto Paths</b>: {formatListPreview(mappingExplainModal.autoMappedPaths)}</div>
                  <div className="muted tiny"><b>Direct Collections</b>: {formatListPreview(mappingExplainModal.directCollections.map(getCollectionDisplayName))}</div>
                </div>
              </div>
              <div className="rowInspectorBlock">
                <div className="mappingSectionTitle">SUGGESTED CATEGORIES</div>
                {mappingExplainModal.suggestedMenuPaths.length > 0 || mappingExplainModal.suggestedDirectCollections.length > 0 ? (
                  <div className="suggestionChips mappingExplainSuggestionChips">
                    {mappingExplainModal.suggestedMenuPaths.map((path) => (
                      <button
                        key={`modal-suggested-menu-${path}`}
                        type="button"
                        className="suggestionChip selected"
                        data-tooltip={path}
                        onClick={(event) => event.preventDefault()}
                      >
                        {getLastPathSegment(path)}
                      </button>
                    ))}
                    {mappingExplainModal.suggestedDirectCollections.map((collection) => (
                      <button
                        key={`modal-suggested-collection-${collection}`}
                        type="button"
                        className="suggestionChip selected"
                        data-tooltip={getSuggestionTooltip("collection", getCollectionDisplayName(collection))}
                        onClick={(event) => event.preventDefault()}
                      >
                        {getCollectionDisplayName(collection)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="muted tiny">No suggestions available for this product.</div>
                )}
              </div>
              <div className="rowInspectorBlock">
                <div className="mappingSectionTitle">COLLECTION PATH DIFF - CURRENT VS FINAL</div>
                <div className="stage4ResultLine stage4ResultLineCurrent mappingExplainSummaryLine">
                  <b>Current:</b> {formatCompactPathSummary(mappingExplainModal.currentMenuPaths)}
                </div>
                <div className="stage4ResultLine stage4ResultLineFinal mappingExplainSummaryLine">
                  <b>Final:</b> {formatCompactPathSummary(mappingExplainModal.finalMenuPaths)}
                </div>
                {(() => {
                  const currentSet = new Set(dedupeNormalizedPaths(mappingExplainModal.currentMenuPaths));
                  const finalSet = new Set(dedupeNormalizedPaths(mappingExplainModal.finalMenuPaths));
                  const samePaths = Array.from(finalSet).filter((path) => currentSet.has(path));
                  const addedPaths = Array.from(finalSet).filter((path) => !currentSet.has(path));
                  const removedPaths = Array.from(currentSet).filter((path) => !finalSet.has(path));
                  if (samePaths.length < 1 && addedPaths.length < 1 && removedPaths.length < 1) {
                    return <div className="muted tiny">No collections assigned yet.</div>;
                  }
                  return (
                    <div className="rowInspectorDiffBlock">
                      {samePaths.map((path) => (
                        <div key={`same-${path}`} className="rowInspectorDiffSame">= {path}</div>
                      ))}
                      {addedPaths.map((path) => (
                        <div key={`add-${path}`} className="rowInspectorDiffAdd">+ {path}</div>
                      ))}
                      {removedPaths.map((path) => (
                        <div key={`remove-${path}`} className="rowInspectorDiffRemove">- {path}</div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {(mappingExplainModal.autoMapFailureReason || mappingExplainModal.autoMapFailureCode) && (
                <div className="rowInspectorBlock">
                  <div className="mappingSectionTitle">WHY IT WAS NOT AUTO-MAPPED</div>
                  <div className="muted tiny">{mappingExplainModal.autoMapFailureReason || "-"}</div>
                  {mappingExplainModal.autoMapFailureDetails.length > 0 ? (
                    <div className="muted tiny">{mappingExplainModal.autoMapFailureDetails.join(" | ")}</div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="topbar mappingExplainFooter" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="mappingExplainNeedsReviewBtn"
                onClick={markModalRowNeedsReview}
                disabled={saving || loading || executionBusy}
              >
                Needs Review
              </button>
              <button
                type="button"
                className="mappingExplainReadyBtn"
                onClick={markModalRowReadyToPush}
                disabled={saving || loading || executionBusy}
              >
                Ready to Push
              </button>
              <button type="button" className="primary" onClick={() => setMappingExplainModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
      </main>
      <div
        className="tableScrollDockWrap"
        ref={tableScrollDockWrapRef}
        aria-hidden="true"
        style={{
          left: `${Math.max(0, tableDockInsets.left + tableDockInsets.startOffset)}px`,
          right: `${Math.max(tableDockInsets.right, pageDockRightInset)}px`,
        }}
      >
        <div className="tableScrollDock" ref={tableScrollDockRef}>
          <div className="tableScrollDockSpacer" ref={tableScrollSpacerRef} />
        </div>
      </div>
      <style jsx>{`
        :global(html),
        :global(body) {
          height: 100%;
          overflow: hidden !important;
        }
        .page {
          --shell-content-top-offset: var(--collection-mapping-shell-content-top-offset, 100px);
          --notice-bar-height: 37px;
          --bottom-dock-lane-height: 12px;
          --bottom-dock-offset: 2px;
          --page-table-head-offset: 0px;
          --workspace-sticky-top: 8px;
          --notice-gap-to-workspace: 0px;
          --muted: #98a9c4;
          --text: #e8eef8;
          width: min(100%, calc(100vw - 24px));
          max-width: 100%;
          box-sizing: border-box;
          min-width: 0;
          margin: 0 auto;
          padding: 0 14px 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          height: calc(100dvh - var(--shell-content-top-offset) - var(--notice-bar-height) - var(--bottom-dock-lane-height) - var(--bottom-dock-offset));
          max-height: calc(100dvh - var(--shell-content-top-offset) - var(--notice-bar-height) - var(--bottom-dock-lane-height) - var(--bottom-dock-offset));
          overflow-x: hidden;
          overflow-y: auto;
          scrollbar-width: auto;
          scrollbar-color: #3c4f70 #0b1322;
          color: var(--text);
          font-family: Inter, Arial, sans-serif;
        }
        .page::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .page::-webkit-scrollbar-track {
          background: #0b1322;
        }
        .page::-webkit-scrollbar-thumb {
          background: #3c4f70;
          border-radius: 10px;
          border: 2px solid #0b1322;
        }
        .page::-webkit-scrollbar-thumb:hover {
          background: #5f789c;
        }
        .headerKpiOverlay {
          position: fixed;
          top: 35px;
          right: 28px;
          transform: translateY(-50%);
          z-index: 57;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
          align-items: center;
          pointer-events: none;
        }
        .headerKpiCard {
          width: 115px;
          min-width: 115px;
          max-width: 115px;
          padding: 4px 10px;
          border-radius: 12px;
          border: 1px solid #2a3a56;
          background: linear-gradient(180deg, #111c32, #0d1628);
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(14px) saturate(1.12);
          -webkit-backdrop-filter: blur(14px) saturate(1.12);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          pointer-events: auto;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .headerKpiCard:hover {
          transform: translateY(-1px);
        }
        .headerKpiCardActive {
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 0 0 2px rgba(148, 163, 184, 0.26);
        }
        .headerKpiLabel {
          font-size: 12px;
          color: #98a9c4;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          line-height: 1.1;
          margin-top: 0;
          transform: translateY(2px);
          white-space: nowrap;
        }
        .headerKpiValue {
          margin-top: 6px;
          font-size: 25px;
          font-weight: 650;
          line-height: 1;
          color: #e8eef8;
          align-self: flex-start;
        }
        .headerKpiCardLoaded {
          border-color: #3b82f6;
          background: linear-gradient(180deg, rgba(22, 57, 102, 0.92), rgba(15, 36, 68, 0.92));
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(191, 219, 254, 0.12),
            0 0 0 1px rgba(59, 130, 246, 0.08);
        }
        .headerKpiCardPending {
          border-color: #7c3aed;
          background: linear-gradient(180deg, rgba(84, 44, 142, 0.92), rgba(58, 28, 99, 0.92));
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(233, 213, 255, 0.12),
            0 0 0 1px rgba(124, 58, 237, 0.08);
        }
        .headerKpiCardReview {
          border-color: #f59e0b;
          background: linear-gradient(180deg, rgba(69, 45, 18, 0.94), rgba(49, 31, 12, 0.94));
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(253, 204, 136, 0.1),
            0 0 0 1px rgba(245, 158, 11, 0.08);
        }
        .headerKpiCardSuggestion {
          border-color: #3b82f6;
          background: linear-gradient(180deg, rgba(22, 57, 102, 0.92), rgba(15, 36, 68, 0.92));
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(191, 219, 254, 0.12),
            0 0 0 1px rgba(59, 130, 246, 0.08);
        }
        .headerKpiCardPushFailed {
          border-color: #ef4444;
          background: linear-gradient(180deg, rgba(67, 26, 30, 0.94), rgba(54, 20, 24, 0.94));
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(254, 202, 202, 0.1),
            0 0 0 1px rgba(239, 68, 68, 0.08);
        }
        .headerKpiCardSynced {
          border-color: #22c55e;
          background: linear-gradient(180deg, rgba(17, 52, 33, 0.94), rgba(12, 38, 24, 0.94));
          box-shadow:
            0 10px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(187, 247, 208, 0.1),
            0 0 0 1px rgba(34, 197, 94, 0.08);
        }
        .headerKpiCardPending .headerKpiLabel,
        .headerKpiCardPending .headerKpiValue {
          color: #f5f3ff;
        }
        .headerKpiCardPending .headerKpiLabel {
          letter-spacing: 0.02em;
        }
        .headerKpiCardPending .headerKpiLabel {
          letter-spacing: 0.02em;
        }
        .headerKpiCardLoaded .headerKpiLabel,
        .headerKpiCardLoaded .headerKpiValue {
          color: #dbeafe;
        }
        .headerKpiCardReview .headerKpiLabel,
        .headerKpiCardReview .headerKpiValue {
          color: #fdcc88;
        }
        .headerKpiCardSuggestion .headerKpiLabel,
        .headerKpiCardSuggestion .headerKpiValue {
          color: #dbeafe;
        }
        .headerKpiCardPushFailed .headerKpiLabel,
        .headerKpiCardPushFailed .headerKpiValue {
          color: #fecaca;
        }
        .headerKpiCardSynced .headerKpiLabel,
        .headerKpiCardSynced .headerKpiValue {
          color: #bbf7d0;
        }
        .pageNoticeFrame {
          --notice-bar-height: 37px;
          --notice-gap-to-workspace: 0px;
          width: min(100%, calc(100vw - 24px));
          max-width: 100%;
          box-sizing: border-box;
          min-width: 0;
          margin: 0 auto;
          padding: 0 14px;
          color: #e5e7eb;
          font-family: ui-sans-serif, system-ui, Segoe UI, Arial;
        }
        .page.pageExpanded {
          height: calc(100dvh - var(--shell-content-top-offset) - var(--notice-bar-height) - var(--bottom-dock-lane-height) - var(--bottom-dock-offset));
          max-height: calc(100dvh - var(--shell-content-top-offset) - var(--notice-bar-height) - var(--bottom-dock-lane-height) - var(--bottom-dock-offset));
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .pageBody {
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          flex: 1 1 auto;
          overflow: hidden;
          padding-bottom: 0;
        }
        .page :is(h1, h2, h3, h4, h5, h6, p, span, label, th, td, a, button, input, select, textarea, small, b) {
          font-family: Inter, Arial, sans-serif;
        }
        .noticeStandalone {
          margin: 0;
          padding: 0;
          top: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          background: transparent;
        }
        .workspaceSection {
          position: relative;
          display: flex;
          flex-direction: column;
          flex: 0 0 auto;
          min-height: 0;
          overflow: hidden;
        }
        .workspaceSection.workspaceSectionExpanded {
          flex: 1 1 auto;
          min-height: 0;
          height: 100%;
        }
        .workspaceGridHost {
          flex: 1 1 auto;
          min-height: 0;
          height: 100%;
        }
        .card {
          background: linear-gradient(180deg, #111c32, #0d1628);
          border: 1px solid #2a3a56;
          border-radius: 18px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38);
          padding: 12px;
        }
        h1,
        h2,
        h3,
        p {
          margin: 0;
        }
        .muted {
          color: var(--muted);
          font-size: 12px;
          font-weight: 500;
        }
        .small {
          font-size: 12px;
        }
        .noticeSlot {
          min-height: var(--notice-bar-height);
          height: var(--notice-bar-height);
          position: relative;
          z-index: 14;
          display: flex;
          align-items: stretch;
          padding-bottom: 0;
          background: transparent;
          overflow: hidden;
        }
        .noticeBar {
          border: 1px solid #2a3a56;
          border-radius: 9px;
          background: #0f1a2f;
          color: #dbe7f8;
          min-height: var(--notice-bar-height);
          height: var(--notice-bar-height);
          box-sizing: border-box;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 10px;
          position: relative;
          overflow: hidden;
        }
        .notice-warning {
          border-color: #f59e0b;
          background: #452d12;
          color: #fdcc88;
        }
        .notice-error {
          border-color: #ef4444;
          background: #431a1e;
          color: #fecaca;
        }
        .notice-progress {
          border-color: #3b82f6;
          background: #10213d;
          color: #dbeafe;
        }
        .noticeText {
          flex: 1 1 auto;
          font-size: clamp(11px, 1.05vw, 14px);
          line-height: 1.1;
          font-weight: 700;
          min-width: 0;
          white-space: nowrap;
        }
        .noticeProgressTrack {
          flex: 0 0 58px;
          width: 58px;
          height: 4px;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.25);
          overflow: hidden;
        }
        .noticeProgressFill {
          display: block;
          width: 42%;
          height: 100%;
          border-radius: 999px;
          background: #60a5fa;
          animation: noticeProgressSlide 1.05s linear infinite;
        }
        .noticeCloseBtn {
          margin-left: 6px;
          min-height: 22px;
          height: 22px;
          width: 22px;
          min-width: 22px;
          border-radius: 8px;
          border: 1px solid rgba(226, 232, 240, 0.4);
          background: rgba(15, 23, 42, 0.35);
          color: #cbd5e1;
          padding: 0;
          font-size: 11px;
          text-transform: uppercase;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .noticeCloseBtn:hover:not(:disabled) {
          border-color: rgba(226, 232, 240, 0.68);
          background: rgba(15, 23, 42, 0.56);
        }
        @keyframes noticeProgressSlide {
          from {
            transform: translateX(-120%);
          }
          to {
            transform: translateX(240%);
          }
        }
        h1 {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        h2 {
          font-size: 16px;
          font-weight: 700;
        }
        h3 {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        input,
        select,
        button {
          font-size: 12px;
          font-weight: 600;
        }
        input::placeholder {
          font-size: 12px;
          font-weight: 500;
        }
        table th {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        table td {
          font-size: 12.33px;
          font-weight: 600;
        }
        .topbar {
          position: relative;
          z-index: 200;
          overflow: visible;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          padding-left: 12px;
        }
        .productControls + .topbar {
          margin-top: 10px;
        }
        input,
        select,
        button {
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid #3c4f70;
          background: #122038;
          color: #e5edf9;
          padding: 0 12px;
        }
        button {
          cursor: pointer;
        }
        button:hover:not(:disabled) {
          border-color: #5f789c;
          background: #13233d;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .primary {
          border-color: #22c55e;
          background: #164029;
          color: #d8ffe8;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          gap: 6px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid #395071;
          background: #12213a;
          color: #dcebff;
          font-size: 12px;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          min-height: 36px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid #3c4f70;
          background: #152848;
          color: #d9e8ff;
          font-size: 12px;
          font-weight: 600;
        }
        .kpi {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .stage4SummaryGrid .k {
          min-width: 150px;
          flex: 1 1 150px;
        }
        .stage4SummaryGrid .kAutoMapped {
          border-color: #166534;
          background: #052e16;
        }
        .stage4SummaryGrid .kReview {
          border-color: #c2410c;
          background: #431407;
        }
        .stage4SummaryGrid .kAddPending {
          border-color: #1d4ed8;
          background: #0a1d33;
        }
        .stage4SummaryGrid .kRemovalPending {
          border-color: #991b1b;
          background: #3f0d0d;
        }
        .stage4SummaryGrid .kSynced {
          border-color: #065f46;
          background: #042f2e;
        }
        .workflowRail {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 8px;
        }
        .workflowStep {
          border: 1px solid #2a3547;
          border-radius: 8px;
          background: #0a1324;
          padding: 8px 10px;
          font-size: 11px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          color: #cbd5e1;
        }
        .workflowIndex {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid #334155;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: #93c5fd;
        }
        .k {
          border: 1px solid #2a3547;
          border-radius: 8px;
          padding: 8px;
          background: #0a1324;
          min-width: 130px;
        }
        .grid2 {
          display: grid;
          grid-template-columns: 339px 11px minmax(0, 1fr);
          gap: 0;
          align-items: start;
          height: 100%;
          min-height: 0;
        }
        .workspaceCard {
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .treePaneHost {
          box-sizing: border-box;
          min-height: 0;
          height: auto;
          overflow: visible;
          min-width: 0;
          display: flex;
          flex-direction: column;
          padding: 0 !important;
          align-self: start;
          position: sticky;
          top: var(--workspace-sticky-top);
          z-index: 40;
          transform-origin: left top;
          transition:
            width 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            min-width 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            max-width 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            height 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            min-height 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            max-height 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            padding 1100ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .treeWorkspacePanel {
          min-height: 0;
          height: auto;
        }
        .treePaneHost :global(.gemTreePanel) {
          opacity: 1;
          transform: none;
          padding-left: 13px !important;
          padding-right: 13px !important;
        }
        .treePaneHost :global(.treeSearchBar),
        .treePaneHost :global(.treeContent),
        .treePaneHost :global(.unmappedWrap) {
          box-sizing: border-box !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
        }
        .treePaneHost.treePaneHostCollapsed {
          flex: 0 0 auto;
          justify-content: flex-start;
          align-items: flex-start;
          align-self: start;
          position: sticky;
          top: var(--workspace-sticky-top);
          z-index: 2147483001;
          border: 0 !important;
          outline: 1px solid #2a3a56;
          outline-offset: -1px;
          box-shadow: none !important;
          width: 66px !important;
          min-width: 66px !important;
          max-width: 66px !important;
          height: 76px;
          min-height: 76px;
          max-height: 76px;
          padding: 0 !important;
        }
        .grid2 > .card.panel.treePaneHost.treePaneHostCollapsed {
          height: 76px !important;
          min-height: 76px !important;
          max-height: 76px !important;
          width: 66px !important;
          min-width: 66px !important;
          max-width: 66px !important;
          align-self: start;
          overflow: hidden;
          padding: 0 !important;
          position: sticky;
          top: var(--workspace-sticky-top);
          z-index: 2147483001;
          border: 0 !important;
          outline: 1px solid #2a3a56;
          outline-offset: -1px;
          box-shadow: none !important;
        }
        .treePaneHost.treePaneHostCollapsed :global(.gemTreePanel) {
          opacity: 1;
          position: relative;
          z-index: 13;
          transform: none;
        }
        .treePaneHost :global(.treeContent),
        .treePaneHost :global(.unmappedWrap) {
          opacity: 1;
          transform: none;
          overflow-x: hidden;
          overflow-y: visible !important;
          max-height: none !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          scrollbar-gutter: auto !important;
        }
        .treePaneHost :global(.unmappedList) {
          margin: 0 !important;
          list-style: none !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
        .treePaneHost :global(.unmappedCard) {
          inline-size: 100% !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          justify-self: stretch !important;
          box-sizing: border-box !important;
        }
        .treePaneHost :global(.treeRow),
        .treePaneHost :global(.treeAddBtn),
        .treePaneHost :global(.unmappedCard) {
          box-sizing: border-box !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        .treePaneHost :global(.unmappedHead) {
          margin: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .treePaneHost :global(.unmappedCount) {
          margin-right: 0 !important;
        }
        .treePaneHost.treePaneHostCollapsed :global(.treeContent),
        .treePaneHost.treePaneHostCollapsed :global(.unmappedWrap) {
          opacity: 1;
          transform: none;
          pointer-events: none;
        }
        .grid2 > .card.panel {
          height: 100%;
          max-height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .grid2 > .card.panel.treePaneHost:not(.treePaneHostCollapsed) {
          border: 0 !important;
          outline: 1px solid #2a3a56;
          outline-offset: -1px;
          box-sizing: border-box;
          height: auto;
          max-height: none;
          overflow: visible;
          position: sticky;
          top: var(--workspace-sticky-top);
          z-index: 40;
        }
        .grid2 > .card.panel.productPanel {
          position: relative;
          z-index: 30;
          overflow: hidden;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .paneDivider {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 5px;
          min-width: 5px;
          max-width: 5px;
          margin: 0 3px;
          justify-self: center;
          cursor: col-resize;
          position: sticky;
          top: var(--workspace-sticky-top);
          align-self: start;
          height: 800px;
          min-height: 800px;
          max-height: 800px;
          z-index: 45;
          border-radius: 999px;
          outline: none;
          overflow: hidden;
          box-sizing: border-box;
          padding: 0;
          border: 0;
          background: transparent;
          transition:
            width 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            opacity 1100ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .paneDividerGrip {
          width: 5px;
          min-width: 5px;
          height: 800px;
          min-height: 800px;
          max-height: 800px;
          border-radius: 999px;
          background: #33506e;
          transition: background-color 120ms ease, box-shadow 120ms ease;
        }
        .paneDivider:hover .paneDividerGrip,
        .paneDivider.resizing .paneDividerGrip,
        .paneDivider:focus-visible .paneDividerGrip {
          background: #60a5fa;
          box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4);
        }
        .paneDivider:focus-visible {
          box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.4);
          border-radius: 999px;
        }
        .paneDivider.paneDividerCollapsed {
          width: 0;
          min-width: 0;
          max-width: 0;
          margin: 0;
          opacity: 0;
          pointer-events: none;
        }
        .workspaceHeightDivider {
          margin-top: 8px;
          width: 100%;
          height: 16px;
          min-height: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          cursor: row-resize;
          outline: none;
          padding: 0;
          border: 0;
          background: transparent;
        }
        .workspaceHeightGrip {
          width: 84px;
          height: 4px;
          border-radius: 999px;
          background: #33506e;
          transition: background-color 120ms ease, box-shadow 120ms ease;
        }
        .workspaceHeightDivider:hover .workspaceHeightGrip,
        .workspaceHeightDivider.resizing .workspaceHeightGrip,
        .workspaceHeightDivider:focus-visible .workspaceHeightGrip {
          background: #60a5fa;
          box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.4);
        }
        .workspaceHeightDivider:focus-visible {
          box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.35);
        }
        .panel {
          padding: 10px;
        }
        .productPanel {
          position: relative;
          min-height: 0;
          overflow: visible !important;
          background: linear-gradient(180deg, #111c32, #0d1628);
          border: 1px solid #2a3a56;
          border-radius: 18px;
          padding: 0;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38);
          isolation: isolate;
          transform-origin: left top;
          transition:
            margin-left 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            box-shadow 1100ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .productPanel.treePaneCollapsed {
          margin-left: -67px;
        }
        .productPanel.treePaneCollapsed::before {
          content: "";
          position: absolute;
          top: 1px;
          left: 1px;
          width: 72px;
          height: 74px;
          background: linear-gradient(180deg, #111c32, #0d1628);
          border-top-left-radius: 17px;
          pointer-events: none;
          z-index: 3;
        }
        .productControls {
          position: sticky;
          top: var(--workspace-sticky-top);
          z-index: 2147483405;
          isolation: isolate;
          overflow: visible;
          display: flex;
          flex-wrap: nowrap;
          gap: 8px;
          align-items: center;
          margin-bottom: 0;
          width: 100%;
          padding: 12px;
          border-bottom: 1px solid #2a3a56;
          background: #0f1a2f;
          box-shadow: 0 1px 0 #24354e;
          transition:
            width 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            margin-left 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            padding-left 1100ms cubic-bezier(0.22, 0.61, 0.36, 1),
            border-radius 1100ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .appliedFilterChips {
          position: sticky;
          top: calc(var(--workspace-sticky-top) + 62px);
          z-index: 2147483404;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 8px 12px;
          border-bottom: 1px solid #2a3a56;
          background: #0f1a2f;
        }
        .appliedFilterChip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid #3b82f6;
          background: #1a3050;
          color: #bfdbfe;
          font-size: 12px;
          font-weight: 600;
        }
        .appliedFilterChipClose {
          width: 18px;
          min-width: 18px;
          height: 18px;
          min-height: 18px;
          border: 0;
          border-radius: 6px;
          padding: 0;
          background: transparent;
          color: #93c5fd;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .appliedFilterChipClose:hover {
          background: rgba(147, 197, 253, 0.15);
          color: #ffffff;
        }
        .productPanel.treePaneCollapsed .productControls {
          padding-left: 72px;
        }
        .stage4BulkToolbar {
          margin-top: 0;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid #2a3a56;
          background: #0d182c;
        }
        .contextualBulkBar {
          background: #0f1e38;
          border-bottom: 1px solid #2a3a56;
          padding: 8px 12px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          animation: bulkBarIn 0.18s ease;
        }
        @keyframes bulkBarIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .commitMenuWrap {
          position: relative;
          z-index: 320;
          overflow: visible;
        }
        .commitMenuTrigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 36px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid #22c55e !important;
          background: #166534 !important;
          color: #dcfce7 !important;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .commitMenuTrigger:hover:not(:disabled) {
          background: #15803d;
        }
        .commitMenuTrigger:disabled {
          opacity: 1;
          cursor: not-allowed;
          border-color: #22c55e !important;
          background: #166534 !important;
          color: #dcfce7 !important;
        }
        .commitMenuArrow {
          font-size: 10px;
          opacity: 0.7;
        }
        .commitMenu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          left: auto;
          min-width: 380px;
          max-width: min(520px, calc(100vw - 20px));
          z-index: 2147483500;
          border: 1px solid #3f5f8f;
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(15, 33, 60, 0.98), rgba(12, 26, 48, 0.98));
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.56);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow: visible;
          pointer-events: auto;
        }
        .commitMenuSection {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #89b2df;
          text-transform: uppercase;
          padding: 4px 10px 0;
        }
        .commitMenuSafeActions {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .commitMenuItem {
          width: 100%;
          text-align: left;
          min-height: 0;
          height: auto;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid #38577e;
          background: #163256;
          cursor: pointer;
          display: grid;
          grid-template-rows: auto auto;
          align-content: start;
          gap: 5px;
          transition: background 0.13s, border-color 0.13s;
        }
        .commitMenuItem:hover:not(:disabled) {
          background: #1d3e69;
          border-color: #4f7bb2;
        }
        .commitMenuItem:disabled {
          opacity: 1;
          cursor: not-allowed;
          border-color: #355173;
          background: #132947;
        }
        .commitMenuItemTitle {
          font-size: 15px;
          font-weight: 700;
          color: #e8f2ff;
          white-space: normal;
          line-height: 1.25;
        }
        .commitMenuItemSub {
          font-size: 12px;
          color: #c8dcf8;
          white-space: normal;
          line-height: 1.25;
        }
        .commitMenuDivider {
          height: 1px;
          background: #33527b;
          margin: 6px 0 2px;
        }
        .commitMenuDanger {
          background: #4d1e26;
          border: 1px solid #8f3342;
        }
        .commitMenuDanger .commitMenuItemTitle {
          color: #ff9aa9;
        }
        .commitMenuDanger .commitMenuItemSub {
          color: #ffd3da;
        }
        .commitMenuDanger:hover:not(:disabled) {
          background: #5b2430;
          border-color: #b1465a;
        }
        .commitMenuPushAction .commitMenuItemTitle {
          color: #3df084;
        }
        .commitMenuPushAction .commitMenuItemSub {
          color: #e9fff1;
        }
        .commitMenuPushAction:disabled .commitMenuItemTitle {
          color: #6abf8f;
        }
        .commitMenuPushAction:disabled .commitMenuItemSub {
          color: #9fc8af;
        }
        .commitMenuDanger:disabled .commitMenuItemTitle {
          color: #a97a84;
        }
        .commitMenuDanger:disabled .commitMenuItemSub {
          color: #9d7f86;
        }
        .dangerBtn {
          border-color: #ef4444;
          color: #ffd7dc;
          background: #3f181d;
        }
        /* Queue tabs are promoted to primary workflow filters directly above the table. */
        .queueFilterRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 10px;
        }
        .queueFilterTab {
          min-height: 32px;
          height: 32px;
          padding: 0 10px;
          border: 1px solid #3b5073;
          border-radius: 10px;
          background: #11203a;
          color: #d7e5fb;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
        }
        .queueFilterTab.active {
          border-color: #5f789c;
          border-bottom-color: #3b82f6;
          box-shadow: inset 0 -2px 0 #3b82f6;
          color: #ffffff;
        }
        .queueFilterCount {
          min-width: 18px;
          padding: 0 6px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid #3c4f70;
          background: #152848;
          color: #cfe0fb;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          line-height: 1;
        }
        .queueFilterCountSynced {
          background: #113025;
          border-color: #22c55e;
          color: #bbf7d0;
        }
        .productSearchInput {
          width: 410px;
          min-width: 410px;
          max-width: 410px;
          flex: 0 0 410px;
          border-color: #22c55e;
          background: #113025;
          color: #d8ffe8;
        }
        .productSearchInput::placeholder {
          color: #9adbb7;
        }
        .productSearchInput:focus {
          outline: 2px solid rgba(34, 197, 94, 0.42);
          outline-offset: 1px;
          border-color: #4ade80;
          background: #123924;
        }
        .productSearchBtn {
          min-width: 36px;
          flex: 0 0 auto;
        }
        .productControlsSpacer {
          flex: 1 1 auto;
          min-width: 0;
        }
        .typesDropdown {
          position: relative;
          flex: 0 0 auto;
        }
        .productRefreshBtn {
          min-width: 36px;
          justify-self: auto;
        }
        .reportsTriggerBtn {
          margin-left: 0;
        }
        .productIconBtn {
          width: 38px;
          min-width: 38px;
          height: 38px;
          min-height: 38px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0;
          line-height: 1;
          border-width: 1px;
          border-style: solid;
        }
        .productIconBtn svg {
          width: 18px;
          height: 18px;
          display: block;
          opacity: 1;
          filter: drop-shadow(0 0 0.35px currentColor);
        }
        .quickTooltip {
          position: relative;
        }
        .quickTooltip[data-tooltip]::after {
          content: attr(data-tooltip);
          position: absolute;
          left: 50%;
          bottom: calc(100% + 6px);
          transform: translate(-50%, 2px);
          opacity: 0;
          pointer-events: none;
          white-space: nowrap;
          padding: 4px 7px;
          border-radius: 6px;
          border: 1px solid #5f789c;
          background: #0b1322;
          color: #e5edf9;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          z-index: 2147483600;
          transition: opacity 70ms ease, transform 70ms ease;
        }
        .quickTooltip[data-tooltip]:hover::after,
        .quickTooltip[data-tooltip]:focus-visible::after {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        .productIconBtnGreen {
          border-color: #168e69 !important;
          background: #0d7a57 !important;
          color: #dcfce7 !important;
        }
        .productIconBtnGreen:hover:not(:disabled) {
          border-color: #22c55e !important;
          background: #15803d !important;
        }
        .toolbarPlaceholderBtn {
          opacity: 1;
          border-color: #4f6b8c !important;
          background: #182e4f !important;
          color: #eef6ff !important;
        }
        .toolbarPlaceholderBtn:hover:not(:disabled) {
          border-color: #89a7cf !important;
          background: #26446d !important;
        }
        .moreFiltersBtn {
          min-height: 36px;
          padding: 0 14px;
          border-radius: 10px;
          border: 1px solid #4f6b8c !important;
          background: #182e4f !important;
          color: #eef6ff !important;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .moreFiltersBtn:hover:not(:disabled) {
          border-color: #89a7cf !important;
          background: #26446d !important;
        }
        .reportsTriggerBtn,
        .commitMenuTrigger {
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .typesDropdownBtn {
          min-width: 170px;
          justify-content: flex-start;
        }
        .filtersDrawerOverlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.62);
          z-index: 2147483400;
        }
        .filtersDrawer {
          position: fixed;
          top: 0;
          right: 0;
          width: min(380px, 95vw);
          height: 100vh;
          background: #0f172a;
          border-left: 1px solid #2a3a56;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38);
          z-index: 2147483401;
          transform: translateX(100%);
          transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
          display: grid;
          grid-template-rows: auto 1fr auto;
        }
        .filtersDrawer.open {
          transform: translateX(0);
        }
        .filtersDrawerHead {
          padding: 12px 14px;
          border-bottom: 1px solid #2a3a56;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .filtersDrawerHead strong {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.01em;
        }
        .filtersDrawerCloseBtn {
          min-height: 30px;
          padding: 0 8px;
        }
        .filtersDrawerBody {
          padding: 10px;
          overflow: auto;
          display: grid;
          gap: 8px;
        }
        .filtersDrawerFoot {
          padding: 10px 12px;
          border-top: 1px solid #2a3a56;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .filtersDrawerFoot button {
          font-size: 13px;
        }
        .filtersField {
          border: 1px solid #2a3a56;
          border-radius: 9px;
          background: #0e1a30;
          padding: 7px 8px;
          display: grid;
          gap: 4px;
        }
        .filtersField h4 {
          font-size: 13px;
          color: #dce9ff;
          margin: 0 0 4px;
        }
        .filtersFieldOption {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 0;
          min-height: 24px;
          font-size: 13px;
          cursor: pointer;
        }
        .filtersTypeDropdown {
          position: relative;
        }
        .filtersTypeDropdownBtn {
          width: 100%;
          min-height: 30px;
          border-radius: 8px;
          border: 1px solid #3c4f70;
          background: #152848;
          color: #e5edf9;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 10px;
          font-size: 13px;
          font-weight: 600;
        }
        .filtersTypeDropdownBtn:hover {
          border-color: #5f789c;
          background: #1b3f73;
        }
        .filtersTypeDropdownCaret {
          color: #9fc0e8;
          font-size: 10px;
        }
        .filtersTypeDropdownMenu {
          margin-top: 6px;
          border: 1px solid #2a3a56;
          border-radius: 10px;
          background: #0f1a2f;
          padding: 6px;
          display: grid;
          gap: 4px;
          max-height: calc(10 * 30px);
          overflow: auto;
        }
        .filtersTypeOption {
          min-height: 28px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          cursor: pointer;
        }
        .filtersFieldEmpty {
          color: #98a9c4;
          font-size: 13px;
        }
        tbody tr.statusTone-synced > td:first-child {
          box-shadow: inset 4px 0 0 #22c55e;
        }
        tbody tr.statusTone-add-pending > td:first-child,
        tbody tr.statusTone-removal-pending > td:first-child {
          box-shadow: inset 4px 0 0 #7c3aed;
        }
        tbody tr.statusTone-failed > td:first-child {
          box-shadow: inset 4px 0 0 #ef4444;
        }
        tbody tr.statusTone-review > td:first-child {
          box-shadow: inset 4px 0 0 #f59e0b;
        }
        .productRefreshBtn,
        .productSearchBtn,
        .reportsTriggerBtn,
        .typesDropdownBtn,
        .topbar button:not(.primary):not(.dangerBtn):not(.commitMenuTrigger):not(.commitMenuItem),
        .pagerBar > button,
        .pagerNav > button {
          border-color: #3c4f70;
          background: #152848;
          color: #e5edf9;
        }
        .productRefreshBtn:hover:not(:disabled),
        .productSearchBtn:hover:not(:disabled),
        .reportsTriggerBtn:hover:not(:disabled),
        .typesDropdownBtn:hover:not(:disabled),
        .topbar button:not(.primary):not(.dangerBtn):not(.commitMenuTrigger):not(.commitMenuItem):hover:not(:disabled),
        .pagerBar > button:hover:not(:disabled),
        .pagerNav > button:hover:not(:disabled) {
          border-color: #5f789c;
          background: #1b3f73;
        }
        .topbar button:not(.primary):not(.dangerBtn):not(.commitMenuTrigger):not(.commitMenuItem) {
          min-height: 36px;
          border-radius: 10px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .treeRefreshBtn {
          width: 36px;
          min-width: 36px;
          min-height: 36px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          line-height: 1;
        }
        .treeSearchBar {
          margin-top: 0;
          display: grid;
          grid-template-columns: 36px 36px 36px minmax(0, 1fr) 36px;
          align-items: center;
          gap: 8px;
        }
        .treeSearchInput {
          min-width: 0;
        }
        .typesDropdownMenu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          width: 280px;
          max-width: min(90vw, 280px);
          z-index: 20;
          border: 1px solid #2a3a56;
          border-radius: 12px;
          background: #0f172a;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38);
          padding: 8px;
        }
        .typesResetBtn {
          width: 100%;
          justify-content: center;
          margin-bottom: 8px;
        }
        .typesList {
          max-height: 240px;
          overflow: auto;
          border: 1px solid #1f2937;
          border-radius: 8px;
          padding: 4px;
          background: #0b1322;
          display: grid;
          gap: 2px;
        }
        .typesOption {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }
        .typesOption:hover {
          background: #122033;
        }
        .typesOption input {
          min-height: 0;
          width: 14px;
          height: 14px;
          margin: 0;
          padding: 0;
        }
        .typesEmpty {
          padding: 10px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
        }
        /* Tree-specific visuals are owned by components/shopify-menu-items-tree.tsx to avoid style collisions. */
        .editorModal {
          width: min(460px, 92vw);
          border-radius: 12px;
          border: 1px solid #2a3547;
          background: #0b1322;
          padding: 14px;
          display: grid;
          gap: 12px;
        }
        .editorField {
          display: grid;
          gap: 6px;
        }
        .editorField label {
          font-size: 12px;
          color: #cbd5e1;
        }
        .editorModal select {
          color: #e5e7eb;
          background: #0a1324;
          border-color: #334155;
        }
        .editorModal select option {
          color: #e5e7eb;
          background: #0a1324;
        }
        .editorLinkSection {
          border: 1px solid #243042;
          border-radius: 10px;
          padding: 10px;
          display: grid;
          gap: 10px;
          background: #0a1220;
        }
        .editorCombobox {
          position: relative;
          display: grid;
          gap: 6px;
        }
        .editorAssetList {
          max-height: 220px;
          overflow: auto;
          display: grid;
          gap: 6px;
          border: 1px solid #243042;
          border-radius: 8px;
          padding: 6px;
          background: #0b1322;
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          z-index: 20;
          box-shadow: 0 16px 32px rgba(2, 6, 23, 0.45);
        }
        .editorAssetOption {
          width: 100%;
          min-height: 0;
          height: auto;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid #2b3b52;
          background: #0f1b31;
          color: #e2e8f0;
          text-align: left;
          display: grid;
          gap: 2px;
        }
        .editorAssetOption:hover {
          border-color: #44648c;
          background: #13243f;
        }
        .editorAssetOption.active {
          border-color: #60a5fa;
          background: #0f2650;
          box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.35);
        }
        .editorAssetTitle {
          font-size: 12px;
          color: #e2e8f0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .editorAssetMeta {
          font-size: 11px;
          color: #94a3b8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .editorAssetEmpty {
          padding: 14px 10px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
        }
        .editorLinkHeading {
          margin: 0;
          font-size: 12px;
          color: #e2e8f0;
          font-weight: 600;
        }
        .tableWrap {
          --group-head-height: 0px;
          position: relative;
          z-index: 0;
          flex: 1 1 auto;
          min-height: 0;
          /* overflow-x:scroll is required — browsers only honour position:sticky inside a real scroll container.
             The native scrollbar UI is hidden via CSS below; the custom dock drives scrollLeft via JS. */
          overflow-x: scroll;
          overflow-y: auto;
          border-top: 1px solid #2a3a56;
          border-bottom: 1px solid #2a3a56;
          border-left: 0;
          border-right: 0;
          border-radius: 0;
          background: transparent;
          max-height: none;
          scrollbar-width: none; /* Firefox: hide all native bars */
        }
        .tableWrap::-webkit-scrollbar {
          width: 0;   /* hide vertical native (custom dock used) */
          height: 0;  /* hide horizontal native (custom dock used) */
        }
        .tableScrollDockWrap {
          position: fixed;
          /* left/right are set dynamically via inline style to align with the product panel */
          bottom: var(--bottom-dock-offset, 0px);
          z-index: 2147483000;
          pointer-events: none;
          height: 12px;
          min-height: 12px;
          max-height: 12px;
          padding: 0;
          background: #0b1322;
          isolation: isolate;
          transform: translateZ(0);
          border-top: 1px solid #2a3a56;
        }
        .tableScrollDock {
          position: relative;
          z-index: 2147483001;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          height: 12px;
          min-height: 12px;
          max-height: 12px;
          pointer-events: auto;
          scrollbar-width: auto;
          scrollbar-color: #3c4f70 #0b1322;
          background: #0b1322;
          border-top: 1px solid #2a3a56;
          padding: 0;
        }
        .tableScrollDock::-webkit-scrollbar {
          height: 12px;
        }
        .tableScrollDock::-webkit-scrollbar-track {
          background: #0b1322;
          border: 0;
        }
        .tableScrollDock::-webkit-scrollbar-thumb {
          background: #3c4f70;
          border-radius: 10px;
          border: 0;
        }
        .tableScrollDockSpacer {
          height: 1px;
          min-width: 100%;
        }
        /* Custom vertical scroll dock — fixed at right edge of screen, spans table row area */
        .tableScrollDockVertWrap {
          position: fixed;
          width: 10px;
          z-index: 2147483000;
          background: #0b1322;
          border-left: 1px solid #2a3a56;
          pointer-events: none;
        }
        .tableScrollDockVertThumb {
          position: absolute;
          right: 0;
          width: 10px;
          border-radius: 4px;
          background: #3c4f70;
          cursor: default;
          pointer-events: auto;
          display: none;
          transition: background 120ms ease;
        }
        .tableScrollDockVertThumb:hover,
        .tableScrollDockVertThumb:active {
          background: #4e6691;
        }
        /* Pager bar: add bottom padding so it clears the 12px horizontal dock with a visible gap */
        .topbar.pagerBar {
          padding-bottom: 24px;
          flex-shrink: 0;
        }
        .tableWrap table {
          border-collapse: separate;
          border-spacing: 0;
          width: max-content;
          min-width: 100%;
          table-layout: fixed;
        }
        thead {
          position: sticky;
          top: 0;
          z-index: 34;
          isolation: isolate;
          transform: none;
          will-change: auto;
        }
        th,
        td {
          border-bottom: 1px solid #24354e;
          padding: 10px;
          white-space: nowrap;
          font-size: 12px;
          vertical-align: middle;
          box-sizing: border-box;
        }
        tbody tr {
          height: 92px;
          min-height: 92px;
          max-height: 92px;
        }
        tbody td {
          height: 92px;
          min-height: 92px;
          max-height: 92px;
          box-sizing: border-box;
          vertical-align: middle;
          overflow: hidden;
        }
        tbody td.autoMappedCol,
        tbody td.suggestedCol {
          overflow: visible;
        }
        .stickyCheckboxCol,
        .stickyEyeCol,
        .stickyPictureCol,
        .stickyProductNameCol {
          position: sticky;
          z-index: 7;
          background: #0f1a2f;
        }
        .stickyCheckboxCol {
          left: 0;
          min-width: 52px;
          width: 52px;
        }
        .stickyEyeCol {
          left: 52px;
          min-width: 55px;
          width: 55px;
        }
        .stickyPictureCol {
          left: 107px;
          min-width: 101px;
          width: 101px;
        }
        .stickyProductNameCol {
          left: 208px;
          width: 300px;
          min-width: 300px;
          max-width: 300px;
          z-index: 9;
          box-shadow: 4px 0 8px rgba(3, 8, 18, 0.32);
        }
        th {
          position: sticky;
          top: 0;
          background: #111f36;
          color: #d7e1ef;
          text-transform: uppercase;
          font-size: 20px;
          z-index: 20;
          background-clip: padding-box;
          box-shadow: 0 1px 0 #24354e;
        }
        thead th {
          position: sticky;
          top: 0;
          z-index: 36;
        }
        thead .stickyCheckboxCol,
        thead .stickyEyeCol,
        thead .stickyPictureCol,
        thead .stickyProductNameCol {
          z-index: 41;
          background: #111f36;
        }
        tbody .stickyCheckboxCol,
        tbody .stickyEyeCol,
        tbody .stickyPictureCol,
        tbody .stickyProductNameCol {
          z-index: 15;
        }
        .groupHead th {
          top: 0;
          z-index: 4;
          background: #0d1931;
          color: #9fb4d0;
          font-size: 12px;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #24354e;
          text-transform: uppercase;
          text-align: center;
          height: var(--group-head-height);
          padding-top: 0;
          padding-bottom: 0;
        }
        .autoMappedCol {
          min-width: 160px;
          width: 160px;
        }
        .suggestedCol {
          min-width: 220px;
          width: 220px;
        }
        .mappingDecisionCol {
          min-width: 110px;
          width: 110px;
        }
        .reviewedCol {
          min-width: 120px;
          width: 120px;
        }
        .syncStatusCol {
          min-width: 140px;
          width: 140px;
        }
        .stage4HeadCol {
          text-align: left;
          min-width: 620px;
          width: auto;
          max-width: none;
        }
        tbody tr:hover {
          background: #132543;
        }
        tbody tr:hover .stickyCheckboxCol,
        tbody tr:hover .stickyEyeCol,
        tbody tr:hover .stickyPictureCol,
        tbody tr:hover .stickyProductNameCol {
          background: #132543;
        }
        tbody tr.selectedProductRow {
          background: #17315a;
        }
        tbody tr.selectedProductRow .stickyCheckboxCol,
        tbody tr.selectedProductRow .stickyEyeCol,
        tbody tr.selectedProductRow .stickyPictureCol,
        tbody tr.selectedProductRow .stickyProductNameCol {
          background: #17315a;
        }
        tbody tr.activeProductRow {
          background: #17315a;
        }
        tbody tr.activeProductRow .stickyCheckboxCol,
        tbody tr.activeProductRow .stickyEyeCol,
        tbody tr.activeProductRow .stickyPictureCol,
        tbody tr.activeProductRow .stickyProductNameCol {
          background: #17315a;
        }
        tbody tr.manualReviewRow {
          box-shadow: inset 3px 0 0 #f59e0b;
        }
        .sortHead {
          padding: 0;
        }
        .sortHeadText {
          width: 100%;
          min-height: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          text-transform: uppercase;
          font-size: 12px;
          font-weight: 700;
          color: #d7e1ef;
          padding: 10px;
          cursor: pointer;
          user-select: none;
        }
        .sortArrow {
          min-width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 1px solid rgba(125, 211, 252, 0.55);
          background: rgba(30, 58, 95, 0.8);
          color: #7dd3fc;
          font-size: 12px;
          font-weight: 900;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .center {
          text-align: center;
        }
        .pagerBar {
          width: 100%;
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: nowrap;
          padding: 10px 12px;
          border-top: 1px solid #2a3a56;
          background: #0f1a2f;
        }
        .pagerNav {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .pagerPageLabel {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 92px;
          text-align: center;
        }
        .pagerPerPage {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        .pagerPerPageSelect {
          width: auto;
          min-width: 72px;
          max-width: 86px;
          padding: 0 8px;
          min-height: 32px;
          height: 32px;
          font-size: 12px;
          line-height: 1;
          color-scheme: dark;
          color: #e5e7eb;
          background: #0b1322;
          border-color: #334155;
        }
        .pagerPerPageSelect option {
          color: #e5e7eb;
          background: #0b1322;
        }
        .pagerBar > button,
        .pagerNav > button {
          min-height: 32px;
          height: 32px;
          padding: 0 9px;
          line-height: 1;
        }
        .pagerBar .muted {
          font-size: 11px;
        }
        .pagerBar select {
          color-scheme: dark;
          color: #e5e7eb;
          background: #0b1322;
          border-color: #334155;
        }
        .pagerBar select option {
          color: #e5e7eb;
          background: #0b1322;
        }
        .imgCell {
          width: 88px;
          min-width: 88px;
          max-width: 88px;
          text-align: center;
        }
        .thumbBtn {
          border: 0;
          padding: 0;
          background: transparent;
          min-height: 0;
          line-height: 0;
          border-radius: 4px;
        }
        .productNameCol {
          text-align: center;
        }
        .upcCol {
          text-align: center;
        }
        .sourceParserCol,
        .routingProofCol,
        .autoMappedCol,
        .suggestedCol,
        .mappingDecisionCol,
        .reviewedCol,
        .syncStatusCol {
          text-align: center;
        }
        .reviewedCheckboxLabel {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          cursor: pointer;
          width: 100%;
        }
        .decisionBadge,
        .syncBadge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          padding: 0 8px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 13.33px;
          font-weight: 700;
        }
        .decisionBadgeBtn {
          cursor: pointer;
        }
        .decision-auto_mapped {
          background: #123522;
          border-color: #22c55e;
          color: #bbf7d0;
        }
        .decision-suggested {
          background: #163966;
          border-color: #3b82f6;
          color: #bfdbfe;
        }
        .decision-manual_review {
          background: #452d12;
          border-color: #f59e0b;
          color: #fdcc88;
        }
        .sync-synced {
          background: #123522;
          border-color: #22c55e;
          color: #bbf7d0;
        }
        .sync-add-pending {
          background: #3f2368;
          border-color: #7c3aed;
          color: #f5f3ff;
        }
        .sync-removal-pending {
          background: #3f2368;
          border-color: #7c3aed;
          color: #f5f3ff;
        }
        .sync-failed {
          background: #4b1f24;
          border-color: #ef4444;
          color: #fecaca;
        }
        .sync-review {
          background: #452d12;
          border-color: #f59e0b;
          color: #fdcc88;
        }
        .tiny {
          font-size: 10px;
          margin-top: 4px;
          line-height: 1.3;
          display: block;
        }
        .productNameCol .tiny {
          font-size: 12.66px;
          line-height: 1.25;
        }
        .suggestionChips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 6px;
        }
        .tableSuggestionChips {
          display: grid;
          width: max-content;
          max-width: 100%;
          margin: 0 auto;
          gap: 6px 8px;
          justify-content: center;
          align-content: center;
        }
        .tableSuggestionChipsCount1 {
          grid-template-columns: max-content;
        }
        .tableSuggestionChipsCount2,
        .tableSuggestionChipsCount3,
        .tableSuggestionChipsCount4 {
          grid-template-columns: repeat(2, max-content);
        }
        .tableSuggestionChipsCount3 .suggestionChip:last-child {
          grid-column: 1 / span 2;
          justify-self: center;
        }
        .tableSuggestionChipsCount4 .suggestionChip:nth-child(1),
        .tableSuggestionChipsCount4 .suggestionChip:nth-child(4) {
          grid-column: 1 / span 2;
          justify-self: center;
        }
        .autoPathChips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 4px 6px;
        }
        .autoPathChip,
        .suggestionChip {
          border: 1px solid #46628b;
          background: #142845;
          color: #d9e8ff;
          border-radius: 7px;
          font-size: 12.33px;
          padding: 3px 8px;
          line-height: 1.1;
          transition:
            background-color 120ms ease,
            border-color 120ms ease,
            color 120ms ease,
            box-shadow 120ms ease,
            transform 120ms ease;
        }
        .autoPathChip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: default;
          position: relative;
          border-color: #22c55e;
          background: #123522;
          color: #bbf7d0;
        }
        .suggestionChip {
          cursor: pointer;
          position: relative;
        }
        .tableSuggestionChips .suggestionChip {
          min-height: 28px;
          padding: 3px 9px;
          font-size: 11px;
        }
        .tableSuggestionChips .suggestionChip:hover:not(:disabled) {
          border-color: #6f8fbe;
          background: #1a3458;
          color: #edf4ff;
          box-shadow: 0 6px 14px rgba(4, 10, 24, 0.28);
          transform: translateY(-1px);
        }
        .suggestionChip.selected {
          border-color: #5c86ca;
          color: #e8f0ff;
          background: #234979;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .tableSuggestionChips .suggestionChip.selected:hover:not(:disabled) {
          border-color: #77a2e7;
          color: #f5f9ff;
          background: #2b578f;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.1),
            0 6px 14px rgba(4, 10, 24, 0.3);
          transform: translateY(-1px);
        }
        .genderMismatchSuggestion {
          color: #f87171;
          border-color: rgba(248, 113, 113, 0.45);
          background: rgba(127, 29, 29, 0.2);
          cursor: pointer;
        }
        .genderMismatchSuggestion:hover:not(:disabled) {
          color: #fecaca;
          border-color: rgba(254, 202, 202, 0.65);
          background: rgba(153, 27, 27, 0.35);
        }
        .suggestionChip:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .autoPathChip::after,
        .suggestionChip::after {
          content: none;
          position: absolute;
          left: 50%;
          bottom: calc(100% + 6px);
          transform: translateX(-50%);
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 11px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          z-index: 20;
        }
        .autoPathChip[data-tooltip]:not([data-tooltip=""]):hover::after,
        .suggestionChip[data-tooltip]:not([data-tooltip=""]):hover::after {
          content: attr(data-tooltip);
          opacity: 1;
        }
        .stage4ResultBlock {
          display: grid;
          gap: 3px;
          min-width: 0;
          max-width: none;
          text-align: left;
        }
        .stage4ResultCell {
          min-width: 620px;
          width: auto;
          max-width: none;
          overflow: visible;
        }
        tbody td.stage4ResultCell {
          overflow: visible;
        }
        .stage4ResultLine {
          color: var(--muted);
          font-size: 12.33px;
          line-height: 1.2;
          font-weight: 600;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          overflow: visible;
          text-overflow: clip;
          margin-bottom: 1px;
        }
        .stage4ResultLine b {
          color: #e2e8f0;
          font-weight: 700;
        }
        .stage4ResultLineCurrent {
          color: #cfe0ff;
        }
        .stage4ResultLineFinal {
          color: #93c5fd;
        }
        .stage4ResultLineFinalAuto {
          color: #86efac;
        }
        .stage4ResultLineFinalPending {
          color: #c4b5fd;
        }
        .stage4ResultLineCollections {
          color: #b7c4d8;
        }
        .stage4ResultLineChanged {
          color: #98a9c4;
        }
        .stage4ResultDeltaPositive {
          color: #86efac;
        }
        .stage4ResultDeltaNegative {
          color: #fca5a5;
        }
        .stage4ResultDeltaNeutral {
          color: #98a9c4;
        }
        .mappingExplainSummaryLine {
          margin-bottom: 0;
        }
        .eyeActionBtn {
          width: 28px;
          height: 28px;
          border: 0;
          padding: 0;
          background: transparent;
          color: #e7edf8;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .eyeActionBtn:hover {
          color: #ffffff;
        }
        .rowInspectorBlock {
          display: grid;
          gap: 8px;
          padding: 12px;
          border: 1px solid #2a3a56;
          border-radius: 10px;
          background: rgba(15, 26, 47, 0.74);
          margin-top: 8px;
        }
        .mappingExplainModal {
          width: min(980px, 96vw);
          gap: 10px;
          border-radius: 14px;
          box-shadow: 0 18px 46px rgba(2, 8, 24, 0.7);
          max-height: 92vh;
          overflow: hidden;
        }
        .mappingExplainHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .mappingExplainIdentity {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          flex: 1 1 auto;
        }
        .mappingExplainThumb {
          width: 52px;
          height: 52px;
          border-radius: 10px;
          border: 1px solid #2f3f5e;
          background: #101a2b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #dbe8fb;
          font-size: 13px;
          font-weight: 700;
          flex: 0 0 52px;
          overflow: hidden;
        }
        .mappingExplainThumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .mappingExplainHeadMain {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .mappingExplainHeadMain h3 {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
          font-weight: 700;
        }
        .mappingExplainSub {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.3;
        }
        .mappingExplainCloseBtn {
          min-height: 28px;
          height: 28px;
          width: 28px;
          border-radius: 8px;
          border: 1px solid #334155;
          background: #10192a;
          color: #cbd5e1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          padding: 0;
        }
        .mappingExplainCloseBtn:hover {
          border-color: #475569;
          color: #f8fafc;
        }
        .mappingExplainBody {
          display: grid;
          gap: 6px;
          max-height: none;
          overflow: visible;
          padding-right: 4px;
        }
        .mappingExplainSuggestionChips {
          flex-wrap: wrap;
          gap: 7px;
        }
        .mappingExplainSuggestionChips .suggestionChip {
          min-height: 30px;
          padding: 0 11px;
          font-size: 12px;
        }
        .mappingExplainFooter {
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .mappingExplainFooter .mappingExplainNeedsReviewBtn {
          min-height: 34px;
          border-radius: 10px;
          border: 1px solid #f59e0b;
          background: rgba(245, 158, 11, 0.14);
          color: #fcd34d;
          font-weight: 700;
          padding: 0 12px;
        }
        .mappingExplainFooter .mappingExplainNeedsReviewBtn:hover:not(:disabled) {
          border-color: #fbbf24;
          background: rgba(245, 158, 11, 0.2);
        }
        .mappingExplainFooter .mappingExplainReadyBtn {
          min-height: 34px;
          border-radius: 10px;
          border: 1px solid #c084fc;
          background: #2d1657;
          color: #e9d5ff;
          font-weight: 700;
          padding: 0 12px;
        }
        .mappingExplainFooter .mappingExplainReadyBtn:hover:not(:disabled) {
          border-color: #d8b4fe;
          background: #3d1f73;
        }
        .topbar.mappingExplainFooter button.mappingExplainNeedsReviewBtn {
          border-color: #f59e0b !important;
          background: rgba(245, 158, 11, 0.14) !important;
          color: #fcd34d !important;
        }
        .topbar.mappingExplainFooter button.mappingExplainReadyBtn {
          border-color: #c084fc !important;
          background: #2d1657 !important;
          color: #e9d5ff !important;
        }
        .mappingExplainModal .tiny {
          font-size: 13px;
          line-height: 1.45;
        }
        .mappingExplainModal .muted {
          color: #c7d3e8;
        }
        .mappingExplainModal .rowInspectorBlock > .muted.tiny {
          color: #98a9c4 !important;
          font-size: 11px !important;
          line-height: 1.35 !important;
          font-weight: 500 !important;
        }
        .mappingExplainModal .rowInspectorBlock > .muted.tiny b {
          color: #c8d9f2 !important;
          font-weight: 700 !important;
        }
        .mappingExplainModal .decisionBadge,
        .mappingExplainModal .syncBadge {
          min-height: 28px;
          padding: 0 10px;
          font-size: 12px;
          border-radius: 9px;
        }
        .mappingExplainTopGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .mappingSectionTitle {
          font-size: 12px;
          letter-spacing: 0.06em;
          color: #9fb4d0;
          font-weight: 700;
        }
        .mappingKvRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-top: 1px solid #24354e;
          padding-top: 6px;
          margin-top: 2px;
          font-size: 12px;
          color: #cbd5e1;
        }
        .mappingKvRow b {
          color: #e6eefc;
          font-weight: 700;
          text-align: right;
        }
        @media (max-width: 860px) {
          .mappingExplainTopGrid {
            grid-template-columns: 1fr;
          }
        }
        .rowInspectorList {
          display: grid;
          gap: 3px;
        }
        .rowInspectorDiffBlock {
          display: grid;
          gap: 4px;
          font-size: 12px;
          line-height: 1.6;
        }
        .rowInspectorDiffSame {
          color: #94a3b8;
        }
        .rowInspectorDiffAdd {
          color: #86efac;
        }
        .rowInspectorDiffRemove {
          color: #fca5a5;
        }
        .thumb {
          width: 56px;
          height: 80px;
          border-radius: 4px;
          object-fit: cover;
          border: 1px solid #334155;
        }
        .thumbPlaceholder {
          display: inline-block;
          width: 56px;
          height: 80px;
          border-radius: 4px;
          border: 1px dashed #334155;
          background: rgba(15, 23, 42, 0.5);
        }
        .statusBadgeImg {
          width: 54px;
          height: 54px;
          object-fit: contain;
          display: inline-block;
          vertical-align: middle;
        }
        .previewOverlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(3, 8, 18, 0.46);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .previewContent {
          position: relative;
          max-width: min(92vw, 980px);
          max-height: 90vh;
        }
        .reportModal {
          position: relative;
          width: min(980px, 92vw);
          max-height: 90vh;
          overflow: auto;
          border-radius: 12px;
          border: 1px solid #2a3547;
          background: #0a1324;
          padding: 14px;
          box-shadow: 0 14px 42px rgba(0, 0, 0, 0.6);
        }
        /* Reports hub modal groups report actions into a single focused overlay. */
        .reportHubModal {
          position: relative;
          width: min(920px, 92vw);
          max-height: 90vh;
          overflow: auto;
          border-radius: 12px;
          border: 1px solid #2a3547;
          background: #0a1324;
          padding: 14px;
          box-shadow: 0 14px 42px rgba(0, 0, 0, 0.6);
          display: grid;
          gap: 12px;
        }
        .reportHubSection h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: #e2e8f0;
        }
        .reportHubGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .reportHubCard {
          min-height: 68px;
          border: 1px solid #2f4261;
          border-radius: 10px;
          background: #0f1a2f;
          color: #d8e6ff;
          text-align: left;
          padding: 10px;
          display: grid;
          gap: 4px;
          cursor: pointer;
        }
        .reportHubCard:hover {
          border-color: #5f789c;
          background: #15233a;
        }
        .reportHubCardTitle {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          color: #eaf2ff;
        }
        .reportHubCardDesc {
          font-size: 11px;
          line-height: 1.35;
          color: #93a8c7;
        }
        .reportHubFooter {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 4px;
        }
        .reportClose {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 30px;
          height: 30px;
          min-height: 30px;
          border-radius: 8px;
          border: 1px solid #3b4b63;
          background: #0f1a2f;
          color: #e5e7eb;
          font-size: 16px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .reportClose:hover {
          background: #15233a;
          border-color: #5f7ba1;
        }
        .reportSection {
          margin-top: 12px;
        }
        .reportSection h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: #e2e8f0;
        }
        .reportList {
          border: 1px solid #2a3547;
          border-radius: 10px;
          background: #0b1322;
          max-height: 200px;
          overflow: auto;
        }
        .reportRow {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-bottom: 1px solid #1f2937;
          font-size: 12px;
        }
        .reportRow:last-child {
          border-bottom: 0;
        }
        .previewImg {
          display: block;
          max-width: min(92vw, 980px);
          max-height: 86vh;
          object-fit: contain;
          border-radius: 10px;
          box-shadow: 0 10px 42px rgba(0, 0, 0, 0.55);
        }
        .previewClose {
          position: absolute;
          top: -12px;
          right: -12px;
          width: 34px;
          height: 34px;
          min-height: 0;
          border-radius: 8px;
          border: 2px solid rgba(255, 255, 255, 0.7);
          background: rgba(0, 0, 0, 0.72);
          color: #fff;
          font-size: 24px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .warning {
          margin-top: 8px;
          color: #fcd34d;
          font-size: 12px;
        }
        .error {
          margin-top: 8px;
          color: #fca5a5;
          font-size: 12px;
        }
        .empty {
          padding: 16px;
          color: #94a3b8;
          font-size: 12px;
          text-align: center;
        }
        @media (max-width: 1200px) {
          .headerKpiOverlay {
            right: 18px;
            gap: 6px;
          }
          .headerKpiCard {
            width: 115px;
            min-width: 115px;
            max-width: 115px;
            padding: 4px 8px;
          }
          .headerKpiLabel {
            font-size: 10px;
          }
          .headerKpiValue {
            font-size: 22px;
          }
          .page {
            height: auto;
            max-height: none;
            overflow: visible;
            grid-template-rows: auto auto;
          }
          .grid2 {
            grid-template-columns: 1fr;
            height: auto;
          }
          .grid2 > .card.panel {
            height: auto;
            max-height: none;
            overflow: visible;
          }
          .paneDivider {
            display: none;
          }
          .workspaceHeightDivider {
            display: none;
          }
          .productControls {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
          .workflowRail,
          .reportHubGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
