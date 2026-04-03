# Cron jobs for 24/7 sync (Coolify / public URL)

Production runs on **Coolify** (containerized Next). For automatic sync without keeping a browser open, use an external cron service or your host’s scheduler to hit these HTTPS endpoints.

## Endpoints

| Endpoint | Purpose | Suggested schedule |
|----------|---------|--------------------|
| `GET /api/cron/cart-sync` | Push Cart Inventory → Shopify | Every 15 min |
| `GET /api/cron/lightspeed-catalog-warm` | Warm LS catalog cache | Every 30 min |
| `GET /api/cron/accessibility-monthly-report` | Send monthly accessibility compliance reminder email | 1st day monthly |

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
4. Add monthly accessibility reminder:
   - **URL:** `https://YOUR-DOMAIN.com/api/cron/accessibility-monthly-report`
   - **Schedule:** first day of month (`0 14 1 * *`)
   - **Headers:** `Authorization: Bearer YOUR_CRON_SECRET`

Or pass the secret in the query string:  
`https://YOUR-DOMAIN.com/api/cron/cart-sync?secret=YOUR_CRON_SECRET`

Monthly reminder env vars (used by `/api/cron/accessibility-monthly-report`):

- `ACCESSIBILITY_REPORT_EMAIL` (default: `elior@carbonjeanscompany.com`)
- `ACCESSIBILITY_STATEMENT_URL` (default: `https://www.shopcarbon.com/pages/accessibility`)
- `ACCESSIBILITY_FEEDBACK_URL` (optional)
- `ACCESSIBILITY_SUPPORT_EMAIL` (optional, falls back to report email)
- `RESEND_API_KEY` (required)

## Manual trigger

- From the UI: "Push to Shopify" runs immediately (you must stay on the page).
- From anywhere: Call `GET /api/cron/cart-sync` with `Authorization: Bearer CRON_SECRET` when logged in, or use the secret.
- For true "fire and forget" (close tab, sync continues), the cron above must run. Manual push runs in the request; closing the tab cancels it.

## LS sync (sales, quantity updates)

The Cart → Shopify push is implemented. Syncing sales and quantity updates back to Lightspeed can be added to the cron flow when that integration is ready.
