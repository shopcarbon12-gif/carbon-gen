"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string; badge?: string };

const creativeSuite: NavItem[] = [
  { href: "/studio/images", label: "Image Studio" },
  { href: "/studio/video", label: "Motion Studio", badge: "Soon" },
  { href: "/studio/social", label: "Ad Generator", badge: "Soon" },
];

const storeOps: NavItem[] = [
  { href: "/ops/seo", label: "Content & SEO" },
  { href: "/ops/inventory", label: "Collection Mapper", badge: "Soon" },
];

const systemLinks: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Group({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="group">
      <div className="group-title">{title}</div>
      <div className="group-links">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`link ${isActive(pathname, item.href) ? "active" : ""}`}
          >
            <span>{item.label}</span>
            {item.badge ? <span className="badge">{item.badge}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="eyebrow">Carbon Gen</div>
          <div className="title">Workspace</div>
        </div>
        <Group title="Creative Suite" items={creativeSuite} pathname={pathname} />
        <Group title="Store Operations" items={storeOps} pathname={pathname} />
        <Group title="System" items={systemLinks} pathname={pathname} />
      </aside>
      <div className="content">{children}</div>
      <style jsx>{`
        .shell {
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr);
          min-height: 100vh;
          background: #f7fafc;
        }
        .sidebar {
          border-right: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 20px 14px;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          display: grid;
          gap: 16px;
          align-content: start;
        }
        .brand {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
          background: #f8fafc;
        }
        .eyebrow {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #0b6b58;
          font-weight: 700;
        }
        .title {
          font-size: 1rem;
          font-weight: 700;
          margin-top: 4px;
          color: #0f172a;
        }
        .group {
          display: grid;
          gap: 8px;
        }
        .group-title {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
          font-weight: 700;
          padding: 0 6px;
        }
        .group-links {
          display: grid;
          gap: 6px;
        }
        .link {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 9px 10px;
          color: #0f172a;
          text-decoration: none;
          background: #fff;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .link:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .link.active {
          border-color: #0b6b58;
          background: #e7f4f1;
          color: #0b6b58;
        }
        .badge {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 0.7rem;
          color: #64748b;
        }
        .content {
          min-width: 0;
        }
        @media (max-width: 980px) {
          .shell {
            grid-template-columns: minmax(0, 1fr);
          }
          .sidebar {
            position: static;
            height: auto;
            border-right: none;
            border-bottom: 1px solid #e2e8f0;
          }
        }
      `}</style>
    </div>
  );
}

