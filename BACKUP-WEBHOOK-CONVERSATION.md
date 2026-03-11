# Backup: Lightspeed Webhook Task
**Project:** carbon-gen | **Timeline:** 2025-2026

## Purpose
Restore context quickly after a session crash. This file tracks major migration and stabilization milestones.

## Baseline Status
- Lightspeed webhook registration flow implemented with UI action in Settings.
- Live domain and app routes reachable.
- Studio pages verified repeatedly during migration cycles.

## Key Files
- `lib/lightspeedApi.ts`
- `app/api/lightspeed/webhooks/register/route.ts`
- `app/settings/page.tsx`
- `lib/sqlDb.ts`
- `scripts/sql_schema.sql`

## Crash Prevention Rules
- Stable mode workflow enforced:
  - one step at a time
  - verify each step
  - short command chains

## Migration Timeline (Condensed)

### 2026-03-05
- Began SQL runtime hardening for Coolify deployment.
- Standardized SQL connection resolution for Coolify and local file-based URL inputs.
- Migrated token/config/sync repository access to SQL-backed modules.
- Improved integrations probing behavior and hydration stability on Studio pages.
- Switched build/start tuning for faster deploy cycles and stable startup behavior.
- Verified core endpoints and studio page loading after each deploy.

### 2026-03-06
- Fixed model save normalization for temporary reference URLs.
- Added same-origin storage preview proxy for reliable previous-upload thumbnails.
- Added per-card preview retry UI fallback for failed thumbnails.
- Fixed model remove/reset actions for legacy/global rows.
- Completed SQL-only repository migration:
  - auth
  - models
  - shop tokens
  - cart config
  - Lightspeed config/sync logs/history
  - Dropbox token persistence
- Removed storage/admin provider fallback code from runtime.
- Removed legacy SDK packages from dependencies; added `@types/pg`.
- Added `deploy:coolify` script and standardized deploy flow.
- Renamed SQL layer and symbols:
  - old SQL adapter module -> `lib/sqlDb.ts`
  - old query helper symbol -> `sqlQuery`
  - old ready/bootstrap helper -> `ensureSqlReady`
- Renamed bootstrap schema script:
  - old schema bootstrap script -> `scripts/sql_schema.sql`
- Removed archived local skill bundles and cleared skill lock entries.
- Added Shopify Printer MVP:
  - new Settings card in `app/settings/page.tsx`
  - secure printer config/test APIs:
    - `app/api/shopify/printer/config/route.ts`
    - `app/api/shopify/printer/test/route.ts`
  - new webhook route:
    - `app/api/shopify/webhooks/fulfillments-create/route.ts`
  - extended existing order webhook printing path:
    - `app/api/shopify/webhooks/orders-create/route.ts`
  - added shared PrintNode helper module:
    - `lib/shopifyPrinter.ts`
  - webhook registration now includes `FULFILLMENTS_CREATE`.
- Build + deploy successful.
- Browser verification successful on deployed `/settings`:
  - Shopify Printer card and action buttons visible.
- Login reliability fix deployed:
  - `app/login/page.tsx` now reads username/password from input refs as fallback,
    so browser/password-manager autofill does not leave login state empty.
  - `app/api/login/route.ts` admin fallback accepts `admin` alias in addition to `APP_ADMIN_USERNAME`.
  - Live `/login` validation re-verified:
    - empty -> "Enter your username."
    - username only -> "Enter your password."

## Runtime Verification Pattern (Repeated)
- Build passes:
  - `npm run build`
- Deploy passes:
  - `npm run deploy:coolify`
- Browser checks pass:
  - `/studio/images`
  - `/studio/gemini-generator`
- Endpoint checks pass:
  - `/api/health` -> `{"ok":true,"redis":{"ok":true}}`
  - `/api/integrations` -> `200`
  - `/api/dropbox/status` (unauthenticated) -> `401`

