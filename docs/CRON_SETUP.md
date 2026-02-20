# Cron Jobs for 24/7 Sync (Cloudflare)

The app runs on Cloudflare. For automatic sync to work 24/7 without visiting the site, use an external cron service to hit the API endpoints.

## Endpoints

| Endpoint | Purpose | Suggested schedule |
|----------|---------|--------------------|
| `GET /api/cron/cart-sync` | Push Cart Inventory → Shopify | Every 15 min |
| `GET /api/cron/lightspeed-catalog-warm` | Warm LS catalog cache | Every 30 min |

## Setup (cron-job.org or similar)

1. Create a free account at [cron-job.org](https://cron-job.org) or [Uptime Robot](https://uptimerobot.com).
2. Add a new cron job:
   - **URL:** `https://YOUR-DOMAIN.com/api/cron/cart-sync`
   - **Method:** GET
   - **Headers:** `Authorization: Bearer YOUR_CRON_SECRET`
   - **Schedule:** Every 15 minutes (`*/15 * * * *`)
   - **Timeout:** 300 seconds
3. Add another for LS catalog warm:
   - **URL:** `https://YOUR-DOMAIN.com/api/cron/lightspeed-catalog-warm`
   - **Schedule:** Every 30 minutes (`*/30 * * * *`)

Or pass the secret in the query string:  
`https://YOUR-DOMAIN.com/api/cron/cart-sync?secret=YOUR_CRON_SECRET`

## Manual trigger

- From the UI: "Push to Shopify" runs immediately (you must stay on the page).
- From anywhere: Call `GET /api/cron/cart-sync` with `Authorization: Bearer CRON_SECRET` when logged in, or use the secret.
- For true "fire and forget" (close tab, sync continues), the cron above must run. Manual push runs in the request; closing the tab cancels it.

## Cloudflare native cron (optional)

Cloudflare Workers support cron triggers, but the OpenNext worker does not expose a `scheduled` handler by default. To use native cron, you would need a small separate Worker with a `scheduled()` handler that fetches your app’s `/api/cron/cart-sync` URL.

## LS sync (sales, quantity updates)

The Cart → Shopify push is implemented. Syncing sales and quantity updates back to Lightspeed can be added to the cron flow when that integration is ready.
