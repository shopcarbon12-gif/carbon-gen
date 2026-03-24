/**
 * Find ALL 400/404 URLs by proactively checking every known URL.
 * Uses: sitemap(s) + canonical (Shopify API) + optional crawled links.
 * GSC is limited; this gives you the full list from your own sources.
 *
 * Outputs: tmp-404-report/results.json, failed-urls.txt
 *
 * Usage:
 *   node scripts/check-urls-404.mjs              # union of sitemap + canonical
 *   node scripts/check-urls-404.mjs --limit 500 # limit for testing
 *   node scripts/check-urls-404.mjs --sitemap-only  # only sitemap
 *   node scripts/check-urls-404.mjs --canonical-only # only canonical (run list-shopify first)
 *   node scripts/check-urls-404.mjs --resume        # resume from results.json (skip already-checked)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const BASE = "https://shopcarbon.com";

function getCanonicalPath() {
  return path.join(root, "tmp-404-report", "canonical-urls.txt");
}
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA } });
  return { status: res.status, text: await res.text() };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractLocs(text) {
  return [...(text.match(/<loc>([^<]+)<\/loc>/g) || [])].map((m) =>
    m.replace(/<\/?loc>/g, "").trim()
  );
}

async function getSitemapUrls() {
  const urls = new Set();
  const seen = new Set();
  const queue = [
    `${BASE}/sitemap.xml`,
    `${BASE}/sitemap_index.xml`,
    `${BASE}/sitemaps/sitemap.xml`,
  ];

  while (queue.length > 0) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const { status, text } = await fetchText(sm);
      if (status !== 200) continue;
      const locs = extractLocs(text);
      for (const u of locs) {
        if (u.endsWith(".xml") || u.includes("/sitemap")) {
          queue.push(u);
        } else {
          urls.add(u);
        }
      }
    } catch (e) {
      console.warn("Fetch", sm, e.message);
    }
  }
  return urls;
}

function getCanonicalUrls() {
  const p = getCanonicalPath();
  if (!fs.existsSync(p)) return new Set();
  const lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean);
  return new Set(lines);
}

async function getAllUrlsToCheck() {
  const sitemapOnly = process.argv.includes("--sitemap-only");
  const canonicalOnly = process.argv.includes("--canonical-only");

  const [sitemapSet, canonicalSet] = await Promise.all([
    getSitemapUrls(),
    Promise.resolve(getCanonicalUrls()),
  ]);

  if (sitemapOnly) {
    if (sitemapSet.size === 0) {
      console.warn("No sitemap URLs found. Falling back to known paths.");
      return ["/", "/pages/sitemap", "/pages/html-sitemap", "/pages/accessibility", "/collections/all"].map((p) => BASE + p);
    }
    return [...sitemapSet];
  }
  if (canonicalOnly) {
    if (canonicalSet.size === 0) {
      console.warn("No canonical-urls.txt. Run first: node scripts/list-shopify-urls-from-api.mjs");
      return ["/", "/pages/sitemap", "/pages/html-sitemap", "/pages/accessibility", "/collections/all"].map((p) => BASE + p);
    }
    return [...canonicalSet];
  }
  // Union: sitemap + canonical = full list to check
  const union = new Set([...sitemapSet, ...canonicalSet]);
  if (union.size === 0) {
    return ["/", "/pages/sitemap", "/pages/html-sitemap", "/pages/accessibility", "/collections/all"].map((p) => BASE + p);
  }
  return [...union];
}

async function main() {
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 0 : 0;
  const slowIdx = process.argv.includes("--slow");
  const slowerIdx = process.argv.includes("--slower");
  const batch = slowerIdx ? 1 : slowIdx ? 2 : 5;
  const delayMs = slowerIdx ? 3000 : slowIdx ? 2000 : 200;

  console.log("Building URL list (sitemap + canonical)...");
  let urls = await getAllUrlsToCheck();
  if (limit > 0) {
    urls = urls.slice(0, limit);
    console.log("Limited to first", limit, "URLs");
  }

  const resultsPath = path.join(root, "tmp-404-report", "results.json");
  let results = { ok: [], failed: [] };
  if (process.argv.includes("--resume") && fs.existsSync(resultsPath)) {
    try {
      results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
      const checked = new Set([...results.ok.map((r) => r.url), ...results.failed.map((r) => r.url)]);
      const before = urls.length;
      urls = urls.filter((u) => !checked.has(u));
      console.log("Resuming: skipped", before - urls.length, "already checked,", urls.length, "remaining");
    } catch (e) {
      console.warn("Could not load results.json for resume:", e.message);
    }
  }
  if (urls.length === 0) {
    console.log("Nothing to check. Done.");
    return;
  }
  console.log("Checking", urls.length, "URLs for 400/404...", slowIdx || slowerIdx ? `(${delayMs}ms/batch, batch=${batch})` : "");

  const outDir = path.join(root, "tmp-404-report");
  fs.mkdirSync(outDir, { recursive: true });

  async function checkOne(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA } });
        if (res.status === 429 && attempt < 2) {
          await sleep(60000);
          continue;
        }
        return res.status;
      } catch {
        return 0;
      }
    }
    return 429;
  }

  for (let i = 0; i < urls.length; i += batch) {
    const chunk = urls.slice(i, i + batch);
    const statuses = [];
    for (const u of chunk) {
      statuses.push(await checkOne(u));
    }
    for (let j = 0; j < chunk.length; j++) {
      const status = statuses[j] ?? 0;
      const url = chunk[j];
      if (status >= 200 && status < 400) {
        results.ok.push({ url, status });
      } else {
        results.failed.push({ url, status: status || "error" });
      }
    }
    process.stdout.write(".");
    await sleep(delayMs);
    if (i > 0 && i % 500 === 0) {
      fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2), "utf8");
      const realFailed = results.failed.filter((f) => f.status !== 429);
      fs.writeFileSync(path.join(outDir, "failed-urls.txt"), realFailed.map((f) => `${f.status} ${f.url}`).join("\n") || "(none)", "utf8");
    }
  }
  console.log("");

  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2), "utf8");
  const realFailed = results.failed.filter((f) => f.status !== 429);
  const txt = realFailed.map((f) => `${f.status} ${f.url}`).join("\n");
  fs.writeFileSync(path.join(outDir, "failed-urls.txt"), txt || "(none)", "utf8");
  if (results.failed.filter((f) => f.status === 429).length > 0) {
    fs.writeFileSync(
      path.join(outDir, "failed-urls-429-rate-limited.txt"),
      results.failed.filter((f) => f.status === 429).map((f) => `${f.status} ${f.url}`).join("\n"),
      "utf8"
    );
  }

  console.log("Wrote tmp-404-report/results.json");
  console.log("Wrote tmp-404-report/failed-urls.txt");
  if (realFailed.length > 0) {
    console.log("\n--- FAILED (404/400/5xx) ---");
    realFailed.slice(0, 50).forEach((f) => console.log(`${f.status} ${f.url}`));
    if (realFailed.length > 50) console.log("... and", realFailed.length - 50, "more (see failed-urls.txt)");
  } else {
    console.log("\nNo 404/400 failures (check failed-urls-429-rate-limited.txt if rate limited)");
  }
  const rateLimited = results.failed.filter((f) => f.status === 429).length;
  console.log("\nOK:", results.ok.length, "| Failed (404/400/5xx):", realFailed.length, rateLimited ? `| Rate limited (429): ${rateLimited}` : "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
