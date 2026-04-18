#requires -Version 5.1
<#
.SYNOPSIS
  Compare current C:\ user-write trees to a baseline CSV; report new/changed files.

.DESCRIPTION
  Reads baseline from -BaselineCsv or from c-user-writes-LATEST-BASELINE.txt in -OutDir.
  Re-scans the same roots used by snapshot-c-user-writes-baseline.ps1 (must match).
  Writes HTML + text report under D:\CarbonWmsTooling\tmp\c-drive-watch.

.PARAMETER BaselineCsv
  Full path to baseline CSV from snapshot script.

.PARAMETER OutDir
  Same OutDir as baseline; used for default baseline pointer and reports.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\compare-c-user-writes-to-baseline.ps1

.NOTES
  Run after your session. Open the generated .html in a browser.
#>

param(
    [string]$OutDir = "D:\CarbonWmsTooling\tmp\c-drive-watch",
    [string]$BaselineCsv = ""
)

$ErrorActionPreference = "Continue"
$user = $env:USERPROFILE
if (-not $user) { throw "USERPROFILE not set" }

if (-not $BaselineCsv) {
    $ptr = Join-Path $OutDir "c-user-writes-LATEST-BASELINE.txt"
    if (-not (Test-Path -LiteralPath $ptr)) {
        throw "No -BaselineCsv and missing $ptr. Run snapshot-c-user-writes-baseline.ps1 first."
    }
    $BaselineCsv = (Get-Content -LiteralPath $ptr -Raw).Trim()
}
if (-not (Test-Path -LiteralPath $BaselineCsv)) {
    throw "Baseline CSV not found: $BaselineCsv"
}

$roots = [System.Collections.Generic.List[string]]::new()
$rootsFile = Join-Path $OutDir "c-user-writes-ROOTS.txt"
if (Test-Path -LiteralPath $rootsFile) {
    Get-Content -LiteralPath $rootsFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and (Test-Path -LiteralPath $line)) { [void]$roots.Add($line) }
    }
}
if ($roots.Count -eq 0) {
    foreach ($r in @(
            (Join-Path $env:LOCALAPPDATA ""),
            (Join-Path $env:APPDATA ""),
            (Join-Path $env:TEMP ""),
            (Join-Path $user "AppData\Local\Temp"),
            (Join-Path $user ".cursor"),
            (Join-Path $user ".docker")
        )) {
        $t = $r.TrimEnd('\')
        if ($t -and (Test-Path -LiteralPath $t)) { [void]$roots.Add($t) }
    }
}

Write-Host "Loading baseline..."
$old = Import-Csv -LiteralPath $BaselineCsv
$oldHt = @{}
foreach ($row in $old) {
    $oldHt[$row.FullName] = @{ t = [datetime]::Parse($row.LastWriteTime, $null, [System.Globalization.DateTimeStyles]::RoundtripKind); l = [long]$row.Length }
}

Write-Host "Scanning current state..."
$nowRows = [System.Collections.Generic.List[object]]::new()
foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            [void]$nowRows.Add([pscustomobject]@{
                    FullName      = $_.FullName
                    LastWriteTime = $_.LastWriteTimeUtc.ToString("o")
                    Length        = $_.Length
                })
        }
        catch {}
    }
}

$new = [System.Collections.Generic.List[object]]::new()
$changed = [System.Collections.Generic.List[object]]::new()
foreach ($f in $nowRows) {
    $path = $f.FullName
    if (-not $oldHt.ContainsKey($path)) {
        [void]$new.Add($f)
        continue
    }
    $o = $oldHt[$path]
    $nt = [datetime]::Parse($f.LastWriteTime, $null, [System.Globalization.DateTimeStyles]::RoundtripKind)
    if ($nt -ne $o.t -or [long]$f.Length -ne $o.l) {
        [void]$changed.Add([pscustomobject]@{
                FullName      = $path
                OldTime       = $o.t.ToString("o")
                NewTime       = $f.LastWriteTime
                OldLength     = $o.l
                NewLength     = $f.Length
            })
    }
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$txt = Join-Path $OutDir "c-user-writes-diff-$ts.txt"
$html = Join-Path $OutDir "c-user-writes-diff-$ts.html"

$sbTxt = [System.Text.StringBuilder]::new()
[void]$sbTxt.AppendLine("C:\ user-write diff vs baseline")
[void]$sbTxt.AppendLine("Baseline: $BaselineCsv")
[void]$sbTxt.AppendLine("Generated: $(Get-Date -Format o)")
[void]$sbTxt.AppendLine("")
[void]$sbTxt.AppendLine("NEW files: $($new.Count)")
[void]$sbTxt.AppendLine("CHANGED files: $($changed.Count)")
[void]$sbTxt.AppendLine("")
if ($new.Count -gt 0) {
    [void]$sbTxt.AppendLine("--- NEW ---")
    $new | ForEach-Object { [void]$sbTxt.AppendLine($_.FullName) }
    [void]$sbTxt.AppendLine("")
}
if ($changed.Count -gt 0) {
    [void]$sbTxt.AppendLine("--- CHANGED ---")
    $changed | ForEach-Object { [void]$sbTxt.AppendLine("$($_.FullName) | len $($_.OldLength)->$($_.NewLength)") }
}
Set-Content -LiteralPath $txt -Value $sbTxt.ToString() -Encoding UTF8

Add-Type -AssemblyName System.Web
$encBaseline = [System.Web.HttpUtility]::HtmlEncode($BaselineCsv)
$when = [System.Web.HttpUtility]::HtmlEncode((Get-Date -Format o))
$sbHtml = [System.Text.StringBuilder]::new()
[void]$sbHtml.AppendLine("<!DOCTYPE html><html><head><meta charset=utf-8><title>C drive diff</title></head><body style='font-family:Segoe UI,sans-serif;max-width:900px'>")
[void]$sbHtml.AppendLine("<h1>C:\ user-write diff</h1>")
[void]$sbHtml.AppendLine("<p><b>Baseline:</b> $encBaseline</p>")
[void]$sbHtml.AppendLine("<p><b>When:</b> $when</p>")
[void]$sbHtml.AppendLine(("<p><b>New files:</b> {0} | <b>Changed:</b> {1}</p>" -f $new.Count, $changed.Count))
[void]$sbHtml.AppendLine("<h2>New</h2><ul>")
$nShow = [Math]::Min(500, $new.Count)
for ($i = 0; $i -lt $nShow; $i++) {
    $fn = [System.Web.HttpUtility]::HtmlEncode($new[$i].FullName)
    [void]$sbHtml.AppendLine("<li>$fn</li>")
}
[void]$sbHtml.AppendLine("</ul>")
if ($new.Count -gt 500) {
    [void]$sbHtml.AppendLine("<p><i>Truncated to 500; see .txt for full list.</i></p>")
}
[void]$sbHtml.AppendLine("<h2>Changed</h2><ul>")
$cShow = [Math]::Min(500, $changed.Count)
for ($i = 0; $i -lt $cShow; $i++) {
    $c = $changed[$i]
    $fn = [System.Web.HttpUtility]::HtmlEncode($c.FullName)
    [void]$sbHtml.AppendLine("<li>$fn ($($c.OldLength) to $($c.NewLength) bytes)</li>")
}
[void]$sbHtml.AppendLine("</ul></body></html>")
Set-Content -LiteralPath $html -Value $sbHtml.ToString() -Encoding UTF8

Write-Host "NEW: $($new.Count)  CHANGED: $($changed.Count)"
Write-Host "Report: $html"
Write-Host "Text:   $txt"
