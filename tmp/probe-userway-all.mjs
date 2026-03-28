import { chromium } from "playwright";

const URLS = [
  "https://www.shopcarbon.com/",
  "https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72",
  "https://shopcarbon.com/account/login",
  "https://shopcarbon.com/pages/jeans",
];

const b = await chromium.launch({ headless: true });
const p = await b.newPage();

for (const url of URLS) {
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(() => ({
    userwayInHtml: document.documentElement.innerHTML.toLowerCase().includes("userway"),
    carbonHost: !!document.querySelector("#carbon-a11y-widget"),
    userwayScripts: [...document.querySelectorAll("script[src]")]
      .map((s) => s.src)
      .filter((u) => u.toLowerCase().includes("userway")),
    windowUserWay: typeof window.UserWay,
  }));
  console.log(url, JSON.stringify(r));
}

await b.close();
