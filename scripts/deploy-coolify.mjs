#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_HOOK_URL =
  "http://178.156.136.112:8000/api/v1/deploy?uuid=aw4800s4wsgok0wck480goco&force=false";
const LOCAL_CONFIG_PATH = path.resolve(process.cwd(), ".coolify-deploy.local.json");
const DEPLOY_GUARD =
  String(process.env.ALLOW_COOLIFY_DEPLOY || "").trim().toLowerCase() === "true";

if (!DEPLOY_GUARD) {
  console.error("Coolify deploy is blocked by local-only safety guard.");
  console.error("To deploy intentionally, run:");
  console.error("  ALLOW_COOLIFY_DEPLOY=true npm run deploy:coolify");
  process.exit(1);
}

function readLocalConfig() {
  if (!fs.existsSync(LOCAL_CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

const localConfig = readLocalConfig();
const hookUrl = String(
  process.env.COOLIFY_DEPLOY_HOOK_URL || localConfig.hookUrl || DEFAULT_HOOK_URL
).trim();
const apiToken = String(process.env.COOLIFY_API_TOKEN || localConfig.apiToken || "").trim();

function looksLikeHtml(text) {
  return /^\s*<!doctype html/i.test(String(text || ""));
}

if (!hookUrl) {
  console.error("Missing Coolify deploy hook URL.");
  console.error("Run: npm run deploy:coolify:setup");
  process.exit(1);
}

try {
  new URL(hookUrl);
} catch {
  console.error("Invalid Coolify deploy hook URL.");
  console.error("Run: npm run deploy:coolify:setup");
  process.exit(1);
}

async function main() {
  console.log("Triggering Coolify deployment...");
  const response = await fetch(hookUrl, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
    },
  });

  const bodyText = await response.text();
  if (!response.ok) {
    console.error(`Coolify deploy hook failed (${response.status}).`);
    if (bodyText) console.error(bodyText);
    if (response.status === 401 || response.status === 403) {
      console.error("Authorization failed for Coolify deploy.");
      console.error("Run: npm run deploy:coolify:setup");
      console.error(
        "Then set a deploy-enabled API token and/or correct webhook URL one time."
      );
    }
    process.exit(1);
  }
  if (looksLikeHtml(bodyText)) {
    console.error("Deploy endpoint returned HTML instead of deploy API response.");
    console.error("This usually means the hook URL points to a UI/webhook page, not the deploy API.");
    console.error("Run: npm run deploy:coolify:setup");
    process.exit(1);
  }

  console.log(`Coolify deploy hook accepted (${response.status}).`);
  if (bodyText) console.log(bodyText);
}

main().catch((error) => {
  console.error("Failed to trigger Coolify deploy:", error?.message || error);
  process.exit(1);
});
