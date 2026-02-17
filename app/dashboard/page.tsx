"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  GenerationRecord,
  idbClearAll,
  idbDeleteGeneration,
  idbListGenerations,
} from "@/lib/indexeddb";

function includesAllTokens(haystack: string, tokens: string[]) {
  const h = haystack.toLowerCase();
  return tokens.every((t) => h.includes(t));
}

export default function DashboardPage() {
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  async function refresh() {
    setError(null);
    setStatus(null);
    try {
      const list = await idbListGenerations(200);
      const sorted =
        sort === "newest"
          ? list
          : [...list].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
            );
      setItems(sorted);
      setSelectedId((prev) => prev ?? sorted[0]?.id ?? null);
    } catch (e: any) {
      setError(e?.message || "Failed to load saved generations.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    refresh();
  }, [sort]);

  const filtered = useMemo(() => {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return items;
    return items.filter((x) => includesAllTokens(x.prompt, tokens));
  }, [items, query]);

  useEffect(() => {
    if (!selectedId) return;
    const stillExists = filtered.some((x) => x.id === selectedId);
    if (!stillExists) setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);

  async function onDeleteOne(id: string) {
    setError(null);
    setStatus(null);
    try {
      await idbDeleteGeneration(id);
      await refresh();
      setStatus("Deleted.");
    } catch (e: any) {
      setError(e?.message || "Delete failed.");
    }
  }

  async function onClearAll() {
    setError(null);
    setStatus(null);
    if (!confirm("Delete all saved generations?")) return;
    try {
      await idbClearAll();
      await refresh();
      setStatus("Cleared all.");
    } catch (e: any) {
      setError(e?.message || "Clear all failed.");
    }
  }

  function onDownloadSelected() {
    if (!selected) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${selected.imageBase64}`;
    a.download = `carbon-gen-${selected.id}.png`;
    a.click();
  }

  async function onLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <main className="page">
      <section className="glass-panel top-actions-wrap">
        <div className="top-actions">
          <Link href="/studio/images" className="chip">
            Image Studio
          </Link>
          <Link href="/generate" className="chip">
            Generate
          </Link>
          <button className="btn-base btn-outline action-btn" onClick={refresh}>
            Refresh
          </button>
          <button className="btn-base btn-outline action-btn" onClick={onClearAll}>
            Clear All
          </button>
          <button className="btn-base btn-danger action-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </section>

      {(error || status) && (
        <section className="glass-panel notice">
          {error ? <div className="error">Error: {error}</div> : null}
          {status ? <div className="status">{status}</div> : null}
        </section>
      )}

      <section className="glass-panel filters">
        <div className="filter-col">
          <label className="control-label" htmlFor="search">
            Search Prompts
          </label>
          <input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Try "hoodie", "studio", or "mannequin"'
          />
        </div>

        <div className="filter-col small">
          <label className="control-label" htmlFor="sort">
            Sort
          </label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "oldest")}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        <div className="result-pill">
          Results: <b>{filtered.length}</b> / {items.length}
        </div>
      </section>

      {items.length === 0 ? (
        <section className="glass-panel card">
          <p>No saved generations yet.</p>
          <Link href="/generate" className="chip">
            Go generate and save one
          </Link>
        </section>
      ) : filtered.length === 0 ? (
        <section className="glass-panel card">
          <p>No matches for your search.</p>
          <button className="btn-base btn-outline action-btn" onClick={() => setQuery("")}>
            Clear Search
          </button>
        </section>
      ) : (
        <section className="main-grid">
          <article className="glass-panel card">
            <div className="card-title">Gallery</div>
            <div className="gallery">
              {filtered.map((x) => {
                const isActive = x.id === selectedId;
                return (
                  <div
                    key={x.id}
                    className={`tile ${isActive ? "active" : ""}`}
                    onClick={() => setSelectedId(x.id)}
                    title={x.prompt}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(x.id);
                      }
                    }}
                  >
                    <img src={`data:image/png;base64,${x.imageBase64}`} alt="Saved generation" />
                    <div className="tile-meta">
                      <div className="tile-date">{new Date(x.createdAt).toLocaleString()}</div>
                      <div className="tile-prompt">
                        {x.prompt.length > 80 ? `${x.prompt.slice(0, 80)}...` : x.prompt}
                      </div>
                      <button
                        type="button"
                        className="tile-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteOne(x.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="glass-panel card">
            <div className="preview-head">
              <div>
                <div className="tile-date">
                  {selected ? new Date(selected.createdAt).toLocaleString() : "No selection"}
                </div>
                <div className="card-title">Preview</div>
              </div>
              {selected ? (
                <button className="btn-base btn-outline action-btn" onClick={onDownloadSelected}>
                  Download PNG
                </button>
              ) : null}
            </div>

            {!selected ? (
              <p>Click any item in the gallery.</p>
            ) : (
              <>
                <p className="muted">
                  <b>Prompt:</b> {selected.prompt}
                </p>
                <div className="preview-wrap">
                  <img src={`data:image/png;base64,${selected.imageBase64}`} alt="Selected generation" />
                </div>
                <button className="btn-base btn-danger action-btn" onClick={() => onDeleteOne(selected.id)}>
                  Delete Selected
                </button>
              </>
            )}
          </article>
        </section>
      )}

      <style jsx>{`
        .page {
          max-width: 1320px;
          margin: 0 auto;
          padding: 22px 8px 26px;
          display: grid;
          gap: 14px;
          color: #f8fafc;
        }
        .top-actions-wrap,
        .filters,
        .card,
        .notice {
          padding: 18px;
        }
        .muted {
          color: rgba(226, 232, 240, 0.82);
          margin: 0;
        }
        .top-actions {
          margin-top: 14px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .chip {
          text-decoration: none;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.04);
          color: #f8fafc;
          padding: 9px 14px;
          font-size: 0.84rem;
          font-weight: 700;
        }
        .chip:hover {
          border-color: rgba(255, 255, 255, 0.34);
          background: rgba(255, 255, 255, 0.1);
        }
        .action-btn {
          min-width: 130px;
          padding: 10px 14px;
        }
        .notice {
          display: grid;
          gap: 4px;
        }
        .error {
          color: #fca5a5;
          font-weight: 700;
        }
        .status {
          color: #86efac;
          font-weight: 700;
        }
        .filters {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 220px auto;
          gap: 10px;
          align-items: end;
        }
        .filter-col {
          display: grid;
          gap: 8px;
        }
        .result-pill {
          min-height: 46px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.06);
          padding: 10px 14px;
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
          font-size: 0.9rem;
        }
        .main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
          gap: 14px;
          align-items: start;
        }
        .card {
          display: grid;
          gap: 12px;
        }
        .card-title {
          font-size: 1.05rem;
          font-weight: 700;
        }
        .gallery {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .tile {
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.04);
          color: #f8fafc;
          text-align: left;
          padding: 0;
          cursor: pointer;
        }
        .tile.active {
          border-color: rgba(52, 211, 153, 0.72);
          box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.24);
        }
        .tile img {
          width: 100%;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          display: block;
        }
        .tile-meta {
          padding: 10px;
          display: grid;
          gap: 6px;
        }
        .tile-date {
          color: rgba(226, 232, 240, 0.68);
          font-size: 0.75rem;
        }
        .tile-prompt {
          font-size: 0.83rem;
          line-height: 1.35;
        }
        .tile-delete {
          min-height: 0;
          width: fit-content;
          border-radius: 10px;
          border: 1px solid rgba(248, 113, 113, 0.4);
          background: rgba(239, 68, 68, 0.14);
          color: #fecaca;
          font-size: 0.74rem;
          padding: 4px 10px;
          cursor: pointer;
        }
        .preview-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .preview-wrap {
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
          padding: 10px;
        }
        .preview-wrap img {
          width: 100%;
          border-radius: 10px;
          display: block;
        }
        @media (max-width: 1120px) {
          .filters {
            grid-template-columns: minmax(0, 1fr);
          }
          .main-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        @media (max-width: 840px) {
          .gallery {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}

