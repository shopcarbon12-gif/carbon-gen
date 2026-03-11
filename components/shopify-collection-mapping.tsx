"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  checkedNodeKeys: string[];
};

type CollectionMappingResponse = {
  ok?: boolean;
  error?: string;
  warning?: string;
  shop?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  nodes?: MenuNode[];
  mappedNodes?: MenuNode[];
  rows?: ProductRow[];
};

type SortField = "title" | "upc" | "sku" | "itemType" | "updatedAt";
type SortDir = "asc" | "desc";
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

function prettyDate(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return "-";
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return text;
  return new Date(parsed).toLocaleString();
}

function buildParentMap(nodes: MenuNode[]) {
  const out = new Map<string, string | null>();
  for (const node of nodes) out.set(node.nodeKey, node.parentKey || null);
  return out;
}

function collectAncestors(nodeKey: string, parentMap: Map<string, string | null>) {
  const out: string[] = [];
  let current = parentMap.get(nodeKey) || null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    out.push(current);
    seen.add(current);
    current = parentMap.get(current) || null;
  }
  return out;
}

export default function ShopifyCollectionMapping() {
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [shop, setShop] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [activeNodeKey, setActiveNodeKey] = useState("");
  const [toggleBusyKey, setToggleBusyKey] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const mappedNodes = useMemo(
    () => nodes.filter((node) => node.enabled && Boolean(node.collectionId)),
    [nodes]
  );

  const parentMap = useMemo(() => buildParentMap(mappedNodes), [mappedNodes]);
  const activeNode = useMemo(
    () => mappedNodes.find((node) => node.nodeKey === activeNodeKey) || null,
    [mappedNodes, activeNodeKey]
  );

  const loadData = useCallback(
    async (targetPage = page, targetPageSize = pageSize, targetFilters = appliedFilters) => {
      setBusy(true);
      setError("");
      setWarning("");
      try {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("pageSize", String(targetPageSize));
        params.set("sortField", sortField);
        params.set("sortDir", sortDir);
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

        const nextNodes = Array.isArray(json.mappedNodes)
          ? json.mappedNodes.filter((node) => node.enabled && Boolean(node.collectionId))
          : [];
        const nextRows = Array.isArray(json.rows) ? json.rows : [];
        setShop(normalizeText(json.shop));
        setNodes(nextNodes);
        setRows(nextRows);
        setPage(Number(json.page || targetPage));
        setPageSize(Number(json.pageSize || targetPageSize));
        setTotal(Number(json.total || 0));
        setTotalPages(Math.max(1, Number(json.totalPages || 1)));
        setWarning(normalizeText(json.warning));
        setSelectedRows({});

        setActiveNodeKey((prev) => {
          if (prev && nextNodes.some((node) => node.nodeKey === prev)) return prev;
          return nextNodes[0]?.nodeKey || "";
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Failed to load collection mapping.");
      } finally {
        setBusy(false);
      }
    },
    [appliedFilters, page, pageSize, sortField, sortDir]
  );

  useEffect(() => {
    void loadData(1, pageSize, appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortField, sortDir]);

  useEffect(() => {
    void loadData(1, pageSize, appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProductIds = useMemo(
    () => Object.keys(selectedRows).filter((id) => selectedRows[id]),
    [selectedRows]
  );

  const allRowsSelected = rows.length > 0 && rows.every((row) => Boolean(selectedRows[row.id]));

  async function onToggleNode(row: ProductRow, nodeKey: string, checked: boolean) {
    const key = `${row.id}::${nodeKey}`;
    setToggleBusyKey(key);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle-node",
          shop,
          productId: row.id,
          nodeKey,
          checked,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        warning?: string;
        product?: { id: string; checkedNodeKeys: string[] };
      };
      if (!response.ok || json.ok === false || !json.product) {
        throw new Error(normalizeText(json.error) || "Failed to update mapping.");
      }
      setRows((prev) =>
        prev.map((current) =>
          current.id === json.product!.id
            ? {
                ...current,
                checkedNodeKeys: Array.isArray(json.product!.checkedNodeKeys)
                  ? json.product!.checkedNodeKeys
                  : [],
              }
            : current
        )
      );
      if (normalizeText(json.warning)) {
        setWarning(normalizeText(json.warning));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to update checkbox state.");
    } finally {
      setToggleBusyKey("");
    }
  }

  async function bulkAssign(checked: boolean) {
    if (!activeNode || selectedProductIds.length < 1 || bulkBusy) return;
    setBulkBusy(true);
    setError("");
    setStatus(checked ? "Assigning selected products..." : "Removing selected products...");
    try {
      const updates = selectedProductIds.map(async (productId) => {
        const row = rows.find((r) => r.id === productId);
        if (!row) return null;

        if (checked) {
          const targets = [activeNode.nodeKey, ...collectAncestors(activeNode.nodeKey, parentMap)];
          for (const nodeKey of targets) {
            if (row.checkedNodeKeys.includes(nodeKey)) continue;
            await onToggleNode(
              { ...row, checkedNodeKeys: row.checkedNodeKeys },
              nodeKey,
              true
            );
          }
          return null;
        }

        if (!row.checkedNodeKeys.includes(activeNode.nodeKey)) return null;
        await onToggleNode({ ...row, checkedNodeKeys: row.checkedNodeKeys }, activeNode.nodeKey, false);
        return null;
      });
      await Promise.all(updates);
      setStatus(
        checked
          ? `Assigned ${selectedProductIds.length} product(s) to ${activeNode.label}.`
          : `Removed ${selectedProductIds.length} product(s) from ${activeNode.label}.`
      );
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="card top-nav">
        <Link href="/studio/shopify-mapping-inventory/workset" className="quick-chip">
          Workset
        </Link>
        <Link href="/studio/shopify-mapping-inventory/sales" className="quick-chip">
          Sales
        </Link>
        <Link href="/studio/shopify-mapping-inventory/inventory" className="quick-chip">
          Inventory
        </Link>
        <Link href="/studio/shopify-mapping-inventory/carts-inventory" className="quick-chip">
          Carts Inventory
        </Link>
        <Link href="/studio/shopify-collection-mapping" className="quick-chip active">
          Collection Mapping
        </Link>
      </section>

      <section className="card">
        <div className="header-row">
          <div>
            <h1>Shopify Collection Mapping</h1>
            <p className="muted">Dual-pane mapper focused on fast and accurate category assignment.</p>
            <p className="muted">
              Shop: <strong>{shop || "(auto)"}</strong> · Products: <strong>{total}</strong>
            </p>
          </div>
          <div className="header-actions">
            <button
              className="btn-base btn-outline"
              onClick={() => void loadData(page, pageSize, appliedFilters)}
              disabled={busy || bulkBusy}
            >
              Refresh
            </button>
          </div>
        </div>

        {status ? <p className="status-msg">{status}</p> : null}
        {warning ? <p className="warn-msg">{warning}</p> : null}
        {error ? <p className="error-msg">{error}</p> : null}
      </section>

      <section className="grid-two">
        <aside className="card side-pane">
          <h2>Menu Categories</h2>
          <p className="muted">Choose a single node, then assign products in the right pane.</p>
          <div className="tree-wrap">
            {mappedNodes.length < 1 ? (
              <p className="muted">No mapped categories available.</p>
            ) : (
              mappedNodes.map((node) => (
                <button
                  key={node.nodeKey}
                  type="button"
                  className={`node-item ${activeNodeKey === node.nodeKey ? "active" : ""}`}
                  style={{ paddingLeft: `${12 + node.depth * 18}px` }}
                  onClick={() => setActiveNodeKey(node.nodeKey)}
                >
                  <span>{node.label}</span>
                  <span className="node-meta">{node.collectionHandle || "-"}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="card main-pane">
          <div className="section-head">
            <h2>Products</h2>
            <div className="node-pill">
              Active Node:{" "}
              <strong>{activeNode ? `${activeNode.label} (${activeNode.collectionHandle})` : "-"}</strong>
            </div>
          </div>

          <div className="filters">
            <input
              value={filters.q}
              placeholder="Search title / sku / upc / type"
              onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
            <input
              value={filters.title}
              placeholder="Title"
              onChange={(e) => setFilters((prev) => ({ ...prev, title: e.target.value }))}
            />
            <input
              value={filters.sku}
              placeholder="SKU"
              onChange={(e) => setFilters((prev) => ({ ...prev, sku: e.target.value }))}
            />
            <input
              value={filters.upc}
              placeholder="UPC"
              onChange={(e) => setFilters((prev) => ({ ...prev, upc: e.target.value }))}
            />
            <input
              value={filters.itemType}
              placeholder="Item type"
              onChange={(e) => setFilters((prev) => ({ ...prev, itemType: e.target.value }))}
            />
          </div>

          <div className="actions-row">
            <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
              <option value="title">Title</option>
              <option value="upc">UPC</option>
              <option value="sku">SKU</option>
              <option value="itemType">Item Type</option>
              <option value="updatedAt">Updated</option>
            </select>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as SortDir)}>
              <option value="asc">A-Z / Old-New</option>
              <option value="desc">Z-A / New-Old</option>
            </select>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const nextSize = Number(e.target.value) || 30;
                setPageSize(nextSize);
                void loadData(1, nextSize, appliedFilters);
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
                void loadData(1, pageSize, filters);
              }}
              disabled={busy || bulkBusy}
            >
              Search
            </button>
            <button
              className="btn-base btn-outline"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setAppliedFilters(DEFAULT_FILTERS);
                void loadData(1, pageSize, DEFAULT_FILTERS);
              }}
              disabled={busy || bulkBusy}
            >
              Clear
            </button>
            <button
              className="btn-base"
              disabled={busy || bulkBusy || !activeNode || selectedProductIds.length < 1}
              onClick={() => void bulkAssign(true)}
            >
              Assign Selected
            </button>
            <button
              className="btn-base btn-outline"
              disabled={busy || bulkBusy || !activeNode || selectedProductIds.length < 1}
              onClick={() => void bulkAssign(false)}
            >
              Unassign Selected
            </button>
          </div>

          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th className="center">
                    <input
                      type="checkbox"
                      checked={allRowsSelected}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const next: Record<string, boolean> = {};
                        for (const row of rows) next[row.id] = checked;
                        setSelectedRows(next);
                      }}
                    />
                  </th>
                  <th>Picture</th>
                  <th>Title</th>
                  <th>UPC</th>
                  <th>SKU</th>
                  <th>Item Type</th>
                  <th>Updated</th>
                  <th className="center">Assigned?</th>
                </tr>
              </thead>
              <tbody>
                {rows.length < 1 ? (
                  <tr>
                    <td colSpan={8} className="muted">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const checked = new Set(row.checkedNodeKeys || []);
                    const assignedToActive = Boolean(activeNode && checked.has(activeNode.nodeKey));
                    const cellBusy = toggleBusyKey === `${row.id}::${activeNode?.nodeKey || ""}`;
                    return (
                      <tr key={row.id}>
                        <td className="center">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedRows[row.id])}
                            onChange={(e) =>
                              setSelectedRows((prev) => ({ ...prev, [row.id]: e.target.checked }))
                            }
                          />
                        </td>
                        <td className="center">
                          {row.image ? (
                            <button
                              className="thumb-btn"
                              onClick={() => setPreviewImage(row.image)}
                              title="Open image preview"
                            >
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
                        <td>{row.sku || "-"}</td>
                        <td>{row.itemType || "-"}</td>
                        <td>{prettyDate(row.updatedAt)}</td>
                        <td className="center">
                          <input
                            type="checkbox"
                            checked={assignedToActive}
                            disabled={!activeNode || busy || bulkBusy || cellBusy}
                            onChange={(e) => {
                              if (!activeNode) return;
                              void onToggleNode(row, activeNode.nodeKey, e.target.checked);
                            }}
                          />
                        </td>
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
              disabled={busy || bulkBusy || page <= 1}
              onClick={() => void loadData(page - 1, pageSize, appliedFilters)}
            >
              Prev
            </button>
            <span className="muted">
              Page {page} / {totalPages} · Selected {selectedProductIds.length}
            </span>
            <button
              className="btn-base btn-outline"
              disabled={busy || bulkBusy || page >= totalPages}
              onClick={() => void loadData(page + 1, pageSize, appliedFilters)}
            >
              Next
            </button>
          </div>
        </section>
      </section>

      {previewImage ? (
        <div className="preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
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
        p {
          margin: 0;
        }
        .muted {
          color: rgba(226, 232, 240, 0.72);
          font-size: 0.84rem;
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
        .grid-two {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 12px;
        }
        .side-pane,
        .main-pane {
          min-height: 62vh;
        }
        .tree-wrap {
          margin-top: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          overflow: auto;
          max-height: 56vh;
          background: rgba(15, 23, 42, 0.72);
          padding: 6px;
          display: grid;
          gap: 6px;
        }
        .node-item {
          min-height: 34px;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          text-align: left;
          cursor: pointer;
        }
        .node-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .node-item.active {
          border-color: rgba(56, 189, 248, 0.55);
          background: rgba(56, 189, 248, 0.18);
          color: #e0f2fe;
        }
        .node-meta {
          font-size: 0.72rem;
          color: rgba(226, 232, 240, 0.7);
        }
        .node-pill {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 0 10px;
          background: rgba(255, 255, 255, 0.06);
          font-size: 0.8rem;
        }
        .filters {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(5, minmax(140px, 1fr));
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
        .btn-base {
          min-height: 38px;
          border: 1px solid rgba(34, 197, 94, 0.6);
          background: linear-gradient(
            180deg,
            rgba(34, 197, 94, 0.32) 0%,
            rgba(22, 163, 74, 0.28) 100%
          );
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
        th,
        td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 10px;
          white-space: nowrap;
          text-align: left;
        }
        th {
          font-size: 0.76rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: rgba(226, 232, 240, 0.86);
        }
        .center {
          text-align: center;
        }
        .thumb-btn {
          border: 0;
          background: transparent;
          cursor: pointer;
          padding: 0;
          line-height: 0;
        }
        .thumb {
          width: 44px;
          height: 44px;
          object-fit: cover;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
        }
        .title-cell {
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
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
        @media (max-width: 1200px) {
          .grid-two {
            grid-template-columns: 1fr;
          }
          .side-pane,
          .main-pane {
            min-height: auto;
          }
          .filters {
            grid-template-columns: repeat(2, minmax(140px, 1fr));
          }
        }
      `}</style>
    </main>
  );
}
