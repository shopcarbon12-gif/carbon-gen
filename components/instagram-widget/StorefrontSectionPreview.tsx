"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { InstagramSectionStoredConfig } from "@/lib/instagramSectionConfigRepository";
import {
  STOREFRONT_INSTAGRAM_AVATAR_SRC,
  STOREFRONT_INSTAGRAM_DISPLAY_NAME,
  STOREFRONT_INSTAGRAM_FOLLOWERS_COUNT_LABEL,
  STOREFRONT_INSTAGRAM_HANDLE,
  STOREFRONT_INSTAGRAM_HERO_IMAGE,
  STOREFRONT_INSTAGRAM_POSTS_COUNT_LABEL,
  STOREFRONT_INSTAGRAM_URL,
  STOREFRONT_PREVIEW_TILE_OBJECT_POSITIONS,
  type InstagramMediaItem,
  type InstagramMediaType,
} from "@/lib/instagram-feed";
import { isHeroVideoUrl } from "@/lib/instagram-hero-media";
import { INSTAGRAM_FEED_SLIDER_DEFAULTS } from "@/lib/instagram-widget-constants";
import { ElfsightSourcesBar } from "./ElfsightSourcesBar";
import { useInstagramStudioPreview } from "./instagram-studio-mobile-preview-context";
import styles from "./storefront-section-preview.module.css";

type TileCell =
  | { kind: "meta"; item: InstagramMediaItem }
  | { kind: "placeholder"; objectPosition: string };

type PostPopupSlide = {
  src: string;
  objectPosition?: string;
  alt: string;
  permalink: string;
  caption?: string;
  mediaType?: InstagramMediaType;
  timestamp?: string;
  isPlaceholder: boolean;
};

type FeedSliderConfig = {
  feedSliderArrowsEnabled: boolean;
  feedSliderDragEnabled: boolean;
  feedSliderAnimationSec: number;
  feedSliderAutoplaySec: number;
};

function mergeFeedSlider(raw: InstagramSectionStoredConfig | null | undefined): FeedSliderConfig {
  return {
    feedSliderArrowsEnabled:
      raw?.feedSliderArrowsEnabled ?? INSTAGRAM_FEED_SLIDER_DEFAULTS.feedSliderArrowsEnabled,
    feedSliderDragEnabled:
      raw?.feedSliderDragEnabled ?? INSTAGRAM_FEED_SLIDER_DEFAULTS.feedSliderDragEnabled,
    feedSliderAnimationSec:
      raw?.feedSliderAnimationSec ?? INSTAGRAM_FEED_SLIDER_DEFAULTS.feedSliderAnimationSec,
    feedSliderAutoplaySec:
      raw?.feedSliderAutoplaySec ?? INSTAGRAM_FEED_SLIDER_DEFAULTS.feedSliderAutoplaySec,
  };
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/** Animate horizontal scroll; returns cancel fn. */
function runScrollLeftAnimation(
  el: HTMLElement,
  targetLeft: number,
  durationMs: number,
  onComplete?: () => void,
): () => void {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const clamped = Math.max(0, Math.min(max, targetLeft));
  const from = el.scrollLeft;
  const delta = clamped - from;
  if (durationMs <= 0 || Math.abs(delta) < 0.5) {
    el.scrollLeft = clamped;
    onComplete?.();
    return () => {};
  }
  const t0 = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const u = Math.min(1, (now - t0) / durationMs);
    el.scrollLeft = from + delta * easeOutCubic(u);
    if (u < 1) raf = requestAnimationFrame(tick);
    else onComplete?.();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

function getColumnStepPx(el: HTMLElement): number {
  const firstCol = el.querySelector<HTMLElement>("[data-ig-col]");
  const strip = el.querySelector<HTMLElement>("[data-ig-strip]");
  if (!firstCol) return 0;
  const gapRaw = strip ? getComputedStyle(strip).gap : "0px";
  const gapPx = parseFloat(gapRaw) || 0;
  return firstCol.offsetWidth + gapPx;
}

function buildPlaceholderColumns(): TileCell[][] {
  return chunkPairs(STOREFRONT_PREVIEW_TILE_OBJECT_POSITIONS).map((pair) =>
    pair.map((objectPosition) => ({ kind: "placeholder" as const, objectPosition })),
  );
}

function chunkItemsToColumns(items: InstagramMediaItem[]): TileCell[][] {
  const cols: TileCell[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    cols.push(items.slice(i, i + 2).map((item) => ({ kind: "meta" as const, item })));
  }
  return cols;
}

/** The account header the studio and the storefront both show. */
type LiveProfile = {
  username?: string;
  name?: string;
  avatarUrl?: string;
  followersCount?: number;
  mediaCount?: number;
};

/**
 * 3658 → "3.7K". Instagram abbreviates its own counts, and the storefront widget
 * uses this identical rule — the two headers have to read the same or the studio
 * stops being a preview of what shoppers see.
 */
function compactCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

/** Avoid global `next.config` allowlist for Shopify CDN URLs used only in this preview. */
function nextImageUnoptimized(src: string) {
  return /^https?:\/\//i.test(src);
}

/** White outline camera (storefront Follow control). */
function InstagramGlyph() {
  return (
    <svg
      className={styles.followGlyph}
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="3.25" />
      <circle cx="17.25" cy="6.75" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Filled carets — shape of hit target is `.scrollBtn` (semicircle), not these paths. */
function ElfsightSliderArrowPrev() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      aria-hidden
      className={styles.scrollChevron}
    >
      <path fill="currentColor" d="M11 3.2L4.8 8 11 12.8 11 3.2z" />
    </svg>
  );
}

function ElfsightSliderArrowNext() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      aria-hidden
      className={styles.scrollChevron}
    >
      <path fill="currentColor" d="M5 3.2L11.2 8 5 12.8 5 3.2z" />
    </svg>
  );
}

