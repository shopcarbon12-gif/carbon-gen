#!/usr/bin/env node

import { execSync } from "node:child_process";

function runNotification({ title, message, success }) {
  const safeTitle = String(title).replace(/'/g, "''");
  const safeMessage = String(message).replace(/'/g, "''");
  const successWav = String(process.env.COOLIFY_NOTIFY_WAV_SUCCESS || "C:\\Windows\\Media\\Alarm03.wav").trim();
  const failWav = String(process.env.COOLIFY_NOTIFY_WAV_FAIL || "C:\\Windows\\Media\\Alarm10.wav").trim();
  const wavPath = String(success ? successWav : failWav).replace(/'/g, "''");
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
    `$wavPath = '${wavPath}'`,
    "if (Test-Path $wavPath) {",
    "  try { $player = New-Object System.Media.SoundPlayer $wavPath; $player.PlaySync() } catch {",
    soundExpr,
    "  }",
    "} else {",
    soundExpr,
    "}",
    "}",
  ].join("; ");
  const popupFormScript = [
    "& {",
    `$title = '${safeTitle}'`,
    `$message = '${safeMessage}'`,
    `$wavPath = '${wavPath}'`,
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Drawing')",
    "$cursorScreen = [System.Windows.Forms.Screen]::FromPoint([System.Windows.Forms.Cursor]::Position)",
    "$bounds = $cursorScreen.WorkingArea",
    "$form = New-Object System.Windows.Forms.Form",
    "$form.Text = $title",
    "$form.StartPosition = 'Manual'",
    "$form.FormBorderStyle = 'FixedDialog'",
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
    "$ok = New-Object System.Windows.Forms.Button",
    "$ok.Text = 'OK'",
    "$ok.Width = 100",
    "$ok.Height = 34",
    "$ok.Left = 400",
    "$ok.Top = 110",
    "$ok.Add_Click({ $form.Close() })",
    "$timer = New-Object System.Windows.Forms.Timer",
    "$timer.Interval = 10000",
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
    "  })",
    "} else {",
    `  $form.Add_Shown({ ${soundExpr} })`,
    "}",
    "[void]$form.ShowDialog()",
    "}",
  ].join("; ");
  if (enableToast) {
    const toastEncoded = Buffer.from(toastScript, "utf16le").toString("base64");
    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${toastEncoded}`, {
        stdio: "ignore",
      });
    } catch {
      // Toast can fail on locked-down hosts; popup fallback below handles visibility.
    }
  }
  try {
    const formEncoded = Buffer.from(popupFormScript, "utf16le").toString("base64");
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${formEncoded}`, {
      stdio: "ignore",
    });
  } catch {
    // Keep test non-fatal if UI popup cannot be shown in current session.
  }
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
