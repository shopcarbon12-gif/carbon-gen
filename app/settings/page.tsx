"use client";

import Link from "next/link";
import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";

type ShopifyStatusResponse = {
  connected?: boolean;
  shop?: string | null;
  installedAt?: string | null;
  source?: string;
  reason?: string;
  error?: string;
};

function normalizeShop(value: string) {
  return value.trim().toLowerCase();
}

function isValidShop(value: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(value);
}

export default function SettingsPage() {
  const [shop, setShop] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [installedAt, setInstalledAt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedShop = useMemo(() => normalizeShop(shop), [shop]);
  const canConnect = useMemo(
    () => isValidShop(normalizedShop),
    [normalizedShop]
  );
  const connectHref = useMemo(() => {
    if (!canConnect) return "#";
    return `/api/shopify/auth?shop=${encodeURIComponent(normalizedShop)}`;
  }, [canConnect, normalizedShop]);

  const refreshStatus = useCallback(async (shopOverride?: string) => {
    const queryShop = normalizeShop(shopOverride ?? "");
    if (typeof shopOverride === "string" && shopOverride.trim() && !isValidShop(queryShop)) {
      setConnected(false);
      setInstalledAt(null);
      setSource(null);
      setReason("invalid_shop");
      setLoadingStatus(false);
      return;
    }
    const endpoint = queryShop
      ? `/api/shopify/status?shop=${encodeURIComponent(queryShop)}`
      : "/api/shopify/status";

    setLoadingStatus(true);
    try {
      const resp = await fetch(endpoint, { cache: "no-store" });
      const json = (await resp.json().catch(() => ({}))) as ShopifyStatusResponse;
      const inferredShop = normalizeShop(String(json?.shop || ""));
      if (inferredShop) {
        setShop(inferredShop);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("shopify_shop", inferredShop);
        }
      }
      if (typeof json?.connected === "boolean") {
        setConnected(Boolean(json.connected));
        setInstalledAt(json?.connected ? json?.installedAt || null : null);
      } else {
        setConnected(false);
        setInstalledAt(null);
      }
      setSource(json?.source || null);
      setReason(json?.reason || null);
    } catch {
      setConnected(false);
      setInstalledAt(null);
      setSource(null);
      setReason(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qpShop = normalizeShop(params.get("shop") || "");
    const stored = normalizeShop(window.localStorage.getItem("shopify_shop") || "");
    const initialShop = qpShop || stored;

    if (initialShop) {
      setShop(initialShop);
      window.localStorage.setItem("shopify_shop", initialShop);
      void refreshStatus(initialShop);
      return;
    }

    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!normalizedShop) return;
    window.localStorage.setItem("shopify_shop", normalizedShop);
  }, [normalizedShop]);

  useEffect(() => {
    if (!normalizedShop) {
      setConnected(null);
      setInstalledAt(null);
      setSource(null);
      setReason(null);
      setLoadingStatus(false);
      return;
    }
    if (!canConnect) {
      setConnected(false);
      setInstalledAt(null);
      setSource(null);
      setReason("invalid_shop");
      setLoadingStatus(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshStatus(normalizedShop);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [normalizedShop, canConnect, refreshStatus]);

  async function handleDisconnect() {
    if (!canConnect) {
      setError("Enter a valid shop domain first (example: yourstore.myshopify.com).");
      setStatus(null);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Disconnecting Shopify token...");
    try {
      const resp = await fetch("/api/shopify/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: normalizedShop }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        error?: string;
        stillConnectedViaEnvToken?: boolean;
      };
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to disconnect Shopify token.");
      }

      if (json?.stillConnectedViaEnvToken) {
        setStatus(
          "Disconnected saved token, but SHOPIFY_ADMIN_ACCESS_TOKEN is still configured in env."
        );
      } else {
        setStatus("Shopify disconnected.");
      }
      await refreshStatus(normalizedShop);
    } catch (e: any) {
      setError(e?.message || "Disconnect failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  function handleConnectClick(e: MouseEvent<HTMLAnchorElement>) {
    if (canConnect) return;
    e.preventDefault();
    setError("Enter a valid shop domain before connecting.");
    setStatus(null);
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <div className="eyebrow">Carbon Gen</div>
          <h1>Settings</h1>
          <p className="muted">
            Shopify integration management. Main workspace now shows status-only.
          </p>
        </div>
        <nav className="nav">
          <Link href="/studio">Studio</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/shopify">Shopify</Link>
          <Link href="/seo">SEO</Link>
        </nav>
      </header>

      <section className="card">
        <div className="card-title">Shopify Connection</div>
        <p className="muted">
          Add your store domain once, then connect/reconnect or disconnect from here.
        </p>

        <input
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          placeholder="yourstore.myshopify.com"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="status-row">
          <span className={`status-dot ${connected ? "on" : "off"}`} />
          <span>
            {loadingStatus ? "Checking connection..." : connected ? "Connected" : "Not connected"}
            {normalizedShop ? <em> - {normalizedShop}</em> : null}
            {connected && installedAt ? (
              <em> - Installed {new Date(installedAt).toLocaleString()}</em>
            ) : null}
          </span>
        </div>

        {source === "env_token" ? (
          <p className="muted">
            Connection source: env token. To fully disconnect, remove
            `SHOPIFY_ADMIN_ACCESS_TOKEN` from environment variables.
          </p>
        ) : null}
        {!loadingStatus && reason === "token_invalid" ? (
          <p className="muted">
            Stored Shopify token is invalid/expired. Reconnect to restore access.
          </p>
        ) : null}
        {!loadingStatus && reason === "invalid_shop" ? (
          <p className="muted">
            Enter a valid shop domain (example: yourstore.myshopify.com).
          </p>
        ) : null}

        <div className="actions">
          <a className="btn primary" href={connectHref} onClick={handleConnectClick}>
            Connect / Reconnect
          </a>
          <button className="btn danger" onClick={handleDisconnect} disabled={busy || !canConnect}>
            {busy ? "Disconnecting..." : "Disconnect"}
          </button>
          <button
            className="btn ghost"
            onClick={() => void refreshStatus(normalizedShop)}
            disabled={busy}
          >
            Refresh Status
          </button>
        </div>
      </section>

      {(error || status) && (
        <div className="banner">
          {error ? <span className="error">Error: {error}</span> : null}
          {status ? <span>{status}</span> : null}
        </div>
      )}

      <style jsx>{`
        .page {
          max-width: 960px;
          margin: 48px auto;
          padding: 24px;
          font-family: "Space Grotesk", system-ui, sans-serif;
          color: #0f172a;
          display: grid;
          gap: 16px;
        }
        .hero {
          display: grid;
          gap: 12px;
        }
        .eyebrow {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #0b6b58;
          font-weight: 700;
        }
        h1 {
          margin: 6px 0;
          font-size: clamp(1.8rem, 3vw, 2.5rem);
        }
        .nav {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #f8fafc;
        }
        .card {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
          background: #fff;
          display: grid;
          gap: 10px;
        }
        .card-title {
          font-weight: 700;
        }
        .muted {
          color: #64748b;
        }
        input {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 0.95rem;
        }
        .status-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: #475569;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #ef4444;
        }
        .status-dot.on {
          background: #10b981;
        }
        .status-dot.off {
          background: #ef4444;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .btn {
          border: 1px solid #0b6b58;
          background: #0b6b58;
          color: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn.ghost {
          background: transparent;
          color: #0b6b58;
        }
        .btn.danger {
          background: #fff;
          color: #b91c1c;
          border-color: #fecaca;
        }
        .btn:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }
        .banner {
          margin-top: 4px;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
          display: grid;
          gap: 4px;
        }
        .error {
          color: #b91c1c;
          font-weight: 600;
        }
      `}</style>
    </main>
  );
}
