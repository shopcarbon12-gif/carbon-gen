/**
 * Export GSC 404 batches by locale filter using Playwright.
 * Run with a logged-in Google session. Saves each batch and merges.
 *
 * Usage: node scripts/export-gsc-404-batches.mjs
 *   (uses headed browser - ensure you're logged into GSC)
 *
 * Or interactively: run each locale via MCP, extract URLs, save to gsc-batches/
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp-404-report");
const batchesDir = path.join(reportDir, "gsc-batches");

/** Locale filters – each exports URLs containing that path (≤2000 per export). */
export const LOCALE_FILTERS = [
  "/es/",
  "/pt/",
  "/de/",
  "/ar/",
  "/he/",
  "/fr/",
  "/it/",
  "/ru/",
  "/ja/",
  "/ko/",
  "/zh/",
  "/hy/",
  "/fil/",
  "/az/",
  "/be/",
  "/am/",
  "/as/",
  "/bn/",
  "/bs/",
  "/eu/",
  "/af/",
  "/ak/",
  "/ro/",
  "/sq/",
  "/nl/",
  "/pl/",
  "/tr/",
];

/**
 * Path filters – for default-locale and high-volume sections.
 * GSC export limit is ~2000 per view; these split the URL space.
 */
export const PATH_FILTERS = [
  "/products/",
  "/collections/",
  "/pages/",
  "/blogs/",
  "/search",
];

/**
 * Handle-prefix filters – subdivide /products/ and /collections/ when >2000.
 * Use when PATH_FILTERS still hit the 2000 cap (run after initial path export).
 */
export const HANDLE_PREFIX_FILTERS = [
  ...["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
].flatMap((c) => [`/products/${c}`, `/collections/${c}`]);

const GSC_404_URL =
  "https://search.google.com/search-console/index/drilldown?resource_id=sc-domain%3Ashopcarbon.com&item_key=CAMYDSAC";

async function extractTableUrls(page) {
  const cells = await page
    .locator("table tbody tr td:first-child")
    .evaluateAll((el) =>
      el.map((c) => c.textContent?.trim().replace(/[\u200e\u200f]/g, "")).filter(Boolean)
    );
  return cells;
}

async function applyFilter(page, filter) {
  await page.getByRole("button", { name: "Filter table rows" }).click();
  await page.waitForTimeout(600);
  const textbox = page.getByRole("textbox", { name: "Filter by URL" });
  await textbox.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await textbox.fill(filter);
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(2000);
}

async function clearFilter(page) {
  await page.getByRole("button", { name: "Filter table rows" }).click();
  await page.waitForTimeout(500);
  const textbox = page.getByRole("textbox", { name: "Filter by URL" });
  await textbox.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  await textbox.fill("");
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(1500);
}

function getAllFilters() {
  const locale = LOCALE_FILTERS;
  const path = PATH_FILTERS;
  const usePrefix = process.argv.includes("--prefix");
  const prefix = usePrefix ? HANDLE_PREFIX_FILTERS : [];
  const pathOnly = process.argv.includes("--path-only");
  const localeOnly = process.argv.includes("--locale-only");
  if (pathOnly) return path;
  if (localeOnly) return locale;
  return [...locale, ...path, ...prefix];
}

async function main() {
  fs.mkdirSync(batchesDir, { recursive: true });
  const filters = getAllFilters();
  console.log("Using", filters.length, "filters (locale + path" + (process.argv.includes("--prefix") ? " + handle-prefix" : "") + ")");
  console.log("Tip: if any section has >2000 URLs, rerun with --prefix to subdivide by handle\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(GSC_404_URL, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    for (const filter of filters) {
      const localeName = filter.replace(/\//g, "-").replace(/^-|-$/g, "") || "root";
      console.log("Processing filter:", filter || "(none)");
      try {
        if (filter) {
          await applyFilter(page, filter);
        }
        const urls = await extractTableUrls(page);
        if (urls.length === 0) {
          console.log("  No URLs, skipping");
          if (filter) await clearFilter(page);
          continue;
        }
        const outTxt = path.join(batchesDir, `batch-${localeName}.txt`);
        fs.writeFileSync(outTxt, urls.map((u) => `404 ${u}`).join("\n"), "utf8");
        console.log("  Saved", urls.length, "URLs →", outTxt);
        if (filter) await clearFilter(page);
      } catch (e) {
        console.warn("  Error:", e.message);
        if (filter) await clearFilter(page).catch(() => {});
      }
    }

    console.log("\nDone. Run: node scripts/merge-gsc-404-batches.mjs");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
