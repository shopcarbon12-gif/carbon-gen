/** Canonical hero slot for Shopify Instagram row (5∶3). Safe to import from client components. */
export const INSTAGRAM_HERO_WIDTH = 2000;
export const INSTAGRAM_HERO_HEIGHT = 1200;

/** Default slider behavior for the horizontal feed strip in studio + storefront preview. */
export const INSTAGRAM_FEED_SLIDER_DEFAULTS = {
  feedSliderArrowsEnabled: true,
  feedSliderDragEnabled: true,
  feedSliderAnimationSec: 0.6,
  /** 0 = autoplay off */
  feedSliderAutoplaySec: 0,
} as const;
