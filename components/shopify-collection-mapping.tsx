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
  summary?: {
    totalProducts?: number;
    mappedNodeCount?: number;
  };
};

type SortField = "title" | "upc" | "sku" | "itemType" | "updatedAt";
type SortDir = "asc" | "desc";
type UncheckPolicy = "keep-descendants" | "remove-descendants";

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

export default function ShopifyCollectionMapping() {
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [shop, setShop] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [nodes, setNodes] = useState<MenuNode[]>([]);
  const [mappedNodes, setMappedNodes] = useState<MenuNode[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);

  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({});
  const [enabledDraft, setEnabledDraft] = useState<Record<string, boolean>>({});

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [busy, setBusy] = useState(false);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [toggleBusyKey, setToggleBusyKey] = useState("");
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

        const nextNodes = Array.isArray(json.nodes) ? json.nodes : [];
        const nextCollections = Array.isArray(json.collections) ? [...json.collections].sort(byLabel) : [];

        setShop(normalizeText(json.shop));
        setRows(Array.isArray(json.rows) ? json.rows : []);
        setNodes(nextNodes);
        setMappedNodes(Array.isArray(json.mappedNodes) ? json.mappedNodes : []);
        setCollections(nextCollections);
        setPage(Number(json.page || targetPage));
        setPageSize(Number(json.pageSize || targetPageSize));
        setTotal(Number(json.total || 0));
        setTotalPages(Math.max(1, Number(json.totalPages || 1)));

        const nextMappingDraft: Record<string, string> = {};
        const nextEnabledDraft: Record<string, boolean> = {};
        for (const node of nextNodes) {
          nextMappingDraft[node.nodeKey] = normalizeText(node.collectionId);
          nextEnabledDraft[node.nodeKey] = Boolean(node.enabled);
        }
        setMappingDraft(nextMappingDraft);
        setEnabledDraft(nextEnabledDraft);

        setWarning(normalizeText(json.warning));
        setLastFailedToggle(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Failed to load collection mapping.");
      } finally {
        setBusy(false);
      }
    },
    [appliedFilters, page, pageSize, sortDir, sortField]
  );

  useEffect(() => {
    void loadData(1, pageSize, appliedFilters);
  }, [sortField, sortDir]);

  const mappedNodeColumns = useMemo(
    () => mappedNodes.filter((node) => node.enabled && Boolean(node.collectionId)),
    [mappedNodes]
  );

  const collectionById = useMemo(() => {
    const map = new Map<string, CollectionOption>();
    for (const collection of collections) {
      const id = normalizeText(collection.id);
      if (id) map.set(id, collection);
    }
    return map;
  }, [collections]);

  const nodeKeySet = useMemo(() => new Set(nodes.map((node) => node.nodeKey)), [nodes]);

  const mappingValidation = useMemo(() => {
    const orphanNodes: string[] = [];
    const missingCollectionNodes: string[] = [];
    const unmappedEnabledNodes: string[] = [];
    const duplicateSource = new Map<string, string[]>();
    let disabledCount = 0;
    let mappedCount = 0;

    for (const node of nodes) {
      const nodeKey = node.nodeKey;
      const enabled = Boolean(enabledDraft[nodeKey]);
      const collectionId = normalizeText(mappingDraft[nodeKey]);
      const hasCollection = Boolean(collectionId);
      const parentKey = normalizeText(node.parentKey);

      if (enabled && parentKey && !nodeKeySet.has(parentKey)) {
        orphanNodes.push(nodeKey);
      }

      if (!enabled) {
        disabledCount += 1;
      }

      if (enabled && !hasCollection) {
        unmappedEnabledNodes.push(nodeKey);
      }

      if (hasCollection && !collectionById.has(collectionId)) {
        missingCollectionNodes.push(nodeKey);
      }

      if (enabled && hasCollection) {
        mappedCount += 1;
        const list = duplicateSource.get(collectionId) || [];
        list.push(nodeKey);
        duplicateSource.set(collectionId, list);
      }
    }

    const duplicateMappings = Array.from(duplicateSource.entries())
      .filter(([, nodeKeys]) => nodeKeys.length > 1)
      .map(([collectionId, nodeKeys]) => ({
        collectionId,
        nodeKeys,
        count: nodeKeys.length,
        collectionTitle: collectionById.get(collectionId)?.title || collectionId,
      }))
      .sort((left, right) => right.count - left.count || left.collectionTitle.localeCompare(right.collectionTitle));

    const duplicateNodeKeys = new Set(duplicateMappings.flatMap((row) => row.nodeKeys));

    return {
      orphanNodes,
      missingCollectionNodes,
      unmappedEnabledNodes,
      duplicateMappings,
      duplicateNodeKeys,
      mappedCount,
      disabledCount,
    };
  }, [collectionById, enabledDraft, mappingDraft, nodeKeySet, nodes]);

  const draftChanged = useMemo(() => {
    return nodes.some((node) => {
      const currentId = normalizeText(node.collectionId);
      const draftId = normalizeText(mappingDraft[node.nodeKey]);
      const currentEnabled = Boolean(node.enabled);
      const draftEnabled = Boolean(enabledDraft[node.nodeKey]);
      return currentId !== draftId || currentEnabled !== draftEnabled;
    });
  }, [enabledDraft, mappingDraft, nodes]);

  async function onSaveMappings() {
    if (mappingBusy) return;

    if (mappingValidation.orphanNodes.length > 0) {
      setError(
        `Cannot save mapping: ${mappingValidation.orphanNodes.length} node(s) reference a missing parent. Fix taxonomy first.`
      );
      return;
    }

    if (mappingValidation.missingCollectionNodes.length > 0) {
      setError(
        `Cannot save mapping: ${mappingValidation.missingCollectionNodes.length} node(s) point to missing Shopify collections.`
      );
      return;
    }

    setMappingBusy(true);
    setError("");
    setWarning("");
    setStatus("Saving menu-to-collection mappings...");

    try {
      if (mappingValidation.duplicateMappings.length > 0) {
        setWarning(
          `Warning: ${mappingValidation.duplicateMappings.length} collection(s) are mapped to multiple nodes. Save will continue.`
        );
      }

      const mappings = nodes.map((node) => ({
        nodeKey: node.nodeKey,
        collectionId: normalizeText(mappingDraft[node.nodeKey]) || null,
        enabled: Boolean(enabledDraft[node.nodeKey]),
      }));

      const response = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-mappings", shop, mappings }),
      });

      const json = (await response.json().catch(() => ({}))) as CollectionMappingResponse;
      if (!response.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || "Failed to save mappings.");
      }

      setStatus("Mappings saved.");
      await loadData(page, pageSize, appliedFilters);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to save mappings.");
      setStatus("");
    } finally {
      setMappingBusy(false);
    }
  }

  async function onResetMappings() {
    if (mappingBusy) return;
    setMappingBusy(true);
    setError("");
    setWarning("");
    setStatus("Resetting mappings to defaults...");

    try {
      const response = await fetch("/api/shopify/collection-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-mappings", shop }),
      });

      const json = (await response.json().catch(() => ({}))) as CollectionMappingResponse;
      if (!response.ok || json.ok === false) {
        throw new Error(normalizeText(json.error) || "Failed to reset mappings.");
      }

      setStatus("Mappings reset to defaults.");
      await loadData(page, pageSize, appliedFilters);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to reset mappings.");
      setStatus("");
    } finally {
      setMappingBusy(false);
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
        uncheckPolicy?: UncheckPolicy;
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
      setLastFailedToggle({
        productId: row.id,
        nodeKey: node.nodeKey,
        checked,
      });
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
            <p>
              Shop: <strong>{shop || "(auto)"}</strong>
            </p>
          </div>
          <div className="header-actions">
            <button className="btn-base btn-outline" onClick={() => void loadData(page, pageSize, appliedFilters)} disabled={busy || mappingBusy}>
              Refresh
            </button>
          </div>
        </div>

        {status ? <p className="status-msg">{status}</p> : null}
        {warning ? <p className="warn-msg">{warning}</p> : null}
        {error ? <p className="error-msg">{error}</p> : null}
        {lastFailedToggle ? (
          <p className="retry-wrap">
            <button className="btn-base btn-outline" onClick={onRetryLastToggle} disabled={busy || mappingBusy || Boolean(toggleBusyKey)}>
              Retry Last Toggle
            </button>
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Menu to Collection Mapping</h2>
          <div className="actions-row">
            <button className="btn-base btn-outline" onClick={onResetMappings} disabled={mappingBusy || busy}>
              Reset Defaults
            </button>
            <button className="btn-base" onClick={onSaveMappings} disabled={mappingBusy || busy || !draftChanged}>
              Save Mapping
            </button>
          </div>
        </div>

        <div className="mapping-health">
          <span className="pill good">Mapped: {mappingValidation.mappedCount}</span>
          <span className="pill muted-pill">Unmapped (enabled): {mappingValidation.unmappedEnabledNodes.length}</span>
          <span className="pill muted-pill">Disabled: {mappingValidation.disabledCount}</span>
          {mappingValidation.duplicateMappings.length > 0 ? (
            <span className="pill warn-pill">Duplicate mappings: {mappingValidation.duplicateMappings.length}</span>
          ) : null}
          {mappingValidation.missingCollectionNodes.length > 0 ? (
            <span className="pill error-pill">Missing collections: {mappingValidation.missingCollectionNodes.length}</span>
          ) : null}
          {mappingValidation.orphanNodes.length > 0 ? (
            <span className="pill error-pill">Orphan nodes: {mappingValidation.orphanNodes.length}</span>
          ) : null}
        </div>
        {mappingValidation.duplicateMappings.length > 0 ? (
          <p className="validation-note warn-note">
            Duplicate mappings detected:{" "}
            {mappingValidation.duplicateMappings
              .slice(0, 5)
              .map((item) => `${item.collectionTitle} x${item.count}`)
              .join(", ")}
            {mappingValidation.duplicateMappings.length > 5 ? "..." : ""}
          </p>
        ) : null}
        {mappingValidation.missingCollectionNodes.length > 0 ? (
          <p className="validation-note error-note">
            Some nodes point to removed collections. Choose a valid collection before saving.
          </p>
        ) : null}
        {mappingValidation.orphanNodes.length > 0 ? (
          <p className="validation-note error-note">
            Taxonomy contains orphan nodes (missing parent). Save is blocked until fixed.
          </p>
        ) : null}

        <div className="map-table-wrap">
          <table className="map-table">
            <thead>
              <tr>
                <th>Enabled</th>
                <th>Menu Node</th>
                <th>Shopify Collection</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {nodes.length < 1 ? (
                <tr>
                  <td colSpan={4} className="muted">No menu nodes available.</td>
                </tr>
              ) : (
                nodes.map((node) => {
                  const options = [{ id: "", title: "(Not mapped)", handle: "", productsCount: null }, ...collections];
                  const nodeKey = node.nodeKey;
                  const draftCollectionId = normalizeText(mappingDraft[nodeKey]);
                  const draftEnabled = Boolean(enabledDraft[nodeKey]);
                  const hasCollection = Boolean(draftCollectionId);
                  const isMapped = draftEnabled && hasCollection && collectionById.has(draftCollectionId);
                  const isUnmapped = draftEnabled && !hasCollection;
                  const isMissingCollection = hasCollection && !collectionById.has(draftCollectionId);
                  const isDuplicate = mappingValidation.duplicateNodeKeys.has(nodeKey);
                  const isOrphan =
                    draftEnabled && Boolean(normalizeText(node.parentKey)) && !nodeKeySet.has(normalizeText(node.parentKey));
                  return (
                    <tr key={node.nodeKey}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(enabledDraft[node.nodeKey])}
                          onChange={(e) =>
                            setEnabledDraft((prev) => ({
                              ...prev,
                              [node.nodeKey]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td className="node-cell">
                        <span style={{ paddingLeft: `${Math.max(0, node.depth) * 16}px` }}>
                          {node.label}
                        </span>
                      </td>
                      <td>
                        <select
                          value={normalizeText(mappingDraft[node.nodeKey])}
                          onChange={(e) =>
                            setMappingDraft((prev) => ({
                              ...prev,
                              [node.nodeKey]: normalizeText(e.target.value),
                            }))
                          }
                        >
                          {options.map((collection) => (
                            <option key={`${node.nodeKey}::${collection.id || "none"}`} value={collection.id}>
                              {collection.id
                                ? `${collection.title} (${collection.handle})${collection.productsCount !== null ? ` - ${collection.productsCount}` : ""}`
                                : collection.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="status-tags">
                          {!draftEnabled ? <span className="mini-tag muted-tag">Disabled</span> : null}
                          {isMapped ? <span className="mini-tag good-tag">Mapped</span> : null}
                          {isUnmapped ? <span className="mini-tag muted-tag">Unmapped</span> : null}
                          {isMissingCollection ? <span className="mini-tag error-tag">Missing Collection</span> : null}
                          {isDuplicate ? <span className="mini-tag warn-tag">Duplicate</span> : null}
                          {isOrphan ? <span className="mini-tag error-tag">Orphan Parent</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
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

        <div className="filters actions-row">
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
          <select value={uncheckPolicy} onChange={(e) => setUncheckPolicy(e.target.value as UncheckPolicy)}>
            <option value="remove-descendants">Uncheck parent + descendants (recommended)</option>
            <option value="keep-descendants">Uncheck only selected node</option>
          </select>
          <label className="inline-toggle">
            <input
              type="checkbox"
              checked={showCompactColumns}
              onChange={(e) => setShowCompactColumns(e.target.checked)}
            />
            Show SKU + Item Type
          </label>
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
            disabled={busy}
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
                                onChange={(e) => void onToggleNode(row, node, e.target.checked)}
                                disabled={busy || mappingBusy}
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
            onClick={() => void loadData(page - 1, pageSize, appliedFilters)}
          >
            Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            className="btn-base btn-outline"
            disabled={busy || page >= totalPages}
            onClick={() => void loadData(page + 1, pageSize, appliedFilters)}
          >
            Next
          </button>
        </div>
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
        .pill.warn-pill {
          border-color: rgba(245, 158, 11, 0.45);
          color: #fde68a;
          background: rgba(245, 158, 11, 0.18);
        }
        .pill.error-pill {
          border-color: rgba(248, 113, 113, 0.45);
          color: #fecaca;
          background: rgba(220, 38, 38, 0.18);
        }
        .validation-note {
          margin-top: 8px;
          font-size: 0.82rem;
          border-radius: 8px;
          padding: 7px 10px;
        }
        .warn-note {
          border: 1px solid rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.14);
          color: #fde68a;
        }
        .error-note {
          border: 1px solid rgba(248, 113, 113, 0.35);
          background: rgba(220, 38, 38, 0.14);
          color: #fecaca;
        }
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
          min-width: 900px;
        }
        .map-table {
          min-width: 780px;
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
        .node-cell {
          min-width: 280px;
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
        .error-tag {
          border-color: rgba(248, 113, 113, 0.45);
          color: #fecaca;
          background: rgba(220, 38, 38, 0.2);
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
        @media (max-width: 1080px) {
          .page {
            padding-top: 126px;
            padding-left: 8px;
            padding-right: 8px;
          }
          table {
            min-width: 740px;
          }
        }
      `}</style>
    </main>
  );
}
