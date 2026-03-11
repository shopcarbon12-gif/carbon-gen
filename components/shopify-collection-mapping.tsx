"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type SortValue = "title-asc" | "title-desc" | "upc-asc" | "upc-desc";

type DropPosition = "before" | "after" | "inside";

export default function ShopifyCollectionMapping() {
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<Record<string, boolean>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [treeSearch, setTreeSearch] = useState("");
  const [search, setSearch] = useState("");
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
  const [dragSourceKey, setDragSourceKey] = useState("");
  const [dropTarget, setDropTarget] = useState<{ targetKey: string; position: DropPosition } | null>(null);

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

  const treeNodes = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return nodes;
    const include = new Set<string>();
    for (const node of nodes) {
      const haystack = `${node.label} ${node.linkedTargetLabel || ""}`.toLowerCase();
      if (!haystack.includes(q)) continue;
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

  async function loadData() {
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
      const resp = await fetch(`/api/shopify/collection-mapping?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await resp.json()) as MappingResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(json.error || "Failed to load Shopify collection mapping.");
      }

      const nextNodes = (json.nodes || []).filter((node) => node.enabled);
      const firstWithCollection = nextNodes.find((node) => node.collectionId);
      setNodes(nextNodes);
      setRows(json.rows || []);
      const nextCollections = (json.collections || []).map((row) => ({
        id: String(row.id || ""),
        title: String(row.title || "").trim() || String(row.id || ""),
      }));
      setCollections(nextCollections);
      setCollectionCount(nextCollections.length);
      setProductCount(Number(json.total || json.summary?.totalProducts || (json.rows || []).length));
      setTotalPages(Math.max(1, Number(json.totalPages || 1)));
      if (json.page && Number.isFinite(Number(json.page))) {
        setPage(Math.max(1, Number(json.page)));
      }
      setWarning(String(json.warning || "").trim());

      setSelectedNodes((prev) => {
        const out: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) {
          if (prev[key] && nextNodes.some((node) => node.nodeKey === key)) out[key] = true;
        }
        if (Object.keys(out).length < 1 && firstWithCollection?.nodeKey) {
          out[firstWithCollection.nodeKey] = true;
        }
        return out;
      });
      setSelectedProducts((prev) => {
        const out: Record<string, boolean> = {};
        for (const key of Object.keys(prev)) {
          if (prev[key]) out[key] = true;
        }
        return out;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load collection mapping.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function clearProductSelectionsForDataQuery() {
    setSelectedProducts({});
    setPage(1);
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
  }, [search, sort, page, pageSize]);

  function getHeaderArrow(field: "title" | "upc") {
    const [activeField, dir] = sort.split("-") as ["title" | "upc", "asc" | "desc"];
    if (activeField !== field) return "↕";
    return dir === "asc" ? "▲" : "▼";
  }

  function toggleHeaderSort(field: "title" | "upc") {
    const [activeField, dir] = sort.split("-") as ["title" | "upc", "asc" | "desc"];
    if (activeField === field) {
      clearProductSelectionsForDataQuery();
      setSort(`${field}-${dir === "asc" ? "desc" : "asc"}` as SortValue);
      return;
    }
    clearProductSelectionsForDataQuery();
    setSort(`${field}-asc` as SortValue);
  }

  function downloadAuditCsv() {
    const lines: string[] = [];
    const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    lines.push(`${csvCell("Collection Audit Report")}`);
    lines.push(`${csvCell("Generated At")},${csvCell(collectionAudit.generatedAt)}`);
    lines.push(`${csvCell("Total Shopify Collections")},${csvCell(collectionAudit.totalCollections)}`);
    lines.push(`${csvCell("Mapped Nodes")},${csvCell(collectionAudit.mappedNodes)}`);
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
      for (const id of ids) {
        const resp = await fetch("/api/shopify/collection-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "toggle-nodes",
            productId: id,
            nodeKeys: mappedSelectedNodeKeys,
            checked,
          }),
        });
        const json = (await resp.json()) as ToggleResponse;
        if (!resp.ok || !json.ok) {
          throw new Error(json.error || "Bulk assign/unassign failed.");
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
      }
      if (!checked) {
        setSelectedProducts({});
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk assign/unassign failed.";
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
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              clearProductSelectionsForDataQuery();
            }}
            placeholder="Search products (title / sku / upc / type)"
            style={{ minWidth: 320 }}
          />
          <span className="pill">Auto-parent logic ON</span>
          <span className="pill">Live Shopify sync ON</span>
          <button type="button" onClick={() => setShowAuditReport(true)}>
            Collection Audit Log
          </button>
        </div>
        <div className="kpi" style={{ marginTop: 10 }}>
          <div className="k">
            <div className="muted">Collections</div>
            <b>{collectionCount}</b>
          </div>
          <div className="k">
            <div className="muted">Menu Nodes</div>
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
        <h2>Dual-Pane Mapper (Tree left, multi-select columns right)</h2>
        <div className="grid2" style={{ marginTop: 10 }}>
          <aside className="card panel">
            <h3>Menu Tree</h3>
            <p className="muted small" style={{ marginTop: 4 }}>
              Multi-select nodes. Parent categories are auto-selected when selecting deep children.
            </p>
            <div className="topbar" style={{ marginTop: 8 }}>
              <input
                value={treeSearch}
                onChange={(event) => setTreeSearch(event.target.value)}
                placeholder="Search menu nodes..."
                aria-label="Search menu tree"
              />
            </div>
            <div className="tree" style={{ marginTop: 8 }}>
              {treeNodes.map((node) => {
                const checked = Boolean(selectedNodes[node.nodeKey]);
                const dragging = dragSourceKey === node.nodeKey;
                const dropState =
                  dropTarget?.targetKey === node.nodeKey ? `drop-${dropTarget.position}` : "";
                return (
                <div
                  key={node.nodeKey}
                  className={`nodeWrap ${dragging ? "dragging" : ""} ${dropState}`}
                  style={{ marginLeft: node.depth * 14 }}
                  draggable
                  onDragStart={() => {
                    setDragSourceKey(node.nodeKey);
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
                    const position: DropPosition = y < third ? "before" : y > third * 2 ? "after" : "inside";
                    setDropTarget({ targetKey: node.nodeKey, position });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!dragSourceKey) return;
                    if (!dropTarget || dropTarget.targetKey !== node.nodeKey) return;
                    void moveMenuNode();
                  }}
                >
                  <label className={checked ? "node active" : "node"}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => applyNodeSelection(node.nodeKey, event.target.checked)}
                    />
                    <span>{node.label}</span>
                    <span className="muted small">{node.linkedTargetLabel || "No target linked"}</span>
                  </label>
                </div>
              )})}
            </div>
          </aside>

          <main className="card panel">
            <div className="topbar">
              <span className="chip">Selected Nodes: {selectedNodeKeysWithParents.length}</span>
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
                    <th className="center">Assigned</th>
                    <th>Current Nodes</th>
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
                      const assigned =
                        mappedSelectedNodeKeys.length > 0 &&
                        mappedSelectedNodeKeys.every((key) => row.checkedNodeKeys.includes(key));
                      const currentNodes = row.checkedNodeKeys
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
                            ) : null}
                          </td>
                          <td className="productNameCol">{row.title}</td>
                          <td className="upcCol">{row.upc || "-"}</td>
                          <td className="center">
                            <input
                              type="checkbox"
                              checked={assigned}
                              onChange={(event) => void toggleAssign(row.id, event.target.checked)}
                              disabled={mappedSelectedNodeKeys.length < 1 || saving}
                            />
                          </td>
                          <td>
                            <span className="muted small">{currentNodes || "-"}</span>
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
        <div className="previewOverlay" onClick={() => setShowAuditReport(false)} role="dialog" aria-label="Collection audit report">
          <div className="reportModal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="previewClose" onClick={() => setShowAuditReport(false)} aria-label="Close report">
              X
            </button>
            <h3>Collection Audit Report</h3>
            <p className="muted" style={{ marginTop: 4 }}>
              Generated: {new Date(collectionAudit.generatedAt).toLocaleString()}
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
                      <span className="muted small">Mapped in {row.count} nodes</span>
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
          grid-template-columns: 300px 1fr;
          gap: 12px;
        }
        .panel {
          padding: 10px;
        }
        .tree {
          max-height: 65vh;
          overflow: auto;
          border: 1px solid #2a3547;
          border-radius: 10px;
          padding: 8px;
          background: #0a1324;
          display: grid;
          gap: 4px;
        }
        .node {
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid transparent;
          cursor: pointer;
          text-align: left;
          background: transparent;
          display: grid;
          gap: 2px;
        }
        .node input[type="checkbox"] {
          margin-right: 8px;
          transform: translateY(1px);
        }
        .node:hover {
          background: #152236;
        }
        .node.active {
          background: #0f2134;
          border-color: #164e63;
        }
        .nodeWrap {
          border-radius: 8px;
          border: 1px solid transparent;
        }
        .nodeWrap.dragging {
          opacity: 0.45;
        }
        .nodeWrap.drop-before {
          border-top-color: #38bdf8;
        }
        .nodeWrap.drop-after {
          border-bottom-color: #38bdf8;
        }
        .nodeWrap.drop-inside {
          border-color: #38bdf8;
          background: rgba(56, 189, 248, 0.08);
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
        }
      `}</style>
    </main>
  );
}
