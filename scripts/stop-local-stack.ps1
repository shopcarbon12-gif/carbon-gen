$ErrorActionPreference = "SilentlyContinue"

$repo = Split-Path -Parent $PSScriptRoot
$pidFile = "$repo\.tmp_local_stack_pids.json"

# Stop from pid file first.
if (Test-Path $pidFile) {
  try {
    $p = Get-Content $pidFile -Raw | ConvertFrom-Json
    if ($p.devPid) { cmd /c "taskkill /PID $($p.devPid) /F >nul 2>&1" | Out-Null }
    if ($p.tunnelPid) { cmd /c "taskkill /PID $($p.tunnelPid) /F >nul 2>&1" | Out-Null }
  } catch {}
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Stop Next.js dev listeners on 3001.
$conns = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
foreach ($conn in $conns) {
  cmd /c "taskkill /PID $($conn.OwningProcess) /F >nul 2>&1" | Out-Null
}

# Stop all tunnel processes.
cmd /c "taskkill /IM cloudflared.exe /F >nul 2>&1" | Out-Null

Write-Host "Stopped local stack (Next on 3001 + cloudflared)."
