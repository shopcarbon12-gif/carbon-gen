# Coolify runbook (carbon-gen / Traefik)

Use this when `app.shopcarbon.com` shows **yellow**, **502**, **504**, or is very slow.

## Limits of this repo

- **Application** fixes ship with Git + Coolify build.
- **Proxy timeouts** and **server networking** are set in the **Coolify UI** on your VPS (this file is copy‑paste only).

## Health checks

- **Liveness (Docker / recommended Coolify probe):** `GET /api/health` — no database, fast JSON.
- **Do not** point Docker `HEALTHCHECK` or Traefik at `/` (it redirects).

In **Coolify → Application → Healthcheck**, prefer path **`/api/health`**, with an **initial delay** of at least **60–90s** if the service is slow to bind.

## 504 Gateway Timeout (~60s)

Traefik’s default **read** timeout is often **60s**. Long requests (large uploads, slow APIs) get **504** even if the app is fine.

**Servers → [your server] → Proxy → Configuration** — under Traefik `command:`, add (match entrypoint names to your file: `web`/`websecure` vs `http`/`https`):

```yaml
- '--entrypoints.web.transport.respondingTimeouts.readTimeout=5m'
- '--entrypoints.web.transport.respondingTimeouts.writeTimeout=5m'
- '--entrypoints.web.transport.respondingTimeouts.idleTimeout=5m'
- '--entrypoints.websecure.transport.respondingTimeouts.readTimeout=5m'
- '--entrypoints.websecure.transport.respondingTimeouts.writeTimeout=5m'
- '--entrypoints.websecure.transport.respondingTimeouts.idleTimeout=5m'
```

Restart the **proxy** after saving.

Official doc: [Gateway Timeout (504) Errors](https://coolify.io/docs/troubleshoot/applications/gateway-timeout).

## 502 Bad Gateway

Usually **container not listening**, **wrong port** (this app: **3000**), or **crash loop**. Check **application logs** and confirm **published port = 3000** unless you changed `PORT` everywhere.

## Yellow “degraded”

Often **failed health checks** during startup or **DB‑bound probes**. This repo’s Dockerfile probes **`/api/health`** with a **90s start period** so Next can boot first.

## Deploy hook (local)

```bash
ALLOW_COOLIFY_DEPLOY=true npm run deploy:coolify
```

Requires `.coolify-deploy.local.json` (gitignored) with your webhook URL and token.
