/**
 * Instagram feed for the storefront preview (/studio/instagram-widget).
 * Today: Elfsight embed (matches shopcarbon.com). Later: Meta Graph API — implement
 * fetch + map results to these shapes and render with the same grid UI.
 */

export type InstagramFeedProviderId = "elfsight" | "meta";

export type InstagramMediaType = "IMAGE" | "CAROUSEL_ALBUM" | "VIDEO";

export type InstagramMediaItem = {
  id: string;
  mediaType: InstagramMediaType;
  /** Display URL (image or thumbnail) */
  mediaUrl: string;
  permalink: string;
  caption?: string;
};

export type InstagramProfileSummary = {
  username: string;
  name: string;
  profileImageUrl?: string;
  /** Optional — from Graph API when wired */
  followersCount?: number;
  mediaCount?: number;
};
