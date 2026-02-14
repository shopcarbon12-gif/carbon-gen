$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$port = 3000
$node20Dir = "D:\Tools\node-v20.20.0-win-x64"
$node20Exe = "$node20Dir\node.exe"
$node20NpmCli = "$node20Dir\node_modules\npm\bin\npm-cli.js"

function Move-RecursiveBackupSnapshots {
  param([string]$RepoPath)

  $backupsDir = Join-Path $RepoPath "backups"
  if (!(Test-Path $backupsDir)) {
    return
  }

  $projectsRoot = Split-Path -Parent (Split-Path -Parent $RepoPath)
  $externalBackupRoot = Join-Path $projectsRoot "carbon-gen-backups-outside"
  $movedAny = $false

  $candidates = Get-ChildItem $backupsDir -Directory -ErrorAction SilentlyContinue | Where-Object {
    $dir = $_.FullName
    (Test-Path (Join-Path $dir "package.json")) -and
    (Test-Path (Join-Path $dir "app")) -and
    (
      (Test-Path (Join-Path $dir "backups")) -or
      (Test-Path (Join-Path $dir "node_modules")) -or
      (Test-Path (Join-Path $dir ".next"))
    )
  }

  foreach ($candidate in $candidates) {
    if (!(Test-Path $externalBackupRoot)) {
      New-Item -ItemType Directory -Path $externalBackupRoot -Force | Out-Null
    }

    $target = Join-Path $externalBackupRoot $candidate.Name
    if (Test-Path $target) {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $target = Join-Path $externalBackupRoot ("{0}-{1}" -f $candidate.Name, $stamp)
    }

    Move-Item -Path $candidate.FullName -Destination $target -Force
    Write-Warning "Moved recursive backup out of repo: $($candidate.FullName) -> $target"
    $movedAny = $true
  }

  if ($movedAny) {
    Write-Host "Workspace guard moved recursive backups out of the project. Dev startup continues."
  }
}

function Get-ListenerPid {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $conn) {
    return $null
  }
  return [int]$conn.OwningProcess
}

function Is-RepoNextProcess {
  param([int]$ProcessId)
  if (-not $ProcessId) {
    return $false
  }

  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId"
    if (-not $proc) {
      return $false
    }
    $cmd = [string]$proc.CommandLine
    return ($cmd -like "*$repo*") -and ($cmd -like "*next*dev*")
  } catch {
    return $false
  }
}

Move-RecursiveBackupSnapshots -RepoPath $repo

$listenerPid = Get-ListenerPid -Port $port
if ($listenerPid) {
  if (Is-RepoNextProcess -Pid $listenerPid) {
    Write-Host "Project dev server already owns port $port (PID $listenerPid)."
    Write-Host "Open: http://localhost:$port"
    exit 0
  }

  Write-Warning "Port $port is in use by PID $listenerPid. Reclaiming it for this project."
  cmd /c "taskkill /PID $listenerPid /F >nul 2>&1" | Out-Null
  Start-Sleep -Milliseconds 800
}

Push-Location $repo
try {
  # Prevent OpenNext Cloudflare dev runtime from hijacking normal local Next dev.
  $env:VERCEL = "1"
  if (Test-Path $node20Dir) {
    $env:Path = "$node20Dir;$env:Path"
  }
  if ((Test-Path $node20Exe) -and (Test-Path $node20NpmCli)) {
    & $node20Exe $node20NpmCli run dev:raw -- -p $port
  } else {
    npm run dev:raw -- -p $port
  }
} finally {
  Pop-Location
}
