# Account links accessibility — before / after

## Problem (from storefront audit)

- **Where:** Live homepage HTML (e.g. `https://shopcarbon.com/`), not Shopify Admin → Navigation → Menus.
- **What:** Four `<a href="…/account">` elements with class pattern **`premium-feature__link`**, **no visible text**, and **no accessible name** (`aria-label`, labelled text, or image `alt`). Screen readers and voice control could not identify the control.
- **Source in repo:** Captured as `accessibilityHome.unnamedLinkPattern` in `tmp/website-deep-audit/audit-data.json` → `premium-feature__link /account`.

## Before

| Location | Behavior |
|----------|----------|
| Theme markup (not in `carbon-gen`; Archetype / similar) | Something like: `<a class="premium-feature__link" href="/account">` + icon only, no text, no `aria-label`. |
| This repository | No `premium-feature__link` Liquid files — fix must be applied on the **Shopify theme** (or via an injected snippet). |

## After

| Location | Change |
|----------|--------|
| **`shopify/snippets/carbon-account-links-a11y.liquid`** (new) | Small script: for each `a.premium-feature__link[href*="/account"]` that still has **no** accessible name, set `aria-label` from Shopify translation **`customer.account.title`**, or fallback **`Account`**. Runs on `DOMContentLoaded`, short timeout, and `shopify:section:load`. |
| **`layout/theme.liquid`** (Shopify — publish with widget) | Before `</body>`, in this order: `{% render 'carbon-account-links-a11y' %}` then `{% render 'carbon-accessibility-widget' %}` (see `shopify/snippets/carbon-accessibility-widget.liquid` comment). |

## Deploy checklist

1. **Coolify / app** — `npm run deploy:coolify` (with `ALLOW_COOLIFY_DEPLOY=true` if your guard requires it) ships `/accessibility/widget` (`__caRev=126`, invert mount + panel scrollbar gutter).
2. **Shopify theme** — In Admin → Themes → Edit code: add/update snippet **`carbon-account-links-a11y`** from `shopify/snippets/carbon-account-links-a11y.liquid`; update **`carbon-accessibility-widget`** and **`theme.liquid`** so both snippets render before `</body>` and the script URL uses **`wrev=126`**.

## What we did *not* change

- No edits to the mystery theme file that outputs `premium-feature__link` (it is not versioned here). The **ideal** long-term fix is still to add visible or visually hidden text in that template; this snippet is a **safe, scoped** remediation that matches the audited selector.

## Verify

1. Open homepage → DevTools → select each account icon link → **Accessibility** pane → **Name** should be “Account” (or translated title).
2. Re-run your audit or axe: unnamed `/account` count for that pattern should drop to zero after the snippet is live.
