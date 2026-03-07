import { chromium } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BASE_URL = String(process.env.BRIDGE_BASE_URL || "https://app.shopcarbon.com").trim().replace(/\/+$/, "");
const CRON_SECRET = String(process.env.CRON_SECRET || "").trim();
const WORKER_ID = String(process.env.SHOPIFY_PRINT_BRIDGE_WORKER_ID || `bridge-${os.hostname()}`).trim();
const POLL_MS = Number.parseInt(String(process.env.SHOPIFY_PRINT_BRIDGE_POLL_MS || "4000"), 10) || 4000;
const HEADLESS = String(process.env.SHOPIFY_PRINT_BRIDGE_HEADLESS || "true").trim().toLowerCase() !== "false";
const STORE_HANDLE = String(process.env.SHOPIFY_ADMIN_STORE_HANDLE || "shopcarbon").trim();
const USER_DATA_DIR = String(
  process.env.SHOPIFY_PRINT_BRIDGE_USER_DATA_DIR ||
    path.join(process.cwd(), ".bridge", "playwright-user-data")
).trim();
const PRINTNODE_API_KEY = String(process.env.PRINTNODE_API_KEY || "").trim();
const PRINTNODE_PRINTER_ID = Number.parseInt(String(process.env.PRINTNODE_PRINTER_ID || "0"), 10) || 0;
const PRINTNODE_COPIES = Math.min(5, Math.max(1, Number.parseInt(String(process.env.PRINTNODE_COPIES || "1"), 10) || 1));

