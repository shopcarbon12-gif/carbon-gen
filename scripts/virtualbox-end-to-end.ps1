<#
  End-to-end VirtualBox setup (host on C:, VMs on D:):
  1. Ensures D:\downloads, D:\Scripts, D:\VBoxApp\logs, D:\VMs\VirtualBox
  2. Copies install-virtualbox-d-drive.ps1 + Run-VirtualBox-Install-as-Admin.cmd -> D:\Scripts
  3. Downloads latest Win EXE + Extension Pack (unless -SkipDownload)
  4. Starts elevated install (UAC) unless -SkipInstall

  From repo root:
    powershell -ExecutionPolicy Bypass -File ".\scripts\virtualbox-end-to-end.ps1"

  Prepare only (no UAC, no download):
    .\scripts\virtualbox-end-to-end.ps1 -SkipDownload -SkipInstall
#>
param(
  [switch] $SkipDownload,
  [switch] $SkipInstall,
  [switch] $SkipCopy
)

$ErrorActionPreference = 'Stop'
$RepoRoot = $PSScriptRoot

$DownloadDir = 'D:\downloads'
$LogDir = 'D:\VBoxApp\logs'
$MachineFolder = 'D:\VMs\VirtualBox'
$ScriptsDest = 'D:\Scripts'

Write-Host "`n=== VirtualBox end-to-end (D: data, C: program) ===" -ForegroundColor Cyan

foreach ($p in @($DownloadDir, $LogDir, $MachineFolder, $ScriptsDest)) {
  New-Item -ItemType Directory -Force -Path $p | Out-Null
}

if (-not $SkipCopy) {
  Copy-Item -LiteralPath (Join-Path $RepoRoot 'install-virtualbox-d-drive.ps1') -Destination $ScriptsDest -Force
  Copy-Item -LiteralPath (Join-Path $RepoRoot 'Run-VirtualBox-Install-as-Admin.cmd') -Destination $ScriptsDest -Force
  Write-Host "Synced install scripts -> $ScriptsDest" -ForegroundColor Green
}

if (-not $SkipDownload) {
  & (Join-Path $RepoRoot 'download-virtualbox-installers.ps1') -OutDir $DownloadDir
} else {
  Write-Host "SkipDownload: using existing installers in $DownloadDir" -ForegroundColor Gray
}

if ($SkipInstall) {
  Write-Host "`nSkipInstall. When ready (approve UAC):" -ForegroundColor Yellow
  Write-Host "  D:\Scripts\Run-VirtualBox-Install-as-Admin.cmd" -ForegroundColor White
  Write-Host "  powershell -ExecutionPolicy Bypass -File D:\Scripts\install-virtualbox-d-drive.ps1" -ForegroundColor White
  exit 0
}

$installPs1 = Join-Path $ScriptsDest 'install-virtualbox-d-drive.ps1'
if (-not (Test-Path -LiteralPath $installPs1)) { throw "Missing $installPs1" }

Write-Host "`nLaunching elevated installer (UAC)..." -ForegroundColor Cyan
$p = Start-Process powershell.exe -Verb RunAs -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installPs1
) -Wait -PassThru
exit $p.ExitCode
