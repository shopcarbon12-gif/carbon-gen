import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tmp-sitemap-clean");
fs.mkdirSync(outDir, { recursive: true });

const BASE = "https://shopcarbon.com";
const paths = [
  "html-sitemap-products",
  "html-sitemap-collections",
  "html-sitemap-blogs",
  "html-sitemap-articles",
  "html-sitemap-pages",
];

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

function sliceFirstRow(html) {
  const marker = '<div class="seoant-html-sitemap-row">';
  const start = html.indexOf(marker);
  const styleIdx = html.indexOf("\n                            <style>", start);
  if (start === -1 || styleIdx === -1) throw new Error("parse fail");
  return html.slice(start, styleIdx).trim();
}

function toCarbon(html) {
  return html.replace(/seoant-html-sitemap-row/g, "carbon-html-sitemap-row");
}

for (const h of paths) {
  const pathname = `/pages/${h}`;
  const res = await fetch(BASE + pathname);
  const html = await res.text();
  const body = `${CARBON_STYLES}\n${toCarbon(sliceFirstRow(html))}\n`;
  const file = path.join(outDir, `${h}.html`);
  fs.writeFileSync(file, body, "utf8");
  console.log(h, Buffer.byteLength(body, "utf8"), file);
}

/** Split for Playwright injection (never mid-tag); used for large products page. */
function splitHtmlSafe(s, maxChars) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + maxChars, s.length);
    if (end < s.length) {
      const li = s.lastIndexOf("</li>", end);
      if (li >= i) end = li + 5;
      else {
        const gt = s.lastIndexOf(">", end);
        if (gt >= i) end = gt + 1;
      }
    }
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

const prodBody = fs.readFileSync(
  path.join(outDir, "html-sitemap-products.html"),
  "utf8"
);
const prodParts = splitHtmlSafe(prodBody, 22000);
prodParts.forEach((p, idx) => {
  fs.writeFileSync(path.join(outDir, `p-chunk${idx}.txt`), p, "utf8");
});
console.log("p-chunks for inject:", prodParts.length);
