# Carbon Assist — full storefront verification (shopcarbon.com)

**Generated:** 2026-03-26T07:25:16.202Z  
**Runner:** `node scripts/run-a11y-widget-storefront-report-full.mjs` (Playwright Chromium; same shadow-host technique as MCP `browser_evaluate`).  
**Output folder:** `reports/a11y-widget-mcp-shopcarbon-full/`

**Summary:** 168 checks **OK**, 0 checks **FAIL** (missing controls = feature off in live config, or load error).

## Executive summary (what worked / what did not)

| Question | Answer |
|----------|--------|
| Did the widget load on all four URLs? | **Yes** — host + shadow DOM present each time. |
| Did every quick preset apply? | **Yes** — six presets × four sites; see `profile-*.png` per folder. |
| Did every Reading & vision option run? | **Yes** — all contrast, spacing, line height, align, saturation values, plus text scale baseline vs +5 steps. |
| Did every motion/display tile run? | **Yes** — all nine tiles (including visible tooltips) were found, toggled ON, captured, then toggled OFF. |
| Did panel chrome and navigation run? | **Yes** — plain light UI, oversized UI, jump to headings, jump to links. |
| Any **FAIL** rows? | **No** on this run. A **FAIL** would mean the selector was missing (feature disabled in published config) or the page failed to load. |
| What this does **not** prove | SR live-region text, perfect WCAG compliance, or strong visible difference for every subtle setting — compare PNGs to `00-baseline-closed.png` in the same folder. |

**Regenerate this report:** `node scripts/run-a11y-widget-storefront-report-full.mjs` (requires `npx playwright install chromium` once if browsers are missing).

## Targets

