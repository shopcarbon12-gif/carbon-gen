$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$config = "C:\Windows\System32\config\systemprofile\.cloudflared\config.yml"
$pidFile = "$repo\.tmp_local_stack_pids.json"
$devLog = "$repo\.tmp_dev.log"
$tunnelLog = "$repo\.tmp_tunnel.log"
$tunnelErrLog = "$repo\.tmp_tunnel.err.log"

if (!(Test-Path $cloudflared)) {
  throw "cloudflared not found at: $cloudflared"
}
if (!(Test-Path $config)) {
  throw "cloudflared config not found at: $config"
}

# Ensure previous local stack is stopped.
& "$PSScriptRoot\stop-local-stack.ps1" | Out-Null

# Clear stale Next lock if present.
if (Test-Path "$repo\.next\dev\lock") {
  Remove-Item "$repo\.next\dev\lock" -Force -ErrorAction SilentlyContinue
}

# Reset logs.
if (Test-Path $devLog) { Remove-Item $devLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $tunnelErrLog) { Remove-Item $tunnelErrLog -Force -ErrorAction SilentlyContinue }

# Start app in background.
$devProc = Start-Process cmd.exe -ArgumentList @(
  "/c",
  "cd /d `"$repo`" && npm run dev:3001 > `"$devLog`" 2>&1"
) -PassThru -WindowStyle Hidden

# Wait until Next.js is actually reachable on 3001.
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3001" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    # Keep waiting until reachable.
  }
}

if (-not $ready) {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3001" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
    $ready = $true
    }
  } catch {}
}

if (-not $ready) {
  # Last fallback: check listener table in case web request is blocked by host policy.
  $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    $ready = $true
  }
}

if (-not $ready) {
  $tail = if (Test-Path $devLog) { (Get-Content $devLog -Tail 20) -join "`n" } else { "(no log file)" }
  Write-Warning "Next.js readiness probe did not confirm port 3001 yet. Continuing startup anyway.`nLast log lines:`n$tail"
}

# Start tunnel in background.
$tunnelProc = Start-Process $cloudflared -ArgumentList @(
  "tunnel",
  "--config",
  $config,
  "run",
  "carbon-gen"
) -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErrLog

Start-Sleep -Seconds 2
$tunnelLive = Get-Process -Id $tunnelProc.Id -ErrorAction SilentlyContinue
if (-not $tunnelLive) {
  $tailOut = if (Test-Path $tunnelLog) { (Get-Content $tunnelLog -Tail 30) -join "`n" } else { "(no tunnel stdout log)" }
  $tailErr = if (Test-Path $tunnelErrLog) { (Get-Content $tunnelErrLog -Tail 30) -join "`n" } else { "(no tunnel stderr log)" }
  throw "cloudflared failed to start.`nstdout:`n$tailOut`n`nstderr:`n$tailErr"
}

# Persist pids for easy stop.
@{
  startedAt = (Get-Date).ToString("o")
  devPid = $devProc.Id
  tunnelPid = $tunnelProc.Id
} | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Host "Started local stack in background."
Write-Host "App:    http://localhost:3001"
Write-Host "Public: https://carbon-gen.shopcarbon.com"
Write-Host "Logs:"
Write-Host "  $devLog"
Write-Host "  $tunnelLog"
Write-Host "  $tunnelErrLog"
