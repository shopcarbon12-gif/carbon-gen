# UserWay — storefront verification (shopcarbon.com)

**Generated:** 2026-03-26T07:43:20.654Z  
**Runner:** `node scripts/run-userway-storefront-report.mjs`  
**Folder:** `reports/userway-shopcarbon-storefront/`

**Counts:** 50 **OK**, 4 **FAIL**

## Executive summary

| Item | Result |
|------|--------|
| **UserWay on all 4 URLs?** | **No** — API appeared on **product** and **jeans** only; **www** and **login** had no `window.UserWay` (Shopify app / host rules). See **FAIL** rows below. |
| **Named profiles (Blind, Motor, …)?** | **Not in this widget** — UserWay’s menu is toggle-based; documented as N/A with explanation. |
| **Reading & vision** | **Yes** on URLs where UserWay loads: `Contrast +` UI (3 steps) + `window.UserWay` APIs (contrast, smart contrast, big text, fonts, spacing, line height, align, saturation, dyslexia, hide images). |
| **Motion & display** | **Yes** — highlight links, pause animations, cursor, tooltips, reading guide/mask, read page, inline dictionary (API + screenshots). |
| **Navigation** | **Yes** — `pageStructureHeaders`, `pageStructureLandmarks`, `pageStructureLinks` + `pageStructureDisable`. |
| **MCP** | This run used **Playwright** (headless Chromium) with `window.UserWay` and iframe DOM — same class of automation as MCP `browser_evaluate` / `browser_navigate`. |

**Regenerate:** `node scripts/run-userway-storefront-report.mjs` (requires `npx playwright install chromium` if needed).

## Important: where UserWay loads

On the live theme, **UserWay often loads only on certain host/path combinations** (e.g. `shopcarbon.com` product/content pages) and may be **absent on `www.shopcarbon.com`** or **login** depending on Shopify app injection. Rows marked **FAIL** for “UserWay API” mean the script never appeared in that session — not that UserWay is broken globally.

UserWay’s **customer menu does not mirror Carbon-style named profiles** (Blind, Low vision, …). This report documents **toggles + APIs** that exist on the loaded widget.

## Results

