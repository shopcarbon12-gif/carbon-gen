"use client";

import { useMemo, useState } from "react";

type PreviewKey =
  | "images"
  | "video"
  | "social"
  | "seo"
  | "inventory"
  | "dashboard"
  | "settings";

type PreviewItem = {
  key: PreviewKey;
  name: string;
  icon: string;
  state?: "soon";
};

function GlassPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`glass ${className}`}>{children}</div>;
}

const navGroups: { title: string; items: PreviewItem[] }[] = [
  {
    title: "Creative Suite",
    items: [
      { key: "images", name: "Image Studio", icon: "📸" },
      { key: "video", name: "Motion Studio", icon: "🎞️", state: "soon" },
      { key: "social", name: "Ad Generator", icon: "📢", state: "soon" },
    ],
  },
  {
    title: "Store Operations",
    items: [
      { key: "seo", name: "Content & SEO", icon: "🧾" },
      { key: "inventory", name: "Collection Mapper", icon: "🗂️", state: "soon" },
    ],
  },
  {
    title: "System",
    items: [
      { key: "dashboard", name: "Workspace Dashboard", icon: "📊" },
      { key: "settings", name: "Settings & APIs", icon: "⚙️" },
    ],
  },
];

function getWorkspaceCopy(key: PreviewKey) {
  switch (key) {
    case "images":
      return {
        title: "Image Studio",
        subtitle:
          "Model uploads, item references, panel generation, crop tools, and prompt troubleshooting.",
        chips: ["Model Registry", "Panel 1-4", "2:3 Crop", "OpenAI Debug"],
      };
    case "video":
      return {
        title: "Motion Studio",
        subtitle:
          "9:16 vertical video generation for short cinematic product promos.",
        chips: ["15s Reels", "Brand Motion", "Shot Sequencing", "Transitions"],
      };
    case "social":
      return {
        title: "Ad Generator",
        subtitle:
          "Fast creative variants for Meta and Google Display campaigns.",
        chips: ["Meta Ads", "Display Sets", "Copy Pairing", "Export Pack"],
      };
    case "seo":
      return {
        title: "Content & SEO Manager",
        subtitle:
          "Pull products, update SEO fields, improve alt text, and push safely to Shopify.",
        chips: ["Shopify Pull", "SEO Edit", "Alt Text", "Shopify Push"],
      };
    case "inventory":
      return {
        title: "Collection Mapper",
        subtitle:
          "Dual-pane sync flow for Lightspeed R Series inventory into Shopify collections.",
        chips: ["Lightspeed", "Shopify", "Mapping Rules", "Sync Queue"],
      };
    case "dashboard":
      return {
        title: "Workspace Dashboard",
        subtitle:
          "Daily KPI view with sales, inventory health, and integration status.",
        chips: ["Sales KPI", "Inventory", "API Health", "Recent Runs"],
      };
    case "settings":
      return {
        title: "Settings & Infrastructure",
        subtitle:
          "OAuth connections, roles, permissions, and environment controls.",
        chips: ["OAuth", "Roles", "Security", "Automation"],
      };
    default:
      return {
        title: "Workspace",
        subtitle: "",
        chips: [],
      };
  }
}

