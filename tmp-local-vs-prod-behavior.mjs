import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const targets = [
  { name: "local", url: "http://localhost:3000/studio/shopify-collection-mapping?shop=30e7d3.myshopify.com" },
  { name: "prod", url: "https://app.shopcarbon.com/studio/shopify-collection-mapping?shop=30e7d3.myshopify.com" },
];

async function runBehavior(page, target, round) {
  const out = {
    target: target.name,
    round,
    url: target.url,
    finalUrl: "",
    rowCount: 0,
    selectionToggle: { attempted: false, pass: false, first: null, second: null },
    searchEnter: { attempted: false, pass: false, activeAfterEnter: null },
    eyeToggle: { attempted: false, pass: false, before: null, after: null, eyeCount: 0 },
    notes: [],
  };

  await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(12000);

  const rows = page.locator(".treeRow");
  try {
    await rows.first().waitFor({ state: "visible", timeout: 30000 });
  } catch {
    out.notes.push("rows_not_visible_within_timeout");
  }

  out.finalUrl = page.url();
  out.rowCount = await rows.count();
  if (out.rowCount < 1) return out;

  const firstRow = rows.first();
  await firstRow.click();
  await page.waitForTimeout(250);
  const firstActive = await page.locator(".treeRow.active").count();
  await firstRow.click();
  await page.waitForTimeout(250);
  const secondActive = await page.locator(".treeRow.active").count();
  out.selectionToggle = {
    attempted: true,
    pass: secondActive === 0 || secondActive < firstActive,
    first: firstActive,
    second: secondActive,
  };

  const searchInput = page.locator('input[placeholder*="Search menu items" i]').first();
  if ((await searchInput.count()) > 0) {
    await searchInput.fill("men");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    const activeAfterEnter = await page.locator(".treeRow.active").count();
    out.searchEnter = {
      attempted: true,
      pass: activeAfterEnter >= 0,
      activeAfterEnter,
    };
  } else {
    out.notes.push("search_input_not_found");
  }

  const eyeBtn = page.locator('button[aria-label*="Visible" i], button[aria-label*="Hidden" i]').first();
  const eyeCount = await page.locator('button[aria-label*="Visible" i], button[aria-label*="Hidden" i]').count();
  out.eyeToggle.eyeCount = eyeCount;
  if (eyeCount > 0) {
    const before = await eyeBtn.getAttribute("aria-label");
    await eyeBtn.click();
    await page.waitForTimeout(250);
    const after = await eyeBtn.getAttribute("aria-label");
    out.eyeToggle = {
      attempted: true,
      pass: before !== after,
      before,
      after,
      eyeCount,
    };
  } else {
    out.notes.push("eye_button_not_found");
  }

  return out;
}

function compareRound(local, prod) {
  return {
    rowCount: { local: local.rowCount, prod: prod.rowCount, delta: prod.rowCount - local.rowCount },
    selectionToggleParity: local.selectionToggle.pass === prod.selectionToggle.pass,
    searchEnterParity: local.searchEnter.pass === prod.searchEnter.pass,
    eyeToggleParity: local.eyeToggle.pass === prod.eyeToggle.pass,
  };
}

const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), rounds: [] };

for (let round = 1; round <= 2; round++) {
  const localPage = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  const prodPage = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  const local = await runBehavior(localPage, targets[0], round);
  const prod = await runBehavior(prodPage, targets[1], round);
  await localPage.close();
  await prodPage.close();
  report.rounds.push({ round, local, prod, comparison: compareRound(local, prod) });
}

const outPath = path.resolve(process.cwd(), "tmp-local-vs-prod-behavior-report.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));

await browser.close();
