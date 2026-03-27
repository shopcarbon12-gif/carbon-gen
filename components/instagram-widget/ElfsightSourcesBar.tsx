"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  STOREFRONT_INSTAGRAM_HANDLE,
  STOREFRONT_INSTAGRAM_URL,
} from "@/lib/instagram-feed";
import styles from "./elfsight-sources-bar.module.css";

type ModalKey = "account" | "add" | "filters" | "sorting" | null;

function normalizeInstagramQuery(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  try {
    if (s.includes("instagram.com")) {
      const u = new URL(s.startsWith("http") ? s : `https://${s}`);
      const parts = u.pathname.split("/").filter(Boolean);
      s = parts[0] ?? s;
    }
  } catch {
    /* keep s */
  }
  s = s.replace(/^@+/, "");
  s = s.replace(/^#+/, "");
  return s.toLowerCase();
}

export function ElfsightSourcesBar() {
  const [open, setOpen] = useState<ModalKey>(null);
  const [sortMode, setSortMode] = useState<"publication" | "sourceList">("publication");
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const sortingGroupId = useId();
  const addSourceTypeId = useId();

  const [addSourceType, setAddSourceType] = useState<"account" | "hashtag">("account");
  const [addQuery, setAddQuery] = useState("");
  const [addSearchDone, setAddSearchDone] = useState(false);
  const [addSelectedHandle, setAddSelectedHandle] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef<ModalKey | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open === "add" && prev !== "add") {
      setAddSourceType("account");
      setAddQuery("");
      setAddSearchDone(false);
      setAddSelectedHandle(null);
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(null);
  }, []);

  const handleBack = useCallback(() => {
    close();
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (open === "filters" || open === "sorting") handleBack();
        else close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, handleBack]);

  const handleOverlayPointer = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  };

  const openDrill = (which: "filters" | "sorting") => {
    setOpen(which);
  };

  const atHandle = `@${STOREFRONT_INSTAGRAM_HANDLE}`;

  const isDrill = open === "filters" || open === "sorting";
  const isAddModal = open === "add";

  const normalizedSearch = normalizeInstagramQuery(addQuery);
  const canDone =
    addSearchDone && normalizedSearch.length > 0 && addSelectedHandle === normalizedSearch;

  const handleAddSearch = () => {
    const raw =
      addQuery.trim() || addInputRef.current?.value?.trim() || "";
    if (!raw) return;
    const n = normalizeInstagramQuery(raw);
    if (!n) return;
    if (addInputRef.current && addInputRef.current.value !== addQuery) {
      setAddQuery(addInputRef.current.value);
    }
    setAddSearchDone(true);
    setAddSelectedHandle(null);
  };

  const handleAddDone = () => {
    if (!canDone) return;
    close();
  };

  const modal =
    mounted &&
    open &&
    createPortal(
      <div
        className={styles.overlay}
        role="presentation"
        onClick={handleOverlayPointer}
      >
        <div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {isDrill ? (
            <>
              <div className={styles.drillHead}>
                <button type="button" className={styles.backBtn} onClick={handleBack}>
                  <span aria-hidden>‹</span> Back
                </button>
                <h2 id={titleId} className={styles.drillTitle}>
                  {open === "filters" ? "Filters" : "Sorting"}
                </h2>
                <button
                  type="button"
                  className={styles.closeX}
                  onClick={close}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className={styles.drillBody}>
                {open === "filters" && (
                  <>
                    <p className={styles.sectionLabel}>
                      SHOW POSTS CONTAINING THESE WORDS OR HASHTAGS
                    </p>
                    <div className={styles.filterCard}>
                      <div className={styles.filterRow}>
                        <div className={styles.filterInputGhost} aria-hidden />
                        <button
                          type="button"
                          className={styles.filterRowEllipsis}
                          aria-label="Row options"
                        >
                          ···
                        </button>
                      </div>
                      <div className={styles.filterRow}>
                        <div className={styles.filterInputGhost} aria-hidden />
                        <button
                          type="button"
                          className={styles.filterRowEllipsis}
                          aria-label="Row options"
                        >
                          ···
                        </button>
                      </div>
                      <button type="button" className={styles.addFilterBtn}>
                        <span aria-hidden>+</span> Add Filter
                      </button>
                    </div>
                    <p className={styles.sectionLabel}>
                      HIDE POSTS CONTAINING THESE WORDS OR HASHTAGS
                    </p>
                    <button type="button" className={styles.addFilterBlock}>
                      <span aria-hidden>+</span> Add Filter
                    </button>
                    <div className={styles.displayLimitCard}>
                      <span className={styles.displayLimitLabel}>
                        Total Number of Posts to Display
                      </span>
                      <span className={styles.displayLimitValue}>0</span>
                    </div>
                    <p className={styles.helpText}>
                      Set the maximum number of posts to display in the feed. If set to 0, all
                      available posts will be displayed.
                    </p>
                  </>
                )}
                {open === "sorting" && (
                  <>
                    <div
                      className={styles.sortCard}
                      role="radiogroup"
                      aria-labelledby={sortingGroupId}
                    >
                      <p id={sortingGroupId} className={styles.srOnly}>
                        Sort order
                      </p>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sortMode === "publication"}
                        className={styles.radioRow}
                        onClick={() => setSortMode("publication")}
                      >
                        <span
                          className={`${styles.radioUi} ${sortMode === "publication" ? styles.radioUiOn : ""}`}
                          aria-hidden
                        />
                        <span className={styles.radioText}>Publication date</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sortMode === "sourceList"}
                        className={styles.radioRow}
                        onClick={() => setSortMode("sourceList")}
                      >
                        <span
                          className={`${styles.radioUi} ${sortMode === "sourceList" ? styles.radioUiOn : ""}`}
                          aria-hidden
                        />
                        <span className={styles.radioText}>Source list position</span>
                      </button>
                    </div>
                    <p className={styles.sortExplain}>
                      Set the display order for Instagram posts in your feed. Publication date
                      displays them chronologically in the order they were published on Instagram.
                      Source list position displays the posts according to the order the sources were
                      added in.
                    </p>
                  </>
                )}
              </div>
            </>
          ) : isAddModal ? (
            <>
              <div className={styles.addIgHead}>
                <button type="button" className={styles.addIgCancel} onClick={close}>
                  Cancel
                </button>
                <h2 id={titleId} className={styles.addIgTitle}>
                  Add Instagram Source
                </h2>
                <button
                  type="button"
                  className={styles.addIgDone}
                  disabled={!canDone}
                  onClick={handleAddDone}
                >
                  Done
                </button>
              </div>
              <div className={styles.addIgBody}>
                <div className={styles.addIgCard}>
                  <p id={addSourceTypeId} className={styles.addIgFieldLabel}>
                    Source Type
                  </p>
                  <div
                    className={styles.addIgRadioList}
                    role="radiogroup"
                    aria-labelledby={addSourceTypeId}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={addSourceType === "account"}
                      className={styles.addIgRadioRow}
                      onClick={() => setAddSourceType("account")}
                    >
                      <span
                        className={`${styles.igRadioRing} ${addSourceType === "account" ? styles.igRadioRingOn : ""}`}
                        aria-hidden
                      >
                        {addSourceType === "account" ? (
                          <span className={styles.igRadioDot} />
                        ) : null}
                      </span>
                      <span className={styles.addIgRadioLabel}>Account</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={addSourceType === "hashtag"}
                      className={styles.addIgRadioRow}
                      onClick={() => setAddSourceType("hashtag")}
                    >
                      <span
                        className={`${styles.igRadioRing} ${addSourceType === "hashtag" ? styles.igRadioRingOn : ""}`}
                        aria-hidden
                      >
                        {addSourceType === "hashtag" ? (
                          <span className={styles.igRadioDot} />
                        ) : null}
                      </span>
                      <span className={styles.addIgRadioLabel}>Hashtag</span>
                    </button>
                  </div>
                  <div className={styles.addIgDivider} />
                  <div className={styles.addIgSearchRow}>
                    <input
                      ref={addInputRef}
                      type="text"
                      className={styles.addIgInput}
                      placeholder="Enter Username or URL..."
                      value={addQuery}
                      onChange={(e) => {
                        setAddQuery(e.target.value);
                        setAddSearchDone(false);
                        setAddSelectedHandle(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddSearch();
                        }
                      }}
                      autoComplete="off"
                      aria-label="Username or URL"
                    />
                    <button type="button" className={styles.addIgSearchBtn} onClick={handleAddSearch}>
                      Search
                    </button>
                  </div>
                  {addSearchDone && normalizedSearch ? (
                    <div className={styles.addIgResults}>
                      <button
                        type="button"
                        className={`${styles.addIgResultRow} ${addSelectedHandle === normalizedSearch ? styles.addIgResultRowSelected : ""}`}
                        onClick={() => setAddSelectedHandle(normalizedSearch)}
                      >
                        {addSourceType === "hashtag" ? `#${normalizedSearch}` : `@${normalizedSearch}`}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.dialogHead}>
                <span aria-hidden style={{ width: 34 }} />
                <h2 id={titleId} className={styles.dialogTitle}>
                  {open === "account" && atHandle}
                </h2>
                <button type="button" className={styles.closeX} onClick={close} aria-label="Close">
                  ×
                </button>
              </div>
              <div className={styles.dialogBody}>
                {open === "account" && (
                  <>
                    <p className={styles.modalHint}>
                      Storefront source matches{" "}
                      <a href={STOREFRONT_INSTAGRAM_URL}>Instagram {atHandle}</a>. Manage the real
                      widget in{" "}
                      <a
                        href="https://dash.elfsight.com/widget/d881cb77-4507-46ba-aa42-ae82cdabf435"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Elfsight
                      </a>
                      .
                    </p>
                    <div className={styles.card}>
                      <div className={styles.sourceRow}>
                        <span className={styles.sourceLabel}>Connected</span>
                        <span className={styles.sourceLabel}>{atHandle}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <div className={styles.bar} role="toolbar" aria-label="Instagram feed sources">
        <button
          type="button"
          className={`${styles.trigger} ${open === "account" ? styles.triggerActive : ""}`}
          onClick={() => setOpen((k) => (k === "account" ? null : "account"))}
        >
          {atHandle}
        </button>
        <button
          type="button"
          className={`${styles.trigger} ${styles.triggerAdd}`}
          onClick={() => setOpen((k) => (k === "add" ? null : "add"))}
        >
          <span aria-hidden>+</span> Add Source
        </button>
        <button
          type="button"
          className={`${styles.trigger} ${open === "filters" ? styles.triggerActive : ""}`}
          onClick={() => {
            if (open === "filters") close();
            else openDrill("filters");
          }}
        >
          Filters <span className={styles.chev}>&gt;</span>
        </button>
        <button
          type="button"
          className={`${styles.trigger} ${open === "sorting" ? styles.triggerActive : ""}`}
          onClick={() => {
            if (open === "sorting") close();
            else openDrill("sorting");
          }}
        >
          Sorting <span className={styles.chev}>&gt;</span>
        </button>
      </div>
      {modal}
    </>
  );
}
