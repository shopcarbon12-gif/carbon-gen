#requires -Version 5.1
<#
.SYNOPSIS
  Move Cursor profile data to D: without directory junctions on C:.

.DESCRIPTION
  Copies the same trees as %APPDATA%\Cursor and %USERPROFILE%\.cursor into the layout expected by:
    D:\CarbonWmsTooling\Cursor\Launch-Cursor.ps1
    D:\CarbonWmsTooling\Cursor\Cursor-DriveD.cmd

  After you verify launch from D:, use -ArchiveC to:
    - Remove C:\Users\...\AppData\Roaming\Cursor (rename to Cursor.bak-<stamp>) OR remove that junction only
    - Remove C:\Users\...\.cursor if it is a junction, or rename it to .cursor.bak-<stamp>

  You MUST start Cursor only via Cursor-DriveD.cmd or Launch-Cursor.ps1 after archiving C: paths.
  The default Windows shortcut will recreate an empty profile on C:.

  HARD: Close Cursor completely (Task Manager) before running. Do not run from Cursor's terminal.

.PARAMETER DestRoot
  Must match Launch-Cursor.ps1 parent folder (default: D:\CarbonWmsTooling\Cursor).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/cursor-move-d-no-junction.ps1 -WhatIf

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/cursor-move-d-no-junction.ps1

.EXAMPLE
  # After confirming D: launch works:
  powershell -ExecutionPolicy Bypass -File scripts/cursor-move-d-no-junction.ps1 -ArchiveC
#>
param(
    [string]$DestRoot = "D:\CarbonWmsTooling\Cursor",
    [switch]$ArchiveC,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

function Test-CursorGone {
    $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -eq "Cursor" -or $_.ProcessName -like "Cursor*"
    }
    if (@($procs).Count -gt 0) {
        $procs | ForEach-Object { Write-Host "Still running: $($_.ProcessName) PID $($_.Id)" -ForegroundColor Red }
        throw "Close all Cursor processes first."
    }
}

function Test-IsReparsePoint {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $i = Get-Item -LiteralPath $Path -Force
    return [bool]($i.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

function Remove-JunctionOrSymlink {
    param([string]$Path)
    if (-not (Test-IsReparsePoint -Path $Path)) { return $false }
    Write-Host "Removing reparse point (junction/symlink only, target untouched): $Path" -ForegroundColor Cyan
    cmd.exe /c "rd `"$Path`""
    if ($LASTEXITCODE -ne 0) {
        throw "rd failed for $Path (exit $LASTEXITCODE). Try elevated cmd or close apps locking the path."
    }
    return $true
}

$launcher = Join-Path $DestRoot "Launch-Cursor.ps1"
$cmdLauncher = Join-Path $DestRoot "Cursor-DriveD.cmd"
$EditorUserData = Join-Path $DestRoot "editor-user-data"
$SyntheticProfile = Join-Path $DestRoot "profile"
$DotCursorDest = Join-Path $SyntheticProfile ".cursor"

$srcRoaming = Join-Path $env:APPDATA "Cursor"
$srcDot = Join-Path $env:USERPROFILE ".cursor"

Write-Host "=== cursor-move-d-no-junction ===" -ForegroundColor Cyan
Write-Host "DestRoot:        $DestRoot"
Write-Host "Source Roaming:  $srcRoaming"
Write-Host "Source .cursor:  $srcDot"
Write-Host "Dest editor:     $EditorUserData"
Write-Host "Dest .cursor:    $DotCursorDest"
Write-Host "ArchiveC:        $ArchiveC"
Write-Host ""

if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Missing $launcher - fix DestRoot or create CarbonWmsTooling\Cursor launcher tree."
}

if (-not (Test-Path -LiteralPath $srcRoaming)) {
    throw "Roaming folder not found: $srcRoaming"
}
if (-not (Test-Path -LiteralPath $srcDot)) {
    throw ".cursor path not found: $srcDot"
}

if ($WhatIf) {
    Write-Host "WhatIf: Would robocopy Roaming -> editor-user-data and .cursor -> profile\.cursor" -ForegroundColor Yellow
    if ($ArchiveC) {
        Write-Host "WhatIf: Would remove/rename C: Roaming and .cursor (junction -> rd only)." -ForegroundColor Yellow
    }
    exit 0
}

Test-CursorGone

New-Item -ItemType Directory -Force -Path $EditorUserData, $SyntheticProfile | Out-Null

$robolog = Join-Path $DestRoot "last-cursor-move-d-robocopy.log"
function Invoke-RobocopyOk {
    param([string]$From, [string]$To, [string]$Label)
    Write-Host "Robocopy ($Label): $From -> $To" -ForegroundColor Cyan
    $null = robocopy $From $To /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /NFL /NDL /NJH /NJS /LOG:$robolog /TEE
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed ($Label) exit $LASTEXITCODE - see $robolog"
    }
    Write-Host "Robocopy OK ($Label) exit $LASTEXITCODE" -ForegroundColor Green
}

Invoke-RobocopyOk -From $srcRoaming -To $EditorUserData -Label "Roaming"
Invoke-RobocopyOk -From $srcDot -To $DotCursorDest -Label "dot-cursor"

Write-Host ""
Write-Host "Copy finished. Test before archiving C: paths." -ForegroundColor Green
Write-Host "  $cmdLauncher"
Write-Host "  or: powershell -ExecutionPolicy Bypass -File `"$launcher`""
Write-Host ""

if (-not $ArchiveC) {
    Write-Host "C: originals are UNTOUCHED. Re-run with -ArchiveC after D: launch works." -ForegroundColor Yellow
    exit 0
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Test-CursorGone

# Roaming: junction -> rd only; directory -> rename to .bak
if (Test-Path -LiteralPath $srcRoaming) {
    if (Test-IsReparsePoint -Path $srcRoaming) {
        Remove-JunctionOrSymlink -Path $srcRoaming | Out-Null
    }
    else {
        $bakName = "Cursor.bak-$stamp"
        $bakPath = Join-Path (Split-Path -Parent $srcRoaming) $bakName
        Write-Host "Renaming Roaming folder -> $bakName" -ForegroundColor Cyan
        Rename-Item -LiteralPath $srcRoaming -NewName $bakName
    }
}

# .cursor: junction -> rd only; directory -> rename
if (Test-Path -LiteralPath $srcDot) {
    if (Test-IsReparsePoint -Path $srcDot) {
        Remove-JunctionOrSymlink -Path $srcDot | Out-Null
    }
    else {
        $bakName = ".cursor.bak-$stamp"
        Write-Host "Renaming .cursor folder -> $bakName" -ForegroundColor Cyan
        Rename-Item -LiteralPath $srcDot -NewName $bakName
    }
}

Write-Host ""
Write-Host "ArchiveC complete. Use ONLY:" -ForegroundColor Green
Write-Host "  $cmdLauncher"
Write-Host "Stock Cursor shortcuts will create a NEW empty profile on C: if used." -ForegroundColor Yellow