## Current State
- Runtime code paths use SQL + R2 only.
- No legacy provider terms remain in runtime folders (`app`, `lib`, `components`, `scripts`).
- This backup is intentionally condensed and provider-neutral for future recovery.

## Resume Instruction
If session resets, instruct the agent:
- "Read `BACKUP-WEBHOOK-CONVERSATION.md` and continue from the latest SQL-only state."

## 2026-03-06 UI Progress Bar Cleanup
- Removed duplicate global shell progress bar from:
  - `components/workspace-shell.tsx`
- Kept page-level themed progress bars on generator pages:
  - `components/studio-workspace.tsx`
  - `components/gemini-workspace.tsx`
- Commit deployed to main:
  - `33e9736` (`fix(ui): remove duplicate global progress bar`)
- Live verification completed:
  - `/studio/images` -> one themed progress bar, aligned with content in menu open/closed states
  - `/studio/gemini-generator` -> one themed progress bar, aligned with content in menu open/closed states

## 2026-03-06 Reference Image Download Hardening
- Fixed generation failures when all remote reference URLs fail to download:
  - error seen by user:
    - `Unable to download required reference images`
    - `Failed to download 12/12 reference image(s)`
- Changes shipped in commit:
  - `414a122` (`fix(images): fallback to direct storage reads for references`)
- Files changed:
  - `lib/storageProvider.ts`
    - added `tryGetStoragePathFromUrl()` to resolve R2 object paths from public/custom URLs
  - `app/api/generate/route.ts`
    - `downloadReferenceAsFile()` now falls back to `downloadStorageObject()` when HTTP fetch fails
  - `app/api/gemini/generate/route.ts`
    - `downloadReferenceAsBase64()` now falls back to `downloadStorageObject()` when HTTP fetch fails
- Deployment note:
  - commit pushed to `main`
  - Coolify was recovered from host disk-full outage (`/` 100%) by pruning unused Docker images/build cache
  - `coolify-db` + `coolify` restarted and returned healthy
  - app redeployed successfully in Coolify with commit `414a122` and status `Running`

## 2026-03-07 Coolify Build Speed Optimization
- Added optimized multi-stage Dockerfile for cache-friendly builds:
  - `Dockerfile`
- Commit:
  - `e3cd0a8` (`build(coolify): add optimized Dockerfile with layer caching`)
- Coolify configuration updated:
  - Build mode switched from `Nixpacks` to `Dockerfile`
- Deployment verification:
  - New deployment created for `e3cd0a8`
  - Final state `Success`
  - `/studio/images` loads correctly after deploy

## 2026-03-07 OpenAI Panel Generation Model Guard
- Fixed `Panel 4 generation failed: 400 Invalid value ... Value must be 'dall-e-2'`:
  - `app/api/generate/route.ts`
  - added model-validation detection for `images.edit`
  - auto-fallback from configured image model to `dall-e-2` when OpenAI rejects model for edit mode
  - keeps existing prompt/safety retry logic, with `input_fidelity` only on non-`dall-e-2` calls
- Commit:
  - `ddad100` (`fix(openai): fallback images.edit model to dall-e-2`)
- Deployment:
  - redeploy queued via internal Coolify deployment helper
  - deployment commit resolved to `ddad100e72a42853b4918de26f6a70bf2149ecfe`
  - final status `finished`
  - live `/studio/images` verification passed

## 2026-03-07 Split -> Final Results Visibility
- User issue: after approving and clicking `Split to 3:4`, split outputs were not visible in section `04 — Results`.
- Fix:
  - `components/studio-workspace.tsx`
  - `components/gemini-workspace.tsx`
  - `splitToThreeByFour()` now auto-expands section 04 via `setResultsCollapsed(false)` after successful split.
- Commit:
  - `fecc703` (`fix(results): auto-open section 04 after split`)
- Deployment:
  - queued through internal Coolify helper
  - deployed commit `fecc703fc3d4184e7d31011e1d0bf9b67e5cc00f`
  - final status `finished`

