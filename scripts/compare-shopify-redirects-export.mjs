/**
 * Compare Shopify Admin "URL redirects" export against local 404 work:
 *   - product-404-redirects-suggested.csv (Path/Target vs Shopify)
 *   - 404-all-merged.txt (full URLs → already redirected?)
 *
 * Shopify export columns: Redirect from, Redirect to (relative paths).
 *
 * Usage:
 *   node scripts/compare-shopify-redirects-export.mjs [redirects_export.csv]
 *
 * Default export path (if file exists): tmp-404-report/shopify-redirects-export.csv
 * Otherwise pass path, e.g. %USERPROFILE%/Downloads/redirects_export_1.csv
 *
 * Outputs (tmp-404-report/):
 *   redirect-export-vs-suggested.csv
 *   redirect-export-vs-404-merged.csv
 *   redirect-export-summary.txt
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "tmp-404-report");

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function normalizePath(p) {
  let s = String(p ?? "").trim().replace(/^["']|["']$/g, "");
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.replace(/\/+/g, "/");
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

function pathnameFromUrlOrPath(input) {
  const t = String(input ?? "").trim().replace(/^404\s+/i, "");
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) {
    try {
      return normalizePath(new URL(t).pathname);
    } catch {
      return normalizePath(t);
    }
  }
  return normalizePath(t);
}

function loadRedirectExport(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new Error(`Redirect export empty or header only: ${filePath}`);
  }
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  let iFrom = header.indexOf("redirect from");
  let iTo = header.indexOf("redirect to");
  if (iFrom < 0) iFrom = 0;
  if (iTo < 0) iTo = 1;
  const map = new Map();
  const dup = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    const fromRaw = cols[iFrom] ?? "";
    const toRaw = cols[iTo] ?? "";
    const fromN = normalizePath(fromRaw);
    const toN = normalizePath(toRaw);
    if (!fromN || fromN === "/") continue;
    if (map.has(fromN)) dup.push(fromN);
    map.set(fromN, toN);
  }
  return { map, dup: [...new Set(dup)] };
}

function parseSuggestedRedirects(suggestedPath) {
  const text = fs.readFileSync(suggestedPath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    if (cols.length < 2) continue;
    const path = cols[0]?.replace(/^"|"$/g, "") ?? "";
    const target = cols[1]?.replace(/^"|"$/g, "") ?? "";
    const score = cols[2] ?? "";
    const reason = cols[3] ?? "";
    rows.push({
      path_raw: path,
      path_norm: normalizePath(path),
      target_raw: target,
      target_norm: normalizePath(target),
      score,
      reason,
    });
  }
  return rows;
}

function clean404Line(line) {
  const s = line.replace(/^404\s+/i, "").trim();
  const m = s.match(/https?:\/\/[^\s]+/);
  let u = m ? m[0] : s;
  u = u.replace(/[\u200e\u200f\ufeff\u200d]/g, "").replace(/[\u0080-\uFFFF]+$/u, "").trim();
  try {
    return new URL(u).href.split("?")[0].replace(/\/$/, "");
  } catch {
    return u;
  }
}

function main() {
  const argvPath = process.argv[2]?.trim();
  const defaultLocal = path.join(reportDir, "shopify-redirects-export.csv");
  let exportPath = argvPath;
  if (!exportPath) {
    exportPath = fs.existsSync(defaultLocal) ? defaultLocal : "";
  }
  if (!exportPath || !fs.existsSync(exportPath)) {
    console.error("Usage: node scripts/compare-shopify-redirects-export.mjs <path-to-redirects_export.csv>");
    console.error("Or copy the Shopify export to:", defaultLocal);
    process.exit(1);
  }

  const suggestedPath = path.join(reportDir, "product-404-redirects-suggested.csv");
  const merged404Path = path.join(reportDir, "404-all-merged.txt");

  const { map: shopifyFromTo, dup } = loadRedirectExport(exportPath);
  console.log("Shopify redirect rules:", shopifyFromTo.size, dup.length ? `(warning: ${dup.length} duplicate from-paths)` : "");

  fs.mkdirSync(reportDir, { recursive: true });

  let summary = [];
  summary.push(`Export file: ${exportPath}`);
  summary.push(`Shopify rules loaded: ${shopifyFromTo.size}`);

  // --- vs suggested CSV
  if (!fs.existsSync(suggestedPath)) {
    console.warn("Missing:", suggestedPath, "(skip suggested comparison)");
    summary.push("Suggested CSV: missing, skipped");
  } else {
    const suggested = parseSuggestedRedirects(suggestedPath);
    let same = 0;
    let differs = 0;
    let notInShopify = 0;

    const outLines = [
      [
        "status",
        "path",
        "target_suggested",
        "shopify_target",
        "target_match",
        "score",
        "reason",
      ].join(","),
    ];

    function esc(s) {
      const t = String(s ?? "");
      if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
      return t;
    }

    for (const r of suggested) {
      const shopifyTo = shopifyFromTo.get(r.path_norm);
      let status;
      let targetMatch = "";
      if (shopifyTo === undefined) {
        status = "not_in_shopify";
        notInShopify++;
        outLines.push(
          [status, r.path_raw, r.target_raw, "", "", r.score, r.reason].map(esc).join(",")
        );
      } else if (shopifyTo === r.target_norm) {
        status = "already_same";
        targetMatch = "yes";
        same++;
        outLines.push(
          [status, r.path_raw, r.target_raw, shopifyTo, targetMatch, r.score, r.reason].map(esc).join(",")
        );
      } else {
        status = "already_differs";
        targetMatch = "no";
        differs++;
        outLines.push(
          [status, r.path_raw, r.target_raw, shopifyTo, targetMatch, r.score, r.reason].map(esc).join(",")
        );
      }
    }

    const outSuggested = path.join(reportDir, "redirect-export-vs-suggested.csv");
    fs.writeFileSync(outSuggested, outLines.join("\n"), "utf8");
    console.log("Wrote", outSuggested);
    console.log("  vs suggested: already_same", same, "| already_differs", differs, "| not_in_shopify", notInShopify);
    summary.push(
      `vs product-404-redirects-suggested: same=${same} differs=${differs} not_in_shopify=${notInShopify}`
    );
  }

  // --- vs 404-all-merged URLs
  if (!fs.existsSync(merged404Path)) {
    console.warn("Missing:", merged404Path, "(skip 404 list comparison)");
    summary.push("404-all-merged: missing, skipped");
  } else {
    const lines = fs.readFileSync(merged404Path, "utf8").split(/\r?\n/).filter(Boolean);
    const seen = new Set();
    let withRedirect = 0;
    let without = 0;

    const outLines = [["url", "pathname_norm", "shopify_redirect_to", "status"].join(",")];

    function esc(s) {
      const t = String(s ?? "");
      if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
      return t;
    }

    for (const line of lines) {
      const url = clean404Line(line);
      if (!url) continue;
      const pathnameNorm = pathnameFromUrlOrPath(url);
      if (!pathnameNorm) continue;
      const key = `${url}\t${pathnameNorm}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const shopifyTo = shopifyFromTo.get(pathnameNorm);
      if (shopifyTo !== undefined) {
        withRedirect++;
        outLines.push(
          ["has_shopify_redirect", url, pathnameNorm, shopifyTo].map(esc).join(",")
        );
      } else {
        without++;
        outLines.push(["no_shopify_redirect", url, pathnameNorm, ""].map(esc).join(","));
      }
    }

    const outMerged = path.join(reportDir, "redirect-export-vs-404-merged.csv");
    fs.writeFileSync(outMerged, outLines.join("\n"), "utf8");
    console.log("Wrote", outMerged);
    console.log("  vs 404 merged: has_shopify_redirect", withRedirect, "| no_shopify_redirect", without);
    summary.push(`vs 404-all-merged unique url+path: has_redirect=${withRedirect} no_redirect=${without}`);
  }

  const summaryPath = path.join(reportDir, "redirect-export-summary.txt");
  fs.writeFileSync(summaryPath, summary.join("\n"), "utf8");
  console.log("Wrote", summaryPath);
}

main();
