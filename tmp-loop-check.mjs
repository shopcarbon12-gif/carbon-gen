import { chromium } from "playwright";

const url = "http://localhost:3000/studio/shopify-collection-mapping?shop=30e7d3.myshopify.com";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const navEvents = [];
const apiHits = [];
const pageHits = [];

page.on("framenavigated", (frame) => {
  if (frame !== page.mainFrame()) return;
  navEvents.push({ ts: Date.now(), url: frame.url() });
});

page.on("requestfinished", (req) => {
  const u = req.url();
  if (u.includes("/api/shopify/collection-mapping")) {
    apiHits.push({ ts: Date.now(), url: u });
  }
  if (u.includes("/studio/shopify-collection-mapping")) {
    pageHits.push({ ts: Date.now(), url: u });
  }
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(60000);
const rowCount = await page.locator(".treeRow").count();

const report = {
  url,
  rowCount,
  mainFrameNavigations: navEvents.length,
  studioPageRequests: pageHits.length,
  mappingApiRequests: apiHits.length,
  navigationSequence: navEvents.map((x) => x.url),
};

console.log(JSON.stringify(report, null, 2));
await browser.close();
