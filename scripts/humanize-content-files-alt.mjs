/**
 * Human-readable alt text for Shopify Admin → Content → Files (MediaImage).
 * Uses fileUpdate. Requires write_files (or write_themes) on the Admin token.
 *
 * Usage:
 *   node scripts/humanize-content-files-alt.mjs --dry-run
 *   node scripts/humanize-content-files-alt.mjs
 */
import dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envLocal = join(root, ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal });
else dotenv.config();

const shop = (process.env.SHOPIFY_SHOP_DOMAIN || "").trim();
const token = (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim();
const API = (process.env.SHOPIFY_API_VERSION || "").trim() || "2025-01";
const DRY = process.argv.includes("--dry-run");
const MAX_ALT = 120;
const BATCH = 15;
const THROTTLE_MS = 400;

const FILES_QUERY = `
  query ContentFiles($first: Int!, $after: String) {
    files(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        __typename
        ... on MediaImage {
          id
          alt
          image {
            url
            altText
          }
          fileStatus
        }
      }
    }
  }
`;

const FILE_UPDATE = `
  mutation FileUpdateAlt($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files {
        ... on MediaImage {
          id
          alt
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

function norm(s) {
  return String(s ?? "").trim();
}

function basenameFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const seg = path.split("/").pop() || "";
    return decodeURIComponent(seg.split("?")[0] || "");
  } catch {
    return "";
  }
}

function stripUuid(s) {
  return String(s).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ""
  );
}

function normalizeStem(s) {
  let x = stripUuid(String(s || ""));
  x = x.replace(/\.[a-z0-9]+$/i, "");
  x = x.replace(/_\d{2,5}x\d{2,5}/gi, "");
  x = x.replace(/[_\-]+/g, " ");
  x = x.replace(/\s+/g, " ").trim();
  return x;
}

function shouldHumanize(alt, url) {
  const a = norm(alt);
  const baseFull = basenameFromUrl(url);
  const baseStem = normalizeStem(baseFull);
  const altStem = normalizeStem(a || baseFull);
  const compact = (v) => v.toLowerCase().replace(/\s+/g, "");
  if (!a) return true;
  if (compact(altStem) === compact(baseStem) && baseStem.length > 0) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(a)) return true;
  if (/^[A-Z0-9_\-]{12,}$/.test(a.replace(/\s/g, ""))) return true;
  if ((a.match(/_/g) || []).length >= 2) return true;
  if (/^(NEW|SALE|HERO|BANNER|LOGO|ICON|BADGE)[_\-]/i.test(a)) return true;
  // Short ALL-CAPS tokens only (e.g. NEW_NEW), not Title Case phrases like "Men tank top"
  if (
    a.length <= 16 &&
    a === a.toUpperCase() &&
    /^[A-Z0-9_]+$/.test(a.replace(/\s/g, ""))
  ) {
    return true;
  }
  return false;
}

function buildHumanAlt(alt, url) {
  const stem = normalizeStem(alt || basenameFromUrl(url));
  const lower = stem.toLowerCase();

  if (!stem) {
    return "Carbon store image";
  }

  if (/^\d+$/.test(stem)) {
    return "Carbon brand or layout image";
  }

  if (/^new(\s+new)?$/i.test(stem)) {
    return "New arrivals badge — Carbon";
  }
  if (lower.includes("logo") && lower.includes("white")) {
    return "Carbon wordmark logo — white, horizontal";
  }
  if (lower.includes("logo") && lower.includes("black")) {
    return "Carbon wordmark logo — black, horizontal";
  }
  // Logo lockups named like CARBON_JEANS_BLACK_SMALL (not on-model product shots)
  if (
    /\bjeans\b/i.test(lower) &&
    /\bcarbon\b/i.test(lower) &&
    /\b(small|sm|icon|mini|lockup)\b/i.test(lower) &&
    !/\b(model|wearing|wear|fit|pocket|hem)\b/i.test(lower)
  ) {
    return "Carbon Jeans logo lockup — brand asset";
  }

  if (lower.includes("jeans") && lower.includes("black")) {
    return "Carbon black jeans — product image";
  }
  if (lower.includes("jeans")) {
    const color = lower.includes("blue")
      ? "blue"
      : lower.includes("black")
        ? "black"
        : lower.includes("white")
          ? "white"
          : "";
    const parts = ["Carbon jeans"];
    if (color) parts.push(color);
    parts.push("— product image");
    return parts.join(" ").slice(0, MAX_ALT);
  }
  if (lower.includes("dress")) {
    return `${stem.replace(/\b\w/g, (c) => c.toUpperCase())} — product image`.slice(0, MAX_ALT);
  }

  const words = stem.split(/\s+/).filter(Boolean);
  const titled = words
    .map((w) => {
      const lo = w.toLowerCase();
      if (lo === "carbon") return "Carbon";
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");

  if (/\blogo\b/i.test(lower)) {
    return `Carbon ${titled} — brand asset`.slice(0, MAX_ALT);
  }
  return `${titled} — Carbon store image`.slice(0, MAX_ALT);
}

async function gql(query, variables) {
  const res = await fetch(`https://${shop}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || json.errors?.length) {
    throw new Error(JSON.stringify(json.errors || json, null, 2));
  }
  return json.data;
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  if (!shop || !token) {
    console.error("Need SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN");
    process.exit(1);
  }

  const reportDir = join(root, "tmp", "content-files-alt-report");
  mkdirSync(reportDir, { recursive: true });

  const rows = [];
  const skipped = [];
  let cursor = null;
  let pages = 0;

  while (pages < 500) {
    pages += 1;
    console.error(`[files-alt] page ${pages}…`);
    const data = await gql(FILES_QUERY, { first: 50, after: cursor });
    const conn = data?.files;
    if (!conn?.nodes) break;

    for (const node of conn.nodes) {
      if (node?.__typename !== "MediaImage" || !node.id || !node.image?.url) continue;
      if (String(node.fileStatus || "").toUpperCase() !== "READY") {
        skipped.push({ id: node.id, reason: `status:${node.fileStatus}` });
        continue;
      }

      const url = node.image.url;
      const currentAlt = norm(node.alt) || norm(node.image.altText);
      if (!shouldHumanize(currentAlt, url)) {
        skipped.push({ id: node.id, reason: "already_descriptive", alt: currentAlt.slice(0, 80) });
        continue;
      }

      const newAlt = buildHumanAlt(currentAlt, url);
      if (newAlt === currentAlt) {
        skipped.push({ id: node.id, reason: "no_change_after_build", alt: currentAlt });
        continue;
      }

      const filename = basenameFromUrl(url);
      rows.push({
        id: node.id,
        filename,
        imageUrl: url,
        oldAlt: currentAlt || "(empty)",
        newAlt,
      });
    }

    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo?.endCursor) break;
    cursor = conn.pageInfo.endCursor;
  }

  const errors = [];
  if (!DRY && rows.length) {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const files = chunk.map((r) => ({ id: r.id, alt: r.newAlt.slice(0, MAX_ALT) }));
      try {
        const upd = await gql(FILE_UPDATE, { files });
        const ue = upd?.fileUpdate?.userErrors || [];
        if (ue.length) {
          errors.push(...ue.map((e) => ({ message: e.message, code: e.code })));
        }
      } catch (e) {
        errors.push({ message: String(e) });
      }
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }
  }

  const jsonPath = join(reportDir, "report.json");
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        shop,
        dryRun: DRY,
        appliedWrites: !DRY,
        rowCount: rows.length,
        skippedCount: skipped.length,
        errors,
        rows,
      },
      null,
      2
    ),
    "utf8"
  );

  const htmlRows = rows
    .map(
      (r) => `
    <tr>
      <td class="thumb"><img src="${esc(r.imageUrl)}" width="140" height="140" loading="lazy" alt="${esc(r.newAlt)}" style="object-fit:contain;max-width:140px;max-height:140px;background:#f4f4f4"/></td>
      <td class="fn"><code>${esc(r.filename)}</code></td>
      <td class="old">${esc(r.oldAlt)}</td>
      <td class="new"><strong>${esc(r.newAlt)}</strong></td>
      <td class="id"><code>${esc(r.id)}</code></td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Content → Files — alt text updates</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #111; }
    body { margin: 24px; max-width: 1200px; }
    h1 { font-size: 1.35rem; }
    .meta { color: #444; margin-bottom: 20px; font-size: 0.9rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
    th, td { border: 1px solid #ccc; padding: 10px; vertical-align: top; }
    th { background: #1a1a1a; color: #fff; text-align: left; }
    tr:nth-child(even) { background: #fafafa; }
    td.thumb { width: 160px; text-align: center; }
    td.old { color: #666; max-width: 280px; word-break: break-word; }
    td.new { max-width: 320px; }
    td.fn code, td.id code { font-size: 0.75rem; word-break: break-all; }
    .note { margin-top: 24px; padding: 12px; background: #fff8e6; border: 1px solid #e6c200; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>Shopify Content → Files — image alt text</h1>
  <div class="meta">
    <div><strong>Shop:</strong> ${esc(shop)}</div>
    <div><strong>Generated:</strong> ${esc(new Date().toISOString())}</div>
    <div><strong>Mode:</strong> ${DRY ? "DRY RUN (no API writes)" : "Applied via <code>fileUpdate</code>"}</div>
    <div><strong>Rows in this report:</strong> ${rows.length} &nbsp;|&nbsp; <strong>Skipped files:</strong> ${skipped.length}</div>
    ${errors.length ? `<div style="color:#b00020"><strong>API errors:</strong> ${esc(JSON.stringify(errors))}</div>` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>Preview (screenshot)</th>
        <th>File name (URL basename)</th>
        <th>Old alt / name</th>
        <th>New human-readable alt</th>
        <th>Shopify File GID</th>
      </tr>
    </thead>
    <tbody>
      ${htmlRows || `<tr><td colspan="5">No filename-style alts matched the heuristics.</td></tr>`}
    </tbody>
  </table>
  <p class="note">
    “Preview” loads each image from the Shopify CDN in your browser (same pixels as in Admin). Old “name” is the previous <code>alt</code> / <code>image.altText</code> when it looked auto-generated.
  </p>
</body>
</html>`;

  const htmlPath = join(reportDir, "index.html");
  writeFileSync(htmlPath, html, "utf8");

  console.error(`Wrote ${htmlPath}`);
  console.error(`Wrote ${jsonPath}`);
  console.error(JSON.stringify({ rowCount: rows.length, skipped: skipped.length, errors: errors.length, dryRun: DRY }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
