# Plays sound + shows balloon when Cursor agent finishes a task.
# Run: powershell -ExecutionPolicy Bypass -File scripts/notify-task-complete.ps1
#
# Sound: set CURSOR_NOTIFY_SOUND to a full path to any .wav file, e.g.:
#   $env:CURSOR_NOTIFY_SOUND = "C:\Windows\Media\chimes.wav"
# Default is tada.wav (short fanfare). Fallbacks: chimes, then Windows Notify.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 1. Play sound
$soundPath = $env:CURSOR_NOTIFY_SOUND
if (-not $soundPath) {
  $media = Join-Path $env:WINDIR "Media"
  foreach ($name in @("tada.wav", "chimes.wav", "Windows Notify.wav", "notify.wav")) {
    $p = Join-Path $media $name
    if (Test-Path $p) { $soundPath = $p; break }
  }
}
if ($soundPath -and (Test-Path $soundPath)) {
  $player = New-Object System.Media.SoundPlayer $soundPath
  $player.PlaySync()
} else {
  [System.Media.SystemSounds]::Hand.Play()
}

# 2. Balloon in system tray
$ni = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon = [System.Drawing.SystemIcons]::Application
$ni.Visible = $true
$ni.BalloonTipTitle = "Cursor"
$ni.BalloonTipText = "Task complete."
$ni.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$ni.ShowBalloonTip(5000)
Start-Sleep -Seconds 5
$ni.Visible = $false
$ni.Dispose()
