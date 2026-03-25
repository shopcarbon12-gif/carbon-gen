"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
} from "@/lib/instagram-feed";
import { InstagramWidgetEditorToolbar } from "./InstagramWidgetEditorToolbar";
import styles from "./storefront-section-preview.module.css";

type TileCell =
  | { kind: "meta"; item: InstagramMediaItem }
  | { kind: "placeholder"; objectPosition: string };

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

/** Avoid global `next.config` allowlist for Shopify CDN URLs used only in this preview. */
function nextImageUnoptimized(src: string) {
  return /^https?:\/\//i.test(src);
}

/** White outline camera (matches storefront / Elfsight-style Follow control). */
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

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden className={styles.scrollChevron}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 6l-6 6 6 6"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden className={styles.scrollChevron}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6l6 6-6 6"
      />
    </svg>
  );
}

function chunkPairs<T>(arr: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

export function StorefrontSectionPreview() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastArrowsRef = useRef({ left: false, right: false });
  const [canGoLeft, setCanGoLeft] = useState(false);
  const [canGoRight, setCanGoRight] = useState(false);
  const [columns, setColumns] = useState<TileCell[][]>(() => buildPlaceholderColumns());
  const [heroSrc, setHeroSrc] = useState(STOREFRONT_INSTAGRAM_HERO_IMAGE);

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
          feedStatus?: string;
          missingEnv?: string[];
          graphError?: string;
          mediaCount?: number;
        };

        if (cancelled) return;

        if (!res.ok) {
          setHeroSrc(STOREFRONT_INSTAGRAM_HERO_IMAGE);
          setColumns(buildPlaceholderColumns());
          return;
        }

        if (!json?.ok) {
          setHeroSrc(STOREFRONT_INSTAGRAM_HERO_IMAGE);
          setColumns(buildPlaceholderColumns());
          return;
        }

        if (json.source === "meta" && Array.isArray(json.items) && json.items.length >= 2) {
          setHeroSrc(json.items[0].mediaUrl);
          setColumns(chunkItemsToColumns(json.items));
          return;
        }

        setHeroSrc(STOREFRONT_INSTAGRAM_HERO_IMAGE);
        setColumns(buildPlaceholderColumns());
      } catch {
        if (!cancelled) {
          setHeroSrc(STOREFRONT_INSTAGRAM_HERO_IMAGE);
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

  const scrollByStep = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    const firstCol = el?.querySelector<HTMLElement>("[data-ig-col]");
    const strip = el?.querySelector<HTMLElement>("[data-ig-strip]");
    if (!el || !firstCol) return;
    const gapRaw = strip ? getComputedStyle(strip).gap : "10px";
    const gapPx = parseFloat(gapRaw) || 10;
    const step = firstCol.offsetWidth + gapPx;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  const profileBar = (
    <div className={styles.profileBar}>
      <div className={styles.profileBarInner}>
        <div className={styles.avatarCircle} aria-hidden>
          <Image
            src={STOREFRONT_INSTAGRAM_AVATAR_SRC}
            alt=""
            width={120}
            height={120}
            className={styles.avatarImg}
          />
        </div>
        <div className={styles.profileText}>
          <div className={styles.profileName}>{STOREFRONT_INSTAGRAM_DISPLAY_NAME}</div>
          <div className={styles.profileHandle}>@{STOREFRONT_INSTAGRAM_HANDLE}</div>
        </div>
        <div className={`${styles.stat} ${styles.statPosts}`}>
          <span className={styles.statValue}>{STOREFRONT_INSTAGRAM_POSTS_COUNT_LABEL}</span>
          <span className={styles.statLabel}>Posts</span>
        </div>
        <div className={`${styles.stat} ${styles.statFollowers}`}>
          <span className={styles.statValue}>{STOREFRONT_INSTAGRAM_FOLLOWERS_COUNT_LABEL}</span>
          <span className={styles.statLabel}>Followers</span>
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

  return (
    <div className={styles.root}>
      {profileBar}

      <div className={styles.mediaGrid}>
        <div className={styles.heroCell}>
          <div className={styles.banner}>
            <Image
              src={heroSrc}
              alt={`Instagram banner for @${STOREFRONT_INSTAGRAM_HANDLE}`}
              width={2000}
              height={1200}
              sizes="(max-width: 900px) 100vw, 50vw"
              priority={false}
              unoptimized={nextImageUnoptimized(heroSrc)}
            />
            <div className={styles.instagramLink}>
              <a href={STOREFRONT_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                @{STOREFRONT_INSTAGRAM_HANDLE}
              </a>
            </div>
          </div>
        </div>

        <div className={styles.tilesCell}>
          <div className={styles.tileScrollOuter}>
            <div
              ref={scrollRef}
              className={styles.tileScrollViewport}
              data-ig-scroll-viewport=""
            >
              <div className={styles.tileStrip} data-ig-strip="">
                {columns.map((cells, colIndex) => (
                  <div key={colIndex} className={styles.tileCol} data-ig-col="">
                    {cells.map((cell, rowIndex) => {
                      if (cell.kind === "meta") {
                        const { item } = cell;
                        const alt =
                          item.caption && item.caption.length > 0
                            ? item.caption.slice(0, 120)
                            : `Instagram post ${item.id}`;
                        return (
                          <a
                            key={item.id}
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.tile}
                            aria-label={alt}
                          >
                            <Image
                              src={item.mediaUrl}
                              alt=""
                              fill
                              sizes="(max-width: 900px) 28vw, 17vw"
                              className={styles.tileImg}
                              unoptimized={nextImageUnoptimized(item.mediaUrl)}
                            />
                          </a>
                        );
                      }
                      const i = colIndex * 2 + rowIndex;
                      const objectPosition = cell.objectPosition;
                      return (
                        <a
                          key={`p-${colIndex}-${rowIndex}`}
                          href={STOREFRONT_INSTAGRAM_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.tile}
                          aria-label={`Open @${STOREFRONT_INSTAGRAM_HANDLE} on Instagram (preview tile ${i + 1})`}
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
                        </a>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {canGoLeft ? (
              <button
                type="button"
                className={styles.scrollBtn}
                data-side="prev"
                aria-label="Scroll Instagram grid left"
                onClick={() => scrollByStep(-1)}
              >
                <ChevronLeft />
              </button>
            ) : null}
            {canGoRight ? (
              <button
                type="button"
                className={styles.scrollBtn}
                data-side="next"
                aria-label="Scroll Instagram grid right"
                onClick={() => scrollByStep(1)}
              >
                <ChevronRight />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <InstagramWidgetEditorToolbar />
    </div>
  );
}
