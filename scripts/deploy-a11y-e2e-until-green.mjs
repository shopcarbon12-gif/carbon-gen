#!/usr/bin/env node
/**
 * Deploy app (Coolify) → push Shopify widget snippet → run full a11y HTML report + verification.json.
 * Repeats until verification passes or max rounds (deploy is expensive; inner loop retries report only for propagation).
 *
 * Requires: ALLOW_COOLIFY_DEPLOY=true (set below), APP_PASSWORD in .env.local, Shopify token for push script.
 *
 * Usage: node scripts/deploy-a11y-e2e-until-green.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");

const MAX_DEPLOY_ROUNDS = Number(process.env.A11Y_E2E_MAX_DEPLOY_ROUNDS || 6);
const REPORT_RETRIES = Number(process.env.A11Y_E2E_REPORT_RETRIES || 4);
const REPORT_RETRY_WAIT_MS = Number(process.env.A11Y_E2E_REPORT_RETRY_MS || 90_000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function run(cmd, args, extraEnv = {}) {
  const res = spawnSync(cmd, args, {
    cwd: REPO,
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  return res.status === 0;
}

/** Windows: npm is `npm.cmd` and must run under shell when invoked as a single script line. */
function runNode(scriptRelative, extraEnv = {}) {
  const res = spawnSync(process.execPath, [join(REPO, scriptRelative)], {
    cwd: REPO,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  return res.status === 0;
}

function runNpm(scriptName, extraEnv = {}) {
  const line =
    process.platform === "win32" ? `npm.cmd run ${scriptName}` : `npm run ${scriptName}`;
  const res = spawnSync(line, {
    cwd: REPO,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });
  return res.status === 0;
}

function readLatestVerification() {
  const pointer = join(REPO, "reports", ".last-a11y-verification-dir.txt");
  if (!existsSync(pointer)) return null;
  const dir = readFileSync(pointer, "utf8").trim();
  const vPath = join(dir, "verification.json");
  if (!existsSync(vPath)) return null;
  try {
    return JSON.parse(readFileSync(vPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  /** Duplicate guard can block redeploy of same SHA; allow repeat attempts in this loop. */
  const env = { ALLOW_COOLIFY_DEPLOY: "true", ALLOW_DUPLICATE_COOLIFY_DEPLOY: "true" };

  for (let round = 1; round <= MAX_DEPLOY_ROUNDS; round++) {
    console.log(`\n========== Deploy round ${round}/${MAX_DEPLOY_ROUNDS} ==========\n`);

    if (!runNpm("deploy:coolify", env)) {
      console.error("deploy:coolify failed — aborting loop.");
      process.exit(1);
    }

    console.log("\n--- Push Shopify accessibility snippet (wrev sync) ---\n");
    runNode(join("scripts", "push-carbon-accessibility-widget-theme.mjs"));

    for (let attempt = 1; attempt <= REPORT_RETRIES; attempt++) {
      console.log(`\n--- Verification report attempt ${attempt}/${REPORT_RETRIES} ---\n`);
      const okRun = runNode(join("scripts", "generate-a11y-widget-html-reports.mjs"));
      const v = readLatestVerification();

      if (v?.ok) {
        console.log("\n✓ ALL CHECKS PASSED");
        console.log("Report folder:", v.outDir);
        console.log("shopcarbon-report.html");
        console.log("app-shopcarbon-accessibility-report.html");
        process.exit(0);
      }

      console.error("\n✗ Verification failed");
      if (v?.errors?.length) console.error(v.errors.join("\n"));
      else if (!okRun) console.error("(report script exited non-zero or verification.json missing)");

      if (attempt < REPORT_RETRIES) {
        console.log(`Waiting ${REPORT_RETRY_WAIT_MS / 1000}s for CDN / theme propagation before retry…`);
        await sleep(REPORT_RETRY_WAIT_MS);
      }
    }

    console.log("\n--- End round: still failing; redeploying if rounds remain ---\n");
    if (round < MAX_DEPLOY_ROUNDS) {
      await sleep(15_000);
    }
  }

  console.error("\nMax deploy rounds reached — still not green.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
