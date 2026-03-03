# Lightspeed Sale Webhook Setup

## Manual setup (recommended if API returns 403)

1. Open **https://us.merchantos.com/setup/api** in your browser (logged into Lightspeed).
2. Add a new webhook:
   - **URL:** `https://app.shopcarbon.com/api/lightspeed/webhooks/sale-update`
   - **Event:** Sale (or sale.update)
3. Save.

## API setup (Settings > Register Sale Webhook)

Uses Retail API token from `us.retail.lightspeed.app/api/1.0/token`. If you get 403, the Carbon Studio app may need the `webhooks` OAuth scope—add it in Lightspeed developer settings and re-authorize.
