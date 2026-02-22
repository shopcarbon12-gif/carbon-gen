"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type WorksetStats = {
  ok?: boolean;
  summaryCards?: {
    totalInventory?: number;
    totalOrders?: number;
    totalIntegrations?: number;
    totalPendingInvoices?: number;
    inventoryGap?: number;
    ordersError?: string;
  };
  lightspeedPanel?: {
    label?: string;
    totalInventory?: number;
    totalOrders?: number;
    totalPendingOrders?: number;
    ordersError?: string;
  };
  shopifyPanel?: {
    label?: string;
    totalInventory?: number;
    totalProcessed?: number;
    totalPendings?: number;
    totalErrorRecordedItems?: number;
    shopifyProducts?: number;
    inventoryGap?: number;
    ordersError?: string;
  };
  lightspeedConnected?: boolean;
  shopifyConnected?: boolean;
};

type ChartPoint = { date: string; current: number; previous: number };
type TopRevenueRow = { sku: string; amount: number };

type ChartData = {
  ok?: boolean;
  sales?: ChartPoint[];
  orders?: ChartPoint[];
  topRevenue?: TopRevenueRow[];
  labels?: { current?: string; previous?: string };
};

const REFRESH_MS = 60_000;
const CHART_COLORS = {
  current: "#3b82f6",
  previous: "#ef4444",
  pieColors: ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#6366f1", "#14b8a6", "#f43f5e", "#84cc16", "#a855f7"],
};

