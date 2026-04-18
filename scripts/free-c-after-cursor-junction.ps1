#requires -Version 5.1
<#
.SYNOPSIS
  Removes ONLY the pre-junction Cursor backup folders on C: (Cursor.bak-* / .cursor.bak-*) after you confirm Ubuntu + D: backups.

.DESCRIPTION
  Junctions point %APPDATA%\Cursor and %USERPROFILE%\.cursor at D:\ — they do NOT delete the old full copies renamed to *.bak-*.
  Those .bak folders stay on C: until you delete them (often ~2–3 GB for Roaming alone).

  This script does NOT touch live junctions or D:\CursorProfile\junction-targets.

  Separate issue: Windows pagefile on C: is often 4–8+ GB. Moving it requires Admin → System Properties → Virtual memory.
  Run:  SystemPropertiesAdvanced.exe  → Advanced → Performance Settings → Advanced → Virtual memory → Change

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\free-c-after-cursor-junction.ps1 -WhatIf

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\free-c-after-cursor-junction.ps1 -ConfirmDelete
#>

param(
    [switch]$WhatIf,
    [switch]$ConfirmDelete
)

$ErrorActionPreference = "Stop"

$roamingParent = Join-Path $env:APPDATA "."
$roamingParent = Split-Path (Join-Path $env:APPDATA "Cursor") -Parent
$cursorJunction = Join-Path $env:APPDATA "Cursor"
$dotJunction = Join-Path $env:USERPROFILE ".cursor"

function Get-DirSizeGb([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    $b = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    return [math]::Round($b / 1GB, 2)
}

Write-Host "=== free-c-after-cursor-junction ===" -ForegroundColor Cyan
Write-Host "Live paths (should be junctions after migration):"
foreach ($p in @($cursorJunction, $dotJunction)) {
    if (-not (Test-Path -LiteralPath $p)) {
        Write-Host "  MISSING: $p" -ForegroundColor Red
        continue
    }
    $i = Get-Item -LiteralPath $p -Force
    $isRep = ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    Write-Host ("  {0}  Reparse={1}  LinkType={2}" -f $p, $isRep, $i.LinkType)
}

$baks = @()
$baks += Get-ChildItem -LiteralPath $roamingParent -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "Cursor.bak-*" }
$baks += Get-ChildItem -LiteralPath $env:USERPROFILE -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ".cursor.bak-*" }

Write-Host ""
Write-Host "Backup folders on C: (safe to delete after mirror verified):" -ForegroundColor Yellow
if ($baks.Count -eq 0) {
    Write-Host "  (none found)"
} else {
    $total = 0.0
    foreach ($d in $baks) {
        $gb = Get-DirSizeGb $d.FullName
        $total += $gb
        Write-Host ("  {0:N2} GB  {1}" -f $gb, $d.FullName)
    }
    Write-Host ("  Approx total reclaim from these: {0:N2} GB" -f $total) -ForegroundColor Green
}

if ($WhatIf) {
    Write-Host ""
    Write-Host "WHATIF: no deletes. Re-run with -ConfirmDelete to remove the .bak-* folders listed above." -ForegroundColor Yellow
    exit 0
}

if (-not $ConfirmDelete) {
    Write-Host ""
    Write-Host "No action taken. Use -ConfirmDelete after Ubuntu/archives are verified, or -WhatIf to preview." -ForegroundColor Yellow
    exit 0
}

foreach ($d in $baks) {
    Write-Host "Removing $($d.FullName) ..." -ForegroundColor Cyan
    Remove-Item -LiteralPath $d.FullName -Recurse -Force -ErrorAction Stop
}

Write-Host "Done. Check This PC for C: free space." -ForegroundColor Green
Write-Host ""
Write-Host "If C: is still tight: check pagefile on C (often several GB). Admin: SystemPropertiesAdvanced -> Virtual memory." -ForegroundColor Yellow
