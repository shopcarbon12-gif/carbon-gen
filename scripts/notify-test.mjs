#!/usr/bin/env node

import { execSync } from "node:child_process";

function runNotification({ title, message, success }) {
  const safeTitle = String(title).replace(/'/g, "''");
  const safeMessage = String(message).replace(/'/g, "''");
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
  const psScript = [
    "& {",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')",
    soundExpr,
    "$ws = New-Object -ComObject WScript.Shell",
    `$null = $ws.Popup('${safeMessage}', 10, '${safeTitle}', ${popupFlags})`,
    "}",
  ].join("; ");
  const encoded = Buffer.from(psScript, "utf16le").toString("base64");
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, {
    stdio: "ignore",
  });
}

try {
  runNotification({
    title: "Coolify Deploy Test",
    message: "Popup + sound test from Carbon deploy notifier.",
    success: true,
  });
  console.log("Notification test sent.");
} catch (error) {
  console.error("Notification test failed:", error?.message || error);
  process.exit(1);
}
