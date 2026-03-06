# Playwright Beginner Guide (Cursor + Carbon)

This project is now ready for Playwright end-to-end testing.

## 1) One-time setup

Run this once to install Playwright browser binaries:

```bash
npm run playwright:install
```

## 2) Run your first tests

Run all e2e tests:

```bash
npm run test:e2e
```

This will:
- Start your app on `http://localhost:3000` (or reuse an existing server).
- Run tests from `tests/e2e`.
- Print results in terminal.

## 3) Best mode for beginners (UI mode)

Open interactive Playwright UI:

```bash
npm run test:e2e:ui
```

In UI mode you can:
- Click a test to run it.
- Watch each step live.
- Re-run failed tests quickly.

## 4) Run with visible browser

```bash
npm run test:e2e:headed
```

Useful when you want to see the browser interactions.

## 5) Open HTML report

After a run:

```bash
npm run test:e2e:report
```

It shows:
- Passed/failed tests
- Screenshots/videos on failures
- Trace info for debugging

## 6) Where tests live

- Config: `playwright.config.ts`
- Starter test: `tests/e2e/smoke.spec.ts`

## 7) How to add a new test

Create a new file like:

`tests/e2e/my-feature.spec.ts`

Example:

```ts
import { test, expect } from "@playwright/test";

test("my page works", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Authenticate" })).toBeVisible();
});
```

## 8) Common issues

- Port `3000` already used: this is fine if your app is already running there.
- Test fails on auth-required pages: start from `/login`, or set auth cookie in test.
- Slow first run: normal (browser install + cold startup).

