<#
  Downloads Windows host EXE + matching Extension Pack from download.virtualbox.org
  (uses LATEST.TXT, then parses the version directory index).

  No admin required. Default output: D:\downloads

  Usage:
    powershell -ExecutionPolicy Bypass -File .\download-virtualbox-installers.ps1
    .\download-virtualbox-installers.ps1 -OutDir D:\downloads -Force
#>
param(
  [string] $OutDir = 'D:\downloads',
  [switch] $Force
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-LatestVirtualBoxVersion {
  $u = 'https://download.virtualbox.org/virtualbox/LATEST.TXT'
  $v = (Invoke-WebRequest -Uri $u -UseBasicParsing).Content.Trim() -split "`r?`n" | Where-Object { $_ -match '^\d+\.\d+' } | Select-Object -First 1
  if (-not $v) { throw "Could not read version from $u" }
  return $v.Trim()
}

function Get-IndexFilenames([string] $Version) {
  $base = "https://download.virtualbox.org/virtualbox/$Version/"
  $html = (Invoke-WebRequest -Uri $base -UseBasicParsing).Content
  $win = [regex]::Matches($html, 'href="(VirtualBox-.+?-Win\.exe)"') | ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Descending | Select-Object -First 1
  if (-not $win) { throw "No *-Win.exe link in $base" }
  $extCandidates = [regex]::Matches($html, 'href="(Oracle_VirtualBox_Extension_Pack-.+?\.vbox-extpack)"') |
    ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  $ext = $extCandidates | Where-Object { $_ -match [regex]::Escape($Version) } | Sort-Object Length | Select-Object -First 1
  if (-not $ext) { throw "No Extension Pack .vbox-extpack link in $base" }
  return @{ Base = $base; WinExe = $win; ExtPack = $ext }
}

$ver = Get-LatestVirtualBoxVersion
Write-Host "Oracle VirtualBox latest (LATEST.TXT): $ver" -ForegroundColor Cyan
$names = Get-IndexFilenames $ver
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

foreach ($pair in @(
  @{ Name = 'Win EXE'; File = $names.WinExe }
  @{ Name = 'Extension Pack'; File = $names.ExtPack }
)) {
  $dest = Join-Path $OutDir $pair.File
  if ((Test-Path -LiteralPath $dest) -and -not $Force) {
    Write-Host "Skip (exists): $dest" -ForegroundColor Gray
    continue
  }
  $uri = $names.Base + $pair.File
  Write-Host "Downloading $($pair.Name): $uri" -ForegroundColor Yellow
  Invoke-WebRequest -Uri $uri -OutFile $dest -UseBasicParsing
  Write-Host "  -> $dest" -ForegroundColor Green
}

Write-Host "`nReady for install script (VirtualBox-*-Win.exe + Oracle_VirtualBox_Extension_Pack*.vbox-extpack in $OutDir)." -ForegroundColor Green
