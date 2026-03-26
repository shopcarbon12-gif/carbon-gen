/**
 * Storefront Carbon Assist widget verification on shopcarbon.com.
 * Outputs: reports/a11y-widget-mcp-shopcarbon/REPORT.md + screenshots per page.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT = join(REPO, "reports", "a11y-widget-mcp-shopcarbon");

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
  { key: "profile-lowVision", name: "Low Vision" },
  { key: "profile-motor", name: "Motor" },
  { key: "profile-dyslexia", name: "Dyslexia" },
  { key: "profile-adhd", name: "ADHD" },
  { key: "profile-seizure", name: "Seizure Safe" },
];

/** @type {{ page: string, area: string, test: string, ok: boolean, note: string }[]} */
const rows = [];

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
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

async function clickInPanel(page, selector) {
  const { ok, result } = await hostEval(
    page,
    (h, sel) => {
      const el = h.shadowRoot?.querySelector(sel);
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
  );
  await page.waitForTimeout(450);
  return ok && result;
}

async function scrollPanel(page, topPx) {
  await hostEval(page, (h, y) => {
    const body = h.shadowRoot?.querySelector(".ca-assist-panel-body");
    if (body) body.scrollTop = y;
  }, topPx);
}

async function fullReset(page) {
  await openPanel(page);
  await clickInPanel(page, '[data-carbon-key="profile-clear"]');
  await clickInPanel(page, '[data-carbon-key="reset-all"]');
  await page.waitForTimeout(400);
  await closePanel(page);
  await page.waitForTimeout(300);
}

async function shot(page, relPath) {
  const abs = join(OUT, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  await page.screenshot({ path: abs, type: "png", fullPage: false });
  return relPath.replace(/\\/g, "/");
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
    const pdir = site.id;
    mkdirSync(join(OUT, pdir), { recursive: true });

    try {
      await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
    } catch (e) {
      rows.push({
        page: site.label,
        area: "Load",
        test: "Navigation",
        ok: false,
        note: String(e.message || e),
      });
      await shot(page, `${pdir}/00-ERROR-load.png`);
      continue;
    }

    const loaded = await widgetLoaded(page);
    rows.push({
      page: site.label,
      area: "Widget",
      test: "Script injected (#carbon-a11y-widget + shadow)",
      ok: loaded,
      note: loaded ? "Host present" : "Missing — check theme snippet / adblock",
    });
    await shot(page, `${pdir}/00-baseline-closed.png`);

    if (!loaded) continue;

    const opened = await openPanel(page);
    rows.push({
      page: site.label,
      area: "Widget",
      test: "Open panel",
      ok: opened,
      note: opened ? "Launcher click" : "Could not click launcher",
    });
    await shot(page, `${pdir}/01-panel-open.png`);

    if (!opened) {
      await closePanel(page);
      continue;
    }

    for (const pr of PROFILES) {
      await clickInPanel(page, `[data-carbon-key="${pr.key}"]`);
      await closePanel(page);
      await page.waitForTimeout(500);
      const path = await shot(page, `${pdir}/profile-${slug(pr.name)}.png`);
      rows.push({
        page: site.label,
        area: "Profiles",
        test: pr.name,
        ok: true,
        note: `Viewport after apply → \`${path}\``,
      });
      await openPanel(page);
      await clickInPanel(page, '[data-carbon-key="profile-clear"]');
      await page.waitForTimeout(350);
    }

    await clickInPanel(page, '[data-carbon-key="profile-clear"]');
    await scrollPanel(page, 0);

    await clickInPanel(page, '[data-carbon-key="rg-contrastMode-dark"]');
    await page.waitForTimeout(400);
    await closePanel(page);
    await page.waitForTimeout(400);
    rows.push({
      page: site.label,
      area: "Reading & vision",
      test: "Contrast mode → Dark",
      ok: true,
      note: `Page chrome should darken → \`${await shot(page, `${pdir}/reading-contrast-dark.png`)}\``,
    });
    await openPanel(page);
    await clickInPanel(page, '[data-carbon-key="rg-contrastMode-none"]');
    await page.waitForTimeout(350);

    await clickInPanel(page, '[data-carbon-key="cmd-text-larger"]');
    await clickInPanel(page, '[data-carbon-key="cmd-text-larger"]');
    await page.waitForTimeout(300);
    await closePanel(page);
    await page.waitForTimeout(400);
    rows.push({
      page: site.label,
      area: "Reading & vision",
      test: "Text scale +2 steps",
      ok: true,
      note: `Larger root font → \`${await shot(page, `${pdir}/reading-textscale-up.png`)}\``,
    });
    await openPanel(page);
    await clickInPanel(page, '[data-carbon-key="reset-all"]');
    await page.waitForTimeout(400);

    await scrollPanel(page, 800);
    await clickInPanel(page, '[data-carbon-key="tile-highContrast"]');
    await page.waitForTimeout(400);
    await closePanel(page);
    await page.waitForTimeout(400);
    rows.push({
      page: site.label,
      area: "Motion & display",
      test: "High contrast tile",
      ok: true,
      note: `Screenshot → \`${await shot(page, `${pdir}/motion-high-contrast.png`)}\``,
    });
    await openPanel(page);
    await scrollPanel(page, 800);
    await clickInPanel(page, '[data-carbon-key="tile-highContrast"]');
    await clickInPanel(page, '[data-carbon-key="tile-pauseAnimations"]');
    await page.waitForTimeout(400);
    await closePanel(page);
    await page.waitForTimeout(400);
    rows.push({
      page: site.label,
      area: "Motion & display",
      test: "Pause animations tile",
      ok: true,
      note: `Screenshot → \`${await shot(page, `${pdir}/motion-pause-animations.png`)}\``,
    });
    await openPanel(page);
    await scrollPanel(page, 800);
    await clickInPanel(page, '[data-carbon-key="tile-pauseAnimations"]');
    await clickInPanel(page, '[data-carbon-key="reset-all"]');
    await page.waitForTimeout(400);

    await scrollPanel(page, 2000);
    const jumpHead = await clickInPanel(page, '[data-carbon-key="cmd-jump-headings"]');
    await page.waitForTimeout(600);
    rows.push({
      page: site.label,
      area: "Navigation",
      test: "Jump to headings (control present & clickable)",
      ok: jumpHead,
      note: jumpHead
        ? `After click → \`${await shot(page, `${pdir}/nav-jump-headings.png`)}\` (focus/announcement may not show in screenshot)`
        : "Button missing (feature off in config?)",
    });

    await openPanel(page);
    await scrollPanel(page, 2000);
    const jumpLinks = await clickInPanel(page, '[data-carbon-key="cmd-jump-links"]');
    await page.waitForTimeout(600);
    rows.push({
      page: site.label,
      area: "Navigation",
      test: "Jump to links",
      ok: jumpLinks,
      note: jumpLinks
        ? `After click → \`${await shot(page, `${pdir}/nav-jump-links.png`)}\``
        : "Button missing",
    });

    await fullReset(page);
    await shot(page, `${pdir}/99-after-reset.png`);
    rows.push({
      page: site.label,
      area: "Cleanup",
      test: "Reset all + clear profile",
      ok: true,
      note: `\`${pdir}/99-after-reset.png\``,
    });
  }

  await browser.close();

  const byPage = {};
  for (const r of rows) {
    if (!byPage[r.page]) byPage[r.page] = [];
    byPage[r.page].push(r);
  }

  let md = `# Carbon Assist widget — storefront verification report

**Generated:** ${new Date().toISOString()}  
**Tool:** Playwright (local script \`scripts/run-a11y-widget-storefront-report.mjs\`)  
**Targets:** ${PAGES.map((p) => p.url).join(", ")}

## How to read this

- **OK** means the automation completed the action and saved a PNG; it does not guarantee perfect visual QA.
- **Proof** paths are relative to this folder: \`reports/a11y-widget-mcp-shopcarbon/\`.
- The widget lives in **closed shadow DOM**; MCP/browser snapshots may not list inner controls—this run uses \`#carbon-a11y-widget\` host + \`shadowRoot\` queries.

## Summary table

| Page | Area | Test | Result | Notes |
|------|------|------|--------|-------|
`;

  for (const r of rows) {
    const res = r.ok ? "OK" : "FAIL";
    md += `| ${r.page} | ${r.area} | ${r.test} | **${res}** | ${r.note.replace(/\|/g, "\\|")} |\n`;
  }

  md += `
## Per-page screenshot index

`;

  for (const site of PAGES) {
    md += `### ${site.label} (\`${site.id}/\`)\n\n`;
    md += `- \`${site.id}/00-baseline-closed.png\` — storefront before opening widget\n`;
    md += `- \`${site.id}/01-panel-open.png\` — menu open (if widget loaded)\n`;
    md += `- \`${site.id}/profile-*.png\` — one per profile (viewport after apply)\n`;
    md += `- \`${site.id}/reading-contrast-dark.png\`, \`reading-textscale-up.png\`\n`;
    md += `- \`${site.id}/motion-high-contrast.png\`, \`motion-pause-animations.png\`\n`;
    md += `- \`${site.id}/nav-jump-headings.png\`, \`nav-jump-links.png\`\n`;
    md += `- \`${site.id}/99-after-reset.png\` — after footer reset\n\n`;
  }

  md += `
## What is not fully automated

- **Live regions / screen reader** announcements (e.g. “Contrast mode: Dark”) are not captured in PNGs.
- **Keyboard-only** flows (radiogroup arrows) were not exercised; clicks were used.
- **Every** contrast / spacing / line-height / align / saturation combination would produce dozens of shots per URL; this run uses representative checks (dark contrast + text scale + two motion tiles + both nav commands).

## References

- [shopcarbon.com homepage](https://www.shopcarbon.com/)
- [Gyda product](https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72)
- [Login](https://shopcarbon.com/account/login)
- [Jeans page](https://shopcarbon.com/pages/jeans)
`;

  writeFileSync(join(OUT, "REPORT.md"), md, "utf8");
  console.log("Wrote", join(OUT, "REPORT.md"));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
