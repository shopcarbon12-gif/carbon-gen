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
6. **User data deletion:** In **App settings → Basic**, set either a **data deletion instructions URL** or a **Data Deletion Request callback** (HTTPS). If the instructions URL field shows a `name_placeholder` validation error, use the callback instead: deploy the app, then set the callback to `https://app.shopcarbon.com/api/meta/facebook-data-deletion` (implemented in-repo; requires **`META_APP_SECRET`** for `signed_request` verification).

7. Complete **App Review** for production if users outside your Meta roles need access.
8. Store **long-lived user/page tokens** only on the server (database or secrets), never in client bundles.

Environment hints:

- `META_APP_ID` — referenced by `/api/meta/status` until full OAuth exists.
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID` — Instagram user id from Graph (the **Instagram Business Account** id, not the Facebook Page id).
- `META_PAGE_ACCESS_TOKEN` — Page access token with permissions to read that account’s media (used server-side by `GET /api/studio/instagram-feed` for the `/studio/instagram-widget` preview).

With both set, the studio preview loads **live media** in the existing 2×3 scrollable grid. The API reports observable status only (`credentials_incomplete` + `missingEnv`, `graph_error`, `no_media`, `insufficient_media`, or success)—it does not guess why the feed is empty beyond what Graph and env inspection return.
