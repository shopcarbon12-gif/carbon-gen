import type { InstagramFeedProviderId } from "./types";

/** Hero image from scripts/shopify-instagram-row-custom-liquid.liquid */
export const STOREFRONT_INSTAGRAM_HERO_IMAGE =
  "https://cdn.shopify.com/s/files/1/0680/6572/2620/files/DZ__3128.jpg?v=1733764412";

export const STOREFRONT_INSTAGRAM_HANDLE = "shopcarbon";
export const STOREFRONT_INSTAGRAM_URL = "https://www.instagram.com/shopcarbon/";

/** Profile bar (until Meta Graph API supplies live counts). */
export const STOREFRONT_INSTAGRAM_DISPLAY_NAME = "CARBON";
export const STOREFRONT_INSTAGRAM_POSTS_COUNT_LABEL = "322";
export const STOREFRONT_INSTAGRAM_FOLLOWERS_COUNT_LABEL = "3.8K";

/** In-app avatar — full circle with IG-style ring + mark (no extra CSS ring on top). */
export const STOREFRONT_INSTAGRAM_AVATAR_SRC = "/accessibility-assets/carbon-instagram-avatar.png";

/**
 * Studio preview: 2 rows × N columns (horizontal scroll); same hero asset, varied focal points.
 * Replace with Meta API URLs later.
 */
export const STOREFRONT_PREVIEW_TILE_OBJECT_POSITIONS: readonly string[] = [
  "18% 22%",
  "52% 28%",
  "82% 24%",
  "22% 58%",
  "55% 62%",
  "78% 55%",
  "32% 30%",
  "65% 34%",
  "14% 50%",
  "48% 52%",
  "76% 48%",
  "30% 72%",
  "58% 68%",
  "88% 58%",
  "40% 26%",
  "62% 78%",
];

/**
 * Feed source for typed config. Default is Meta (Graph API). Set
 * `NEXT_PUBLIC_INSTAGRAM_FEED_PROVIDER=elfsight` only for legacy embed parity (deprecated).
 */
export function getInstagramFeedProvider(): InstagramFeedProviderId {
  const v = String(process.env.NEXT_PUBLIC_INSTAGRAM_FEED_PROVIDER || "meta")
    .trim()
    .toLowerCase();
  return v === "elfsight" ? "elfsight" : "meta";
}
