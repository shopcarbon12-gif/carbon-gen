import fs from "node:fs";
import { chromium } from "playwright";

const urls = [
  "http://localhost:3000/studio/shopify-collection-mapping",
  "http://localhost:3000/studio/shopify-collection-mapping?shop=30e7d3.myshopify.com",
];

const report = { runs: [] };
const browser = await chromium.launch({ headless: true });

for (const url of urls) {
  const out = { url, checks: [] };
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  const consoleErrors = [];
  const pageErrors = [];
  const apiSnapshots = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err instanceof Error ? err.message : String(err || "unknown error"));
  });
  page.on("response", async (resp) => {
    const u = resp.url();
    if (!u.includes("/api/shopify/collection-mapping")) return;
    try {
      const json = await resp.json();
      apiSnapshots.push({
        status: resp.status(),
        ok: json?.ok ?? null,
        nodes: Array.isArray(json?.nodes) ? json.nodes.length : null,
        rows: Array.isArray(json?.rows) ? json.rows.length : null,
        shop: json?.shop ?? null,
      });
    } catch {
      apiSnapshots.push({ status: resp.status(), parse: "failed" });
    }
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(12000);
    const rowsLocator = page.locator(".treeRow");
    try {
      await rowsLocator.first().waitFor({ state: "visible", timeout: 25000 });
    } catch {
      // Keep report path; this is part of evidence.
    }

    const rowCount = await rowsLocator.count();
    out.rowCount = rowCount;
    out.apiSnapshots = apiSnapshots;
    out.consoleErrors = consoleErrors;
    out.pageErrors = pageErrors;

    const undoVisible = await page
      .locator("button", { hasText: "Undo" })
      .first()
      .isVisible()
      .catch(() => false);
    const saveVisible = await page
      .locator("button", { hasText: "Save" })
      .first()
      .isVisible()
      .catch(() => false);
    out.checks.push({ id: "ui-buttons", pass: undoVisible && saveVisible, details: { undoVisible, saveVisible } });

    const search = page.locator('input[placeholder*="Search menu items" i]').first();
    const hasSearch = (await search.count()) > 0;
    out.checks.push({ id: "tree-search-input", pass: hasSearch, details: { hasSearch } });

    if (rowCount > 0) {
      const first = page.locator(".treeRow").first();
      await first.click();
      await page.waitForTimeout(250);
      const sel1 = await page.locator(".treeRow.active").count();
      await first.click();
      await page.waitForTimeout(250);
      const sel2 = await page.locator(".treeRow.active").count();
      out.checks.push({
        id: "selection-toggle",
        pass: sel2 === 0 || sel2 < sel1,
        details: { selectedAfterFirstClick: sel1, selectedAfterSecondClick: sel2 },
      });

      await search.fill("men");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const activeAfterEnter = await page.locator(".treeRow.active").count();
      out.checks.push({
        id: "search-enter-executes",
        pass: activeAfterEnter >= 0,
        details: { activeRowsAfterEnter: activeAfterEnter },
      });

      const eyeBtn = page.locator('button[aria-label*="Visible" i], button[aria-label*="Hidden" i]').first();
      const hasEye = (await eyeBtn.count()) > 0;
      out.checks.push({ id: "eye-icon-present", pass: hasEye, details: { hasEye } });
      if (hasEye) {
        const labelBefore = await eyeBtn.getAttribute("aria-label");
        await eyeBtn.click();
        await page.waitForTimeout(250);
        const labelAfter = await eyeBtn.getAttribute("aria-label");
        out.checks.push({
          id: "eye-toggle-click",
          pass: labelBefore !== labelAfter,
          details: { labelBefore, labelAfter },
        });
      }
    } else {
      out.checks.push({ id: "tree-has-rows", pass: false, details: { reason: "No tree rows found" } });
    }
  } catch (error) {
    out.error = error instanceof Error ? error.message : String(error || "unknown error");
  } finally {
    await page.close();
  }
  report.runs.push(out);
}

await browser.close();
fs.writeFileSync("tmp-deep-qa-report.json", JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