if (!CRON_SECRET) {
  console.error("[bridge] Missing CRON_SECRET");
  process.exit(1);
}
if (!PRINTNODE_API_KEY || !PRINTNODE_PRINTER_ID) {
  console.error("[bridge] Missing PRINTNODE_API_KEY or PRINTNODE_PRINTER_ID");
  process.exit(1);
}
if (/YOUR_PRINTNODE_API_KEY/i.test(PRINTNODE_API_KEY)) {
  console.error("[bridge] PRINTNODE_API_KEY is still placeholder text. Set your real key.");
  process.exit(1);
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${CRON_SECRET}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function claimJob() {
  const res = await fetch(`${BASE_URL}/api/shopify/printer/bridge/claim`, {
    method: "POST",
    headers: authHeaders({ "x-worker-id": WORKER_ID }),
    body: JSON.stringify({ workerId: WORKER_ID }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Claim failed (${res.status})`);
  return json?.job || null;
}

async function completeJob({ id, success, error }) {
  const res = await fetch(`${BASE_URL}/api/shopify/printer/bridge/complete`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ id, success: success === true, error: String(error || "") }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Complete failed (${res.status})`);
}

function orderAdminUrl(orderId) {
  return `https://admin.shopify.com/store/${encodeURIComponent(STORE_HANDLE)}/orders/${encodeURIComponent(String(orderId || ""))}`;
}

function isLoginUrl(url) {
  return /accounts\.shopify\.com|\/auth\/login|\/account\/login/i.test(String(url || ""));
}

async function ensureAuthenticated(context) {
  const target = `https://admin.shopify.com/store/${encodeURIComponent(STORE_HANDLE)}/orders`;
  let loginPromptShown = false;
  const started = Date.now();
  let page = context.pages()[0] || null;
  while (Date.now() - started < 10 * 60 * 1000) {
    try {
      if (!page || page.isClosed()) {
        page = await context.newPage();
      }
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1200));
      if (!isLoginUrl(page.url())) return;
      if (!loginPromptShown) {
        console.log("[bridge] Shopify login required. Please complete login in the opened browser window.");
        loginPromptShown = true;
      }
      // Keep the login page open so the user can finish auth/MFA.
      await new Promise((r) => setTimeout(r, 2500));
    } catch {
      // Browser/page can be closed by user while signing in; keep waiting.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("Shopify login was not completed within timeout.");
}

async function sendPdfToPrintNode(pdfBytes, title) {
  const auth = Buffer.from(`${PRINTNODE_API_KEY}:`).toString("base64");
  const content = Buffer.from(pdfBytes).toString("base64");
  for (let i = 0; i < PRINTNODE_COPIES; i += 1) {
    const res = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        printerId: PRINTNODE_PRINTER_ID,
        title: title || "Shopify shipping label",
        contentType: "pdf_base64",
        content,
        source: "Carbon Shopify Print Bridge",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || body?.error || `PrintNode error (${res.status})`);
  }
}

async function captureLabelPdfBytes(page, orderId) {
  const tmpDir = path.join(process.cwd(), ".bridge", "downloads");
  await fs.mkdir(tmpDir, { recursive: true });

  const waitDownload = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
  const waitPopup = page.context().waitForEvent("page", { timeout: 15000 }).catch(() => null);
  const pdfResponsePromise = page.waitForResponse(
    (resp) => {
      const ct = String(resp.headers()["content-type"] || "").toLowerCase();
      return ct.includes("application/pdf");
    },
    { timeout: 15000 }
  ).catch(() => null);

  const clickPrintAction = async () => {
    const directButton = page.getByRole("button", { name: /print label|print shipping label/i }).first();
    if (await directButton.count()) {
      await directButton.click({ timeout: 10000 });
      return true;
    }

    const directLink = page.getByRole("link", { name: /print label|print shipping label/i }).first();
    if (await directLink.count()) {
      await directLink.click({ timeout: 10000 });
      return true;
    }

    const moreActions = page.getByRole("button", { name: /more actions|more/i }).first();
    if (await moreActions.count()) {
      await moreActions.click({ timeout: 8000 }).catch(() => {});
      const menuPrint = page.getByRole("menuitem", { name: /print label|print shipping label/i }).first();
      if (await menuPrint.count()) {
        await menuPrint.click({ timeout: 8000 });
        return true;
      }
      const menuPrintButton = page.locator("[role='menu'] button, [role='menu'] a").filter({ hasText: /print label/i }).first();
      if (await menuPrintButton.count()) {
        await menuPrintButton.click({ timeout: 8000 });
        return true;
      }
    }

    const hrefPrint = page.locator("a[href*='shipping_labels'], a[href*='print']").filter({ hasText: /print/i }).first();
    if (await hrefPrint.count()) {
      await hrefPrint.click({ timeout: 10000 });
      return true;
    }

    return false;
  };

  const clicked = await clickPrintAction();
  if (!clicked) {
    const debugDir = path.join(process.cwd(), ".bridge", "debug");
    await fs.mkdir(debugDir, { recursive: true });
    const png = path.join(debugDir, `print-action-missing-${orderId}-${Date.now()}.png`);
    const html = path.join(debugDir, `print-action-missing-${orderId}-${Date.now()}.html`);
    await page.screenshot({ path: png, fullPage: true }).catch(() => {});
    await fs.writeFile(html, await page.content(), "utf8").catch(() => {});
    throw new Error(`Print label action not found. Debug saved: ${png}`);
  }

  const download = await waitDownload;
  if (download) {
    const filePath = path.join(tmpDir, `${orderId}-${Date.now()}.pdf`);
    await download.saveAs(filePath);
    return fs.readFile(filePath);
  }

  const popup = await waitPopup;
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    const popupUrl = popup.url();
    if (/\.pdf(\?|$)/i.test(popupUrl) || popupUrl.includes("shipping_labels")) {
      const response = await popup.request.get(popupUrl);
      if (response.ok()) {
        const bytes = await response.body();
        await popup.close().catch(() => {});
        return bytes;
      }
    }
  }

  const pdfResponse = await pdfResponsePromise;
  if (pdfResponse) {
    const bytes = await pdfResponse.body();
    if (bytes && bytes.length > 100) return bytes;
  }

  throw new Error("Could not capture PDF from Shopify print action.");
}

async function openShippingLabelsAndPrint(page, job) {
  await page.goto(`https://admin.shopify.com/store/${encodeURIComponent(STORE_HANDLE)}/shipping_labels`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(1200);

  const q = String(job.trackingNumber || job.orderName || job.orderId || "").trim();
  const search = page.getByRole("searchbox").first();
  if (q && (await search.count())) {
    await search.click({ timeout: 6000 }).catch(() => {});
    await search.fill(q).catch(() => {});
    await search.press("Enter").catch(() => {});
    await page.waitForTimeout(1200);
  }

  const openCandidate = page.getByText(new RegExp(`${job.trackingNumber || job.orderName || job.orderId}`, "i")).first();
  if (await openCandidate.count()) {
    await openCandidate.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  const printBtn = page.getByRole("button", { name: /print 1 shipping label|print shipping label|print label/i }).first();
  if (await printBtn.count()) {
    await printBtn.click({ timeout: 8000 });
    return true;
  }
  return false;
}

async function processJob(context, job) {
  const page = await context.newPage();
  try {
    const url = orderAdminUrl(job.orderId);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    const currentUrl = page.url();
    if (isLoginUrl(currentUrl)) {
      throw new Error("AUTH_REQUIRED: Shopify admin login required in bridge browser profile.");
    }
    let pdfBytes;
    try {
      pdfBytes = await captureLabelPdfBytes(page, job.orderId);
    } catch (primaryErr) {
      const fallbackWorked = await openShippingLabelsAndPrint(page, job).catch(() => false);
      if (!fallbackWorked) throw primaryErr;
      const r = await page.waitForResponse(
        (resp) => String(resp.headers()["content-type"] || "").toLowerCase().includes("application/pdf"),
        { timeout: 15000 }
      ).catch(() => null);
      if (!r) throw primaryErr;
      pdfBytes = await r.body();
    }
    await sendPdfToPrintNode(pdfBytes, `Shopify ${job.orderName || job.orderId}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function createContext() {
  await fs.mkdir(USER_DATA_DIR, { recursive: true });
  return chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS,
    acceptDownloads: true,
    viewport: { width: 1360, height: 900 },
  });
}

async function main() {
  let context = null;
  console.log(`[bridge] started worker=${WORKER_ID} base=${BASE_URL}`);
  console.log("[bridge] if first run, sign into Shopify admin in opened browser profile.");

  for (;;) {
    try {
      if (!context) {
        context = await createContext();
      }
      await ensureAuthenticated(context);
      const job = await claimJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      try {
        await processJob(context, job);
        await completeJob({ id: job.id, success: true });
        console.log(`[bridge] done order=${job.orderId} tracking=${job.trackingNumber || "-"}`);
      } catch (err) {
        const msg = String(err?.message || err);
        await completeJob({ id: job.id, success: false, error: msg });
        console.error(`[bridge] failed order=${job.orderId}: ${msg}`);
        if (/AUTH_REQUIRED/i.test(msg)) {
          await ensureAuthenticated(context);
        }
        if (/context or browser has been closed|target page, context or browser has been closed/i.test(msg)) {
          try {
            await context.close().catch(() => {});
          } catch {}
          context = null;
          console.log("[bridge] browser context recreated after close/crash.");
        }
      }
    } catch (err) {
      console.error(`[bridge] loop error: ${String(err?.message || err)}`);
      if (context) {
        try {
          await context.close().catch(() => {});
        } catch {}
        context = null;
      }
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
    }
  }
}

main().catch((err) => {
  console.error(`[bridge] fatal: ${String(err?.message || err)}`);
  process.exit(1);
});
