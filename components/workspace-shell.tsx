"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
};

type IntegrationState = "online" | "offline" | "checking";

type IntegrationItem = {
  id: string;
  name: string;
  endpoint: string;
  settingsHref: string;
  status: "online" | "offline";
  label: string;
};

const INTEGRATION_PANEL_TOP = 89;
const INTEGRATION_PANEL_BOTTOM = 12;
const INTEGRATION_ANCHOR_SELECTOR = "[data-integration-anchor='model-dropzone']";

const ACTIVE_ITEM_STYLE: CSSProperties = {
  color: "#fff",
  fontWeight: 600,
  background: "rgba(255, 255, 255, 0.1)",
  borderColor: "rgba(255, 255, 255, 0.05)",
  borderRadius: "10px",
  padding: "12px 15px",
  boxShadow: "none",
  transform: "none",
  opacity: 1,
};

const navItems: NavItem[] = [
  { href: "/studio/images", label: "Image Generator" },
  { href: "/studio/video", label: "Video Promos (Reels)" },
  { href: "/studio/social", label: "Social Ads & Meta" },
  { href: "/ops/inventory", label: "Collection Mapping" },
  { href: "/ops/seo", label: "Lightspeed Inventory" },
  { href: "/dashboard", label: "Workspace Dashboard" },
];

function isActive(pathname: string, href: string) {
  const normalize = (value: string) => {
    const v = String(value || "").trim();
    if (!v || v === "/") return "/";
    return v.replace(/\/+$/, "");
  };

  const current = normalize(pathname);
  const target = normalize(href);
  return current === target || current.startsWith(`${target}/`);
}

