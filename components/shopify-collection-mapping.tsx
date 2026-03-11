"use client";

import { useEffect, useMemo, useState } from "react";

type MenuNode = {
  nodeKey: string;
  label: string;
  parentKey: string | null;
  depth: number;
  enabled: boolean;
  collectionId: string | null;
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
  collections?: Array<{ id: string }>;
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

export default function ShopifyCollectionMapping() {
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [activeNode, setActiveNode] = useState("");
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortValue>("title-asc");
  const [collectionCount, setCollectionCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const nodeLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.nodeKey, node.label);
    }
    return map;
  }, [nodes]);

  const allSelected = useMemo(() => {
    if (rows.length < 1) return false;
    return rows.every((row) => Boolean(selectedRows[row.id]));
  }, [rows, selectedRows]);

  const currentNode = useMemo(() => {
    return nodes.find((node) => node.nodeKey === activeNode) || null;
  }, [nodes, activeNode]);

  async function loadData() {
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const [sortField, sortDir] = sort.split("-") as ["title" | "upc", "asc" | "desc"];
      const params = new URLSearchParams({
        page: "1",
        pageSize: "120",
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
      setCollectionCount((json.collections || []).length);
      setProductCount(Number(json.summary?.totalProducts || (json.rows || []).length));
      setWarning(String(json.warning || "").trim());

      if (!activeNode || !nextNodes.some((node) => node.nodeKey === activeNode)) {
        setActiveNode(firstWithCollection?.nodeKey || nextNodes[0]?.nodeKey || "");
      }
      setSelectedRows({});
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load collection mapping.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, sort]);

  async function toggleAssign(productId: string, checked: boolean) {
    if (!activeNode) return;
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-node",
          productId,
          nodeKey: activeNode,
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
    if (!activeNode) return;
    const ids = rows.filter((row) => selectedRows[row.id]).map((row) => row.id);
    if (ids.length < 1) return;
    setSaving(true);
    setError("");
    try {
      for (const id of ids) {
        const resp = await fetch("/api/shopify/collection-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "toggle-node",
            productId: id,
            nodeKey: activeNode,
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
      setSelectedRows({});
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
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products (title / sku / upc / type)"
            style={{ minWidth: 320 }}
          />
          <select value={sort} onChange={(event) => setSort(event.target.value as SortValue)}>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
            <option value="upc-asc">UPC A-Z</option>
            <option value="upc-desc">UPC Z-A</option>
          </select>
          <span className="pill">Auto-parent logic ON</span>
          <span className="pill">Live Shopify sync ON</span>
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
        <h2>Dual-Pane Mapper (Tree left, one active node column right)</h2>
        <div className="grid2" style={{ marginTop: 10 }}>
          <aside className="card panel">
            <h3>Menu Tree</h3>
            <p className="muted small" style={{ marginTop: 4 }}>
              Pick one node. Right side shows a single assignment column.
            </p>
            <div className="tree" style={{ marginTop: 8 }}>
              {nodes.map((node) => (
                <button
                  key={node.nodeKey}
                  className={activeNode === node.nodeKey ? "node active" : "node"}
                  style={{ marginLeft: node.depth * 14 }}
                  onClick={() => setActiveNode(node.nodeKey)}
                  type="button"
                >
                  {node.label} <span className="muted small">({node.nodeKey})</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="card panel">
            <div className="topbar">
              <span className="chip">Active Node: {activeNode || "-"}</span>
              <span className="chip">{currentNode?.collectionId ? "Mapped Collection" : "Node Not Mapped"}</span>
              <button className="primary" type="button" onClick={() => void bulkAssign(true)} disabled={saving || !activeNode}>
                Assign Checked Products
              </button>
              <button type="button" onClick={() => void bulkAssign(false)} disabled={saving || !activeNode}>
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
                        checked={allSelected}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          const next: Record<string, boolean> = {};
                          for (const row of rows) next[row.id] = checked;
                          setSelectedRows(next);
                        }}
                        aria-label="Select all products"
                      />
                    </th>
                    <th>Picture</th>
                    <th>Product Name</th>
                    <th>UPC</th>
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
                      const assigned = activeNode ? row.checkedNodeKeys.includes(activeNode) : false;
                      const currentNodes = row.checkedNodeKeys
                        .map((key) => nodeLabelByKey.get(key) || key)
                        .slice(0, 6)
                        .join(", ");
                      return (
                        <tr key={row.id}>
                          <td className="center">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedRows[row.id])}
                              onChange={(event) => setSelectedRows((prev) => ({ ...prev, [row.id]: event.target.checked }))}
                            />
                          </td>
                          <td className="center imgCell">
                            {row.image ? <img className="thumb" src={row.image} alt="" /> : null}
                          </td>
                          <td>{row.title}</td>
                          <td>{row.upc || "-"}</td>
                          <td className="center">
                            <input
                              type="checkbox"
                              checked={assigned}
                              onChange={(event) => void toggleAssign(row.id, event.target.checked)}
                              disabled={!activeNode || saving}
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
          </main>
        </div>
      </section>

      <style jsx>{`
        .page {
          max-width: 1700px;
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
          white-space: nowrap;
          text-align: left;
          background: transparent;
        }
        .node:hover {
          background: #152236;
        }
        .node.active {
          background: #0f2134;
          border-color: #164e63;
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
        .center {
          text-align: center;
        }
        .imgCell {
          width: 56px;
          min-width: 56px;
          max-width: 56px;
          text-align: center;
        }
        .thumb {
          width: 34px;
          height: 34px;
          border-radius: 6px;
          object-fit: cover;
          border: 1px solid #334155;
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
