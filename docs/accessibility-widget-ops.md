# Accessibility Widget Ops Guide

## Local development

- Side workspace URL: `http://localhost:3101/accessibility`
- Dev auth helper (localhost only): `POST /api/dev/local-auth-session`

## Settings persistence API

- `GET /api/accessibility/settings?scope=<name>`
- `PUT /api/accessibility/settings?scope=<name>`
- Auth required (`carbon_gen_auth_v1` cookie, same app auth model)

Storage behavior:

- Uses SQL when database is configured
- Falls back to local file for dev when SQL is unavailable:
  - `.tmp/accessibility-widget-config.json`

## Widget install modes

### Managed scope snippet (recommended)

Loads config server-side by scope.

```html
<script src="https://app.shopcarbon.com/accessibility/widget?scope=default" defer></script>
```

### Static snapshot snippet

Embeds full config in query string.

```html
<script src="https://app.shopcarbon.com/accessibility/widget?config=..." defer></script>
```

## Usage analytics API

- `POST /api/accessibility/usage`
  - public runtime endpoint used by widget script
  - payload: `{ scope, eventName, payload }`
- `GET /api/accessibility/usage?days=30`
  - auth required
  - returns aggregated counts by event

Tracked runtime events include:

- `panel_open`, `panel_close`
- `toggle_<feature>`
- `text_scale_change`
- `reset`

## Monthly compliance reminder

Endpoint:

- `POST /api/cron/accessibility-monthly-report`

Status endpoint:

- `GET /api/accessibility/monthly-report-status`
  - auth required
  - returns last send attempt status (success/failure, time, recipient)

Failure webhook (optional):

- `ACCESSIBILITY_ALERT_WEBHOOK_URL`
  - if set, monthly report failures trigger a webhook POST payload
  - Slack incoming webhook is supported via `text` payload

## Law/regulation watch automation

Cron endpoint:

- `POST /api/cron/accessibility-law-watch`
  - checks tracked legal/regulatory sources for content changes
  - sends alert email when changes are detected (or when `force=true`)

Status endpoint:

- `GET /api/accessibility/law-watch-status`
  - auth required
  - returns last law-watch run state and detected changes

Vercel cron:

- `/api/cron/accessibility-law-watch` at `30 13 * * *` (daily)

Env vars:

- `ACCESSIBILITY_LAW_WATCH_EMAIL` (optional alert recipient override)
- `ACCESSIBILITY_LAW_WATCH_SOURCES_JSON` (optional array override for tracked sources)

## Exports and trend history

- `GET /api/accessibility/export?format=json|csv&scope=default&days=30`
  - includes checklist trend history (`checklistTrendHistory`) in JSON
  - includes month-over-month trend fields in CSV (`trendCurrent*`, `trendPrev*`, `trendSeries`)

Auth:

- `Authorization: Bearer $CRON_SECRET` (or app auth cookie)

Recipient resolution order:

1. `to` query param (validated email)
2. saved `monthlyReportEmail` from settings scope `default`
3. `ACCESSIBILITY_REPORT_EMAIL`
4. `elior@carbonjeanscompany.com`

## Required env vars

- `RESEND_API_KEY` (required for sending email)
- `CRON_SECRET` (required for external cron auth)

Optional:

- `ACCESSIBILITY_REPORT_EMAIL`
- `ACCESSIBILITY_STATEMENT_URL`
- `ACCESSIBILITY_FEEDBACK_URL`
- `ACCESSIBILITY_SUPPORT_EMAIL`
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`

