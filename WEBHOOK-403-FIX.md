# Lightspeed Webhook – 403 Fix

## Current status
- Retail token works (no more "access token is not valid")
- 403 = Carbon Studio app lacks webhook permissions in Lightspeed

## Fix options

**Option A:** Go to https://us.merchantos.com/setup/api and add the webhook manually:
- Callback: `https://carbon-gen-iota.vercel.app/api/lightspeed/webhooks/sale-update`
- Event: `sale.update`

**Option B:** Add the `webhooks` OAuth scope to Carbon Studio in Lightspeed, re-authorize, update `LS_REFRESH_TOKEN` in Vercel, then click Register Sale Webhook again.
