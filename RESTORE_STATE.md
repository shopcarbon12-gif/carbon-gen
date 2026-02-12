# Restore State Snapshot

This document captures the exact working state of the project as restored.
Use it as the source of truth for future rollback/rebuild.

## Scope

- Password-only authentication (no email OTP, no OAuth).
- HttpOnly cookie session gate.
- Protected app routes and protected generation API.
- Redis-backed rate limiting (Upstash) for login and generate APIs.
- Redis health endpoint.
- Security headers configured globally.

## Runtime And Routing

- Framework: Next.js App Router.
- Route protection runs through `proxy.ts` (Next.js proxy middleware).
- Protected routes:
  - `/dashboard`
  - `/generate`
  - `/studio`
  - `/vault`
  - `/shopify`
  - `/seo`
  - `/activity`
  - `/settings`
- Public route:
  - `/login` (redirects to `/dashboard` if already authed).

## Auth Model

- Login endpoint: `app/api/login/route.ts`
- Logout endpoint: `app/api/logout/route.ts`
- Auth cookie:
  - Name: `carbon_gen_auth_v1`
  - Value on login: `"true"`
  - `httpOnly: true`
  - `sameSite: "lax"`
  - `secure: process.env.NODE_ENV === "production"`
  - `path: "/"`
  - `maxAge: 60 * 60 * 24 * 7`
- Additional cookie:
  - Name: `carbon_gen_user_id`
  - Set on successful login if missing.
  - Cleared on logout.

## Password Validation

`app/api/login/route.ts` supports:

- `APP_PASSWORD` (plain fallback)
- `APP_PASSWORD_HASH` (primary bcrypt hash)
- `APP_PASSWORD_HASH_PREV` (rotation window hash)
- `APP_PASSWORD_HASHES` (comma-separated additional hashes)

Validation result:

- Success: sets cookies and returns JSON or redirects for HTML requests.
- Failure: 401 with `Invalid password`.
- Missing password: 400.
- Missing server password config: 500.

## API Protection

- `app/api/generate/route.ts` enforces auth cookie:
  - If missing/invalid: `401 Unauthorized`.
- `app/api/generate/route.ts` also enforces generate rate limiting.

## Rate Limiting (Upstash Redis)

Shared Redis client:

- `lib/redis.ts`

Rate limiter definitions:

- `lib/ratelimit.ts`
  - Login limiter:
    - Prefix: `carbon-gen:login`
    - Limit: `10` per `15m`
  - Generate limiter:
    - Prefix: `carbon-gen:generate`
    - Limit: `30` per `15m`

Usage:

- Login limiter applied in `app/api/login/route.ts`
- Generate limiter applied in `app/api/generate/route.ts`

Behavior when Redis env is missing:

- Current implementation allows requests (`success: true`) and marks no limiter error.

## Health Check

- Endpoint: `app/api/health/route.ts`
- Behavior:
  - If Redis env missing: returns `200` with `ok: true`, `degraded: true`, and Redis error message.
  - If Redis ping succeeds: returns `200` with `ok: true` and `redis.ok: true`.
  - If Redis ping fails: returns `500` with `ok: false`.

## Security Headers

Configured in `next.config.ts`:

- `Content-Security-Policy`
- `Referrer-Policy`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`

## Required Environment Variables

Minimum required for full production behavior:

- `OPENAI_API_KEY`
- `APP_PASSWORD_HASH` (or compatible password env fallback set)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Optional:

- `APP_PASSWORD`
- `APP_PASSWORD_HASH_PREV`
- `APP_PASSWORD_HASHES`

## Restore Validation Checklist

1. Install dependencies.
2. Set required env vars in `.env.local`.
3. Start app:
   - `npm run dev`
4. Verify:
   - Unauthed `/generate` redirects to `/login`.
   - Unauthed `/dashboard` redirects to `/login`.
   - Login with valid password succeeds.
   - Logout clears access and redirects to `/login`.
   - `/api/generate` returns 401 without auth cookie.
   - `/api/health` returns expected Redis status.
5. Production build check:
   - `npm run build`

## Canonical Files

- `proxy.ts`
- `app/api/login/route.ts`
- `app/api/logout/route.ts`
- `app/api/generate/route.ts`
- `app/api/health/route.ts`
- `lib/ratelimit.ts`
- `lib/redis.ts`
- `next.config.ts`

