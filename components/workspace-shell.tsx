"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
};

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
  const currentTitle = getCurrentTitle(pathname);
  const drawerOpen = menuOpen || menuPinned;

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
    <div className="shell">
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
          top: 64px;
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
          transition:
            padding-left 360ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
          transform-origin: top left;
        }
        .content.menu-open {
          padding-left: 280px;
          transform: scale(0.985);
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
          .content.menu-open {
            padding-left: 0;
            transform: none;
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
            top: 64px;
            bottom: 10px;
            width: min(255px, calc(100vw - 20px));
          }
        }
      `}</style>
    </div>
  );
}
