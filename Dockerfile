FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV TZ=America/New_York

RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid 1001 --shell /usr/sbin/nologin --create-home nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Next.js image optimization writes under .next/cache at runtime; COPY leaves files root-owned.
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

# Coolify/Docker: probe a cheap route (not `/`, which redirects). Long start-period avoids
# yellow/degraded while the standalone server binds on small VPS instances.
HEALTHCHECK --interval=30s --timeout=8s --start-period=90s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.js", "-H", "0.0.0.0"]
