import { chromium } from "playwright";

const url = "https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72";
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(8000);

const api = await p.evaluate(() => {
  const U = window.UserWay;
  if (!U || typeof U !== "object") return { error: "no UserWay" };
  return {
    keys: Object.keys(U).slice(0, 60),
    widgetOpen: typeof U.widgetOpen,
    widgetToggle: typeof U.widgetToggle,
    resetAll: typeof U.resetAll,
  };
});
console.log("API", JSON.stringify(api, null, 2));

const dom = await p.evaluate(() => {
  const hits = [];
  document.querySelectorAll("*").forEach((el) => {
    if (hits.length > 25) return;
    const id = (el.id || "").toLowerCase();
    const cl = String(el.className || "").toLowerCase();
    if (id.includes("userway") || cl.includes("userway") || id.startsWith("uw-")) {
      hits.push({
        tag: el.tagName,
        id: el.id,
        class: String(el.className).slice(0, 100),
        shadow: !!el.shadowRoot,
      });
    }
  });
  return hits;
});
console.log("DOM", JSON.stringify(dom, null, 2));

await b.close();
