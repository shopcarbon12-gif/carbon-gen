import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("https://shopcarbon.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);

const triggers = [
  'button[aria-label*="Search" i]',
  "summary.header__icon--search",
  ".header__icon--search",
  "details-modal summary",
  'a[href*="/search"]',
  "[data-search-toggle]",
];
for (const sel of triggers) {
  try {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      await loc.click({ timeout: 3000 });
      await page.waitForTimeout(900);
      break;
    }
  } catch {
    /* next */
  }
}

const probe = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input[name="q"], input[type="search"]')];
  const out = [];
  for (const el of inputs.slice(0, 8)) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let topEl = null;
    if (r.width > 0 && r.height > 0) {
      topEl = document.elementFromPoint(cx, cy);
    }
    const cs = getComputedStyle(el);
    let topDesc = "";
    if (topEl && topEl.nodeType === 1) {
      topDesc =
        topEl.tagName +
        (topEl.id ? "#" + topEl.id : "") +
        (topEl.className && typeof topEl.className === "string"
          ? "." + topEl.className.trim().split(/\s+/).slice(0, 5).join(".")
          : "");
    }
    out.push({
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      disabled: el.disabled,
      readOnly: el.readOnly,
      tabIndex: el.tabIndex,
      pointerEvents: cs.pointerEvents,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
      elementFromPointCenter: topDesc,
      inputIsTopElement: topEl === el,
    });
  }
  const mask = document.getElementById("carbon-a11y-reading-mask");
  const mcs = mask ? getComputedStyle(mask) : null;
  const big = document.documentElement.classList.contains("ca-a11y-big-cursor");
  return {
    inputCount: inputs.length,
    samples: out,
    readingMask: mask
      ? { display: mask.style.display || mcs.display, pointerEvents: mcs.pointerEvents, zIndex: mcs.zIndex }
      : null,
    htmlHasBigCursor: big,
    activeEl: document.activeElement
      ? document.activeElement.tagName +
        (document.activeElement.id ? "#" + document.activeElement.id : "")
      : null,
  };
});

console.log(JSON.stringify(probe, null, 2));

const inp = page.locator('input[name="q"], input[type="search"]').first();
await inp.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(200);
const focus1 = await page.evaluate(() => ({
  active: document.activeElement
    ? document.activeElement.tagName +
      (document.activeElement.id ? "#" + document.activeElement.id : "") +
      (document.activeElement.className && typeof document.activeElement.className === "string"
        ? "." + document.activeElement.className.split(/\s+/)[0]
        : "")
    : null,
  inputValue: (document.querySelector('input[name="q"]') || {}).value,
}));
console.log("after click input:", JSON.stringify(focus1));

await page.keyboard.type("hello", { delay: 30 });
const afterType = await page.evaluate(() => {
  const el = document.querySelector('input[name="q"]') || document.querySelector('input[type="search"]');
  return el
    ? {
        value: el.value,
        activeId: document.activeElement && document.activeElement.id,
        activeTag: document.activeElement && document.activeElement.tagName,
      }
    : null;
});
console.log("after keyboard.type:", JSON.stringify(afterType));

await browser.close();
