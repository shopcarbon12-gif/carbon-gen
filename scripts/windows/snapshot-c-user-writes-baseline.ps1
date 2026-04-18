#requires -Version 5.1
<#
.SYNOPSIS
  Save a baseline of files under typical C:\ user write locations (for Ubuntu dev — check Windows did not grow C:).

.DESCRIPTION
  Walks fixed roots (AppData Local/Roaming, Temp, etc.), records path + LastWriteTime + Length.
  Saves CSV + manifest to D:\CarbonWmsTooling\tmp (override with -OutDir). No writes to C:\ except normal PS temp if any.

.PARAMETER OutDir
  Directory on D: (or other non-C) for baseline CSV.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\snapshot-c-user-writes-baseline.ps1

.NOTES
  First run can take several minutes (large AppData). Re-run before a session; use compare script after.
#>

param(
    [string]$OutDir = "D:\CarbonWmsTooling\tmp\c-drive-watch",
    [string[]]$ExtraRoots = @()
)

$ErrorActionPreference = "Continue"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$user = $env:USERPROFILE
if (-not $user) { throw "USERPROFILE not set" }

$roots = [System.Collections.Generic.List[string]]::new()
foreach ($r in @(
        (Join-Path $env:LOCALAPPDATA ""),
        (Join-Path $env:APPDATA ""),
        (Join-Path $env:TEMP ""),
        (Join-Path $user "AppData\Local\Temp"),
        (Join-Path $user ".cursor"),
        (Join-Path $user ".docker")  # if Docker Desktop still on C
    )) {
    $t = $r.TrimEnd('\')
    if ($t -and (Test-Path -LiteralPath $t)) { [void]$roots.Add($t) }
}
foreach ($e in $ExtraRoots) {
    if ($e -and (Test-Path -LiteralPath $e)) {
        $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($e)
        if (-not $roots.Contains($full)) { [void]$roots.Add($full) }
    }
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$csv = Join-Path $OutDir "c-user-writes-baseline-$ts.csv"
$meta = Join-Path $OutDir "c-user-writes-LATEST-BASELINE.txt"

Write-Host "Roots ($($roots.Count)):"
$roots | ForEach-Object { Write-Host "  $_" }
Write-Host "Scanning (may take a few minutes)..."

$list = [System.Collections.Generic.List[object]]::new()
foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            [void]$list.Add([pscustomobject]@{
                    FullName      = $_.FullName
                    LastWriteTime = $_.LastWriteTimeUtc.ToString("o")
                    Length        = $_.Length
                })
        }
        catch {}
    }
}

$list | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
Set-Content -LiteralPath $meta -Value $csv -Encoding UTF8
$rootsFile = Join-Path $OutDir "c-user-writes-ROOTS.txt"
$roots | Set-Content -LiteralPath $rootsFile -Encoding UTF8
Write-Host "Baseline rows: $($list.Count)"
Write-Host "Wrote: $csv"
Write-Host "Pointer: $meta"