- [Homepage (www.shopcarbon.com)](https://www.shopcarbon.com/) (`01-home/`)
- [Product PDP (Gyda set)](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72) (`02-product/`)
- [Account login](https://shopcarbon.com/account/login) (`03-login/`)
- [Jeans landing page](https://shopcarbon.com/pages/jeans) (`04-jeans/`)

## How to read results

| Column | Meaning |
|--------|---------|
| **OK** | Selector existed and was clicked; PNG path in Notes when applicable. |
| **FAIL** | Control absent or page error. |
| **Proof** | Open PNGs under this folder; compare reading/motion shots to `00-baseline-closed.png` for the same site id. |

**OK** = automation + artifact, not a guarantee of perfect visual or WCAG compliance.

## Full results table

| Page | Area | Test | Result | Notes |
|------|------|------|--------|-------|
| Homepage (www.shopcarbon.com) | Widget | Host #carbon-a11y-widget + shadowRoot | **OK** | Widget script present. |
| Homepage (www.shopcarbon.com) | Widget | Open panel (launcher) | **OK** | Panel opened. |
| Homepage (www.shopcarbon.com) | Profiles | Screen reader | **OK** | Preset applied; viewport `01-home/profile-screen-reader.png`. |
| Homepage (www.shopcarbon.com) | Profiles | Low vision | **OK** | Preset applied; viewport `01-home/profile-low-vision.png`. |
| Homepage (www.shopcarbon.com) | Profiles | Motor | **OK** | Preset applied; viewport `01-home/profile-motor.png`. |
| Homepage (www.shopcarbon.com) | Profiles | Dyslexia | **OK** | Preset applied; viewport `01-home/profile-dyslexia.png`. |
| Homepage (www.shopcarbon.com) | Profiles | ADHD | **OK** | Preset applied; viewport `01-home/profile-adhd.png`. |
| Homepage (www.shopcarbon.com) | Profiles | Seizure safe | **OK** | Preset applied; viewport `01-home/profile-seizure-safe.png`. |
| Homepage (www.shopcarbon.com) | Reading & vision | Contrast mode: none | **OK** | Control found; viewport `01-home/reading-contrast-none.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Contrast mode: dark | **OK** | Control found; viewport `01-home/reading-contrast-dark.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Contrast mode: light | **OK** | Control found; viewport `01-home/reading-contrast-light.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Contrast mode: invert | **OK** | Control found; viewport `01-home/reading-contrast-invert.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Contrast mode: smart | **OK** | Control found; viewport `01-home/reading-contrast-smart.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text spacing: normal | **OK** | Control found; viewport `01-home/reading-spacing-normal.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text spacing: moderate | **OK** | Control found; viewport `01-home/reading-spacing-moderate.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text spacing: heavy | **OK** | Control found; viewport `01-home/reading-spacing-heavy.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Line height: normal | **OK** | Control found; viewport `01-home/reading-line-normal.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Line height: relaxed | **OK** | Control found; viewport `01-home/reading-line-relaxed.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Line height: loose | **OK** | Control found; viewport `01-home/reading-line-loose.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text align: default | **OK** | Control found; viewport `01-home/reading-align-default.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text align: left | **OK** | Control found; viewport `01-home/reading-align-left.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text align: center | **OK** | Control found; viewport `01-home/reading-align-center.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text align: justify | **OK** | Control found; viewport `01-home/reading-align-justify.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Saturation: normal | **OK** | Control found; viewport `01-home/reading-saturation-normal.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Saturation: low | **OK** | Control found; viewport `01-home/reading-saturation-low.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Saturation: high | **OK** | Control found; viewport `01-home/reading-saturation-high.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Saturation: mono | **OK** | Control found; viewport `01-home/reading-saturation-mono.png` (compare to baseline for visual effect). |
| Homepage (www.shopcarbon.com) | Reading & vision | Text size +5 steps (larger) | **OK** | Baseline `01-home/reading-textscale-baseline.png`; after +5 `01-home/reading-textscale-plus5.png`. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: highContrast | **OK** | Toggled on, screenshot `01-home/motion-tile-high-contrast.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: readableFont | **OK** | Toggled on, screenshot `01-home/motion-tile-readable-font.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: pauseAnimations | **OK** | Toggled on, screenshot `01-home/motion-tile-pause-animations.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: highlightLinks | **OK** | Toggled on, screenshot `01-home/motion-tile-highlight-links.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: hideImages | **OK** | Toggled on, screenshot `01-home/motion-tile-hide-images.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: readingGuide | **OK** | Toggled on, screenshot `01-home/motion-tile-reading-guide.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: readingMask | **OK** | Toggled on, screenshot `01-home/motion-tile-reading-mask.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: bigCursor | **OK** | Toggled on, screenshot `01-home/motion-tile-big-cursor.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Motion & display | Tile ON → viewport: enhancedTooltips | **OK** | Toggled on, screenshot `01-home/motion-tile-enhanced-tooltips.png`, then toggled off in panel. |
| Homepage (www.shopcarbon.com) | Panel appearance | Plain light panel ON (panel open) | **OK** | Screenshot `01-home/chrome-plain-light-panel.png` — menu should use light theme. |
| Homepage (www.shopcarbon.com) | Panel appearance | Larger menu ON (panel open) | **OK** | Screenshot `01-home/chrome-oversized-panel.png` — launcher/panel should look larger. |
| Homepage (www.shopcarbon.com) | Navigation | Jump to headings | **OK** | After click `01-home/nav-jump-headings.png` — focus may be on first heading (not always visible). |
| Homepage (www.shopcarbon.com) | Navigation | Jump to links | **OK** | After click `01-home/nav-jump-links.png`. |
| Homepage (www.shopcarbon.com) | Cleanup | Reset all + clear preset | **OK** | `01-home/99-after-reset.png` |
| Product PDP (Gyda set) | Widget | Host #carbon-a11y-widget + shadowRoot | **OK** | Widget script present. |
| Product PDP (Gyda set) | Widget | Open panel (launcher) | **OK** | Panel opened. |
| Product PDP (Gyda set) | Profiles | Screen reader | **OK** | Preset applied; viewport `02-product/profile-screen-reader.png`. |
| Product PDP (Gyda set) | Profiles | Low vision | **OK** | Preset applied; viewport `02-product/profile-low-vision.png`. |
| Product PDP (Gyda set) | Profiles | Motor | **OK** | Preset applied; viewport `02-product/profile-motor.png`. |
| Product PDP (Gyda set) | Profiles | Dyslexia | **OK** | Preset applied; viewport `02-product/profile-dyslexia.png`. |
| Product PDP (Gyda set) | Profiles | ADHD | **OK** | Preset applied; viewport `02-product/profile-adhd.png`. |
| Product PDP (Gyda set) | Profiles | Seizure safe | **OK** | Preset applied; viewport `02-product/profile-seizure-safe.png`. |
| Product PDP (Gyda set) | Reading & vision | Contrast mode: none | **OK** | Control found; viewport `02-product/reading-contrast-none.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Contrast mode: dark | **OK** | Control found; viewport `02-product/reading-contrast-dark.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Contrast mode: light | **OK** | Control found; viewport `02-product/reading-contrast-light.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Contrast mode: invert | **OK** | Control found; viewport `02-product/reading-contrast-invert.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Contrast mode: smart | **OK** | Control found; viewport `02-product/reading-contrast-smart.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text spacing: normal | **OK** | Control found; viewport `02-product/reading-spacing-normal.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text spacing: moderate | **OK** | Control found; viewport `02-product/reading-spacing-moderate.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text spacing: heavy | **OK** | Control found; viewport `02-product/reading-spacing-heavy.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Line height: normal | **OK** | Control found; viewport `02-product/reading-line-normal.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Line height: relaxed | **OK** | Control found; viewport `02-product/reading-line-relaxed.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Line height: loose | **OK** | Control found; viewport `02-product/reading-line-loose.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text align: default | **OK** | Control found; viewport `02-product/reading-align-default.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text align: left | **OK** | Control found; viewport `02-product/reading-align-left.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text align: center | **OK** | Control found; viewport `02-product/reading-align-center.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text align: justify | **OK** | Control found; viewport `02-product/reading-align-justify.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Saturation: normal | **OK** | Control found; viewport `02-product/reading-saturation-normal.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Saturation: low | **OK** | Control found; viewport `02-product/reading-saturation-low.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Saturation: high | **OK** | Control found; viewport `02-product/reading-saturation-high.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Saturation: mono | **OK** | Control found; viewport `02-product/reading-saturation-mono.png` (compare to baseline for visual effect). |
| Product PDP (Gyda set) | Reading & vision | Text size +5 steps (larger) | **OK** | Baseline `02-product/reading-textscale-baseline.png`; after +5 `02-product/reading-textscale-plus5.png`. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: highContrast | **OK** | Toggled on, screenshot `02-product/motion-tile-high-contrast.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: readableFont | **OK** | Toggled on, screenshot `02-product/motion-tile-readable-font.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: pauseAnimations | **OK** | Toggled on, screenshot `02-product/motion-tile-pause-animations.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: highlightLinks | **OK** | Toggled on, screenshot `02-product/motion-tile-highlight-links.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: hideImages | **OK** | Toggled on, screenshot `02-product/motion-tile-hide-images.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: readingGuide | **OK** | Toggled on, screenshot `02-product/motion-tile-reading-guide.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: readingMask | **OK** | Toggled on, screenshot `02-product/motion-tile-reading-mask.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: bigCursor | **OK** | Toggled on, screenshot `02-product/motion-tile-big-cursor.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Motion & display | Tile ON → viewport: enhancedTooltips | **OK** | Toggled on, screenshot `02-product/motion-tile-enhanced-tooltips.png`, then toggled off in panel. |
| Product PDP (Gyda set) | Panel appearance | Plain light panel ON (panel open) | **OK** | Screenshot `02-product/chrome-plain-light-panel.png` — menu should use light theme. |
| Product PDP (Gyda set) | Panel appearance | Larger menu ON (panel open) | **OK** | Screenshot `02-product/chrome-oversized-panel.png` — launcher/panel should look larger. |
| Product PDP (Gyda set) | Navigation | Jump to headings | **OK** | After click `02-product/nav-jump-headings.png` — focus may be on first heading (not always visible). |
| Product PDP (Gyda set) | Navigation | Jump to links | **OK** | After click `02-product/nav-jump-links.png`. |
| Product PDP (Gyda set) | Cleanup | Reset all + clear preset | **OK** | `02-product/99-after-reset.png` |
| Account login | Widget | Host #carbon-a11y-widget + shadowRoot | **OK** | Widget script present. |
| Account login | Widget | Open panel (launcher) | **OK** | Panel opened. |
| Account login | Profiles | Screen reader | **OK** | Preset applied; viewport `03-login/profile-screen-reader.png`. |
| Account login | Profiles | Low vision | **OK** | Preset applied; viewport `03-login/profile-low-vision.png`. |
| Account login | Profiles | Motor | **OK** | Preset applied; viewport `03-login/profile-motor.png`. |
| Account login | Profiles | Dyslexia | **OK** | Preset applied; viewport `03-login/profile-dyslexia.png`. |
| Account login | Profiles | ADHD | **OK** | Preset applied; viewport `03-login/profile-adhd.png`. |
| Account login | Profiles | Seizure safe | **OK** | Preset applied; viewport `03-login/profile-seizure-safe.png`. |
| Account login | Reading & vision | Contrast mode: none | **OK** | Control found; viewport `03-login/reading-contrast-none.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Contrast mode: dark | **OK** | Control found; viewport `03-login/reading-contrast-dark.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Contrast mode: light | **OK** | Control found; viewport `03-login/reading-contrast-light.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Contrast mode: invert | **OK** | Control found; viewport `03-login/reading-contrast-invert.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Contrast mode: smart | **OK** | Control found; viewport `03-login/reading-contrast-smart.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text spacing: normal | **OK** | Control found; viewport `03-login/reading-spacing-normal.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text spacing: moderate | **OK** | Control found; viewport `03-login/reading-spacing-moderate.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text spacing: heavy | **OK** | Control found; viewport `03-login/reading-spacing-heavy.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Line height: normal | **OK** | Control found; viewport `03-login/reading-line-normal.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Line height: relaxed | **OK** | Control found; viewport `03-login/reading-line-relaxed.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Line height: loose | **OK** | Control found; viewport `03-login/reading-line-loose.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text align: default | **OK** | Control found; viewport `03-login/reading-align-default.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text align: left | **OK** | Control found; viewport `03-login/reading-align-left.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text align: center | **OK** | Control found; viewport `03-login/reading-align-center.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text align: justify | **OK** | Control found; viewport `03-login/reading-align-justify.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Saturation: normal | **OK** | Control found; viewport `03-login/reading-saturation-normal.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Saturation: low | **OK** | Control found; viewport `03-login/reading-saturation-low.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Saturation: high | **OK** | Control found; viewport `03-login/reading-saturation-high.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Saturation: mono | **OK** | Control found; viewport `03-login/reading-saturation-mono.png` (compare to baseline for visual effect). |
| Account login | Reading & vision | Text size +5 steps (larger) | **OK** | Baseline `03-login/reading-textscale-baseline.png`; after +5 `03-login/reading-textscale-plus5.png`. |
| Account login | Motion & display | Tile ON → viewport: highContrast | **OK** | Toggled on, screenshot `03-login/motion-tile-high-contrast.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: readableFont | **OK** | Toggled on, screenshot `03-login/motion-tile-readable-font.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: pauseAnimations | **OK** | Toggled on, screenshot `03-login/motion-tile-pause-animations.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: highlightLinks | **OK** | Toggled on, screenshot `03-login/motion-tile-highlight-links.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: hideImages | **OK** | Toggled on, screenshot `03-login/motion-tile-hide-images.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: readingGuide | **OK** | Toggled on, screenshot `03-login/motion-tile-reading-guide.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: readingMask | **OK** | Toggled on, screenshot `03-login/motion-tile-reading-mask.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: bigCursor | **OK** | Toggled on, screenshot `03-login/motion-tile-big-cursor.png`, then toggled off in panel. |
| Account login | Motion & display | Tile ON → viewport: enhancedTooltips | **OK** | Toggled on, screenshot `03-login/motion-tile-enhanced-tooltips.png`, then toggled off in panel. |
| Account login | Panel appearance | Plain light panel ON (panel open) | **OK** | Screenshot `03-login/chrome-plain-light-panel.png` — menu should use light theme. |
| Account login | Panel appearance | Larger menu ON (panel open) | **OK** | Screenshot `03-login/chrome-oversized-panel.png` — launcher/panel should look larger. |
| Account login | Navigation | Jump to headings | **OK** | After click `03-login/nav-jump-headings.png` — focus may be on first heading (not always visible). |
| Account login | Navigation | Jump to links | **OK** | After click `03-login/nav-jump-links.png`. |
| Account login | Cleanup | Reset all + clear preset | **OK** | `03-login/99-after-reset.png` |
| Jeans landing page | Widget | Host #carbon-a11y-widget + shadowRoot | **OK** | Widget script present. |
| Jeans landing page | Widget | Open panel (launcher) | **OK** | Panel opened. |
| Jeans landing page | Profiles | Screen reader | **OK** | Preset applied; viewport `04-jeans/profile-screen-reader.png`. |
| Jeans landing page | Profiles | Low vision | **OK** | Preset applied; viewport `04-jeans/profile-low-vision.png`. |
| Jeans landing page | Profiles | Motor | **OK** | Preset applied; viewport `04-jeans/profile-motor.png`. |
| Jeans landing page | Profiles | Dyslexia | **OK** | Preset applied; viewport `04-jeans/profile-dyslexia.png`. |
| Jeans landing page | Profiles | ADHD | **OK** | Preset applied; viewport `04-jeans/profile-adhd.png`. |
| Jeans landing page | Profiles | Seizure safe | **OK** | Preset applied; viewport `04-jeans/profile-seizure-safe.png`. |
| Jeans landing page | Reading & vision | Contrast mode: none | **OK** | Control found; viewport `04-jeans/reading-contrast-none.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Contrast mode: dark | **OK** | Control found; viewport `04-jeans/reading-contrast-dark.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Contrast mode: light | **OK** | Control found; viewport `04-jeans/reading-contrast-light.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Contrast mode: invert | **OK** | Control found; viewport `04-jeans/reading-contrast-invert.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Contrast mode: smart | **OK** | Control found; viewport `04-jeans/reading-contrast-smart.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text spacing: normal | **OK** | Control found; viewport `04-jeans/reading-spacing-normal.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text spacing: moderate | **OK** | Control found; viewport `04-jeans/reading-spacing-moderate.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text spacing: heavy | **OK** | Control found; viewport `04-jeans/reading-spacing-heavy.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Line height: normal | **OK** | Control found; viewport `04-jeans/reading-line-normal.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Line height: relaxed | **OK** | Control found; viewport `04-jeans/reading-line-relaxed.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Line height: loose | **OK** | Control found; viewport `04-jeans/reading-line-loose.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text align: default | **OK** | Control found; viewport `04-jeans/reading-align-default.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text align: left | **OK** | Control found; viewport `04-jeans/reading-align-left.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text align: center | **OK** | Control found; viewport `04-jeans/reading-align-center.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text align: justify | **OK** | Control found; viewport `04-jeans/reading-align-justify.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Saturation: normal | **OK** | Control found; viewport `04-jeans/reading-saturation-normal.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Saturation: low | **OK** | Control found; viewport `04-jeans/reading-saturation-low.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Saturation: high | **OK** | Control found; viewport `04-jeans/reading-saturation-high.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Saturation: mono | **OK** | Control found; viewport `04-jeans/reading-saturation-mono.png` (compare to baseline for visual effect). |
| Jeans landing page | Reading & vision | Text size +5 steps (larger) | **OK** | Baseline `04-jeans/reading-textscale-baseline.png`; after +5 `04-jeans/reading-textscale-plus5.png`. |
| Jeans landing page | Motion & display | Tile ON → viewport: highContrast | **OK** | Toggled on, screenshot `04-jeans/motion-tile-high-contrast.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: readableFont | **OK** | Toggled on, screenshot `04-jeans/motion-tile-readable-font.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: pauseAnimations | **OK** | Toggled on, screenshot `04-jeans/motion-tile-pause-animations.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: highlightLinks | **OK** | Toggled on, screenshot `04-jeans/motion-tile-highlight-links.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: hideImages | **OK** | Toggled on, screenshot `04-jeans/motion-tile-hide-images.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: readingGuide | **OK** | Toggled on, screenshot `04-jeans/motion-tile-reading-guide.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: readingMask | **OK** | Toggled on, screenshot `04-jeans/motion-tile-reading-mask.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: bigCursor | **OK** | Toggled on, screenshot `04-jeans/motion-tile-big-cursor.png`, then toggled off in panel. |
| Jeans landing page | Motion & display | Tile ON → viewport: enhancedTooltips | **OK** | Toggled on, screenshot `04-jeans/motion-tile-enhanced-tooltips.png`, then toggled off in panel. |
| Jeans landing page | Panel appearance | Plain light panel ON (panel open) | **OK** | Screenshot `04-jeans/chrome-plain-light-panel.png` — menu should use light theme. |
| Jeans landing page | Panel appearance | Larger menu ON (panel open) | **OK** | Screenshot `04-jeans/chrome-oversized-panel.png` — launcher/panel should look larger. |
| Jeans landing page | Navigation | Jump to headings | **OK** | After click `04-jeans/nav-jump-headings.png` — focus may be on first heading (not always visible). |
| Jeans landing page | Navigation | Jump to links | **OK** | After click `04-jeans/nav-jump-links.png`. |
| Jeans landing page | Cleanup | Reset all + clear preset | **OK** | `04-jeans/99-after-reset.png` |

## Screenshot map (by folder)

Each site id (`01-home` … `04-jeans`) contains:

| Pattern | Content |
|---------|---------|
| `00-baseline-closed.png` | Store before opening widget |
| `01-panel-open.png` | Panel open |
| `profile-*.png` | Viewport after each quick preset |
| `reading-contrast-*.png` | Each contrast mode |
| `reading-spacing-*.png` | Text spacing |
| `reading-line-*.png` | Line height |
| `reading-align-*.png` | Text alignment |
| `reading-saturation-*.png` | Saturation |
| `reading-textscale-*.png` | Text size baseline / +5 steps |
| `motion-tile-*.png` | Each motion/display tile ON (then turned off) |
| `chrome-*.png` | Panel appearance toggles (panel open) |
| `nav-*.png` | After jump to headings / links |
| `99-after-reset.png` | After full reset |

## Limits

- **Live region / SR** announcements are not in PNGs.  
- **Shadow DOM** only via host `#carbon-a11y-widget`.  
- **Iframes** not scanned.  
- **Tooltip hover** mode not tested here.

## References

- [Homepage](https://www.shopcarbon.com/)
- [Product](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72)
- [Login](https://shopcarbon.com/account/login)
- [Jeans](https://shopcarbon.com/pages/jeans)
