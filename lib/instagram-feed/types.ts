/**
 * Instagram feed for the storefront preview (/studio/instagram-widget).
 * Meta Graph API (Carbon-owned). Legacy `elfsight` id kept only for env override.
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
  /** ISO 8601 from Graph `timestamp` — used for popup date line */
  timestamp?: string;
  /**
   * Every image of a carousel, in order, so the popup can page through a post
   * instead of showing only its cover. Single-image posts omit this entirely,
   * which is also what tells the grid whether to draw the multi-post badge.
   */
  children?: string[];
  likeCount?: number;
  commentsCount?: number;
};

export type InstagramProfileSummary = {
  username: string;
  name: string;
  profileImageUrl?: string;
  /** Optional — from Graph API when wired */
  followersCount?: number;
  mediaCount?: number;
};
