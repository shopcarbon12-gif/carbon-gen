import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

const root = process.cwd();
const nextStatic = resolve(root, ".next", "static");
const standaloneNext = resolve(root, ".next", "standalone", ".next");
const standaloneStatic = resolve(standaloneNext, "static");
const publicDir = resolve(root, "public");
const standalonePublicDir = resolve(root, ".next", "standalone", "public");

if (!existsSync(nextStatic)) {
  console.warn("[prepare-standalone] .next/static not found, skipping copy.");
  process.exit(0);
}

ensureDir(standaloneNext);
ensureDir(standaloneStatic);
cpSync(nextStatic, standaloneStatic, { recursive: true, force: true });

if (existsSync(publicDir)) {
  ensureDir(standalonePublicDir);
  cpSync(publicDir, standalonePublicDir, { recursive: true, force: true });
}

console.log("[prepare-standalone] Copied static/public into standalone bundle.");
