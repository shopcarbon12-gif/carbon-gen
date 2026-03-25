"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { PublishChangesButton } from "./PublishChangesButton";
import styles from "./editor-toolbar.module.css";

const INSTAGRAM_WIDGET_ROOT = "/studio/instagram-widget";
const ELFSIGHT_WIDGET_ID = "d881cb77-4507-46ba-aa42-ae82cdabf435";

const TABS = [
  { id: "sources", label: "Sources" },
  { id: "layout", label: "Layout" },
  { id: "style", label: "Style" },
  { id: "settings", label: "Settings" },
  { id: "embed", label: "Embed" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function InstagramWidgetEditorToolbar() {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState<TabId | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const onPublish = useCallback(() => {
    router.push(`${INSTAGRAM_WIDGET_ROOT}/layout`);
  }, [router]);

  const modalContent = (() => {
    switch (open) {
      case "sources":
        return (
          <>
            <p>
              Storefront feed uses the Elfsight embed on{" "}
              <a href="https://www.shopcarbon.com" target="_blank" rel="noreferrer">
                shopcarbon.com
              </a>
              . To switch this app to your own Instagram data, connect Meta in Settings (server env:
              <code> META_INSTAGRAM_BUSINESS_ACCOUNT_ID</code>, <code>META_PAGE_ACCESS_TOKEN</code>
              ).
            </p>
            <p>
              <a href="/settings#integration-meta-instagram">Open Meta / Instagram in Settings →</a>
            </p>
          </>
        );
      case "layout":
        return (
          <>
            <p>
              Live layout matches the theme: 50/50 hero and feed column, 2×3 visible tiles with
              horizontal scroll (see <code>scripts/shopify-instagram-row-custom-liquid.liquid</code>
              ).
            </p>
            <ul className={styles.modalList}>
              <li>Grid columns and row height track the storefront banner row.</li>
              <li>Scroll arrows step one column; overflow shows more posts.</li>
            </ul>
          </>
        );
      case "style":
        return (
          <>
            <p>
              Storefront styling is controlled in Shopify theme CSS and the Custom Liquid section.
              Profile row, Follow button (#0095f6), and tile gaps mirror the live site.
            </p>
            <p>Edit fonts and colors in the theme; this preview uses the same spacing tokens.</p>
          </>
        );
      case "settings":
        return (
          <>
            <p>
              Elfsight widget id (storefront): <code>{ELFSIGHT_WIDGET_ID}</code>
            </p>
            <p>
              Dashboard (login required):{" "}
              <a
                href={`https://dash.elfsight.com/widget/${ELFSIGHT_WIDGET_ID}`}
                target="_blank"
                rel="noreferrer"
              >
                dash.elfsight.com
              </a>
            </p>
            <p>Lazy attribute on the embed: <code>data-elfsight-app-lazy</code> in theme liquid.</p>
          </>
        );
      case "embed":
        return (
          <>
            <p>
              Production markup lives in the repo file{" "}
              <code>scripts/shopify-instagram-row-custom-liquid.liquid</code> — paste into the
              homepage Custom Liquid section in Shopify.
            </p>
            <p>
              Script: <code>https://elfsightcdn.com/platform.js</code> (async). App container:{" "}
              <code>elfsight-app-d881cb77-4507-46ba-aa42-ae82cdabf435</code> +{" "}
              <code>data-elfsight-app-lazy</code>.
            </p>
          </>
        );
      default:
        return null;
    }
  })();

  const modal =
    mounted &&
    open &&
    createPortal(
      <div
        className={styles.modalRoot}
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          className={styles.modalPanel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className={styles.modalHead}>
            <h2 id={titleId} className={styles.modalTitle}>
              {TABS.find((t) => t.id === open)?.label ?? "Panel"}
            </h2>
            <button type="button" className={styles.closeBtn} onClick={close} aria-label="Close">
              ×
            </button>
          </div>
          <div className={styles.modalBody}>{modalContent}</div>
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabsRow} role="tablist" aria-label="Instagram widget editor">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={open === t.id}
              className={`${styles.tab} ${open === t.id ? styles.tabActive : ""}`}
              onClick={() => setOpen((prev) => (prev === t.id ? null : t.id))}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <PublishChangesButton onClick={onPublish} />
        </div>
      </div>
      {modal}
    </>
  );
}
