import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(__dirname, "widget-e2e-playwright-code.txt"), "utf8");
fs.writeFileSync(path.join(__dirname, "mcp-widget-browser-run-code.json"), JSON.stringify({ code }));
