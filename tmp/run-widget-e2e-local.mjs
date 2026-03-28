import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codePath = path.join(__dirname, "widget-e2e-playwright-code.txt");
const code = fs.readFileSync(codePath, "utf8");
const factory = new Function(`return (${code})`);
const runSuite = factory();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  const report = await runSuite(page);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
