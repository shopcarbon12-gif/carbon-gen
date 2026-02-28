# Backup: Lightspeed Webhook Conversation Summary

**Date:** Feb 2025  
**Project:** carbon-gen (Carbon Creative Studio)  
**Task:** Register Lightspeed sale webhook for event-driven sync

---

## What Was Done

1. **Retail-specific token** – Added `refreshLightspeedRetailToken(domainPrefix)` in `lib/lightspeedApi.ts` so webhook registration uses `us.retail.lightspeed.app/api/1.0/token` instead of `cloud.merchantos.com` (which returns tokens incompatible with Retail API 2.0).

2. **Webhook register route** – `app/api/lightspeed/webhooks/register/route.ts` now uses `refreshLightspeedRetailToken(domainPrefix)` and accepts `domainPrefix` from body if `LS_DOMAIN_PREFIX` is not set in env.

3. **Settings UI** – "Register Sale Webhook" button added under Lightspeed API in Settings. Disabled when Lightspeed is disconnected; shows success/error message after click.

4. **Deploy** – Code deployed to https://carbon-gen-iota.vercel.app.

---

## Current Status

- **401** → API requires auth (session cookie or `Authorization: Bearer {CRON_SECRET}`).
- **403** → Lightspeed returns 403 on webhook registration. Likely causes:
  - Carbon Studio app missing `webhooks` OAuth scope.
  - Or the API format does not match what Lightspeed expects.

---

## How to Register the Webhook

**Option A – Via API (with CRON_SECRET):**
```powershell
$secret = "<CRON_SECRET from .env.local or Vercel>"
$headers = @{ "Authorization" = "Bearer $secret"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://carbon-gen-iota.vercel.app/api/lightspeed/webhooks/register" -Method POST -Headers $headers -Body '{"domainPrefix":"us"}'
```

**Option B – Via browser:**
1. Log in to https://carbon-gen-iota.vercel.app
2. Go to Settings
3. Ensure Lightspeed is connected (green status)
4. Click "Register Sale Webhook"

**Option C – Manual in Lightspeed (if API returns 403):**
1. Open https://us.merchantos.com/setup/api (logged into Lightspeed)
2. Add webhook URL: `https://carbon-gen-iota.vercel.app/api/lightspeed/webhooks/sale-update`
3. Event: Sale / sale.update

---

## Important Paths

| Purpose              | Path                                               |
|----------------------|----------------------------------------------------|
| Retail token logic   | `lib/lightspeedApi.ts` → `refreshLightspeedRetailToken` |
| Webhook registration | `app/api/lightspeed/webhooks/register/route.ts`    |
| Webhook receiver     | `app/api/lightspeed/webhooks/sale-update/route.ts` |
| Settings page        | `app/settings/page.tsx`                           |

---

## Environment Variables (Vercel)

- `LS_CLIENT_ID`, `LS_CLIENT_SECRET`, `LS_REFRESH_TOKEN` – Lightspeed OAuth
- `LS_DOMAIN_PREFIX` – `us` for US retail (or pass in body)
- `CRON_SECRET` – For cron and API auth
- `LS_SALE_WEBHOOK_SECRET` – For verifying incoming webhook signatures (falls back to CRON_SECRET)

---

## Reinstalling Cursor / Moving to D:

To back up so a new install can use this:

1. Copy this file: `d:\Projects\My project\carbon-gen\BACKUP-CONVERSATION-WEBHOOK-TASK.md`
2. After reinstalling, open it and share it with the new AI context, e.g.:
   - "Read BACKUP-CONVERSATION-WEBHOOK-TASK.md and continue the Lightspeed webhook task."

Conversation history lives in Cursor’s data, not in the project. This backup file is the way to restore context after a reinstall.
