#!/usr/bin/env node

const DEFAULT_HOOK_URL =
  "http://178.156.136.112:8000/api/v1/deploy?uuid=aw4800s4wsgok0wck480goco&force=false";

const hookUrl = String(process.env.COOLIFY_DEPLOY_HOOK_URL || DEFAULT_HOOK_URL).trim();
const apiToken = String(process.env.COOLIFY_API_TOKEN || "").trim();

if (!hookUrl) {
  console.error("Missing Coolify deploy hook URL.");
  process.exit(1);
}

try {
  new URL(hookUrl);
} catch {
  console.error("Invalid Coolify deploy hook URL.");
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
    process.exit(1);
  }

  console.log(`Coolify deploy hook accepted (${response.status}).`);
  if (bodyText) console.log(bodyText);
}

main().catch((error) => {
  console.error("Failed to trigger Coolify deploy:", error?.message || error);
  process.exit(1);
});
