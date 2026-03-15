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
  const toastSound = success
    ? "ms-winsoundevent:Notification.Default"
    : "ms-winsoundevent:Notification.Looping.Alarm2";
  const psScript = [
    "& {",
    `$title = '${safeTitle}'`,
    `$message = '${safeMessage}'`,
    "$toastSent = $false",
    "if (Get-Command New-BurntToastNotification -ErrorAction SilentlyContinue) {",
    "  New-BurntToastNotification -Text $title, $message | Out-Null",
    "  $toastSent = $true",
    "}",
    "if (-not $toastSent) {",
    "  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
    "  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null",
    `  $toastXml = '<toast><visual><binding template=\"ToastGeneric\"><text>' + [Security.SecurityElement]::Escape($title) + '</text><text>' + [Security.SecurityElement]::Escape($message) + '</text></binding></visual><audio src=\"${toastSound}\"/></toast>'`,
    "  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
    "  $xml.LoadXml($toastXml)",
    "  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
    "  $toast.ExpirationTime = [DateTimeOffset]::Now.AddMinutes(2)",
    "  $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('PowerShell')",
    "  $notifier.Show($toast)",
    "}",
    "if ($toastSent) { return }",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')",
    "[void][Reflection.Assembly]::LoadWithPartialName('System.Drawing')",
    soundExpr,
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
    "[void]$form.ShowDialog()",
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
