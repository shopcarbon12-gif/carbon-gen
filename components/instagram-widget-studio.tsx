"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstagramSectionStoredConfig } from "@/lib/instagramSectionConfigRepository";
import { INSTAGRAM_HERO_HEIGHT, INSTAGRAM_HERO_WIDTH } from "@/lib/instagram-widget-constants";

const DEFAULT_HERO =
  "https://cdn.shopify.com/s/files/1/0680/6572/2620/files/DZ__3128.jpg?v=1733764412";

const DEFAULT_AVATAR = "/brand/carbon-long-white.png";

/** Neuzeit Grotesk W01 Regular — file: `public/fonts/neuzeit-grotesk-regular.otf` */
const HERO_LINK_FONT_FAMILY = "'Neuzeit Grotesk', ui-sans-serif, system-ui, sans-serif";

function defaults(): InstagramSectionStoredConfig {
  return {
    heroAlt: "Instagram banner for @shopcarbon",
    heroLinkText: "@shopcarbon",
    heroLinkHref: "https://www.instagram.com/shopcarbon/",
    heroLinkFontSizeDesktopPx: 28,
    heroLinkFontSizeMobilePx: 18,
    heroLinkFontWeight: 400,
    heroLinkColor: "#ffffff",
    profileAvatarUrl: "",
    profileBrandName: "CARBON",
    profileHandle: "@shopcarbon",
    profilePostsCount: "322",
    profileFollowersCount: "3.8K",
    profileFollowButtonLabel: "Follow",
    profileFollowButtonHref: "https://www.instagram.com/shopcarbon/",
  };
}

function mergeWithDefaults(c: InstagramSectionStoredConfig): InstagramSectionStoredConfig {
  return { ...defaults(), ...c };
}

/** Pic2-style preview: sharp squares, hero ~58% + 2×2 grid, profile row. Theme supplies only the section title in production. */
export function InstagramWidgetPreview({
  mode,
  cfg,
  heroSrc,
}: {
  mode: "desktop" | "mobile";
  cfg: InstagramSectionStoredConfig;
  heroSrc: string;
}) {
  const isDesktop = mode === "desktop";
  const avatar = (cfg.profileAvatarUrl || "").trim() || DEFAULT_AVATAR;
  const fs = isDesktop
    ? cfg.heroLinkFontSizeDesktopPx ?? 28
    : cfg.heroLinkFontSizeMobilePx ?? 18;

  return (
    <div className={`iw-frame ${isDesktop ? "iw-desktop" : "iw-mobile"}`}>
      <div className="iw-label">{isDesktop ? "Desktop preview" : "Mobile preview"}</div>
      <div className="iw-surface">
        <p className="iw-section-title">FOLLOW US ON INSTAGRAM</p>
        <div className="iw-profile">
          <img className="iw-avatar" src={avatar} alt="" width={48} height={48} />
          <div className="iw-names">
            <div className="iw-brand">{cfg.profileBrandName || "CARBON"}</div>
            <div className="iw-handle">{cfg.profileHandle || "@shopcarbon"}</div>
          </div>
          <div className="iw-stats">
            <span>{cfg.profilePostsCount || "0"} Posts</span>
            <span>{cfg.profileFollowersCount || "0"} Followers</span>
          </div>
          <a className="iw-follow" href={cfg.profileFollowButtonHref || "#"} target="_blank" rel="noreferrer">
            {cfg.profileFollowButtonLabel || "Follow"}
          </a>
        </div>
        <div className={isDesktop ? "iw-main-row" : "iw-main-col"}>
          <div className="iw-hero">
            <div className="iw-hero-inner">
              <img src={heroSrc} alt={cfg.heroAlt || ""} className="iw-hero-img" />
              <a
                className="iw-hero-link"
                href={cfg.heroLinkHref || "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontFamily: HERO_LINK_FONT_FAMILY,
                  fontSize: fs,
                  fontWeight: cfg.heroLinkFontWeight ?? 400,
                  color: cfg.heroLinkColor || "#fff",
                }}
              >
                {cfg.heroLinkText || "@shopcarbon"}
              </a>
            </div>
          </div>
          <div className="iw-feed-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="iw-cell" />
            ))}
          </div>
        </div>
      </div>
      <style jsx>{`
        .iw-frame {
          border-radius: 0;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #fff;
          color: #0f172a;
        }
        .iw-desktop {
          width: 100%;
        }
        .iw-mobile {
          max-width: 390px;
          margin-left: auto;
          margin-right: auto;
        }
        .iw-label {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(71, 85, 105, 0.95);
          padding: 8px 10px 0;
          background: #f8fafc;
        }
        .iw-surface {
          padding: 12px 10px 14px;
        }
        .iw-section-title {
          margin: 0 0 10px;
          text-align: center;
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .iw-profile {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
          padding: 0 4px;
        }
        .iw-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
          border: 0;
        }
        .iw-names {
          flex: 1;
          min-width: 120px;
        }
        .iw-brand {
          font-weight: 800;
          font-size: 0.95rem;
          line-height: 1.2;
        }
        .iw-handle {
          font-size: 0.8rem;
          color: #64748b;
        }
        .iw-stats {
          display: flex;
          gap: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .iw-follow {
          margin-left: auto;
          padding: 6px 14px;
          background: #1877f2;
          color: #fff !important;
          font-weight: 700;
          font-size: 0.78rem;
          text-decoration: none;
          border-radius: 0;
        }
        .iw-main-row {
          display: flex;
          flex-direction: row;
          gap: 4px;
          align-items: stretch;
        }
        .iw-main-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .iw-hero {
          flex: 0 0 58%;
          max-width: 58%;
          min-width: 0;
        }
        .iw-mobile .iw-hero {
          flex: none;
          max-width: 100%;
          width: 100%;
        }
        .iw-hero-inner {
          position: relative;
          width: 100%;
          aspect-ratio: ${INSTAGRAM_HERO_WIDTH} / ${INSTAGRAM_HERO_HEIGHT};
          background: #e2e8f0;
          border-radius: 0;
          overflow: hidden;
        }
        .iw-hero-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 0;
        }
        .iw-hero-link {
          position: absolute;
          left: 50%;
          top: 62%;
          transform: translate(-50%, -50%);
          text-decoration: underline;
          text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
          white-space: nowrap;
          font-family: ${HERO_LINK_FONT_FAMILY};
        }
        .iw-feed-grid {
          flex: 1;
          min-width: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
          gap: 4px;
          background: #fff;
        }
        .iw-mobile .iw-feed-grid {
          min-height: 200px;
        }
        .iw-cell {
          background: #cbd5e1;
          border-radius: 0;
          aspect-ratio: 1;
        }
      `}</style>
    </div>
  );
}

