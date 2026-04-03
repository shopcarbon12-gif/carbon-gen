#requires -Version 5.1
<#
.SYNOPSIS
  Backs up carbon-gen and carbon-warehouse-management (CarbonWMS) trees to D:\backup c\project-repos\, zips each, optional scp to Ubuntu.

.DESCRIPTION
  Sources default to D:\Projects\My project\carbon-gen and D:\Projects\My project\carbon-warehouse-management.
  By default robocopy EXCLUDES heavy/regenerable dirs: node_modules, .next, dist, build, .turbo, coverage, tmp, Temp.
  Pass -FullTree to copy everything (very large zips).

  This script NEVER deletes your D: project folders. To remove Cursor profile data from C: only, use
  scripts\backup-c-to-d-and-ubuntu.ps1 with -DeleteSourcesAfterCopy after you verify backups.

.NOTES
  Run with Cursor closed if either repo is open with file locks. Prefer external PowerShell.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-projects-to-d.ps1 -WhatIf

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-projects-to-d.ps1 -SkipScp

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-projects-to-d.ps1 -SshHost "127.0.0.1" -SshPort 2222 -SshUser "eliorp1"
#>

param(
    [string]$BackupRoot = "D:\backup c\project-repos",
    [string]$CarbonGenPath = "D:\Projects\My project\carbon-gen",
    [string]$CarbonWmsPath = "D:\Projects\My project\carbon-warehouse-management",
    [switch]$FullTree,
    [string]$SshHost = "",
    [int]$SshPort = 22,
    [string]$SshUser = "",
    [string]$RemotePath = "~/backup-from-windows-c",
    [switch]$SkipScp,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$reportLines = [System.Collections.Generic.List[string]]::new()

function Add-ReportLine {
    param([string]$Line)
    $script:reportLines.Add($Line)
    Write-Host $Line
}

function Format-Gb {
    param([long]$Bytes)
    if ($Bytes -lt 0) { $Bytes = 0 }
    return "{0:N2} GB" -f ($Bytes / 1GB)
}

function Get-DirSizeBytes {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return 0L }
    $sum = 0L
    Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue | ForEach-Object {
        try { $sum += $_.Length } catch {}
    }
    return $sum
}

$sources = [ordered]@{
    "carbon-gen"                    = $CarbonGenPath
    "carbon-warehouse-management"   = $CarbonWmsPath
}

$excludeDirs = @("node_modules", ".next", "dist", "build", ".turbo", "coverage", "tmp", "Temp")
if ($FullTree) { $excludeDirs = @() }

Add-ReportLine "=== Backup project repos -> D: (+ optional Ubuntu) ==="
Add-ReportLine "Started (local): $(Get-Date -Format o)"
Add-ReportLine "BackupRoot: $BackupRoot"
Add-ReportLine "WhatIf: $WhatIf"
Add-ReportLine "FullTree (no /XD excludes): $FullTree"

$archivesDir = Join-Path $BackupRoot "archives"
if (-not $WhatIf) {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $archivesDir -Force | Out-Null
}

$totalBackedBytes = 0L
$results = @()

