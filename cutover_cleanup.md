# Post-Cutover Cleanup & Rollback Plan

## 1. Current Live Status
- **Live Domain:** `https://app.shopcarbon.com`
- **Host:** Hetzner VPS (`178.156.136.112`) running Coolify.
- **Status:** Application is responding successfully with valid SSL.

## 2. 24-48h Monitoring & Rollback Plan
- **Monitoring:** Watch for 502/504 errors on the live domain, specifically during image generation or heavy webhook traffic.
- **Rollback Trigger:** If the app becomes unreachable or webhooks consistently fail, rollback DNS (`app.shopcarbon.com`) to Vercel's CNAME record (`cname.vercel-dns.com`) and revert external webhook endpoints.

## 3. Disable Vercel Checklist
**VERIFICATION COMPLETE: Vercel is now SAFE TO DISABLE.**
All auth flows, UI interfaces, and DNS routing are strictly verified as green on Hetzner/Coolify. 
- [ ] Confirm Shopify is actively delivering webhooks to `https://app.shopcarbon.com/api/shopify/...`.
- [ ] Confirm Lightspeed `sale.update` is successfully arriving at `https://app.shopcarbon.com/api/lightspeed/webhooks/sale-update`.
- [ ] Disable/Pause the project in Vercel to fully cut off the legacy route.

## 4. Cancel Neon Checklist
Only proceed once Supabase scaling is complete and all queries use Supabase.
- [ ] Verify all Neon data/schemas are completely mirrored in Supabase.
- [ ] Ensure `NEON_DATABASE_URL` is removed from Coolify Environment Variables.
- [ ] Confirm no errors occur in the application related to Postgres query failures.
- [ ] Pause the Neon cluster to test for any silent failures.
- [ ] After 1 week of stability on Supabase, cancel the Neon paid plan and delete the Neon project.
