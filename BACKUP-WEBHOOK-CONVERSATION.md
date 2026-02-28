# Backup: Lightspeed Webhook Task
**Project:** carbon-gen | **Date:** Feb 2025

## Done
- refreshLightspeedRetailToken in lib/lightspeedApi.ts
- Register route uses Retail token; accepts domainPrefix in body
- Register Sale Webhook button in Settings
- Deployed to carbon-gen-iota.vercel.app

## Status
- API returns 403. Manual: https://us.merchantos.com/setup/api add URL https://carbon-gen-iota.vercel.app/api/lightspeed/webhooks/sale-update

## Key paths
- lib/lightspeedApi.ts
- app/api/lightspeed/webhooks/register/route.ts
- app/settings/page.tsx

## After reinstall
Tell AI: Read BACKUP-WEBHOOK-CONVERSATION.md and continue Lightspeed webhook task.

## Crash prevention
- Rule added: .cursor/rules/stable-mode.mdc (one step at a time, verify results, use ; not &&)
