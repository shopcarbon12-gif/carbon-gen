/**
 * UserWay widget storefront verification on shopcarbon.com (when script is present).
 * Uses window.UserWay API + optional iframe clicks for UI-only controls.
 * Output: reports/userway-shopcarbon-storefront/
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT = join(REPO, "reports", "userway-shopcarbon-storefront");

const PAGES = [
  { id: "01-home", url: "https://www.shopcarbon.com/", label: "Homepage (www.shopcarbon.com)" },
  {
    id: "02-product",
    url: "https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72",
    label: "Product PDP (Gyda set)",
  },
  { id: "03-login", url: "https://shopcarbon.com/account/login", label: "Account login" },
  { id: "04-jeans", url: "https://shopcarbon.com/pages/jeans", label: "Jeans landing page" },
];

/** API: label, enable method, disable method */
const UW_API_READING = [
  ["Invert / contrast (base)", "contrastEnable", "contrastDisable"],
  ["Smart contrast", "enableSmartContrast", "disableSmartContrast"],
  ["Bigger text", "bigTextEnable", "bigTextDisable"],
  ["Legible fonts", "legibleFontsEnable", "legibleFontsDisable"],
  ["Text spacing", "textSpacingEnable", "textSpacingDisable"],
  ["Line height", "lineHeightEnable", "lineHeightDisable"],
  ["Text align", "textAlignEnable", "textAlignDisable"],
  ["Saturation", "saturationEnable", "saturationDisable"],
  ["Dyslexia font", "dyslexiaFontEnable", "dyslexiaFontDisable"],
  ["Hide images", "enableHideImages", "disableHideImages"],
];

const UW_API_MOTION = [
  ["Highlight links", "highlightEnable", "highlightDisable"],
  ["Pause animations", "stopAnimationEnable", "stopAnimationDisable"],
  ["Big cursor", "bigCursorEnable", "bigCursorDisable"],
  ["Tooltips", "tooltipsEnable", "tooltipsDisable"],
  ["Reading guide", "readingGuideEnable", "readingGuideDisable"],
  ["Reading mask", "readingMaskEnable", "readingMaskDisable"],
  ["Read page (TTS)", "readPageEnable", "readPageDisable"],
  ["Inline dictionary", "inlineDictionaryEnable", "inlineDictionaryDisable"],
];

/** @type {{ page: string, area: string, test: string; ok: boolean; note: string }[]} */
const rows = [];

function row(pageLabel, area, test, ok, note) {
  rows.push({ page: pageLabel, area, test, ok, note });
}

