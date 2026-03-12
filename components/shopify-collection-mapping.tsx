"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MenuNode = {
  nodeKey: string;
  label: string;
  parentKey: string | null;
  depth: number;
  enabled: boolean;
  collectionId: string | null;
  linkedTargetType?: string;
  linkedTargetLabel?: string;
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
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  collections?: Array<{ id: string; title?: string }>;
  nodes?: MenuNode[];
  rows?: ProductRow[];
  types?: string[];
  summary?: {
    totalProducts?: number;
  };
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
type MenuLinkType = "COLLECTION" | "PRODUCT" | "PAGE" | "BLOG" | "FRONTPAGE" | "HTTP";
const TREE_PANEL_MIN_WIDTH = 260;
const TREE_PANEL_MAX_WIDTH = 620;
const MENU_LINK_TYPE_OPTIONS: Array<{ value: MenuLinkType; label: string }> = [
  { value: "COLLECTION", label: "Collection" },
  { value: "PRODUCT", label: "Product" },
  { value: "PAGE", label: "Page" },
  { value: "BLOG", label: "Blog" },
  { value: "FRONTPAGE", label: "Frontpage" },
  { value: "HTTP", label: "Web URL" },
];

function normalizeMenuEditorLinkType(value: string): MenuLinkType {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "COLLECTION") return "COLLECTION";
  if (normalized === "PRODUCT") return "PRODUCT";
  if (normalized === "PAGE") return "PAGE";
  if (normalized === "BLOG") return "BLOG";
  if (normalized === "FRONTPAGE") return "FRONTPAGE";
  return "HTTP";
}

function isMenuEditorLinkValueRequired(linkType: MenuLinkType) {
  return linkType !== "FRONTPAGE";
}

