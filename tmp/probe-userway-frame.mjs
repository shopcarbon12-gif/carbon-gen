import { chromium } from "playwright";

const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto("https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForTimeout(9000);
await p.evaluate(() => {
  window.UserWay?.resetAll?.();
  window.UserWay?.widgetOpen?.();
});
await p.waitForTimeout(2500);

const fl = p.frameLocator('iframe[src*="userway.org/widget/"]');
const count = await fl.locator("button, [role='button']").count();
console.log("button count", count);
for (let i = 0; i < Math.min(count, 40); i++) {
  const txt = await fl.locator("button, [role='button']").nth(i).textContent().catch(() => "");
  const aria = await fl.locator("button, [role='button']").nth(i).getAttribute("aria-label").catch(() => "");
  console.log(i, JSON.stringify((txt || "").trim().slice(0, 50)), aria);
}

await b.close();
