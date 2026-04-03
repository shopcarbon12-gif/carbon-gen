#requires -Version 5.1
<#
.SYNOPSIS
  Copies Cursor profile data from C: to D:, then replaces the original folders with directory junctions to free C: space.

.DESCRIPTION
  Sources (typical):
    - %APPDATA%\Cursor  (Roaming - settings, workspaceStorage, etc.)
    - %USERPROFILE%\.cursor  (extensions, rules cache, MCP config, etc.)

  Destination (default):
    D:\CursorProfile\junction-targets\Roaming-Cursor
    D:\CursorProfile\junction-targets\UserProfile-dot-cursor

  After a verified robocopy, renames each C: folder to *.bak-<timestamp>, creates mklink-style junctions
  so the old paths still work for apps that expect C:\Users\...\AppData\Roaming\Cursor.

  HARD REQUIREMENT: Exit Cursor completely (Task Manager: Cursor, Cursor Helper, etc.) before running.
  Do NOT run from Cursor's integrated terminal while Cursor is the app being migrated.

.NOTES
  - Complements D:\CarbonWmsTooling\Cursor\Launch-Cursor.ps1 (no-junction mode). If you use ONLY that launcher,
    C: paths matter less - but junctions still help anything that uses default %APPDATA%\Cursor.
  - This script does NOT move D:\CursorData, D:\cursor (install), or non-Cursor C: data.
  - Rollback (manual): remove junction (rd /s /q only removes junction, not target), rename .bak folder back.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\move-cursor-profile-c-to-d-junction.ps1 -WhatIf

.EXAMPLE
  # Cursor fully closed - external elevated PowerShell if junction creation fails:
  powershell -ExecutionPolicy Bypass -File scripts\move-cursor-profile-c-to-d-junction.ps1
#>

param(
    [string]$DestRoot = "D:\CursorProfile\junction-targets",
    [switch]$WhatIf,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Test-CursorProcesses {
    $names = @("Cursor", "cursor")
    $found = Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.ProcessName -or $_.ProcessName -like "Cursor*" }
    return @($found)
}

function Ensure-NotAlreadyJunction {
    param([string]$Path, [string]$Label)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.LinkType -eq "Junction" -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "$Label is already a reparse point (junction/symlink): $Path - aborting to avoid nesting. Remove or fix manually first."
    }
}

$roamingSrc = Join-Path $env:APPDATA "Cursor"
$dotCursorSrc = Join-Path $env:USERPROFILE ".cursor"

$roamingDest = Join-Path $DestRoot "Roaming-Cursor"
$dotDest = Join-Path $DestRoot "UserProfile-dot-cursor"

$ts = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "=== move-cursor-profile-c-to-d-junction ===" -ForegroundColor Cyan
Write-Host "Roaming source:  $roamingSrc"
Write-Host "Roaming dest:    $roamingDest"
Write-Host ".cursor source:  $dotCursorSrc"
Write-Host ".cursor dest:    $dotDest"
Write-Host "WhatIf: $WhatIf"
Write-Host ""

if (-not (Test-Path -LiteralPath $roamingSrc)) {
    throw "Missing Roaming folder: $roamingSrc"
}
if (-not (Test-Path -LiteralPath $dotCursorSrc)) {
    throw "Missing .cursor folder: $dotCursorSrc"
}

Ensure-NotAlreadyJunction -Path $roamingSrc -Label "Roaming Cursor"
Ensure-NotAlreadyJunction -Path $dotCursorSrc -Label "User .cursor"

if ($WhatIf) {
    Write-Host "WHATIF: Would robocopy both trees to D:, rename C: folders to .bak-$ts, create junctions." -ForegroundColor Yellow
    Write-Host "WHATIF: Real run requires Cursor fully closed (or -Force, not recommended)." -ForegroundColor Yellow
    exit 0
}

if (-not $Force) {
    $procs = Test-CursorProcesses
    if ($procs.Count -gt 0) {
        $procs | ForEach-Object { Write-Host "Running: $($_.ProcessName) PID $($_.Id)" -ForegroundColor Red }
        throw "Close all Cursor processes first, or re-run with -Force (risky while Cursor is open)."
    }
}

New-Item -ItemType Directory -Path $DestRoot -Force | Out-Null
New-Item -ItemType Directory -Path $roamingDest -Force | Out-Null
New-Item -ItemType Directory -Path $dotDest -Force | Out-Null

function Invoke-RobocopyMirror {
    param([string]$From, [string]$To)
    Write-Host "Robocopy: $From -> $To" -ForegroundColor Cyan
    $log = Join-Path $env:TEMP "robocopy-cursor-junction-$([IO.Path]::GetRandomFileName()).log"
    $args = @($From, $To, "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:3", "/NFL", "/NDL", "/NP", "/LOG:$log")
    $p = Start-Process -FilePath "robocopy.exe" -ArgumentList $args -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ge 8) {
        throw "Robocopy failed exit $($p.ExitCode). Log: $log"
    }
    Write-Host "Robocopy OK (exit $($p.ExitCode)). Log: $log"
}

Invoke-RobocopyMirror -From $roamingSrc -To $roamingDest
Invoke-RobocopyMirror -From $dotCursorSrc -To $dotDest

$roamingParent = Split-Path -Parent $roamingSrc
$roamingLeaf = Split-Path -Leaf $roamingSrc
$roamingBakName = "${roamingLeaf}.bak-$ts"
$roamingBak = Join-Path $roamingParent $roamingBakName

$dotParent = Split-Path -Parent $dotCursorSrc
$dotLeaf = Split-Path -Leaf $dotCursorSrc
$dotBakName = "${dotLeaf}.bak-$ts"
$dotBak = Join-Path $dotParent $dotBakName

Write-Host "Renaming C: folders to backup names..." -ForegroundColor Cyan
Rename-Item -LiteralPath $roamingSrc -NewName $roamingBakName
Rename-Item -LiteralPath $dotCursorSrc -NewName $dotBakName

try {
    Write-Host "Creating junction: $roamingSrc -> $roamingDest" -ForegroundColor Cyan
    New-Item -ItemType Junction -Path $roamingSrc -Target $roamingDest | Out-Null
}
catch {
    Write-Host "FAILED junction Roaming - restoring rename" -ForegroundColor Red
    Rename-Item -LiteralPath $roamingBak -NewName $roamingLeaf
    throw
}

try {
    Write-Host "Creating junction: $dotCursorSrc -> $dotDest" -ForegroundColor Cyan
    New-Item -ItemType Junction -Path $dotCursorSrc -Target $dotDest | Out-Null
}
catch {
    Write-Host "FAILED junction .cursor - restoring Roaming and .cursor renames" -ForegroundColor Red
    Remove-Item -LiteralPath $roamingSrc -Force
    Rename-Item -LiteralPath $roamingBak -NewName $roamingLeaf
    Rename-Item -LiteralPath $dotBak -NewName $dotLeaf
    throw
}

Write-Host ""
Write-Host "Done. Junctions are live. Backup folders (keep until you verify):" -ForegroundColor Green
Write-Host "  $roamingBak"
Write-Host "  $dotBak"
Write-Host ""
Write-Host "After a few days with Cursor working, delete the .bak-* folders from C: to reclaim space." -ForegroundColor Yellow
Write-Host "Target data on D: (canonical for junctions):" -ForegroundColor Green
Write-Host "  $roamingDest"
Write-Host "  $dotDest"
