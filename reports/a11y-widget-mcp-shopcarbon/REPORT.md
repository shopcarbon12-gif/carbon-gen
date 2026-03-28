# Carbon Assist widget — storefront verification report

**Generated:** 2026-03-26T06:09:54.063Z  
**Tool:** Playwright (local script `scripts/run-a11y-widget-storefront-report.mjs`)  
**Targets:** https://www.shopcarbon.com/, https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72, https://shopcarbon.com/account/login, https://shopcarbon.com/pages/jeans

## How to read this

- **OK** means the automation completed the action and saved a PNG; it does not guarantee perfect visual QA.
- **Proof** paths are relative to this folder: `reports/a11y-widget-mcp-shopcarbon/`.
- The widget lives in **closed shadow DOM**; MCP/browser snapshots may not list inner controls—this run uses `#carbon-a11y-widget` host + `shadowRoot` queries.

## Summary table

| Page | Area | Test | Result | Notes |
|------|------|------|--------|-------|
| Homepage (www.shopcarbon.com) | Widget | Script injected (#carbon-a11y-widget + shadow) | **OK** | Host present |
| Homepage (www.shopcarbon.com) | Widget | Open panel | **OK** | Launcher click |
| Homepage (www.shopcarbon.com) | Profiles | Blind | **OK** | Viewport after apply → `01-home/profile-blind.png` |
| Homepage (www.shopcarbon.com) | Profiles | Low Vision | **OK** | Viewport after apply → `01-home/profile-low-vision.png` |
| Homepage (www.shopcarbon.com) | Profiles | Motor | **OK** | Viewport after apply → `01-home/profile-motor.png` |
| Homepage (www.shopcarbon.com) | Profiles | Dyslexia | **OK** | Viewport after apply → `01-home/profile-dyslexia.png` |
| Homepage (www.shopcarbon.com) | Profiles | ADHD | **OK** | Viewport after apply → `01-home/profile-adhd.png` |
| Homepage (www.shopcarbon.com) | Profiles | Seizure Safe | **OK** | Viewport after apply → `01-home/profile-seizure-safe.png` |
| Homepage (www.shopcarbon.com) | Reading & vision | Contrast mode → Dark | **OK** | Page chrome should darken → `01-home/reading-contrast-dark.png` |
| Homepage (www.shopcarbon.com) | Reading & vision | Text scale +2 steps | **OK** | Larger root font → `01-home/reading-textscale-up.png` |
| Homepage (www.shopcarbon.com) | Motion & display | High contrast tile | **OK** | Screenshot → `01-home/motion-high-contrast.png` |
| Homepage (www.shopcarbon.com) | Motion & display | Pause animations tile | **OK** | Screenshot → `01-home/motion-pause-animations.png` |
| Homepage (www.shopcarbon.com) | Navigation | Jump to headings (control present & clickable) | **OK** | After click → `01-home/nav-jump-headings.png` (focus/announcement may not show in screenshot) |
| Homepage (www.shopcarbon.com) | Navigation | Jump to links | **OK** | After click → `01-home/nav-jump-links.png` |
| Homepage (www.shopcarbon.com) | Cleanup | Reset all + clear profile | **OK** | `01-home/99-after-reset.png` |
| Product PDP (Gyda set) | Widget | Script injected (#carbon-a11y-widget + shadow) | **OK** | Host present |
| Product PDP (Gyda set) | Widget | Open panel | **OK** | Launcher click |
| Product PDP (Gyda set) | Profiles | Blind | **OK** | Viewport after apply → `02-product/profile-blind.png` |
| Product PDP (Gyda set) | Profiles | Low Vision | **OK** | Viewport after apply → `02-product/profile-low-vision.png` |
| Product PDP (Gyda set) | Profiles | Motor | **OK** | Viewport after apply → `02-product/profile-motor.png` |
| Product PDP (Gyda set) | Profiles | Dyslexia | **OK** | Viewport after apply → `02-product/profile-dyslexia.png` |
| Product PDP (Gyda set) | Profiles | ADHD | **OK** | Viewport after apply → `02-product/profile-adhd.png` |
| Product PDP (Gyda set) | Profiles | Seizure Safe | **OK** | Viewport after apply → `02-product/profile-seizure-safe.png` |
| Product PDP (Gyda set) | Reading & vision | Contrast mode → Dark | **OK** | Page chrome should darken → `02-product/reading-contrast-dark.png` |
| Product PDP (Gyda set) | Reading & vision | Text scale +2 steps | **OK** | Larger root font → `02-product/reading-textscale-up.png` |
| Product PDP (Gyda set) | Motion & display | High contrast tile | **OK** | Screenshot → `02-product/motion-high-contrast.png` |
| Product PDP (Gyda set) | Motion & display | Pause animations tile | **OK** | Screenshot → `02-product/motion-pause-animations.png` |
| Product PDP (Gyda set) | Navigation | Jump to headings (control present & clickable) | **OK** | After click → `02-product/nav-jump-headings.png` (focus/announcement may not show in screenshot) |
| Product PDP (Gyda set) | Navigation | Jump to links | **OK** | After click → `02-product/nav-jump-links.png` |
| Product PDP (Gyda set) | Cleanup | Reset all + clear profile | **OK** | `02-product/99-after-reset.png` |
| Account login | Widget | Script injected (#carbon-a11y-widget + shadow) | **OK** | Host present |
| Account login | Widget | Open panel | **OK** | Launcher click |
| Account login | Profiles | Blind | **OK** | Viewport after apply → `03-login/profile-blind.png` |
| Account login | Profiles | Low Vision | **OK** | Viewport after apply → `03-login/profile-low-vision.png` |
| Account login | Profiles | Motor | **OK** | Viewport after apply → `03-login/profile-motor.png` |
| Account login | Profiles | Dyslexia | **OK** | Viewport after apply → `03-login/profile-dyslexia.png` |
| Account login | Profiles | ADHD | **OK** | Viewport after apply → `03-login/profile-adhd.png` |
| Account login | Profiles | Seizure Safe | **OK** | Viewport after apply → `03-login/profile-seizure-safe.png` |
| Account login | Reading & vision | Contrast mode → Dark | **OK** | Page chrome should darken → `03-login/reading-contrast-dark.png` |
| Account login | Reading & vision | Text scale +2 steps | **OK** | Larger root font → `03-login/reading-textscale-up.png` |
| Account login | Motion & display | High contrast tile | **OK** | Screenshot → `03-login/motion-high-contrast.png` |
| Account login | Motion & display | Pause animations tile | **OK** | Screenshot → `03-login/motion-pause-animations.png` |
| Account login | Navigation | Jump to headings (control present & clickable) | **OK** | After click → `03-login/nav-jump-headings.png` (focus/announcement may not show in screenshot) |
| Account login | Navigation | Jump to links | **OK** | After click → `03-login/nav-jump-links.png` |
| Account login | Cleanup | Reset all + clear profile | **OK** | `03-login/99-after-reset.png` |
| Jeans landing page | Widget | Script injected (#carbon-a11y-widget + shadow) | **OK** | Host present |
| Jeans landing page | Widget | Open panel | **OK** | Launcher click |
| Jeans landing page | Profiles | Blind | **OK** | Viewport after apply → `04-jeans/profile-blind.png` |
| Jeans landing page | Profiles | Low Vision | **OK** | Viewport after apply → `04-jeans/profile-low-vision.png` |
| Jeans landing page | Profiles | Motor | **OK** | Viewport after apply → `04-jeans/profile-motor.png` |
| Jeans landing page | Profiles | Dyslexia | **OK** | Viewport after apply → `04-jeans/profile-dyslexia.png` |
| Jeans landing page | Profiles | ADHD | **OK** | Viewport after apply → `04-jeans/profile-adhd.png` |
| Jeans landing page | Profiles | Seizure Safe | **OK** | Viewport after apply → `04-jeans/profile-seizure-safe.png` |
| Jeans landing page | Reading & vision | Contrast mode → Dark | **OK** | Page chrome should darken → `04-jeans/reading-contrast-dark.png` |
| Jeans landing page | Reading & vision | Text scale +2 steps | **OK** | Larger root font → `04-jeans/reading-textscale-up.png` |
| Jeans landing page | Motion & display | High contrast tile | **OK** | Screenshot → `04-jeans/motion-high-contrast.png` |
| Jeans landing page | Motion & display | Pause animations tile | **OK** | Screenshot → `04-jeans/motion-pause-animations.png` |
| Jeans landing page | Navigation | Jump to headings (control present & clickable) | **OK** | After click → `04-jeans/nav-jump-headings.png` (focus/announcement may not show in screenshot) |
| Jeans landing page | Navigation | Jump to links | **OK** | After click → `04-jeans/nav-jump-links.png` |
| Jeans landing page | Cleanup | Reset all + clear profile | **OK** | `04-jeans/99-after-reset.png` |

## Per-page screenshot index

### Homepage (www.shopcarbon.com) (`01-home/`)

- `01-home/00-baseline-closed.png` — storefront before opening widget
- `01-home/01-panel-open.png` — menu open (if widget loaded)
- `01-home/profile-*.png` — one per profile (viewport after apply)
- `01-home/reading-contrast-dark.png`, `reading-textscale-up.png`
- `01-home/motion-high-contrast.png`, `motion-pause-animations.png`
- `01-home/nav-jump-headings.png`, `nav-jump-links.png`
- `01-home/99-after-reset.png` — after footer reset

### Product PDP (Gyda set) (`02-product/`)

- `02-product/00-baseline-closed.png` — storefront before opening widget
- `02-product/01-panel-open.png` — menu open (if widget loaded)
- `02-product/profile-*.png` — one per profile (viewport after apply)
- `02-product/reading-contrast-dark.png`, `reading-textscale-up.png`
- `02-product/motion-high-contrast.png`, `motion-pause-animations.png`
- `02-product/nav-jump-headings.png`, `nav-jump-links.png`
- `02-product/99-after-reset.png` — after footer reset

### Account login (`03-login/`)

- `03-login/00-baseline-closed.png` — storefront before opening widget
- `03-login/01-panel-open.png` — menu open (if widget loaded)
- `03-login/profile-*.png` — one per profile (viewport after apply)
- `03-login/reading-contrast-dark.png`, `reading-textscale-up.png`
- `03-login/motion-high-contrast.png`, `motion-pause-animations.png`
- `03-login/nav-jump-headings.png`, `nav-jump-links.png`
- `03-login/99-after-reset.png` — after footer reset

### Jeans landing page (`04-jeans/`)

- `04-jeans/00-baseline-closed.png` — storefront before opening widget
- `04-jeans/01-panel-open.png` — menu open (if widget loaded)
- `04-jeans/profile-*.png` — one per profile (viewport after apply)
- `04-jeans/reading-contrast-dark.png`, `reading-textscale-up.png`
- `04-jeans/motion-high-contrast.png`, `motion-pause-animations.png`
- `04-jeans/nav-jump-headings.png`, `nav-jump-links.png`
- `04-jeans/99-after-reset.png` — after footer reset


## What is not fully automated

- **Live regions / screen reader** announcements (e.g. “Contrast mode: Dark”) are not captured in PNGs.
- **Keyboard-only** flows (radiogroup arrows) were not exercised; clicks were used.
- **Every** contrast / spacing / line-height / align / saturation combination would produce dozens of shots per URL; this run uses representative checks (dark contrast + text scale + two motion tiles + both nav commands).

## References

- [shopcarbon.com homepage](https://www.shopcarbon.com/)
- [Gyda product](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72)
- [Login](https://shopcarbon.com/account/login)
- [Jeans page](https://shopcarbon.com/pages/jeans)
