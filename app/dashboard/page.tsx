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
      setError(e?.message || "Failed to load from IndexedDB");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setStatus("✅ Deleted.");
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    }
  }

  async function onClearAll() {
    setError(null);
    setStatus(null);

    if (!confirm("Delete ALL saved generations?")) return;

    try {
      await idbClearAll();
      await refresh();
      setStatus("✅ Cleared all.");
    } catch (e: any) {
      setError(e?.message || "Clear all failed");
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
    <div style={{ maxWidth: 1200, margin: "48px auto", fontFamily: "system-ui" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Dashboard</h1>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/">Home</Link>
          <a href="/generate">Generate</a>

          <button
            onClick={refresh}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>

          <button
            onClick={onClearAll}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Clear all
          </button>

          <button
            onClick={onLogout}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {(error || status) && (
        <div style={{ marginBottom: 14 }}>
          {error && <div style={{ color: "crimson" }}>❌ {error}</div>}
          {status && <div style={{ color: "green" }}>{status}</div>}
        </div>
      )}

      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Search prompts</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Try: "hoodie", "studio", "mannequin"'
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ddd",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "#444" }}>Sort</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              style={{
                padding: 10,
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          <div style={{ padding: 10, borderRadius: 8, border: "1px solid #eee" }}>
            Results: <b>{filtered.length}</b> / {items.length}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: 16, border: "1px solid #eee", borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>No saved generations yet.</p>
          <a href="/generate">Go generate and save one →</a>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 16, border: "1px solid #eee", borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>No matches for your search.</p>
          <button
            onClick={() => setQuery("")}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 420px",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Gallery</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {filtered.map((x) => {
                const isActive = x.id === selectedId;

                return (
                  <div
                    key={x.id}
                    onClick={() => setSelectedId(x.id)}
                    style={{
                      border: isActive ? "2px solid #111" : "1px solid #ddd",
                      borderRadius: 10,
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "white",
                    }}
                    title={x.prompt}
                  >
                    <div style={{ aspectRatio: "1 / 1", background: "#fafafa" }}>
                      <img
                        src={`data:image/png;base64,${x.imageBase64}`}
                        alt="Saved generation"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>

                    <div style={{ padding: 10 }}>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {new Date(x.createdAt).toLocaleString()}
                      </div>

                      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.25 }}>
                        {x.prompt.length > 70 ? x.prompt.slice(0, 70) + "…" : x.prompt}
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteOne(x.id);
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #ddd",
                            cursor: "pointer",
                            fontSize: 12,
                            color: "crimson",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {selected ? new Date(selected.createdAt).toLocaleString() : "No selection"}
                </div>
                <h2 style={{ margin: "8px 0 0 0" }}>Preview</h2>
              </div>

              {selected && (
                <button
                  onClick={onDownloadSelected}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    cursor: "pointer",
                    height: 40,
                    alignSelf: "flex-start",
                  }}
                >
                  Download PNG
                </button>
              )}
            </div>

            {!selected ? (
              <div style={{ marginTop: 12 }}>Click any item in the gallery.</div>
            ) : (
              <>
                <p style={{ marginTop: 10, color: "#333" }}>
                  <b>Prompt:</b> {selected.prompt}
                </p>

                <img
                  src={`data:image/png;base64,${selected.imageBase64}`}
                  alt="Selected generation"
                  style={{
                    width: "100%",
                    border: "1px solid #ddd",
                    borderRadius: 10,
                  }}
                />

                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={() => onDeleteOne(selected.id)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      cursor: "pointer",
                      color: "crimson",
                    }}
                  >
                    Delete selected
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
