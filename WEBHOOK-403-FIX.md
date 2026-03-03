# Lightspeed Sync Solutions

## Webhook 403 Forbidden (Deprecated)
Automatically registering the `sale.update` webhook via the Lightspeed API results in a **403 Forbidden** error because the Carbon Studio API keys lack the explicit `webhooks` OAuth scope.

## The Solution: Coolify Native Scheduled Tasks
Instead of relying on webhooks (which require manual intervention) or Vercel (which we are deprecating), we have perfectly replicated the original polling behavior from `vercel.json` directly into **Coolify's Scheduled Tasks** native runner.

### Replicated Schedules in Coolify
These 5 cron jobs now execute natively within the `carbon-gen` Docker container using `wget` to hit the internal Node.js process:

1. **Sales Sync (Daytime)** - `* 0-2,14-23 * * *`
2. **Sales Sync (Nighttime)** - `0 3-13 * * *`
3. **Cart Sync** - `* * * * *`
4. **Lightspeed Catalog Warm** - `0 3 * * *`
5. **Daily Sync Report** - `55 4 * * *`

### Verification
- Navigate to your project in the Coolify Dashboard -> **Configuration** -> **Scheduled Tasks**.
- The cron logs will display the native stdout.
- *There is no further manual action required in MerchantOS.*
