import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..", "tmp-sitemap-clean");

const chunkFiles = fs
  .readdirSync(dir)
  .filter((f) => /^p-chunk\d+\.txt$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

for (let i = 0; i < chunkFiles.length; i++) {
  const chunk = fs.readFileSync(path.join(dir, chunkFiles[i]), "utf8");
  const fn = `() => { window.__carbonS = (window.__carbonS || '') + ${JSON.stringify(chunk)}; return window.__carbonS.length; }`;
  fs.writeFileSync(
    path.join(dir, `inject-append-${i}.json`),
    JSON.stringify({ function: fn }),
    "utf8"
  );
  console.log("inject-append-" + i + ".json", fn.length);
}
