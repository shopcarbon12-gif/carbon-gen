"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  STOREFRONT_INSTAGRAM_HANDLE,
  STOREFRONT_INSTAGRAM_URL,
} from "@/lib/instagram-feed";
import {
  normalizeInstagramAtLabel,
  normalizeWebUrlForStorage,
} from "@/lib/instagram-hero-text-normalize";
import type { InstagramSectionStoredConfig } from "@/lib/instagramSectionConfigRepository";
import { INSTAGRAM_HERO_HEIGHT, INSTAGRAM_HERO_WIDTH } from "@/lib/instagram-widget-constants";
import styles from "./elfsight-sources-bar.module.css";

type ModalKey = "account" | "add" | "filters" | "hero" | "sorting" | null;

function dispatchInstagramSectionConfigUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("instagram-section-config-updated"));
}

async function persistInstagramSectionPartial(
  partial: Partial<InstagramSectionStoredConfig>,
): Promise<void> {
  const putRes = await fetch("/api/storefront/instagram-section?scope=default", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: partial }),
  });
  const putData = (await putRes.json()) as { ok?: boolean; error?: string };
  if (!putRes.ok || !putData?.ok) {
    throw new Error(putData?.error || "Failed to save");
  }
  dispatchInstagramSectionConfigUpdated();
}

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
  const heroFileInputRef = useRef<HTMLInputElement>(null);
  const heroOnlineInputRef = useRef<HTMLInputElement>(null);
  const prevOpenRef = useRef<ModalKey | null>(null);

  const defaultHeroLinkText = `@${STOREFRONT_INSTAGRAM_HANDLE}`;
  const defaultHeroLinkHref = STOREFRONT_INSTAGRAM_URL;

  const [heroDraft, setHeroDraft] = useState({
    heroImageUrl: "",
    heroLinkText: defaultHeroLinkText,
    heroLinkHref: defaultHeroLinkHref,
    heroAlt: "",
  });
  const [heroOnlineUrl, setHeroOnlineUrl] = useState("");
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroError, setHeroError] = useState<string | null>(null);
  const [heroStatus, setHeroStatus] = useState<string | null>(null);

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

  useEffect(() => {
    if (open !== "hero") return;
    setHeroError(null);
    setHeroStatus(null);
    setHeroOnlineUrl("");
    let cancelled = false;
    void (async () => {
      setHeroLoading(true);
      try {
        const res = await fetch("/api/storefront/instagram-section?scope=default", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          config?: InstagramSectionStoredConfig;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Failed to load hero settings");
        }
        const c = data.config || {};
        const linkHrefRaw = (c.heroLinkHref || "").trim() || STOREFRONT_INSTAGRAM_URL;
        const linkTextRaw =
          (c.heroLinkText || "").trim() || `@${STOREFRONT_INSTAGRAM_HANDLE}`;
        setHeroDraft({
          heroImageUrl: (c.heroImageUrl || "").trim(),
          heroLinkText: normalizeInstagramAtLabel(linkTextRaw),
          heroLinkHref: normalizeWebUrlForStorage(linkHrefRaw),
          heroAlt: (c.heroAlt || "").trim(),
        });
      } catch (e: unknown) {
        if (!cancelled) {
          setHeroError(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) setHeroLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
  const isHeroModal = open === "hero";

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

  const onHeroFile = async (file: File | null) => {
    if (!file) return;
    setHeroBusy(true);
    setHeroError(null);
    setHeroStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/storefront/instagram-section/hero-upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Upload failed");
      const url = String(data.url || "").trim();
      if (!url) throw new Error("No URL returned");
      await persistInstagramSectionPartial({ heroImageUrl: url });
      setHeroDraft((d) => ({ ...d, heroImageUrl: url }));
      setHeroStatus("Uploaded and saved. Image was resized for Shopify (2000 x 1200).");
    } catch (e: unknown) {
      setHeroError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setHeroBusy(false);
      if (heroFileInputRef.current) heroFileInputRef.current.value = "";
    }
  };

  const onHeroApplyOnlineUrl = async () => {
    const raw = (
      heroOnlineUrl.trim() ||
      heroOnlineInputRef.current?.value?.trim() ||
      ""
    ).trim();
    const httpsMatch = raw.match(/^https:\/\/(.*)$/i);
    const u = normalizeWebUrlForStorage(httpsMatch ? `https://${httpsMatch[1]}` : raw);
    if (!u) {
      setHeroError("Enter an https image or video URL (Shopify-ready CDN).");
      return;
    }
    setHeroBusy(true);
    setHeroError(null);
    setHeroStatus(null);
    try {
      await persistInstagramSectionPartial({ heroImageUrl: u });
      setHeroDraft((d) => ({ ...d, heroImageUrl: u }));
      setHeroOnlineUrl("");
      setHeroStatus("Online URL saved. Use Shopify Files or a stable https URL for production.");
    } catch (e: unknown) {
      setHeroError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setHeroBusy(false);
    }
  };

  const onHeroSaveLinkFields = async () => {
    setHeroBusy(true);
    setHeroError(null);
    setHeroStatus(null);
    try {
      const linkText = normalizeInstagramAtLabel(
        heroDraft.heroLinkText.trim() || defaultHeroLinkText,
      );
      const linkHref = normalizeWebUrlForStorage(
        heroDraft.heroLinkHref.trim() || defaultHeroLinkHref,
      );
      await persistInstagramSectionPartial({
        heroLinkText: linkText,
        heroLinkHref: linkHref,
        heroAlt: heroDraft.heroAlt.trim(),
      });
      setHeroDraft((d) => ({ ...d, heroLinkText: linkText, heroLinkHref: linkHref }));
      setHeroStatus("Link label, URL, and alt text saved.");
    } catch (e: unknown) {
      setHeroError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setHeroBusy(false);
    }
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
          className={[styles.dialog, isHeroModal && styles.dialogHero].filter(Boolean).join(" ")}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {isDrill ? (
            <>
              <div className={styles.drillHead}>
                <button type="button" className={styles.backBtn} onClick={handleBack}>
                  <span aria-hidden>{"\u2039"}</span> Back
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
                  {"\u00d7"}
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
                          {"\u00b7\u00b7\u00b7"}
                        </button>
                      </div>
                      <div className={styles.filterRow}>
                        <div className={styles.filterInputGhost} aria-hidden />
                        <button
                          type="button"
                          className={styles.filterRowEllipsis}
                          aria-label="Row options"
                        >
                          {"\u00b7\u00b7\u00b7"}
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
          ) : isHeroModal ? (
            <>
              <div className={styles.dialogHead}>
                <span aria-hidden style={{ width: 34 }} />
                <h2 id={titleId} className={styles.dialogTitle}>
                  Hero picture
                </h2>
                <button type="button" className={styles.closeX} onClick={close} aria-label="Close">
                  {"\u00d7"}
                </button>
              </div>
              <div className={styles.heroModalBody}>
                <p className={styles.heroDimNote}>
                  Output is always cropped to{" "}
                  <strong>
                    {INSTAGRAM_HERO_WIDTH} x {INSTAGRAM_HERO_HEIGHT}
                  </strong>{" "}
                  (5:3) for Shopify.                   For best quality, use a source at least <strong>1200 x 720 px</strong>.
                </p>
                {heroLoading ? (
                  <p className={styles.heroDimNote}>Loading...</p>
                ) : null}
                {heroError ? <p className={styles.heroError}>{heroError}</p> : null}
                {heroStatus ? <p className={styles.heroStatus}>{heroStatus}</p> : null}

                <div className={styles.heroSection}>
                  <p className={styles.sectionLabel}>LINK & ACCESSIBILITY</p>
                  <label className={styles.heroFieldLabel} htmlFor="hero-modal-link-text">
                    Link label (center overlay on storefront)
                    <input
                      id="hero-modal-link-text"
                      className={styles.heroFieldInput}
                      value={heroDraft.heroLinkText}
                      onChange={(e) =>
                        setHeroDraft((d) => ({ ...d, heroLinkText: e.target.value }))
                      }
                      placeholder={defaultHeroLinkText}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className={styles.heroFieldLabel}>
                    Link URL (opens in new tab on Shopify)
                    <input
                      className={styles.heroFieldInput}
                      type="url"
                      value={heroDraft.heroLinkHref}
                      onChange={(e) =>
                        setHeroDraft((d) => ({ ...d, heroLinkHref: e.target.value }))
                      }
                      placeholder={defaultHeroLinkHref}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className={styles.heroFieldLabel}>
                    Hero alt text (accessibility)
                    <input
                      className={styles.heroFieldInput}
                      value={heroDraft.heroAlt}
                      onChange={(e) => setHeroDraft((d) => ({ ...d, heroAlt: e.target.value }))}
                      placeholder={`Instagram banner for ${defaultHeroLinkText}`}
                      autoComplete="off"
                      autoCapitalize="sentences"
                    />
                  </label>
                  <div className={styles.heroRowActions}>
                    <button
                      type="button"
                      className={styles.heroBtn}
                      disabled={heroBusy}
                      onClick={() => void onHeroSaveLinkFields()}
                    >
                      {"Save link & alt"}
                    </button>
                  </div>
                </div>

                <div className={styles.heroSection}>
                  <p className={styles.sectionLabel}>UPLOAD</p>
                  <p className={styles.heroDimNote}>
                    JPEG, PNG, WebP, GIF, or video (MP4, WebM, MOV). Max 25 MB images / 80 MB video.
                    Output is resized to {INSTAGRAM_HERO_WIDTH} x {INSTAGRAM_HERO_HEIGHT}.
                  </p>
                  <div className={styles.heroRowActions}>
                    <label className={styles.heroFileLabel}>
                      <input
                        ref={heroFileInputRef}
                        className={styles.heroFileInput}
                        type="file"
                        accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
                        disabled={heroBusy}
                        onChange={(e) => void onHeroFile(e.target.files?.[0] ?? null)}
                      />
                      Choose file
                    </label>
                  </div>
                </div>

                <div className={styles.heroSection}>
                  <p className={styles.sectionLabel}>ONLINE IMAGE OR VIDEO URL</p>
                  <input
                    ref={heroOnlineInputRef}
                    id="hero-picture-online-url"
                    className={styles.heroFieldInput}
                    value={heroOnlineUrl}
                    onChange={(e) => setHeroOnlineUrl(e.target.value)}
                    placeholder="https://cdn.shopify.com/..."
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Online hero image or video URL"
                  />
                  <div className={styles.heroRowActions}>
                    <button
                      type="button"
                      className={styles.heroBtn}
                      disabled={heroBusy}
                      onClick={() => void onHeroApplyOnlineUrl()}
                    >
                      Use this URL
                    </button>
                  </div>
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
                  {"\u00d7"}
                </button>
              </div>
              <div className={styles.dialogBody}>
                {open === "account" && (
                  <>
                    <p className={styles.modalHint}>
                      Storefront preview matches{" "}
                      <a href={STOREFRONT_INSTAGRAM_URL}>Instagram {atHandle}</a>. Wire your own Meta
                      app and tokens in{" "}
                      <Link href="/settings#integration-meta-instagram">
                        Settings → Meta / Instagram integration
                      </Link>
                      . Create or open apps at{" "}
                      <a
                        href="https://developers.facebook.com/apps/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Meta for Developers
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
          className={`${styles.trigger} ${styles.triggerHeroPicture} ${open === "hero" ? styles.triggerActive : ""}`}
          onClick={() => setOpen((k) => (k === "hero" ? null : "hero"))}
        >
          Hero picture
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