export default function ShopifyCollectionMapping() {
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<Record<string, boolean>>({});
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
  const [dragSourceKey, setDragSourceKey] = useState("");
  const [dropTarget, setDropTarget] = useState<{ targetKey: string; position: DropPosition } | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [showMenuEditor, setShowMenuEditor] = useState(false);
  const [menuEditorMode, setMenuEditorMode] = useState<MenuEditorMode>("add");
  const [menuEditorLabel, setMenuEditorLabel] = useState("");
  const [menuEditorLinkType, setMenuEditorLinkType] = useState<MenuLinkType>("COLLECTION");
  const [menuEditorLinkValue, setMenuEditorLinkValue] = useState("");
  const [menuEditorParentKey, setMenuEditorParentKey] = useState<string | null>(null);
  const [menuEditorNodeKey, setMenuEditorNodeKey] = useState("");
  const [treePanelWidth, setTreePanelWidth] = useState(320);
  const [resizingPanes, setResizingPanes] = useState(false);
  const paneResizeStart = useRef<{ x: number; width: number } | null>(null);
  const typesDropdownRef = useRef<HTMLDivElement | null>(null);

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

      const nextNodes = (json.nodes || []).filter((node) => node.enabled);
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

  function resetPageForDataQuery() {
    setPage(1);
  }

  function resetTreeSelectionToDefault() {
    setSelectedNodes({});
  }

  function applyNodeSelection(nodeKey: string, checked: boolean) {
    setSelectedNodes((prev) => {
      const next = new Set<string>(Object.keys(prev).filter((key) => Boolean(prev[key])));
      if (checked) {
        next.add(nodeKey);
      } else {
        next.delete(nodeKey);
      }
      const closed = new Set<string>(next);
      for (const key of Array.from(closed)) {
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
      return out;
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, selectedTypes, sort, page, pageSize]);

  useEffect(() => {
    setSelectedProducts({});
  }, [search, selectedTypes, treeSearch, sort]);

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

  async function moveMenuNode() {
    if (!dragSourceKey || !dropTarget) return;
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move-menu-node",
          nodeKey: dragSourceKey,
          targetKey: dropTarget.targetKey,
          position: dropTarget.position,
        }),
      });
      const json = (await resp.json()) as MappingResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Menu reorder failed.");
      }
      const nextNodes = (json.nodes || []).filter((node) => node.enabled);
      setNodes(nextNodes);
      setWarning(String(json.warning || "").trim());
      setSelectedNodes((prev) => {
        const out: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) {
          if (prev[key] && nextNodes.some((node) => node.nodeKey === key)) out[key] = true;
        }
        return out;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Menu reorder failed.";
      setError(message);
    } finally {
      setSaving(false);
      setDragSourceKey("");
      setDropTarget(null);
    }
  }

  function applyMenuNodesFromResponse(json: MappingResponse) {
    const nextNodes = (json.nodes || []).filter((node) => node.enabled);
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
    setMenuEditorLinkValue("");
    setMenuEditorParentKey(parentKey);
    setMenuEditorNodeKey("");
    setShowMenuEditor(true);
  }

  function openEditEditor(node: MenuNode) {
    setMenuEditorMode("edit");
    setMenuEditorLabel(node.label);
    setMenuEditorLinkType(normalizeMenuEditorLinkType(node.linkedTargetType || ""));
    setMenuEditorLinkValue(
      node.linkedTargetType === "FRONTPAGE" || node.linkedTargetLabel === "No target linked"
        ? ""
        : node.linkedTargetLabel || ""
    );
    setMenuEditorParentKey(node.parentKey || null);
    setMenuEditorNodeKey(node.nodeKey);
    setShowMenuEditor(true);
  }

  async function saveMenuEditor() {
    const label = menuEditorLabel.trim();
    const linkValue = menuEditorLinkValue.trim();
    const linkValueRequired = isMenuEditorLinkValueRequired(menuEditorLinkType);
    if (!label || (linkValueRequired && !linkValue)) return;
    setSaving(true);
    setError("");
    try {
      const body =
        menuEditorMode === "add"
          ? {
              action: "add-menu-node",
              parentKey: menuEditorParentKey,
              label,
              linkType: menuEditorLinkType,
              linkValue,
            }
          : {
              action: "edit-menu-node",
              nodeKey: menuEditorNodeKey,
              label,
              linkType: menuEditorLinkType,
              linkValue,
            };
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await resp.json()) as MappingResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Menu update failed.");
      }
      applyMenuNodesFromResponse(json);
      setShowMenuEditor(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Menu update failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteMenuNode(nodeKey: string) {
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-menu-node", nodeKey }),
      });
      const json = (await resp.json()) as MappingResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Delete collection failed.");
      }
      applyMenuNodesFromResponse(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete collection failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAssign(productId: string, checked: boolean) {
    if (mappedSelectedNodeKeys.length < 1) return;
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-nodes",
          productId,
          nodeKeys: mappedSelectedNodeKeys,
          checked,
        }),
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
    if (mappedSelectedNodeKeys.length < 1) return;
    const ids = Object.keys(selectedProducts).filter((key) => Boolean(selectedProducts[key]));
    if (ids.length < 1) return;
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk-toggle-nodes",
          productIds: ids,
          nodeKeys: mappedSelectedNodeKeys,
          checked,
        }),
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
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh-menu" }),
      });
      const json = (await resp.json()) as MappingResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Menu refresh failed.");
      }
      const nextNodes = (json.nodes || []).filter((node) => node.enabled);
      setNodes(nextNodes);
      setTreeSearch("");
      setSelectedNodes({});
      setWarning(String(json.warning || "").trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Menu refresh failed.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
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

      <section className="card">
        <h1>Shopify Collection Mapping</h1>
        <div className="topbar" style={{ marginTop: 10 }}>
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
        {warning ? <p className="warning">{warning}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="card">
        <div className="grid2" style={{ gridTemplateColumns: `${treePanelWidth}px 12px minmax(0, 1fr)` }}>
          <aside className="card panel">
            <div className="treeSearchBar">
              <input
                className="treeSearchInput"
                value={treeSearch}
                onChange={(event) => setTreeSearch(event.target.value)}
                placeholder="Search menu collections..."
                aria-label="Search menu tree"
              />
              <button
                type="button"
                className="treeRefreshBtn"
                aria-label="Refresh menu tree"
                onClick={() => void refreshMenuTreeSection()}
                disabled={saving}
              >
                ⟳
              </button>
            </div>
            <div className="tree" style={{ marginTop: 8 }}>
              {treeNodes.map((node) => {
                const checked = Boolean(selectedNodes[node.nodeKey]);
                const dragging = dragSourceKey === node.nodeKey;
                const dropState =
                  dropTarget?.targetKey === node.nodeKey ? `drop-${dropTarget.position}` : "";
                const siblingKeys = node.parentKey ? childrenByParent.get(node.parentKey) || [] : [];
                const isLastSibling =
                  siblingKeys.length > 0 && siblingKeys[siblingKeys.length - 1] === node.nodeKey;
                const indent = 10 + node.depth * 32;
                return (
                  <div
                    key={node.nodeKey}
                    className={`treeRow ${checked ? "active" : ""} ${node.parentKey ? "has-parent" : ""} ${isLastSibling ? "is-last" : ""} ${dragging ? "dragging" : ""} ${dropState}`}
                    style={{
                      paddingLeft: indent,
                      ["--tree-indent" as "--tree-indent"]: `${indent}px`,
                    }}
                    draggable
                    role="button"
                    tabIndex={0}
                    onClick={() => applyNodeSelection(node.nodeKey, !checked)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        applyNodeSelection(node.nodeKey, !checked);
                      }
                    }}
                    onDragStart={(event) => {
                      setDragSourceKey(node.nodeKey);
                      setDragStartX(event.clientX);
                      setDropTarget(null);
                    }}
                    onDragEnd={() => {
                      setDragSourceKey("");
                      setDropTarget(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!dragSourceKey || dragSourceKey === node.nodeKey) return;
                      const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const y = event.clientY - rect.top;
                      const third = rect.height / 3;
                      const deltaX = event.clientX - dragStartX;
                      let position: DropPosition;
                      let targetKey = node.nodeKey;
                      if (deltaX > 28) {
                        position = "inside";
                      } else if (deltaX < -28) {
                        // Left drag attempts outdent by targeting the hovered node's parent level.
                        const parentKey = node.parentKey;
                        if (parentKey) {
                          targetKey = parentKey;
                          position = "after";
                        } else {
                          position = "before";
                        }
                      } else {
                        position = y < third ? "before" : y > third * 2 ? "after" : "inside";
                      }
                      setDropTarget({ targetKey, position });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!dragSourceKey) return;
                      if (!dropTarget) return;
                      void moveMenuNode();
                    }}
                  >
                    <span className={dragging ? "dragHandle grabbing" : "dragHandle"} aria-hidden="true">
                      <svg viewBox="0 0 10 14" width="10" height="14">
                        <circle cx="2" cy="2" r="1.1" />
                        <circle cx="8" cy="2" r="1.1" />
                        <circle cx="2" cy="7" r="1.1" />
                        <circle cx="8" cy="7" r="1.1" />
                        <circle cx="2" cy="12" r="1.1" />
                        <circle cx="8" cy="12" r="1.1" />
                      </svg>
                    </span>
                    <div className="treeText">
                      <span className="treeLabel">{node.label}</span>
                      <span className="treeTargetLabel">{node.linkedTargetLabel || "No target linked"}</span>
                    </div>
                    <div className="treeRowActions" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="iconBtn"
                        onClick={() => openEditEditor(node)}
                        aria-label="Edit menu item"
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <path d="M11.7 2.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L6.1 12H3v-3.1l8.7-6.6zM2 13h12v1H2z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="iconBtn danger"
                        onClick={() => void deleteMenuNode(node.nodeKey)}
                        aria-label="Delete menu collection"
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <path d="M6 2h4l1 1h3v1H2V3h3l1-1zm-2 3h8l-.6 8.2A1 1 0 0 1 10.4 14H5.6a1 1 0 0 1-1-.8L4 5z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="treeAddRoot">
                <button type="button" className="treeAddBtn" onClick={() => openAddEditor(null)}>
                  + Add menu item
                </button>
              </div>
            </div>
          </aside>

          <div
            className={resizingPanes ? "paneDivider resizing" : "paneDivider"}
            role="separator"
            aria-label="Resize tree and product sections"
            aria-orientation="vertical"
            aria-valuemin={TREE_PANEL_MIN_WIDTH}
            aria-valuemax={TREE_PANEL_MAX_WIDTH}
            aria-valuenow={treePanelWidth}
            tabIndex={0}
            onMouseDown={(event) => {
              event.preventDefault();
              paneResizeStart.current = { x: event.clientX, width: treePanelWidth };
              setResizingPanes(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setTreePanelWidth((prev) => Math.max(TREE_PANEL_MIN_WIDTH, prev - 16));
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setTreePanelWidth((prev) => Math.min(TREE_PANEL_MAX_WIDTH, prev + 16));
              }
            }}
          >
            <span className="paneDividerGrip" aria-hidden="true" />
          </div>

          <main className="card panel">
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
              <span className="chip">Selected Collections: {selectedNodeKeysWithParents.length}</span>
              <span className="chip">Mapped Selected: {mappedSelectedNodeKeys.length}</span>
              <span className="chip">Page {page} / {totalPages}</span>
              <button
                className="primary"
                type="button"
                onClick={() => void bulkAssign(true)}
                disabled={saving || mappedSelectedNodeKeys.length < 1}
              >
                Assign Checked Products
              </button>
              <button
                type="button"
                onClick={() => void bulkAssign(false)}
                disabled={saving || mappedSelectedNodeKeys.length < 1}
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
              <span className="muted">Products per page</span>
              <select
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
            </div>
          </main>
        </div>
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
        <div className="previewOverlay" onClick={() => setShowMenuEditor(false)} role="dialog" aria-label="Menu item editor">
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
                <label htmlFor="menu-item-link-type">Link type</label>
                <select
                  id="menu-item-link-type"
                  value={menuEditorLinkType}
                  onChange={(event) => setMenuEditorLinkType(normalizeMenuEditorLinkType(event.target.value))}
                >
                  {MENU_LINK_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="editorField">
                <label htmlFor="menu-item-link-value">
                  {menuEditorLinkType === "HTTP"
                    ? "URL"
                    : menuEditorLinkType === "FRONTPAGE"
                      ? "Destination"
                      : "Handle or ID"}
                </label>
                <input
                  id="menu-item-link-value"
                  value={menuEditorLinkValue}
                  onChange={(event) => setMenuEditorLinkValue(event.target.value)}
                  placeholder={
                    menuEditorLinkType === "HTTP"
                      ? "/collections/sale or https://example.com"
                      : menuEditorLinkType === "FRONTPAGE"
                        ? "Homepage link does not need a value"
                        : "collection-handle, gid://..., or numeric ID"
                  }
                  disabled={menuEditorLinkType === "FRONTPAGE"}
                />
              </div>
            </div>
            <div className="topbar" style={{ justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowMenuEditor(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void saveMenuEditor()}
                disabled={
                  saving ||
                  !menuEditorLabel.trim() ||
                  (isMenuEditorLinkValueRequired(menuEditorLinkType) && !menuEditorLinkValue.trim())
                }
              >
                {menuEditorMode === "add" ? "Add Item" : "Save"}
              </button>
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
          gap: 12px;
          color: #e5e7eb;
          font-family: ui-sans-serif, system-ui, Segoe UI, Arial;
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
          grid-template-columns: 300px 12px minmax(0, 1fr);
          gap: 12px;
        }
        .paneDivider {
          display: flex;
          align-items: stretch;
          justify-content: center;
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
        .panel {
          padding: 10px;
        }
        .productControls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 10px;
        }
        .productSearchInput {
          min-width: 320px;
          flex: 1 1 360px;
        }
        .typesDropdown {
          position: relative;
          flex: 0 0 auto;
        }
        .productRefreshBtn {
          min-width: 150px;
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
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
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
        .tree {
          --tree-row-gap: 6px;
          max-height: 65vh;
          overflow: auto;
          border: 1px solid #2a3547;
          border-radius: 10px;
          padding: 8px;
          background: #0a1324;
          display: grid;
          gap: 0;
        }
        .treeRow {
          position: relative;
          min-height: 44px;
          border: 1px solid #2a3547;
          border-radius: 6px;
          margin-bottom: var(--tree-row-gap);
          background: #101a2d;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          line-height: 1.2;
          transition: background-color 120ms ease, border-color 120ms ease;
        }
        .treeRow:hover {
          background: #15233a;
          border-color: #3b4b63;
        }
        .treeRow:focus-visible {
          outline: 2px solid #60a5fa;
          outline-offset: -2px;
        }
        .treeRow.active {
          background: #0b5fff;
          border-color: #2d6df6;
        }
        .treeRow.active:hover {
          background: #0061f2;
        }
        .treeRow.has-parent::before {
          position: absolute;
          content: "";
          top: calc(-1 * var(--tree-row-gap));
          bottom: calc(-1 * var(--tree-row-gap));
          left: calc(var(--tree-indent, 10px) - 16px);
          border-left: 1px solid rgba(229, 231, 235, 0.42);
          pointer-events: none;
        }
        .treeRow.has-parent.is-last::before {
          bottom: 50%;
        }
        .treeRow.has-parent::after {
          position: absolute;
          top: 50%;
          left: calc(var(--tree-indent, 10px) - 16px);
          width: 14px;
          content: "";
          border-top: 1px solid rgba(229, 231, 235, 0.42);
          pointer-events: none;
        }
        .dragHandle {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #94a3b8;
          cursor: grab;
          flex: 0 0 auto;
        }
        .dragHandle.grabbing {
          cursor: grabbing;
        }
        .dragHandle svg circle {
          fill: currentColor;
        }
        .treeText {
          min-width: 0;
          display: grid;
          gap: 2px;
          align-items: center;
        }
        .treeLabel {
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 500;
        }
        .treeTargetLabel {
          color: #94a3b8;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
        }
        .treeRow.active .treeLabel,
        .treeRow.active .treeTargetLabel,
        .treeRow.active .dragHandle {
          color: #ffffff;
        }
        .treeRow.active.has-parent::before,
        .treeRow.active.has-parent::after {
          opacity: 0.45;
        }
        .treeRowActions {
          margin-left: auto;
          display: inline-flex;
          gap: 6px;
          opacity: 0;
          transition: opacity 120ms ease;
        }
        .treeRow:hover .treeRowActions {
          opacity: 1;
        }
        .iconBtn {
          width: 24px;
          height: 24px;
          min-height: 24px;
          padding: 0;
          border: 1px solid #334155;
          border-radius: 6px;
          background: rgba(15, 23, 42, 0.45);
          color: #cbd5e1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          opacity: 0.72;
        }
        .iconBtn:hover {
          background: rgba(30, 41, 59, 0.88);
          opacity: 1;
        }
        .iconBtn:active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
          opacity: 1;
        }
        .iconBtn svg path {
          fill: currentColor;
        }
        .iconBtn.danger {
          color: #fecaca;
          border-color: #7f1d1d;
          background: #1f0f14;
        }
        .treeAddRoot {
          padding: 10px 10px 12px 58px;
          border-top: 1px dashed #2a3547;
        }
        .treeAddBtn {
          min-height: 28px;
          height: 28px;
          padding: 0 10px;
          border-radius: 6px;
          border: 1px dashed #33506e;
          background: #0f1d33;
          color: #cde0ff;
          font-size: 12px;
        }
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
        .editorLinkSection {
          border: 1px solid #243042;
          border-radius: 10px;
          padding: 10px;
          display: grid;
          gap: 10px;
          background: #0a1220;
        }
        .editorLinkHeading {
          margin: 0;
          font-size: 12px;
          color: #e2e8f0;
          font-weight: 600;
        }
        .treeRow.dragging {
          opacity: 0.45;
        }
        .treeRow.drop-before {
          border-top-color: #38bdf8;
          box-shadow: inset 0 2px 0 #38bdf8;
        }
        .treeRow.drop-after {
          border-bottom-color: #38bdf8;
          box-shadow: inset 0 -2px 0 #38bdf8;
        }
        .treeRow.drop-inside {
          background: rgba(56, 189, 248, 0.08);
          box-shadow: inset 0 0 0 1px #38bdf8;
        }
        .tableWrap {
          overflow: auto;
          border: 1px solid #2a3547;
          border-radius: 10px;
          background: #0a1324;
          max-height: 65vh;
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
          justify-content: flex-end;
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
          .grid2 {
            grid-template-columns: 1fr;
          }
          .paneDivider {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