function getCurrentTitle(pathname: string) {
  const active = [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActive(pathname, item.href));

  if (active) return active.label;
  if (pathname === "/") return "Workspace";

  const segment = pathname.split("/").filter(Boolean).pop() || "Workspace";
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [integrationsRefreshing, setIntegrationsRefreshing] = useState(false);
  const [integrationPanelHeight, setIntegrationPanelHeight] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const currentTitle = getCurrentTitle(pathname);
  const drawerOpen = menuOpen || menuPinned;
  const integrationPanelCompact = integrationPanelHeight !== null;
  const visibleIntegrations = integrationPanelCompact ? integrations.slice(0, 3) : integrations;
  const hiddenIntegrationCount = Math.max(integrations.length - visibleIntegrations.length, 0);
  const shellStyle: CSSProperties | undefined = integrationPanelHeight
    ? ({ ["--integration-panel-height" as string]: `${integrationPanelHeight}px` } as CSSProperties)
    : undefined;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("carbon_menu_pinned");
      setMenuPinned(raw === "1");
    } catch {
      setMenuPinned(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("carbon_menu_pinned", menuPinned ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [menuPinned]);

  useEffect(() => {
    // Prevent background scroll only for temporary overlay mode.
    document.body.style.overflow = drawerOpen && !menuPinned ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen, menuPinned]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen || menuPinned) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, menuPinned]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const normalizeIntegrationState = (value: string): IntegrationState => {
    if (value === "online" || value === "offline") return value;
    return "checking";
  };

  const refreshIntegrations = useCallback(async (manual = false) => {
    if (manual && mountedRef.current) {
      setIntegrationsRefreshing(true);
    }

    try {
      const resp = await fetch("/api/integrations", { cache: "no-store" });
      const json = await resp.json().catch(() => ({}));
      const payload =
        json && typeof json === "object" ? (json as { integrations?: unknown }) : {};
      const rows = Array.isArray(payload.integrations) ? payload.integrations : [];

      const next: IntegrationItem[] = rows
        .map((row: unknown): IntegrationItem | null => {
          if (!row || typeof row !== "object") return null;
          const value = row as Record<string, unknown>;
          const id = String(value.id || "").trim();
          const name = String(value.name || "").trim();
          const endpoint = String(value.endpoint || "").trim();
          const settingsHref = String(value.settingsHref || "/settings").trim() || "/settings";
          const status: IntegrationItem["status"] =
            value.status === "online" ? "online" : "offline";
          const label = String(value.label || (status === "online" ? "Online" : "Offline"));
          if (!id || !name) return null;
          return { id, name, endpoint, settingsHref, status, label };
        })
        .filter((row: IntegrationItem | null): row is IntegrationItem => Boolean(row));

      if (!mountedRef.current) return;
      setIntegrations(next);
    } catch {
      if (!mountedRef.current) return;
      setIntegrations([]);
    } finally {
      if (!mountedRef.current) return;
      setIntegrationsLoading(false);
      if (manual) setIntegrationsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshIntegrations(false);
    const timer = window.setInterval(() => {
      void refreshIntegrations(false);
    }, 45000);
    return () => window.clearInterval(timer);
  }, [refreshIntegrations]);

  const syncIntegrationPanelHeight = useCallback(() => {
    if (typeof window === "undefined") return;
    const anchor = document.querySelector<HTMLElement>(INTEGRATION_ANCHOR_SELECTOR);
    if (!anchor) {
      setIntegrationPanelHeight(null);
      return;
    }

    const anchorBottom = anchor.getBoundingClientRect().bottom;
    const maxHeight = window.innerHeight - INTEGRATION_PANEL_TOP - INTEGRATION_PANEL_BOTTOM;
    const desired = Math.round(anchorBottom - INTEGRATION_PANEL_TOP);
    if (!Number.isFinite(desired)) {
      setIntegrationPanelHeight(null);
      return;
    }
    const clamped = Math.min(Math.max(desired, 210), maxHeight);
    setIntegrationPanelHeight(clamped);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const scheduleSync = () => {
      window.requestAnimationFrame(() => {
        syncIntegrationPanelHeight();
      });
    };

    scheduleSync();
    const timer = window.setTimeout(scheduleSync, 160);
    window.addEventListener("resize", scheduleSync);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [syncIntegrationPanelHeight, pathname, drawerOpen]);

  function toggleMenu() {
    if (menuPinned) {
      setMenuPinned(false);
      setMenuOpen(false);
      return;
    }
    setMenuOpen((v) => !v);
  }

  function togglePin() {
    setMenuPinned((prev) => {
      const next = !prev;
      if (next) setMenuOpen(true);
      return next;
    });
  }

  async function onLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="shell" style={shellStyle}>
      <svg
        aria-hidden
        focusable="false"
        width="0"
        height="0"
        style={{ position: "absolute", overflow: "hidden" }}
      >
        <symbol id="cr-icon-pin" viewBox="0 0 24 24">
          <rect
            x="3.75"
            y="4.5"
            width="16.5"
            height="15"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path d="M9.5 5.5v13" fill="none" stroke="currentColor" strokeWidth="1.7" />
        </symbol>
      </svg>

      <header className="topbar">
        <button
          type="button"
          className={`menu-toggle ${menuOpen ? "open" : ""}`}
          onClick={toggleMenu}
          aria-controls="workspace-menu"
          aria-expanded={drawerOpen}
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
        >
          <span className="menu-icon" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
        <div className="topbar-title">
          <span className="topbar-brand-lock">
            <img className="topbar-logo" src="/brand/carbon-long-white.png" alt="Carbon" />
          </span>
          <span className="topbar-sep"> / </span>
          <span className="topbar-page-lock">{currentTitle}</span>
        </div>
      </header>

      <aside
        id="workspace-menu"
        className={`carbon-panel-wrap ${drawerOpen ? "open" : ""} ${menuPinned ? "pinned" : ""}`}
      >
        <nav className="carbon-panel glass-panel" aria-label="Carbon menu">
          <div className="carbon-brand">MENU</div>

          <div className="carbon-menu">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push(item.href);
                  }}
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : "false"}
                  className={`carbon-item ${active ? "active" : ""}`}
                  style={active ? ACTIVE_ITEM_STYLE : undefined}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="menu-footer">
            <button
              className="menu-settings-btn"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                router.push("/settings");
              }}
            >
              SETTINGS
            </button>
            <div className="menu-divider" />
            <div className="menu-bottom-row">
              <button className="menu-logout-btn" type="button" onClick={onLogout} disabled={loggingOut}>
                {loggingOut ? "LOGGING OUT..." : "LOGOUT"}
              </button>
              <button
                className={`menu-pin-btn ${menuPinned ? "active" : ""}`}
                type="button"
                onClick={togglePin}
                aria-pressed={menuPinned}
                aria-label={menuPinned ? "Unpin menu" : "Pin menu"}
              >
                <svg
                  className="menu-pin-icon"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <use xlinkHref="#cr-icon-pin" href="#cr-icon-pin" />
                </svg>
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <aside
        className={`integration-panel-wrap ${integrationPanelCompact ? "compact" : ""}`}
        aria-label="API integrations"
      >
        <section className="integration-panel glass-panel">
          <div className="integration-header">
            <button
              type="button"
              className={`integration-refresh ${integrationsRefreshing ? "spinning" : ""}`}
              onClick={() => void refreshIntegrations(true)}
              aria-label="Refresh integration statuses"
              disabled={integrationsRefreshing}
            >
              <svg
                className="integration-refresh-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  d="M20 8a8 8 0 0 0-14-3M4 4v5h5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 16a8 8 0 0 0 14 3m2 1v-5h-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="integration-title">
              {integrationPanelCompact ? "API STATUS" : "API INTEGRATIONS"}
            </div>
          </div>
          <div className="integration-list">
            {integrationsLoading && integrations.length === 0 ? (
              <div className="integration-row static">
                <span className="integration-name">Checking integrations</span>
                <span className="integration-state">
                  <span className="integration-dot checking" aria-hidden />
                  <span>Checking</span>
                </span>
              </div>
            ) : integrations.length ? (
              visibleIntegrations.map((integration) => {
                const state = normalizeIntegrationState(integration.status);
                return (
                  <Link
                    key={integration.id}
                    href={integration.settingsHref || "/settings"}
                    className="integration-row"
                    title={`${integration.name} (${integration.endpoint})`}
                  >
                    <span className="integration-name">{integration.name}</span>
                    <span className="integration-state">
                      <span className={`integration-dot ${state}`} aria-hidden />
                      <span>{integration.label}</span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="integration-empty">No integrations found.</div>
            )}
            {hiddenIntegrationCount > 0 ? (
              <div className="integration-more">+{hiddenIntegrationCount} more</div>
            ) : null}
          </div>
        </section>
      </aside>

      {drawerOpen && !menuPinned ? (
        <button className="backdrop" aria-label="Close menu overlay" onClick={() => setMenuOpen(false)} />
      ) : null}

      <main className={`content ${drawerOpen ? "menu-open" : ""}`}>{children}</main>

      <style jsx>{`
        :root {
          --card: rgba(70, 64, 74, 0.42);
          --card-border: rgba(255, 255, 255, 0.1);
          --text: rgba(255, 255, 255, 0.92);
          --muted: rgba(255, 255, 255, 0.62);
          --pill: rgba(255, 255, 255, 0.12);
          --pill-border: rgba(255, 255, 255, 0.14);
        }
        .shell {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          color: #f8fafc;
        }
        .topbar {
          position: fixed;
          left: 0;
          right: 0;
          top: 0;
          z-index: 56;
          display: flex;
          align-items: center;
          gap: 12px;
          height: 70px;
          padding: 10px 14px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.22);
          background: rgba(10, 10, 16, 0.5);
          backdrop-filter: blur(10px) saturate(1.15);
          -webkit-backdrop-filter: blur(10px) saturate(1.15);
        }
        .topbar-title {
          font-size: 1.03rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          color: rgba(255, 255, 255, 0.92);
          text-transform: uppercase;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 15px;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .topbar-brand-lock {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          line-height: 1;
        }
        .topbar-logo {
          height: 170px;
          width: auto;
          max-width: min(48vw, 210px);
          display: block;
          object-fit: contain;
          object-position: center;
          filter:
            drop-shadow(0 0 0.7px rgba(255, 255, 255, 0.95))
            drop-shadow(0 0 0.7px rgba(255, 255, 255, 0.95));
        }
        .topbar-sep {
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
          font-size: 1.34rem;
          line-height: 1;
          opacity: 0.8;
          font-weight: 600;
        }
        .topbar-page-lock {
          font-weight: 700;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .menu-toggle {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          flex-shrink: 0;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
          transition:
            transform 180ms ease,
            background-color 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }
        .menu-toggle.open {
          background: rgba(34, 34, 48, 0.7);
        }
        .menu-icon {
          width: 16px;
          display: inline-flex;
          flex-direction: column;
          gap: 3px;
        }
        .menu-icon span {
          width: 100%;
          height: 2px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          transform-origin: center;
          transition: transform 220ms ease, opacity 220ms ease;
        }
        .menu-toggle.open .menu-icon span:nth-child(1) {
          transform: translateY(5px) rotate(45deg);
        }
        .menu-toggle.open .menu-icon span:nth-child(2) {
          opacity: 0;
        }
        .menu-toggle.open .menu-icon span:nth-child(3) {
          transform: translateY(-5px) rotate(-45deg);
        }
        .carbon-panel-wrap {
          position: fixed;
          left: 12px;
          top: 89px;
          bottom: 12px;
          width: min(255px, calc(100vw - 24px));
          z-index: 60;
          display: flex;
          align-items: stretch;
          transform: translateX(calc(-100% - 28px));
          opacity: 0;
          pointer-events: none;
          transition:
            transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 220ms ease;
        }
        .carbon-panel-wrap.open {
          transform: translateX(0);
          opacity: 1;
          pointer-events: auto;
        }
        .carbon-panel-wrap.open .carbon-panel {
          background: rgba(108, 98, 114, 0.64);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .carbon-panel-wrap.pinned {
          transition: none;
        }
        .integration-panel-wrap {
          position: fixed;
          right: 12px;
          top: 89px;
          height: var(--integration-panel-height, calc(100vh - 101px));
          width: min(255px, calc(100vw - 24px));
          z-index: 44;
          display: flex;
          align-items: stretch;
          pointer-events: none;
        }
        .integration-panel {
          width: 100%;
          height: 100%;
          border-radius: 26px;
          background: var(--card);
          border: 1px solid var(--card-border);
          backdrop-filter: blur(14px) saturate(1.2);
          -webkit-backdrop-filter: blur(14px) saturate(1.2);
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.45),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          padding: 18px 18px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-family: "Inter", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          pointer-events: auto;
          overflow-y: auto;
        }
        .integration-header {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .integration-refresh {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.95);
          display: grid;
          place-items: center;
          padding: 0;
          flex-shrink: 0;
          cursor: pointer;
        }
        .integration-refresh:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .integration-refresh-icon {
          width: 16px;
          height: 16px;
          display: block;
        }
        .integration-refresh.spinning .integration-refresh-icon {
          animation: integration-spin 900ms linear infinite;
        }
        .integration-title {
          font-weight: 700;
          letter-spacing: 0.03em;
          font-size: 14px;
          color: var(--text);
          text-transform: uppercase;
        }
        .integration-list {
          display: grid;
          gap: 8px;
          min-height: 0;
          overflow-y: auto;
        }
        .integration-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.04);
          padding: 8px 10px;
          text-decoration: none;
          transition:
            border-color 160ms ease,
            background-color 160ms ease;
        }
        .integration-row:hover,
        .integration-row:focus-visible {
          border-color: rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.08);
          outline: none;
        }
        .integration-row.static {
          cursor: default;
        }
        .integration-name {
          color: var(--text);
          font-size: 13px;
          font-weight: 600;
          line-height: 1.25;
        }
        .integration-state {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
        }
        .integration-empty {
          border-radius: 10px;
          border: 1px dashed rgba(255, 255, 255, 0.2);
          padding: 10px;
          color: var(--muted);
          font-size: 12px;
        }
        .integration-more {
          color: var(--muted);
          font-size: 11px;
          text-align: right;
          font-weight: 600;
          padding: 0 2px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .integration-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .integration-dot.online {
          background: #22c55e;
          box-shadow: 0 0 10px rgba(34, 197, 94, 0.55);
        }
        .integration-dot.offline {
          background: #ef4444;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        }
        .integration-dot.checking {
          background: #f59e0b;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
        }
        @keyframes integration-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .integration-panel-wrap.compact .integration-panel {
          padding: 14px 14px 12px;
          gap: 8px;
        }
        .integration-panel-wrap.compact .integration-title {
          font-size: 12px;
          letter-spacing: 0.02em;
        }
        .integration-panel-wrap.compact .integration-list {
          gap: 6px;
        }
        .integration-panel-wrap.compact .integration-row {
          padding: 7px 8px;
          gap: 8px;
          border-radius: 9px;
        }
        .integration-panel-wrap.compact .integration-name {
          font-size: 12px;
        }
        .integration-panel-wrap.compact .integration-state {
          font-size: 11px;
          gap: 6px;
        }
        .integration-panel-wrap.compact .integration-dot {
          width: 8px;
          height: 8px;
        }
        .integration-panel-wrap.compact .integration-empty {
          font-size: 11px;
          padding: 9px;
        }
        .carbon-panel {
          width: 100%;
          border-radius: 26px;
          background: var(--card);
          border: 1px solid var(--card-border);
          backdrop-filter: blur(14px) saturate(1.2);
          -webkit-backdrop-filter: blur(14px) saturate(1.2);
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.45),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
          padding: 28px 22px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          font-family: "Inter", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        .carbon-panel button {
          transition: none !important;
        }
        .carbon-panel button:hover,
        .carbon-panel button:focus-visible {
          transform: none !important;
          opacity: 1 !important;
          box-shadow: none !important;
          text-shadow: none !important;
          filter: none !important;
        }
        .carbon-brand {
          text-align: left;
          font-weight: 700;
          letter-spacing: 0.03em;
          font-size: 16px;
          line-height: 1.1;
          margin: 2px 0 18px;
          padding-left: 0;
          color: var(--text);
          text-transform: uppercase;
        }
        .carbon-menu {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding-top: 6px;
          flex: 1;
        }
        .carbon-item {
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
          gap: 8px;
          font-size: 14px;
          color: #aaaaaa;
          font-family: "Inter", sans-serif;
          font-weight: 600;
          line-height: 1.35;
          letter-spacing: 0;
          padding: 12px 15px;
          border-radius: 10px;
          border: 1px solid transparent;
          user-select: none;
          cursor: pointer;
          opacity: 0;
          transform: translateX(-8px);
          transition: 0.2s;
        }
        .carbon-panel-wrap.open .carbon-item {
          opacity: 1;
          transform: translateX(0);
        }
        .carbon-panel-wrap.open .carbon-item:nth-child(1) {
          transition-delay: 35ms;
        }
        .carbon-panel-wrap.open .carbon-item:nth-child(2) {
          transition-delay: 55ms;
        }
        .carbon-panel-wrap.open .carbon-item:nth-child(3) {
          transition-delay: 75ms;
        }
        .carbon-panel-wrap.open .carbon-item:nth-child(4) {
          transition-delay: 95ms;
        }
        .carbon-panel-wrap.open .carbon-item:nth-child(5) {
          transition-delay: 115ms;
        }
        .carbon-panel-wrap.open .carbon-item:nth-child(6) {
          transition-delay: 135ms;
        }
        .carbon-panel-wrap.open .carbon-item:nth-child(7) {
          transition-delay: 155ms;
        }
        .carbon-item:hover,
        .carbon-item:focus-visible {
          transform: none !important;
          opacity: 1 !important;
          color: #fff;
          font-weight: 600;
          text-shadow: none;
          outline: none;
          background: rgba(255, 255, 255, 0.05);
          border-color: transparent;
          box-shadow: none;
        }
        .menu-footer {
          margin-top: auto;
          padding-top: 14px;
          display: grid;
          gap: 10px;
        }
        .menu-divider {
          border-top: 1px solid rgba(255, 255, 255, 0.16);
          height: 0;
        }
        .menu-settings-btn,
        .menu-logout-btn {
          width: 100%;
          min-height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.38);
          background: rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.98);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          transition: none;
        }
        .menu-settings-btn {
          border: 1px solid #ffffff;
          background: transparent;
          color: #ffffff;
        }
        .menu-logout-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .menu-bottom-row {
          display: grid;
          grid-template-columns: 1fr 74px;
          gap: 10px;
        }
        .menu-pin-btn {
          min-height: 44px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(10, 14, 24, 0.62);
          color: #ffffff;
          display: grid;
          place-items: center;
          line-height: 1;
          transition: none;
          padding: 0;
          text-indent: 0;
        }
        .menu-pin-icon {
          width: 20px;
          height: 20px;
          display: block;
          color: #ffffff;
          filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.65));
        }
        .menu-pin-btn.active {
          background: rgba(255, 255, 255, 0.38);
          border-color: rgba(255, 255, 255, 0.78);
          color: #fff;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.2),
            0 0 18px rgba(255, 255, 255, 0.22);
        }
        .menu-pin-btn:hover,
        .menu-logout-btn:hover,
        .menu-settings-btn:hover,
        .menu-toggle:hover {
          transform: none !important;
          box-shadow: none !important;
          opacity: 1 !important;
        }
        .content {
          position: relative;
          z-index: 10;
          min-height: 100vh;
          padding-top: 58px;
          padding-right: 280px;
          transition:
            padding-left 360ms cubic-bezier(0.22, 1, 0.36, 1),
            padding-right 360ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .content.menu-open {
          padding-left: 280px;
        }
        :global(.content.menu-open .page) {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 50;
          border: 0;
          background: rgba(3, 6, 16, 0.5);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        @media (max-width: 1180px) {
          .integration-panel-wrap {
            display: none;
          }
          .content {
            padding-left: 0;
            padding-right: 0;
          }
          .content.menu-open {
            padding-left: 0;
            padding-right: 0;
          }
        }
        @media (max-width: 520px) {
          .topbar-title {
            font-size: 0.96rem;
          }
          .topbar-logo {
            height: 130px;
            max-width: min(52vw, 165px);
          }
          .carbon-panel-wrap {
            left: 10px;
            top: 89px;
            bottom: 10px;
            width: min(255px, calc(100vw - 20px));
          }
          .integration-panel-wrap {
            right: 10px;
            top: 89px;
            height: var(--integration-panel-height, calc(100vh - 99px));
            width: min(255px, calc(100vw - 20px));
          }
        }
      `}</style>
    </div>
  );
}
