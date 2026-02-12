# Carbon Gen Studio

Carbon-branded Next.js app for:
- Studio generation workflows
- Vault asset storage (IndexedDB)
- Shopify connection, product pull, and media push
- SEO metadata workflows
- OpenAI-powered prompt enhancement and metadata generation

## App Map (Brand-Aligned IA)
- `/dashboard` -> Home
- `/studio` -> Core creation workflow
- `/shopify` -> Explore/Catalog
- `/vault` -> Saved assets
- `/activity` -> Activity timeline
- `/settings` -> Profile/Settings
- `/seo` -> Metadata publishing module
- `/generate` -> Quick ideation mode

## UI Direction
- Palette: `#050505`, `#111111`, `#272727`, `#f5f5f5`, accent `#E50000`
- Typography: bold uppercase for titles, clean sans for body copy
- Spacing: 8-point scale (`8/12/16/24/32`)
- Components: cards, pills/chips, high-contrast CTAs, modal overlays
- Motion: fast subtle transitions, no heavy animation clutter
- Mobile-first: bottom nav, large touch targets, low-friction forms

## Key Flows
1. Onboarding flow:
   - Login -> Connect Shopify -> set defaults in Settings
2. Core creative flow:
   - Studio -> Generate -> Save to Vault -> Push to Shopify
3. SEO flow:
   - SEO module -> AI metadata -> Push to Shopify
4. Monitoring flow:
   - Activity page for recent events and operation log

## AI Feature Roadmap (Impact Priority)
1. Prompt Director Mode (live)
2. Metadata generator (live)
3. Trend prompt recommender (next)
4. A/B prompt variant generator (next)
5. Performance scoring by conversion feedback (later)
6. Support copilot for customer ops (later)

## Local Setup (Beginner)
1. Duplicate env template:
```bash
copy .env.example .env.local
```
2. Fill `.env.local` values.
3. Install dependencies:
```bash
npm install
```
4. Start dev server:
```bash
npm run dev
```
5. Open the URL printed in terminal (usually `http://localhost:3000` or `http://localhost:3001`).

## Cloudflared + Upstash (Run Both)
Use two terminals.

Terminal 1 (app):
```bash
npm run dev:3001
```

Terminal 2 (public tunnel):
```bash
npm run start:tunnel
```

One-command launcher (opens two terminals automatically):
```bash
npm run start:local
```
It now runs both processes in the background (no terminal clutter).

One-command stop:
```bash
npm run stop:local
```

Expected public URL:
```text
https://carbon-gen.shopcarbon.com
```

Upstash setup:
1. Create a Redis database in Upstash.
2. Copy `REST URL` and `REST TOKEN`.
3. Put them in `.env.local`:
```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```
4. Validate Upstash connection:
```bash
npm run check:upstash
```
5. Restart app after env changes.

## Password Setup
Generate a bcrypt hash:
```bash
npm run hash-password -- "YourRealPassword"
```
Put output into `.env.local`:
```env
APP_PASSWORD_HASH=<paste hash>
```
Optional fallback:
```env
APP_PASSWORD=<plain password>
```

## Shopify OAuth Setup
In Shopify app settings, whitelist callback URL exactly:
```text
https://your-domain.vercel.app/api/shopify/callback
```
Set this same URL in:
```env
SHOPIFY_REDIRECT_URI=https://your-domain.vercel.app/api/shopify/callback
```

## Deploy
```bash
vercel --prod
```
Then set all env vars in Vercel Project Settings and redeploy.

For push-based automatic deploys (recommended), follow:
`DEPLOY_VERCEL_AUTOMATION.md`

## Quick Health Checks
Runtime sync check (local vs public):
```bash
npm run check:sync
```

Shopify smoke check (status + auth redirect + catalog consistency):
```powershell
$env:SHOPIFY_SMOKE_BASE_URL="https://carbon-gen-iota.vercel.app"
$env:SHOPIFY_SMOKE_SHOP="your-store.myshopify.com"
npm run check:shopify
```

Optional disconnect test (requires `APP_PASSWORD` available):
```powershell
$env:SHOPIFY_SMOKE_DISCONNECT="1"
npm run check:shopify
```

## Troubleshooting
- `Invalid password`:
  - verify `APP_PASSWORD_HASH` in `.env.local`
  - restart dev server after env changes
- `Missing Shopify app config`:
  - set `SHOPIFY_APP_CLIENT_ID`, `SHOPIFY_APP_CLIENT_SECRET`, `SHOPIFY_SCOPES`, `SHOPIFY_REDIRECT_URI`
- OAuth `redirect_uri is not whitelisted`:
  - callback URL in Shopify must exactly match `SHOPIFY_REDIRECT_URI`
- `localhost refused to connect`:
  - check terminal for the actual port (`3000` vs `3001`)
