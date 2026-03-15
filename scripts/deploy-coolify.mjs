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
  notifyDeployEvent({
    title: "Coolify Deploy Blocked",
    message: "Deploy guard is active. Set ALLOW_COOLIFY_DEPLOY=true.",
    success: false,
  });
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
    "finished",
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
  if (status === "success" || status === "completed" || status === "finished") return "succeeded";
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
  const successWav = String(process.env.COOLIFY_NOTIFY_WAV_SUCCESS || "C:\\Windows\\Media\\Alarm03.wav").trim();
  const failWav = String(process.env.COOLIFY_NOTIFY_WAV_FAIL || "C:\\Windows\\Media\\Alarm10.wav").trim();
  const wavPath = escapePsSingleQuoted(success ? successWav : failWav);
  const successSound = String(process.env.COOLIFY_NOTIFY_SOUND_SUCCESS || "Asterisk")
    .trim()
    .replace(/[^A-Za-z]/g, "") || "Exclamation";
  const failSound = String(process.env.COOLIFY_NOTIFY_SOUND_FAIL || "Exclamation")
    .trim()
    .replace(/[^A-Za-z]/g, "") || "Hand";
  const soundExpr = success
    ? `[System.Media.SystemSounds]::${successSound}.Play()`
    : `[System.Media.SystemSounds]::${failSound}.Play()`;
  const enableToast = String(process.env.COOLIFY_NOTIFY_ENABLE_TOAST || "false").trim().toLowerCase() === "true";
  const toastScript = [
    "& {",
    `$title = '${safeTitle}'`,
    `$message = '${safeMessage}'`,
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
    "  $toastXml = '<toast><visual><binding template=\"ToastGeneric\"><text>' + [Security.SecurityElement]::Escape($title) + '</text><text>' + [Security.SecurityElement]::Escape($message) + '</text></binding></visual><audio silent=\"true\"/></toast>'",
    "  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    "  $xml.LoadXml($toastXml)",
    "  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "  $toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(2)",
    "  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('PowerShell')",
    "  $notifier.Show($toast)",
    "}",
  ].join("; ");
  const popupFormScript = [
    "& {",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Drawing')",
    `$title = '${safeTitle}'`,
    `$message = '${safeMessage}'`,
    `$wavPath = '${wavPath}'`,
    "$cursorScreen = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position)",
    "$bounds = $cursorScreen.WorkingArea",
    "$form = New-Object System.Windows.Forms.Form",
    "$form.Text = $title",
    "$form.StartPosition = 'Manual'",
    "$form.FormBorderStyle = 'FixedDialog'",
    "$form.MaximizeBox = $false",
    "$form.MinimizeBox = $false",
    "$form.TopMost = $true",
    "$form.Width = 520",
    "$form.Height = 180",
    "$form.ShowInTaskbar = $true",
    "$form.Location = New-Object System.Drawing.Point([Math]::Max($bounds.Left + 10, $bounds.Left + [int](($bounds.Width - $form.Width) / 2)), [Math]::Max($bounds.Top + 10, $bounds.Top + [int](($bounds.Height - $form.Height) / 2)))",
    "$label = New-Object System.Windows.Forms.Label",
    "$label.AutoSize = $false",
    "$label.Text = $message",
    "$label.Width = 480",
    "$label.Height = 80",
    "$label.Left = 16",
    "$label.Top = 20",
    "$label.Font = New-Object System.Drawing.Font('Segoe UI', 10)",
    "$label.TextAlign = 'MiddleLeft'",
    "$ok = New-Object System.Windows.Forms.Button",
    "$ok.Text = 'OK'",
    "$ok.Width = 100",
    "$ok.Height = 34",
    "$ok.Left = 400",
    "$ok.Top = 110",
    "$ok.Add_Click({ $form.Close() })",
    "$timer = New-Object System.Windows.Forms.Timer",
    "$timer.Interval = 30000",
    "$timer.Add_Tick({ $timer.Stop(); if ($form.Visible) { $form.Close() } })",
    "$timer.Start()",
    "$form.Controls.Add($label)",
    "$form.Controls.Add($ok)",
    "if (Test-Path $wavPath) {",
    "  $form.Add_Shown({",
    "    try {",
    "      $player = New-Object System.Media.SoundPlayer $wavPath",
    "      $player.Play()",
    "    } catch {",
    soundExpr,
    "    }",
    "    $form.Activate()",
    "  })",
    "} else {",
    `  $form.Add_Shown({ ${soundExpr}; $form.Activate() })`,
    "}",
    "[void]$form.ShowDialog()",
    "}",
  ].join("; ");
  let sent = false;
  if (enableToast) {
    try {
      runPowerShell(toastScript);
      sent = true;
    } catch (error) {
      if (String(process.env.COOLIFY_NOTIFY_DEBUG || "").trim().toLowerCase() === "true") {
        const msg = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`Toast notification failed: ${msg}`);
      }
    }
  }
  if (sent) {
    try {
      runPowerShell(popupFormScript);
    } catch (error) {
      if (String(process.env.COOLIFY_NOTIFY_DEBUG || "").trim().toLowerCase() === "true") {
        const msg = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`Topmost form notification failed: ${msg}`);
      }
    }
    return;
  }
  try {
    runPowerShell(popupFormScript);
    sent = true;
  } catch (error) {
    if (String(process.env.COOLIFY_NOTIFY_DEBUG || "").trim().toLowerCase() === "true") {
      const msg = error instanceof Error ? error.message : String(error || "unknown error");
      console.warn(`Topmost form notification failed: ${msg}`);
    }
  }
  if (!sent) {
    // Terminal bell fallback when desktop notifications fail.
    process.stdout.write("\u0007");
    console.warn("Windows notification fallback failed; emitted terminal bell only.");
  }
}

function notifyDeployEvent(payload) {
  try {
    notifyWindows(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`Deploy notification failed: ${message}`);
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
    notifyDeployEvent({
      title: "Coolify Deploy Skipped",
      message: `Duplicate deploy skipped for ${headSha.slice(0, 7)}.`,
      success: false,
    });
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
    notifyDeployEvent({
      title: "Coolify Deploy Failed",
      message: `Deploy hook failed (${response.status}).`,
      success: false,
    });
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
    notifyDeployEvent({
      title: "Coolify Deploy Failed",
      message: "Hook returned HTML; check webhook/API URL.",
      success: false,
    });
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

  if (!WATCH_DEPLOY_COMPLETION || !deploymentUuid) {
    notifyDeployEvent({
      title: "Coolify Deploy Queued",
      message: deploymentUuid
        ? `Deploy queued (${deploymentUuid.slice(0, 8)}). Completion watch is disabled.`
        : "Deploy hook accepted, but no deployment id returned.",
      success: true,
    });
    return;
  }

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
    notifyDeployEvent({
      title: "Coolify Deploy Queued",
      message:
        `Deploy ${deploymentUuid.slice(0, 8)} queued; watcher is forbidden (token lacks read permission).`,
      success: false,
    });
    return;
  }

  if (watchResult.reason === "timeout") {
    const message = `Timed out waiting for deployment ${deploymentUuid.slice(0, 8)} completion.`;
    console.warn(message);
    console.log("No desktop notification sent (configured: notify only on terminal completion).");
    notifyDeployEvent({
      title: "Coolify Deploy Still Running",
      message,
      success: false,
    });
  }
}

main().catch((error) => {
  console.error("Failed to trigger Coolify deploy:", error?.message || error);
  notifyDeployEvent({
    title: "Coolify Deploy Failed",
    message: `Failed to trigger deploy: ${error?.message || error}`,
    success: false,
  });
  process.exit(1);
});
