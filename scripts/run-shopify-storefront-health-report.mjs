/**
 * Storefront-only health checks for Shopify public site (shopcarbon.com / www).
 * Explicitly does NOT request app.shopcarbon.com or any non-storefront host.
 *
 * Usage:
 *   node scripts/run-shopify-storefront-health-report.mjs          # full + deep improvement scan
 *   node scripts/run-shopify-storefront-health-report.mjs --quick  # availability table only
 *
 * Output:
 *   reports/storefront-health-shopcarbon-<timestamp>.html
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const UA =
  "Mozilla/5.0 (compatible; CarbonGen-StorefrontHealth/1; +https://www.shopcarbon.com)";

/** Bytes scanned for substring heuristics (Shopify assets often appear after large theme JSON). */
const HINT_SCAN_CHARS = 96000;

const SHOPIFY_HTML_HINTS = [
  "cdn.shopify.com",
  "shopifycloud.com",
  "/checkouts/internal/preloads.js",
  "shopify",
];

const TARGETS = [
  {
    id: "home-www",
    url: "https://www.shopcarbon.com/",
    label: "Homepage (www)",
    expectStatus: [200],
    hints: SHOPIFY_HTML_HINTS,
  },
  {
    id: "home-apex",
    url: "https://shopcarbon.com/",
    label: "Homepage (apex)",
    expectStatus: [200, 301, 302, 307, 308],
    hints: SHOPIFY_HTML_HINTS,
  },
  {
    id: "pdp",
    url: "https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72",
    label: "Sample product (PDP)",
    expectStatus: [200],
    hints: [...SHOPIFY_HTML_HINTS, "product"],
  },
  {
    id: "login",
    url: "https://shopcarbon.com/account/login",
    label: "Account login",
    expectStatus: [200],
    hints: [...SHOPIFY_HTML_HINTS, "login", "account"],
  },
  {
    id: "page-jeans",
    url: "https://shopcarbon.com/pages/jeans",
    label: "Content page (Jeans)",
    expectStatus: [200],
    hints: [...SHOPIFY_HTML_HINTS, "jeans"],
  },
  {
    id: "robots",
    url: "https://www.shopcarbon.com/robots.txt",
    label: "robots.txt",
    expectStatus: [200],
    hints: ["user-agent", "sitemap", "disallow", "shopify"],
  },
  {
    id: "sitemap",
    url: "https://shopcarbon.com/sitemap.xml",
    label: "sitemap.xml",
    expectStatus: [200],
    hints: ["<urlset", "<sitemapindex", "<loc>"],
  },
  {
    id: "cart-js",
    url: "https://shopcarbon.com/cart.js",
    label: "Cart JSON (Shopify)",
    expectStatus: [200],
    hints: ["item_count", "token"],
  },
  {
    id: "collections-all",
    url: "https://shopcarbon.com/collections/all",
    label: "Collections /all",
    expectStatus: [200],
    hints: [...SHOPIFY_HTML_HINTS, "collection"],
  },
];

function assertStorefrontOnly(urlString) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
  const host = u.hostname.toLowerCase();
  if (host === "app.shopcarbon.com" || host.endsWith(".app.shopcarbon.com")) {
    throw new Error(`Blocked by policy: ${urlString}`);
  }
  if (host !== "shopcarbon.com" && host !== "www.shopcarbon.com") {
    throw new Error(`Only shopcarbon.com storefront hosts allowed: ${urlString}`);
  }
}

async function followRedirectChain(startUrl, maxHops = 12) {
  assertStorefrontOnly(startUrl);
  const chain = [];
  let current = startUrl;
  for (let i = 0; i < maxHops; i++) {
    const t0 = performance.now();
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: AbortSignal.timeout(45000),
    });
    const ms = Math.round(performance.now() - t0);
    const loc = res.headers.get("location");
    chain.push({
      url: current,
      status: res.status,
      ms,
      location: loc || "",
    });
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, current).href;
      assertStorefrontOnly(next);
      current = next;
      continue;
    }
    break;
  }
  return chain;
}

