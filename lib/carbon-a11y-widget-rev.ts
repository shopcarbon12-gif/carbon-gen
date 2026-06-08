/**
 * Single source for widget bundle / install-snippet cache bust.
 * When bumping: update this value, then `shopify/snippets/carbon-accessibility-widget.liquid` (`wrev=` query),
 * and push the snippet to the live theme (see `scripts/push-carbon-accessibility-widget-theme.mjs`).
 */
export const CARBON_A11Y_WIDGET_WREV = 135;
