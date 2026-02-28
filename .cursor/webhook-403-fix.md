# Lightspeed Webhook Registration – 403 Fix

## Status
- **Retail token** is working (no more "access token is not valid")
- **403 Forbidden** = Carbon Studio app does not have webhook permissions in Lightspeed

## How to fix 403

### Option A: Add webhook via Lightspeed API setup page
1. Go to: **https://us.merchantos.com/setup/api**
2. Log in to Lightspeed.
3. In the API setup area, add a webhook manually.
4. Callback URL: `https://carbon-gen-iota.vercel.app/api/lightspeed/webhooks/sale-update`
5. Event: `sale.update`

### Option B: Add webhooks scope and re-authorize
1. In Lightspeed developer/API settings, add the **webhooks** OAuth scope to the Carbon Studio app.
2. Re-authorize Carbon Studio to obtain a new refresh token with that scope.
3. Update `LS_REFRESH_TOKEN` in Vercel with the new token.
4. Click **Register Sale Webhook** again in Settings.

## Test command (with CRON_SECRET)
```powershell
$secret = (Get-Content ".env.local" | Where-Object { $_ -match '^CRON_SECRET=' } | ForEach-Object { ($_ -split '=', 2)[1].Trim().Trim('"').Trim("'") })[0]
Invoke-RestMethod -Uri "https://carbon-gen-iota.vercel.app/api/lightspeed/webhooks/register" -Method POST -Headers @{ "Authorization" = "Bearer $secret"; "Content-Type" = "application/json" } -Body '{"domainPrefix":"us"}'
```
