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
await p.waitForTimeout(2000);

const info = await p.evaluate(() => {
  const out = { iframes: [], uwButtons: [] };
  document.querySelectorAll("iframe").forEach((f, i) => {
    const src = f.getAttribute("src") || "";
    if (src.toLowerCase().includes("userway") || src.includes("widgetapp")) {
      out.iframes.push({ i, src: src.slice(0, 200), id: f.id });
    }
  });
  document.querySelectorAll("button, [role=button], a").forEach((el) => {
    const t = (el.textContent || "").trim().slice(0, 40);
    if (/profile|blind|vision|motor|dyslexia|adhd|seizure|preset/i.test(t)) {
      out.uwButtons.push({ tag: el.tagName, t });
    }
  });
  return out;
});
console.log(JSON.stringify(info, null, 2));
await p.screenshot({ path: "tmp/userway-panel-probe.png", fullPage: false });
await b.close();
console.log("screenshot tmp/userway-panel-probe.png");
