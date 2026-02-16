"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type LightspeedStatusPayload = {
  connected?: boolean;
  label?: string;
  checkedAt?: string;
  domainPrefix?: string;
  accountId?: string;
  probe?: {
    message?: string;
  };
};

type ShopifyStatusPayload = {
  connected?: boolean;
  shop?: string | null;
  source?: string | null;
  reason?: string;
  installedAt?: string | null;
};

type LightspeedCatalogRow = {
  itemId?: string;
  customSku?: string;
  description?: string;
  qtyTotal?: number | null;
  retailPrice?: string | number | null;
  retailPriceNumber?: number | null;
};

type LightspeedCatalogPayload = {
  total?: number;
  rows?: LightspeedCatalogRow[];
};

type ShopifyCatalogPayload = {
  products?: Array<{ id?: string }>;
  pageInfo?: {
    hasNextPage?: boolean;
  };
  totalPages?: number | null;
};

type TopInventoryRow = {
  id: string;
  sku: string;
  title: string;
  qty: number;
  estValue: number | null;
};

type WorksetState = {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lightspeed: LightspeedStatusPayload | null;
  shopify: ShopifyStatusPayload | null;
  lightspeedTotal: number | null;
  shopifyTotal: number | null;
  processed: number | null;
  pending: number | null;
  integrationsOnline: number;
  topInventoryRows: TopInventoryRow[];
  updatedAt: string | null;
};

const TOP_ITEMS_LIMIT = 10;
const REFRESH_MS = 45_000;
const LIGHTSPEED_CATALOG_QUERY =
  "/api/lightspeed/catalog?page=1&pageSize=100&sortField=qty&sortDir=desc&shops=all";

function toNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function toInt(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function formatCount(value: number | null) {
  if (value === null) return "--";
  return value.toLocaleString();
}

function formatMoney(value: number | null) {
  if (value === null) return "--";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatStamp(value: string | null) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString();
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function buildTopRows(rows: LightspeedCatalogRow[] | undefined): TopInventoryRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row, index) => {
      const qty = toInt(row.qtyTotal);
      if (qty === null || qty <= 0) return null;
      const price = toNumber(row.retailPriceNumber ?? row.retailPrice);
      const title = String(row.description || "").trim();
      const sku = String(row.customSku || "").trim() || String(row.itemId || "").trim();
      return {
        id: String(row.itemId || row.customSku || `row-${index}`).trim() || `row-${index}`,
        sku: sku || `SKU-${index + 1}`,
        title: title || "Untitled item",
        qty,
        estValue: price !== null ? qty * price : null,
      } satisfies TopInventoryRow;
    })
    .filter((row): row is TopInventoryRow => Boolean(row))
    .slice(0, TOP_ITEMS_LIMIT);
}

