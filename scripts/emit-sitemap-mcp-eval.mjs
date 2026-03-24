/**
 * Writes Playwright browser_evaluate function strings to tmp-sitemap-clean/mcp-eval-*.txt
 * Run: node scripts/emit-sitemap-mcp-eval.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "tmp-sitemap-clean");

function applyFn(html) {
  return `() => { const html = ${JSON.stringify(html)}; const ta = document.querySelector('textarea[name="page.body"]'); if (!ta) return "no textarea"; const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta), "value"); d.set.call(ta, html); ta.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: null })); return html.length; }`;
}

const singles = [
  "html-sitemap-blogs.html",
  "html-sitemap-articles.html",
  "html-sitemap-pages.html",
  "html-sitemap-collections.html",
  "html-sitemap-products.html",
];
for (const f of singles) {
  const html = fs.readFileSync(path.join(dir, f), "utf8");
  const name = f.replace(".html", "");
  fs.writeFileSync(path.join(dir, `mcp-eval-${name}.txt`), applyFn(html), "utf8");
  console.log("wrote", name, Buffer.byteLength(html, "utf8"));
}

const parts = [0, 1, 2].map((i) =>
  fs.readFileSync(path.join(dir, `p-chunk${i}.txt`), "utf8")
);
fs.writeFileSync(
  path.join(dir, "mcp-eval-products-reset.txt"),
  "() => { window.__carbonS = ''; return 1; }",
  "utf8"
);
parts.forEach((chunk, i) => {
  fs.writeFileSync(
    path.join(dir, `mcp-eval-products-append-${i}.txt`),
    `() => { window.__carbonS = (window.__carbonS || '') + ${JSON.stringify(chunk)}; return window.__carbonS.length; }`,
    "utf8"
  );
});
fs.writeFileSync(
  path.join(dir, "mcp-eval-products-apply.txt"),
  `() => { const html = window.__carbonS; const ta = document.querySelector('textarea[name="page.body"]'); if (!ta) return "no textarea"; const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta), "value"); d.set.call(ta, html); ta.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: null })); delete window.__carbonS; return html.length; }`,
  "utf8"
);
console.log("wrote products append x3 + apply (fallback if single-shot too large)");
