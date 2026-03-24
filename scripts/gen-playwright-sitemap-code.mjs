/**
 * Emits Playwright MCP `browser_run_code` payloads (embedded HTML; VM has no require/import).
 *
 * Usage:
 *   node scripts/gen-playwright-sitemap-code.mjs           # all pages
 *   node scripts/gen-playwright-sitemap-code.mjs collections
 *
 * Outputs per page:
 *   tmp-sitemap-clean/_pw-code-<name>.txt   — paste as `code` in MCP
 *   tmp-sitemap-clean/out-args-<name>.json  — { "code": "..." } for tool args
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const arg = (process.argv[2] || "all").toLowerCase();

/** Fallback admin URLs if tmp-sitemap-clean/html-sitemap-admin-urls.json is missing. */
const jobsDefault = {
  products: {
    file: "html-sitemap-products.html",
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071303420",
  },
  collections: {
    file: "html-sitemap-collections.html",
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071336188",
  },
  blogs: {
    file: "html-sitemap-blogs.html",
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071368956",
  },
  articles: {
    file: "html-sitemap-articles.html",
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071401724",
  },
  pages: {
    file: "html-sitemap-pages.html",
    url: "https://admin.shopify.com/store/shopcarbon1/pages/128071434492",
  },
};

const urlMapPath = path.join(
  root,
  "tmp-sitemap-clean",
  "html-sitemap-admin-urls.json"
);
let jobs = { ...jobsDefault };
if (fs.existsSync(urlMapPath)) {
  try {
    const m = JSON.parse(fs.readFileSync(urlMapPath, "utf8"));
    for (const key of Object.keys(jobsDefault)) {
      const u = m.pages?.[key]?.url;
      if (u) jobs[key] = { ...jobsDefault[key], url: u };
    }
    console.error("Using admin URLs from", urlMapPath);
  } catch {
    console.error("Could not parse", urlMapPath, "— using default admin URLs");
  }
}

function buildCode(job, label) {
  const html = fs.readFileSync(
    path.join(root, "tmp-sitemap-clean", job.file),
    "utf8"
  );
  return `async (page) => {
  const html = ${JSON.stringify(html)};
  await page.goto(${JSON.stringify(job.url)}, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  const showHtml = page.getByRole('button', { name: 'Show HTML' });
  if (await showHtml.isVisible().catch(() => false)) await showHtml.click();
  await page.waitForSelector('textarea[name="page.body"]', { state: 'attached', timeout: 90000 });
  const bodyTa = page.locator('textarea[name="page.body"]');
  await bodyTa.fill(html, { force: true });
  await page.evaluate(() => {
    const el = document.querySelector('textarea[name="page.body"]');
    if (!el) return;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: null }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const saveBtn = page.getByLabel('Save').first();
  await saveBtn.waitFor({ state: 'visible', timeout: 30000 });
  for (let i = 0; i < 80; i++) {
    const dis = await saveBtn.getAttribute('aria-disabled');
    if (dis !== 'true') break;
    await page.waitForTimeout(250);
  }
  await saveBtn.click({ timeout: 30000 });
  await page.waitForTimeout(8000);
  return { page: ${JSON.stringify(label)}, bytes: html.length };
}`;
}

function writeOne(label) {
  const job = jobs[label];
  if (!job) {
    console.error("Unknown page. Use: all | " + Object.keys(jobs).join(" | "));
    process.exit(1);
  }
  const code = buildCode(job, label);
  const dir = path.join(root, "tmp-sitemap-clean");
  const txt = path.join(dir, `_pw-code-${label}.txt`);
  const jsn = path.join(dir, `out-args-${label}.json`);
  fs.writeFileSync(txt, code, "utf8");
  fs.writeFileSync(jsn, JSON.stringify({ code }), "utf8");
  console.log(label, txt, jsn, Buffer.byteLength(code, "utf8"));
}

if (arg === "all") {
  for (const label of Object.keys(jobs)) writeOne(label);
} else {
  writeOne(arg);
}
