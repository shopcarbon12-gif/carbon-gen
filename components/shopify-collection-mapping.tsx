"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ShopifyMenuItemsTree from "@/components/shopify-menu-items-tree";

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
  title: string;
  image: string | null;
  upc: string;
  checkedNodeKeys: string[];
  actionStatus?: "PROCESSED" | "";
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
  collections?: Array<{ id: string; title?: string }>;
  nodes?: MenuNode[];
  rows?: ProductRow[];
  types?: string[];
  linkTargets?: MenuLinkTargets;
  menu?: { id?: string; handle?: string; title?: string };
  summary?: {
    totalProducts?: number;
  };
};

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
const TREE_PANEL_MIN_WIDTH = 340;
const TREE_PANEL_MAX_WIDTH = 1600;
const TREE_PANEL_DEFAULT_WIDTH = 400;
const TREE_PANEL_MAX_AUTO_WIDTH = 900;
const WORKSPACE_MIN_HEIGHT = 420;
const WORKSPACE_MAX_HEIGHT = 5000;
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

export default function ShopifyCollectionMapping() {
  const [shop, setShop] = useState("");
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<Record<string, boolean>>({});
  const [selectedUnmappedCollectionIds, setSelectedUnmappedCollectionIds] = useState<Record<string, boolean>>({});
  const [dismissedUnmappedCollectionIds, setDismissedUnmappedCollectionIds] = useState<Record<string, boolean>>({});
  const [unmappedCollectionOrder, setUnmappedCollectionOrder] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [treeSearch, setTreeSearch] = useState("");
  const [search, setSearch] = useState("");
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [showTypesDropdown, setShowTypesDropdown] = useState(false);
  const [sort, setSort] = useState<SortValue>("title-asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [collectionCount, setCollectionCount] = useState(0);
  const [collections, setCollections] = useState<Array<{ id: string; title: string }>>([]);
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
  const [autoTreeWidthArmed, setAutoTreeWidthArmed] = useState(false);
  const [resizingPanes, setResizingPanes] = useState(false);
  const [resizingWorkspaceHeight, setResizingWorkspaceHeight] = useState(false);
  const [workspaceHeight, setWorkspaceHeight] = useState<number | null>(null);
  const paneResizeStart = useRef<{ x: number; width: number } | null>(null);
  const workspaceResizeStart = useRef<{ pageY: number; height: number } | null>(null);
  const workspaceResizePointerClientY = useRef(0);
  const pageScrollRef = useRef<HTMLElement | null>(null);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const treePanelAutoWidthRef = useRef<HTMLDivElement | null>(null);
  const tempNodeCounterRef = useRef(0);
  const undoCounterRef = useRef(0);
  const typesDropdownRef = useRef<HTMLDivElement | null>(null);
  const menuEditorComboboxRef = useRef<HTMLDivElement | null>(null);

  const activeShop = useMemo(() => {
    const normalized = normalizeShopDomain(shop);
    return isValidShopDomain(normalized) ? normalized : "";
  }, [shop]);

  function withShopContext(input: Record<string, unknown>) {
    if (!activeShop) return input;
    return { ...input, shop: activeShop };
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

  const allSelectedOnPage = useMemo(() => {
    if (rows.length < 1) return false;
    return rows.every((row) => Boolean(selectedProducts[row.id]));
  }, [rows, selectedProducts]);

  const selectedTypesLabel = useMemo(() => {
    if (selectedTypes.length < 1) return "All types";
    return selectedTypes[0];
  }, [selectedTypes]);

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

  // Requirement 2: Dynamic Linking Behavior
  // Generate a live link based on the actively selected node in the tree.
  const activeDynamicLink = useMemo(() => {
    if (mappedSelectedNodeKeys.length !== 1) return null;
    const nodeId = mappedSelectedNodeKeys[0];
    const node = nodeByKey.get(nodeId);
    if (!node || !node.linkedTargetUrl) return null;

    // Construct a friendly display URL or use the raw one
    // Assuming linkedTargetUrl is relative or absolute, we present it clearly.
    // If your app has a specific shop domain context, prepending it would happen here.
    return node.linkedTargetUrl;
  }, [mappedSelectedNodeKeys, nodeByKey]);

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
      if (selectedTypes.length > 0) {
        params.set("types", selectedTypes[0]);
      }
      if (options?.refreshProducts) {
        params.set("refreshProducts", "true");
      }
      if (options?.refreshCollections) {
        params.set("refreshCollections", "true");
      }
      const resp = await fetch(`/api/shopify/collection-mapping?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await resp.json()) as MappingResponse;
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
      setRows(json.rows || []);
      const nextCollections = (json.collections || []).map((row) => ({
        id: String(row.id || ""),
        title: String(row.title || "").trim() || String(row.id || ""),
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
      setSelectedTypes((prev) => {
        if (prev.length < 1) return prev;
        const allowed = new Set(nextTypeOptions.map((value) => value.toLowerCase()));
        const nextSelected = prev.filter((value) => allowed.has(value.toLowerCase()));
        if (nextSelected.length === prev.length && nextSelected.every((value, index) => value === prev[index])) {
          return prev;
        }
        return nextSelected;
      });
      setTotalPages(Math.max(1, Number(json.totalPages || 1)));
      if (json.page && Number.isFinite(Number(json.page))) {
        setPage(Math.max(1, Number(json.page)));
      }
      setWarning(String(json.warning || "").trim());
      setSelectedProducts((prev) => {
        const out: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) {
          if (prev[key]) out[key] = true;
        }
        return out;
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load collection mapping.";
      setError(message);
      return false;
    } finally {
      setLoading(false);
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
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withShopContext({
          action: "fetch-link-assets",
          linkType,
        })),
      });
      const json = (await resp.json()) as MappingResponse;
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

  function collapseTreeToDefault() {
    setTreeSearch("");
    setExpandedNodes({});
  }

  function toggleUnmappedCollectionSelection(collectionId: string) {
    const normalized = String(collectionId || "").trim();
    if (!normalized) return;
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
      const resp = await fetch("/api/shopify/collection-mapping", {
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
      const json = (await resp.json()) as MappingResponse;
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
    fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
      body: JSON.stringify({
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
      }),
    }).catch(() => {});
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
    const timer = window.setTimeout(() => {
      void loadData();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, selectedTypes, sort, page, pageSize, activeShop]);

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
    if (!activeShop) return;
    const params = new URLSearchParams(window.location.search);
    const currentShop = normalizeShopDomain(params.get("shop") || "");
    if (currentShop === activeShop) return;
    params.set("shop", activeShop);
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [activeShop]);

  useEffect(() => {
    setSelectedProducts({});
  }, [search, selectedTypes, treeSearch, sort]);

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

  function getHeaderArrow(field: "title" | "upc") {
    const [activeField, dir] = sort.split("-") as ["title" | "upc", "asc" | "desc"];
    if (activeField !== field) return "↕";
    return dir === "asc" ? "▲" : "▼";
  }

  function toggleHeaderSort(field: "title" | "upc") {
    const [activeField, dir] = sort.split("-") as ["title" | "upc", "asc" | "desc"];
    if (activeField === field) {
      resetPageForDataQuery();
      setSort(`${field}-${dir === "asc" ? "desc" : "asc"}` as SortValue);
      return;
    }
    resetPageForDataQuery();
    setSort(`${field}-asc` as SortValue);
  }

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
    if (!showTypesDropdown) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (typesDropdownRef.current?.contains(target)) return;
      setShowTypesDropdown(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [showTypesDropdown]);

  useEffect(() => {
    if (!showTypesDropdown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowTypesDropdown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showTypesDropdown]);

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
    const onMouseMove = (event: MouseEvent) => {
      if (!paneResizeStart.current) return;
      const deltaX = event.clientX - paneResizeStart.current.x;
      const nextWidth = Math.min(
        TREE_PANEL_MAX_WIDTH,
        Math.max(TREE_PANEL_MIN_WIDTH, paneResizeStart.current.width + deltaX)
      );
      setTreePanelWidth(nextWidth);
    };
    const stopResize = () => {
      setResizingPanes(false);
      paneResizeStart.current = null;
    };
    const priorCursor = document.body.style.cursor;
    const priorUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      document.body.style.cursor = priorCursor;
      document.body.style.userSelect = priorUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [resizingPanes]);

  useEffect(() => {
    if (!resizingWorkspaceHeight) return;
    let rafId = 0;
    const EDGE_THRESHOLD = 36;
    const SCROLL_STEP = 18;
    const tick = () => {
      const start = workspaceResizeStart.current;
      if (!start) return;

      const currentPageY = workspaceResizePointerClientY.current + window.scrollY;
      const deltaY = currentPageY - start.pageY;
      const nextHeight = Math.min(
        WORKSPACE_MAX_HEIGHT,
        Math.max(WORKSPACE_MIN_HEIGHT, start.height + deltaY)
      );
      setWorkspaceHeight(nextHeight);

      const clientY = workspaceResizePointerClientY.current;
      if (clientY > window.innerHeight - EDGE_THRESHOLD) {
        window.scrollBy({ top: SCROLL_STEP, behavior: "auto" });
      } else if (clientY < EDGE_THRESHOLD) {
        window.scrollBy({ top: -SCROLL_STEP, behavior: "auto" });
      }

      const pageEl = pageScrollRef.current;
      if (pageEl) pageEl.scrollTop = pageEl.scrollHeight;
      rafId = window.requestAnimationFrame(tick);
    };
    const onMouseMove = (event: MouseEvent) => {
      workspaceResizePointerClientY.current = event.clientY;
    };
    const stopResize = () => {
      setResizingWorkspaceHeight(false);
      workspaceResizeStart.current = null;
    };
    const priorCursor = document.body.style.cursor;
    const priorUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);
    rafId = window.requestAnimationFrame(tick);
    return () => {
      document.body.style.cursor = priorCursor;
      document.body.style.userSelect = priorUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [resizingWorkspaceHeight]);

  useEffect(() => {
    if (!autoTreeWidthArmed) return;
    if (resizingPanes) return;
    const host = treePanelAutoWidthRef.current;
    if (!host) return;
    const raf = window.requestAnimationFrame(() => {
      const labels = host.querySelectorAll<HTMLElement>(".treeLabel, .treeTargetLabel, .unmappedCardLabel");
      let maxOverflow = 0;
      labels.forEach((label) => {
        if (label.offsetParent === null) return;
        const overflow = label.scrollWidth - label.clientWidth;
        if (overflow > maxOverflow) maxOverflow = overflow;
      });
      if (maxOverflow <= 1) return;
      setTreePanelWidth((prev) => {
        const next = Math.min(
          TREE_PANEL_MAX_AUTO_WIDTH,
          Math.max(TREE_PANEL_DEFAULT_WIDTH, Math.ceil(prev + maxOverflow + 28))
        );
        return next > prev ? next : prev;
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [nodes, orderedUnmappedCollections, expandedNodes, treeSearch, resizingPanes, treePanelWidth, autoTreeWidthArmed]);

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
      fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
        body: JSON.stringify({
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
        }),
      }).catch(() => {});
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
        fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
          body: JSON.stringify({
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
          }),
        }).catch(() => {});
        // #endregion
        const resp = await fetch("/api/shopify/collection-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withShopContext(payload)),
        });
        const json = (await resp.json()) as MappingResponse;
        // #region agent log
        fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
          body: JSON.stringify({
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
          }),
        }).catch(() => {});
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
          fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
            body: JSON.stringify({
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
            }),
          }).catch(() => {});
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
        fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
          body: JSON.stringify({
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
          }),
        }).catch(() => {});
        // #endregion
        const resp = await fetch("/api/shopify/collection-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(withShopContext(payload)),
        });
        const json = (await resp.json()) as MappingResponse & { createdNodeKey?: string };
        // #region agent log
        fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
          body: JSON.stringify({
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
          }),
        }).catch(() => {});
        // #endregion
        if (op.type === "edit") {
          // #region agent log
          fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
            body: JSON.stringify({
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
            }),
          }).catch(() => {});
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
            fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
              body: JSON.stringify({
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
              }),
            }).catch(() => {});
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
      collapseTreeToDefault();
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
    setAutoTreeWidthArmed(true);
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeKey]: prev[nodeKey] === false ? true : false,
    }));
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
    fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
      body: JSON.stringify({
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
      }),
    }).catch(() => {});
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
    fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
      body: JSON.stringify({
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
      }),
    }).catch(() => {});
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
      const resp = await fetch("/api/shopify/collection-mapping", {
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
      const json = (await resp.json()) as ToggleResponse;
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
      const resp = await fetch("/api/shopify/collection-mapping", {
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
      const json = (await resp.json()) as ToggleResponse;
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

  function toggleSelectedType(type: string) {
    const normalized = type.trim();
    if (!normalized) return;
    setSelectedTypes((prev) => {
      const exists = prev.some((value) => value.toLowerCase() === normalized.toLowerCase());
      return exists ? [] : [normalized];
    });
    resetPageForDataQuery();
  }

  function clearTypeFilter() {
    setSelectedTypes([]);
    resetPageForDataQuery();
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
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withShopContext({ action: "refresh-menu", menuHandle: currentMenuHandle })),
      });
      const json = (await resp.json()) as MappingResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Menu refresh failed.");
      }
      const nextNodes = json.nodes || [];
      const nextCollections = (json.collections || []).map((row) => ({
        id: String(row.id || ""),
        title: String(row.title || row.id || ""),
      }));
      setNodes(nextNodes);
      setCollections(nextCollections);
      setCollectionCount(nextCollections.length);
      setPendingTreeOps([]);
      collapseTreeToDefault();
      setSelectedNodes({});
      setSelectedUnmappedCollectionIds({});
      setWarning(String(json.warning || "").trim());
    } catch (err) {
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
      fetch("http://127.0.0.1:7510/ingest/a563c88f-df2a-4570-a887-c7a3035d0692", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9da838" },
        body: JSON.stringify({
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
        }),
      }).catch(() => {});
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
    <main className={`page${workspaceHeight ? " pageExpanded" : ""}`} ref={pageScrollRef}>
      <style jsx global>{`
        .app-bg-photo,
        .app-bg-fade,
        .app-bg-top-photo,
        .app-bg-top-fade {
          display: none !important;
        }
        body {
          background: #0b1020 !important;
        }
      `}</style>

      <section className="card workspaceCard">
        <h1>Shopify Collection Mapping</h1>
        <div className="topbar" style={{ marginTop: 10 }}>
          <span className="pill">{activeShop ? `Shop: ${activeShop}` : "Shop: not selected"}</span>
          <span className="pill">Auto-parent logic ON</span>
          <span className="pill">Live Shopify sync ON</span>
          <button type="button" onClick={() => void openAuditReport()} disabled={auditOpening || saving || loading}>
            {auditOpening ? "Refreshing Audit..." : "Collection Audit Log"}
          </button>
        </div>
        <div className="kpi" style={{ marginTop: 10 }}>
          <div className="k">
            <div className="muted">Collections</div>
            <b>{collectionCount}</b>
          </div>
          <div className="k">
            <div className="muted">Menu Collections</div>
            <b>{nodes.length}</b>
          </div>
          <div className="k">
            <div className="muted">Products</div>
            <b>{productCount}</b>
          </div>
        </div>
        
        {/* Requirement 2: Dynamic Link Display */}
        <div style={{ 
          marginTop: 12, 
          padding: "10px 14px", 
          background: "rgba(0,0,0,0.2)", 
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}>
          <span className="muted" style={{ fontWeight: 600 }}>Active Mapping Link:</span>
          {activeDynamicLink ? (
            <a href={activeDynamicLink} target="_blank" rel="noreferrer" style={{ color: "#34d399", textDecoration: "none", fontFamily: "monospace" }}>
              {activeDynamicLink}
            </a>
          ) : (
            <span className="muted" style={{ fontStyle: "italic", opacity: 0.7 }}>Select a mapped collection in the tree to see its dynamic link.</span>
          )}
        </div>

        {warning ? <p className="warning">{warning}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card">
        <div
          ref={workspaceGridRef}
          className="grid2"
          style={{
            gridTemplateColumns: `${treePanelWidth}px 18px minmax(0, 1fr)`,
            height: workspaceHeight ? `${workspaceHeight}px` : "100%",
            transition: resizingPanes ? "none" : "grid-template-columns 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div ref={treePanelAutoWidthRef} className="treePaneHost">
            <ShopifyMenuItemsTree
              menuTitle={menuMeta.title}
              menuHandle={menuMeta.handle}
              treeSearch={treeSearch}
              onTreeSearchChange={setTreeSearch}
              onTreeSearchSubmit={expandTreeForSearchResults}
              onRefreshTree={() => {
                setTreePanelWidth(TREE_PANEL_DEFAULT_WIDTH);
                setAutoTreeWidthArmed(false);
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
            className={`paneDivider ${resizingPanes ? "resizing" : ""}`}
            aria-label="Resize menu tree panel"
            onMouseDown={(event) => {
              setResizingPanes(true);
              paneResizeStart.current = { x: event.clientX, width: treePanelWidth };
            }}
          >
            <span className="paneDividerGrip" />
          </button>
          <main className="card panel productPanel">
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
              <div className="typesDropdown" ref={typesDropdownRef}>
                <button
                  type="button"
                  className="typesDropdownBtn"
                  onClick={() => setShowTypesDropdown((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={showTypesDropdown}
                >
                  Types: {selectedTypesLabel}
                </button>
                {showTypesDropdown ? (
                  <div className="typesDropdownMenu" role="listbox" aria-label="Filter by product types" aria-multiselectable="true">
                    <button
                      type="button"
                      className="typesResetBtn"
                      onClick={() => clearTypeFilter()}
                      disabled={selectedTypes.length < 1}
                    >
                      All types
                    </button>
                    <div className="typesList">
                      {typeOptions.length < 1 ? (
                        <div className="typesEmpty">No product types found.</div>
                      ) : (
                        typeOptions.map((type) => {
                          const checked = selectedTypes.some((value) => value.toLowerCase() === type.toLowerCase());
                          return (
                            <label key={type} className="typesOption">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelectedType(type)}
                              />
                              <span>{type}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="productRefreshBtn"
                onClick={() => void refreshProductsSection()}
                disabled={loading || saving}
              >
                Refresh Products
              </button>
            </div>
            <div className="topbar">
              <span className="chip">Selected Collections: {selectedNodeKeysWithParents.length + selectedDirectCollectionIds.length}</span>
              <span className="chip">Mapped Selected: {mappedSelectedNodeKeys.length}</span>
              <span className="chip">Unmapped Selected: {selectedDirectCollectionIds.length}</span>
              <span className="chip">Page {page} / {totalPages}</span>
              <button
                className="primary"
                type="button"
                onClick={() => void bulkAssign(true)}
                disabled={saving || !hasSelectedAssignTargets}
              >
                Assign Checked Products
              </button>
              <button
                type="button"
                onClick={() => void bulkAssign(false)}
                disabled={saving || !hasSelectedAssignTargets}
              >
                Unassign Checked Products
              </button>
            </div>

            <div className="tableWrap" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th className="center">
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedProducts((prev) => {
                            const next = { ...prev };
                            for (const row of rows) next[row.id] = checked;
                            return next;
                          });
                        }}
                        aria-label="Select all products"
                      />
                    </th>
                    <th>Picture</th>
                    <th className="productNameCol sortHead">
                      <button
                        type="button"
                        className="sortHeadBtn"
                        onClick={() => toggleHeaderSort("title")}
                        aria-label="Sort by product name"
                      >
                        Product Name <span className="sortArrow">{getHeaderArrow("title")}</span>
                      </button>
                    </th>
                    <th className="upcCol sortHead">
                      <button
                        type="button"
                        className="sortHeadBtn"
                        onClick={() => toggleHeaderSort("upc")}
                        aria-label="Sort by UPC"
                      >
                        UPC <span className="sortArrow">{getHeaderArrow("upc")}</span>
                      </button>
                    </th>
                    <th className="center">Status</th>
                    <th>Current Collections</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="empty">Loading Shopify products...</td>
                    </tr>
                  ) : rows.length < 1 ? (
                    <tr>
                      <td colSpan={6} className="empty">No products found.</td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const currentCollections = row.checkedNodeKeys
                        .map((key) => nodeLabelByKey.get(key) || key)
                        .slice(0, 6)
                        .join(", ");
                      return (
                        <tr key={row.id}>
                          <td className="center">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedProducts[row.id])}
                              onChange={(event) => setSelectedProducts((prev) => ({ ...prev, [row.id]: event.target.checked }))}
                            />
                          </td>
                          <td className="center imgCell">
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
                          <td className="productNameCol">{row.title}</td>
                          <td className="upcCol">{row.upc || "-"}</td>
                          <td className="center">
                            {row.actionStatus === "PROCESSED" ? (
                              <img src="/badge-processed.png" alt="Processed" className="statusBadgeImg" />
                            ) : (
                              <span className="muted">-</span>
                            )}
                          </td>
                          <td>
                            <span className="muted small">{currentCollections || "-"}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="topbar pagerBar" style={{ marginTop: 10 }}>
              <div className="pagerNav">
                <button type="button" onClick={() => setPage(1)} disabled={page <= 1 || loading}>
                  {"<<"}
                </button>
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1 || loading}>
                  {"<"}
                </button>
                <span className="muted">Page {page} of {totalPages}</span>
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
        <button
          type="button"
          className={`workspaceHeightDivider ${resizingWorkspaceHeight ? "resizing" : ""}`}
          aria-label="Resize workspace height"
          onMouseDown={(event) => {
            const currentHeight =
              workspaceGridRef.current?.getBoundingClientRect().height ||
              workspaceHeight ||
              560;
            workspaceResizeStart.current = {
              pageY: event.pageY,
              height: Math.max(WORKSPACE_MIN_HEIGHT, currentHeight),
            };
            workspaceResizePointerClientY.current = event.clientY;
            setResizingWorkspaceHeight(true);
          }}
        >
          <span className="workspaceHeightGrip" />
        </button>
      </section>

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

      <style jsx>{`
        .page {
          width: min(100%, calc(100vw - 24px));
          max-width: 100%;
          box-sizing: border-box;
          min-width: 0;
          margin: 0 auto;
          padding: 12px;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 12px;
          height: 100vh;
          height: 100dvh;
          max-height: 100vh;
          max-height: 100dvh;
          overflow-x: hidden;
          overflow-y: auto;
          color: #e5e7eb;
          font-family: ui-sans-serif, system-ui, Segoe UI, Arial;
        }
        .page.pageExpanded {
          grid-template-rows: auto auto;
          height: auto;
          max-height: none;
          overflow: visible;
        }
        .card {
          background: #111827;
          border: 1px solid #2a3547;
          border-radius: 12px;
          padding: 12px;
        }
        h1,
        h2,
        h3,
        p {
          margin: 0;
        }
        .muted {
          color: #94a3b8;
          font-size: 12px;
        }
        .small {
          font-size: 11px;
        }
        .topbar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        input,
        select,
        button {
          min-height: 36px;
          border-radius: 8px;
          border: 1px solid #2a3547;
          background: #0a1324;
          color: #e5e7eb;
          padding: 0 10px;
        }
        button {
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .primary {
          border-color: #166534;
          background: #14532d;
          color: #dcfce7;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid #166534;
          background: #052e16;
          color: #86efac;
          font-size: 11px;
        }
        .chip {
          display: inline-flex;
          padding: 1px 7px;
          border-radius: 999px;
          border: 1px solid #1d4ed8;
          background: #0a1d33;
          color: #bfdbfe;
          font-size: 10px;
        }
        .kpi {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
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
          grid-template-columns: 300px 18px minmax(0, 1fr);
          gap: 12px;
          align-items: stretch;
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
          min-height: 0;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .grid2 > .card.panel {
          height: 100%;
          max-height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .paneDivider {
          display: flex;
          align-items: stretch;
          justify-content: center;
          width: 18px;
          justify-self: center;
          cursor: col-resize;
          border-radius: 999px;
          outline: none;
        }
        .paneDividerGrip {
          width: 4px;
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
          min-height: 0;
        }
        .productControls {
          /* Requirement 1: Grid for strict alignment */
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 8px;
          align-items: center;
          margin-bottom: 10px;
          width: 100%;
        }
        .productSearchInput {
          min-width: 320px;
          width: 100%;
        }
        .typesDropdown {
          position: relative;
          flex: 0 0 auto;
        }
        .productRefreshBtn {
          min-width: 150px;
          justify-self: end;
        }
        .typesDropdownBtn {
          min-width: 170px;
          justify-content: flex-start;
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
          margin-top: 8px;
          /* Requirement 1: Grid for strict alignment */
          display: grid;
          grid-template-columns: 1fr 36px;
          align-items: center;
          gap: 8px;
        }
        .treeSearchInput {
          flex: 1 1 auto;
          min-width: 0;
        }
        .typesDropdownMenu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          width: 280px;
          max-width: min(90vw, 280px);
          z-index: 20;
          border: 1px solid #2a3547;
          border-radius: 10px;
          background: #0a1324;
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
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
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          border: 1px solid #2a3547;
          border-radius: 10px;
          background: #0a1324;
          max-height: none;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          min-width: 1200px;
        }
        th,
        td {
          border-bottom: 1px solid #1f2937;
          padding: 7px 8px;
          white-space: nowrap;
          font-size: 12px;
        }
        tbody td {
          height: 96px;
          box-sizing: border-box;
          vertical-align: middle;
        }
        th {
          position: sticky;
          top: 0;
          background: #0b1322;
          color: #cbd5e1;
          text-transform: uppercase;
          font-size: 11px;
          z-index: 2;
        }
        .sortHead {
          padding: 0;
        }
        .sortHeadBtn {
          width: 100%;
          min-height: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          text-transform: uppercase;
          font-size: 11px;
          color: #cbd5e1;
          padding: 7px 8px;
        }
        .sortArrow {
          font-size: 10px;
          line-height: 1;
        }
        .center {
          text-align: center;
        }
        .pagerBar {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: nowrap;
        }
        .pagerNav {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .pagerPerPage {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
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
          width: 80px;
          min-width: 80px;
          max-width: 80px;
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
        .reportClose {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 30px;
          height: 30px;
          min-height: 30px;
          border-radius: 999px;
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
          border-radius: 999px;
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
            grid-template-columns: 1fr;
            gap: 10px;
          }
        }
      `}</style>
    </main>
  );
}
