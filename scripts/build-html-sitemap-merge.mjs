/**
 * Fetches Shopify child HTML sitemap pages and builds merged body HTML for the main
 * /pages/html-sitemap page. No SEOAnt footer; uses carbon-html-sitemap-row + shared CSS.
 *
 * Usage: node scripts/build-html-sitemap-merge.mjs
 * Env: SHOPIFY_STOREFRONT_BASE_URL (default https://shopcarbon.com)
 *
 * Writes: tmp-body.html, tmp-sitemap-b64.txt (UTF-8 base64 of body)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const BASE = (
  process.env.SHOPIFY_STOREFRONT_BASE_URL || "https://shopcarbon.com"
).replace(/\/$/, "");

const CHILD = {
  prod: "/pages/html-sitemap-products",
  col: "/pages/html-sitemap-collections",
  blog: "/pages/html-sitemap-blogs",
  art: "/pages/html-sitemap-articles",
  pg: "/pages/html-sitemap-pages",
};

const intro = `<div class="page-width rte" style="margin-bottom:1.5rem">
<p>Browse main areas of our store. For search engines, see <a href="/sitemap.xml">sitemap.xml</a>.</p>
<p><strong>Helpful:</strong> <a href="/pages/accessibility">Accessibility statement</a> | <a href="/pages/contact-us">Contact us</a></p>
</div>`;

const CARBON_STYLES = `<style>
.carbon-html-sitemap-row { margin-bottom: 2.1rem; }
.carbon-html-sitemap-row a { color: inherit; }
.carbon-html-sitemap-row > h3 { margin-bottom: 12px; }
.carbon-html-sitemap-row > ul {
  margin-left: 0; margin-bottom: 4px; columns: 3; -webkit-columns: 3;
}
.carbon-html-sitemap-row > ul > li {
  margin-bottom: 4px; max-width: 250px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; list-style: inside;
}
.rte .carbon-html-sitemap-row > ul > li > a,
.rte .carbon-html-sitemap-row > li > a { border-bottom: unset; }
@media only screen and (max-width: 600px) {
  .carbon-html-sitemap-row > ul { columns: 2; -webkit-columns: 2; }
  .carbon-html-sitemap-row > ul > li { font-size: 16px; }
}
@media only screen and (max-width: 360px) {
  .carbon-html-sitemap-row > ul { columns: 1; -webkit-columns: 1; }
}
</style>`;

const LEGACY_STYLE_ANCHOR = "\n                            <style>";

/** Supports legacy SEOAnt pages and carbon-only child pages (see rebuild-shopify-html-sitemap-children.mjs). */
function sliceFirstRow(html) {
  const seoant = '<div class="seoant-html-sitemap-row">';
  const carbon = '<div class="carbon-html-sitemap-row">';
  let start = html.indexOf(seoant);
  const fromSeoant = start !== -1;
  if (!fromSeoant) {
    start = html.indexOf(carbon);
  }
  if (start === -1) {
    throw new Error(
      "Missing sitemap row (seoant or carbon); child pages may have changed."
    );
  }
  const styleIdx = html.indexOf(LEGACY_STYLE_ANCHOR, start);
  if (styleIdx !== -1) {
    return html.slice(start, styleIdx).trim();
  }
  if (!fromSeoant) {
    const ulClose = html.indexOf("</ul>", start);
    if (ulClose === -1) {
      throw new Error(
        "Carbon sitemap row but no </ul> and no legacy style anchor."
      );
    }
    const divClose = html.indexOf("</div>", ulClose);
    if (divClose === -1) {
      throw new Error("Carbon sitemap row missing closing </div> after list.");
    }
    return html.slice(start, divClose + 6).trim();
  }
  throw new Error(
    "Seoant row found but no legacy style anchor; child page HTML may have changed."
  );
}

function toCarbonRow(html) {
  return html.replace(/seoant-html-sitemap-row/g, "carbon-html-sitemap-row");
}

/** First maxLi items inside ul; append orphanLi before closing div. */
function abbrevRow(row, maxLi, orphanLi) {
  const open = '<div class="carbon-html-sitemap-row">';
  const h3m = row.match(/<h3>[\s\S]*?<\/h3>/);
  const ulStart = row.indexOf("<ul>");
  const ulEnd = row.indexOf("</ul>");
  if (ulStart === -1 || ulEnd === -1) return row;
  const ulBlock = row.slice(ulStart, ulEnd + 5);
  const lis = ulBlock.match(/<li>[\s\S]*?<\/li>/g) || [];
  const short = lis.slice(0, maxLi);
  const newUl = "<ul>\n" + short.join("\n") + "\n</ul>";
  const inner =
    (h3m ? h3m[0] + "\n" : "") + newUl + (orphanLi ? "\n" + orphanLi : "");
  return `${open}\n${inner}\n</div>`;
}

async function fetchHtml(pathname) {
  const url = BASE + pathname;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

const outBody = path.join(rootDir, "tmp-body.html");
const outB64 = path.join(rootDir, "tmp-sitemap-b64.txt");

const [prodHtml, colHtml, blogHtml, artHtml, pgHtml] = await Promise.all([
  fetchHtml(CHILD.prod),
  fetchHtml(CHILD.col),
  fetchHtml(CHILD.blog),
  fetchHtml(CHILD.art),
  fetchHtml(CHILD.pg),
]);

const prodFull = toCarbonRow(sliceFirstRow(prodHtml));
const colFull = toCarbonRow(sliceFirstRow(colHtml));
const blogFull = toCarbonRow(sliceFirstRow(blogHtml));
const artFull = toCarbonRow(sliceFirstRow(artHtml));
const pgFull = toCarbonRow(sliceFirstRow(pgHtml));

const prod = abbrevRow(
  prodFull,
  9,
  `<li><a href="${BASE}/pages/html-sitemap-products">All Products</a></li>`
);
const col = abbrevRow(
  colFull,
  9,
  `<li><a href="${BASE}/pages/html-sitemap-collections">All Collections</a></li>`
);
const pg = abbrevRow(
  pgFull,
  9,
  `<li><a href="${BASE}/pages/html-sitemap-pages">All Pages</a></li>`
);

const body =
  [intro, CARBON_STYLES, prod, col, blogFull, artFull, pg].join("\n") + "\n";

fs.writeFileSync(outBody, body, "utf8");
fs.writeFileSync(outB64, Buffer.from(body, "utf8").toString("base64"), "utf8");

console.log("OK", BASE);
console.log("bytes", Buffer.byteLength(body, "utf8"));
console.log(outBody);
console.log(outB64);
