# Instagram Graph API (Meta) — setup checklist

Use this when wiring **Phase 2** (feed from Graph API instead of Elfsight).

1. Go to [Meta for Developers](https://developers.facebook.com/) → **My Apps** → **Create App** and pick a use case that supports **Instagram** / business tools (wizard labels change over time).
2. Add the **Instagram** product (Instagram Graph API).
3. Use **Instagram Graph API** with Facebook Login for a **Business / Creator** Instagram account — not Basic Display alone for a storefront marketing feed.
4. Link the Instagram account to a **Facebook Page** (required for Graph API).
5. Configure **OAuth redirect URIs** for your Carbon app (e.g. `https://<your-app>/api/instagram/meta/callback` once implemented).
6. Request the permissions your app needs (e.g. `instagram_basic`, `pages_show_list`; add commerce/insights only if required).
7. Complete **App Review** for production if users outside your Meta roles need access.
8. Store **long-lived user/page tokens** only on the server (database or secrets), never in client bundles.

Environment hints:

- `META_APP_ID` — referenced by `/api/meta/status` until full OAuth exists.
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID` — Instagram user id from Graph (the **Instagram Business Account** id, not the Facebook Page id).
- `META_PAGE_ACCESS_TOKEN` — Page access token with permissions to read that account’s media (used server-side by `GET /api/studio/instagram-feed` for the `/studio/instagram-widget` preview).

With both set, the studio preview loads **live media** in the existing 2×3 scrollable grid. The API reports observable status only (`credentials_incomplete` + `missingEnv`, `graph_error`, `no_media`, `insufficient_media`, or success)—it does not guess why the feed is empty beyond what Graph and env inspection return.
