import { chromium } from "playwright";

const base = "http://localhost:3000/accessibility";
const outDir = "docs/qa-screenshots";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/browser-inspect-accessibility-full.png`, fullPage: true });

await page.locator("h3", { hasText: "Feature Matrix" }).scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/browser-inspect-feature-matrix.png` });

await page.locator("#config-console").scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/browser-inspect-config-console.png` });

const probe = await page.evaluate(() => {
  const cfg = document.querySelector("#config-console");
  const hConfig =
    cfg?.querySelector('[class*="horizontalSurface"]') ?? document.querySelector('[class*="horizontalSurface"]');
  const v = document.querySelector('[class*="verticalSurface"]');
  const hb = hConfig ? getComputedStyle(hConfig, "::before") : null;
  const vb = v ? getComputedStyle(v, "::before") : null;
  const toggleTrack = document.querySelector('[class*="pt-switch__face"]');
  const tt = toggleTrack ? getComputedStyle(toggleTrack) : null;
  return {
    configCardHorizontalBgSize: hb?.backgroundSize ?? null,
    configCardHorizontalBgPos: hb?.backgroundPosition ?? null,
    verticalBeforeBgSize: vb?.backgroundSize ?? null,
    configCardHasTexture: (hb?.backgroundImage ?? "").includes("url("),
    verticalHasTexture: (vb?.backgroundImage ?? "").includes("url("),
    premiumToggleFaceBoxShadow: tt?.boxShadow?.slice(0, 100) ?? "no-toggle-found",
  };
});
console.log("probe", JSON.stringify(probe, null, 2));

await browser.close();
console.log("screenshots written to", outDir);
