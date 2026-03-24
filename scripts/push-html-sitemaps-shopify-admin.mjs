/**
 * Push carbon HTML from tmp-sitemap-clean/*.html into Shopify Admin page editors and save.
 * Requires an interactive browser session: run with --headed (default) and stay logged into Shopify.
 *
 * Usage: node scripts/push-html-sitemaps-shopify-admin.mjs
 *
 * Uses the same textarea + InputEvent trick as Playwright MCP (Shopify CodeMirror sync).
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const tmp = path.join(root, "tmp-sitemap-clean");

const jobs = [
  {
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071368956",
    heading: "html sitemap blogs",
    file: "html-sitemap-blogs.html",
  },
  {
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071401724",
    heading: "html sitemap articles",
    file: "html-sitemap-articles.html",
  },
  {
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071434492",
    heading: "html sitemap pages",
    file: "html-sitemap-pages.html",
  },
  {
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071336188",
    heading: "html sitemap collections",
    file: "html-sitemap-collections.html",
  },
  {
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071303420",
    heading: "html sitemap products",
    file: "html-sitemap-products.html",
  },
];

function setBodyHtml(page, html) {
  return page.evaluate(({ html: h }) => {
    const ta = document.querySelector('textarea[name="page.body"]');
    if (!ta) throw new Error("No textarea[name=page.body]");
    const d = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    );
    d.set.call(ta, h);
    ta.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste",
        data: null,
      })
    );
  }, { html });
}

async function saveCurrentPage(page) {
  await page
    .getByRole("heading", { name: "Unsaved changes" })
    .waitFor({ state: "visible", timeout: 20000 });
  const saves = page.getByRole("button", { name: "Save" });
  const n = await saves.count();
  for (let i = 0; i < n; i++) {
    const b = saves.nth(i);
    if ((await b.getAttribute("aria-disabled")) !== "true") {
      await b.click();
      return true;
    }
  }
  return false;
}

const headed = !process.argv.includes("--headless");

const browser = await chromium.launch({
  channel: "chrome",
  headless: !headed,
});

const context = await browser.newContext();
const page = await context.newPage();
page.on("dialog", (d) => void d.accept());

for (const job of jobs) {
  const htmlPath = path.join(tmp, job.file);
  const html = fs.readFileSync(htmlPath, "utf8");
  console.log("→", job.file, Buffer.byteLength(html, "utf8"), "bytes");

  await page.goto(job.url, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: job.heading }).waitFor({ timeout: 45000 });
  await page.getByRole("button", { name: "Show HTML" }).click().catch(() => {});
  await page.waitForTimeout(1200);
  await setBodyHtml(page, html);
  const ok = await saveCurrentPage(page);
  if (!ok) console.error("No enabled Save for", job.file);
  await page.waitForTimeout(8000);
}

await browser.close();
console.log("Done. Verify storefront pages for carbon-html-sitemap-row / no SEOAnt.");
