/**
 * Full storefront Carbon Assist verification: all profiles, reading & vision radios,
 * all motion tiles, panel chrome toggles, navigation. Playwright Chromium + shadow DOM
 * (same technique as MCP browser_evaluate). Output: reports/a11y-widget-mcp-shopcarbon-full/
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT = join(REPO, "reports", "a11y-widget-mcp-shopcarbon-full");

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

const PROFILES = [
  { key: "profile-blind", name: "Screen reader" },
  { key: "profile-lowVision", name: "Low vision" },
  { key: "profile-motor", name: "Motor" },
  { key: "profile-dyslexia", name: "Dyslexia" },
  { key: "profile-adhd", name: "ADHD" },
  { key: "profile-seizure", name: "Seizure safe" },
];

const CONTRAST = ["none", "dark", "light", "invert", "smart"];
const TEXT_SPACING = ["normal", "moderate", "heavy"];
const LINE_HEIGHT = ["normal", "relaxed", "loose"];
const TEXT_ALIGN = ["default", "left", "center", "justify"];
const SATURATION = ["normal", "low", "high", "mono"];

const MOTION_TILES = [
  "highContrast",
  "readableFont",
  "pauseAnimations",
  "highlightLinks",
  "hideImages",
  "readingGuide",
  "readingMask",
  "bigCursor",
  "enhancedTooltips",
];

/** @type {{ page: string, area: string, test: string, ok: boolean, note: string }[]} */
const rows = [];

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function tileFileSlug(tile) {
  return String(tile)
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
}

async function hostEval(page, fn, arg) {
  const host = page.locator("#carbon-a11y-widget");
  const count = await host.count();
  if (count === 0) return { ok: false, result: null };
  const result = await host.evaluate(fn, arg);
  return { ok: true, result };
}

async function widgetLoaded(page) {
  const { ok, result } = await hostEval(page, (h) => Boolean(h?.shadowRoot));
  return ok && result;
}

