"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WORKSPACE_PAGE_CATALOG } from "@/lib/workspacePageCatalog";

type DashboardSessionPayload = {
  user?: {
    username?: string | null;
    role?: string | null;
  };
  allowedPageIds?: string[];
};

export default function DashboardPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [allowedPageIds, setAllowedPageIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch("/api/admin/me", { cache: "no-store" });
        const json = (await resp.json().catch(() => ({}))) as DashboardSessionPayload;
        if (!resp.ok) throw new Error("Unable to load session.");
        if (cancelled) return;
        setUsername(String(json?.user?.username || "").trim() || null);
        setRole(String(json?.user?.role || "").trim() || null);
        setAllowedPageIds(Array.isArray(json?.allowedPageIds) ? json.allowedPageIds : []);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message || "Failed to load allowed pages."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const allowedPages = useMemo(
    () =>
      WORKSPACE_PAGE_CATALOG.filter(
        (page) => page.id !== "workspace_dashboard" && allowedPageIds.includes(page.id)
      ),
    [allowedPageIds]
  );

  async function onLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <main className="page">
      <section className="glass-panel hero">
        <div className="hero-head">
          <div>
            <p className="muted">
              Signed in as <b>{username || "unknown"}</b> ({role || "unknown"}). Showing only pages allowed for this
              account.
            </p>
          </div>
          <button className="btn-base btn-danger action-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </section>

      {error ? (
        <section className="glass-panel card">
          <p className="error">Error: {error}</p>
        </section>
      ) : loading ? (
        <section className="glass-panel card">
          <p>Loading allowed pages...</p>
        </section>
      ) : allowedPages.length === 0 ? (
        <section className="glass-panel card">
          <p>No pages are currently allowed for this account.</p>
        </section>
      ) : (
        <section className="launcher-grid">
          {allowedPages.map((page) => (
            <article key={page.id} className="glass-panel page-card">
              <div className="card-title">{page.menuLabel}</div>
              <p className="muted">{page.pathHint}</p>
              <Link
                href={page.href}
                className="btn-base btn-outline action-btn open-page-btn"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  width: "100%",
                  paddingLeft: 0,
                  paddingRight: 0,
                }}
              >
                Open Page
              </Link>
            </article>
          ))}
        </section>
      )}

      <style jsx>{`
        .page {
          max-width: 1320px;
          margin: 0 auto;
          padding: 0 8px 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .hero,
        .page-card,
        .card,
        .notice {
          padding: 18px;
        }
        .hero-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        h1 {
          margin: 0 0 6px;
          font-size: 1.08rem;
        }
        .muted {
          color: rgba(226, 232, 240, 0.82);
          margin: 0;
        }
        .action-btn {
          min-width: 132px;
          padding: 10px 14px;
          text-align: center;
        }
        .open-page-btn {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          line-height: 1;
        }
        .error {
          color: #fca5a5;
          font-weight: 700;
        }
        .launcher-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 10px;
        }
        .page-card {
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          display: grid;
          gap: 10px;
        }
        .card-title {
          font-size: 1.02rem;
          font-weight: 700;
        }
        @media (max-width: 1120px) {
          .hero-head {
            align-items: stretch;
          }
        }
      `}</style>
    </main>
  );
}