async function probeBody(url, expectStatus) {
  assertStorefrontOnly(url);
  const t0 = performance.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(45000),
  });
  const totalMs = Math.round(performance.now() - t0);
  const text = await res.text();
  const finalUrl = res.url;
  assertStorefrontOnly(finalUrl);

  const headers = {
    "content-type": res.headers.get("content-type") || "",
    "strict-transport-security": res.headers.get("strict-transport-security") || "",
    "x-shopid": res.headers.get("x-shopid") || "",
    "x-shopify-stage": res.headers.get("x-shopify-stage") || "",
    "cf-ray": res.headers.get("cf-ray") || "",
    "server": res.headers.get("server") || "",
    "powered-by": res.headers.get("x-powered-by") || "",
  };

  return {
    status: res.status,
    totalMs,
    finalUrl,
    bytes: text.length,
    fullText: text,
    snippet: text.slice(0, 800).replace(/\s+/g, " ").trim(),
    headers,
  };
}

function hintPass(snippet, hints) {
  const s = snippet.toLowerCase();
  return hints.some((h) => s.includes(h.toLowerCase()));
}

function parseArgs(argv) {
  return { quick: argv.includes("--quick") };
}

/** Full header map + body for audits (storefront hosts only). */
async function probeFull(url) {
  assertStorefrontOnly(url);
  const t0 = performance.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(45000),
  });
  const totalMs = Math.round(performance.now() - t0);
  const text = await res.text();
  assertStorefrontOnly(res.url);
  const headers = {};
  for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
  return { status: res.status, totalMs, finalUrl: res.url, text, headers };
}

function analyzeSecurityHeaders(headers, label) {
  const notes = [];
  let worst = "pass";

  const hsts = headers["strict-transport-security"] || "";
  if (!hsts) {
    notes.push("WARN: No Strict-Transport-Security");
    worst = "warn";
  } else {
    const ma = hsts.match(/max-age=(\d+)/i);
    const age = ma ? parseInt(ma[1], 10) : 0;
    const days = age / 86400;
    notes.push(`OK: HSTS present (max-age≈${days.toFixed(0)} days)`);
    if (age > 0 && age < 2592000) {
      notes.push("INFO: HSTS max-age under ~30 days — browsers will forget sooner");
    }
  }

  const csp = headers["content-security-policy"] || headers["content-security-policy-report-only"] || "";
  if (!csp) {
    notes.push(
      "INFO: No Content-Security-Policy at HTML response — common on Shopify; consider theme/app-level CSP if you need tighter control"
    );
  } else {
    notes.push("OK: CSP header present");
  }

  const xcto = headers["x-content-type-options"] || "";
  if (!/nosniff/i.test(xcto)) {
    notes.push("WARN: Missing or weak X-Content-Type-Options (want nosniff)");
    if (worst === "pass") worst = "warn";
  } else notes.push("OK: X-Content-Type-Options: nosniff");

  const xfo = headers["x-frame-options"] || "";
  const cspFrame = /frame-ancestors/i.test(csp);
  if (!xfo && !cspFrame) {
    notes.push("WARN: No X-Frame-Options and no frame-ancestors in CSP — clickjacking risk if you need framing protection");
    if (worst === "pass") worst = "warn";
  } else notes.push("OK: Framing policy present (X-Frame-Options or CSP frame-ancestors)");

  const rp = headers["referrer-policy"] || "";
  if (!rp) {
    notes.push("INFO: No Referrer-Policy — browser default applies");
  } else {
    notes.push(`OK: Referrer-Policy: ${rp.slice(0, 80)}${rp.length > 80 ? "…" : ""}`);
  }

  const pp = headers["permissions-policy"] || headers["feature-policy"] || "";
  if (!pp) {
    notes.push("INFO: No Permissions-Policy — optional hardening");
  } else {
    notes.push("OK: Permissions-Policy present");
  }

  const coop = headers["cross-origin-opener-policy"] || "";
  if (!coop) notes.push("INFO: No Cross-Origin-Opener-Policy — optional isolation");
  else notes.push(`OK: COOP: ${coop}`);

  const corp = headers["cross-origin-resource-policy"] || "";
  if (!corp) notes.push("INFO: No Cross-Origin-Resource-Policy — optional");
  else notes.push(`OK: CORP: ${corp}`);

  return { overall: worst, notes: notes.join("\n"), label };
}

