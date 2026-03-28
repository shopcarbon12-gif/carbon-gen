import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "empty-parens-fix-demo.png");

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body{font:15px system-ui,Segoe UI,sans-serif;padding:28px;background:#0f1115;color:#e8eaed;}
h1{font-size:18px;margin:0 0 16px}
.card{background:#1a1d24;border:1px solid #2a3040;border-radius:12px;padding:18px 20px;margin-bottom:14px}
.label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8b93a7;margin-bottom:8px}
.before{color:#f87171}
.after{color:#4ade80}
.muted{color:#9aa3b2}
</style></head><body>
<h1>Shopify Push catalog title — empty parentheses fix</h1>
<div class="card"><div class="label before">Before (missing handle)</div>
<div>Sample Hoodie <span class="muted"> () | Barcode: N/A</span></div></div>
<div class="card"><div class="label after">After</div>
<div>Sample Hoodie <span class="muted"> | Barcode: N/A</span></div></div>
<div class="card"><div class="label after">After (handle present)</div>
<div>Sample Hoodie <span class="muted"> (sample-hoodie) | Barcode: N/A</span></div></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 720, height: 440 });
await page.setContent(html);
await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(out);
