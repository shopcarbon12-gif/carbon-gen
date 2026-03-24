# Responsive layout audit: header utility bar and shell topbar

**Date:** 2026-03-23  
**Scope:** Mid-width viewports where the Accessibility **Docs / Tickets / Log History / Widget** strip and **Publish Changes** shared one row and clipped or crowded the right edge; plus shared **WorkspaceShell** topbar spacing on narrow screens.

## Summary

| Area | Issue | Change |
|------|--------|--------|
| `PremiumSegmentedNav` | Root used `max-w-[min(680px,92vw)]` and a single flex row with two `shrink-0` groups, so tabs + Publish fought for width between ~900px and ~1100px. | Root is `w-full min-w-0`. Below **1101px** the bar **stacks**: tabs first, full-width Publish. From **1101px** up, row layout returns with a **scrollable** tab strip (`overflow-x-auto` + `flex-1 min-w-0`) so Publish keeps space. |
| `app/accessibility/page.module.css` | Grid/flex children could not shrink (`min-width: auto` default). | `min-width: 0` on `.panelUtilityBar` and `.mainCol`; `.toolbarCluster` gets `min-width: 0` and `flex-wrap: wrap`. |
| `components/workspace-shell.tsx` | Topbar padding/gaps stayed large on tablets; title row had no `min-width: 0`. | New `@media (max-width: 900px)` tightens `.topbar` padding/gap, sets `.topbar-title { min-width: 0 }`, caps logo width slightly. |

## Files touched

- `components/premium-segmented-nav/PremiumSegmentedNav.tsx`
- `app/accessibility/page.module.css`
- `components/workspace-shell.tsx`

## Screenshots (before / after)

Captured with Playwright at fixed viewport heights (800px), top of page (not full-page). Paths are relative to the repo root.

### Accessibility (`/accessibility`)

| Width | Before | After |
|------:|--------|-------|
| 1100px | `docs/qa-screenshots/responsive-report/BEFORE-accessibility-1100w.png` | `docs/qa-screenshots/responsive-report/AFTER-accessibility-1100w.png` |
| 900px | `docs/qa-screenshots/responsive-report/BEFORE-accessibility-900w.png` | `docs/qa-screenshots/responsive-report/AFTER-accessibility-900w.png` |
| 720px | `docs/qa-screenshots/responsive-report/BEFORE-accessibility-720w.png` | `docs/qa-screenshots/responsive-report/AFTER-accessibility-720w.png` |
| 520px | `docs/qa-screenshots/responsive-report/BEFORE-accessibility-520w.png` | `docs/qa-screenshots/responsive-report/AFTER-accessibility-520w.png` |

### Other studio route (shell topbar sample)

| Width | Before | After |
|------:|--------|-------|
| 900px | `docs/qa-screenshots/responsive-report/BEFORE-studio-seo-900w.png` | `docs/qa-screenshots/responsive-report/AFTER-studio-seo-900w.png` |

Route: `/studio/seo` (any `WorkspaceShell` page behaves similarly for the fixed topbar).

## Cross-page note

- **`PremiumSegmentedNav`** is only mounted on **`/accessibility`** (no other imports today). Responsive behavior there is fully covered by the screenshots above.
- **`WorkspaceShell`** wraps most studio pages; the **900px topbar** media query applies **everywhere** the shell is used, so resize behavior is improved cross-page for the fixed header (logo + title + menu toggle).

## How to re-capture

From repo root, with `npm run dev` on port 3000:

```bash
node -e "const { chromium } = require('playwright'); (async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 800 } }); await p.goto('http://localhost:3000/accessibility', { waitUntil: 'networkidle' }); await p.screenshot({ path: 'docs/qa-screenshots/responsive-report/sample.png' }); await b.close(); })();"
```

## Verification checklist

1. `/accessibility` at **950px**: Publish has comfortable padding; no overlap with the right column.
2. `/accessibility` at **800px**: Stacked layout — Publish full width under tabs.
3. `/accessibility` at **1200px**: Single row; all four tabs visible or strip scrolls if space is tight.
4. Any shell page at **850px**: Topbar does not clip; title ellipsis still works on `.topbar-page-lock`.
