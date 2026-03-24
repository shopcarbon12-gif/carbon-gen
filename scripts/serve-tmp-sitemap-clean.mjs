/** Serves tmp-sitemap-clean on http://127.0.0.1:8765 for Playwright MCP fetch(). */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "tmp-sitemap-clean");
const port = Number(process.env.PORT || 8765);

const server = http.createServer((req, res) => {
  const name = path.basename(req.url?.split("?")[0] || "");
  if (!name || name === "/" || !/^[a-z0-9._-]+\.html$/i.test(name)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const fp = path.join(root, name);
  if (!fp.startsWith(root) || !fs.existsSync(fp)) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(fs.readFileSync(fp, "utf8"));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} at http://127.0.0.1:${port}/`);
});
