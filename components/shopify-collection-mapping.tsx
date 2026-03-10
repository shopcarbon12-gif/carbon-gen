"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";

type MenuNode = {
  nodeKey: string;
  label: string;
  parentKey: string | null;
  depth: number;
  sortOrder: number;
  enabled: boolean;
  collectionId: string | null;
  collectionTitle: string | null;
  collectionHandle: string | null;
  defaultCollectionHandle: string | null;
  updatedAt: string | null;
};

type CollectionOption = {
  id: string;
  title: string;
  handle: string;
  productsCount: number | null;
};

type ProductRow = {
  id: string;
  title: string;
  handle: string;
  itemType: string;
  updatedAt: string;
  image: string | null;
  sku: string;
  upc: string;
  collectionIds: string[];
  checkedNodeKeys: string[];
};

type MappingLogRow = {
  id: string;
  action: string;
  summary: string;
  status: "ok" | "error";
  details: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
};

type MenuMeta = {
  id: string;
  handle: string;
  title: string;
};

type CollectionMappingResponse = {
  ok?: boolean;
  noop?: boolean;
  error?: string;
  warning?: string;
  shop?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  nodes?: MenuNode[];
  mappedNodes?: MenuNode[];
  collections?: CollectionOption[];
  rows?: ProductRow[];
  logs?: MappingLogRow[];
  menu?: MenuMeta;
};

type SortField = "title" | "upc" | "sku" | "itemType" | "updatedAt";
type SortDir = "asc" | "desc";
type UncheckPolicy = "keep-descendants" | "remove-descendants";
type DropPosition = "before" | "after" | "inside";

type ProductFilters = {
  q: string;
  title: string;
  sku: string;
  upc: string;
  itemType: string;
};

const DEFAULT_FILTERS: ProductFilters = {
  q: "",
  title: "",
  sku: "",
  upc: "",
  itemType: "",
};

const PAGE_SIZE_OPTIONS = [20, 30, 50, 75, 100] as const;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function byLabel(left: CollectionOption, right: CollectionOption) {
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
}

function formatNodeLabel(node: MenuNode) {
  const suffix = node.collectionHandle ? ` -> ${node.collectionHandle}` : "";
  return `${"  ".repeat(node.depth)}${node.label}${suffix}`;
}

function prettyDate(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return "-";
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return text;
  return new Date(parsed).toLocaleString();
}

