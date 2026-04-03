#requires -Version 5.1
<#
.SYNOPSIS
  Backs up Cursor-related (and optional) C: profile paths to D:\backup c\<folder-name>\,
  creates zip archives, optionally uploads to Ubuntu via scp (OpenSSH client).

.DESCRIPTION
  Matches C_DRIVE / c-drive-migration-report scope: Roaming\Cursor, .cursor, Local\Cursor.
  MUST close Cursor completely before run (or use -StopCursorProcesses - do not run from Cursor's terminal).

  OpenSSH: use port 22 with bridged VM IP, or -SshPort 2222 if VirtualBox NAT forwards host 2222 -> guest 22.

  This script COPIES to D:; it does NOT delete C: sources unless you pass -DeleteSourcesAfterCopy
  (only after successful copy + zip).

.NOTES
  Run from elevated PowerShell if robocopy hits permission errors.
  Final report: <BackupRoot>\BACKUP_REPORT_<timestamp>.txt

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-c-to-d-and-ubuntu.ps1 -SshHost "192.168.1.50" -SshUser "eliorp1"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup-c-to-d-and-ubuntu.ps1 -SshHost "127.0.0.1" -SshPort 2222 -SshUser "eliorp1"
#>

param(
    [string]$BackupRoot = "D:\backup c",
    [string]$SshHost = "",
    [int]$SshPort = 22,
    [string]$SshUser = "",
    [string]$RemotePath = "~/backup-from-windows-c",
    [switch]$SkipScp,
    [switch]$StopCursorProcesses,
    [switch]$DeleteSourcesAfterCopy,
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

function Get-CFreeBytes {
    $v = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
    if ($v) { return [long]$v.SizeRemaining }
    $d = Get-PSDrive C -ErrorAction SilentlyContinue
    if ($d) { return [long]$d.Free }
    return -1L
}

function Stop-CursorFamily {
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -eq "Cursor" -or $_.ProcessName -like "Cursor*"
    } | ForEach-Object {
        Write-Host "Stopping $($_.ProcessName) PID $($_.Id)"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 3
}

# --- Sources: (Label for folder under BackupRoot) = full path
$sources = [ordered]@{
    "AppData-Roaming-Cursor"   = (Join-Path $env:APPDATA "Cursor")
    "UserProfile-dot-cursor"   = (Join-Path $env:USERPROFILE ".cursor")
    "AppData-Local-Cursor"     = (Join-Path $env:LOCALAPPDATA "Cursor")
}

Add-ReportLine "=== Backup C: -> D: (+ optional Ubuntu) ==="
Add-ReportLine "Started (local): $(Get-Date -Format o)"
Add-ReportLine "BackupRoot: $BackupRoot"
Add-ReportLine "WhatIf: $WhatIf"

$cBefore = Get-CFreeBytes
Add-ReportLine "C: free BEFORE: $(Format-Gb $cBefore) ($cBefore bytes)"

if ($StopCursorProcesses) {
    Stop-CursorFamily
}

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
    Add-ReportLine "Source size (scan): $(Format-Gb $srcBytes) ($srcBytes bytes)"

    if ($WhatIf) {
        Add-ReportLine "WHATIF: robocopy -> $dest ; then zip -> $(Join-Path $archivesDir "$label.zip")"
        $results += [pscustomobject]@{ Label = $label; Source = $src; Status = "whatif"; Bytes = $srcBytes }
        $totalBackedBytes += $srcBytes
        continue
    }

    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    # /MIR would delete extra files in dest; use /E copy subdirs including empty
    $robolog = Join-Path $env:TEMP "robocopy-$label-$ts.log"
    $args = @("`"$src`"", "`"$dest`"", "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:5", "/MT:8", "/NFL", "/NDL", "/NP", "/LOG:`"$robolog`"")
    $rc = Start-Process -FilePath "robocopy.exe" -ArgumentList $args -Wait -PassThru -NoNewWindow
    # robocopy exit 0-7 = success with different meanings
    if ($rc.ExitCode -ge 8) {
        Add-ReportLine "ROBOCOPY exit $($rc.ExitCode) - see $robolog"
        throw "Robocopy failed for $label (exit $($rc.ExitCode))"
    }

    $destBytes = Get-DirSizeBytes $dest
    Add-ReportLine "Copied tree size under dest: $(Format-Gb $destBytes)"
    $totalBackedBytes += $destBytes

    $zipPath = Join-Path $archivesDir "$label.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

    # Windows tar creates zip (requires Windows 10 1803+)
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
Add-ReportLine "=== Totals (bytes counted on D: after copy) ==="
Add-ReportLine "Approx total backed (folder trees on D:): $(Format-Gb $totalBackedBytes) ($totalBackedBytes bytes)"

# Optional: remove C: sources after success
if ($DeleteSourcesAfterCopy -and -not $WhatIf) {
    foreach ($r in $results) {
        if ($r.Status -notmatch "^copied") { continue }
        $p = $sources[$r.Label]
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        if (Test-Path -LiteralPath $p) {
            Add-ReportLine "DELETE source: $p"
            Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop
        }
    }
}

$cAfter = Get-CFreeBytes
Add-ReportLine ""
Add-ReportLine "C: free AFTER:  $(Format-Gb $cAfter) ($cAfter bytes)"
if ($cBefore -ge 0 -and $cAfter -ge 0) {
    $delta = $cAfter - $cBefore
    Add-ReportLine "C: free DELTA:  $(Format-Gb $delta) ($delta bytes) - positive = more free on C:"
}

# SCP archives + optional full folders
if (-not $SkipScp -and -not $WhatIf -and $SshHost -and $SshUser) {
    $scp = Get-Command scp -ErrorAction SilentlyContinue
    if (-not $scp) {
        Add-ReportLine "WARN: scp not on PATH (install OpenSSH Client optional feature)."
    } else {
        $remoteSpec = "${SshUser}@${SshHost}:${RemotePath}/"
        Add-ReportLine ""
        Add-ReportLine "=== scp to $remoteSpec (port $SshPort) ==="
        # Ensure remote dir exists (ssh one shot)
        $ssh = Get-Command ssh -ErrorAction SilentlyContinue
        if ($ssh) {
            & ssh -p $SshPort -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${SshUser}@${SshHost}" "mkdir -p $RemotePath/archives" 2>&1 | Out-String | ForEach-Object { Add-ReportLine $_ }
        }
        foreach ($z in Get-ChildItem -LiteralPath $archivesDir -Filter "*.zip" -ErrorAction SilentlyContinue) {
            Add-ReportLine "scp $($z.FullName) -> $remoteSpec/archives/"
            & scp -P $SshPort -o BatchMode=yes -o StrictHostKeyChecking=accept-new $z.FullName "${SshUser}@${SshHost}:${RemotePath}/archives/" 2>&1 | ForEach-Object { Add-ReportLine $_ }
            if ($LASTEXITCODE -ne 0) {
                Add-ReportLine "scp exit $LASTEXITCODE for $($z.Name) - fix SSH keys or use password session manually"
            }
        }
    }
} elseif (-not $WhatIf) {
    Add-ReportLine ""
    Add-ReportLine "scp skipped (use -SshHost and -SshUser, or pass -SkipScp)"
}

Add-ReportLine ""
Add-ReportLine "Finished (local): $(Get-Date -Format o)"

$reportPath = Join-Path $BackupRoot "BACKUP_REPORT_$ts.txt"
if (-not $WhatIf) {
    $reportLines | Set-Content -LiteralPath $reportPath -Encoding UTF8
    Write-Host ""
    Write-Host "Report written: $reportPath"
}
