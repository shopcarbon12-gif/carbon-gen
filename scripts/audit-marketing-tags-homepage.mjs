/**
 * Fetch storefront homepage HTML and list external script hosts (GTM, Stape, Meta, TikTok, etc.).
 * Run after changes to validate "GTM boss + no duplicate obvious pixels" (manual Stape dashboard still required).
 *
 *   node scripts/audit-marketing-tags-homepage.mjs
 *   STOREFRONT_URL=https://www.shopcarbon.com/ node scripts/audit-marketing-tags-homepage.mjs
 */
const url = String(process.env.STOREFRONT_URL || "https://shopcarbon.com/").trim();
const html = await (
  await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (CarbonGen marketing audit)" } })
).text();

const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
const abs = srcs.map((s) => {
  try {
    return new URL(s, url).href;
  } catch {
    return s;
  }
});

function host(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const byHost = {};
for (const u of abs) {
  const h = host(u) || "(invalid)";
  if (!byHost[h]) byHost[h] = [];
  byHost[h].push(u);
}

const watch = [
  "googletagmanager.com",
  "google-analytics.com",
  "facebook.net",
  "connect.facebook.net",
  "tiktok.com",
  "analytics.tiktok.com",
  "pinimg.com",
  "ct.pinterest.com",
  "stape.io",
  "cdn.shopify.com",
];

console.log("URL:", url);
console.log("Total script[src] tags:", abs.length);
console.log("\nBy host (count):");
for (const [h, list] of Object.entries(byHost).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${list.length}\t${h}`);
}

console.log("\nWatchlist hits:");
for (const w of watch) {
  const hits = abs.filter((u) => host(u).includes(w) || u.toLowerCase().includes(w));
  if (hits.length) {
    console.log(`  ${w}: ${hits.length}`);
    for (const u of [...new Set(hits)].slice(0, 6)) console.log(`    ${u}`);
    if (hits.length > 6) console.log(`    … +${hits.length - 6} more`);
  }
}

const hasGtm =
  /googletagmanager\.com\/gtm\.js/i.test(html) ||
  abs.some((u) => /googletagmanager\.com/i.test(u));
const hasStapeExt = abs.some((u) => u.includes("stape-remix") || u.includes("/stape-"));
console.log("\nHeuristic:");
console.log("  GTM container loader:", hasGtm ? "yes" : "no");
console.log("  Stape Shopify extension script (widget.js path):", hasStapeExt ? "yes (configure Stape for server-side / no duplicate browser pixels in GTM)" : "no");