foreach ($label in $sources.Keys) {
    $src = $sources[$label]
    $dest = Join-Path $BackupRoot $label

    Add-ReportLine ""
    Add-ReportLine "--- $label ---"
    Add-ReportLine "Source: $src"

    if (-not (Test-Path -LiteralPath $src)) {
        Add-ReportLine "SKIP (path missing)"
        $results += [pscustomobject]@{ Label = $label; Source = $src; Status = "missing"; Bytes = 0L }
        continue
    }

    $srcBytes = Get-DirSizeBytes $src
    Add-ReportLine "Source size (scan, may include excluded dirs in this count): $(Format-Gb $srcBytes) ($srcBytes bytes)"

    if ($WhatIf) {
        Add-ReportLine "WHATIF: robocopy -> $dest ; zip -> $(Join-Path $archivesDir "$label.zip")"
        $results += [pscustomobject]@{ Label = $label; Source = $src; Status = "whatif"; Bytes = $srcBytes }
        $totalBackedBytes += $srcBytes
        continue
    }

    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    $robolog = Join-Path $env:TEMP "robocopy-proj-$label-$ts.log"
    $args = @("`"$src`"", "`"$dest`"", "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:5", "/MT:8", "/NFL", "/NDL", "/NP", "/LOG:`"$robolog`"")
    if ($excludeDirs.Count -gt 0) {
        $args += @("/XD") + $excludeDirs
    }
    $rc = Start-Process -FilePath "robocopy.exe" -ArgumentList $args -Wait -PassThru -NoNewWindow
    if ($rc.ExitCode -ge 8) {
        Add-ReportLine "ROBOCOPY exit $($rc.ExitCode) - see $robolog"
        throw "Robocopy failed for $label (exit $($rc.ExitCode))"
    }

    $destBytes = Get-DirSizeBytes $dest
    Add-ReportLine "Copied tree size under dest: $(Format-Gb $destBytes)"
    $totalBackedBytes += $destBytes

    $zipPath = Join-Path $archivesDir "$label.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

    $tar = Join-Path $env:SystemRoot "System32\tar.exe"
    if (-not (Test-Path $tar)) {
        Add-ReportLine "WARN: tar.exe missing - skipping zip for $label"
        $results += [pscustomobject]@{ Label = $label; Source = $src; Status = "copied-no-zip"; Bytes = $destBytes }
        continue
    }

    Push-Location $BackupRoot
    try {
        & $tar -a -c -f $zipPath $label
        if ($LASTEXITCODE -ne 0) { throw "tar zip failed exit $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    $zipLen = (Get-Item -LiteralPath $zipPath).Length
    Add-ReportLine "Zip: $zipPath ($(Format-Gb $zipLen))"
    $results += [pscustomobject]@{ Label = $label; Source = $src; Status = "copied-zipped"; Bytes = $destBytes; ZipBytes = $zipLen }
}

Add-ReportLine ""
Add-ReportLine "=== Totals (bytes under $BackupRoot after copy) ==="
Add-ReportLine "Approx total backed: $(Format-Gb $totalBackedBytes) ($totalBackedBytes bytes)"

if (-not $SkipScp -and -not $WhatIf -and $SshHost -and $SshUser) {
    $scp = Get-Command scp -ErrorAction SilentlyContinue
    if (-not $scp) {
        Add-ReportLine "WARN: scp not on PATH."
    } else {
        $remoteArchives = "$RemotePath/archives/projects"
        Add-ReportLine ""
        Add-ReportLine "=== scp project zips (port $SshPort) ==="
        $ssh = Get-Command ssh -ErrorAction SilentlyContinue
        if ($ssh) {
            & ssh -p $SshPort -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${SshUser}@${SshHost}" "mkdir -p $remoteArchives" 2>&1 | Out-String | ForEach-Object { Add-ReportLine $_ }
        }
        foreach ($z in Get-ChildItem -LiteralPath $archivesDir -Filter "*.zip" -ErrorAction SilentlyContinue) {
            Add-ReportLine "scp $($z.FullName) -> ${SshUser}@${SshHost}:$remoteArchives/"
            & scp -P $SshPort -o BatchMode=yes -o StrictHostKeyChecking=accept-new $z.FullName "${SshUser}@${SshHost}:$remoteArchives/" 2>&1 | ForEach-Object { Add-ReportLine $_ }
            if ($LASTEXITCODE -ne 0) {
                Add-ReportLine "scp exit $LASTEXITCODE for $($z.Name)"
            }
        }
    }
} elseif (-not $WhatIf) {
    Add-ReportLine ""
    Add-ReportLine "scp skipped (-SkipScp or missing -SshHost/-SshUser)"
}

Add-ReportLine ""
Add-ReportLine "Finished (local): $(Get-Date -Format o)"

$reportPath = Join-Path $BackupRoot "PROJECTS_BACKUP_REPORT_$ts.txt"
if (-not $WhatIf) {
    $reportLines | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-Host ""
    Write-Host "Report written: $reportPath"
}
