import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const targets = [
  { name: "local", url: "http://localhost:3000/studio/shopify-collection-mapping?shop=30e7d3.myshopify.com" },
  { name: "prod", url: "https://app.shopcarbon.com/studio/shopify-collection-mapping?shop=30e7d3.myshopify.com" },
];

async function collect(page, target, round) {
  const out = {
    target: target.name,
    url: target.url,
    round,
    ok: false,
    gotoStatus: null,
    finalUrl: "",
    title: "",
    heading: "",
    metrics: {},
    style: {},
    consoleErrors: [],
    pageErrors: [],
    notes: [],
    screenshot: "",
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") out.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    out.pageErrors.push(err?.message || String(err));
  });

  try {
    const resp = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    out.gotoStatus = resp ? resp.status() : null;
    await page.waitForTimeout(10000);

    out.finalUrl = page.url();
    out.title = await page.title();

    const headingLoc = page.locator("h1").first();
    out.heading = (await headingLoc.count()) > 0 ? ((await headingLoc.textContent()) || "").trim() : "";

    const metricData = await page.evaluate(() => {
      const qa = (sel) => Array.from(document.querySelectorAll(sel));
      const byText = (tag, text) =>
        qa(tag).filter((n) => (n.textContent || "").toLowerCase().includes(text.toLowerCase()));

      const rowCount = qa(".treeRow").length;
      const nodeCount = qa(".treeNode").length;
      const saveBtnCount = byText("button", "save").length;
      const undoBtnCount = byText("button", "undo").length;
      const searchInputs = qa("input").filter((n) =>
        (n.getAttribute("placeholder") || "").toLowerCase().includes("search menu")
      ).length;
      const eyeBtnCount = qa("button").filter((n) => {
        const a = (n.getAttribute("aria-label") || "").toLowerCase();
        const t = (n.getAttribute("title") || "").toLowerCase();
        return a.includes("visible") || a.includes("hidden") || t.includes("visible") || t.includes("hidden");
      }).length;

      return { rowCount, nodeCount, saveBtnCount, undoBtnCount, searchInputs, eyeBtnCount };
    });
    out.metrics = metricData;

    const styleData = await page.evaluate(() => {
      function style(sel) {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          width: s.width,
          height: s.height,
          display: s.display,
          position: s.position,
          color: s.color,
          backgroundColor: s.backgroundColor,
          fontSize: s.fontSize,
          borderRadius: s.borderRadius,
          zIndex: s.zIndex,
        };
      }
      return {
        searchBar: style(".treeSearchBar"),
        undoBtn: style(".treeUndoBtn"),
        saveBtn: style(".treeSaveBtn"),
        paneDivider: style(".paneDivider"),
        firstTreeRow: style(".treeRow"),
      };
    });
    out.style = styleData;

    if (out.finalUrl.includes("/login")) out.notes.push("Redirected to login");
    if ((out.metrics.rowCount || 0) < 1) out.notes.push("No tree rows detected");

    const shot = `tmp-compare-${target.name}-round${round}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    out.screenshot = shot;
    out.ok = true;
  } catch (err) {
    out.notes.push(`collect_error:${err?.message || String(err)}`);
  }

  return out;
}

function compare(local, prod) {
  const diff = {
    round: local.round,
    sameHeading: local.heading === prod.heading,
    sameFinalPath: false,
    metricDelta: {},
    majorFindings: [],
  };

  try {
    diff.sameFinalPath = new URL(local.finalUrl).pathname === new URL(prod.finalUrl).pathname;
  } catch {
    diff.sameFinalPath = false;
  }

  const keys = ["rowCount", "nodeCount", "saveBtnCount", "undoBtnCount", "searchInputs", "eyeBtnCount"];
  for (const k of keys) {
    const lv = local.metrics?.[k] ?? null;
    const pv = prod.metrics?.[k] ?? null;
    diff.metricDelta[k] = {
      local: lv,
      prod: pv,
      delta: typeof lv === "number" && typeof pv === "number" ? pv - lv : null,
    };
  }

  if ((prod.metrics?.rowCount ?? 0) < 1 && (local.metrics?.rowCount ?? 0) > 0) {
    diff.majorFindings.push("Prod missing tree rows while local has rows");
  }
  if (prod.finalUrl.includes("/login")) diff.majorFindings.push("Prod redirected to login");
  if ((prod.metrics?.undoBtnCount ?? 0) === 0) diff.majorFindings.push("Prod missing Undo button");
  if ((prod.metrics?.saveBtnCount ?? 0) === 0) diff.majorFindings.push("Prod missing Save button");

  const styleKeys = ["searchBar", "undoBtn", "saveBtn", "paneDivider", "firstTreeRow"];
  for (const sk of styleKeys) {
    const l = local.style?.[sk];
    const p = prod.style?.[sk];
    if (!l || !p) continue;
    if (l.height !== p.height || l.fontSize !== p.fontSize || l.backgroundColor !== p.backgroundColor) {
      diff.majorFindings.push(
        `${sk} style mismatch (height ${l.height} vs ${p.height}, font ${l.fontSize} vs ${p.fontSize})`
      );
    }
  }

  return diff;
}

const browser = await chromium.launch({ headless: true });
const report = { generatedAt: new Date().toISOString(), rounds: [], summary: {} };

for (let round = 1; round <= 2; round++) {
  const roundResults = [];
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
    const res = await collect(page, t, round);
    roundResults.push(res);
    await page.close();
  }
  const local = roundResults.find((x) => x.target === "local");
  const prod = roundResults.find((x) => x.target === "prod");
  report.rounds.push({ round, local, prod, comparison: compare(local, prod) });
}

const major = report.rounds.flatMap((r) => r.comparison.majorFindings);
report.summary = {
  roundsExecuted: report.rounds.length,
  majorFindings: major,
  allMajorFindingsIdenticalAcrossRounds:
    report.rounds.length === 2 &&
    JSON.stringify(report.rounds[0].comparison.majorFindings) === JSON.stringify(report.rounds[1].comparison.majorFindings),
};

const outPath = path.resolve(process.cwd(), "tmp-local-vs-prod-report.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));

await browser.close();