/**
 * Top-right type chip — the stacked-squares mark for a carousel, a play mark for
 * a video, and nothing at all for a single image. Same rule and same glyphs as
 * the storefront widget serves, so a tile is marked identically in both places.
 */
function TileTypeBadge({ mediaType }: { mediaType: InstagramMediaType }) {
  if (mediaType === "IMAGE") return null;
  if (mediaType === "VIDEO") {
    return (
      <span className={styles.tileBadge} aria-hidden>
        <svg className={styles.tileBadgeSvg} viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    );
  }
  return (
    <span className={styles.tileBadge} aria-hidden>
      <svg className={styles.tileBadgeSvg} viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M19 3H9a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM5 7H3v12a2 2 0 0 0 2 2h12v-2H5V7z" />
      </svg>
    </span>
  );
}

function metaTileHoverCaption(item: InstagramMediaItem): string {
  const t = item.caption?.trim();
  if (t) return t;
  return "View post on Instagram.";
}

function placeholderTileHoverCaption(): string {
  return `Discover more on @${STOREFRONT_INSTAGRAM_HANDLE}.`;
}

function chunkPairs<T>(arr: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

function buildSlidesAndIndexedColumns(columns: TileCell[][]) {
  const slides: PostPopupSlide[] = [];
  const indexedColumns = columns.map((col) =>
    col.map((cell) => {
      if (cell.kind === "meta") {
        const { item } = cell;
        const alt =
          item.caption && item.caption.length > 0
            ? item.caption.slice(0, 120)
            : `Instagram post ${item.id}`;
        slides.push({
          src: item.mediaUrl,
          alt,
          permalink: item.permalink,
          caption: item.caption,
          mediaType: item.mediaType,
          timestamp: item.timestamp,
          isPlaceholder: false,
        });
      } else {
        slides.push({
          src: STOREFRONT_INSTAGRAM_HERO_IMAGE,
          objectPosition: cell.objectPosition,
          alt: `Open @${STOREFRONT_INSTAGRAM_HANDLE} on Instagram (preview tile)`,
          permalink: STOREFRONT_INSTAGRAM_URL,
          caption: `${placeholderTileHoverCaption()}\n\nStudio preview — connect Meta in Settings for live captions and dates.`,
          isPlaceholder: true,
        });
      }
      return { cell, index: slides.length - 1 };
    }),
  );
  return { slides, indexedColumns };
}

/** Black-outline camera for popup header. */
function PopupInstagramGlyph() {
  return (
    <svg
      className={styles.popIgGlyph}
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="3.25" />
      <circle cx="17.25" cy="6.75" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function formatInstagramPopupDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays < 0) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function PopShareGlyph() {
  return (
    <svg
      className={styles.popShareGlyph}
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}

function PopupCaptionRich({ text }: { text: string }) {
  const re = /#[A-Za-z0-9_]+|https?:\/\/[^\s]+/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`t-${last}`}>{text.slice(last, m.index)}</span>);
    }
    const piece = m[0];
    if (piece.startsWith("#")) {
      const tag = piece.slice(1);
      nodes.push(
        <a
          key={`h-${m.index}`}
          className={styles.popHashtag}
          href={`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`}
          target="_blank"
          rel="noreferrer"
        >
          {piece}
        </a>,
      );
    } else {
      nodes.push(
        <a
          key={`u-${m.index}`}
          className={styles.popUrlInCaption}
          href={piece}
          target="_blank"
          rel="noreferrer"
        >
          {piece}
        </a>,
      );
    }
    last = m.index + piece.length;
  }
  if (last < text.length) {
    nodes.push(<span key="t-end">{text.slice(last)}</span>);
  }
  return <>{nodes}</>;
}

export function StorefrontSectionPreview() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const popupPostRefs = useRef<(HTMLElement | null)[]>([]);
  const lastArrowsRef = useRef({ left: false, right: false });
  const [canGoLeft, setCanGoLeft] = useState(false);
  const [canGoRight, setCanGoRight] = useState(false);
  const [columns, setColumns] = useState<TileCell[][]>(() => buildPlaceholderColumns());
  const [feedHeroUrl, setFeedHeroUrl] = useState("");
  const [liveProfile, setLiveProfile] = useState<LiveProfile | null>(null);
  const [sectionConfig, setSectionConfig] = useState<InstagramSectionStoredConfig | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupIndex, setPopupIndex] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  const [shareCopiedIndex, setShareCopiedIndex] = useState<number | null>(null);
  const [feedSlider, setFeedSlider] = useState<FeedSliderConfig>(() => mergeFeedSlider(undefined));
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const scrollAnimCancelRef = useRef<(() => void) | null>(null);
  const suppressTileClickRef = useRef(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    dragging: boolean;
  } | null>(null);

  const { mobilePreview: igMobilePreview, toolbarFreezeRect } = useInstagramStudioPreview();

  const { slides, indexedColumns } = useMemo(
    () => buildSlidesAndIndexedColumns(columns),
    [columns],
  );

  const displayHeroSrc = useMemo(() => {
    const saved = (sectionConfig?.heroImageUrl || "").trim();
    if (saved) return saved;
    const feed = feedHeroUrl.trim();
    if (feed) return feed;
    return STOREFRONT_INSTAGRAM_HERO_IMAGE;
  }, [sectionConfig?.heroImageUrl, feedHeroUrl]);

  const heroOverlayHref =
    (sectionConfig?.heroLinkHref || "").trim() || STOREFRONT_INSTAGRAM_URL;
  const heroOverlayText =
    (sectionConfig?.heroLinkText || "").trim() || `@${STOREFRONT_INSTAGRAM_HANDLE}`;
  const heroImageAlt =
    (sectionConfig?.heroAlt || "").trim() ||
    `Instagram banner for @${STOREFRONT_INSTAGRAM_HANDLE}`;
  const heroLinkFontPx = sectionConfig?.heroLinkFontSizeDesktopPx ?? 28;
  const heroLinkFontWeight = sectionConfig?.heroLinkFontWeight ?? 500;
  const heroLinkColor = (sectionConfig?.heroLinkColor || "").trim() || "#ffffff";

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    return () => scrollAnimCancelRef.current?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSection = async () => {
      try {
        const res = await fetch("/api/storefront/instagram-section?scope=default", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json()) as { ok?: boolean; config?: InstagramSectionStoredConfig };
        if (cancelled || !data?.ok) return;
        setSectionConfig(data.config || null);
        setFeedSlider(mergeFeedSlider(data.config));
      } catch {
        /* keep defaults */
      }
    };
    void loadSection();
    const onUpdated = () => void loadSection();
    window.addEventListener("instagram-section-config-updated", onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("instagram-section-config-updated", onUpdated);
    };
  }, []);

  useEffect(() => {
    if (!popupOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [popupOpen]);

  useEffect(() => {
    if (!popupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopupOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popupOpen]);

  const openPopupAt = useCallback((index: number) => {
    setPopupIndex(index);
    setPopupOpen(true);
  }, []);

  const tryOpenPopupAt = useCallback(
    (index: number) => {
      if (suppressTileClickRef.current) return;
      openPopupAt(index);
    },
    [openPopupAt],
  );

  const closePopup = useCallback(() => setPopupOpen(false), []);

  useEffect(() => {
    if (!popupOpen || slides.length === 0) return;
    setPopupIndex((i) => Math.min(i, slides.length - 1));
  }, [slides.length, popupOpen]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/studio/instagram-feed", {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          source?: string;
          items?: InstagramMediaItem[];
          profile?: LiveProfile | null;
          feedStatus?: string;
          missingEnv?: string[];
          graphError?: string;
          mediaCount?: number;
        };

        if (cancelled) return;

        /* Header counts follow the account even when the tiles fall back to
           placeholders, so a partial Graph response still shows real numbers. */
        setLiveProfile(json?.profile ?? null);

        if (!res.ok) {
          setFeedHeroUrl("");
          setColumns(buildPlaceholderColumns());
          return;
        }

        if (!json?.ok) {
          setFeedHeroUrl("");
          setColumns(buildPlaceholderColumns());
          return;
        }

        if (json.source === "meta" && Array.isArray(json.items) && json.items.length >= 2) {
          setFeedHeroUrl(json.items[0].mediaUrl);
          setColumns(chunkItemsToColumns(json.items));
          return;
        }

        setFeedHeroUrl("");
        setColumns(buildPlaceholderColumns());
      } catch {
        if (!cancelled) {
          setFeedHeroUrl("");
          setColumns(buildPlaceholderColumns());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    const eps = 3;
    const nextLeft = scrollLeft > eps;
    const nextRight = maxScroll > eps && scrollLeft < maxScroll - eps;
    const last = lastArrowsRef.current;
    if (nextLeft !== last.left) {
      last.left = nextLeft;
      setCanGoLeft(nextLeft);
    }
    if (nextRight !== last.right) {
      last.right = nextRight;
      setCanGoRight(nextRight);
    }
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const strip = el.querySelector("[data-ig-strip]");

    let roRaf: number | null = null;
    const scheduleResizeArrows = () => {
      if (roRaf != null) return;
      roRaf = requestAnimationFrame(() => {
        roRaf = null;
        updateScrollArrows();
      });
    };

    let scrollRaf: number | null = null;
    const onScroll = () => {
      if (scrollRaf != null) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        updateScrollArrows();
      });
    };

    lastArrowsRef.current = { left: false, right: false };
    updateScrollArrows();
    const initRaf = requestAnimationFrame(() => updateScrollArrows());

    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(scheduleResizeArrows);
    ro.observe(el);
    if (strip) ro.observe(strip);

    return () => {
      cancelAnimationFrame(initRaf);
      if (roRaf != null) cancelAnimationFrame(roRaf);
      if (scrollRaf != null) cancelAnimationFrame(scrollRaf);
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [updateScrollArrows, columns.length]);

  const safePopupIndex =
    slides.length === 0 ? 0 : Math.min(popupIndex, slides.length - 1);

  useLayoutEffect(() => {
    if (!popupOpen || slides.length === 0) return;
    const idx = Math.min(popupIndex, slides.length - 1);
    requestAnimationFrame(() => {
      popupPostRefs.current[idx]?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [popupOpen, popupIndex, slides.length]);

  useEffect(() => {
    if (!popupOpen) setShareCopiedIndex(null);
  }, [popupOpen]);

  const onViewportPointerDownCapture = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!feedSlider.feedSliderDragEnabled || e.button !== 0) return;
      const el = scrollRef.current;
      if (!el) return;
      scrollAnimCancelRef.current?.();
      scrollAnimCancelRef.current = null;
      dragStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startScroll: el.scrollLeft,
        dragging: false,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [feedSlider.feedSliderDragEnabled],
  );

  const onViewportPointerMoveCapture = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = dragStateRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) {
      if (!d.dragging) {
        d.dragging = true;
        setIsPointerDragging(true);
      }
      e.preventDefault();
      el.scrollLeft = d.startScroll - dx;
    }
  }, []);

  const endViewportPointer = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragStateRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const el = scrollRef.current;
      dragStateRef.current = null;
      setIsPointerDragging(false);
      try {
        el?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (d.dragging) {
        suppressTileClickRef.current = true;
        window.setTimeout(() => {
          suppressTileClickRef.current = false;
        }, 120);
      }
      updateScrollArrows();
    },
    [updateScrollArrows],
  );

  useEffect(() => {
    const sec = feedSlider.feedSliderAutoplaySec;
    if (sec <= 0) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const el = scrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll < 3) return;
      const step = getColumnStepPx(el);
      if (step <= 0) return;
      scrollAnimCancelRef.current?.();
      const animMs = feedSlider.feedSliderAnimationSec * 1000;
      const next = el.scrollLeft >= maxScroll - 3 ? 0 : el.scrollLeft + step;
      scrollAnimCancelRef.current = runScrollLeftAnimation(el, next, animMs, () => {
        scrollAnimCancelRef.current = null;
        updateScrollArrows();
      });
    }, sec * 1000);
    return () => clearInterval(id);
  }, [
    feedSlider.feedSliderAutoplaySec,
    feedSlider.feedSliderAnimationSec,
    columns.length,
    updateScrollArrows,
  ]);

  const handleShareForSlide = useCallback(async (permalink: string, rowIndex: number) => {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url: permalink, title: "Instagram" });
        return;
      }
      await navigator.clipboard.writeText(permalink);
      setShareCopiedIndex(rowIndex);
      window.setTimeout(() => {
        setShareCopiedIndex((x) => (x === rowIndex ? null : x));
      }, 2200);
    } catch {
      /* user cancelled share or clipboard blocked */
    }
  }, []);

  const scrollByStep = useCallback(
    (dir: -1 | 1) => {
      const el = scrollRef.current;
      if (!el) return;
      const step = getColumnStepPx(el);
      if (step <= 0) return;
      scrollAnimCancelRef.current?.();
      const target = el.scrollLeft + dir * step;
      const animMs = feedSlider.feedSliderAnimationSec * 1000;
      scrollAnimCancelRef.current = runScrollLeftAnimation(el, target, animMs, () => {
        scrollAnimCancelRef.current = null;
        updateScrollArrows();
      });
    },
    [feedSlider.feedSliderAnimationSec, updateScrollArrows],
  );

  /* Live values where Instagram gave them, written defaults otherwise — the bar
     never shows a blank or a zero while the feed is still loading. */
  const profileName = liveProfile?.name?.trim() || STOREFRONT_INSTAGRAM_DISPLAY_NAME;
  const profileHandle = liveProfile?.username?.trim() || STOREFRONT_INSTAGRAM_HANDLE;
  const profileAvatar = liveProfile?.avatarUrl?.trim() || STOREFRONT_INSTAGRAM_AVATAR_SRC;
  const postsLabel =
    typeof liveProfile?.mediaCount === "number" && liveProfile.mediaCount > 0
      ? compactCount(liveProfile.mediaCount)
      : STOREFRONT_INSTAGRAM_POSTS_COUNT_LABEL;
  const followersLabel =
    typeof liveProfile?.followersCount === "number" && liveProfile.followersCount > 0
      ? compactCount(liveProfile.followersCount)
      : STOREFRONT_INSTAGRAM_FOLLOWERS_COUNT_LABEL;

  const profileBar = (
    <div className={styles.profileBar}>
      <div className={styles.profileBarInner}>
        <div className={styles.avatarCircle} aria-hidden>
          <Image
            src={profileAvatar}
            alt=""
            width={120}
            height={120}
            className={styles.avatarImg}
            unoptimized={nextImageUnoptimized(profileAvatar)}
          />
        </div>
        <div className={styles.profileText}>
          <div className={styles.profileName}>{profileName}</div>
          <div className={styles.profileHandle}>@{profileHandle}</div>
        </div>
        <div className={styles.statCluster}>
          <div className={`${styles.stat} ${styles.statPosts}`}>
            <span className={styles.statValue}>{postsLabel}</span>
            <span className={styles.statLabel}>Posts</span>
          </div>
          <div className={`${styles.stat} ${styles.statFollowers}`}>
            <span className={styles.statValue}>{followersLabel}</span>
            <span className={styles.statLabel}>Followers</span>
          </div>
        </div>
        <a
          className={styles.followBtn}
          href={STOREFRONT_INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <InstagramGlyph />
          Follow
        </a>
      </div>
    </div>
  );

  const popupPortal =
    portalReady &&
    popupOpen &&
    slides.length > 0 &&
    createPortal(
      <div
        className={styles.popOverlay}
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closePopup();
        }}
      >
        <button
          type="button"
          className={styles.popClose}
          onClick={closePopup}
          aria-label="Close"
        >
          ×
        </button>
        <div
          className={styles.popInner}
          role="dialog"
          aria-modal="true"
          aria-label="Instagram Feed popup"
          onClick={(e) => e.stopPropagation()}
        >
          {slides.map((slide, i) => (
            <article
              key={`${slide.permalink}-${i}`}
              ref={(el) => {
                popupPostRefs.current[i] = el;
              }}
              className={styles.popPost}
              data-ig-popup-post={i}
              aria-current={i === safePopupIndex ? "true" : undefined}
            >
              <div className={styles.popHead}>
                <a
                  className={styles.popUserLink}
                  href={STOREFRONT_INSTAGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {STOREFRONT_INSTAGRAM_HANDLE}
                </a>
                <div className={styles.popHeadActions}>
                  <a
                    className={styles.popFollow}
                    href={STOREFRONT_INSTAGRAM_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Follow
                  </a>
                  <a
                    className={styles.popSourceLink}
                    href={slide.permalink}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View on Instagram"
                  >
                    <PopupInstagramGlyph />
                  </a>
                </div>
              </div>
              <div className={styles.popImageWrap}>
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  className={styles.popImage}
                  sizes="(max-width: 720px) 100vw, 640px"
                  unoptimized={nextImageUnoptimized(slide.src)}
                  style={
                    slide.objectPosition ? { objectPosition: slide.objectPosition } : undefined
                  }
                  priority={i === safePopupIndex}
                />
              </div>
              <div className={styles.popPostBody}>
                <div className={styles.popMetaRow}>
                  <span className={styles.popMetaSpacer} aria-hidden />
                  <div className={styles.popShareCluster}>
                    <button
                      type="button"
                      className={styles.popShareBtn}
                      onClick={() => handleShareForSlide(slide.permalink, i)}
                    >
                      <PopShareGlyph />
                      <span>Share</span>
                    </button>
                    {shareCopiedIndex === i ? (
                      <span className={styles.popShareHint}>Link copied</span>
                    ) : null}
                  </div>
                </div>
                <div className={styles.popCaptionBlock}>
                  <a
                    className={styles.popCaptionUser}
                    href={slide.permalink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {STOREFRONT_INSTAGRAM_HANDLE}
                  </a>
                  {slide.caption?.trim() ? (
                    <div className={styles.popCaptionText}>
                      <PopupCaptionRich text={slide.caption.trim()} />
                    </div>
                  ) : (
                    <p className={styles.popCaptionFallback}>
                      {slide.isPlaceholder
                        ? "Studio preview tile — open Instagram for the full feed."
                        : "View this post on Instagram for the full caption."}
                    </p>
                  )}
                </div>
                <p className={styles.popDate}>
                  {slide.isPlaceholder
                    ? "Studio preview"
                    : formatInstagramPopupDate(slide.timestamp) || "Instagram"}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>,
      document.body,
    );

  /* Nudge fixed toolbar slightly up in mobile preview vs frozen desktop rect (layout delta). */
  const mobileToolbarTopOffsetPx = -20;

  const sourcesToolbarFixedStyle: CSSProperties | undefined =
    igMobilePreview && toolbarFreezeRect
      ? {
          position: "fixed",
          left: toolbarFreezeRect.left,
          top: toolbarFreezeRect.top + mobileToolbarTopOffsetPx,
          width: toolbarFreezeRect.width,
          height: toolbarFreezeRect.height,
          zIndex: 55,
          boxSizing: "border-box",
        }
      : igMobilePreview
        ? { position: "fixed", left: 24, bottom: 100, zIndex: 55 }
        : undefined;

  /* Keep sources toolbar in a stable React tree position (never portaled). Nested body portals
   * (toolbar remount + modal portal) caused removeChild null crashes when toggling mobile preview. */
  const sourcesToolbar = (
    <div
      className={styles.sourcesToolbarSlot}
      style={igMobilePreview ? sourcesToolbarFixedStyle : undefined}
      data-ig-sources-toolbar-measure=""
      aria-live="polite"
    >
      <ElfsightSourcesBar />
    </div>
  );

  return (
    <>
    <div className={styles.root}>
      {profileBar}

      <div className={styles.mediaGrid}>
        <div className={styles.heroCell}>
          <div className={styles.banner}>
            {isHeroVideoUrl(displayHeroSrc) ? (
              <video
                className={styles.bannerVideo}
                src={displayHeroSrc}
                width={2000}
                height={1200}
                muted
                playsInline
                loop
                autoPlay
                aria-label={heroImageAlt}
              />
            ) : (
              <Image
                src={displayHeroSrc}
                alt={heroImageAlt}
                width={2000}
                height={1200}
                sizes="(max-width: 900px) 100vw, 50vw"
                priority={false}
                unoptimized={nextImageUnoptimized(displayHeroSrc)}
              />
            )}
            <div className={styles.instagramLink}>
              <a
                href={heroOverlayHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "'Neuzeit Grotesk', ui-sans-serif, system-ui, sans-serif",
                  fontSize: heroLinkFontPx,
                  fontWeight: heroLinkFontWeight,
                  color: heroLinkColor,
                  textShadow: "0 1px 6px rgba(0,0,0,0.45)",
                }}
              >
                {heroOverlayText}
              </a>
            </div>
          </div>
        </div>

        <div className={styles.tilesCell}>
          <div className={styles.tileScrollOuter} dir="ltr">
            <div
              ref={scrollRef}
              className={`${styles.tileScrollViewport} ${feedSlider.feedSliderDragEnabled ? styles.tileScrollViewportGrab : ""} ${isPointerDragging ? styles.tileScrollViewportNoSelect : ""}`}
              data-ig-scroll-viewport=""
              dir="ltr"
              onPointerDownCapture={onViewportPointerDownCapture}
              onPointerMoveCapture={onViewportPointerMoveCapture}
              onPointerUpCapture={endViewportPointer}
              onPointerCancelCapture={endViewportPointer}
            >
              <div className={styles.tileStrip} data-ig-strip="" dir="ltr">
                {indexedColumns.map((cells, colIndex) => (
                  <div key={colIndex} className={styles.tileCol} data-ig-col="">
                    {cells.map(({ cell, index }, rowIndex) => {
                      if (cell.kind === "meta") {
                        const { item } = cell;
                        const alt =
                          item.caption && item.caption.length > 0
                            ? item.caption.slice(0, 120)
                            : `Instagram post ${item.id}`;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={styles.tile}
                            aria-label={alt}
                            onClick={() => tryOpenPopupAt(index)}
                          >
                            <Image
                              src={item.mediaUrl}
                              alt=""
                              fill
                              sizes="(max-width: 900px) 28vw, 17vw"
                              className={styles.tileImg}
                              unoptimized={nextImageUnoptimized(item.mediaUrl)}
                            />
                            <TileTypeBadge mediaType={item.mediaType} />
                            <span className={styles.tileHover} aria-hidden>
                              <span className={styles.tileHoverCaption}>
                                {metaTileHoverCaption(item)}
                              </span>
                            </span>
                          </button>
                        );
                      }
                      const i = colIndex * 2 + rowIndex;
                      const objectPosition = cell.objectPosition;
                      return (
                        <button
                          key={`p-${colIndex}-${index}`}
                          type="button"
                          className={styles.tile}
                          aria-label={`Open @${STOREFRONT_INSTAGRAM_HANDLE} on Instagram (preview tile ${i + 1})`}
                          onClick={() => tryOpenPopupAt(index)}
                        >
                          <Image
                            src={STOREFRONT_INSTAGRAM_HERO_IMAGE}
                            alt=""
                            fill
                            sizes="(max-width: 900px) 28vw, 17vw"
                            className={styles.tileImg}
                            style={{ objectPosition }}
                            unoptimized={nextImageUnoptimized(STOREFRONT_INSTAGRAM_HERO_IMAGE)}
                          />
                          <span className={styles.tileHover} aria-hidden>
                            <span className={styles.tileHoverCaption}>
                              {placeholderTileHoverCaption()}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {feedSlider.feedSliderArrowsEnabled && canGoLeft ? (
              <button
                type="button"
                className={styles.scrollBtn}
                data-side="prev"
                aria-label="Previous slide"
                onClick={() => scrollByStep(-1)}
              >
                <ElfsightSliderArrowPrev />
              </button>
            ) : null}
            {feedSlider.feedSliderArrowsEnabled && canGoRight ? (
              <button
                type="button"
                className={styles.scrollBtn}
                data-side="next"
                aria-label="Next slide"
                onClick={() => scrollByStep(1)}
              >
                <ElfsightSliderArrowNext />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {sourcesToolbar}

      {popupPortal}
    </div>
    </>
  );
}
