# Carbon Assist vs UserWay — comparison (Shopify PDP)

**Generated:** 2026-03-26T07:47:44.777Z  
**Page:** [Gyda product PDP](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72) — both widgets can load here.  
**Screenshot sources:** copied into this folder as `carbon-pdp/` (Carbon full run) and `userway-pdp/` (UserWay run).

**MCP:** Screenshots were produced with the same **Playwright** flows as MCP browser automation (navigate PDP → drive `#carbon-a11y-widget` shadow host or `window.UserWay`). This comparison bundles those outputs; you can re-check live behavior in MCP on the same product URL.

## Method

1. **Carbon Assist** — automated via `#carbon-a11y-widget` shadow DOM (`scripts/run-a11y-widget-storefront-report-full.mjs`).  
2. **UserWay** — automated via `window.UserWay` + widget iframe (`scripts/run-userway-storefront-report.mjs`).  
3. Pairs below match **similar intent**, not pixel-identical behavior. UserWay often uses **cycle/toggle** APIs; Carbon uses **explicit radios** with more steps.

## Code references (implementation)

| Product | Where | What |
|---------|--------|------|
| **Carbon Assist** | `app/accessibility/widget/route.ts` | `state.contrastMode`, `makeRadioGroup` for text spacing / line height / align / saturation; `makeTileAction` for high contrast, readable font, pause animations, links, images, guide, mask, cursor, tooltips; `cmd-jump-headings` / `cmd-jump-links`. |
| **UserWay** | Host page `window.UserWay` | e.g. `contrastEnable`, `enableSmartContrast`, `bigTextEnable`, `legibleFontsEnable`, `textSpacingEnable`, `lineHeightEnable`, `textAlignEnable`, `saturationEnable`, `dyslexiaFontEnable`, `enableHideImages`, `highlightEnable`, `stopAnimationEnable`, `bigCursorEnable`, `tooltipsEnable`, `readingGuideEnable`, `readingMaskEnable`, `pageStructureHeaders`, `pageStructureLinks`, `pageStructureLandmarks`, `resetAll`. Listed in `scripts/run-userway-storefront-report.mjs` (`UW_API_READING`, `UW_API_MOTION`). |

## Not comparable (by design)

| Only in Carbon | Only in UserWay |
|----------------|-----------------|
| Named **quick presets** (Screen reader, Low vision, Motor, ADHD, Seizure safe) — see `carbon-pdp/profile-*.png` | **Read page (TTS)** — `userway-pdp/motion-read-page-tts.png` |
| **Panel chrome** (plain light UI, oversized) — `carbon-pdp/chrome-*.png` | **Inline dictionary** — `userway-pdp/motion-inline-dictionary.png` |
| Separate **contrast none / five explicit modes** + **high contrast tile** | **Landmarks** navigation — `userway-pdp/nav-jump-structure-landmarks.png` (Carbon has headings + links only) |
| **Contrast +** is not a single UserWay control; UW uses one **Contrast +** button cycling modes (`userway-pdp/reading-ui-contrast-step-*.png`) | |

---

## Side-by-side: similar features

### Baseline (widget off)

| Carbon Assist | UserWay |
|---------------|--------|
| ![00-baseline-closed.png](./carbon-pdp/00-baseline-closed.png) | ![00-baseline.png](./userway-pdp/00-baseline.png) |

_Carbon: before launcher. UserWay: before API use (both on same PDP)._

---

### Panel / menu open

| Carbon Assist | UserWay |
|---------------|--------|
| ![01-panel-open.png](./carbon-pdp/01-panel-open.png) | ![01-widget-open.png](./userway-pdp/01-widget-open.png) |

_Carbon: shadow panel. UserWay: iframe menu._

---

### Contrast — invert-style

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-contrast-invert.png](./carbon-pdp/reading-contrast-invert.png) | ![reading-invert-contrast-base.png](./userway-pdp/reading-invert-contrast-base.png) |

_Carbon: `contrastMode: invert`. UserWay: `UserWay.contrastEnable()`._

---

### Contrast — dark

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-contrast-dark.png](./carbon-pdp/reading-contrast-dark.png) | ![reading-ui-contrast-step-2.png](./userway-pdp/reading-ui-contrast-step-2.png) |

_Carbon: explicit dark mode. UserWay: 2nd step of **Contrast +** UI cycle (approximate; not identical)._

---

### Contrast — light

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-contrast-light.png](./carbon-pdp/reading-contrast-light.png) | ![reading-ui-contrast-step-3.png](./userway-pdp/reading-ui-contrast-step-3.png) |

_Carbon: light chrome. UserWay: 3rd **Contrast +** step (approximate)._

---

### Contrast — smart

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-contrast-smart.png](./carbon-pdp/reading-contrast-smart.png) | ![reading-smart-contrast.png](./userway-pdp/reading-smart-contrast.png) |

