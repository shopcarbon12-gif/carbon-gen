# Accessibility widget QA screenshots

Captured on **`http://localhost:3000/accessibility`** with the runtime widget mounted (Playwright MCP). Use these as visual evidence for builder + widget behavior.

| File | What it shows |
|------|----------------|
| `a11y-01-builder-widget-not-mounted.png` | Builder page before runtime install / widget not mounted. |
| `a11y-02-launcher-collapsed.png` | Collapsed launcher (AA + label) after install. |
| `a11y-03-dialog-open-language-profiles.png` | Dialog open: language radiogroup + profile chips. |
| `a11y-04-dialog-scrolled-adjustments-jumps-reset.png` | Panel scrolled to Adjustments (contrast, spacing, jumps, Reset). |
| `a11y-05-readable-font-on-live-region.png` | Readable Font on + status/live region text. |
| `a11y-06-dialog-fresh-persisted-state.png` | Dialog open with persisted toggles (e.g. high contrast, readable font, contrast dark). |
| `a11y-07-text-120-live-region.png` | Text scale **120%** + live region (“Text size 120 percent”). |
| `a11y-08-text-spacing-moderate-live-region.png` | Text spacing **Moderate** + live region (“Text spacing: Moderate”). |
| `a11y-09-language-espanol-panel.png` | **Español** selected; panel strings localized (Idioma, Perfiles, quick controls in Spanish). |
| `a11y-10-saturation-baja-live-region.png` | Saturation **Baja** + live region (“Saturation: Baja”). |
| `a11y-11-profile-ceguera-live-region.png` | **Ceguera** (Blind) profile applied + live region (“Profile applied: Ceguera”); multiple quick toggles on. |
| `a11y-12-jump-headings-fullpage.png` | After **Jump to headings** — full-page capture; focus moved to first page heading; live region “Moved to first heading”. |
| `a11y-13-reset-live-region-defaults.png` | After **Restablecer/Reset** — defaults (100% text, Normal spacing/saturation, etc.) + live region “Accessibility settings reset”. |
| `a11y-14-panel-closed-launcher.png` | Panel closed via **Close**; launcher visible collapsed. |
| `a11y-prod-accessibility-page-verify.png` | **Production** (`https://app.shopcarbon.com/accessibility`) — post-deploy smoke: builder loads. |

## Collection Mapping (production)

Captured on **`https://app.shopcarbon.com/shopify-collection-mapping`** with Playwright MCP after products loaded (≈50 rows, KPI summary visible).

| File | What it shows |
|------|----------------|
| `collection-mapping-prod-viewport.png` | Viewport: summary chips, menu tree, product table with **Suggested** chips (e.g. dress direct-collection labels), Decision/Status. |
| `collection-mapping-prod-fullpage.png` | Full-page scroll capture of the same session. |
| `collection-mapping-prod-post-deploy-verify.png` | Post-deploy smoke: Collection Mapping with data loaded (KPI strip + suggestion chips). |

## QA notes (this run)

- **Next.js Fast Refresh** fired often during clicks; it can remount the page and drop the runtime widget. For long runs, avoid editing files while testing or re-click **Reload widget on this page** after a refresh.
- **Panel pattern (post-change):** Runtime panel is a **non-modal `role="region"`** (no `aria-modal`, no focus trap). **`Esc` closes only when focus is inside the panel**; after jump-to-heading, focus is in the page — **Esc correctly does nothing** for the widget. Re-capture a few screenshots if you need AT tree evidence that matches `region`.
- After jump, snapshot once showed the panel **title** in English while the **body** stayed Spanish — worth a follow-up if full locale consistency is required.

## Reproduce

1. Start dev server, open `/accessibility`.
2. Use **Reload widget on this page** / install flow until the runtime widget is mounted.
3. Open the panel and step through controls; capture viewport or `fullPage` screenshots as needed.
