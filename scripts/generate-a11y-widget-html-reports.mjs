/**
 * Production verification: shopcarbon.com + app.shopcarbon.com/accessibility.
 * - Optional login for app via /api/login (APP_PASSWORD + username in .env.local).
 * - Writes PNGs + two standalone HTML reports under reports/a11y-html-verification-<stamp>/
 *
 * Usage: node scripts/generate-a11y-widget-html-reports.mjs
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

/** Keep in sync with `lib/carbon-a11y-widget-rev.ts` (single source in the app). */
function readRepoWidgetWrev() {
  const p = join(REPO, "lib", "carbon-a11y-widget-rev.ts");
  if (!existsSync(p)) return 126;
  const t = readFileSync(p, "utf8");
  const m = t.match(/CARBON_A11Y_WIDGET_WREV\s*=\s*(\d+)/);
  return m ? Number(m[1]) : 126;
}

const REPO_WREV = readRepoWidgetWrev();

function loadEnvLocal() {
  const p = join(REPO, ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const row = line.trim();
    if (!row || row.startsWith("#")) continue;
    const i = row.indexOf("=");
    if (i <= 0) continue;
    out[row.slice(0, i).trim()] = row.slice(i + 1).trim();
  }
  return out;
}

const envFile = loadEnvLocal();
const env = (k, d = "") => (process.env[k] || envFile[k] || d).trim();

const APP_BASE = env("A11Y_REPORT_APP_URL", "https://app.shopcarbon.com").replace(/\/$/, "");
const STORE_URL = env("A11Y_REPORT_STORE_URL", "https://shopcarbon.com/");

const APP_PASSWORD = env("APP_PASSWORD");
const APP_USERNAME = (
  env("APP_DEFAULT_LOGIN_USERNAME") ||
  env("APP_ADMIN_USERNAME") ||
  "admin"
).toLowerCase();

const STAMP = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const OUT = join(REPO, "reports", `a11y-html-verification-${STAMP}`);

const CONTRAST = ["none", "dark", "light", "invert", "smart"];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hostEval(page, fn, arg) {
  const host = page.locator("#carbon-a11y-widget");
  if ((await host.count()) === 0) return { ok: false, result: null };
  const result = await host.evaluate(fn, arg);
  return { ok: true, result };
}

async function widgetLoaded(page) {
  const { ok, result } = await hostEval(page, (h) => Boolean(h?.shadowRoot));
  return ok && result;
}

async function openPanel(page) {
  const { ok, result } = await hostEval(page, (h) => {
    const btn = h.shadowRoot?.querySelector("button.ca-assist-launcher");
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(600);
  return ok && result;
}

async function closePanel(page) {
  await hostEval(page, (h) => {
    h.shadowRoot?.querySelector("#ca-assist-close")?.click();
  });
  await page.waitForTimeout(350);
}

async function clickContrast(page, mode) {
  const sel = `[data-carbon-key="rg-contrast-${mode}"]`;
  const { ok, result } = await hostEval(page, (h, selector) => {
    const el = h.shadowRoot?.querySelector(selector);
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", behavior: "instant" });
    } catch {
      /* ignore */
    }
    el.click();
    return true;
  }, sel);
  await page.waitForTimeout(500);
  return ok && result;
}

async function probeWidget(page) {
  const scriptSrc = await page.evaluate(() => {
    const s = document.querySelector('script[src*="app.shopcarbon.com/accessibility/widget"]');
    return s ? s.src : "";
  });
  const rev = await page.evaluate(() => window.__carbonA11yRev);
  const bodyFilter = await page.evaluate(() => {
    const f = document.body?.style?.filter || "";
    return f || "(none)";
  });
  return { scriptSrc, rev, bodyFilter };
}

async function shot(page, name) {
  const file = `${name}.png`;
  const abs = join(OUT, file);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: abs, type: "png", fullPage: false });
  return file;
}

