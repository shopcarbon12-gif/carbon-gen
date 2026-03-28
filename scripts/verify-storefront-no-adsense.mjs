/**
 * Verify the public storefront HTML does not load Google AdSense.
 *
 * AdSense is NOT configured in this repo's Liquid snippets; it usually comes from:
 * - Google Tag Manager: Tags → remove "Google AdSense" / Custom HTML with adsbygoogle
 * - Theme: Online Store → Themes → Edit code → search theme.liquid, sections, snippets for:
 *     adsbygoogle, googlesyndication, ca-pub-
 * - An app: Settings → Apps and sales channels → uninstall or disable ad app
 *
 * Usage:
 *   node scripts/verify-storefront-no-adsense.mjs
 *   STOREFRONT_URL=https://www.shopcarbon.com/ node scripts/verify-storefront-no-adsense.mjs
 */

const url = String(process.env.STOREFRONT_URL || "https://shopcarbon.com/").trim();

const patterns = [
  { name: "googlesyndication loader", re: /pagead2\.googlesyndication\.com/i },
  { name: "adsbygoogle.js", re: /adsbygoogle\.js/i },
  { name: "AdSense publisher id (known from audit)", re: /ca-pub-5784149318086469/i },
];

const res = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; CarbonGen-VerifyAdsense/1)" },
  redirect: "follow",
  signal: AbortSignal.timeout(45000),
});
const html = await res.text();

const hits = patterns.filter((p) => p.re.test(html));

if (hits.length) {
  console.error(`FAIL: ${hits.length} AdSense-related pattern(s) still in HTML from ${url}`);
  for (const h of hits) console.error(`  - ${h.name}`);
  console.error("\nRemove in Shopify theme and/or Google Tag Manager, then re-run this script.");
  process.exit(1);
}

console.log(`OK: No AdSense patterns matched for ${url} (${(html.length / 1024).toFixed(1)} KB HTML)`);