_Carbon: `contrastMode: smart`. UserWay: `enableSmartContrast()`._

---

### Text larger

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-textscale-plus5.png](./carbon-pdp/reading-textscale-plus5.png) | ![reading-bigger-text.png](./userway-pdp/reading-bigger-text.png) |

_Carbon: text scale +5 steps. UserWay: `bigTextEnable()`. Compare to each baseline in folder._

---

### Readable / legible font

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-readable-font.png](./carbon-pdp/motion-tile-readable-font.png) | ![reading-legible-fonts.png](./userway-pdp/reading-legible-fonts.png) |

_Carbon: `readableFont` tile. UserWay: `legibleFontsEnable()`._

---

### Text spacing (single setting)

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-spacing-moderate.png](./carbon-pdp/reading-spacing-moderate.png) | ![reading-text-spacing.png](./userway-pdp/reading-text-spacing.png) |

_Carbon: radio `textSpacing: moderate`. UserWay: `textSpacingEnable()` (cycles; not same granularity)._

---

### Line height (single setting)

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-line-relaxed.png](./carbon-pdp/reading-line-relaxed.png) | ![reading-line-height.png](./userway-pdp/reading-line-height.png) |

_Carbon: `lineHeight: relaxed`. UserWay: `lineHeightEnable()`._

---

### Text align (single setting)

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-align-left.png](./carbon-pdp/reading-align-left.png) | ![reading-text-align.png](./userway-pdp/reading-text-align.png) |

_Carbon: `textAlign: left`. UserWay: `textAlignEnable()`._

---

### Saturation (single setting)

| Carbon Assist | UserWay |
|---------------|--------|
| ![reading-saturation-low.png](./carbon-pdp/reading-saturation-low.png) | ![reading-saturation.png](./userway-pdp/reading-saturation.png) |

_Carbon: `saturation: low`. UserWay: `saturationEnable()` (cycles modes)._

---

### Dyslexia-friendly font

| Carbon Assist | UserWay |
|---------------|--------|
| ![profile-dyslexia.png](./carbon-pdp/profile-dyslexia.png) | ![reading-dyslexia-font.png](./userway-pdp/reading-dyslexia-font.png) |

_Carbon: **profile** bundles spacing + font + align. UserWay: `dyslexiaFontEnable()` only._

---

### Hide images

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-hide-images.png](./carbon-pdp/motion-tile-hide-images.png) | ![reading-hide-images.png](./userway-pdp/reading-hide-images.png) |

_Carbon: `hideImages` tile. UserWay: `enableHideImages()`._

---

### High contrast tile (Carbon)

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-high-contrast.png](./carbon-pdp/motion-tile-high-contrast.png) | _n/a_ |

_Carbon exposes a dedicated **High contrast** switch. UserWay has no separate equivalent; contrast is via **Contrast +** / `contrastEnable` / smart contrast._

---

### Highlight links

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-highlight-links.png](./carbon-pdp/motion-tile-highlight-links.png) | ![motion-highlight-links.png](./userway-pdp/motion-highlight-links.png) |

_Carbon: `highlightLinks` tile. UserWay: `highlightEnable()`._

---

### Pause animations

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-pause-animations.png](./carbon-pdp/motion-tile-pause-animations.png) | ![motion-pause-animations.png](./userway-pdp/motion-pause-animations.png) |

_Carbon: `pauseAnimations`. UserWay: `stopAnimationEnable()`._

---

### Big cursor

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-big-cursor.png](./carbon-pdp/motion-tile-big-cursor.png) | ![motion-big-cursor.png](./userway-pdp/motion-big-cursor.png) |

_Carbon: `bigCursor` tile. UserWay: `bigCursorEnable()`._

---

### Tooltips

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-enhanced-tooltips.png](./carbon-pdp/motion-tile-enhanced-tooltips.png) | ![motion-tooltips.png](./userway-pdp/motion-tooltips.png) |

_Carbon: custom overlay for `title`. UserWay: `tooltipsEnable()`._

---

### Reading guide

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-reading-guide.png](./carbon-pdp/motion-tile-reading-guide.png) | ![motion-reading-guide.png](./userway-pdp/motion-reading-guide.png) |

_Both: horizontal reading line._

---

### Reading mask

| Carbon Assist | UserWay |
|---------------|--------|
| ![motion-tile-reading-mask.png](./carbon-pdp/motion-tile-reading-mask.png) | ![motion-reading-mask.png](./userway-pdp/motion-reading-mask.png) |

_Both: focus mask overlay._

---

### Jump to headings

| Carbon Assist | UserWay |
|---------------|--------|
| ![nav-jump-headings.png](./carbon-pdp/nav-jump-headings.png) | ![nav-jump-structure-headers.png](./userway-pdp/nav-jump-structure-headers.png) |