async function runStorefront(browser) {
  const items = [];
  const meta = { probes: [] };

  async function runViewport(label, w, h, prefix) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, locale: "en-US" });
    const page = await context.newPage();
    try {
      await page.goto(STORE_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(2500);
      if (!(await widgetLoaded(page))) {
        items.push({
          title: `${label}: widget host missing`,
          file: await shot(page, `${prefix}-00-no-widget`),
          note: "#carbon-a11y-widget not found after load",
        });
        meta.probes.push({ label: `${label} probe`, ...(await probeWidget(page)) });
        return;
      }

      items.push({
        title: `${label}: Home (launcher closed)`,
        file: await shot(page, `${prefix}-01-closed`),
        note: "Storefront before opening panel",
      });
      meta.probes.push({ label: `${label} (closed)`, ...(await probeWidget(page)) });

      await openPanel(page);
      items.push({
        title: `${label}: Panel open`,
        file: await shot(page, `${prefix}-02-panel-open`),
        note: "Assist panel expanded",
      });

      for (const mode of CONTRAST) {
        const clicked = await clickContrast(page, mode);
        items.push({
          title: `${label}: Contrast — ${mode}`,
          file: await shot(page, `${prefix}-03-contrast-${mode}`),
          note: clicked ? "Radio activated" : "Control missing",
        });
      }

      await clickContrast(page, "none");
      await page.waitForTimeout(400);
      items.push({
        title: `${label}: Contrast reset (none)`,
        file: await shot(page, `${prefix}-04-contrast-reset-none`),
        note: "Back to none",
      });

      meta.probes.push({ label: `${label} (after reset)`, ...(await probeWidget(page)) });

      await closePanel(page);
    } finally {
      await context.close();
    }
  }

  await runViewport("Mobile", 390, 844, "shopcarbon-mobile");
  await runViewport("Desktop", 1360, 820, "shopcarbon-desktop");

  return { items, meta };
}

function parseSetCookieLines(res) {
  const h = res.headers;
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const single = h.get("set-cookie");
  return single ? [single] : [];
}

async function loginAppContext(context) {
  if (!APP_PASSWORD) return false;
  const res = await fetch(`${APP_BASE}/api/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ username: APP_USERNAME, password: APP_PASSWORD }),
  });
  if (!res.ok) return false;
  const host = new URL(APP_BASE).hostname;
  const cookies = [];
  for (const line of parseSetCookieLines(res)) {
    const [pair, ...attrs] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    let domain = host;
    let path = "/";
    let httpOnly = false;
    let secure = true;
    let sameSite = "Lax";
    for (const a of attrs) {
      const [k, v] = a.trim().split("=").map((x) => x.trim());
      const kl = k.toLowerCase();
      if (kl === "domain" && v) domain = v.replace(/^\./, "");
      if (kl === "path" && v) path = v;
      if (kl === "httponly") httpOnly = true;
      if (kl === "secure") secure = true;
      if (kl === "samesite" && v) sameSite = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
    }
    cookies.push({ name, value, domain, path, httpOnly, secure, sameSite });
  }
  if (!cookies.length) return false;
  await context.addCookies(cookies);
  return true;
}

async function clickVisibleMainTab(page, label) {
  await page.evaluate((tabLabel) => {
    const buttons = Array.from(document.querySelectorAll("main button")).filter(
      (b) => (b.textContent || "").trim() === tabLabel,
    );
    const visible = buttons.find((b) => {
      const el = /** @type {HTMLElement} */ (b);
      return el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden";
    });
    (visible || buttons[buttons.length - 1])?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, label);
  await page.waitForTimeout(600);
}

async function runApp(browser) {
  const items = [];
  const meta = {
    loginOk: false,
    bundleRev: "",
    wrevInPage: "",
    wrevFromDom: "",
    snippetTitlesCheck: "",
    probes: null,
  };

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  try {
    meta.loginOk = await loginAppContext(context);
    if (!meta.loginOk) {
      items.push({
        title: "App: login skipped or failed",
        file: "",
        note: APP_PASSWORD
          ? "POST /api/login did not return OK — check APP_PASSWORD / username in .env.local"
          : "Set APP_PASSWORD in .env.local to capture authenticated studio screenshots",
      });
      return { items, meta };
    }

    const page = await context.newPage();
    await page.goto(`${APP_BASE}/accessibility`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2000);

    items.push({
      title: "App: /accessibility initial load",
      file: await shot(page, "app-01-accessibility-load"),
      note: "Studio shell after navigation",
    });

    for (const tab of ["Docs", "Tickets", "Log History", "Widget"]) {
      await clickVisibleMainTab(page, tab);
      items.push({
        title: `App: Tab — ${tab}`,
        file: await shot(page, `app-02-tab-${tab.toLowerCase().replace(/\s+/g, "-")}`),
        note: "Visible tab strip",
      });
    }

    await clickVisibleMainTab(page, "Docs");
    await page.locator("#snippets").scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    items.push({
      title: "App: Installation snippets section",
      file: await shot(page, "app-03-section-snippets"),
      note: "Docs tab · #snippets",
    });

    meta.wrevFromDom = (await page.locator("#snippets").getAttribute("data-carbon-widget-wrev")) || "";
    const repoStr = String(REPO_WREV);
    if (!meta.wrevFromDom) {
      meta.wrevInPage = `MISSING #snippets[data-carbon-widget-wrev] — deploy app (repo=${repoStr})`;
    } else if (meta.wrevFromDom !== repoStr) {
      meta.wrevInPage = `MISMATCH DOM=${meta.wrevFromDom} vs repo=${repoStr}`;
    } else {
      meta.wrevInPage = `${meta.wrevFromDom} (DOM matches lib/carbon-a11y-widget-rev.ts)`;
    }

    meta.snippetTitlesCheck = await page.evaluate((expected) => {
      const sec = document.getElementById("snippets");
      if (!sec) return "no #snippets";
      const titled = [...sec.querySelectorAll("[title]")].filter((el) => {
        const t = el.getAttribute("title") || "";
        return t.includes("accessibility/widget");
      });
      if (titled.length < 1) return "no snippet boxes with full script in title";
      const exp = `wrev=${expected}`;
      const bad = titled.filter((el) => !(el.getAttribute("title") || "").includes(exp));
      if (bad.length) return `title missing ${exp} on ${bad.length} node(s)`;
      return `ok (${titled.length} box(es), title includes ${exp})`;
    }, repoStr);

    const bundleRes = await page.request.get(
      `${APP_BASE}/accessibility/widget?scope=default&wrev=${REPO_WREV}&_=${Date.now()}`,
    );
    const bundleText = bundleRes.ok() ? await bundleRes.text() : "";
    const m = bundleText.match(/__caRev=(\d+)/);
    meta.bundleRev = m ? m[1] : bundleText ? "(parse fail)" : "fetch failed";

    await clickVisibleMainTab(page, "Widget");
    await page.locator("#widget-surface").getByRole("button", { name: /Open Preview|Reload Preview/ }).click({
      timeout: 20000,
    });
    await page.waitForTimeout(3500);
    items.push({
      title: "App: Live widget preview mounted",
      file: await shot(page, "app-04-preview-mounted"),
      note: "After Open Preview / Reload Preview",
    });

    if (await widgetLoaded(page)) {
      await openPanel(page);
      items.push({
        title: "App: Preview — panel open",
        file: await shot(page, "app-05-preview-panel-open"),
        note: "Same shadow DOM as storefront",
      });

      for (const mode of CONTRAST) {
        const clicked = await clickContrast(page, mode);
        items.push({
          title: `App: Preview — contrast ${mode}`,
          file: await shot(page, `app-06-preview-contrast-${mode}`),
          note: clicked ? "Studio embedded widget" : "missing control",
        });
      }
      await clickContrast(page, "none");
      await page.waitForTimeout(350);
      items.push({
        title: "App: Preview — contrast reset",
        file: await shot(page, "app-07-preview-contrast-reset"),
        note: "none",
      });
      meta.probes = await probeWidget(page);
    } else {
      items.push({
        title: "App: Preview widget host not found",
        file: await shot(page, "app-05-preview-no-host"),
        note: "Expected #carbon-a11y-widget after preview",
      });
    }
  } finally {
    await context.close();
  }

  return { items, meta };
}

