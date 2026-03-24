/**
 * Get 404 URLs from Wayback Machine CDX API (not GSC).
 * Archive.org has historically crawled shopcarbon.com; many archived URLs may now 404.
 * No export limit - we get all unique URLs, then probe them.
 *
 * Outputs:
 *   tmp-404-report/wayback-urls-all.txt  - all unique URLs from Wayback
 *   tmp-404-report/wayback-404s.txt      - URLs that return 404 when probed
 *   tmp-404-report/wayback-probe-status.json - resume state
 *
 * Usage:
 *   node scripts/fetch-404-urls-wayback.mjs           # fetch + probe all
 *   node scripts/fetch-404-urls-wayback.mjs --fetch-only   # just fetch URLs
 *   node scripts/fetch-404-urls-wayback.mjs --probe-only   # probe existing wayback-urls-all.txt
 *   node scripts/fetch-404-urls-wayback.mjs --limit 5000   # cap fetch
 *   node scripts/fetch-404-urls-wayback.mjs --slow         # 1.5s delay between probe batches
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp-404-report");
const BASE = "https://shopcarbon.com";
const CDX_BASE = "https://web.archive.org/cdx/search/cdx";

const UA = "Mozilla/5.0 (compatible; CarbonGen/1; +https://shopcarbon.com)";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch one CDX prefix (with pagination) - small batches avoid 504 timeout. */
async function fetchCdxPrefix(prefix, limitTotal, seen) {
  const limitPerRequest = 500; // Archive.org can 504 on large requests
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      url: prefix,
      matchType: "prefix",
      collapse: "urlkey",
      output: "json",
      limit: String(limitPerRequest),
      offset: String(offset),
    });

    const url = `${CDX_BASE}?${params}`;
    let res;
    for (let retry = 0; retry < 3; retry++) {
      res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90000) });
      if (res.ok) break;
      if (res.status === 504 && retry < 2) {
        await sleep(3000 * (retry + 1));
        continue;
      }
      throw new Error(`CDX API ${res.status} for ${prefix}: ${await res.text().then((t) => t.slice(0, 200))}`);
    }

    const rows = await res.json();
    const header = rows[0] || [];
    const idx = header.indexOf("original") >= 0 ? header.indexOf("original") : 2;

    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const u = (rows[i]?.[idx] || "").trim();
      if (!u) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      count++;
    }

    if (rows.length <= 1 || count === 0) break;
    offset += limitPerRequest;
    if (limitTotal > 0 && seen.size >= limitTotal) break;
    await sleep(800);
  }
}

/** Fetch unique URLs from Wayback CDX using path-prefix queries (avoids full-domain timeout). */
async function fetchWaybackUrls(limitTotal = 0) {
  const seen = new Set();
  const domain = "shopcarbon.com";

  // Path prefixes - smaller queries = no 504 timeout
  const prefixes = [
    `https://${domain}/`,
    `https://${domain}/products/`,
    `https://${domain}/collections/`,
    `https://${domain}/pages/`,
    `https://${domain}/blogs/`,
    `https://www.${domain}/`,
    `http://${domain}/`,
  ];

  // Locale prefixes
  const locales = ["es", "pt", "de", "fr", "ar", "he", "it", "ru", "ja", "ko", "zh"];
  for (const loc of locales) {
    prefixes.push(`https://${domain}/${loc}/`);
    prefixes.push(`https://${domain}/${loc}/products/`);
    prefixes.push(`https://${domain}/${loc}/collections/`);
  }

  console.log("Fetching from Wayback CDX (prefix queries to avoid timeout)...");

  for (const prefix of prefixes) {
    if (limitTotal > 0 && seen.size >= limitTotal) break;
    try {
      process.stdout.write(`  ${prefix.replace(domain + "/", "")}... `);
      await fetchCdxPrefix(prefix, limitTotal, seen);
      console.log(seen.size, "total");
    } catch (e) {
      console.log("err:", e.message);
    }
    await sleep(400);
  }

  return [...seen];
}