_Carbon: `cmd-jump-headings`. UserWay: `pageStructureHeaders()`._

---

### Jump to links

| Carbon Assist | UserWay |
|---------------|--------|
| ![nav-jump-links.png](./carbon-pdp/nav-jump-links.png) | ![nav-jump-structure-links.png](./userway-pdp/nav-jump-structure-links.png) |

_Carbon: `cmd-jump-links`. UserWay: `pageStructureLinks()`._

---

## UserWay-only navigation

| UserWay | Screenshot |
|---------|------------|
| Landmarks | ![nav-jump-structure-landmarks.png](./userway-pdp/nav-jump-structure-landmarks.png) |

---

## Full gallery — Carbon Assist (all PDP screenshots)

### `00-baseline-closed.png`

![00-baseline-closed.png](./carbon-pdp/00-baseline-closed.png)

### `01-panel-open.png`

![01-panel-open.png](./carbon-pdp/01-panel-open.png)

### `99-after-reset.png`

![99-after-reset.png](./carbon-pdp/99-after-reset.png)

### `chrome-oversized-panel.png`

![chrome-oversized-panel.png](./carbon-pdp/chrome-oversized-panel.png)

### `chrome-plain-light-panel.png`

![chrome-plain-light-panel.png](./carbon-pdp/chrome-plain-light-panel.png)

### `motion-tile-big-cursor.png`

![motion-tile-big-cursor.png](./carbon-pdp/motion-tile-big-cursor.png)

### `motion-tile-enhanced-tooltips.png`

![motion-tile-enhanced-tooltips.png](./carbon-pdp/motion-tile-enhanced-tooltips.png)

### `motion-tile-hide-images.png`

![motion-tile-hide-images.png](./carbon-pdp/motion-tile-hide-images.png)

### `motion-tile-high-contrast.png`

![motion-tile-high-contrast.png](./carbon-pdp/motion-tile-high-contrast.png)

### `motion-tile-highlight-links.png`

![motion-tile-highlight-links.png](./carbon-pdp/motion-tile-highlight-links.png)

### `motion-tile-pause-animations.png`

![motion-tile-pause-animations.png](./carbon-pdp/motion-tile-pause-animations.png)

### `motion-tile-readable-font.png`

![motion-tile-readable-font.png](./carbon-pdp/motion-tile-readable-font.png)

### `motion-tile-reading-guide.png`

![motion-tile-reading-guide.png](./carbon-pdp/motion-tile-reading-guide.png)

### `motion-tile-reading-mask.png`

![motion-tile-reading-mask.png](./carbon-pdp/motion-tile-reading-mask.png)

### `nav-jump-headings.png`

![nav-jump-headings.png](./carbon-pdp/nav-jump-headings.png)

### `nav-jump-links.png`

![nav-jump-links.png](./carbon-pdp/nav-jump-links.png)

### `profile-adhd.png`

![profile-adhd.png](./carbon-pdp/profile-adhd.png)

### `profile-dyslexia.png`

![profile-dyslexia.png](./carbon-pdp/profile-dyslexia.png)

### `profile-low-vision.png`

![profile-low-vision.png](./carbon-pdp/profile-low-vision.png)

### `profile-motor.png`

![profile-motor.png](./carbon-pdp/profile-motor.png)

### `profile-screen-reader.png`

![profile-screen-reader.png](./carbon-pdp/profile-screen-reader.png)

### `profile-seizure-safe.png`

![profile-seizure-safe.png](./carbon-pdp/profile-seizure-safe.png)

### `reading-align-center.png`

![reading-align-center.png](./carbon-pdp/reading-align-center.png)

### `reading-align-default.png`

![reading-align-default.png](./carbon-pdp/reading-align-default.png)

### `reading-align-justify.png`

![reading-align-justify.png](./carbon-pdp/reading-align-justify.png)

### `reading-align-left.png`

![reading-align-left.png](./carbon-pdp/reading-align-left.png)

### `reading-contrast-dark.png`

![reading-contrast-dark.png](./carbon-pdp/reading-contrast-dark.png)

### `reading-contrast-invert.png`

![reading-contrast-invert.png](./carbon-pdp/reading-contrast-invert.png)

### `reading-contrast-light.png`

![reading-contrast-light.png](./carbon-pdp/reading-contrast-light.png)

### `reading-contrast-none.png`

![reading-contrast-none.png](./carbon-pdp/reading-contrast-none.png)

### `reading-contrast-smart.png`

![reading-contrast-smart.png](./carbon-pdp/reading-contrast-smart.png)

### `reading-line-loose.png`

![reading-line-loose.png](./carbon-pdp/reading-line-loose.png)

### `reading-line-normal.png`

![reading-line-normal.png](./carbon-pdp/reading-line-normal.png)

### `reading-line-relaxed.png`

