$ErrorActionPreference = "SilentlyContinue"

$repo = Split-Path -Parent $PSScriptRoot
$pidFile = "$repo\.tmp_local_stack_pids.json"

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

  return 3000
}

$appPort = Get-ConfiguredPort

# Stop from pid file first.
if (Test-Path $pidFile) {
  try {
    $p = Get-Content $pidFile -Raw | ConvertFrom-Json
    if ($p.devPid) { cmd /c "taskkill /PID $($p.devPid) /F >nul 2>&1" | Out-Null }
    if ($p.tunnelPid) { cmd /c "taskkill /PID $($p.tunnelPid) /F >nul 2>&1" | Out-Null }
  } catch {}
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Stop all tunnel processes.
cmd /c "taskkill /IM cloudflared.exe /F >nul 2>&1" | Out-Null

Write-Host "Stopped local stack (configured app port $appPort + cloudflared)."
