$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$config = "C:\Windows\System32\config\systemprofile\.cloudflared\config.yml"
$pidFile = "$repo\.tmp_local_stack_pids.json"
$devLog = "$repo\.tmp_dev.log"
$tunnelLog = "$repo\.tmp_tunnel.log"
$tunnelErrLog = "$repo\.tmp_tunnel.err.log"

function Get-DotEnvValue {
  param(
    [string]$FilePath,
    [string]$Key
  )

  if (!(Test-Path $FilePath)) {
    return $null
  }

  $prefix = "$Key="
  foreach ($line in Get-Content $FilePath) {
    if ($line.StartsWith($prefix)) {
      return $line.Substring($prefix.Length).Trim()
    }
  }
  return $null
}

function Get-ConfiguredPort {
  $raw = (Get-DotEnvValue -FilePath "$repo\.env.local" -Key "LOCAL_APP_PORT")
  if (!$raw) {
    return 3000
  }

  $parsed = 0
  if ([int]::TryParse($raw, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) {
    return $parsed
  }

  Write-Warning "Invalid LOCAL_APP_PORT='$raw' in .env.local. Falling back to 3000."
  return 3000
}

function Sync-CloudflaredPort {
  param(
    [string]$ConfigPath,
    [int]$Port
  )

  $raw = Get-Content $ConfigPath -Raw
  $updated = $raw -replace 'service:\s*http://localhost:\d+', "service: http://localhost:$Port"
  if ($updated -ne $raw) {
    Set-Content -Path $ConfigPath -Value $updated -Encoding UTF8
  }
}

function Is-PortListening {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $conn
}

if (!(Test-Path $cloudflared)) {
  throw "cloudflared not found at: $cloudflared"
}
if (!(Test-Path $config)) {
  throw "cloudflared config not found at: $config"
}

$appPort = Get-ConfiguredPort
Sync-CloudflaredPort -ConfigPath $config -Port $appPort

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

$devProc = $null
$appAlreadyRunning = Is-PortListening -Port $appPort

if (-not $appAlreadyRunning) {
  # Start app in background only when there is no existing listener on the target port.
  $devProc = Start-Process cmd.exe -ArgumentList @(
    "/c",
    "cd /d `"$repo`" && npm run dev -- -p $appPort > `"$devLog`" 2>&1"
  ) -PassThru -WindowStyle Hidden
}

# Wait until Next.js is reachable on configured port.
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$appPort" -UseBasicParsing -TimeoutSec 2
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
    $resp = Invoke-WebRequest -Uri "http://localhost:$appPort" -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
      $ready = $true
    }
  } catch {}
}

if (-not $ready) {
  # Last fallback: check listener table in case web request is blocked by host policy.
  $conn = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    $ready = $true
  }
}

if (-not $ready) {
  $tail = if (Test-Path $devLog) { (Get-Content $devLog -Tail 20) -join "`n" } else { "(no log file)" }
  Write-Warning "Next.js readiness probe did not confirm port $appPort yet. Continuing startup anyway.`nLast log lines:`n$tail"
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
  appPort = $appPort
  appManagedByScript = ($null -ne $devProc)
  devPid = if ($devProc) { $devProc.Id } else { $null }
  tunnelPid = $tunnelProc.Id
} | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Host "Started local stack in background."
Write-Host "App:    http://localhost:$appPort"
if ($appAlreadyRunning) {
  Write-Host "App process already existed on port $appPort, so start:local reused it."
}
Write-Host "Public: https://carbon-gen.shopcarbon.com"
Write-Host "Logs:"
Write-Host "  $devLog"
Write-Host "  $tunnelLog"
Write-Host "  $tunnelErrLog"