function analyzeSeoHtml(html, pageLabel) {
  const notes = [];
  let worst = "pass";

  const titleM = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleM ? titleM[1].replace(/\s+/g, " ").trim() : "";
  if (!title) {
    notes.push("WARN: Missing <title>");
    worst = "warn";
  } else {
    notes.push(`OK: <title> (${title.length} chars): ${title.slice(0, 90)}${title.length > 90 ? "…" : ""}`);
    if (title.length < 25) {
      notes.push("INFO: Title is quite short for SERP display");
    }
    if (title.length > 70) {
      notes.push("INFO: Title may truncate in Google results");
    }
  }

  const descRe =
    /<meta\s+[^>]*name\s*=\s*["']description["'][^>]*>/gi;
  let desc = "";
  let m;
  while ((m = descRe.exec(html)) !== null) {
    const c = m[0].match(/content\s*=\s*["']([^"']*)["']/i);
    if (c) {
      desc = c[1].replace(/\s+/g, " ").trim();
      break;
    }
  }
  if (!desc) {
    notes.push("WARN: Missing meta name=description");
    worst = "warn";
  } else {
    notes.push(`OK: meta description (${desc.length} chars)`);
    if (desc.length < 50) notes.push("INFO: Description short — consider 120–160 chars for snippets");
    if (desc.length > 180) notes.push("INFO: Description long — may be truncated in SERP");
  }

  const hasCanon = /<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i.test(html);
  if (!hasCanon) {
    notes.push("WARN: No rel=canonical link found in HTML");
    worst = "warn";
  } else notes.push("OK: Canonical link present");

  const ogCount = (html.match(/property\s*=\s*["']og:/gi) || []).length;
  if (ogCount === 0) {
    notes.push("WARN: No Open Graph (og:*) meta tags detected");
    worst = "warn";
  } else notes.push(`OK: Open Graph tags detected (~${ogCount} attributes)`);

  const tw = /name\s*=\s*["']twitter:card["']/i.test(html);
  if (!tw) notes.push("INFO: No twitter:card — optional for X/Twitter cards");
  else notes.push("OK: twitter:card present");

  const ldjson = (html.match(/application\/ld\+json/gi) || []).length;
  notes.push(`INFO: JSON-LD script references: ${ldjson}`);

  return { overall: worst, notes: notes.join("\n"), pageLabel };
}

function countImgsMissingAlt(html) {
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)];
  let missing = 0;
  for (const match of imgTags) {
    const tag = match[0];
    if (!/\balt\s*=\s*["'][^"']*["']/.test(tag) && !/\balt\s*=\s*[^\s>]+/.test(tag)) {
      missing++;
    }
  }
  return { total: imgTags.length, missing };
}

function countMixedContentHints(html) {
  const absHttp = html.match(/(?:href|src)\s*=\s*["']http:\/\/[^"']+["']/gi) || [];
  return absHttp.length;
}

/**
 * Deep scans: improvement-oriented (SEO, security headers, compression, APIs, hygiene).
 * Does not call app.shopcarbon.com.
 */
async function runDeepAnalysis() {
  /** @type {{ category: string; label: string; overall: string; notes: string }[]} */
  const rows = [];

  try {
    const r = await fetch("http://shopcarbon.com/", {
      redirect: "manual",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const loc = r.headers.get("location") || "";
    const ok =
      (r.status === 301 || r.status === 302 || r.status === 307 || r.status === 308) &&
      /^https:/i.test(loc);
    rows.push({
      category: "Routing & TLS",
      label: "Cleartext HTTP → HTTPS (apex)",
      overall: ok ? "pass" : "fail",
      notes: ok
        ? `OK: ${r.status} → ${loc}`
        : `FAIL: expected redirect to https, got ${r.status}, Location: ${loc || "(empty)"}`,
    });
  } catch (e) {
    rows.push({
      category: "Routing & TLS",
      label: "Cleartext HTTP → HTTPS (apex)",
      overall: "fail",
      notes: `Error: ${e.message || String(e)}`,
    });
  }

  try {
    const r = await fetch(
      "https://shopcarbon.com/products/this-product-definitely-does-not-exist-99999",
      {
        redirect: "follow",
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      }
    );
    const ok404 = r.status === 404;
    const notes = `HTTP ${r.status}, final URL: ${r.url}`;
    rows.push({
      category: "Routing & TLS",
      label: "Bogus product handle (expect real 404)",
      overall: ok404 ? "pass" : r.status === 200 ? "warn" : "warn",
      notes: ok404
        ? `OK: ${notes}`
        : r.status === 200
          ? `WARN: Returned 200 — possible soft 404 or redirect to another page; bad for SEO/crawl hygiene.\n${notes}`
          : `WARN: Expected 404, got ${r.status}\n${notes}`,
    });
  } catch (e) {
    rows.push({
      category: "Routing & TLS",
      label: "Bogus product handle",
      overall: "fail",
      notes: e.message || String(e),
    });
  }

  try {
    const r = await fetch("https://shopcarbon.com/products.json?limit=1", {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = null;
    }
    const ok = r.status === 200 && j && Array.isArray(j.products) && j.products.length >= 0;
    rows.push({
      category: "Storefront API",
      label: "products.json?limit=1",
      overall: ok ? "pass" : "fail",
      notes: ok
        ? `OK: ${j.products.length} product(s) in sample payload`
        : `FAIL: status ${r.status}, valid JSON with products array: ${!!(j && Array.isArray(j.products))}`,
    });
  } catch (e) {
    rows.push({
      category: "Storefront API",
      label: "products.json?limit=1",
      overall: "fail",
      notes: e.message || String(e),
    });
  }

  try {
    const r = await fetch("https://shopcarbon.com/search?q=denim", {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(20000),
    });
    const ok = r.status === 200 || r.status === 302;
    rows.push({
      category: "Storefront",
      label: "Search results (/search?q=…)",
      overall: ok ? "pass" : "warn",
      notes: `HTTP ${r.status}, final: ${r.url}`,
    });
  } catch (e) {
    rows.push({
      category: "Storefront",
      label: "Search results",
      overall: "fail",
      notes: e.message || String(e),
    });
  }

  try {
    const smRes = await fetch("https://shopcarbon.com/sitemap.xml", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    const smText = await smRes.text();
    const locM = smText.match(/<loc>([^<]+)<\/loc>/);
    if (!locM) {
      rows.push({
        category: "SEO / crawl",
        label: "First child URL from sitemap index",
        overall: "warn",
        notes: "Could not parse first <loc> from sitemap.xml",
      });
    } else {
      const childUrl = locM[1].trim();
      assertStorefrontOnly(childUrl);
      const t0 = performance.now();
      const cr = await fetch(childUrl, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      const ms = Math.round(performance.now() - t0);
      const ok = cr.status === 200;
      rows.push({
        category: "SEO / crawl",
        label: "First sitemap child reachable",
        overall: ok ? "pass" : "fail",
        notes: ok
          ? `OK: ${childUrl} → ${cr.status} (${ms} ms)`
          : `FAIL: ${childUrl} → ${cr.status}`,
      });
    }
  } catch (e) {
    rows.push({
      category: "SEO / crawl",
      label: "Sitemap child probe",
      overall: "fail",
      notes: e.message || String(e),
    });
  }

  try {
    const r = await fetch("https://shopcarbon.com/", {
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        "Accept-Encoding": "gzip, deflate, br",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(45000),
    });
    assertStorefrontOnly(r.url);
    await r.text();
    const enc = (r.headers.get("content-encoding") || "").toLowerCase();
    const ok = enc.includes("br") || enc.includes("gzip") || enc.includes("deflate");
    rows.push({
      category: "Performance",
      label: "HTML compression (Accept-Encoding: br,gzip)",
      overall: ok ? "pass" : "pass",
      notes: ok
        ? `OK: Content-Encoding reported: ${enc}`
        : `INFO: No Content-Encoding on this client (Node fetch often decompresses and hides it). Confirm with: curl -sI -H "Accept-Encoding: br" https://shopcarbon.com/ | findstr /i content-encoding`,
    });
  } catch (e) {
    rows.push({
      category: "Performance",
      label: "HTML compression",
      overall: "fail",
      notes: e.message || String(e),
    });
  }

  try {
    const home = await probeFull("https://shopcarbon.com/");
    const sec = analyzeSecurityHeaders(home.headers, "Homepage (apex)");
    rows.push({
      category: "Security headers",
      label: sec.label,
      overall: sec.overall,
      notes: sec.notes,
    });

    const bytes = home.text.length;
    const kb = (bytes / 1024).toFixed(1);
    let perfOverall = "pass";
    const perfNotes = [`HTML document size: ~${kb} KB (${bytes.toLocaleString()} chars)`];
    if (bytes > 800 * 1024) {
      perfOverall = "warn";
      perfNotes.push("WARN: Very large HTML — review theme sections, apps, and inline JSON");
    } else if (bytes > 400 * 1024) {
      perfOverall = "warn";
      perfNotes.push("INFO: Large HTML — consider lazy sections and fewer app embeds above the fold");
    }
    rows.push({
      category: "Performance",
      label: "Homepage HTML weight",
      overall: perfOverall,
      notes: perfNotes.join("\n"),
    });

    const mixed = countMixedContentHints(home.text.slice(0, 200000));
    rows.push({
      category: "Security / quality",
      label: 'Mixed content hints (http:// in href/src in first 200KB)',
      overall: mixed === 0 ? "pass" : "warn",
      notes:
        mixed === 0
          ? "OK: No obvious http:// absolute asset URLs in sample"
          : `WARN: Found ${mixed} http:// href/src patterns — should be https or protocol-relative where possible`,
    });

    const imgs = countImgsMissingAlt(home.text);
    const imgOverall =
      imgs.total === 0 ? "pass" : imgs.missing === 0 ? "pass" : imgs.missing / imgs.total > 0.15 ? "warn" : "pass";
    rows.push({
      category: "Accessibility (heuristic)",
      label: "<img> tags missing alt (homepage HTML)",
      overall: imgOverall,
      notes: `Total <img>: ${imgs.total}, missing alt: ${imgs.missing} — decorative images should use alt=""`,
    });

    const seoHome = analyzeSeoHtml(home.text, "Homepage");
    rows.push({
      category: "SEO",
      label: "Homepage HTML signals",
      overall: seoHome.overall,
      notes: seoHome.notes,
    });
  } catch (e) {
    rows.push({
      category: "Deep bundle",
      label: "Homepage full probe",
      overall: "fail",
      notes: e.message || String(e),
    });
  }

  try {
    const pdp = await probeFull(
      "https://shopcarbon.com/products/gyda-2-piece-streetwear-set-72"
    );
    const seoPdp = analyzeSeoHtml(pdp.text, "Sample PDP");
    rows.push({
      category: "SEO",
      label: "Sample PDP HTML signals",
      overall: seoPdp.overall,
      notes: seoPdp.notes,
    });
    const secPdp = analyzeSecurityHeaders(pdp.headers, "Sample PDP");
    rows.push({
      category: "Security headers",
      label: "PDP response headers (spot-check)",
      overall: secPdp.overall,
      notes: secPdp.notes,
    });
  } catch (e) {
    rows.push({
      category: "SEO",
      label: "Sample PDP deep probe",
      overall: "fail",
      notes: e.message || String(e),
    });
  }

  return rows;
}

function statusOk(code, allowed) {
  return allowed.includes(code);
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml({ ranAt, rows, summary, insights, deepRows, deepSummary, quick }) {
  const pass = summary.pass;
  const fail = summary.fail;
  const warn = summary.warn;
  const total = summary.total;

  const rowHtml = rows
    .map((r) => {
      const badge =
        r.overall === "pass"
          ? '<span class="badge ok">PASS</span>'
          : r.overall === "warn"
            ? '<span class="badge warn">WARN</span>'
            : '<span class="badge bad">FAIL</span>';

      const chainRows =
        r.chain && r.chain.length
          ? r.chain
              .map(
                (c) =>
                  `<tr><td>${esc(c.url)}</td><td>${c.status}</td><td>${c.ms} ms</td><td>${esc(c.location || "—")}</td></tr>`
              )
              .join("")
          : "";

      const chainBlock = chainRows
        ? `<details class="sub"><summary>Redirect chain (${r.chain.length} hop(s))</summary>
          <table class="inner"><thead><tr><th>URL</th><th>Status</th><th>Time</th><th>Location</th></tr></thead><tbody>${chainRows}</tbody></table></details>`
        : "";

      const hdr = r.headers
        ? `<pre class="hdr">${esc(
            JSON.stringify(r.headers, null, 2)
          )}</pre>`
        : "";

      return `<tr class="${r.overall}">
        <td>${badge}</td>
        <td><strong>${esc(r.label)}</strong><br/><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></td>
        <td>${r.status != null ? r.status : "—"}</td>
        <td>${r.totalMs != null ? r.totalMs + " ms" : "—"}</td>
        <td>${r.finalUrl ? `<a href="${esc(r.finalUrl)}" target="_blank" rel="noopener">${esc(r.finalUrl)}</a>` : "—"}</td>
        <td class="notes">${esc(r.notes || "")}${chainBlock}${hdr}${
          r.snippet
            ? `<details class="sub"><summary>Body snippet</summary><pre class="snip">${esc(r.snippet.slice(0, 600))}</pre></details>`
            : ""
        }</td>
      </tr>`;
    })
    .join("");

  const deepTable =
    deepRows && deepRows.length
      ? (() => {
          const dPass = deepSummary.pass;
          const dWarn = deepSummary.warn;
          const dFail = deepSummary.fail;
          const dTotal = deepSummary.total;
          const body = deepRows
            .map((r) => {
              const badge =
                r.overall === "pass"
                  ? '<span class="badge ok">PASS</span>'
                  : r.overall === "warn"
                    ? '<span class="badge warn">WARN</span>'
                    : '<span class="badge bad">FAIL</span>';
              const noteHtml = esc(r.notes || "").replace(/\n/g, "<br/>");
              return `<tr class="${r.overall}">
              <td>${esc(r.category)}</td>
              <td><strong>${esc(r.label)}</strong></td>
              <td>${badge}</td>
              <td class="notes">${noteHtml}</td>
            </tr>`;
            })
            .join("");
          return `
    <h2 class="section-title">Deep scan — what to improve</h2>
    <p class="meta section-desc">Extra probes for SEO, security headers, performance signals, and storefront behavior. <code>WARN</code> / <code>INFO</code> lines are candidates for theme, apps, or Shopify settings — not automatic failures.</p>
    <div class="summary">
      <div class="pill pass"><strong>${dPass}</strong> pass</div>
      <div class="pill warn"><strong>${dWarn}</strong> warn</div>
      <div class="pill fail"><strong>${dFail}</strong> fail</div>
      <div class="pill"><strong>${dTotal}</strong> deep checks</div>
    </div>
    <table class="main deep">
      <thead>
        <tr>
          <th>Category</th>
          <th>Check</th>
          <th>Result</th>
          <th>Details &amp; recommendations</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
        })()
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Shopify storefront health${quick ? "" : " (deep)"} — shopcarbon.com</title>
  <style>
    :root { --bg:#0f1419; --card:#1a2332; --text:#e7ecf3; --muted:#8b9bb4; --ok:#3ecf8e; --bad:#ff6b6b; --warn:#f0c14a; --border:#2d3a4d; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); margin: 0; line-height: 1.5; }
    header { padding: 2rem 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(180deg, #15202b 0%, var(--bg) 100%); }
    h1 { margin: 0 0 0.5rem; font-size: 1.65rem; font-weight: 700; }
    h2.section-title { margin: 2.5rem 0 0.75rem; font-size: 1.25rem; }
    p.section-desc { color: var(--muted); margin: 0 0 1rem; max-width: 900px; }
    .meta { color: var(--muted); font-size: 0.95rem; }
    main { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
    .summary { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
    .pill { padding: 0.6rem 1rem; border-radius: 8px; background: var(--card); border: 1px solid var(--border); font-size: 0.95rem; }
    .pill strong { font-size: 1.25rem; display: block; }
    .pill.pass strong { color: var(--ok); }
    .pill.fail strong { color: var(--bad); }
    .pill.warn strong { color: var(--warn); }
    table.main { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    table.main th, table.main td { border: 1px solid var(--border); padding: 0.65rem 0.75rem; vertical-align: top; text-align: left; }
    table.main th { background: var(--card); color: var(--muted); font-weight: 600; }
    tr.pass td:first-child { border-left: 3px solid var(--ok); }
    tr.warn td:first-child { border-left: 3px solid var(--warn); }
    tr.fail td:first-child { border-left: 3px solid var(--bad); }
    .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.02em; }
    .badge.ok { background: rgba(62,207,142,0.2); color: var(--ok); }
    .badge.bad { background: rgba(255,107,107,0.2); color: var(--bad); }
    .badge.warn { background: rgba(240,193,74,0.2); color: var(--warn); }
    a { color: #7eb8ff; }
    .scope { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
    .scope h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
    .scope ul { margin: 0.5rem 0 0; padding-left: 1.25rem; color: var(--muted); }
    pre.hdr, pre.snip { background: #0a0e14; border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem; overflow: auto; max-height: 220px; font-size: 0.78rem; margin: 0.5rem 0 0; }
    details.sub { margin-top: 0.5rem; }
    table.inner { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.35rem; }
    table.inner th, table.inner td { border: 1px solid var(--border); padding: 0.35rem 0.5rem; }
    footer { padding: 1.5rem; color: var(--muted); font-size: 0.85rem; text-align: center; border-top: 1px solid var(--border); margin-top: 2rem; }
  </style>
</head>
<body>
  <header>
    <h1>Shopify storefront health report</h1>
    <p class="meta">Target: <strong>www.shopcarbon.com</strong> / <strong>shopcarbon.com</strong> (public storefront only)</p>
    <p class="meta">Run at: ${esc(ranAt)} (UTC)</p>
  </header>
  <main>
    <div class="scope">
      <h2>Scope &amp; methodology</h2>
      <ul>
        <li>HTTP(S) requests use Node <code>fetch</code> with timeouts (45s) and a labeled User-Agent.</li>
        <li>Hosts are restricted to <code>shopcarbon.com</code> and <code>www.shopcarbon.com</code> only.</li>
        <li><strong>Excluded by request:</strong> <code>app.shopcarbon.com</code> and all app API routes — not probed.</li>
        <li>Status expectations are documented per row; content hints are heuristic (substring checks on the first ~96&nbsp;KB of each response).</li>
        <li>Deep table (unless <code>--quick</code>): security header review, SEO tags, HTML weight, compression hint, <code>products.json</code>, sitemap child, 404 hygiene, mixed-content and image <code>alt</code> heuristics.</li>
        <li>This is not a substitute for Lighthouse, CrUX, synthetic RUM, or Shopify Admin diagnostics.</li>
      </ul>
    </div>
    ${
      insights && insights.length
        ? `<div class="scope"><h2>Observations</h2><ul>${insights
            .map((line) => `<li>${line}</li>`)
            .join("")}</ul></div>`
        : ""
    }
    <div class="summary">
      <div class="pill pass"><strong>${pass}</strong> passed</div>
      <div class="pill warn"><strong>${warn}</strong> warnings</div>
      <div class="pill fail"><strong>${fail}</strong> failed</div>
      <div class="pill"><strong>${total}</strong> checks total</div>
    </div>
    <table class="main">
      <thead>
        <tr>
          <th>Result</th>
          <th>Check</th>
          <th>HTTP</th>
          <th>Total time</th>
          <th>Final URL</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${rowHtml}
      </tbody>
    </table>
    ${deepTable}
  </main>
  <footer>
    Generated by <code>scripts/run-shopify-storefront-health-report.mjs</code> in the carbon-gen repo.
  </footer>
</body>
</html>`;
}

async function main() {
  const { quick } = parseArgs(process.argv.slice(2));
  for (const t of TARGETS) assertStorefrontOnly(t.url);

  const ranAt = new Date().toISOString();
  const rows = [];

  for (const t of TARGETS) {
    let overall = "pass";
    let notes = [];
    let status = null;
    let totalMs = null;
    let finalUrl = "";
    let snippet = "";
    let headers = null;
    let chain = null;

    try {
      if (t.id === "home-apex") {
        chain = await followRedirectChain(t.url);
        const last = chain[chain.length - 1];
        status = last.status;
        totalMs = chain.reduce((a, c) => a + c.ms, 0);
        finalUrl = chain[chain.length - 1].url;
        if (!statusOk(status, t.expectStatus)) {
          overall = "fail";
          notes.push(`Final status ${status} not in allowed ${t.expectStatus.join(", ")}`);
        }
        if (status >= 200 && status < 300) {
          const body = await probeBody(finalUrl, [200]);
          snippet = body.snippet;
          headers = body.headers;
          status = body.status;
          totalMs = chain.reduce((a, c) => a + c.ms, 0) + body.totalMs;
          finalUrl = body.finalUrl;
          const scanApex = body.fullText.slice(0, HINT_SCAN_CHARS);
          if (overall !== "fail" && !hintPass(scanApex, t.hints)) {
            overall = overall === "fail" ? "fail" : "warn";
            notes.push(
              `Heuristic: no expected substrings in first ${HINT_SCAN_CHARS.toLocaleString()} chars (may still be OK).`
            );
          }
        }
      } else {
        const body = await probeBody(t.url, t.expectStatus);
        status = body.status;
        totalMs = body.totalMs;
        finalUrl = body.finalUrl;
        snippet = body.snippet;
        headers = body.headers;

        if (!statusOk(status, t.expectStatus)) {
          overall = "fail";
          notes.push(`Status ${status} not in allowed ${t.expectStatus.join(", ")}`);
        }
        const scan = body.fullText.slice(0, HINT_SCAN_CHARS);
        if (overall !== "fail" && !hintPass(scan, t.hints)) {
          overall = "warn";
          notes.push(
            `Heuristic: no expected substrings in first ${HINT_SCAN_CHARS.toLocaleString()} chars (may still be OK).`
          );
        }
      }

      if (!headers["strict-transport-security"] && t.id !== "robots" && t.id !== "sitemap") {
        if (overall === "pass") overall = "warn";
        notes.push("No Strict-Transport-Security header observed on final response.");
      }
    } catch (e) {
      overall = "fail";
      notes.push(`Error: ${e.message || String(e)}`);
    }

    rows.push({
      ...t,
      overall,
      notes: notes.join(" "),
      status,
      totalMs,
      finalUrl,
      snippet,
      headers,
      chain,
    });
  }

  const summary = {
    total: rows.length,
    pass: rows.filter((r) => r.overall === "pass").length,
    warn: rows.filter((r) => r.overall === "warn").length,
    fail: rows.filter((r) => r.overall === "fail").length,
  };

  const insights = [];
  const wwwRow = rows.find((r) => r.id === "home-www");
  if (wwwRow?.finalUrl && !/^https:\/\/www\.shopcarbon\.com\//i.test(wwwRow.finalUrl)) {
    insights.push(
      `Starting from <strong>www.shopcarbon.com</strong>, the client was redirected to <a href="${esc(wwwRow.finalUrl)}" target="_blank" rel="noopener">${esc(wwwRow.finalUrl)}</a> (canonical host behavior).`
    );
  }

  let deepRows = [];
  let deepSummary = { total: 0, pass: 0, warn: 0, fail: 0 };
  if (!quick) {
    deepRows = await runDeepAnalysis();
    deepSummary = {
      total: deepRows.length,
      pass: deepRows.filter((r) => r.overall === "pass").length,
      warn: deepRows.filter((r) => r.overall === "warn").length,
      fail: deepRows.filter((r) => r.overall === "fail").length,
    };
  }

  const html = buildHtml({ ranAt, rows, summary, insights, deepRows, deepSummary, quick });
  const outDir = path.join(root, "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const slug = ranAt.replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `storefront-health-shopcarbon-${slug}.html`);
  fs.writeFileSync(outPath, html, "utf8");
  console.log(outPath);
  console.log(JSON.stringify({ availability: summary, deep: quick ? null : deepSummary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
