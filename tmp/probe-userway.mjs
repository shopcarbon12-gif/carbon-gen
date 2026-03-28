import { chromium } from "playwright";

const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.goto("https://www.shopcarbon.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(8000);

const info = await p.evaluate(() => {
  const out = {
    iframes: [],
    elements: [],
    scripts: [],
    htmlHasUserway: document.documentElement.innerHTML.toLowerCase().includes("userway"),
    htmlHasCarbon: document.documentElement.innerHTML.includes("carbon-a11y"),
  };
  document.querySelectorAll("iframe").forEach((f, i) => {
    out.iframes.push({
      i,
      src: (f.getAttribute("src") || "").slice(0, 160),
      id: f.id,
      className: String(f.className || "").slice(0, 100),
    });
  });
  const all = document.querySelectorAll("*");
  for (let j = 0; j < all.length && out.elements.length < 40; j++) {
    const el = all[j];
    const id = el.id || "";
    const cl = String(el.className || "");
    const hay = (id + " " + cl).toLowerCase();
    if (hay.includes("userway") || hay.includes("uw-") || id.startsWith("uw")) {
      out.elements.push({
        tag: el.tagName,
        id: id.slice(0, 60),
        class: cl.slice(0, 80),
        shadow: !!el.shadowRoot,
      });
    }
  }
  document.querySelectorAll("script[src]").forEach((s) => {
    const u = s.getAttribute("src") || "";
    if (u.toLowerCase().includes("userway") || u.includes("accessibility/widget")) out.scripts.push(u);
  });
  return out;
});

const uw = await p.evaluate(() => ({
  UserWay: typeof window.UserWay,
  userway: typeof window.userway,
  keys: Object.keys(window).filter((k) => /userway|uw/i.test(k)).slice(0, 20),
}));

console.log(JSON.stringify({ ...info, windowApi: uw }, null, 2));
await b.close();
