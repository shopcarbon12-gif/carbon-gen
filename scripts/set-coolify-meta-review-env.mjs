/**
 * Set META_REVIEW_SEED_PASSWORD on the Coolify app (UUID matches deploy-coolify.mjs hook).
 * Requires a Coolify API token with env write permission (Keys & Tokens → create with write scope).
 * If you get HTTP 403, use the Coolify UI: Environment → add variable → restart app.
 *
 * Usage: node scripts/set-coolify-meta-review-env.mjs [password]
 * Token: .coolify-deploy.local.json → apiToken
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const cfgPath = path.join(root, ".coolify-deploy.local.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const token = String(cfg.apiToken || cfg.deployApiToken || "").trim();
if (!token) {
  console.error("Missing apiToken in .coolify-deploy.local.json");
  process.exit(1);
}

const appUuid = "aw4800s4wsgok0wck480goco";
const apiBase = "http://178.156.136.112:8000/api/v1";
const url = `${apiBase}/applications/${appUuid}/envs`;
const payload = {
  key: "META_REVIEW_SEED_PASSWORD",
  value: process.argv[2] || "shopcarbon",
  is_literal: true,
  is_preview: false,
  is_multiline: false,
  is_shown_once: false,
};

const res = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
console.log("HTTP", res.status, text.slice(0, 800));
process.exit(res.ok ? 0 : 1);
