/**
 * Quick HTTP checks for Meta App Dashboard / Go live URL validation.
 * Usage: node scripts/verify-meta-public-urls.mjs
 *
 * Expect 2xx for storefront + data-deletion instructions page.
 * app.shopcarbon.com may timeout until Coolify/public ingress is healthy.
 */

const TIMEOUT_MS = 20000;

const URLS = [
  ["Privacy policy", "https://shopcarbon.com/policies/privacy-policy"],
  ["Terms", "https://shopcarbon.com/policies/terms-of-service"],
  ["Meta data deletion page", "https://shopcarbon.com/pages/facebook-data-deletion"],
  ["Storefront home", "https://shopcarbon.com/"],
  ["App host (Coolify)", "https://app.shopcarbon.com/"],
  ["Data deletion API GET", "https://app.shopcarbon.com/api/meta/facebook-data-deletion"],
];

async function probe(label, url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "CarbonGen-meta-url-check/1" },
    });
    clearTimeout(t);
    const ok = res.status >= 200 && res.status < 300;
    console.log(`${ok ? "OK " : "BAD"} ${res.status}  ${label}`);
    console.log(`     ${url}`);
  } catch (e) {
    clearTimeout(t);
    const msg = e?.name === "AbortError" ? `TIMEOUT (>${TIMEOUT_MS}ms)` : e?.message || String(e);
    console.log(`ERR  ---  ${label}`);
    console.log(`     ${url}`);
    console.log(`     ${msg}`);
  }
}

console.log("Meta / storefront URL probes\n");
for (const [label, url] of URLS) {
  await probe(label, url);
}
console.log("\nIf App host lines time out: fix Coolify DNS, firewall, or proxy so app.shopcarbon.com is reachable from the public internet.");
console.log("Create /pages/facebook-data-deletion in Shopify before expecting 200 on that line.\n");