export default function ShopifyCollectionMapping() {
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [shop, setShop] = useState("");
  const [menu, setMenu] = useState<MenuMeta | null>(null);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [mappedNodes, setMappedNodes] = useState<MenuNode[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [logs, setLogs] = useState<MappingLogRow[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [busy, setBusy] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const [toggleBusyKey, setToggleBusyKey] = useState("");
  const [nodeBusyKey, setNodeBusyKey] = useState("");
  const [showCompactColumns, setShowCompactColumns] = useState(false);
  const [uncheckPolicy, setUncheckPolicy] = useState<UncheckPolicy>("remove-descendants");
  const [lastFailedToggle, setLastFailedToggle] = useState<{
    productId: string;
    nodeKey: string;
    checked: boolean;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [dragNodeKey, setDragNodeKey] = useState("");
  const [dropHint, setDropHint] = useState<{ targetKey: string; position: DropPosition } | null>(null);

  const [editingNodeKey, setEditingNodeKey] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState("");

  const [createParentKey, setCreateParentKey] = useState<string | null>(null);
  const [createLabel, setCreateLabel] = useState("");
  const [createCollectionId, setCreateCollectionId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsBusy, setLogsBusy] = useState(false);

  const loadData = useCallback(
    async (
      targetPage = page,
      targetPageSize = pageSize,
      targetFilters = appliedFilters,
      includeLogs = false
    ) => {
      setBusy(true);
      setError("");
      setWarning("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(targetPageSize));
        params.set("sortField", sortField);
        params.set("sortDir", sortDir);
        if (menu?.handle) params.set("menuHandle", menu.handle);
        if (includeLogs) {
          params.set("includeLogs", "1");
          params.set("logLimit", "200");
        }
        for (const [key, value] of Object.entries(targetFilters)) {
          const text = normalizeText(value);
          if (text) params.set(key, text);
        }

        const response = await fetch(`/api/shopify/collection-mapping?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await response.json().catch(() => ({}))) as CollectionMappingResponse;
        if (!response.ok || json.ok === false) {
          throw new Error(normalizeText(json.error) || `Failed to load (${response.status})`);
        }

        const nextNodes = Array.isArray(json.nodes) ? json.nodes : [];
        const nextCollections = Array.isArray(json.collections) ? [...json.collections].sort(byLabel) : [];
        const nextMappedNodes = Array.isArray(json.mappedNodes) ? json.mappedNodes : [];

        setShop(normalizeText(json.shop));
        setMenu(json.menu || null);
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setNodes(nextNodes);
        setMappedNodes(nextMappedNodes);
        setCollections(nextCollections);
        if (includeLogs) {
          setLogs(Array.isArray(json.logs) ? json.logs : []);
        }
        setPage(Number(json.page || targetPage));
        setPageSize(Number(json.pageSize || targetPageSize));
        setTotal(Number(json.total || 0));
        setTotalPages(Math.max(1, Number(json.totalPages || 1)));

        setWarning(normalizeText(json.warning));
        setLastFailedToggle(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Failed to load collection mapping.");
      } finally {
        setBusy(false);
      }
    },
    [appliedFilters, menu?.handle, page, pageSize, sortDir, sortField]
  );

  useEffect(() => {
    void loadData(1, pageSize, appliedFilters);
  }, [sortField, sortDir]);

  const collectionById = useMemo(() => {
    const map = new Map<string, CollectionOption>();
    for (const collection of collections) {
      const id = normalizeText(collection.id);
      if (id) map.set(id, collection);
    }
    return map;
  }, [collections]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, MenuNode[]>();
    for (const node of nodes) {
      const parentKey = normalizeText(node.parentKey) || "__root__";
      const list = map.get(parentKey) || [];
      list.push(node);
      map.set(parentKey, list);
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
        })
      );
    }
    return map;
  }, [nodes]);

  const rootNodes = useMemo(() => childrenByParent.get("__root__") || [], [childrenByParent]);

  const mappedNodeColumns = useMemo(
    () =>
      mappedNodes
        .filter((node) => node.enabled && Boolean(node.collectionId))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    [mappedNodes]
  );

  const mappingSummary = useMemo(() => {
    let mapped = 0;
    let unmapped = 0;
    let disabled = 0;
    for (const node of nodes) {
      if (!node.enabled) {
        disabled += 1;
        continue;
      }
      if (node.collectionId) mapped += 1;
      else unmapped += 1;
    }
    return { mapped, unmapped, disabled };
  }, [nodes]);
  const runMenuAction = useCallback(
    async (payload: Record<string, unknown>, actionStatus: string, refreshProducts = true) => {
      setMenuBusy(true);
      setError("");
      setWarning("");
      setStatus(actionStatus);
      try {
        const response = await fetch("/api/shopify/collection-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop,
            menuHandle: menu?.handle || "",
            ...payload,
          }),
        });
        const json = (await response.json().catch(() => ({}))) as CollectionMappingResponse;
        if (!response.ok || json.ok === false) {
          throw new Error(normalizeText(json.error) || `Action failed (${response.status})`);
        }

        if (refreshProducts) {
          await loadData(page, pageSize, appliedFilters, logsOpen);
        } else {
          if (Array.isArray(json.nodes)) setNodes(json.nodes);
          if (Array.isArray(json.mappedNodes)) setMappedNodes(json.mappedNodes);
          if (json.menu) setMenu(json.menu);
          if (normalizeText(json.warning)) setWarning(normalizeText(json.warning));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Action failed.");
        setStatus("");
      } finally {
        setMenuBusy(false);
      }
    },
    [appliedFilters, loadData, logsOpen, menu?.handle, page, pageSize, shop]
  );

  async function onRefreshMenu() {
    await runMenuAction({ action: "refresh-menu" }, "Syncing menu from Shopify...");
  }

  async function onApplyNodeCollection(node: MenuNode) {
    if (!editingNodeKey) return;
    setNodeBusyKey(node.nodeKey);
    await runMenuAction(
      {
        action: "set-node-mapping-live",
        nodeKey: node.nodeKey,
        collectionId: normalizeText(editingCollectionId) || null,
        enabled: node.enabled,
      },
      "Updating node mapping live..."
    );
    setNodeBusyKey("");
    setEditingNodeKey("");
    setEditingCollectionId("");
  }

  async function onToggleNodeEnabled(node: MenuNode, enabled: boolean) {
    setNodeBusyKey(node.nodeKey);
    await runMenuAction(
      {
        action: "set-node-mapping-live",
        nodeKey: node.nodeKey,
        collectionId: node.collectionId || null,
        enabled,
        syncMenuLink: false,
      },
      "Updating node state live..."
    );
    setNodeBusyKey("");
  }

  async function onCreateNode() {
    const label = normalizeText(createLabel);
    if (!label) {
      setError("Category label is required.");
      return;
    }
    await runMenuAction(
      {
        action: "create-menu-node",
        label,
        parentKey: createParentKey || null,
        collectionId: normalizeText(createCollectionId) || null,
      },
      "Creating category in Shopify menu..."
    );
    setCreateOpen(false);
    setCreateLabel("");
    setCreateCollectionId("");
    setCreateParentKey(null);
  }

  async function onMoveNode(nodeKey: string, targetKey: string, position: DropPosition) {
    await runMenuAction(
      {
        action: "move-menu-node",
        nodeKey,
        targetKey,
        position,
      },
      "Updating menu hierarchy live..."
    );
  }

  async function onOpenLogs() {
    setLogsOpen(true);
    setLogsBusy(true);
    setError("");
    try {
      const response = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-logs", shop, limit: 200 }),
      });
      const json = (await response.json().catch(() => ({}))) as CollectionMappingResponse;
      if (!response.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || "Failed to load logs.");
      }
      setLogs(Array.isArray(json.logs) ? json.logs : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to load logs.");
    } finally {
      setLogsBusy(false);
    }
  }

  async function onDownloadLogsCsv() {
    try {
      const response = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download-logs-csv", shop, limit: 1000 }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(normalizeText(text) || "Failed to download logs CSV.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `collection-mapping-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to download logs.");
    }
  }

  async function onToggleNode(row: ProductRow, node: MenuNode, checked: boolean) {
    const key = `${row.id}::${node.nodeKey}`;
    setToggleBusyKey(key);
    setError("");
    setWarning("");
    setStatus("");

    try {
      const response = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-node",
          shop,
          menuHandle: menu?.handle || "",
          productId: row.id,
          nodeKey: node.nodeKey,
          checked,
          uncheckPolicy,
        }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        noop?: boolean;
        error?: string;
        warning?: string;
        product?: {
          id: string;
          title: string;
          collectionIds: string[];
          checkedNodeKeys: string[];
        };
      };

      if (!response.ok || json.ok === false || !json.product) {
        throw new Error(normalizeText(json.error) || "Failed to update Shopify collection mapping.");
      }

      setRows((prev) =>
        prev.map((current) =>
          current.id === json.product!.id
            ? {
                ...current,
                collectionIds: Array.isArray(json.product!.collectionIds)
                  ? json.product!.collectionIds
                  : [],
                checkedNodeKeys: Array.isArray(json.product!.checkedNodeKeys)
                  ? json.product!.checkedNodeKeys
                  : [],
              }
            : current
        )
      );

      setLastFailedToggle(null);
      if (json.noop) {
        setStatus(normalizeText(json.warning) || "No Shopify update was needed.");
      } else {
        setStatus("Shopify collections updated live.");
      }
      if (normalizeText(json.warning)) {
        setWarning(normalizeText(json.warning));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to update checkbox state.");
      setLastFailedToggle({ productId: row.id, nodeKey: node.nodeKey, checked });
      setWarning("Last toggle failed. Use Retry Last Toggle after fixing connectivity/API issues.");
      setStatus("");
    } finally {
      setToggleBusyKey("");
    }
  }

  function onRetryLastToggle() {
    if (!lastFailedToggle) return;
    const row = rows.find((item) => item.id === lastFailedToggle.productId);
    const node =
      mappedNodeColumns.find((item) => item.nodeKey === lastFailedToggle.nodeKey) ||
      nodes.find((item) => item.nodeKey === lastFailedToggle.nodeKey);

    if (!row || !node) {
      setError("Retry is unavailable because the product row or mapped node is no longer visible. Click Refresh.");
      return;
    }

    void onToggleNode(row, node, lastFailedToggle.checked);
  }

  function toggleCollapse(nodeKey: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) next.delete(nodeKey);
      else next.add(nodeKey);
      return next;
    });
  }

  function renderNodeRows(node: MenuNode): JSX.Element[] {
    const children = childrenByParent.get(node.nodeKey) || [];
    const hasChildren = children.length > 0;
    const collapsed = collapsedKeys.has(node.nodeKey);
    const isEditing = editingNodeKey === node.nodeKey;
    const busyNode = nodeBusyKey === node.nodeKey;
    const mappedCollection = node.collectionId ? collectionById.get(node.collectionId) : null;
    const dropClass = dropHint?.targetKey === node.nodeKey ? `drop-${dropHint.position}` : "";

    const rowsOut: JSX.Element[] = [];
    rowsOut.push(
      <tr
        key={node.nodeKey}
        className={`node-row ${dropClass}`}
        draggable
        onDragStart={(event) => {
          setDragNodeKey(node.nodeKey);
          event.dataTransfer.setData("text/plain", node.nodeKey);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragNodeKey("");
          setDropHint(null);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragNodeKey || dragNodeKey === node.nodeKey) return;
          const rect = (event.currentTarget as HTMLTableRowElement).getBoundingClientRect();
          const offset = event.clientY - rect.top;
          const third = rect.height / 3;
          const position: DropPosition =
            offset < third ? "before" : offset > third * 2 ? "after" : "inside";
          setDropHint({ targetKey: node.nodeKey, position });
        }}
        onDrop={(event) => {
          event.preventDefault();
          const source = dragNodeKey || normalizeText(event.dataTransfer.getData("text/plain"));
          if (!source || source === node.nodeKey || !dropHint || dropHint.targetKey !== node.nodeKey) return;
          void onMoveNode(source, node.nodeKey, dropHint.position);
          setDragNodeKey("");
          setDropHint(null);
        }}
      >
        <td>
          <label className="enable-toggle">
            <input
              type="checkbox"
              checked={Boolean(node.enabled)}
              onChange={(event) => void onToggleNodeEnabled(node, event.target.checked)}
              disabled={menuBusy || busy || busyNode}
            />
            <span>{node.enabled ? "On" : "Off"}</span>
          </label>
        </td>
        <td className="node-cell">
          <div className="node-line" style={{ paddingLeft: `${Math.max(0, node.depth) * 22}px` }}>
            <span className="drag-handle" title="Drag to reorder/reparent">::</span>
            {hasChildren ? (
              <button className="collapse-btn" onClick={() => toggleCollapse(node.nodeKey)} type="button">
                {collapsed ? "+" : "-"}
              </button>
            ) : (
              <span className="collapse-spacer" />
            )}
            <span className="node-label">{node.label}</span>
          </div>
        </td>
        <td className="collection-cell">
          {!isEditing ? (
            <button
              className="collection-chip"
              onClick={() => {
                setEditingNodeKey(node.nodeKey);
                setEditingCollectionId(normalizeText(node.collectionId));
              }}
              disabled={menuBusy || busy}
            >
              {mappedCollection
                ? `${mappedCollection.title} (${mappedCollection.handle})`
                : "Assign collection"}
            </button>
          ) : (
            <div className="collection-editor">
              <select
                value={editingCollectionId}
                onChange={(event) => setEditingCollectionId(normalizeText(event.target.value))}
                disabled={menuBusy || busy}
              >
                <option value="">(Not mapped)</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.title} ({collection.handle})
                  </option>
                ))}
              </select>
              <button className="tiny-btn" onClick={() => void onApplyNodeCollection(node)} disabled={menuBusy || busy}>
                Apply
              </button>
              <button
                className="tiny-btn btn-outline"
                onClick={() => {
                  setEditingNodeKey("");
                  setEditingCollectionId("");
                }}
                disabled={menuBusy || busy}
              >
                Cancel
              </button>
            </div>
          )}
        </td>
        <td>
          <button
            className="tiny-btn btn-outline"
            onClick={() => {
              setCreateOpen(true);
              setCreateParentKey(node.nodeKey);
              setCreateLabel("");
              setCreateCollectionId("");
            }}
            disabled={menuBusy || busy}
          >
            Add Child
          </button>
        </td>
        <td>
          <div className="status-tags">
            {!node.enabled ? <span className="mini-tag muted-tag">Disabled</span> : null}
            {node.enabled && node.collectionId ? <span className="mini-tag good-tag">Mapped</span> : null}
            {node.enabled && !node.collectionId ? <span className="mini-tag muted-tag">Unmapped</span> : null}
            {dragNodeKey === node.nodeKey ? <span className="mini-tag warn-tag">Dragging</span> : null}
          </div>
        </td>
      </tr>
    );

    if (!collapsed) {
      for (const child of children) {
        rowsOut.push(...renderNodeRows(child));
      }
    }
    return rowsOut;
  }

  return (
    <main className="page">
      <section className="card top-nav">
        <Link href="/studio/shopify-mapping-inventory/workset" className="quick-chip">Workset</Link>
        <Link href="/studio/shopify-mapping-inventory/sales" className="quick-chip">Sales</Link>
        <Link href="/studio/shopify-mapping-inventory/inventory" className="quick-chip">Inventory</Link>
        <Link href="/studio/shopify-mapping-inventory/carts-inventory" className="quick-chip">Carts Inventory</Link>
        <Link href="/studio/shopify-collection-mapping" className="quick-chip active">Collection Mapping</Link>
      </section>

      <section className="card">
        <div className="header-row">
          <div>
            <h1>Shopify Collection Mapping</h1>
            <p>Shop: <strong>{shop || "(auto)"}</strong></p>
            <p>
              Menu: <strong>{menu?.title || "(main-menu)"}</strong>{" "}
              <span className="muted">({menu?.handle || "main-menu"})</span>
            </p>
          </div>
          <div className="header-actions">
            <button className="btn-base btn-outline" onClick={onRefreshMenu} disabled={busy || menuBusy}>
              Pull Menu
            </button>
            <button
              className="btn-base btn-outline"
              onClick={() => void loadData(page, pageSize, appliedFilters, logsOpen)}
              disabled={busy || menuBusy}
            >
              Refresh
            </button>
            <button className="btn-base btn-outline" onClick={() => void onOpenLogs()} disabled={busy || menuBusy}>
              Logs
            </button>
          </div>
        </div>

        {status ? <p className="status-msg">{status}</p> : null}
        {warning ? <p className="warn-msg">{warning}</p> : null}
        {error ? <p className="error-msg">{error}</p> : null}
        {lastFailedToggle ? (
          <p className="retry-wrap">
            <button
              className="btn-base btn-outline"
              onClick={onRetryLastToggle}
              disabled={busy || menuBusy || Boolean(toggleBusyKey)}
            >
              Retry Last Toggle
            </button>
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Menu to Collection Mapping</h2>
          <button
            className="btn-base btn-outline"
            onClick={() => {
              setCreateOpen(true);
              setCreateParentKey(null);
              setCreateLabel("");
              setCreateCollectionId("");
            }}
            disabled={menuBusy || busy}
          >
            Add Root Category
          </button>
        </div>

        <div className="mapping-health">
          <span className="pill good">Mapped: {mappingSummary.mapped}</span>
          <span className="pill">Unmapped (enabled): {mappingSummary.unmapped}</span>
          <span className="pill">Disabled: {mappingSummary.disabled}</span>
        </div>

        {createOpen ? (
          <div className="create-panel">
            <h3>Create Category</h3>
            <div className="create-grid">
              <input
                value={createLabel}
                placeholder="Category label"
                onChange={(event) => setCreateLabel(event.target.value)}
              />
              <select
                value={createParentKey || ""}
                onChange={(event) => setCreateParentKey(normalizeText(event.target.value) || null)}
              >
                <option value="">Root level</option>
                {nodes.map((node) => (
                  <option key={node.nodeKey} value={node.nodeKey}>
                    {formatNodeLabel(node)}
                  </option>
                ))}
              </select>
              <select
                value={createCollectionId}
                onChange={(event) => setCreateCollectionId(normalizeText(event.target.value))}
              >
                <option value="">(No collection)</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.title} ({collection.handle})
                  </option>
                ))}
              </select>
              <button className="btn-base" onClick={() => void onCreateNode()} disabled={menuBusy || busy}>
                Create Live
              </button>
              <button className="btn-base btn-outline" onClick={() => setCreateOpen(false)} disabled={menuBusy || busy}>
                Cancel
              </button>
            </div>
            <p className="muted">Drag rows to reorder or reparent. Drop in middle to make a child, top/bottom for before/after.</p>
          </div>
        ) : null}

        <div className="map-table-wrap">
          <table className="map-table">
            <thead>
              <tr>
                <th>Enabled</th>
                <th>Menu Node</th>
                <th>Collection Mapping</th>
                <th>Actions</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {nodes.length < 1 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No menu nodes available.
                  </td>
                </tr>
              ) : (
                rootNodes.flatMap((node) => renderNodeRows(node))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Products</h2>
          <div className="muted">{total} item(s)</div>
        </div>

        <div className="filters">
          <input
            value={filters.q}
            placeholder="Search (partial text)"
            onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
          />
          <input
            value={filters.title}
            placeholder="Title"
            onChange={(event) => setFilters((prev) => ({ ...prev, title: event.target.value }))}
          />
          <input
            value={filters.sku}
            placeholder="SKU"
            onChange={(event) => setFilters((prev) => ({ ...prev, sku: event.target.value }))}
          />
          <input
            value={filters.upc}
            placeholder="UPC"
            onChange={(event) => setFilters((prev) => ({ ...prev, upc: event.target.value }))}
          />
          <input
            value={filters.itemType}
            placeholder="Item type"
            onChange={(event) => setFilters((prev) => ({ ...prev, itemType: event.target.value }))}
          />
        </div>

        <div className="filters actions-row">
          <select value={sortField} onChange={(event) => setSortField(event.target.value as SortField)}>
            <option value="title">Title</option>
            <option value="upc">UPC</option>
            <option value="sku">SKU</option>
            <option value="itemType">Item Type</option>
            <option value="updatedAt">Updated</option>
          </select>
          <select value={sortDir} onChange={(event) => setSortDir(event.target.value as SortDir)}>
            <option value="asc">A-Z / Old-New</option>
            <option value="desc">Z-A / New-Old</option>
          </select>
          <select value={uncheckPolicy} onChange={(event) => setUncheckPolicy(event.target.value as UncheckPolicy)}>
            <option value="remove-descendants">Uncheck parent + descendants (recommended)</option>
            <option value="keep-descendants">Uncheck only selected node</option>
          </select>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={showCompactColumns}
              onChange={(event) => setShowCompactColumns(event.target.checked)}
            />
            Show SKU + Item Type
          </label>
          <select
            value={String(pageSize)}
            onChange={(event) => {
              const nextSize = Number(event.target.value) || 30;
              setPageSize(nextSize);
              void loadData(1, nextSize, appliedFilters, logsOpen);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <button
            className="btn-base"
            onClick={() => {
              setAppliedFilters(filters);
              void loadData(1, pageSize, filters, logsOpen);
            }}
            disabled={busy}
          >
            Search
          </button>
          <button
            className="btn-base btn-outline"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setAppliedFilters(DEFAULT_FILTERS);
              void loadData(1, pageSize, DEFAULT_FILTERS, logsOpen);
            }}
            disabled={busy}
          >
            Clear
          </button>
        </div>

        <div className="table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Picture</th>
                <th>Title</th>
                <th>UPC</th>
                {showCompactColumns ? <th>SKU</th> : null}
                {showCompactColumns ? <th>Item Type</th> : null}
                {mappedNodeColumns.map((node) => (
                  <th key={node.nodeKey} title={formatNodeLabel(node)}>
                    {node.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length < 1 ? (
                <tr>
                  <td colSpan={3 + (showCompactColumns ? 2 : 0) + mappedNodeColumns.length} className="muted">
                    No products found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const checked = new Set(row.checkedNodeKeys || []);
                  return (
                    <tr key={row.id}>
                      <td className="center">
                        {row.image ? (
                          <button className="thumb-btn" onClick={() => setPreviewImage(row.image)} title="Open image preview">
                            <img src={row.image} alt={row.title} className="thumb" />
                          </button>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        <div className="title-cell">{row.title || row.handle || row.id}</div>
                      </td>
                      <td>{row.upc || "-"}</td>
                      {showCompactColumns ? <td>{row.sku || "-"}</td> : null}
                      {showCompactColumns ? <td>{row.itemType || "-"}</td> : null}
                      {mappedNodeColumns.map((node) => {
                        const key = `${row.id}::${node.nodeKey}`;
                        const cellBusy = toggleBusyKey === key;
                        return (
                          <td key={key} className="center">
                            {cellBusy ? (
                              <span className="cell-spinner" title="Updating Shopify">
                                ...
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={checked.has(node.nodeKey)}
                                onChange={(event) => void onToggleNode(row, node, event.target.checked)}
                                disabled={busy || menuBusy}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="pager actions-row">
          <button
            className="btn-base btn-outline"
            disabled={busy || page <= 1}
            onClick={() => void loadData(page - 1, pageSize, appliedFilters, logsOpen)}
          >
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            className="btn-base btn-outline"
            disabled={busy || page >= totalPages}
            onClick={() => void loadData(page + 1, pageSize, appliedFilters, logsOpen)}
          >
            Next
          </button>
        </div>
      </section>

      {logsOpen ? (
        <div className="preview-overlay" onClick={() => setLogsOpen(false)}>
          <div className="logs-modal" onClick={(event) => event.stopPropagation()}>
            <div className="logs-head">
              <h3>Live Mapping Logs (Auto-delete after 7 days)</h3>
              <div className="actions-row">
                <button className="btn-base btn-outline" onClick={() => void onOpenLogs()} disabled={logsBusy}>
                  Refresh Logs
                </button>
                <button className="btn-base btn-outline" onClick={() => void onDownloadLogsCsv()} disabled={logsBusy}>
                  Download CSV
                </button>
                <button className="btn-base btn-outline" onClick={() => setLogsOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <div className="table-wrap logs-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Action</th>
                    <th>Summary</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {logsBusy ? (
                    <tr>
                      <td colSpan={5} className="muted">Loading logs...</td>
                    </tr>
                  ) : logs.length < 1 ? (
                    <tr>
                      <td colSpan={5} className="muted">No logs yet.</td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td>{prettyDate(log.createdAt)}</td>
                        <td>{log.status}</td>
                        <td>{log.action}</td>
                        <td>{log.summary}</td>
                        <td>{log.errorMessage || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <div className="preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="preview-content" onClick={(event) => event.stopPropagation()}>
            <img src={previewImage} alt="Preview" className="preview-img" />
            <button className="preview-close" onClick={() => setPreviewImage(null)}>
              x
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .page {
          max-width: 100%;
          margin: 0 auto;
          padding: 118px 12px 24px;
          display: grid;
          gap: 14px;
        }
        .card {
          background: rgba(15, 23, 42, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          padding: 14px;
          color: #f8fafc;
        }
        h1,
        h2,
        h3,
        p {
          margin: 0;
        }
        .top-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .quick-chip {
          text-decoration: none;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          padding: 8px 12px;
          font-size: 0.82rem;
          font-weight: 700;
        }
        .quick-chip.active {
          border-color: rgba(34, 197, 94, 0.66);
          background: rgba(34, 197, 94, 0.18);
          color: #bbf7d0;
        }
        .header-row,
        .section-head,
        .actions-row,
        .pager {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .header-actions {
          display: inline-flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .retry-wrap {
          margin-top: 10px;
        }
        .mapping-health {
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .pill {
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 0.72rem;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
        }
        .pill.good {
          border-color: rgba(16, 185, 129, 0.45);
          color: #a7f3d0;
          background: rgba(16, 185, 129, 0.18);
        }
        .create-panel {
          margin-top: 12px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 10px;
          padding: 10px;
          background: rgba(15, 23, 42, 0.66);
          display: grid;
          gap: 8px;
        }
        .create-grid,
        .filters {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 8px;
        }
        input,
        select {
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(15, 23, 42, 0.74);
          color: #f8fafc;
          padding: 0 10px;
        }
        .inline-toggle {
          min-height: 38px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(15, 23, 42, 0.74);
          color: #f8fafc;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .inline-toggle input {
          width: 16px;
          height: 16px;
          min-height: 16px;
          margin: 0;
        }
        .btn-base {
          min-height: 38px;
          border: 1px solid rgba(34, 197, 94, 0.6);
          background: linear-gradient(180deg, rgba(34, 197, 94, 0.32) 0%, rgba(22, 163, 74, 0.28) 100%);
          color: #ecfdf5;
          border-radius: 10px;
          padding: 0 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .btn-base:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .btn-outline {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.28);
          color: #e2e8f0;
        }
        .tiny-btn {
          min-height: 30px;
          border: 1px solid rgba(34, 197, 94, 0.55);
          background: rgba(34, 197, 94, 0.16);
          color: #dcfce7;
          border-radius: 8px;
          padding: 0 10px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .status-msg,
        .warn-msg,
        .error-msg {
          margin-top: 10px;
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .status-msg {
          border: 1px solid rgba(16, 185, 129, 0.35);
          background: rgba(16, 185, 129, 0.14);
          color: #a7f3d0;
        }
        .warn-msg {
          border: 1px solid rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.14);
          color: #fde68a;
        }
        .error-msg {
          border: 1px solid rgba(248, 113, 113, 0.35);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
        }
        .map-table-wrap,
        .table-wrap {
          margin-top: 10px;
          overflow: auto;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 980px;
        }
        .map-table {
          min-width: 960px;
        }
        th,
        td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 10px;
          white-space: nowrap;
          text-align: left;
          vertical-align: middle;
        }
        th {
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: rgba(226, 232, 240, 0.86);
        }
        .node-row.drop-before td {
          border-top: 2px solid rgba(56, 189, 248, 0.9);
        }
        .node-row.drop-after td {
          border-bottom: 2px solid rgba(56, 189, 248, 0.9);
        }
        .node-row.drop-inside td {
          background: rgba(56, 189, 248, 0.15);
        }
        .enable-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.76rem;
          font-weight: 700;
        }
        .node-cell {
          min-width: 320px;
        }
        .node-line {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .drag-handle {
          display: inline-flex;
          width: 14px;
          justify-content: center;
          color: rgba(148, 163, 184, 0.9);
          cursor: grab;
          font-size: 0.8rem;
          font-weight: 800;
        }
        .collapse-btn,
        .collapse-spacer {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .collapse-btn {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          color: #e2e8f0;
          cursor: pointer;
          font-weight: 700;
        }
        .collapse-spacer {
          border: 1px dashed rgba(255, 255, 255, 0.08);
        }
        .node-label {
          font-weight: 700;
          font-size: 0.84rem;
        }
        .collection-cell {
          min-width: 300px;
        }
        .collection-chip {
          min-height: 30px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          background: rgba(148, 163, 184, 0.13);
          color: #f8fafc;
          border-radius: 999px;
          padding: 0 12px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          max-width: 280px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .collection-editor {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .status-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .mini-tag {
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.68rem;
          font-weight: 700;
          border: 1px solid rgba(255, 255, 255, 0.24);
        }
        .good-tag {
          border-color: rgba(16, 185, 129, 0.45);
          color: #a7f3d0;
          background: rgba(16, 185, 129, 0.2);
        }
        .warn-tag {
          border-color: rgba(245, 158, 11, 0.45);
          color: #fde68a;
          background: rgba(245, 158, 11, 0.2);
        }
        .muted-tag {
          border-color: rgba(226, 232, 240, 0.28);
          color: rgba(226, 232, 240, 0.72);
          background: rgba(148, 163, 184, 0.12);
        }
        .center {
          text-align: center;
        }
        .cell-spinner {
          display: inline-flex;
          min-width: 20px;
          justify-content: center;
          color: #fde68a;
          font-weight: 800;
        }
        .thumb-btn {
          border: 0;
          background: transparent;
          cursor: pointer;
          padding: 0;
          line-height: 0;
        }
        .thumb {
          width: 52px;
          height: 52px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
        }
        .title-cell {
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .muted {
          color: rgba(226, 232, 240, 0.65);
        }
        .preview-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
        }
        .preview-content {
          position: relative;
          max-width: 92vw;
          max-height: 92vh;
        }
        .preview-img {
          display: block;
          max-width: 92vw;
          max-height: 88vh;
          border-radius: 10px;
          object-fit: contain;
        }
        .preview-close {
          position: absolute;
          top: -14px;
          right: -14px;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.6);
          background: rgba(0, 0, 0, 0.66);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .logs-modal {
          width: min(1200px, 96vw);
          max-height: 90vh;
          overflow: hidden;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(2, 6, 23, 0.95);
          padding: 12px;
          display: grid;
          gap: 10px;
        }
        .logs-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .logs-wrap {
          max-height: 72vh;
        }
        @media (max-width: 1080px) {
          .page {
            padding-top: 126px;
            padding-left: 8px;
            padding-right: 8px;
          }
          table {
            min-width: 760px;
          }
          .collection-cell {
            min-width: 220px;
          }
        }
      `}</style>
    </main>
  );
}