/** Probe URLs for 404; supports resume. */
async function probeUrls(urls, opts = {}) {
  const { delayMs = 800, batch = 5, resumePath } = opts;
  const statusPath = path.join(reportDir, "wayback-probe-status.json");
  let done = {};
  if (resumePath && fs.existsSync(resumePath)) {
    try {
      done = JSON.parse(fs.readFileSync(resumePath, "utf8"));
    } catch {}
  }

  const toProbe = urls.filter((u) => done[u] === undefined);
  console.log("\nProbing", toProbe.length, "URLs (delay", delayMs, "ms)...");

  const results = { ...done };
  const batchSize = batch;

  for (let i = 0; i < toProbe.length; i += batchSize) {
    const chunk = toProbe.slice(i, i + batchSize);
    const ress = await Promise.all(
      chunk.map((u) =>
        fetch(u, {
          method: "HEAD",
          redirect: "follow",
          headers: { "User-Agent": UA },
        }).then((r) => ({ url: u, status: r.status }), () => ({ url: u, status: 0 }))
      )
    );
    for (const r of ress) {
      results[r.url] = r.status;
    }
    fs.writeFileSync(statusPath, JSON.stringify(results, null, 0), "utf8");
    process.stdout.write(".");
    await sleep(delayMs);
    if (i > 0 && i % 500 === 0) {
      console.log("", i, "/", toProbe.length);
    }
  }
  console.log("");
  return results;
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });

  const fetchOnly = process.argv.includes("--fetch-only");
  const probeOnly = process.argv.includes("--probe-only");
  const limitIdx = process.argv.indexOf("--limit");
  const limitTotal = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 0 : 0;
  const slow = process.argv.includes("--slow");

  let urls = [];

  if (!probeOnly) {
    urls = await fetchWaybackUrls(limitTotal);
    const allPath = path.join(reportDir, "wayback-urls-all.txt");
    fs.writeFileSync(allPath, urls.join("\n"), "utf8");
    console.log("Wrote", allPath, "(" + urls.length, "URLs)");
    if (fetchOnly) {
      console.log("Done (--fetch-only). Run with --probe-only to check 404s.");
      return;
    }
  } else {
    const allPath = path.join(reportDir, "wayback-urls-all.txt");
    if (!fs.existsSync(allPath)) {
      console.error("Run without --probe-only first to create wayback-urls-all.txt");
      process.exit(1);
    }
    urls = fs.readFileSync(allPath, "utf8").split("\n").filter(Boolean);
    console.log("Loaded", urls.length, "URLs from", allPath);
  }

  const results = await probeUrls(urls, {
    delayMs: slow ? 1500 : 800,
    batch: 5,
    resumePath: path.join(reportDir, "wayback-probe-status.json"),
  });

  const failed = Object.entries(results).filter(
    ([, s]) => s === 404 || s === 410 || (s >= 400 && s < 500)
  );
  const failedUrls = failed.map(([u]) => u);
  const out404 = path.join(reportDir, "wayback-404s.txt");
  fs.writeFileSync(out404, failedUrls.map((u) => `404 ${u}`).join("\n") || "(none)", "utf8");

  console.log("\nWrote", out404);
  console.log("404/4xx:", failed.length);
  console.log("OK (2xx/3xx):", Object.values(results).filter((s) => s >= 200 && s < 400).length);

  // Merge with existing GSC data if present
  const gscPath = path.join(reportDir, "gsc-404-all.txt");
  if (fs.existsSync(gscPath)) {
    const gsc = new Set(
      fs.readFileSync(gscPath, "utf8").split("\n").filter(Boolean).map((l) => l.replace(/^\d+\s+/, "").trim())
    );
    failedUrls.forEach((u) => gsc.add(u));
    const merged = path.join(reportDir, "404-all-merged.txt");
    fs.writeFileSync(merged, [...gsc].sort().map((u) => `404 ${u}`).join("\n"), "utf8");
    console.log("Merged with GSC →", merged, "(" + gsc.size, "unique)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