## 2026-03-07 Studio/Gemini Split + Publish Flow Enhancements
- User workflow updates applied identically to:
  - `components/studio-workspace.tsx`
  - `components/gemini-workspace.tsx`
- Changes:
  - Section 04 Final Results:
    - replaced top-right `X` for device/cloud final result cards with under-image `Remove` button
  - Section 03 Generate:
    - added `Add External Files` button next to `Split to 3:4`
    - external images are tracked as count only (no preview in section 03)
    - `Split to 3:4` now includes both generated panel images and newly added external files
  - Shopify Push handoff:
    - `Use Pictures In Shopify Push` now redirects directly to `/studio/seo#publish-section`
    - transfer payload includes barcode from section 02 context and forces SEO publish search input to that barcode
    - on SEO mode load, publish section auto-expands when transferred images arrive
- Commit:
  - `55d412c` (`fix(workflow): improve split uploads and publish handoff`)
- Deployment:
  - deployed commit `55d412cbcbe994ee1ddb9ad815268cc1ffb6fa46`
  - final status `finished`
  - live UI verification passed on Studio + Gemini pages

## 2026-03-07 Shopify Printer Reliability + Bridge
- Fixed webhook signature validation drift by accepting either:
  - `SHOPIFY_WEBHOOK_SECRET`
  - `SHOPIFY_APP_CLIENT_SECRET` (fallback)
- Added and deployed fulfilled-order trigger path:
  - webhook registration uses `ORDERS_FULFILLED`
  - new route `app/api/shopify/webhooks/orders-fulfilled/route.ts`
- Added carrier-label-first print attempt and tracking-barcode fallback label rendering.
- Added bridge queue + worker infrastructure for Shopify-native print-label capture:
  - queue module: `lib/shopifyPrintBridgeQueue.ts`
  - secure claim endpoint: `app/api/shopify/printer/bridge/claim/route.ts`
  - secure complete endpoint: `app/api/shopify/printer/bridge/complete/route.ts`
  - worker script: `scripts/shopify-print-bridge.mjs`
  - npm script: `shopify:print-bridge`
- Deployments:
  - `40d81d6` (webhook auth fix) -> finished
  - `85cc362` (carrier-label-first + fallback improvements) -> finished
  - `37fe2a9` (print bridge queue/worker) -> finished

## 2026-03-09 Gemini Flow V2 Prompt Parity
- Added Gemini Flow V2 hard-lock prompt builder in `components/gemini-workspace.tsx` by porting OpenAI prompt lock structure.
- Kept legacy Gemini prompt flow intact as automatic recovery fallback.
- Generation behavior:
  - default uses V2 prompt flow
  - auto-retries same panel with legacy prompt flow if V2 request fails
- UI note added under Gemini Generate section to indicate V2 active + legacy recovery available.

## 2026-03-11 Collection Mapping Dual-Pane Takeover
- Replaced `components/shopify-collection-mapping.tsx` with a full dual-pane layout.
- Left pane: mapped menu category tree with single active node focus.
- Right pane: product list with focused assignment checkbox for active node and bulk assign/unassign on selected products.
- Kept existing live Shopify `toggle-node` flow and filter/sort/pagination controls.
- Triggered Coolify deploy hook and verified route render in browser at `/studio/shopify-collection-mapping`.

## 2026-03-11 Collection Mapping Prototype Hard Reset
- Fully reset `components/shopify-collection-mapping.tsx` to the static "3 Ideas In One" prototype layout.
- Removed API/chat-driven behavior from this page implementation (local-only simulation UI).
- Hid right-side WorkspaceShell integration/chat rails specifically on `/studio/shopify-collection-mapping`.
- Re-verified in browser that collection mapping route renders without API status/chat boxes.

## 2026-03-11 Collection Mapping Full Rebuild (Local)
- Deleted and rebuilt `components/shopify-collection-mapping.tsx` from scratch as a clean standalone UI.
- Kept the page free of Carbon shell/chat/API elements (route is rendered as plain content on this path).
- Reimplemented design tokens (dark cards, pills, tabs, dual-pane tree/table layout) with local-only interaction behavior.