function writeReportHtml(filename, title, subtitle, items, extraHtml) {
  const figures = items
    .filter((i) => i.file)
    .map(
      (i) => `
  <figure class="shot">
    <figcaption><strong>${escapeHtml(i.title)}</strong>${i.note ? ` — <span class="note">${escapeHtml(i.note)}</span>` : ""}</figcaption>
    <a href="${escapeHtml(i.file)}" target="_blank" rel="noopener"><img src="${escapeHtml(i.file)}" alt="" loading="lazy" /></a>
  </figure>`,
    )
    .join("\n");

  const noImg = items
    .filter((i) => !i.file)
    .map((i) => `<p class="warn"><strong>${escapeHtml(i.title)}</strong> — ${escapeHtml(i.note)}</p>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { font-family: "Segoe UI", system-ui, sans-serif; background: #0f1419; color: #e7edf4; }
    body { max-width: 1100px; margin: 0 auto; padding: 24px; line-height: 1.5; }
    h1 { font-size: 1.5rem; margin-top: 0; }
    .sub { opacity: 0.85; margin-bottom: 1.5rem; }
    .meta { background: #1a2332; padding: 16px; border-radius: 10px; margin-bottom: 24px; font-size: 0.9rem; white-space: pre-wrap; word-break: break-all; }
    .shot { margin: 0 0 2rem; }
    .shot figcaption { margin-bottom: 8px; font-size: 0.95rem; }
    .shot .note { opacity: 0.85; font-weight: normal; }
    .shot img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #2a3545; }
    .warn { color: #f5b041; }
    a { color: #7ec8e3; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(subtitle)}</p>
  ${extraHtml ? `<div class="meta">${extraHtml}</div>` : ""}
  ${noImg}
  ${figures}
</body>
</html>`;
  writeFileSync(join(OUT, filename), html, "utf8");
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const storefront = await runStorefront(browser);
  const app = await runApp(browser);
  await browser.close();

  const sfMeta = storefront.meta.probes
    .map(
      (p) =>
        `${p.label}\n  script src: ${p.scriptSrc || "(none)"}\n  __carbonA11yRev: ${p.rev ?? "(undefined)"}\n  body filter: ${p.bodyFilter}\n`,
    )
    .join("\n");

  writeReportHtml(
    "shopcarbon-report.html",
    "shopcarbon.com — Carbon Assist verification",
    `Generated ${new Date().toISOString()} · ${STORE_URL}`,
    storefront.items,
    escapeHtml(sfMeta),
  );

  const appExtra = [
    `Login: ${app.meta.loginOk ? "OK" : "failed or skipped"}`,
    `Repo wrev (lib/carbon-a11y-widget-rev.ts): ${REPO_WREV}`,
    `#snippets[data-carbon-widget-wrev]: ${app.meta.wrevFromDom || "(absent)"}`,
    `Studio wrev summary: ${app.meta.wrevInPage || "—"}`,
    `Snippet box title=full-script check: ${app.meta.snippetTitlesCheck || "—"}`,
    `Bundle fetch __caRev: ${app.meta.bundleRev}`,
    app.meta.probes
      ? `After preview:\n  script: ${app.meta.probes.scriptSrc}\n  __carbonA11yRev: ${app.meta.probes.rev}\n  body filter: ${app.meta.probes.bodyFilter}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  writeReportHtml(
    "app-shopcarbon-accessibility-report.html",
    "app.shopcarbon.com/accessibility — studio verification",
    `Generated ${new Date().toISOString()} · ${APP_BASE}/accessibility`,
    app.items,
    escapeHtml(appExtra),
  );

  writeFileSync(
    join(OUT, "README.txt"),
    `Open in browser:\n- shopcarbon-report.html\n- app-shopcarbon-accessibility-report.html\n\nFolder: ${OUT}\n`,
    "utf8",
  );

  const verification = buildVerification(storefront, app);
  writeFileSync(join(OUT, "verification.json"), JSON.stringify(verification, null, 2), "utf8");
  writeFileSync(join(REPO, "reports", ".last-a11y-verification-dir.txt"), OUT, "utf8");

  console.log("Wrote reports under", OUT);
  console.log(verification.ok ? "VERIFICATION: PASS" : "VERIFICATION: FAIL");
  if (!verification.ok) console.log(verification.errors.join("\n"));
  process.exit(verification.ok ? 0 : 1);
}

/** @param {{ items: unknown[], meta: { probes: unknown[] } }} storefront */
/** @param {{ meta: Record<string, unknown>, items: { note?: string, title?: string }[] }} app */
function buildVerification(storefront, app) {
  const wrevStr = String(REPO_WREV);
  /** @type {string[]} */
  const errors = [];

  if (!APP_PASSWORD) {
    errors.push("APP_PASSWORD missing in .env.local (required for full studio gate)");
  } else if (!app.meta.loginOk) {
    errors.push("App /api/login failed — check APP_PASSWORD / username");
  }

  if (app.meta.wrevFromDom !== wrevStr) {
    errors.push(
      `#snippets[data-carbon-widget-wrev]: got "${app.meta.wrevFromDom || ""}" want "${wrevStr}"`,
    );
  }

  const titleCheck = String(app.meta.snippetTitlesCheck || "");
  if (!titleCheck.startsWith("ok")) {
    errors.push(`Snippet box title check: ${titleCheck || "(empty)"}`);
  }

  if (String(app.meta.bundleRev) !== wrevStr) {
    errors.push(`Fetched widget bundle __caRev: got "${app.meta.bundleRev}" want "${wrevStr}"`);
  }

  const prev = app.meta.probes;
  if (!prev) {
    errors.push("Studio preview: no widget probe (preview host or login issue)");
  } else if (Number(prev.rev) !== REPO_WREV) {
    errors.push(`After studio preview window.__carbonA11yRev: got ${prev.rev} want ${REPO_WREV}`);
  }

  for (const p of storefront.meta.probes) {
    const src = String(p.scriptSrc || "");
    if (!src.includes(`wrev=${wrevStr}`)) {
      errors.push(`Storefront [${p.label}]: script URL missing wrev=${wrevStr} (${src || "empty"})`);
    }
    if (p.rev !== undefined && Number(p.rev) !== REPO_WREV) {
      errors.push(`Storefront [${p.label}]: __carbonA11yRev got ${p.rev} want ${REPO_WREV}`);
    }
  }

  for (const it of storefront.items) {
    if (String(it.title || "").includes("widget host missing")) {
      errors.push(`Storefront: ${it.title}`);
    }
    if (String(it.note || "") === "Control missing") {
      errors.push(`Storefront contrast/control: ${it.title}`);
    }
  }

  for (const it of app.items) {
    if (String(it.note || "") === "missing control") {
      errors.push(`App preview: ${it.title}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    repoWrev: REPO_WREV,
    outDir: OUT,
    generatedAt: new Date().toISOString(),
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