export default function ShopifyMappingWorkset() {
  const [state, setState] = useState<WorksetState>({
    loading: true,
    refreshing: false,
    error: null,
    lightspeed: null,
    shopify: null,
    lightspeedTotal: null,
    shopifyTotal: null,
    processed: null,
    pending: null,
    integrationsOnline: 0,
    topInventoryRows: [],
    updatedAt: null,
  });

  const loadWorkset = useCallback(async (manual = false) => {
    setState((prev) => ({
      ...prev,
      loading: prev.loading && !manual,
      refreshing: manual || !prev.updatedAt,
      error: null,
    }));

    const warnings: string[] = [];
    try {
      const [lightspeedStatusResp, shopifyStatusResp] = await Promise.all([
        fetch("/api/lightspeed/status", { cache: "no-store" }),
        fetch("/api/shopify/status", { cache: "no-store" }),
      ]);

      const lightspeedStatusJson = (await lightspeedStatusResp.json().catch(() => ({}))) as
        | LightspeedStatusPayload
        | { error?: string };
      const shopifyStatusJson = (await shopifyStatusResp.json().catch(() => ({}))) as
        | ShopifyStatusPayload
        | { error?: string };

      if (!lightspeedStatusResp.ok) {
        warnings.push(
          String((lightspeedStatusJson as { error?: string })?.error || "Lightspeed status unavailable.")
        );
      }
      if (!shopifyStatusResp.ok) {
        warnings.push(String((shopifyStatusJson as { error?: string })?.error || "Shopify status unavailable."));
      }

      const lightspeed = (lightspeedStatusJson || {}) as LightspeedStatusPayload;
      const shopify = (shopifyStatusJson || {}) as ShopifyStatusPayload;
      const lightspeedConnected = Boolean(lightspeed.connected);
      const shopifyConnected = Boolean(shopify.connected && String(shopify.shop || "").trim());

      let lightspeedCatalog: LightspeedCatalogPayload | null = null;
      let shopifyCatalog: ShopifyCatalogPayload | null = null;

      if (lightspeedConnected) {
        try {
          const resp = await fetch(LIGHTSPEED_CATALOG_QUERY, { cache: "no-store" });
          const json = (await resp.json().catch(() => ({}))) as
            | LightspeedCatalogPayload
            | { error?: string };
          if (!resp.ok) {
            warnings.push(
              String((json as { error?: string })?.error || "Lightspeed catalog request failed.")
            );
          } else {
            lightspeedCatalog = json as LightspeedCatalogPayload;
          }
        } catch (e: any) {
          warnings.push(String(e?.message || "Lightspeed catalog request failed."));
        }
      }

      if (shopifyConnected) {
        try {
          const shop = encodeURIComponent(String(shopify.shop || "").trim());
          const resp = await fetch(`/api/shopify/catalog?shop=${shop}&first=1`, {
            cache: "no-store",
          });
          const json = (await resp.json().catch(() => ({}))) as ShopifyCatalogPayload | { error?: string };
          if (!resp.ok) {
            warnings.push(String((json as { error?: string })?.error || "Shopify catalog request failed."));
          } else {
            shopifyCatalog = json as ShopifyCatalogPayload;
          }
        } catch (e: any) {
          warnings.push(String(e?.message || "Shopify catalog request failed."));
        }
      }

      const lightspeedTotal = toInt(lightspeedCatalog?.total);
      let shopifyTotal = toInt(shopifyCatalog?.totalPages);
      if (
        shopifyTotal === null &&
        Array.isArray(shopifyCatalog?.products) &&
        !Boolean(shopifyCatalog?.pageInfo?.hasNextPage)
      ) {
        shopifyTotal = shopifyCatalog.products.length;
      }

      const processed =
        lightspeedTotal !== null && shopifyTotal !== null
          ? Math.min(lightspeedTotal, shopifyTotal)
          : null;
      const pending =
        lightspeedTotal !== null && shopifyTotal !== null
          ? Math.max(lightspeedTotal - shopifyTotal, 0)
          : null;
      const topInventoryRows = buildTopRows(lightspeedCatalog?.rows);
      const integrationsOnline = [lightspeedConnected, shopifyConnected].filter(Boolean).length;

      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: warnings.length ? warnings.join(" ") : null,
        lightspeed,
        shopify,
        lightspeedTotal,
        shopifyTotal,
        processed,
        pending,
        integrationsOnline,
        topInventoryRows,
        updatedAt: new Date().toISOString(),
      }));
    } catch (e: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: String(e?.message || "Unable to load Workset data."),
        updatedAt: new Date().toISOString(),
      }));
    }
  }, []);

  useEffect(() => {
    void loadWorkset(false);
    const timer = window.setInterval(() => {
      void loadWorkset(false);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadWorkset]);

  const maxTopQty = useMemo(() => {
    return state.topInventoryRows.reduce((max, row) => Math.max(max, row.qty), 0);
  }, [state.topInventoryRows]);

  const syncHealthLabel = useMemo(() => {
    if (state.pending === null) return "Awaiting full sync telemetry";
    if (state.pending === 0) return "Inventory counts are aligned";
    if (state.pending < 100) return "Small backlog pending push";
    return "Backlog detected";
  }, [state.pending]);

  const coveragePct = useMemo(() => {
    if (state.lightspeedTotal === null || state.lightspeedTotal <= 0 || state.shopifyTotal === null) {
      return null;
    }
    return Math.min(100, (state.shopifyTotal / state.lightspeedTotal) * 100);
  }, [state.lightspeedTotal, state.shopifyTotal]);

  const backlogPct = useMemo(() => {
    if (state.lightspeedTotal === null || state.lightspeedTotal <= 0 || state.pending === null) {
      return null;
    }
    return Math.min(100, (state.pending / state.lightspeedTotal) * 100);
  }, [state.lightspeedTotal, state.pending]);

  return (
    <main className="page workset-page">
      <section className="glass-panel hero">
        <div>
          <p className="eyebrow">Shopify Mapping Inventory</p>
          <h1>Sync Operations Hub</h1>
          <p className="hero-copy">
            Live command surface for your Lightspeed R-Series to Shopify pipeline with integration
            health, sync coverage, and backlog pressure in one view.
          </p>
        </div>
        <div className="hero-actions">
          <button
            suppressHydrationWarning
            type="button"
            className="btn"
            onClick={() => void loadWorkset(true)}
            disabled={state.refreshing}
          >
            {state.refreshing ? "Refreshing..." : "Run Health Check"}
          </button>
          <Link href="/studio/shopify-mapping-inventory/inventory" className="btn ghost">
            Open Inventory
          </Link>
        </div>
      </section>

      <nav className="quick-nav" aria-label="Workset sections">
        <Link href="/studio/shopify-mapping-inventory/workset" className="quick-chip active">
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
        <Link href="/studio/shopify-mapping-inventory/configurations" className="quick-chip">
          Configurations
        </Link>
      </nav>

      <section className="kpi-grid">
        <article className="glass-panel kpi">
          <p className="kpi-label">Source Catalog</p>
          <p className="kpi-value">{formatCount(state.lightspeedTotal)}</p>
          <p className="kpi-sub">SKUs detected in Lightspeed</p>
        </article>
        <article className="glass-panel kpi">
          <p className="kpi-label">Store Catalog</p>
          <p className="kpi-value">{formatCount(state.shopifyTotal)}</p>
          <p className="kpi-sub">Published products in Shopify</p>
        </article>
        <article className="glass-panel kpi">
          <p className="kpi-label">Coverage</p>
          <p className="kpi-value">{formatPercent(coveragePct)}</p>
          <p className="kpi-sub">Store vs source catalog ratio</p>
        </article>
        <article className="glass-panel kpi">
          <p className="kpi-label">Backlog Pressure</p>
          <p className="kpi-value">{formatPercent(backlogPct)}</p>
          <p className="kpi-sub">{formatCount(state.pending)} items still pending</p>
        </article>
      </section>

      <section className="grid two">
        <article className="glass-panel connector">
          <header>
            <h2>Lightspeed R-Series</h2>
            <span className={`status-pill ${state.lightspeed?.connected ? "on" : "off"}`}>
              {state.lightspeed?.connected ? "Connected" : "Offline"}
            </span>
          </header>
          <dl>
            <div>
              <dt>Domain Prefix</dt>
              <dd>{String(state.lightspeed?.domainPrefix || "--")}</dd>
            </div>
            <div>
              <dt>Account ID</dt>
              <dd>{String(state.lightspeed?.accountId || "--")}</dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{formatCount(state.lightspeedTotal)}</dd>
            </div>
          </dl>
        </article>

        <article className="glass-panel connector">
          <header>
            <h2>Shopify Cart</h2>
            <span className={`status-pill ${state.shopify?.connected ? "on" : "off"}`}>
              {state.shopify?.connected ? "Connected" : "Offline"}
            </span>
          </header>
          <dl>
            <div>
              <dt>Shop</dt>
              <dd>{String(state.shopify?.shop || "--")}</dd>
            </div>
            <div>
              <dt>Token Source</dt>
              <dd>{String(state.shopify?.source || "--")}</dd>
            </div>
            <div>
              <dt>Products</dt>
              <dd>{formatCount(state.shopifyTotal)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="grid two">
        <article className="glass-panel chart-card">
          <header>
            <h2>Revenue Stream</h2>
            <p>rolling trend line</p>
          </header>
          <div className="chart-empty">
            Revenue chart will render here after the sales stream adapter is attached.
          </div>
        </article>
        <article className="glass-panel chart-card">
          <header>
            <h2>Order Throughput</h2>
            <p>rolling trend line</p>
          </header>
          <div className="chart-empty">
            Throughput chart will render here after order events are persisted.
          </div>
        </article>
      </section>

      <section className="grid two">
        <article className="glass-panel top-items">
          <header>
            <h2>Inventory Pressure</h2>
            <p>highest on-hand quantities</p>
          </header>
          {state.topInventoryRows.length ? (
            <ul>
              {state.topInventoryRows.map((item) => {
                const pct = maxTopQty > 0 ? Math.max(6, Math.round((item.qty / maxTopQty) * 100)) : 6;
                return (
                  <li key={item.id}>
                    <div className="row-head">
                      <span className="sku">{item.sku}</span>
                      <span className="qty">{item.qty.toLocaleString()}</span>
                    </div>
                    <div className="bar-wrap" aria-hidden>
                      <span className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="row-foot">
                      <span>{item.title}</span>
                      <span>{formatMoney(item.estValue)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-text">No inventory data available yet.</p>
          )}
        </article>

        <article className="glass-panel sync-card">
          <header>
            <h2>Pipeline Health</h2>
            <p>{syncHealthLabel}</p>
          </header>
          <div className="sync-stats">
            <div>
              <span>Lightspeed Items</span>
              <strong>{formatCount(state.lightspeedTotal)}</strong>
            </div>
            <div>
              <span>Shopify Products</span>
              <strong>{formatCount(state.shopifyTotal)}</strong>
            </div>
            <div>
              <span>Backlog</span>
              <strong>{formatCount(state.pending)}</strong>
            </div>
            <div>
              <span>Integrations Online</span>
              <strong>{state.integrationsOnline}</strong>
            </div>
            <div>
              <span>Last Updated</span>
              <strong>{formatStamp(state.updatedAt)}</strong>
            </div>
          </div>
          {state.error ? <p className="inline-error">{state.error}</p> : null}
        </article>
      </section>

      <style jsx>{`
        .workset-page {
          max-width: 1240px;
          margin: 0 auto;
          padding: 20px 8px 30px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .hero {
          padding: 18px;
          border-radius: 18px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 14px;
        }
        .eyebrow {
          margin: 0;
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        h1 {
          margin: 4px 0 0;
          font-size: clamp(1.6rem, 2.8vw, 2.1rem);
          line-height: 1.1;
        }
        .hero-copy {
          margin: 8px 0 0;
          color: rgba(226, 232, 240, 0.85);
          font-size: 0.94rem;
          line-height: 1.4;
          max-width: 700px;
        }
        .hero-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn {
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          border-radius: 12px;
          min-height: 42px;
          padding: 0 14px;
          font-weight: 700;
          font-size: 0.83rem;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn.ghost {
          background: transparent;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .quick-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .quick-chip {
          text-decoration: none;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(248, 250, 252, 0.9);
          padding: 8px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }
        .quick-chip.active {
          color: #fff;
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.38);
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .kpi {
          border-radius: 16px;
          padding: 14px;
          min-height: 120px;
          display: grid;
          gap: 4px;
          align-content: center;
        }
        .kpi-label {
          margin: 0;
          color: rgba(226, 232, 240, 0.84);
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }
        .kpi-value {
          margin: 0;
          font-size: clamp(1.35rem, 3vw, 1.95rem);
          line-height: 1.1;
          font-weight: 800;
          color: #fff;
        }
        .kpi-sub {
          margin: 0;
          color: rgba(226, 232, 240, 0.76);
          font-size: 0.8rem;
        }
        .grid.two {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .connector,
        .chart-card,
        .top-items,
        .sync-card {
          border-radius: 16px;
          padding: 14px;
        }
        .connector header,
        .chart-card header,
        .top-items header,
        .sync-card header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        h2 {
          margin: 0;
          font-size: 1.02rem;
          line-height: 1.25;
        }
        header p {
          margin: 0;
          color: rgba(226, 232, 240, 0.76);
          font-size: 0.78rem;
          text-align: right;
        }
        .status-pill {
          border-radius: 999px;
          min-height: 24px;
          padding: 0 10px;
          font-size: 0.72rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .status-pill.on {
          color: #d1fae5;
          background: rgba(16, 185, 129, 0.24);
          border: 1px solid rgba(16, 185, 129, 0.48);
        }
        .status-pill.off {
          color: #fee2e2;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.46);
        }
        dl {
          margin: 0;
          display: grid;
          gap: 10px;
        }
        dl div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 8px;
        }
        dt {
          color: rgba(226, 232, 240, 0.72);
          font-size: 0.8rem;
        }
        dd {
          margin: 0;
          color: #fff;
          font-size: 0.84rem;
          font-weight: 700;
        }
        .chart-empty {
          border-radius: 12px;
          border: 1px dashed rgba(255, 255, 255, 0.2);
          min-height: 170px;
          display: grid;
          place-items: center;
          text-align: center;
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.86rem;
          padding: 14px;
          line-height: 1.4;
        }
        .top-items ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 10px;
        }
        .top-items li {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          padding: 9px 10px;
          display: grid;
          gap: 6px;
        }
        .row-head,
        .row-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }
        .sku,
        .qty {
          font-size: 0.82rem;
          font-weight: 700;
          color: #fff;
        }
        .row-foot span {
          font-size: 0.74rem;
          color: rgba(226, 232, 240, 0.8);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bar-wrap {
          border-radius: 999px;
          height: 7px;
          background: rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }
        .bar-fill {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(34, 211, 238, 0.9), rgba(99, 102, 241, 0.95));
        }
        .sync-stats {
          display: grid;
          gap: 8px;
        }
        .sync-stats div {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          padding: 8px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .sync-stats span {
          color: rgba(226, 232, 240, 0.76);
          font-size: 0.8rem;
        }
        .sync-stats strong {
          color: #fff;
          font-size: 0.84rem;
        }
        .inline-error {
          margin: 10px 0 0;
          color: #fecaca;
          font-size: 0.78rem;
          line-height: 1.4;
        }
        .empty-text {
          margin: 0;
          color: rgba(226, 232, 240, 0.82);
          font-size: 0.85rem;
        }
        @media (max-width: 1080px) {
          .kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .grid.two {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .hero {
            padding: 14px;
            align-items: flex-start;
            flex-direction: column;
          }
          .hero-actions {
            width: 100%;
          }
          .btn {
            flex: 1;
          }
          .kpi-grid {
            grid-template-columns: 1fr;
          }
          .quick-chip {
            font-size: 0.73rem;
          }
        }
      `}</style>
    </main>
  );
}