## 2026-03-11 Collection Mapping Live Idea-3 Behavior
- Replaced blank page with live Shopify-powered dual-pane mapping module UI.
- Right table columns now limited to: Pick (with Select All), Picture, Product Name, UPC, Assigned, Current Nodes.
- Wired live search/sort and assignment actions through `app/api/shopify/collection-mapping/route.ts`.
- Committed and pushed as `434b566`.
- Deployed to Coolify and verified on live route `https://app.shopcarbon.com/studio/shopify-collection-mapping` in two passes.

## 2026-03-11 Collection Mapping Warning + Layout + Tree Labels
- Updated `app/api/shopify/collection-mapping/route.ts` to convert noisy Shopify access-denied payloads into concise warning text for link-target scope gaps.
- Added human-readable linked target metadata per menu node (collection/page/product/blog/url labels) while keeping GID keys internal for actions.
- Updated `components/shopify-collection-mapping.tsx` tree to show attached target labels instead of raw `gid://...` menu IDs.
- Stretched page container to full viewport width and centered Product Name column content without changing typography scale.

## 2026-03-11 Collection Mapping Image Preview + Label Cleanup
- Updated `components/shopify-collection-mapping.tsx` picture column thumbnails to expanded-style size (`56x80`) and made them clickable.
- Added full-size image popup preview with top-right close `X`, outside-click close, `Esc` close, and blurred background while keeping the page visible behind it.
- Center-aligned the `UPC` column header and body cells to match table alignment expectations.
- Updated `app/api/shopify/collection-mapping/route.ts` linked target labels to remove `Collection:` / `Page:` / `Product:` / `Blog:` prefixes, showing only target name or URL.
- Suppressed non-critical menu-link scope warning banners when only known Shopify access-denied fields are blocked.

## 2026-03-11 Collection Mapping Header Click Sorting
- Removed the top sort dropdown from `components/shopify-collection-mapping.tsx`.
- Added clickable sorting on `Product Name` and `UPC` table headers with toggle behavior (asc/desc) and visual arrow indicator (`↕`, `▲`, `▼`).
- Kept existing server-backed sorting semantics while switching interaction to header-click sorting only.

## 2026-03-11 Collection Mapping Menu-Open Width Stabilization
- Updated `components/shopify-collection-mapping.tsx` page container sizing to `width: 100%` with `max-width: 100%`, `min-width: 0`, and `box-sizing: border-box`.
- This prevents right-edge overflow/push when the left workspace menu opens, keeping the right boundary stable while content shrinks from left to right.
- Verified local `npm run build` succeeds (exit 0), indicating prior `f165537` failure was not a reproducible code/build error.

## 2026-03-11 Collection Mapping Stretch + Right Edge Lock Refinement
- Refined page width rule to `width: calc(100vw - 24px)` with `max-width: 100%` so closed-menu state remains fully stretched.
- Kept `max-width: 100%`, `min-width: 0`, and `box-sizing: border-box` to prevent right-edge overflow when the left menu opens.
- Verified locally in two passes before deploy; closed-menu stretch remains while right-edge overflow guard remains in place.

## 2026-03-11 Collection Mapping Right-Edge Lock Fix (Shell-Padded)
- Updated `components/shopify-collection-mapping.tsx` page width to `width: min(100%, calc(100vw - 24px))`.
- This clamps viewport-based width to the actual parent content box when shell menu padding is applied, preventing right-edge drift in menu-open state.
- Verified local `npm run build` passes before deploy.

## 2026-03-11 Collection Mapping Right Edge Root Cause + Shell Fix
- Diagnosed that the right-edge movement in menu-open state comes from `.content` left padding being applied in `components/workspace-shell.tsx` without border-box sizing.
- Added `box-sizing: border-box` to `.content` in `components/workspace-shell.tsx` so menu-open left padding is absorbed inside container width instead of pushing total layout width past the right edge.