| Page | Area | Test | Result | Notes |
|------|------|------|--------|-------|
| Homepage (www.shopcarbon.com) | Widget | UserWay (window.UserWay API) | **FAIL** | No UserWay on this URL in this session (common on www/login if only shopcarbon.com loads the app embed). |
| Homepage (www.shopcarbon.com) | Profiles | Preset profiles (Blind / Motor / …) | **FAIL** | Skipped — UserWay not loaded. When present, UserWay uses toggles, not Carbon-style named profiles. |
| Product PDP (Gyda set) | Widget | UserWay (window.UserWay API) | **OK** | UserWay script loaded and API available. |
| Product PDP (Gyda set) | Profiles | Named accessibility profiles (Blind / Low vision / …) | **OK** | **Not applicable:** UserWay’s customer menu has no named presets like Carbon Assist—only toggles (see `02-product/01-widget-open.png`). “Oversized Widget” appears as copy in the panel but is not a separate button in this build (buttons start at Contrast +). |
| Product PDP (Gyda set) | Reading & vision (UI) | Contrast + multi-step (3 clicks) | **OK** | Cycled UI “Contrast +” three times → `02-product/reading-ui-contrast-step-1.png` … `step-3.png`; then resetAll. |
| Product PDP (Gyda set) | Reading & vision | Invert / contrast (base) | **OK** | API contrastEnable → viewport `02-product/reading-invert-contrast-base.png`; then contrastDisable. |
| Product PDP (Gyda set) | Reading & vision | Smart contrast | **OK** | API enableSmartContrast → viewport `02-product/reading-smart-contrast.png`; then disableSmartContrast. |
| Product PDP (Gyda set) | Reading & vision | Bigger text | **OK** | API bigTextEnable → viewport `02-product/reading-bigger-text.png`; then bigTextDisable. |
| Product PDP (Gyda set) | Reading & vision | Legible fonts | **OK** | API legibleFontsEnable → viewport `02-product/reading-legible-fonts.png`; then legibleFontsDisable. |
| Product PDP (Gyda set) | Reading & vision | Text spacing | **OK** | API textSpacingEnable → viewport `02-product/reading-text-spacing.png`; then textSpacingDisable. |
| Product PDP (Gyda set) | Reading & vision | Line height | **OK** | API lineHeightEnable → viewport `02-product/reading-line-height.png`; then lineHeightDisable. |
| Product PDP (Gyda set) | Reading & vision | Text align | **OK** | API textAlignEnable → viewport `02-product/reading-text-align.png`; then textAlignDisable. |
| Product PDP (Gyda set) | Reading & vision | Saturation | **OK** | API saturationEnable → viewport `02-product/reading-saturation.png`; then saturationDisable. |
| Product PDP (Gyda set) | Reading & vision | Dyslexia font | **OK** | API dyslexiaFontEnable → viewport `02-product/reading-dyslexia-font.png`; then dyslexiaFontDisable. |
| Product PDP (Gyda set) | Reading & vision | Hide images | **OK** | API enableHideImages → viewport `02-product/reading-hide-images.png`; then disableHideImages. |
| Product PDP (Gyda set) | Motion & display | Highlight links | **OK** | API highlightEnable → `02-product/motion-highlight-links.png`; then highlightDisable. |
| Product PDP (Gyda set) | Motion & display | Pause animations | **OK** | API stopAnimationEnable → `02-product/motion-pause-animations.png`; then stopAnimationDisable. |
| Product PDP (Gyda set) | Motion & display | Big cursor | **OK** | API bigCursorEnable → `02-product/motion-big-cursor.png`; then bigCursorDisable. |
| Product PDP (Gyda set) | Motion & display | Tooltips | **OK** | API tooltipsEnable → `02-product/motion-tooltips.png`; then tooltipsDisable. |
| Product PDP (Gyda set) | Motion & display | Reading guide | **OK** | API readingGuideEnable → `02-product/motion-reading-guide.png`; then readingGuideDisable. |
| Product PDP (Gyda set) | Motion & display | Reading mask | **OK** | API readingMaskEnable → `02-product/motion-reading-mask.png`; then readingMaskDisable. |
| Product PDP (Gyda set) | Motion & display | Read page (TTS) | **OK** | API readPageEnable → `02-product/motion-read-page-tts.png`; then readPageDisable. |
| Product PDP (Gyda set) | Motion & display | Inline dictionary | **OK** | API inlineDictionaryEnable → `02-product/motion-inline-dictionary.png`; then inlineDictionaryDisable. |
| Product PDP (Gyda set) | Navigation | Jump / structure: headers | **OK** | API pageStructureHeaders → `02-product/nav-jump-structure-headers.png`; then pageStructureDisable. |
| Product PDP (Gyda set) | Navigation | Jump / structure: landmarks | **OK** | API pageStructureLandmarks → `02-product/nav-jump-structure-landmarks.png`; then pageStructureDisable. |
| Product PDP (Gyda set) | Navigation | Jump / structure: links | **OK** | API pageStructureLinks → `02-product/nav-jump-structure-links.png`; then pageStructureDisable. |
| Product PDP (Gyda set) | Cleanup | resetAll + widgetClose | **OK** | `02-product/99-after-reset-close.png` |
| Account login | Widget | UserWay (window.UserWay API) | **FAIL** | No UserWay on this URL in this session (common on www/login if only shopcarbon.com loads the app embed). |
| Account login | Profiles | Preset profiles (Blind / Motor / …) | **FAIL** | Skipped — UserWay not loaded. When present, UserWay uses toggles, not Carbon-style named profiles. |
| Jeans landing page | Widget | UserWay (window.UserWay API) | **OK** | UserWay script loaded and API available. |
| Jeans landing page | Profiles | Named accessibility profiles (Blind / Low vision / …) | **OK** | **Not applicable:** UserWay’s customer menu has no named presets like Carbon Assist—only toggles (see `04-jeans/01-widget-open.png`). “Oversized Widget” appears as copy in the panel but is not a separate button in this build (buttons start at Contrast +). |
| Jeans landing page | Reading & vision (UI) | Contrast + multi-step (3 clicks) | **OK** | Cycled UI “Contrast +” three times → `04-jeans/reading-ui-contrast-step-1.png` … `step-3.png`; then resetAll. |
| Jeans landing page | Reading & vision | Invert / contrast (base) | **OK** | API contrastEnable → viewport `04-jeans/reading-invert-contrast-base.png`; then contrastDisable. |
| Jeans landing page | Reading & vision | Smart contrast | **OK** | API enableSmartContrast → viewport `04-jeans/reading-smart-contrast.png`; then disableSmartContrast. |
| Jeans landing page | Reading & vision | Bigger text | **OK** | API bigTextEnable → viewport `04-jeans/reading-bigger-text.png`; then bigTextDisable. |
| Jeans landing page | Reading & vision | Legible fonts | **OK** | API legibleFontsEnable → viewport `04-jeans/reading-legible-fonts.png`; then legibleFontsDisable. |
| Jeans landing page | Reading & vision | Text spacing | **OK** | API textSpacingEnable → viewport `04-jeans/reading-text-spacing.png`; then textSpacingDisable. |
| Jeans landing page | Reading & vision | Line height | **OK** | API lineHeightEnable → viewport `04-jeans/reading-line-height.png`; then lineHeightDisable. |
| Jeans landing page | Reading & vision | Text align | **OK** | API textAlignEnable → viewport `04-jeans/reading-text-align.png`; then textAlignDisable. |
| Jeans landing page | Reading & vision | Saturation | **OK** | API saturationEnable → viewport `04-jeans/reading-saturation.png`; then saturationDisable. |
| Jeans landing page | Reading & vision | Dyslexia font | **OK** | API dyslexiaFontEnable → viewport `04-jeans/reading-dyslexia-font.png`; then dyslexiaFontDisable. |
| Jeans landing page | Reading & vision | Hide images | **OK** | API enableHideImages → viewport `04-jeans/reading-hide-images.png`; then disableHideImages. |
| Jeans landing page | Motion & display | Highlight links | **OK** | API highlightEnable → `04-jeans/motion-highlight-links.png`; then highlightDisable. |
| Jeans landing page | Motion & display | Pause animations | **OK** | API stopAnimationEnable → `04-jeans/motion-pause-animations.png`; then stopAnimationDisable. |
| Jeans landing page | Motion & display | Big cursor | **OK** | API bigCursorEnable → `04-jeans/motion-big-cursor.png`; then bigCursorDisable. |
| Jeans landing page | Motion & display | Tooltips | **OK** | API tooltipsEnable → `04-jeans/motion-tooltips.png`; then tooltipsDisable. |
| Jeans landing page | Motion & display | Reading guide | **OK** | API readingGuideEnable → `04-jeans/motion-reading-guide.png`; then readingGuideDisable. |
| Jeans landing page | Motion & display | Reading mask | **OK** | API readingMaskEnable → `04-jeans/motion-reading-mask.png`; then readingMaskDisable. |
| Jeans landing page | Motion & display | Read page (TTS) | **OK** | API readPageEnable → `04-jeans/motion-read-page-tts.png`; then readPageDisable. |
| Jeans landing page | Motion & display | Inline dictionary | **OK** | API inlineDictionaryEnable → `04-jeans/motion-inline-dictionary.png`; then inlineDictionaryDisable. |
| Jeans landing page | Navigation | Jump / structure: headers | **OK** | API pageStructureHeaders → `04-jeans/nav-jump-structure-headers.png`; then pageStructureDisable. |
| Jeans landing page | Navigation | Jump / structure: landmarks | **OK** | API pageStructureLandmarks → `04-jeans/nav-jump-structure-landmarks.png`; then pageStructureDisable. |
| Jeans landing page | Navigation | Jump / structure: links | **OK** | API pageStructureLinks → `04-jeans/nav-jump-structure-links.png`; then pageStructureDisable. |
| Jeans landing page | Cleanup | resetAll + widgetClose | **OK** | `04-jeans/99-after-reset-close.png` |

## Screenshot naming

- `00-baseline.png` — before interaction  
- `01-widget-open.png` — panel open
- `reading-ui-contrast-step-1..3.png` — Contrast + UI cycle (3 modes)
- `reading-*.png` — after each reading/vision API enable
- `motion-*.png` — after each motion/display API enable  
- `nav-*.png` — after page structure API  
- `99-after-reset-close.png` — after reset + close  

## References

- [Homepage](https://www.shopcarbon.com/)
- [Product](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72)
- [Login](https://shopcarbon.com/account/login)
- [Jeans](https://shopcarbon.com/pages/jeans)