export default function LayoutShellV1() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState<PreviewKey>("images");
  const content = useMemo(() => getWorkspaceCopy(active), [active]);

  return (
    <div className="preview-shell">
      <div className="mobile-top">
        <div className="brand-word">Carbon.</div>
        <button
          type="button"
          className="menu-btn"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      <div className="frame">
        <aside className={`sidebar-wrap ${mobileOpen ? "open" : ""}`}>
          <GlassPanel className="sidebar">
            <div className="brand-area">
              <div className="brand-word desktop">Carbon.</div>
              <div className="brand-sub">Workspace Preview v1</div>
            </div>

            {navGroups.map((group) => (
              <div key={group.title} className="group">
                <div className="group-title">{group.title}</div>
                <div className="group-links">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`nav-btn ${active === item.key ? "active" : ""}`}
                      onClick={() => {
                        setActive(item.key);
                        setMobileOpen(false);
                      }}
                    >
                      <span className="left">
                        <span className="icon">{item.icon}</span>
                        <span>{item.name}</span>
                      </span>
                      {item.state === "soon" ? (
                        <span className="soon-pill">Soon</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </GlassPanel>
        </aside>

        {mobileOpen ? (
          <button
            className="backdrop"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <main className="main">
          <div className="hero">
            <GlassPanel className="status-card">
              <div className="status-title">Preview Mode</div>
              <div className="status-copy">
                This screen is isolated at <code>/preview/v1</code>. Live pages are untouched.
              </div>
            </GlassPanel>
          </div>

          <div className="chip-row">
            {content.chips.map((chip) => (
              <span key={chip} className="chip">
                {chip}
              </span>
            ))}
          </div>

          <div className="grid">
            <GlassPanel className="panel">
              <h3>Primary Workspace</h3>
              <p>
                Main tool area for this section. This is where forms, generators,
                queues, and run logs would live.
              </p>
            </GlassPanel>
            <GlassPanel className="panel">
              <h3>Context Rail</h3>
              <p>
                Secondary controls for presets, integration status, and quick
                actions without overloading one giant page.
              </p>
            </GlassPanel>
            <GlassPanel className="panel wide">
              <h3>Flow Intent</h3>
              <p>
                Creative pipeline: Image Studio → Motion Studio → Ad Generator.
                Operational pipeline: Content & SEO → Collection Mapper.
              </p>
            </GlassPanel>
          </div>
        </main>
      </div>

      <style jsx>{`
        .preview-shell {
          min-height: 100vh;
          color: #fff;
          position: relative;
          overflow: hidden;
        }
        .mobile-top {
          display: none;
          position: relative;
          z-index: 10;
          padding: 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(10px);
          background: rgba(0, 0, 0, 0.35);
          justify-content: space-between;
          align-items: center;
        }
        .brand-word {
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .menu-btn {
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #fff;
          background: rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          width: 38px;
          height: 36px;
          font-size: 18px;
          cursor: pointer;
        }
        .frame {
          position: relative;
          z-index: 5;
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 18px;
          max-width: 1520px;
          margin: 0 auto;
          padding: 22px;
        }
        .sidebar-wrap {
          min-width: 0;
        }
        .glass {
          background: rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 22px 50px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(16px);
          border-radius: 22px;
        }
        .sidebar {
          padding: 18px;
          display: grid;
          gap: 14px;
          min-height: calc(100vh - 44px);
        }
        .brand-area {
          padding: 8px 10px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .brand-word.desktop {
          font-size: 22px;
        }
        .brand-sub {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.72);
        }
        .group {
          display: grid;
          gap: 8px;
        }
        .group-title {
          font-size: 11px;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.7);
          padding: 0 4px;
          font-weight: 700;
        }
        .group-links {
          display: grid;
          gap: 6px;
        }
        .nav-btn {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid transparent;
          background: rgba(255, 255, 255, 0.02);
          color: rgba(255, 255, 255, 0.84);
          border-radius: 12px;
          padding: 10px 11px;
          text-align: left;
          cursor: pointer;
          transition: 160ms ease;
          font-size: 13px;
          font-weight: 700;
        }
        .nav-btn:hover {
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.14);
        }
        .nav-btn.active {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.3);
          color: #fff;
        }
        .left {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .icon {
          font-size: 16px;
          line-height: 1;
        }
        .soon-pill {
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.85);
        }
        .main {
          min-width: 0;
          overflow: auto;
          padding: 6px 4px 20px;
        }
        .hero {
          display: flex;
          justify-content: flex-end;
        }
        p {
          color: rgba(255, 255, 255, 0.86);
          font-size: 14px;
          line-height: 1.55;
          margin-top: 10px;
        }
        .status-card {
          padding: 14px;
        }
        .status-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: rgba(255, 255, 255, 0.76);
          font-weight: 700;
          margin-bottom: 8px;
        }
        .status-copy {
          font-size: 13px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.88);
        }
        code {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          padding: 2px 6px;
        }
        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 14px 0;
        }
        .chip {
          font-size: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          padding: 6px 10px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .panel {
          padding: 14px;
        }
        .panel h3 {
          margin: 0;
          font-size: 15px;
        }
        .panel p {
          margin: 8px 0 0;
        }
        .panel.wide {
          grid-column: 1 / -1;
        }
        .backdrop {
          display: none;
        }
        @media (max-width: 990px) {
          .mobile-top {
            display: flex;
          }
          .frame {
            grid-template-columns: 1fr;
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
          .brand-word.desktop {
            display: none;
          }
          .hero {
            justify-content: stretch;
          }
          .grid {
            grid-template-columns: 1fr;
          }
          .backdrop {
            display: block;
            position: fixed;
            inset: 0;
            border: 0;
            z-index: 20;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
          }
        }
      `}</style>
    </div>
  );
}
