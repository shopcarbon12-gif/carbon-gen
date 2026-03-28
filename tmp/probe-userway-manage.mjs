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
await fl.getByRole("button", { name: /Manage/i }).click();
await p.waitForTimeout(2000);
const body = await fl.locator("body").innerText().catch(() => "");
console.log(body.slice(0, 3500));

await b.close();
