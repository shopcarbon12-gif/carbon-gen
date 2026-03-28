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
const body = await fl.locator("body").innerText().catch(() => "");
console.log("body sample", body.slice(0, 2000));

await b.close();
