"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: string;
};

const creativeSuite: NavItem[] = [
  { href: "/studio/images", label: "Image Studio", icon: "📸" },
  { href: "/studio/video", label: "Motion Studio", icon: "🎞️", badge: "Soon" },
  { href: "/studio/social", label: "Ad Generator", icon: "📢", badge: "Soon" },
];

const storeOps: NavItem[] = [
  { href: "/ops/seo", label: "Content & SEO", icon: "🧾" },
  { href: "/ops/inventory", label: "Collection Mapper", icon: "🗂️", badge: "Soon" },
];

const systemLinks: NavItem[] = [
  { href: "/dashboard", label: "Workspace Dashboard", icon: "📊" },
  { href: "/settings", label: "Settings & APIs", icon: "⚙️" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Group({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="group">
      <div className="group-title">{title}</div>
      <div className="group-links">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`nav-link ${isActive(pathname, item.href) ? "active" : ""}`}
          >
            <span className="left">
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
            </span>
            {item.badge ? <span className="badge">{item.badge}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

function GlassPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass ${className}`}>{children}</div>;
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="shell">
      <div className="bg-photo" />
      <div className="bg-fade" />

      <div className="mobile-top">
        <div className="brand-mobile">Carbon.</div>
        <button
          type="button"
          className="menu-btn"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle workspace menu"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      <div className="frame">
        <aside className={`sidebar-wrap ${mobileOpen ? "open" : ""}`}>
          <GlassPanel className="sidebar">
            <div className="brand">
              <div className="brand-word">Carbon.</div>
              <div className="brand-sub">Workspace</div>
            </div>

            <Group
              title="Creative Suite"
              items={creativeSuite}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <Group
              title="Store Operations"
              items={storeOps}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <Group
              title="System"
              items={systemLinks}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </GlassPanel>
        </aside>

        {mobileOpen ? (
          <button
            className="backdrop"
            aria-label="Close workspace menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <main className="content">{children}</main>
      </div>

      <style jsx>{`
        .shell {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          color: #fff;
          background: #050505;
        }
        .bg-photo {
          position: absolute;
          inset: 0;
          z-index: 0;
          opacity: 0.32;
          background-size: cover;
          background-position: center;
          background-image: url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop");
        }
        .bg-fade {
          position: absolute;
          inset: 0;
          z-index: 0;
          background: linear-gradient(140deg, rgba(0, 0, 0, 0.84), rgba(0, 0, 0, 0.62), rgba(0, 0, 0, 0.9));
        }
        .mobile-top {
          display: none;
          position: relative;
          z-index: 10;
          align-items: center;
          justify-content: space-between;
          padding: 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(8px);
        }
        .brand-mobile {
          font-size: 1rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .menu-btn {
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          width: 38px;
          height: 36px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 18px;
          cursor: pointer;
        }
        .frame {
          position: relative;
          z-index: 5;
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 18px;
          max-width: 1580px;
          margin: 0 auto;
          padding: 22px;
        }
        .sidebar-wrap {
          min-width: 0;
        }
        .glass {
          background: rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 22px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.38);
        }
        .sidebar {
          display: grid;
          align-content: start;
          gap: 14px;
          padding: 18px;
          min-height: calc(100vh - 44px);
        }
        .brand {
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          padding: 8px 10px 14px;
        }
        .brand-word {
          font-size: 1.3rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .brand-sub {
          margin-top: 6px;
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.74);
          letter-spacing: 0.06em;
        }
        .group {
          display: grid;
          gap: 8px;
        }
        .group-title {
          font-size: 0.69rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.74);
          font-weight: 800;
          padding: 0 4px;
        }
        .group-links {
          display: grid;
          gap: 6px;
        }
        .nav-link {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.84);
          padding: 10px 11px;
          text-decoration: none;
          font-size: 0.83rem;
          font-weight: 700;
          transition: 160ms ease;
        }
        .nav-link:hover {
          border-color: rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        .nav-link.active {
          border-color: rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }
        .left {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .icon {
          font-size: 1rem;
          line-height: 1;
        }
        .badge {
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.62rem;
          color: rgba(255, 255, 255, 0.86);
        }
        .content {
          min-width: 0;
          overflow-x: hidden;
          overflow-y: auto;
        }
        .content :global(::-webkit-scrollbar) {
          width: 8px;
        }
        .content :global(::-webkit-scrollbar-track) {
          background: rgba(0, 0, 0, 0.22);
        }
        .content :global(::-webkit-scrollbar-thumb) {
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.22);
        }
        .backdrop {
          display: none;
        }
        @media (max-width: 980px) {
          .mobile-top {
            display: flex;
          }
          .frame {
            grid-template-columns: minmax(0, 1fr);
            gap: 10px;
            padding: 10px;
          }
          .sidebar-wrap {
            position: fixed;
            inset: 0 auto 0 0;
            width: min(80vw, 320px);
            z-index: 25;
            transform: translateX(-110%);
            transition: transform 180ms ease;
            padding: 10px 8px 8px;
          }
          .sidebar-wrap.open {
            transform: translateX(0);
          }
          .sidebar {
            min-height: calc(100vh - 18px);
          }
          .content {
            padding-bottom: 84px;
          }
          .backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 20;
            border: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
          }
        }
      `}</style>
    </div>
  );
}

