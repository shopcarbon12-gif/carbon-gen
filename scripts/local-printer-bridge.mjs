import http from "node:http";
import net from "node:net";

const HOST = process.env.PRINTER_BRIDGE_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PRINTER_BRIDGE_PORT || "18181", 10) || 18181;
const SOCKET_TIMEOUT_MS = Number.parseInt(process.env.PRINTER_BRIDGE_SOCKET_TIMEOUT_MS || "5000", 10) || 5000;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  setCors(res);
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function writeToSocket({ ip, port, zpl }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(zpl, "utf8", () => socket.end());
    });

    socket.setTimeout(SOCKET_TIMEOUT_MS);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Socket timeout ${ip}:${port}`));
    });
    socket.on("error", (err) => reject(err));
    socket.on("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/print") {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const ip = String(body.ip || "").trim();
    const port = Number.parseInt(String(body.port || "9100"), 10) || 9100;
    const zpl = String(body.zpl || "");

    if (!ip) {
      sendJson(res, 400, { ok: false, error: "Missing printer ip" });
      return;
    }
    if (!zpl.trim()) {
      sendJson(res, 400, { ok: false, error: "Missing zpl payload" });
      return;
    }

    await writeToSocket({ ip, port, zpl });
    sendJson(res, 200, { ok: true, ip, port });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[printer-bridge] listening on http://${HOST}:${PORT}/print`);
  console.log("[printer-bridge] forwarding ZPL to raw socket printer endpoints");
});