![reading-line-relaxed.png](./carbon-pdp/reading-line-relaxed.png)

### `reading-saturation-high.png`

![reading-saturation-high.png](./carbon-pdp/reading-saturation-high.png)

### `reading-saturation-low.png`

![reading-saturation-low.png](./carbon-pdp/reading-saturation-low.png)

### `reading-saturation-mono.png`

![reading-saturation-mono.png](./carbon-pdp/reading-saturation-mono.png)

### `reading-saturation-normal.png`

![reading-saturation-normal.png](./carbon-pdp/reading-saturation-normal.png)

### `reading-spacing-heavy.png`

![reading-spacing-heavy.png](./carbon-pdp/reading-spacing-heavy.png)

### `reading-spacing-moderate.png`

![reading-spacing-moderate.png](./carbon-pdp/reading-spacing-moderate.png)

### `reading-spacing-normal.png`

![reading-spacing-normal.png](./carbon-pdp/reading-spacing-normal.png)

### `reading-textscale-baseline.png`

![reading-textscale-baseline.png](./carbon-pdp/reading-textscale-baseline.png)

### `reading-textscale-plus5.png`

![reading-textscale-plus5.png](./carbon-pdp/reading-textscale-plus5.png)

---

## Full gallery — UserWay (all PDP screenshots)

### `00-baseline.png`

![00-baseline.png](./userway-pdp/00-baseline.png)

### `01-widget-open.png`

![01-widget-open.png](./userway-pdp/01-widget-open.png)

### `99-after-reset-close.png`

![99-after-reset-close.png](./userway-pdp/99-after-reset-close.png)

### `motion-big-cursor.png`

![motion-big-cursor.png](./userway-pdp/motion-big-cursor.png)

### `motion-highlight-links.png`

![motion-highlight-links.png](./userway-pdp/motion-highlight-links.png)

### `motion-inline-dictionary.png`

![motion-inline-dictionary.png](./userway-pdp/motion-inline-dictionary.png)

### `motion-pause-animations.png`

![motion-pause-animations.png](./userway-pdp/motion-pause-animations.png)

### `motion-read-page-tts.png`

![motion-read-page-tts.png](./userway-pdp/motion-read-page-tts.png)

### `motion-reading-guide.png`

![motion-reading-guide.png](./userway-pdp/motion-reading-guide.png)

### `motion-reading-mask.png`

![motion-reading-mask.png](./userway-pdp/motion-reading-mask.png)

### `motion-tooltips.png`

![motion-tooltips.png](./userway-pdp/motion-tooltips.png)

### `nav-jump-structure-headers.png`

![nav-jump-structure-headers.png](./userway-pdp/nav-jump-structure-headers.png)

### `nav-jump-structure-landmarks.png`

![nav-jump-structure-landmarks.png](./userway-pdp/nav-jump-structure-landmarks.png)

### `nav-jump-structure-links.png`

![nav-jump-structure-links.png](./userway-pdp/nav-jump-structure-links.png)

### `reading-bigger-text.png`

![reading-bigger-text.png](./userway-pdp/reading-bigger-text.png)

### `reading-dyslexia-font.png`

![reading-dyslexia-font.png](./userway-pdp/reading-dyslexia-font.png)

### `reading-hide-images.png`

![reading-hide-images.png](./userway-pdp/reading-hide-images.png)

### `reading-invert-contrast-base.png`

![reading-invert-contrast-base.png](./userway-pdp/reading-invert-contrast-base.png)

### `reading-legible-fonts.png`

![reading-legible-fonts.png](./userway-pdp/reading-legible-fonts.png)

### `reading-line-height.png`

![reading-line-height.png](./userway-pdp/reading-line-height.png)

### `reading-saturation.png`

![reading-saturation.png](./userway-pdp/reading-saturation.png)

### `reading-smart-contrast.png`

![reading-smart-contrast.png](./userway-pdp/reading-smart-contrast.png)

### `reading-text-align.png`

![reading-text-align.png](./userway-pdp/reading-text-align.png)

### `reading-text-spacing.png`

![reading-text-spacing.png](./userway-pdp/reading-text-spacing.png)

### `reading-ui-contrast-step-1.png`

![reading-ui-contrast-step-1.png](./userway-pdp/reading-ui-contrast-step-1.png)

### `reading-ui-contrast-step-2.png`

![reading-ui-contrast-step-2.png](./userway-pdp/reading-ui-contrast-step-2.png)

### `reading-ui-contrast-step-3.png`

![reading-ui-contrast-step-3.png](./userway-pdp/reading-ui-contrast-step-3.png)

---

## Regenerate assets

1. `node scripts/run-a11y-widget-storefront-report-full.mjs`  
2. `node scripts/run-userway-storefront-report.mjs`  
3. `node scripts/generate-carbon-vs-userway-comparison.mjs`

