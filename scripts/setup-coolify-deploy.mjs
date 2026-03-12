#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_HOOK_URL =
  "http://178.156.136.112:8000/api/v1/deploy?uuid=aw4800s4wsgok0wck480goco&force=false";
const CONFIG_PATH = path.resolve(process.cwd(), ".coolify-deploy.local.json");
const DEPLOY_GUARD =
  String(process.env.ALLOW_COOLIFY_DEPLOY || "").trim().toLowerCase() === "true";

function looksLikeHtml(text) {
  return /^\s*<!doctype html/i.test(String(text || ""));
}

async function prompt(question, fallback = "") {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    const normalized = String(answer || "").trim();
    return normalized || fallback;
  } finally {
    rl.close();
  }
}

function isAffirmative(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

async function main() {
  console.log("Coolify deploy setup (one-time).");
  const hookUrl = await prompt(`Deploy hook URL [${DEFAULT_HOOK_URL}]: `, DEFAULT_HOOK_URL);
  const apiToken = await prompt("API token (leave empty if webhook is fully public): ", "");

  try {
    new URL(hookUrl);
  } catch {
    console.error("Invalid deploy hook URL.");
    process.exit(1);
  }

  const runLiveValidation = isAffirmative(
    await prompt("Run live validation now? This may trigger a deploy. [y/N]: ", "n")
  );

  if (runLiveValidation) {
    if (!DEPLOY_GUARD) {
      console.error("Live validation is blocked by local-only safety guard.");
      console.error("To validate intentionally (can trigger deploy), run:");
      console.error("  ALLOW_COOLIFY_DEPLOY=true npm run deploy:coolify:setup");
      process.exit(1);
    }
    console.log("Running live validation (can trigger deployment)...");
    const response = await fetch(hookUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      },
    });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error(`Validation failed (${response.status}).`);
      if (bodyText) console.error(bodyText);
      process.exit(1);
    }
    if (looksLikeHtml(bodyText)) {
      console.error("Validation failed: endpoint returned HTML, not deploy API response.");
      console.error(
        "Use the Coolify API deploy URL (usually /api/v1/deploy?...), not /webhooks/..."
      );
      process.exit(1);
    }
    console.log("Live validation request accepted.");
  } else {
    console.log("Skipping live validation to avoid accidental deployment.");
    console.log("You can test manually later with: npm run deploy:coolify");
  }

  const config = { hookUrl, apiToken };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`Saved ${path.basename(CONFIG_PATH)}.`);
  console.log("You can now run: npm run deploy:coolify");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message || error);
  process.exit(1);
});
