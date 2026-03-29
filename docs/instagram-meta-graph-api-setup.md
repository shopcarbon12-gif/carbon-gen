# Instagram Graph API (Meta) — setup checklist

Use this when wiring the Instagram feed from the **Meta Graph API** (Carbon-owned app).

## Carbon app (live in Meta)

| Field | Value |
| --- | --- |
| **Display name** | Carbon Social Feed |
| **App ID** | `2429351210871746` |
| **Use case** | Authenticate and request data from users with **Facebook Login** |
| **Business** | CARBON (verified) |

Deep links (replace if Meta changes URLs):

- [App dashboard](https://developers.facebook.com/apps/2429351210871746/dashboard/)
- [Use cases](https://developers.facebook.com/apps/2429351210871746/use_cases/)
- [Facebook Login → Settings (OAuth)](https://developers.facebook.com/apps/2429351210871746/use_cases/customize/?use_case_enum=FB_LOGIN&selected_tab=settings)

## Wizard notes (2026 UI)

1. Go to [Meta for Developers](https://developers.facebook.com/) → **My Apps** → **Create App**. Meta may block trademarks like “Instagram” in the **app name**; use a neutral name (e.g. **Carbon Social Feed**).
2. Choose **Facebook Login** as the initial use case. In the current console, **Instagram Graph** access is gated through **permissions** on that use case (and Page + Instagram Business linkage), not always a separate “Instagram” product card.
3. Under **Use cases** → **Customize** → **Permissions and features**, add the Graph permissions you need (e.g. `pages_show_list`, `instagram_basic`, `pages_read_engagement`; add commerce/insights only if required).
4. Use a **Business / Creator** Instagram account linked to a **Facebook Page** (required for Graph API marketing feeds — not Basic Display alone).
5. Under **Facebook Login** → **Settings**, set **Valid OAuth Redirect URIs** to match your app exactly (strict mode). Production URI **`https://app.shopcarbon.com/api/instagram/meta/callback`** is registered on app `2429351210871746`. The app exposes a **stub** handler at `GET /api/instagram/meta/callback` (requires Carbon login; completes token exchange later). For local dev, add e.g. `http://localhost:3000/api/instagram/meta/callback` if your dev server uses that origin.
6. **User data deletion (Basic settings)**  
   - **Instructions URL (recommended for Go live when `app.shopcarbon.com` is unreachable from Meta’s crawler):**  
     Use a **dedicated** storefront page — **not** the same URL as Privacy policy (Meta may show `name_placeholder should represent a valid URL`).  
     **Canonical URL:** `https://shopcarbon.com/pages/facebook-data-deletion`  
     - **Theme:** add `shopify/sections/carbon-meta-data-deletion.liquid` + `shopify/templates/page.carbon-meta-data-deletion.json`, then create a Page with handle `facebook-data-deletion` and template **carbon-meta-data-deletion**.  
     - **Or** paste `shopify/meta-data-deletion-shopify-admin.html` (single `div.page-width.rte` — no extra comments) via **Show HTML** on that page.  
     - **Or** run `npm run shopify:sync-meta-data-deletion-page` (needs `SHOPIFY_SHOP_DOMAIN` + `SHOPIFY_ADMIN_ACCESS_TOKEN` in `.env.local`) to create/update the page via the Admin API.  
   - **Callback URL (full automation):** `https://app.shopcarbon.com/api/meta/facebook-data-deletion`  
     - `GET` / `HEAD` return success for probes; `POST` accepts `signed_request` (needs **`META_APP_SECRET`**).  
     - **Requires** `app.shopcarbon.com` to be **publicly reachable** (no timeout from the internet). If Go live shows **Broken URL**, fix Coolify/firewall/DNS first, or keep **instructions URL** until fixed.

7. **Go live — “Broken URL detected”**  
   - Meta expects HTTP **200–299** for crawled URLs (see [Sharing Debugger](https://developers.facebook.com/tools/debug/sharing/)).  
   - If **`https://app.shopcarbon.com/`** times out, set **Website → Site URL** to a working URL (e.g. `https://shopcarbon.com/`) until the app host is fixed.  
   - Run locally: `npm run verify:meta-urls` to print status codes for the main URLs.

8. Complete **App Review** for production if users outside your Meta roles need access.
9. Store **long-lived user/page tokens** only on the server (database or secrets), never in client bundles.
10. **Meta App Review login (`meta_review` user):** Seeding from your laptop can hit a **different** Postgres than production. On Coolify in **production**, set only **`META_REVIEW_SEED_PASSWORD`** (≥8 chars); on each server start the app upserts **`meta-review@shopcarbon.com`** into **that** Postgres. For **local dev**, also set **`META_REVIEW_AUTO_PROVISION=true`** or startup skips (safety). Remove or rotate the password from env after review if you prefer.

Environment hints:

- `META_APP_ID` — referenced by `/api/meta/status` until full OAuth exists.
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID` — Instagram user id from Graph (the **Instagram Business Account** id, not the Facebook Page id).
- `META_PAGE_ACCESS_TOKEN` — Page access token with permissions to read that account’s media (used server-side by `GET /api/studio/instagram-feed` for the `/studio/instagram-widget` preview).

With both set, the studio preview loads **live media** in the existing 2×3 scrollable grid. The API reports observable status only (`credentials_incomplete` + `missingEnv`, `graph_error`, `no_media`, `insufficient_media`, or success)—it does not guess why the feed is empty beyond what Graph and env inspection return.
