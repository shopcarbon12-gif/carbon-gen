/**
 * Headless probe: toggle contrast modes on /accessibility and log FAB movement samples.
 * Run: node tmp/probe-contrast-chrome-motion.mjs (dev server on :3000)
 */
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://localhost:3000/accessibility";

async function fabRect(page) {
  return page.evaluate(() => {
    const w = document.getElementById("carbon-a11y-widget");
    if (!w?.shadowRoot) return null;
    const btn = w.shadowRoot.querySelector(".ca-assist-launcher--fab");
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

async function sampleMotion(page, label, ms = 450) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < ms) {
    samples.push(await fabRect(page));
    await page.waitForTimeout(16);
  }
  let maxDx = 0;
  let maxDy = 0;
  const baseS = samples[0];
  if (baseS) {
    for (const s of samples) {
      if (!s) continue;
      maxDx = Math.max(maxDx, Math.abs(s.left - baseS.left));
      maxDy = Math.max(maxDy, Math.abs(s.top - baseS.top));
    }
  }
  console.log(`[${label}] max delta from first frame: dx=${maxDx.toFixed(2)} dy=${maxDy.toFixed(2)} (n=${samples.length})`);
}

async function clickContrast(page, key) {
  await page.evaluate((k) => {
    const w = document.getElementById("carbon-a11y-widget");
    const b = w?.shadowRoot?.querySelector('[data-carbon-key="' + k + '"]');
    if (b && typeof b.click === "function") b.click();
  }, key);
}

async function openPanel(page) {
  await page.evaluate(() => {
    const w = document.getElementById("carbon-a11y-widget");
    const b = w?.shadowRoot?.querySelector(".ca-assist-launcher--fab");
    if (b && typeof b.click === "function") b.click();
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base, { waitUntil: "networkidle", timeout: 180000 });
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => /Open Preview/i.test(x.textContent || ""));
    if (b) b.click();
  });
  await page.waitForFunction(
    () => {
      const w = document.getElementById("carbon-a11y-widget");
      return !!(w && w.shadowRoot && w.shadowRoot.querySelector(".ca-assist-launcher--fab"));
    },
    { timeout: 180000 },
  );

  await openPanel(page);
  await page.waitForTimeout(500);

  await sampleMotion(page, "baseline (panel open)");
  await clickContrast(page, "rg-contrast-invert");
  await page.waitForTimeout(80);
  await sampleMotion(page, "after invert");
  await clickContrast(page, "rg-contrast-dark");
  await page.waitForTimeout(80);
  await sampleMotion(page, "after dark");
  await clickContrast(page, "rg-contrast-none");
  await page.waitForTimeout(80);
  await sampleMotion(page, "after none");
  await clickContrast(page, "rg-contrast-invert");
  await page.waitForTimeout(80);
  await sampleMotion(page, "invert again");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
