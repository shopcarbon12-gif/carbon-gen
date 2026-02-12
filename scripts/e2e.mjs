import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3010";

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

const fileEnv = readEnvFile();
const password = (process.env.APP_PASSWORD || fileEnv.APP_PASSWORD || "").trim();
const username = (
  process.env.APP_DEFAULT_LOGIN_USERNAME ||
  process.env.APP_ADMIN_USERNAME ||
  fileEnv.APP_DEFAULT_LOGIN_USERNAME ||
  fileEnv.APP_ADMIN_USERNAME ||
  "admin"
)
  .trim()
  .toLowerCase();
const shop = (process.env.SHOPIFY_SHOP_DOMAIN || fileEnv.SHOPIFY_SHOP_DOMAIN || "")
  .trim()
  .toLowerCase();

if (!password) {
  console.error("E2E requires APP_PASSWORD in environment.");
  process.exit(1);
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

  async request(path, init = {}) {
    const headers = new Headers(init.headers || {});
    const cookie = this.getCookieHeader();
    if (cookie) headers.set("cookie", cookie);
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(70000),
    });
    this.setCookiesFromResponse(res.headers);
    return res;
  }
}

function logStep(name) {
  console.log(`\n[STEP] ${name}`);
}

function expectStatus(res, list, label) {
  assert(list.includes(res.status), `${label}: expected ${list.join("/")} got ${res.status}`);
}

async function main() {
  const c = new Client();

  logStep("unauthenticated user is redirected from /dashboard");
  {
    const res = await c.request("/dashboard");
    expectStatus(res, [307, 302, 303], "dashboard redirect");
    const location = res.headers.get("location") || "";
    assert(location.includes("/login"), `expected redirect to /login, got ${location}`);
  }

  logStep("login API sets auth cookies");
  {
    const res = await c.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username, password }),
    });
    expectStatus(res, [200], "login response");
    assert.equal(c.cookies.get("carbon_gen_auth_v1"), "true", "auth cookie missing");
    assert.ok(c.cookies.get("carbon_gen_user_id"), "user_id cookie missing");
  }

  logStep("authenticated pages render");
  for (const path of ["/dashboard", "/studio", "/vault", "/shopify", "/seo", "/settings", "/activity"]) {
    const res = await c.request(path, { headers: { accept: "text/html" } });
    expectStatus(res, [200], `${path} render`);
  }

  logStep("health and models endpoints");
  {
    const health = await c.request("/api/health");
    expectStatus(health, [200], "health");
    const healthJson = await health.json();
    assert.equal(typeof healthJson, "object", "health payload must be object");

    const models = await c.request("/api/models/list");
    expectStatus(models, [200], "models list");
    const modelsJson = await models.json();
    assert.ok(Array.isArray(modelsJson.models), "models list payload invalid");
  }

  logStep("openai assistant endpoints");
  {
    const director = await c.request("/api/openai/director", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "black hoodie product photo", itemType: "hoodie" }),
    });
    expectStatus(director, [200], "director");
    const directorJson = await director.json();
    assert.equal(typeof directorJson.prompt, "string", "director prompt missing");

    const metadata = await c.request("/api/openai/metadata", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "black hoodie product photo", itemType: "hoodie", brand: "Carbon" }),
    });
    expectStatus(metadata, [200], "metadata");
    const metadataJson = await metadata.json();
    assert.equal(typeof metadataJson?.metadata?.title, "string", "metadata title missing");
  }

  logStep("generate endpoint with sample references");
  {
    const res = await c.request("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "ecommerce streetwear photo, black hoodie, clean neutral backdrop",
        modelRefs: [
          "https://picsum.photos/seed/carbon-model/800/1200",
        ],
        itemRefs: [
          "https://picsum.photos/seed/carbon-item/800/1200",
        ],
        size: "1024x1024",
      }),
    });
    expectStatus(res, [200], "generate");
    const json = await res.json();
    assert.equal(typeof json.imageBase64, "string", "imageBase64 missing");
    assert(json.imageBase64.length > 200, "imageBase64 too short");
  }

  logStep("shopify auth link generation/status/pull/push");
  {
    if (!shop) {
      console.log("SHOPIFY_SHOP_DOMAIN not set. Skipping Shopify checks.");
    } else {
      const auth = await c.request(`/api/shopify/auth?shop=${encodeURIComponent(shop)}`, {
        headers: { accept: "text/html" },
      });
      expectStatus(auth, [307, 302, 303], "shopify auth redirect");
      const location = auth.headers.get("location") || "";
      assert(
        location.includes("/admin/oauth/authorize"),
        `shopify auth redirect invalid: ${location}`
      );

      const status = await c.request(`/api/shopify/status?shop=${encodeURIComponent(shop)}`);
      expectStatus(status, [200], "shopify status");
      const statusJson = await status.json();
      assert.equal(typeof statusJson.connected, "boolean", "shopify status invalid");

      const pull = await c.request("/api/shopify/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shop, handle: "does-not-exist-handle" }),
      });
      expectStatus(pull, [200, 401, 404, 400], "shopify pull");

      const tinyPng =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBg6K2v2kAAAAASUVORK5CYII=";
      const push = await c.request("/api/shopify-push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shop,
          productId: "1234567890",
          mediaUrl: tinyPng,
          mediaType: "image",
          altText: "test asset",
        }),
      });
      if (![200, 401, 400].includes(push.status)) {
        const detail = await push.text();
        throw new Error(`shopify push expected 200/401/400 got ${push.status}. body=${detail}`);
      }
    }
  }

  logStep("logout and protected-route lock");
  {
    const out = await c.request("/api/logout", { method: "POST" });
    expectStatus(out, [200], "logout");
    const dashboard = await c.request("/dashboard");
    expectStatus(dashboard, [307, 302, 303], "dashboard after logout");
    const location = dashboard.headers.get("location") || "";
    assert(location.includes("/login"), `expected redirect to login after logout, got ${location}`);
  }

  console.log("\nE2E runtime checks passed.");
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err?.message || err);
  process.exit(1);
});
