import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mapsRoot = path.join(root, ".next", "dev");
const targetPrefix = "file:///C:/Users/Elior/Desktop/carbon-gen/";

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p, out);
    } else if (ent.isFile() && ent.name.endsWith(".map")) {
      out.push(p);
    }
  }
  return out;
}

function pushEntries(mapObj, acc) {
  if (!mapObj || typeof mapObj !== "object") return;

  if (Array.isArray(mapObj.sources) && Array.isArray(mapObj.sourcesContent)) {
    for (let i = 0; i < mapObj.sources.length; i++) {
      const src = mapObj.sources[i];
      const content = mapObj.sourcesContent[i];
      if (
        typeof src === "string" &&
        src.startsWith(targetPrefix) &&
        typeof content === "string"
      ) {
        acc.push({ src, content });
      }
    }
  }

  if (Array.isArray(mapObj.sections)) {
    for (const section of mapObj.sections) {
      if (section && section.map) pushEntries(section.map, acc);
    }
  }
}

function normalizeRel(src) {
  let rel = src.slice(targetPrefix.length);
  rel = rel.split("?")[0].split("#")[0];
  rel = decodeURIComponent(rel).replace(/\\/g, "/").replace(/^\/+/, "");
  rel = rel.replace(/\u0000/g, "").trim();
  while (rel.includes("//")) rel = rel.replace(/\/\//g, "/");
  return rel;
}

if (!fs.existsSync(mapsRoot)) {
  console.error(`Missing map root: ${mapsRoot}`);
  process.exit(1);
}

const outDir = path.join(root, ".tmp_recovered_from_maps");
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

const files = walk(mapsRoot);
const recovered = new Map();

for (const file of files) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    continue;
  }

  const hits = [];
  pushEntries(obj, hits);

  for (const hit of hits) {
    const rel = normalizeRel(hit.src);
    if (!rel || rel.endsWith("/")) continue;
    if (rel.includes("/__nextjs-internal-proxy.mjs")) continue;
    if (/\.(tsx|ts|js|mjs|css)\/.+/.test(rel)) continue;
    if (rel.includes(" (")) continue;
    const prev = recovered.get(rel);
    if (!prev || hit.content.length > prev.content.length) {
      recovered.set(rel, { content: hit.content, from: file });
    }
  }
}

const rows = [];
for (const [rel, info] of recovered.entries()) {
  const safeRel = rel.replace(/[:*?"<>|]/g, "_");
  const outPath = path.join(outDir, safeRel);
  const parent = path.dirname(outPath);

  if (fs.existsSync(outPath) && fs.statSync(outPath).isDirectory()) {
    fs.rmSync(outPath, { recursive: true, force: true });
  }
  if (fs.existsSync(parent) && fs.statSync(parent).isFile()) {
    fs.rmSync(parent, { force: true });
  }
  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(outPath, info.content, "utf8");

  rows.push({
    rel: safeRel,
    bytes: info.content.length,
    from: path.relative(root, info.from),
  });
}

rows.sort((a, b) => a.rel.localeCompare(b.rel));

const indexPath = path.join(outDir, "RECOVERY_INDEX.json");
fs.writeFileSync(indexPath, JSON.stringify(rows, null, 2), "utf8");

console.log(`Recovered files: ${rows.length}`);
console.log(`Index: ${indexPath}`);
for (const row of rows.slice(0, 200)) {
  console.log(`${row.rel} :: ${row.bytes} :: ${row.from}`);
}
if (rows.length > 200) {
  console.log(`... (${rows.length - 200} more)`);
}