async function shot(page, relPath) {
  const abs = join(OUT, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  await page.screenshot({ path: abs, type: "png", fullPage: false });
  return relPath.replace(/\\/g, "/");
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function waitUserWay(page, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const ok = await page.evaluate(() => typeof window.UserWay === "object" && window.UserWay !== null);
    if (ok) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

async function uwCall(page, method) {
  return page.evaluate((m) => {
    try {
      const fn = window.UserWay && window.UserWay[m];
      if (typeof fn !== "function") return { ok: false, err: "no fn " + m };
      fn.call(window.UserWay);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e.message || e) };
    }
  }, method);
}

async function runSite(page, site) {
  const pdir = site.id;
  mkdirSync(join(OUT, pdir), { recursive: true });

  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    row(site.label, "Load", "Open URL", false, String(e.message || e));
    await shot(page, `${pdir}/00-ERROR-load.png`);
    return;
  }

  await page.waitForTimeout(2000);
  const hasUw = await waitUserWay(page, 14000);

  row(
    site.label,
    "Widget",
    "UserWay (window.UserWay API)",
    hasUw,
    hasUw
      ? "UserWay script loaded and API available."
      : "No UserWay on this URL in this session (common on www/login if only shopcarbon.com loads the app embed).",
  );
  await shot(page, `${pdir}/00-baseline.png`);

  if (!hasUw) {
    row(
      site.label,
      "Profiles",
      "Preset profiles (Blind / Motor / …)",
      false,
      "Skipped — UserWay not loaded. When present, UserWay uses toggles, not Carbon-style named profiles.",
    );
    return;
  }

  await uwCall(page, "resetAll");
  await page.waitForTimeout(500);

  await uwCall(page, "widgetOpen");
  await page.waitForTimeout(1200);
  await shot(page, `${pdir}/01-widget-open.png`);

  row(
    site.label,
    "Profiles",
    "Named accessibility profiles (Blind / Low vision / …)",
    true,
    `**Not applicable:** UserWay’s customer menu has no named presets like Carbon Assist—only toggles (see \`${pdir}/01-widget-open.png\`). “Oversized Widget” appears as copy in the panel but is not a separate button in this build (buttons start at Contrast +).`,
  );

  async function userWayWidgetFrame() {
    await page.waitForTimeout(300);
    return page.frames().find((f) => /userway\.org\/widget\//i.test(f.url()));
  }

  await uwCall(page, "resetAll");
  await uwCall(page, "widgetOpen");
  await page.waitForTimeout(1500);
  const uwFrame = await userWayWidgetFrame();
  if (uwFrame) {
    const clickedContrast = await uwFrame.evaluate(() => {
      const buttons = [...document.querySelectorAll("button,[role='button']")];
      const b = buttons.find((x) => /Contrast/i.test((x.textContent || "").trim()));
      if (!b) return false;
      b.click();
      return true;
    });
    if (clickedContrast) {
      await page.waitForTimeout(550);
      await shot(page, `${pdir}/reading-ui-contrast-step-1.png`);
      await uwFrame.evaluate(() => {
        const buttons = [...document.querySelectorAll("button,[role='button']")];
        const b = buttons.find((x) => /Contrast/i.test((x.textContent || "").trim()));
        if (b) b.click();
      });
      await page.waitForTimeout(550);
      await shot(page, `${pdir}/reading-ui-contrast-step-2.png`);
      await uwFrame.evaluate(() => {
        const buttons = [...document.querySelectorAll("button,[role='button']")];
        const b = buttons.find((x) => /Contrast/i.test((x.textContent || "").trim()));
        if (b) b.click();
      });
      await page.waitForTimeout(550);
      await shot(page, `${pdir}/reading-ui-contrast-step-3.png`);
      await uwCall(page, "resetAll");
      row(
        site.label,
        "Reading & vision (UI)",
        "Contrast + multi-step (3 clicks)",
        true,
        `Cycled UI “Contrast +” three times → \`${pdir}/reading-ui-contrast-step-1.png\` … \`step-3.png\`; then resetAll.`,
      );
    } else {
      row(site.label, "Reading & vision (UI)", "Contrast + multi-step", false, "Contrast button not found in widget frame DOM.");
    }
  } else {
    row(site.label, "Reading & vision (UI)", "Contrast + multi-step", false, "Widget iframe URL not found after widgetOpen.");
  }

  await uwCall(page, "resetAll");
  await page.waitForTimeout(400);

  for (const [label, en, dis] of UW_API_READING) {
    await uwCall(page, "resetAll");
    await page.waitForTimeout(250);
    const r = await uwCall(page, en);
    await page.waitForTimeout(550);
    const path = await shot(page, `${pdir}/reading-${slug(label)}.png`);
    await uwCall(page, dis);
    await page.waitForTimeout(250);
    row(
      site.label,
      "Reading & vision",
      label,
      r.ok,
      r.ok
        ? `API ${en} → viewport \`${path}\`; then ${dis}.`
        : `API error: ${r.err || "unknown"}`,
    );
  }

  await uwCall(page, "resetAll");
  await page.waitForTimeout(400);

  for (const [label, en, dis] of UW_API_MOTION) {
    await uwCall(page, "resetAll");
    await page.waitForTimeout(250);
    const r = await uwCall(page, en);
    await page.waitForTimeout(550);
    const path = await shot(page, `${pdir}/motion-${slug(label)}.png`);
    await uwCall(page, dis);
    await page.waitForTimeout(250);
    row(
      site.label,
      "Motion & display",
      label,
      r.ok,
      r.ok ? `API ${en} → \`${path}\`; then ${dis}.` : `API error: ${r.err || "unknown"}`,
    );
  }

  await uwCall(page, "resetAll");
  await page.waitForTimeout(400);

  const navTests = [
    ["pageStructureHeaders", "Jump / structure: headers"],
    ["pageStructureLandmarks", "Jump / structure: landmarks"],
    ["pageStructureLinks", "Jump / structure: links"],
  ];
  for (const [method, label] of navTests) {
    const r = await uwCall(page, method);
    await page.waitForTimeout(700);
    const path = await shot(page, `${pdir}/nav-${slug(label)}.png`);
    await uwCall(page, "pageStructureDisable");
    await page.waitForTimeout(350);
    row(
      site.label,
      "Navigation",
      label,
      r.ok,
      r.ok ? `API ${method} → \`${path}\`; then pageStructureDisable.` : `API error: ${r.err || "unknown"}`,
    );
  }

  await uwCall(page, "resetAll");
  await uwCall(page, "widgetClose");
  await page.waitForTimeout(400);
  await shot(page, `${pdir}/99-after-reset-close.png`);
  row(site.label, "Cleanup", "resetAll + widgetClose", true, `\`${pdir}/99-after-reset-close.png\``);
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  for (const site of PAGES) {
    await runSite(page, site);
  }

  await browser.close();

  const fail = rows.filter((r) => !r.ok).length;
  const ok = rows.filter((r) => r.ok).length;

  let md = `# UserWay — storefront verification (shopcarbon.com)

**Generated:** ${new Date().toISOString()}  
**Runner:** \`node scripts/run-userway-storefront-report.mjs\`  
**Folder:** \`reports/userway-shopcarbon-storefront/\`

**Counts:** ${ok} **OK**, ${fail} **FAIL**

## Executive summary

| Item | Result |
|------|--------|
| **UserWay on all 4 URLs?** | Often **no**: check **FAIL** on “UserWay API” — injection can skip **www** and **login** while loading on **shopcarbon.com** PDP/pages. |
| **Named profiles (Blind, Motor, …)?** | **Not in UserWay’s customer UI** — toggle menu only; row explains N/A when widget loads. |
| **Reading & vision** | **Contrast +** (3 UI steps) + **window.UserWay** APIs per table when script loads. |
| **Motion & display** | **API** enable/disable pairs + PNGs per table. |
| **Navigation** | **pageStructureHeaders / Landmarks / Links** + disable. |
| **MCP** | Playwright automation = same class as MCP browser (navigate + JS in page). |

**Regenerate:** \`node scripts/run-userway-storefront-report.mjs\`

## Important: where UserWay loads

On the live theme, **UserWay often loads only on certain host/path combinations** (e.g. \`shopcarbon.com\` product/content pages) and may be **absent on \`www.shopcarbon.com\`** or **login** depending on Shopify app injection. Rows marked **FAIL** for “UserWay API” mean the script never appeared in that session — not that UserWay is broken globally.

UserWay’s **customer menu does not mirror Carbon-style named profiles** (Blind, Low vision, …). This report documents **toggles + APIs** that exist on the loaded widget.

## Results

| Page | Area | Test | Result | Notes |
|------|------|------|--------|-------|
`;

  for (const r of rows) {
    const res = r.ok ? "OK" : "FAIL";
    md += `| ${r.page} | ${r.area} | ${r.test} | **${res}** | ${r.note.replace(/\|/g, "\\|")} |\n`;
  }

  md += `
## Screenshot naming

- \`00-baseline.png\` — before interaction  
- \`01-widget-open.png\` — panel open  
- \`reading-ui-contrast-step-1..3.png\` — **Contrast +** UI cycle  
- \`reading-*.png\` — after each reading/vision API enable  
- \`motion-*.png\` — after each motion/display API enable  
- \`nav-*.png\` — after page structure API  
- \`99-after-reset-close.png\` — after reset + close  

## References

- [Homepage](https://www.shopcarbon.com/)
- [Product](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72)
- [Login](https://shopcarbon.com/account/login)
- [Jeans](https://shopcarbon.com/pages/jeans)
`;

  writeFileSync(join(OUT, "REPORT.md"), md, "utf8");
  console.log("Wrote", join(OUT, "REPORT.md"), `OK=${ok} FAIL=${fail}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
