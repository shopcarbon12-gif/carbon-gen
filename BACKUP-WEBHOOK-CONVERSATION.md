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
- Added `deploy:vercel` script and standardized deploy flow.
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
  - `npm run deploy:vercel`
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
