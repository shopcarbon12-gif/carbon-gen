#requires -Version 5.1
<#
.SYNOPSIS
  Copy-only: mirror selected regenerable cache/temp trees from C: under D:\Elior_backup (never deletes from C:).

.DESCRIPTION
  Does NOT copy arbitrary C:\ or whole profile. Only an explicit whitelist (TEMP, npm-cache, Gradle caches,
  small IDE cache folders). Each copied file is listed in MANIFEST.tsv (Destination<TAB>Source) for restore.

  "Per-file txt" at scale would mean tens of thousands of files; the manifest is one row per file instead.

.PARAMETER DestRoot
  Default D:\Elior_backup

.PARAMETER WhatIf
  List sources that exist and would be copied; no copy.

.PARAMETER SkipLargeTemp
  If set, skip %TEMP% and LocalAppData\Temp when larger than MaxTempGb (default: copy temp regardless of size).

.PARAMETER MaxTempGb
  Used only with -SkipLargeTemp (default 5).

.NOTES
  Run with Cursor/VS Code closed for cleaner copies. Some paths may need elevation; errors are logged.
#>
param(
    [string]$DestRoot = "D:\Elior_backup",
    [switch]$WhatIf,
    [switch]$SkipLargeTemp,
    [double]$MaxTempGb = 5.0
)

$ErrorActionPreference = "Continue"
$runId = "run-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$runRoot = Join-Path $DestRoot $runId
$cMirror = Join-Path $runRoot "C"

function Get-FolderSizeGb {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    try {
        $b = (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
        if ($null -eq $b) { return 0 }
        return [math]::Round($b / 1GB, 3)
    }
    catch { return -1 }
}

function Add-RelativeUnderC {
    param([string]$FullPath)
    $d = [System.IO.Path]::GetFullPath($FullPath)
    $cRoot = [System.IO.Path]::GetFullPath("C:\")
    if (-not $d.StartsWith($cRoot, [StringComparison]::OrdinalIgnoreCase)) {
        return $null
    }
    return $d.Substring($cRoot.Length).TrimStart('\')
}

# Build candidate list: full path string (must be under C:\)
$candidates = [System.Collections.Generic.List[string]]::new()

$add = {
    param($p)
    if ([string]::IsNullOrWhiteSpace($p)) { return }
    try {
        $x = [System.IO.Path]::GetFullPath($p)
        if ($x.StartsWith("C:\", [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $x)) {
            [void]$candidates.Add($x)
        }
    }
    catch {}
}

# Temp / OS temp
& $add $env:TEMP
& $add (Join-Path $env:LOCALAPPDATA "Temp")

# npm
& $add (Join-Path $env:LOCALAPPDATA "npm-cache")
& $add (Join-Path $env:APPDATA "npm")

# Gradle caches (regenerable; large but common on C:)
& $add (Join-Path $env:USERPROFILE ".gradle\caches")
& $add (Join-Path $env:USERPROFILE ".gradle\daemon")

# NuGet HTTP cache (optional; can be large)
$nugetHttp = Join-Path $env:LOCALAPPDATA "NuGet\v3-cache"
& $add $nugetHttp

# Cursor / VS Code - cache-like folders only (not whole app data)
$cursorRoaming = Join-Path $env:APPDATA "Cursor"
foreach ($leaf in @("Cache", "CachedData", "Code Cache", "GPUCache", "logs")) {
    & $add (Join-Path $cursorRoaming $leaf)
}
$cursorLocal = Join-Path $env:LOCALAPPDATA "Cursor"
foreach ($leaf in @("Cache", "CachedData", "Code Cache", "GPUCache")) {
    & $add (Join-Path $cursorLocal $leaf)
}

$codeRoaming = Join-Path $env:APPDATA "Code"
foreach ($leaf in @("Cache", "CachedData", "Code Cache", "GPUCache", "logs")) {
    & $add (Join-Path $codeRoaming $leaf)
}
$codeLocal = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code"
foreach ($leaf in @("Cache", "CachedData")) {
    & $add (Join-Path $codeLocal $leaf)
}

# Dedupe
$unique = $candidates | Sort-Object -Unique

$manifestPath = Join-Path $runRoot "MANIFEST.tsv"
$summaryPath = Join-Path $runRoot "SOURCES.txt"
$logPath = Join-Path $runRoot "COPY_LOG.txt"

New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
New-Item -ItemType Directory -Path $cMirror -Force | Out-Null

"Elior_backup run $runId started $(Get-Date -Format o)" | Out-File -LiteralPath $logPath -Encoding UTF8
"These paths are UNDER C:\ and are regenerable caches/temp - NOT a full C: backup." | Out-File -LiteralPath $summaryPath -Encoding UTF8

foreach ($src in $unique) {
    $rel = Add-RelativeUnderC -FullPath $src
    if (-not $rel) { continue }

    $isTempLike = ($src -ieq $env:TEMP) -or ($src -ieq (Join-Path $env:LOCALAPPDATA "Temp"))
    if ($SkipLargeTemp -and $isTempLike) {
        $gb = Get-FolderSizeGb -Path $src
        if ($gb -gt $MaxTempGb) {
            "SKIP (too large, -SkipLargeTemp): $src (~$gb GB > $MaxTempGb GB)" |
                Out-File -LiteralPath $summaryPath -Append -Encoding UTF8
            continue
        }
    }

    $dest = Join-Path $cMirror $rel
    "`nSOURCE: $src" | Out-File -LiteralPath $summaryPath -Append -Encoding UTF8
    "`nDEST:   $dest" | Out-File -LiteralPath $summaryPath -Append -Encoding UTF8

    if ($WhatIf) {
        "WHATIF would robocopy: $src -> $dest" | Out-File -LiteralPath $logPath -Append -Encoding UTF8
        continue
    }

    $parent = Split-Path $dest -Parent
    if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    # /E copy subdirs including empty; /R:1 /W:1 retry; /NFL /NDL quiet; /TEE+LOG
    $robolog = Join-Path $runRoot ("robocopy-" + ($rel -replace '[\\/:*?"<>|]', '_') + ".log")
    & robocopy.exe $src $dest /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /LOG:$robolog | Out-Null

    # Manifest: every file under dest -> original C:\ path
    if (Test-Path -LiteralPath $dest) {
        Get-ChildItem -LiteralPath $dest -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
            $df = $_.FullName
            $suffix = $df.Substring($dest.Length).TrimStart('\')
            $orig = Join-Path $src $suffix
            "{0}`t{1}" -f $df, $orig
        } | Out-File -LiteralPath $manifestPath -Append -Encoding UTF8
    }
}

if (-not $WhatIf) {
    @"

MANIFEST.tsv format (UTF-8):
  Column 1: full path under $runRoot (where the copy is)
  Column 2: original path on C:\ (restore target)

Restore (example for one file - reverse the copy):
  Copy-Item -LiteralPath '<DEST from col1>' -Destination '<SOURCE from col2>' -Force

We did NOT delete anything on C:\.
"@ | Out-File -LiteralPath (Join-Path $runRoot "HOW_TO_RESTORE.txt") -Encoding UTF8
}

Write-Host "Run folder: $runRoot"
Write-Host "Summary:    $summaryPath"
if (-not $WhatIf) {
    Write-Host "Manifest:   $manifestPath"
}