function formatCount(value: number | null | undefined) {
  if (value == null) return "--";
  return value.toLocaleString();
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function ShopifyMappingWorkset() {
  const [stats, setStats] = useState<WorksetStats | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<"7" | "30" | "365" | "all">("30");

  const loadStats = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/shopify-mapping/workset-stats", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as WorksetStats & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load stats");
      setStats(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Workset data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadCharts = useCallback(async () => {
    try {
      const range = chartRange === "all" ? "365" : chartRange;
      const res = await fetch(
        `/api/shopify-mapping/workset-charts?range=${encodeURIComponent(range)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as ChartData & { error?: string };
      if (res.ok) setChartData(json);
    } catch {
      /* ignore chart errors */
    }
  }, [chartRange]);

  useEffect(() => {
    void loadStats(false);
    const t = window.setInterval(() => void loadStats(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [loadStats]);

  useEffect(() => {
    void loadCharts();
  }, [loadCharts]);

  const summary = stats?.summaryCards;
  const lsPanel = stats?.lightspeedPanel;
  const shopPanel = stats?.shopifyPanel;

  const salesChartData = useMemo(() => {
    const arr = chartData?.sales || [];
    return arr.map((p) => ({
      ...p,
      name: formatDateShort(p.date),
    }));
  }, [chartData?.sales]);

  const ordersChartData = useMemo(() => {
    const arr = chartData?.orders || [];
    return arr.map((p) => ({
      ...p,
      name: formatDateShort(p.date),
    }));
  }, [chartData?.orders]);

  const pieData = useMemo(() => {
    const rows = chartData?.topRevenue || [];
    const total = rows.reduce((s, r) => s + r.amount, 0);
    if (total === 0) return [];
    return rows.map((r) => ({
      name: r.sku,
      value: Math.round((r.amount / total) * 100),
      amount: r.amount,
    }));
  }, [chartData?.topRevenue]);

  const topRevenueRows = chartData?.topRevenue || [];
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  return (
    <main className="workset-page">
      <section className="workset-hero">
        <div>
          <p className="eyebrow">Shopify Mapping Inventory</p>
          <h1>Welcome back</h1>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="btn"
            onClick={() => void loadStats(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Run Health Check"}
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

      {loading ? (
        <p className="loading-msg">Loading…</p>
      ) : (
        <>
          {/* SKUPlugs: Top 4 summary cards */}
          <section className="summary-cards">
            <article className="summary-card">
              <span className="card-icon" aria-hidden>📊</span>
              <p className="card-value">{formatCount(summary?.totalInventory)}</p>
              <p className="card-label">TOTAL INVENTORY</p>
            </article>
            <article className={`summary-card ${stats?.summaryCards?.ordersError ? "orders-error" : ""}`} title={stats?.summaryCards?.ordersError || undefined}>
              <span className="card-icon" aria-hidden>🛒</span>
              <p className="card-value">{formatCount(summary?.totalOrders)}</p>
              <p className="card-label">TOTAL ORDERS</p>
              {stats?.summaryCards?.ordersError ? (
                <p className="card-hint">{stats.summaryCards.ordersError}</p>
              ) : null}
            </article>
            <article className="summary-card">
              <span className="card-icon" aria-hidden>🔗</span>
              <p className="card-value">{formatCount(summary?.totalIntegrations)}</p>
              <p className="card-label">TOTAL INTEGRATIONS</p>
            </article>
            <article className="summary-card">
              <span className="card-icon" aria-hidden>📄</span>
              <p className="card-value">{formatCount(summary?.totalPendingInvoices)}</p>
              <p className="card-label">TOTAL PENDING INVOICES</p>
            </article>
          </section>

          {/* SKUPlugs: Lightspeed + Shopify panels (green) */}
          <section className="integration-panels">
            <article
              className={`panel lightspeed ${stats?.lightspeedConnected ? "connected" : "offline"}`}
            >
              <header>
                <span className="panel-icon" aria-hidden>💡</span>
                <h2>{lsPanel?.label || "Lightspeed (POS)"}</h2>
              </header>
              <dl>
                <div>
                  <dt>Total Inventory (LS items)</dt>
                  <dd>{formatCount(lsPanel?.totalInventory)}</dd>
                </div>
                <div className={lsPanel?.ordersError ? "has-error" : ""} title={lsPanel?.ordersError}>
                  <dt>Total Orders</dt>
                  <dd>
                    {formatCount(lsPanel?.totalOrders)}
                    {lsPanel?.ordersError ? <span className="row-hint">{lsPanel.ordersError}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt>Total Pending Orders</dt>
                  <dd>{formatCount(lsPanel?.totalPendingOrders)}</dd>
                </div>
              </dl>
            </article>
            <article
              className={`panel shopify ${stats?.shopifyConnected ? "connected" : "offline"}`}
            >
              <header>
                <span className="panel-icon" aria-hidden>💰</span>
                <h2>{shopPanel?.label || "Shopify (Carts)"}</h2>
              </header>
              <dl>
                <div>
                  <dt>Total Inventory (Cart items)</dt>
                  <dd>{formatCount(shopPanel?.totalInventory)}</dd>
                </div>
                {typeof shopPanel?.inventoryGap === "number" && shopPanel.inventoryGap > 0 ? (
                  <div className="gap-row">
                    <dt>Gap (in LS, not in Cart)</dt>
                    <dd className="gap-value">{formatCount(shopPanel.inventoryGap)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Total Processed</dt>
                  <dd>{formatCount(shopPanel?.totalProcessed)}</dd>
                </div>
                <div>
                  <dt>Total Pendings</dt>
                  <dd>{formatCount(shopPanel?.totalPendings)}</dd>
                </div>
                <div>
                  <dt>Total error recorded items</dt>
                  <dd>{formatCount(shopPanel?.totalErrorRecordedItems)}</dd>
                </div>
                {typeof shopPanel?.shopifyProducts === "number" ? (
                  <div>
                    <dt>Products on Shopify</dt>
                    <dd>{formatCount(shopPanel.shopifyProducts)}</dd>
                  </div>
                ) : null}
              </dl>
            </article>
          </section>

          {/* SKUPlugs: Sales + Orders charts */}
          <section className="charts-section">
            <article className="chart-card">
              <h2>Sales</h2>
              <p className="chart-subtitle">
                Last 30 days sales and compare data to last year
              </p>
              <div className="chart-wrap">
                {salesChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={salesChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="name" stroke="rgba(226,232,240,0.8)" fontSize={11} />
                      <YAxis stroke="rgba(226,232,240,0.8)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15,23,42,0.95)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "8px",
                        }}
                        formatter={(value) => [String(value ?? ""), ""]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="current"
                        name={`${currentYear}`}
                        stroke={CHART_COLORS.current}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="previous"
                        name={`${prevYear}`}
                        stroke={CHART_COLORS.previous}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">
                    Sales chart will render when order data is available.
                  </div>
                )}
              </div>
            </article>
            <article className="chart-card">
              <h2>Orders</h2>
              <p className="chart-subtitle">
                Last 30 days orders and compare data to last year
              </p>
              <div className="chart-wrap">
                {ordersChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={ordersChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="name" stroke="rgba(226,232,240,0.8)" fontSize={11} />
                      <YAxis stroke="rgba(226,232,240,0.8)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15,23,42,0.95)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "8px",
                        }}
                        formatter={(value) => [String(value ?? ""), ""]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="current"
                        name={`${currentYear}`}
                        stroke={CHART_COLORS.current}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="previous"
                        name={`${prevYear}`}
                        stroke={CHART_COLORS.previous}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">
                    Orders chart will render when order data is available.
                  </div>
                )}
              </div>
            </article>
          </section>

          {/* SKUPlugs: Top 10 revenue + time filter buttons */}
          <section className="top-revenue-section">
            <article className="top-revenue-card">
              <h2>Top 10 revenue generating products in overall.</h2>
              <div className="top-revenue-layout">
                <div className="pie-wrap">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                        >
                          {pieData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={CHART_COLORS.pieColors[i % CHART_COLORS.pieColors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "rgba(15,23,42,0.95)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: "8px",
                          }}
                          formatter={(value, name, props) =>
                            [`$${Number((props?.payload as { amount?: number })?.amount ?? 0).toFixed(2)}`, String(name ?? "")]
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="pie-empty">No revenue data</div>
                  )}
                </div>
                <div className="table-wrap">
                  <table className="top-revenue-table">
                    <caption className="sr-only">Top 10 revenue generating products</caption>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRevenueRows.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          <td>{row.sku}</td>
                          <td>{formatCount(Math.round(row.amount))}</td>
                        </tr>
                      ))}
                      {topRevenueRows.length === 0 && (
                        <tr>
                          <td colSpan={2}>No data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="range-buttons">
                <button
                  type="button"
                  className={chartRange === "all" ? "active" : ""}
                  onClick={() => setChartRange("all")}
                >
                  Over All
                </button>
                <button
                  type="button"
                  className={chartRange === "365" ? "active" : ""}
                  onClick={() => setChartRange("365")}
                >
                  In a year
                </button>
                <button
                  type="button"
                  className={chartRange === "30" ? "active" : ""}
                  onClick={() => setChartRange("30")}
                >
                  In last 30 days
                </button>
                <button
                  type="button"
                  className={chartRange === "7" ? "active" : ""}
                  onClick={() => setChartRange("7")}
                >
                  In last 7 days
                </button>
              </div>
            </article>
          </section>
        </>
      )}

      {error && <p className="inline-error">{error}</p>}

      <style jsx>{`
        .workset-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px 12px 24px;
          display: grid;
          gap: 10px;
          color: #f8fafc;
        }
        .workset-hero {
          padding: 12px 16px;
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
          font-size: clamp(1.5rem, 2.5vw, 2rem);
          line-height: 1.2;
        }
        .hero-actions {
          display: flex;
          gap: 10px;
        }
        .btn {
          border: 1px solid rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          border-radius: 12px;
          min-height: 40px;
          padding: 0 14px;
          font-weight: 700;
          font-size: 0.8rem;
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
          border-radius: 10px;
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
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .summary-card {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
        }
        .card-icon {
          font-size: 1.2rem;
          opacity: 0.9;
        }
        .card-value {
          margin: 0;
          font-size: clamp(1.2rem, 2.5vw, 1.6rem);
          font-weight: 800;
          color: #fff;
        }
        .card-label {
          margin: 0;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(226, 232, 240, 0.8);
        }
        .card-hint {
          margin: 4px 0 0;
          font-size: 0.7rem;
          color: #fde68a;
          font-weight: 600;
          line-height: 1.2;
        }
        .summary-card.orders-error { border-color: rgba(245, 158, 11, 0.4); }
        .panel dl div.has-error .row-hint {
          display: block;
          margin-top: 4px;
          font-size: 0.68rem;
          color: #fde68a;
          font-weight: 600;
          line-height: 1.2;
        }
        .integration-panels {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .panel {
          border-radius: 14px;
          padding: 14px 16px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
        }
        .panel.offline {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.3);
        }
        .panel header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .panel-icon {
          font-size: 1.1rem;
        }
        .panel h2 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
        }
        .panel dl {
          margin: 0;
          display: grid;
          gap: 8px;
        }
        .panel dl div {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .panel dt {
          color: rgba(226, 232, 240, 0.85);
          font-size: 0.82rem;
        }
        .panel dd {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 700;
          color: #fff;
        }
        .panel .gap-row {
          background: rgba(245, 158, 11, 0.15);
          border-radius: 8px;
          padding: 8px 12px;
          margin: 4px -4px 4px 0;
          border-left: 3px solid rgba(245, 158, 11, 0.6);
        }
        .panel .gap-row dt { color: #fde68a; font-weight: 700; }
        .panel .gap-row .gap-value { color: #fde68a; }
        .charts-section {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .chart-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 14px 16px;
        }
        .chart-card h2 {
          margin: 0 0 4px;
          font-size: 1rem;
        }
        .chart-subtitle {
          margin: 0 0 10px;
          font-size: 0.78rem;
          color: rgba(226, 232, 240, 0.75);
        }
        .chart-wrap {
          min-height: 180px;
        }
        .chart-empty {
          min-height: 180px;
          display: grid;
          place-items: center;
          color: rgba(226, 232, 240, 0.7);
          font-size: 0.85rem;
          border-radius: 10px;
          border: 1px dashed rgba(255, 255, 255, 0.2);
        }
        .top-revenue-section {
          width: 100%;
        }
        .top-revenue-card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          padding: 14px 16px;
        }
        .top-revenue-card h2 {
          margin: 0 0 14px;
          font-size: 0.95rem;
          font-weight: 700;
        }
        .top-revenue-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: center;
          margin-bottom: 12px;
        }
        .pie-wrap {
          min-height: 180px;
        }
        .pie-empty {
          min-height: 180px;
          display: grid;
          place-items: center;
          color: rgba(226, 232, 240, 0.6);
          font-size: 0.85rem;
        }
        .top-revenue-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .top-revenue-table th,
        .top-revenue-table td {
          padding: 8px 10px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .top-revenue-table th {
          color: rgba(226, 232, 240, 0.9);
          font-weight: 700;
        }
        .range-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .range-buttons button {
          padding: 8px 14px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(248, 250, 252, 0.9);
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
        }
        .range-buttons button.active {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.4);
        }
        .range-buttons button:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .loading-msg {
          margin: 20px 0;
          color: rgba(226, 232, 240, 0.8);
        }
        .inline-error {
          margin: 10px 0 0;
          color: #fecaca;
          font-size: 0.82rem;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }
        @media (max-width: 1024px) {
          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
          }
          .integration-panels,
          .charts-section {
            grid-template-columns: 1fr;
          }
          .top-revenue-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .workset-hero {
            flex-direction: column;
            align-items: flex-start;
          }
          .summary-cards {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
