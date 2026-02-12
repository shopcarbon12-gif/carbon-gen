import fs from "node:fs";
import path from "node:path";

function readEnvFile() {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const text = fs.readFileSync(envPath, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const row = line.trim();
      if (!row || row.startsWith("#")) continue;
      const idx = row.indexOf("=");
      if (idx <= 0) continue;
      const key = row.slice(0, idx).trim();
      const value = row.slice(idx + 1).trim();
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function normalizeShopDomain(input) {
  const shop = String(input || "").trim().toLowerCase();
  if (!shop) return "";
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return shop;
  return "";
}

function toBool(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function expectStatus(res, expected, label) {
  if (!expected.includes(res.status)) {
    throw new Error(`${label}: expected ${expected.join("/")} got ${res.status}`);
  }
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but got non-JSON response (status ${res.status}).`);
  }
}

class Client {
  cookies = new Map();

  getCookieHeader() {
    if (!this.cookies.size) return "";
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  setCookiesFromResponse(headers) {
    const setCookie = headers.getSetCookie ? headers.getSetCookie() : [];
    for (const row of setCookie) {
      const [pair] = row.split(";");
      const idx = pair.indexOf("=");
      if (idx <= 0) continue;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      this.cookies.set(key, value);
    }
  }

  async request(baseUrl, routePath, init = {}) {
    const headers = new Headers(init.headers || {});
    const cookie = this.getCookieHeader();
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(`${baseUrl}${routePath}`, {
      ...init,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    this.setCookiesFromResponse(res.headers);
    return res;
  }
}

function logStep(text) {
  console.log(`\n[STEP] ${text}`);
}

async function main() {
  const fileEnv = readEnvFile();
  const baseUrl = String(
    process.env.SHOPIFY_SMOKE_BASE_URL ||
      process.env.E2E_BASE_URL ||
      fileEnv.SHOPIFY_SMOKE_BASE_URL ||
      "http://localhost:3001"
  )
    .trim()
    .replace(/\/+$/, "");
  const shop = normalizeShopDomain(
    process.env.SHOPIFY_SMOKE_SHOP || process.env.SHOPIFY_SHOP_DOMAIN || fileEnv.SHOPIFY_SHOP_DOMAIN
  );
  const query = String(
    process.env.SHOPIFY_SMOKE_QUERY || fileEnv.SHOPIFY_SMOKE_QUERY || ""
  ).trim();
  const runDisconnect = toBool(process.env.SHOPIFY_SMOKE_DISCONNECT);
  const password = String(process.env.APP_PASSWORD || fileEnv.APP_PASSWORD || "").trim();
  const c = new Client();

  if (!shop) {
    throw new Error(
      "Missing valid shop domain. Set SHOPIFY_SMOKE_SHOP or SHOPIFY_SHOP_DOMAIN (e.g. your-store.myshopify.com)."
    );
  }

  console.log("Shopify smoke check");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Shop: ${shop}`);

  logStep("Shopify status");
  const statusRes = await c.request(
    baseUrl,
    `/api/shopify/status?shop=${encodeURIComponent(shop)}`
  );
  expectStatus(statusRes, [200], "shopify status");
  const statusJson = await parseJsonSafe(statusRes);
  if (typeof statusJson?.connected !== "boolean") {
    throw new Error("shopify status payload missing boolean `connected`.");
  }
  console.log(
    `connected=${statusJson.connected} source=${statusJson?.source || "n/a"} reason=${statusJson?.reason || "n/a"}`
  );

  logStep("Shopify auth redirect");
  const authRes = await c.request(baseUrl, `/api/shopify/auth?shop=${encodeURIComponent(shop)}`);
  expectStatus(authRes, [302, 303, 307, 308], "shopify auth");
  const authLocation = authRes.headers.get("location") || "";
  const isOauthRedirect = authLocation.includes("/admin/oauth/authorize");
  const isDirectTokenShortcut = authLocation.includes("/settings?") && authLocation.includes("connected=1");
  if (!isOauthRedirect && !isDirectTokenShortcut) {
    throw new Error(`Unexpected auth redirect target: ${authLocation}`);
  }
  console.log(isOauthRedirect ? "OAuth redirect ready." : "Direct token shortcut mode.");

  logStep("Shopify catalog");
  const params = new URLSearchParams({ shop });
  if (query) params.set("q", query);
  const catalogRes = await c.request(baseUrl, `/api/shopify/catalog?${params.toString()}`);
  if (![200, 401].includes(catalogRes.status)) {
    const body = await catalogRes.text();
    throw new Error(
      `shopify catalog expected 200/401 got ${catalogRes.status}. body=${body.slice(0, 300)}`
    );
  }
  const catalogJson = await parseJsonSafe(catalogRes);
  const hasCatalog = catalogRes.status === 200;

  if (hasCatalog) {
    const products = Array.isArray(catalogJson?.products) ? catalogJson.products : [];
    console.log(`catalog loaded (${products.length} product(s)) source=${catalogJson?.source || "n/a"}`);
  } else {
    console.log(`catalog unauthorized: ${catalogJson?.error || "Shop not connected"}`);
  }

  // Core regression guard: if indicator says connected, catalog must not be unauthorized.
  if (statusJson.connected && !hasCatalog) {
    throw new Error(
      "Inconsistent state: status says connected but catalog returned unauthorized (401)."
    );
  }

  // Inverse inconsistency guard.
  if (!statusJson.connected && hasCatalog) {
    throw new Error(
      "Inconsistent state: status says not connected but catalog request succeeded."
    );
  }

  if (runDisconnect) {
    logStep("Optional disconnect flow");
    if (!password) {
      throw new Error(
        "SHOPIFY_SMOKE_DISCONNECT=1 requires APP_PASSWORD in environment/.env.local to authenticate."
      );
    }

    const loginRes = await c.request(baseUrl, "/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ password }),
    });
    expectStatus(loginRes, [200], "login");

    const disconnectRes = await c.request(baseUrl, "/api/shopify/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ shop }),
    });
    expectStatus(disconnectRes, [200], "disconnect");
    const disconnectJson = await parseJsonSafe(disconnectRes);
    if (!disconnectJson?.disconnected) {
      throw new Error("Disconnect endpoint did not confirm disconnection.");
    }

    const statusAfterRes = await c.request(
      baseUrl,
      `/api/shopify/status?shop=${encodeURIComponent(shop)}`
    );
    expectStatus(statusAfterRes, [200], "status after disconnect");
    const statusAfter = await parseJsonSafe(statusAfterRes);
    const fallbackEnvToken = Boolean(disconnectJson?.stillConnectedViaEnvToken);

    if (fallbackEnvToken) {
      console.log(
        "Disconnect removed DB token, but env token is still configured; status may remain connected."
      );
    } else if (statusAfter?.connected) {
      throw new Error("Expected disconnected status after disconnect, but status still reports connected.");
    }
  } else {
    console.log("\nDisconnect step skipped. Set SHOPIFY_SMOKE_DISCONNECT=1 to run it.");
  }

  console.log("\nShopify smoke check passed.");
}

main().catch((err) => {
  console.error("\nSHOPIFY SMOKE FAILED");
  console.error(err?.message || err);
  process.exit(1);
});
