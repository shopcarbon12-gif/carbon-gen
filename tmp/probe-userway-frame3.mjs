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
const n = await fl.locator("[role='button'],button").count();
for (let i = 0; i < n; i++) {
  const el = fl.locator("[role='button'],button").nth(i);
  const name = await el.getAttribute("aria-label").catch(() => "");
  const txt = (await el.textContent().catch(() => "")) || "";
  console.log(i, "aria=", name?.slice(0, 80), "| text=", JSON.stringify(txt.trim().slice(0, 60)));
}

await b.close();
