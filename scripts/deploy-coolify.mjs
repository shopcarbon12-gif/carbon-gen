#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DEFAULT_HOOK_URL =
  "http://178.156.136.112:8000/api/v1/deploy?uuid=aw4800s4wsgok0wck480goco&force=false";
const LOCAL_CONFIG_PATH = path.resolve(process.cwd(), ".coolify-deploy.local.json");
const DEPLOY_STATE_PATH = path.resolve(process.cwd(), ".bridge/runtime/coolify-deploy-state.json");
const DEPLOY_GUARD =
  String(process.env.ALLOW_COOLIFY_DEPLOY || "").trim().toLowerCase() === "true";
const ALLOW_DUPLICATE_DEPLOY =
  String(process.env.ALLOW_DUPLICATE_COOLIFY_DEPLOY || "").trim().toLowerCase() === "true";
const WATCH_DEPLOY_COMPLETION =
  String(process.env.COOLIFY_WATCH_COMPLETION || "true").trim().toLowerCase() === "true";
const WATCH_TIMEOUT_MS = 45 * 60 * 1000;
const WATCH_POLL_MS = 10 * 1000;
const STATUS_REQUEST_TIMEOUT_MS = 20 * 1000;
const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

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

function getHeadSha() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function readDeployState() {
  if (!fs.existsSync(DEPLOY_STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(DEPLOY_STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeDeployState(state) {
  try {
    fs.mkdirSync(path.dirname(DEPLOY_STATE_PATH), { recursive: true });
    fs.writeFileSync(DEPLOY_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Best-effort state persistence.
  }
}

const localConfig = readLocalConfig();
const hookUrl = String(
  process.env.COOLIFY_DEPLOY_HOOK_URL || localConfig.hookUrl || DEFAULT_HOOK_URL
).trim();
const deployApiToken = String(
  process.env.COOLIFY_DEPLOY_API_TOKEN ||
    process.env.COOLIFY_API_TOKEN ||
    localConfig.deployApiToken ||
    localConfig.apiToken ||
    ""
).trim();
const watchApiToken = String(
  process.env.COOLIFY_WATCH_API_TOKEN ||
    localConfig.watchApiToken ||
    deployApiToken
).trim();

function looksLikeHtml(text) {
  return /^\s*<!doctype html/i.test(String(text || ""));
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiBaseUrl(fromHookUrl) {
  try {
    const parsed = new URL(fromHookUrl);
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function getDeploymentUuid(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.deployment_uuid === "string" && payload.deployment_uuid.trim()) {
    return payload.deployment_uuid.trim();
  }
  if (Array.isArray(payload.deployments) && payload.deployments.length > 0) {
    for (const row of payload.deployments) {
      const value = String(row?.deployment_uuid || "").trim();
      if (value) return value;
    }
  }
  return "";
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function getStatusFromPayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  return normalizeStatus(
    payload.status ||
      payload.deployment_status ||
      payload?.deployment?.status ||
      payload?.data?.status ||
      payload?.state ||
      ""
  );
}

function isTerminalStatus(status) {
  return [
    "success",
    "failed",
    "error",
    "cancelled",
    "canceled",
    "stopped",
    "terminated",
    "completed",
  ].includes(status);
}

function statusLabel(status) {
  if (!status) return "unknown";
  if (status === "success" || status === "completed") return "succeeded";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "failed" || status === "error") return "failed";
  return status;
}

function escapePsSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

function runPowerShell(script) {
  const encoded = Buffer.from(String(script || ""), "utf16le").toString("base64");
  return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function notifyWindows({ title, message, success = true }) {
  const safeTitle = escapePsSingleQuoted(title);
  const safeMessage = escapePsSingleQuoted(message);
  const successSound = String(process.env.COOLIFY_NOTIFY_SOUND_SUCCESS || "Exclamation")
    .trim()
    .replace(/[^A-Za-z]/g, "") || "Exclamation";
  const failSound = String(process.env.COOLIFY_NOTIFY_SOUND_FAIL || "Hand")
    .trim()
    .replace(/[^A-Za-z]/g, "") || "Hand";
  const soundExpr = success
    ? `[System.Media.SystemSounds]::${successSound}.Play()`
    : `[System.Media.SystemSounds]::${failSound}.Play()`;
  const popupFlags = success ? "64" : "16";
  const popupScript = [
    "& {",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')",
    soundExpr,
    "$ws = New-Object -ComObject WScript.Shell",
    `$null = $ws.Popup('${safeMessage}', 30, '${safeTitle}', ${popupFlags})`,
    "}",
  ].join("; ");
  const messageBoxScript = [
    "& {",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')",
    soundExpr,
    `$null = [System.Windows.Forms.MessageBox]::Show('${safeMessage}', '${safeTitle}', 'OK', 'Information')`,
    "}",
  ].join("; ");
  let sent = false;
  try {
    runPowerShell(popupScript);
    sent = true;
  } catch (error) {
    if (String(process.env.COOLIFY_NOTIFY_DEBUG || "").trim().toLowerCase() === "true") {
      const msg = error instanceof Error ? error.message : String(error || "unknown error");
      console.warn(`Popup notification failed: ${msg}`);
    }
  }
  if (sent) return;
  try {
    runPowerShell(messageBoxScript);
    sent = true;
  } catch (error) {
    if (String(process.env.COOLIFY_NOTIFY_DEBUG || "").trim().toLowerCase() === "true") {
      const msg = error instanceof Error ? error.message : String(error || "unknown error");
      console.warn(`MessageBox notification failed: ${msg}`);
    }
  }
  if (!sent) {
    // Terminal bell fallback when desktop notifications fail.
    process.stdout.write("\u0007");
    console.warn("Windows notification fallback failed; emitted terminal bell only.");
  }
}

async function fetchDeploymentStatus({ apiBaseUrl, deploymentUuid, apiToken }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STATUS_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/deployments/${deploymentUuid}`, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      statusCode: response.status,
      payload: parseJsonSafe(text),
      text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return {
      ok: false,
      statusCode: 0,
      payload: null,
      text: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForDeploymentCompletion({ apiBaseUrl, deploymentUuid, apiToken }) {
  const started = Date.now();
  while (Date.now() - started < WATCH_TIMEOUT_MS) {
    const statusResp = await fetchDeploymentStatus({ apiBaseUrl, deploymentUuid, apiToken });
    if (!statusResp.ok) {
      if (statusResp.statusCode === 401 || statusResp.statusCode === 403) {
        return { watched: false, reason: "forbidden" };
      }
      await sleep(WATCH_POLL_MS);
      continue;
    }
    const status = getStatusFromPayload(statusResp.payload);
    if (isTerminalStatus(status)) {
      return { watched: true, status };
    }
    await sleep(WATCH_POLL_MS);
  }
  return { watched: false, reason: "timeout" };
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
  const headSha = getHeadSha();
  const last = readDeployState();
  const now = Date.now();
  if (
    !ALLOW_DUPLICATE_DEPLOY &&
    headSha &&
    last?.headSha === headSha &&
    Number.isFinite(last?.triggeredAtMs) &&
    now - Number(last.triggeredAtMs) < DUPLICATE_WINDOW_MS
  ) {
    console.log(
      `Skipping duplicate Coolify deploy for commit ${headSha.slice(0, 7)} (triggered recently).`
    );
    console.log(
      "Use ALLOW_DUPLICATE_COOLIFY_DEPLOY=true to force another trigger for the same commit."
    );
    return;
  }

  console.log("Triggering Coolify deployment...");
  const response = await fetch(hookUrl, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(deployApiToken ? { Authorization: `Bearer ${deployApiToken}` } : {}),
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
  const triggerPayload = parseJsonSafe(bodyText);
  const deploymentUuid = getDeploymentUuid(triggerPayload);
  writeDeployState({
    headSha,
    triggeredAtMs: now,
    hookUrl,
    status: response.status,
    deploymentUuid,
  });

  if (!WATCH_DEPLOY_COMPLETION || !deploymentUuid) return;

  const apiBaseUrl = getApiBaseUrl(hookUrl);
  if (!apiBaseUrl) return;

  console.log(`Watching deployment completion: ${deploymentUuid}`);
  const watchResult = await waitForDeploymentCompletion({
    apiBaseUrl,
    deploymentUuid,
    apiToken: watchApiToken,
  });

  if (watchResult.watched) {
    const label = statusLabel(watchResult.status);
    const success = label === "succeeded";
    const title = success ? "Coolify Deploy Complete" : "Coolify Deploy Finished";
    const message = `Deployment ${deploymentUuid.slice(0, 8)} ${label}.`;
    console.log(message);
    console.log("Sending Windows completion notification...");
    notifyWindows({ title, message, success });
    return;
  }

  if (watchResult.reason === "forbidden") {
    const message =
      "Deploy queued, but completion polling is forbidden for current watch token. " +
      "Set COOLIFY_WATCH_API_TOKEN (or setup watchApiToken) with read permission.";
    console.warn(message);
    console.log("Sending Windows queued notification...");
    notifyWindows({
      title: "Coolify Deploy Queued",
      message: "Queued. Cannot watch completion with current watch token.",
      success: false,
    });
    return;
  }

  if (watchResult.reason === "timeout") {
    const message = `Timed out waiting for deployment ${deploymentUuid.slice(0, 8)} completion.`;
    console.warn(message);
    console.log("Sending Windows timeout notification...");
    notifyWindows({
      title: "Coolify Deploy Watch Timeout",
      message: "Deploy still running or status unavailable.",
      success: false,
    });
  }
}

main().catch((error) => {
  console.error("Failed to trigger Coolify deploy:", error?.message || error);
  process.exit(1);
});
