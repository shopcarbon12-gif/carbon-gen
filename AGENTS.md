# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Carbon Gen Studio is a Next.js 16 (App Router) internal operations app for Carbon Jeans Company. It includes AI image generation (OpenAI, Google Gemini), Shopify integration, Lightspeed POS sync, and more.

### Services

| Service | Required | How to start |
|---|---|---|
| **Next.js dev server** | Yes | `npm run dev:3000` (port 3000) |
| **PostgreSQL 18** | Yes | `sudo docker compose -f docker-compose.local.yml up -d` then `node scripts/init-local-db.mjs` |
| Docker daemon | Yes (for Postgres) | `sudo dockerd` (may already be running) |
| Upstash Redis, Cloudflare R2, OpenAI, Gemini, Shopify, Lightspeed | Optional | Cloud SaaS — configure via `.env.local` if needed |

### Dev commands

- **Lint:** `npx eslint .` — pre-existing warnings/errors in scripts are expected; core app code should be clean.
- **Build:** `npm run build` (Next.js standalone build with webpack).
- **Dev server:** `npm run dev:3000` — starts on port 3000.
- **E2E tests:** `npx playwright test` — requires Chromium (`npx playwright install chromium --with-deps`). Tests use `http://localhost:3000` by default (see `playwright.config.ts`).
- **DB init:** `node scripts/init-local-db.mjs` — applies `scripts/sql_schema.sql` to local Postgres.

### Environment setup notes

- The `.env.local` file is gitignored. Minimum viable config for local dev:
  ```
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
  AUTH_BYPASS=true
  APP_ADMIN_USERNAME=admin
  APP_ADMIN_PASSWORD_HASH=<any bcrypt hash>
  APP_PASSWORD_HASH=<same bcrypt hash>
  LOCAL_APP_PORT=3000
  ```
- Generate a bcrypt hash with: `npm run hash-password -- "yourpassword"`
- `AUTH_BYPASS=true` skips authentication — useful for local dev. Note: the Playwright login test (`login page renders and validates empty submit`) will fail when `AUTH_BYPASS=true` because the login page redirects away; this is expected.
- Some `npm run` scripts (e.g. `dev`, `start:local`, `start:tunnel`) invoke PowerShell and are Windows-specific. Use `npm run dev:3000` or `npm run dev:raw` on Linux.
- Docker is required for local Postgres. In Cloud Agent VMs, Docker needs `fuse-overlayfs` storage driver and `iptables-legacy` (see setup hints in the system prompt). Start dockerd with `sudo dockerd &>/tmp/dockerd.log &`.
- The Next.js dev server does NOT need to be restarted after `.env.local` changes in most cases — but Auth/DB env vars require a restart.