export function InstagramWidgetStudioForm() {
  const [cfg, setCfg] = useState<InstagramSectionStoredConfig>(() => defaults());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dropboxPath, setDropboxPath] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/storefront/instagram-section?scope=default");
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Failed to load");
      setCfg(mergeWithDefaults((data.config || {}) as InstagramSectionStoredConfig));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const heroSrc = useMemo(() => {
    const u = (cfg.heroImageUrl || "").trim();
    return u || DEFAULT_HERO;
  }, [cfg.heroImageUrl]);

  function patch(p: Partial<InstagramSectionStoredConfig>) {
    setCfg((prev) => ({ ...prev, ...p }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/storefront/instagram-section?scope=default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: cfg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      setStatus("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/storefront/instagram-section/hero-upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      const url = String(data.url || "").trim();
      if (!url) throw new Error("No URL returned");
      patch({ heroImageUrl: url });
      setStatus("Hero processed and verified. Save to persist.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function importDropbox() {
    const p = dropboxPath.trim();
    if (!p) {
      setError("Enter a Dropbox path (e.g. /Photos/hero.jpg)");
      return;
    }
    setUploading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/storefront/instagram-section/hero-from-dropbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path_lower: p.startsWith("/") ? p : `/${p}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Dropbox import failed");
      const url = String(data.url || "").trim();
      if (!url) throw new Error("No URL returned");
      patch({ heroImageUrl: url });
      setStatus("Hero from Dropbox processed and verified. Save to persist.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dropbox import failed");
    } finally {
      setUploading(false);
    }
  }

  const liquidSnippet = useMemo(() => {
    const src = heroSrc.replace(/"/g, "&quot;");
    const alt = (cfg.heroAlt || "").replace(/"/g, "&quot;");
    const link = (cfg.heroLinkText || "@shopcarbon").replace(/"/g, "&quot;");
    const href = (cfg.heroLinkHref || "https://www.instagram.com/shopcarbon/").replace(/"/g, "&quot;");
    const fs = cfg.heroLinkFontSizeDesktopPx ?? 28;
    const fw = cfg.heroLinkFontWeight ?? 400;
    const col = (cfg.heroLinkColor || "#ffffff").replace(/"/g, "&quot;");
    return `{% comment %}
  Upload public/fonts/neuzeit-grotesk-regular.otf to Shopify Files (or your CDN), then add @font-face in theme CSS:
  @font-face { font-family: 'Neuzeit Grotesk'; src: url('YOUR_FILE_URL.otf') format('opentype'); font-weight: 400; font-display: swap; }
{% endcomment %}
<!-- Hero image -->
<img style="width:100%;object-fit:cover;border-radius:0" alt="${alt}" loading="lazy" src="${src}" width="${INSTAGRAM_HERO_WIDTH}" height="${INSTAGRAM_HERO_HEIGHT}" />
<!-- Overlay (@shopcarbon) — position to match theme; uses Neuzeit Grotesk Regular -->
<div class="instagram-link" style="position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);text-align:center;">
  <a style="font-family:'Neuzeit Grotesk',sans-serif;font-size:${fs}px;font-weight:${fw};color:${col};text-shadow:0 1px 6px rgba(0,0,0,0.45);" href="${href}" target="_blank" rel="noopener noreferrer">${link}</a>
</div>`;
  }, [heroSrc, cfg]);

  async function copyLiquid() {
    try {
      await navigator.clipboard.writeText(liquidSnippet);
      setStatus("Snippet copied.");
    } catch {
      setError("Copy failed.");
    }
  }

  if (loading) {
    return <p className="iw-loading">Loading…</p>;
  }

  return (
    <div className="iw-page">
      <style jsx global>{`
        @font-face {
          font-family: "Neuzeit Grotesk";
          src: url("/fonts/neuzeit-grotesk-regular.otf") format("opentype");
          font-weight: 100 900;
          font-style: normal;
          font-display: swap;
        }
      `}</style>
      <p className="iw-note">
        Only the section title <strong>FOLLOW US ON INSTAGRAM</strong> is wired in Shopify; profile row, hero, and
        feed are driven from this app once published.
      </p>

      <section className="iw-panel">
        <h2>Hero + profile</h2>
        <div className="iw-grid-form">
          <label>
            Hero image URL
            <input
              value={cfg.heroImageUrl || ""}
              onChange={(e) => patch({ heroImageUrl: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <label>
            Hero alt
            <input value={cfg.heroAlt || ""} onChange={(e) => patch({ heroAlt: e.target.value })} />
          </label>
          <label>
            Overlay link text
            <input value={cfg.heroLinkText || ""} onChange={(e) => patch({ heroLinkText: e.target.value })} />
          </label>
          <label>
            Overlay link URL
            <input value={cfg.heroLinkHref || ""} onChange={(e) => patch({ heroLinkHref: e.target.value })} />
          </label>
          <label>
            Link font desktop (px)
            <input
              type="number"
              value={cfg.heroLinkFontSizeDesktopPx ?? 28}
              onChange={(e) => patch({ heroLinkFontSizeDesktopPx: Number(e.target.value) })}
            />
          </label>
          <label>
            Link font mobile (px)
            <input
              type="number"
              value={cfg.heroLinkFontSizeMobilePx ?? 18}
              onChange={(e) => patch({ heroLinkFontSizeMobilePx: Number(e.target.value) })}
            />
          </label>
          <label>
            Link weight (400 = Neuzeit Regular file)
            <input
              type="number"
              value={cfg.heroLinkFontWeight ?? 400}
              onChange={(e) => patch({ heroLinkFontWeight: Number(e.target.value) })}
            />
          </label>
          <label>
            Link color
            <input value={cfg.heroLinkColor || "#ffffff"} onChange={(e) => patch({ heroLinkColor: e.target.value })} />
          </label>
          <label>
            Profile avatar URL
            <input
              value={cfg.profileAvatarUrl || ""}
              onChange={(e) => patch({ profileAvatarUrl: e.target.value })}
              placeholder="https://…"
            />
          </label>
          <label>
            Brand name
            <input value={cfg.profileBrandName || ""} onChange={(e) => patch({ profileBrandName: e.target.value })} />
          </label>
          <label>
            Handle
            <input value={cfg.profileHandle || ""} onChange={(e) => patch({ profileHandle: e.target.value })} />
          </label>
          <label>
            Posts count label
            <input value={cfg.profilePostsCount || ""} onChange={(e) => patch({ profilePostsCount: e.target.value })} />
          </label>
          <label>
            Followers label
            <input
              value={cfg.profileFollowersCount || ""}
              onChange={(e) => patch({ profileFollowersCount: e.target.value })}
            />
          </label>
          <label>
            Follow button label
            <input
              value={cfg.profileFollowButtonLabel || ""}
              onChange={(e) => patch({ profileFollowButtonLabel: e.target.value })}
            />
          </label>
          <label>
            Follow button URL
            <input
              value={cfg.profileFollowButtonHref || ""}
              onChange={(e) => patch({ profileFollowButtonHref: e.target.value })}
            />
          </label>
        </div>
        <div className="iw-row">
          <label className="iw-upload">
            {uploading ? "Working…" : "Upload hero file"}
            <input type="file" accept="image/*" disabled={uploading} onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="iw-dropbox">
            <input
              placeholder="/folder/image.jpg"
              value={dropboxPath}
              onChange={(e) => setDropboxPath(e.target.value)}
            />
            <button type="button" onClick={() => void importDropbox()} disabled={uploading}>
              Import from Dropbox
            </button>
          </div>
          <button type="button" className="iw-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => void load()}>
            Reload
          </button>
        </div>
        {error ? <p className="iw-err">{error}</p> : null}
        {status ? <p className="iw-ok">{status}</p> : null}
      </section>

      <section className="iw-panel">
        <h2>Previews (pic2 layout — sharp squares)</h2>
        <div className="iw-previews">
          <InstagramWidgetPreview mode="desktop" cfg={mergeWithDefaults(cfg)} heroSrc={heroSrc} />
          <InstagramWidgetPreview mode="mobile" cfg={mergeWithDefaults(cfg)} heroSrc={heroSrc} />
        </div>
      </section>

      <section className="iw-panel">
        <h2>Liquid fragment (hero img)</h2>
        <pre className="iw-code">{liquidSnippet}</pre>
        <button type="button" onClick={() => void copyLiquid()}>
          Copy
        </button>
        <p className="iw-hint">
          See <code>scripts/shopify-instagram-row-custom-liquid.liquid</code> for full section markup.
        </p>
      </section>

      <style jsx>{`
        .iw-page {
          max-width: 1100px;
          margin: 0 auto;
          padding: 12px 12px 40px;
          color: #f8fafc;
        }
        .iw-loading {
          padding: 24px;
        }
        .iw-note {
          color: rgba(226, 232, 240, 0.88);
          line-height: 1.5;
          font-size: 0.92rem;
          margin: 0 0 16px;
        }
        .iw-panel {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 0;
          padding: 16px;
          margin-bottom: 14px;
        }
        .iw-panel h2 {
          margin: 0 0 12px;
          font-size: 1rem;
        }
        .iw-grid-form {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 10px 14px;
          margin-bottom: 12px;
        }
        .iw-grid-form label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: rgba(148, 163, 184, 0.95);
        }
        .iw-grid-form input {
          padding: 8px 10px;
          border-radius: 0;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(15, 23, 42, 0.5);
          color: #f8fafc;
          font-size: 0.88rem;
        }
        .iw-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .iw-upload {
          position: relative;
          padding: 8px 14px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 0;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
        }
        .iw-upload input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .iw-dropbox {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .iw-dropbox input {
          min-width: 200px;
          padding: 8px 10px;
          border-radius: 0;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(15, 23, 42, 0.5);
          color: #f8fafc;
        }
        .iw-dropbox button,
        .iw-row button {
          padding: 8px 14px;
          border-radius: 0;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.06);
          color: #f8fafc;
          font-weight: 700;
          cursor: pointer;
        }
        .iw-primary {
          border-color: rgba(56, 189, 248, 0.45) !important;
          background: rgba(14, 165, 233, 0.2) !important;
        }
        .iw-err {
          color: #fecaca;
          margin: 8px 0 0;
        }
        .iw-ok {
          color: #bbf7d0;
          margin: 8px 0 0;
        }
        .iw-previews {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        @media (min-width: 900px) {
          .iw-previews {
            grid-template-columns: 1fr 1fr;
          }
        }
        .iw-code {
          margin: 10px 0;
          padding: 12px;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0;
          font-size: 0.78rem;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .iw-hint {
          font-size: 0.82rem;
          color: rgba(148, 163, 184, 0.95);
          margin-top: 10px;
        }
        .iw-hint code {
          font-size: 0.85em;
        }
      `}</style>
    </div>
  );
}