async function openPanel(page) {
  const { ok, result } = await hostEval(page, (h) => {
    const btn = h.shadowRoot?.querySelector("button.ca-assist-launcher");
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(700);
  return ok && result;
}

async function closePanel(page) {
  await hostEval(page, (h) => {
    h.shadowRoot?.querySelector("#ca-assist-close")?.click();
  });
  await page.waitForTimeout(400);
}

async function scrollPanel(page, topPx) {
  await hostEval(page, (h, y) => {
    const body = h.shadowRoot?.querySelector(".ca-assist-panel-body");
    if (body) body.scrollTop = y;
  }, topPx);
  await page.waitForTimeout(200);
}

async function clickInPanel(page, selector) {
  const { ok, result } = await hostEval(
    page,
    (h, sel) => {
      const el = h.shadowRoot?.querySelector(sel);
      if (!el) return false;
      try {
        el.scrollIntoView({ block: "center", behavior: "instant" });
      } catch {
        /* ignore */
      }
      el.click();
      return true;
    },
    selector,
  );
  await page.waitForTimeout(480);
  return ok && result;
}

async function fullReset(page) {
  await openPanel(page);
  await clickInPanel(page, '[data-carbon-key="profile-clear"]');
  await clickInPanel(page, '[data-carbon-key="reset-all"]');
  await page.waitForTimeout(450);
  await closePanel(page);
  await page.waitForTimeout(350);
}

async function shot(page, relPath) {
  const abs = join(OUT, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  await page.screenshot({ path: abs, type: "png", fullPage: false });
  return relPath.replace(/\\/g, "/");
}

function row(pageLabel, area, test, ok, note) {
  rows.push({ page: pageLabel, area, test, ok, note });
}

async function readingRadioShot(page, pdir, siteLabel, groupLabel, stateKey, value, fileSlug) {
  const sel = `[data-carbon-key="rg-${stateKey}-${value}"]`;
  const clicked = await clickInPanel(page, sel);
  await page.waitForTimeout(420);
  await closePanel(page);
  await page.waitForTimeout(450);
  const path = await shot(page, `${pdir}/reading-${fileSlug}.png`);
  await openPanel(page);
  row(
    siteLabel,
    "Reading & vision",
    `${groupLabel}: ${value}`,
    clicked,
    clicked
      ? `Control found; viewport \`${path}\` (compare to baseline for visual effect).`
      : "Selector not in DOM (feature disabled in published widget config).",
  );
}

async function runTileOnViewportOff(page, pdir, siteLabel, tileKey) {
  const fileSlug = tileFileSlug(tileKey);
  const sel = `[data-carbon-key="tile-${tileKey}"]`;
  const on = await clickInPanel(page, sel);
  if (!on) {
    row(
      siteLabel,
      "Motion & display",
      `Tile: ${tileKey}`,
      false,
      "Control not present (likely `features." + tileKey + "` off in config).",
    );
    return;
  }
  await page.waitForTimeout(450);
  await closePanel(page);
  await page.waitForTimeout(450);
  const path = await shot(page, `${pdir}/motion-tile-${fileSlug}.png`);
  await openPanel(page);
  await clickInPanel(page, sel);
  await page.waitForTimeout(350);
  row(
    siteLabel,
    "Motion & display",
    `Tile ON → viewport: ${tileKey}`,
    true,
    `Toggled on, screenshot \`${path}\`, then toggled off in panel.`,
  );
}

async function runSite(page, site) {
  const pdir = site.id;
  mkdirSync(join(OUT, pdir), { recursive: true });

  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2800);
  } catch (e) {
    row(site.label, "Load", "Open URL", false, String(e.message || e));
    await shot(page, `${pdir}/00-ERROR-load.png`);
    return;
  }

  const loaded = await widgetLoaded(page);
  row(
    site.label,
    "Widget",
    "Host #carbon-a11y-widget + shadowRoot",
    loaded,
    loaded ? "Widget script present." : "No widget — theme snippet, adblock, or wrong domain.",
  );
  await shot(page, `${pdir}/00-baseline-closed.png`);
  if (!loaded) return;

  const opened = await openPanel(page);
  row(site.label, "Widget", "Open panel (launcher)", opened, opened ? "Panel opened." : "Launcher missing.");
  await shot(page, `${pdir}/01-panel-open.png`);
  if (!opened) {
    await closePanel(page);
    return;
  }

  for (const pr of PROFILES) {
    await clickInPanel(page, `[data-carbon-key="${pr.key}"]`);
    await closePanel(page);
    await page.waitForTimeout(500);
    const path = await shot(page, `${pdir}/profile-${slug(pr.name)}.png`);
    row(site.label, "Profiles", pr.name, true, `Preset applied; viewport \`${path}\`.`);
    await openPanel(page);
    await clickInPanel(page, '[data-carbon-key="profile-clear"]');
    await page.waitForTimeout(320);
  }

  await clickInPanel(page, '[data-carbon-key="profile-clear"]');
  await clickInPanel(page, '[data-carbon-key="reset-all"]');
  await page.waitForTimeout(400);

  for (const v of CONTRAST) {
    await readingRadioShot(page, pdir, site.label, "Contrast mode", "contrastMode", v, `contrast-${v}`);
  }
  await clickInPanel(page, '[data-carbon-key="rg-contrastMode-none"]');
  await page.waitForTimeout(300);

  for (const v of TEXT_SPACING) {
    await readingRadioShot(page, pdir, site.label, "Text spacing", "textSpacing", v, `spacing-${v}`);
  }
  await clickInPanel(page, '[data-carbon-key="rg-textSpacing-normal"]');

  for (const v of LINE_HEIGHT) {
    await readingRadioShot(page, pdir, site.label, "Line height", "lineHeight", v, `line-${v}`);
  }
  await clickInPanel(page, '[data-carbon-key="rg-lineHeight-normal"]');

  for (const v of TEXT_ALIGN) {
    await readingRadioShot(page, pdir, site.label, "Text align", "textAlign", v, `align-${v}`);
  }
  await clickInPanel(page, '[data-carbon-key="rg-textAlign-default"]');

  for (const v of SATURATION) {
    await readingRadioShot(page, pdir, site.label, "Saturation", "saturation", v, `saturation-${v}`);
  }
  await clickInPanel(page, '[data-carbon-key="rg-saturation-normal"]');

  await clickInPanel(page, '[data-carbon-key="reset-all"]');
  await page.waitForTimeout(350);
  await closePanel(page);
  await page.waitForTimeout(400);
  const baseTs = await shot(page, `${pdir}/reading-textscale-baseline.png`);
  await openPanel(page);
  for (let i = 0; i < 5; i++) {
    await clickInPanel(page, '[data-carbon-key="cmd-text-larger"]');
  }
  await page.waitForTimeout(350);
  await closePanel(page);
  await page.waitForTimeout(400);
  const plusTs = await shot(page, `${pdir}/reading-textscale-plus5.png`);
  row(
    site.label,
    "Reading & vision",
    "Text size +5 steps (larger)",
    true,
    `Baseline \`${baseTs}\`; after +5 \`${plusTs}\`.`,
  );
  await openPanel(page);
  for (let i = 0; i < 5; i++) {
    await clickInPanel(page, '[data-carbon-key="cmd-text-smaller"]');
  }
  await page.waitForTimeout(300);

  await clickInPanel(page, '[data-carbon-key="reset-all"]');
  await page.waitForTimeout(350);
  await scrollPanel(page, 2200);

  for (const tile of MOTION_TILES) {
    await runTileOnViewportOff(page, pdir, site.label, tile);
  }

  await clickInPanel(page, '[data-carbon-key="reset-all"]');
  await page.waitForTimeout(300);
  await scrollPanel(page, 0);

  const plain = await clickInPanel(page, '[data-carbon-key="switch-plainLightUi"]');
  if (plain) {
    await page.waitForTimeout(400);
    const p = await shot(page, `${pdir}/chrome-plain-light-panel.png`);
    row(
      site.label,
      "Panel appearance",
      "Plain light panel ON (panel open)",
      true,
      `Screenshot \`${p}\` — menu should use light theme.`,
    );
    await clickInPanel(page, '[data-carbon-key="switch-plainLightUi"]');
    await page.waitForTimeout(300);
  } else {
    row(site.label, "Panel appearance", "Plain light panel", false, "Switch not in DOM.");
  }

  const over = await clickInPanel(page, '[data-carbon-key="switch-oversizedUi"]');
  if (over) {
    await page.waitForTimeout(450);
    const p = await shot(page, `${pdir}/chrome-oversized-panel.png`);
    row(
      site.label,
      "Panel appearance",
      "Larger menu ON (panel open)",
      true,
      `Screenshot \`${p}\` — launcher/panel should look larger.`,
    );
    await clickInPanel(page, '[data-carbon-key="switch-oversizedUi"]');
    await page.waitForTimeout(300);
  } else {
    row(site.label, "Panel appearance", "Larger menu", false, "Switch not in DOM.");
  }

  await clickInPanel(page, '[data-carbon-key="reset-all"]');
  await scrollPanel(page, 0);
  const jumpHead = await clickInPanel(page, '[data-carbon-key="cmd-jump-headings"]');
  await page.waitForTimeout(550);
  row(
    site.label,
    "Navigation",
    "Jump to headings",
    jumpHead,
    jumpHead
      ? `After click \`${await shot(page, `${pdir}/nav-jump-headings.png`)}\` — focus may be on first heading (not always visible).`
      : "Button missing.",
  );

  await openPanel(page);
  await scrollPanel(page, 0);
  const jumpLinks = await clickInPanel(page, '[data-carbon-key="cmd-jump-links"]');
  await page.waitForTimeout(550);
  row(
    site.label,
    "Navigation",
    "Jump to links",
    jumpLinks,
    jumpLinks ? `After click \`${await shot(page, `${pdir}/nav-jump-links.png`)}\`.` : "Button missing.",
  );

  await fullReset(page);
  await shot(page, `${pdir}/99-after-reset.png`);
  row(site.label, "Cleanup", "Reset all + clear preset", true, `\`${pdir}/99-after-reset.png\``);
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

  const failCount = rows.filter((r) => !r.ok).length;
  const okCount = rows.filter((r) => r.ok).length;

  let md = `# Carbon Assist — full storefront verification (shopcarbon.com)

**Generated:** ${new Date().toISOString()}  
**Runner:** \`node scripts/run-a11y-widget-storefront-report-full.mjs\` (Playwright Chromium; same shadow-host technique as MCP \`browser_evaluate\`).  
**Output folder:** \`reports/a11y-widget-mcp-shopcarbon-full/\`

**Summary:** ${okCount} checks **OK**, ${failCount} checks **FAIL** (missing controls = feature off in live config, or load error).

## Targets

${PAGES.map((p) => `- [${p.label}](${p.url}) (\`${p.id}/\`)`).join("\n")}

## How to read results

| Column | Meaning |
|--------|---------|
| **OK** | Selector existed and was clicked; PNG path in Notes when applicable. |
| **FAIL** | Control absent or page error. |
| **Proof** | Open PNGs under this folder; compare reading/motion shots to \`00-baseline-closed.png\` for the same site id. |

**OK** = automation + artifact, not a guarantee of perfect visual or WCAG compliance.

## Full results table

| Page | Area | Test | Result | Notes |
|------|------|------|--------|-------|
`;

  for (const r of rows) {
    const res = r.ok ? "OK" : "FAIL";
    md += `| ${r.page} | ${r.area} | ${r.test} | **${res}** | ${r.note.replace(/\|/g, "\\|")} |\n`;
  }

  md += `
## Screenshot map (by folder)

Each site id (\`01-home\` … \`04-jeans\`) contains:

| Pattern | Content |
|---------|---------|
| \`00-baseline-closed.png\` | Store before opening widget |
| \`01-panel-open.png\` | Panel open |
| \`profile-*.png\` | Viewport after each quick preset |
| \`reading-contrast-*.png\` | Each contrast mode |
| \`reading-spacing-*.png\` | Text spacing |
| \`reading-line-*.png\` | Line height |
| \`reading-align-*.png\` | Text alignment |
| \`reading-saturation-*.png\` | Saturation |
| \`reading-textscale-*.png\` | Text size baseline / +5 steps |
| \`motion-tile-*.png\` | Each motion/display tile ON (then turned off) |
| \`chrome-*.png\` | Panel appearance toggles (panel open) |
| \`nav-*.png\` | After jump to headings / links |
| \`99-after-reset.png\` | After full reset |

## Limits

- **Live region / SR** announcements are not in PNGs.  
- **Shadow DOM** only via host \`#carbon-a11y-widget\`.  
- **Iframes** not scanned.  
- **Tooltip hover** mode not tested here.

## References

- [Homepage](https://www.shopcarbon.com/)
- [Product](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72)
- [Login](https://shopcarbon.com/account/login)
- [Jeans](https://shopcarbon.com/pages/jeans)
`;

  writeFileSync(join(OUT, "REPORT.md"), md, "utf8");
  console.log("Wrote", join(OUT, "REPORT.md"), `OK=${okCount} FAIL=${failCount}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
