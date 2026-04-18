<#
  Verifies host-side evidence for Phases B-E (Phase A is BIOS - confirm manually).
  Run: powershell -ExecutionPolicy Bypass -File .\scripts\verify-virtualbox-phases-a-through-e.ps1
#>
$ErrorActionPreference = 'Continue'

Write-Host ''
Write-Host '=== Phase A (host prep) ===' -ForegroundColor Cyan
Write-Host 'Script cannot verify BIOS VT-x/AMD-V or Hyper-V policy.'
Write-Host 'If Ubuntu 64-bit runs in the VM, virtualization is basically OK.'

$vb = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
if (-not (Test-Path -LiteralPath $vb)) {
  Write-Host 'Phase B: FAIL - VirtualBox not found.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '=== Phase B - VirtualBox on Windows ===' -ForegroundColor Cyan
$ver = & $vb --version 2>&1
Write-Host "VBoxManage version: $ver"

$ext = (& $vb list extpacks 2>&1 | ForEach-Object { "$_" }) -join "`n"
if ($ext -match 'Extension Packs:\s*0\s' -or $ext -match 'Extension Packs:\s*0$') {
  Write-Host 'Phase B: Extension Pack missing - install per guide Phase B' -ForegroundColor Yellow
}
elseif ($ext -match 'Pack no\.\s+0:') {
  Write-Host 'Phase B: Extension Pack present' -ForegroundColor Green
}
else {
  Write-Host 'Phase B: Extension Pack status unclear - check VirtualBox UI' -ForegroundColor Yellow
}

$props = & $vb list systemproperties 2>&1 | Out-String
if ($props -match 'Default machine folder:\s+(.+)') {
  $mf = $Matches[1].Trim()
  Write-Host "Default machine folder: $mf"
  if ($mf -notmatch '^D:\\') {
    Write-Host 'Phase B: WARN - machine folder not on D:\' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '=== Phase C - VM UbuntuDev ===' -ForegroundColor Cyan
$vms = & $vb list vms 2>&1
if ($vms -notmatch 'UbuntuDev') {
  Write-Host 'Phase C: FAIL - UbuntuDev not registered' -ForegroundColor Red
}
else {
  Write-Host 'Phase C: VM listed OK' -ForegroundColor Green
}

Write-Host ''
Write-Host '=== Phase D + E - Guest and Guest Additions ===' -ForegroundColor Cyan
$running = & $vb list runningvms 2>&1
if ($running -notmatch 'UbuntuDev') {
  Write-Host 'UbuntuDev not running - start VM and re-run this script for Phase E check.' -ForegroundColor Yellow
  exit 0
}

$info = & $vb showvminfo UbuntuDev 2>&1 | Out-String

if ($info -match 'Additions version:\s+(\S+)\s+r(\d+)') {
  $gaVer = $Matches[1]
  $gaRev = $Matches[2]
  Write-Host "Guest Additions version: $gaVer r$gaRev"
  $hostMajorMinor = ($ver -replace '^(\d+\.\d+).*', '$1')
  $gaMajorMinor = ($gaVer -replace '^(\d+\.\d+).*', '$1')
  if ($hostMajorMinor -ne $gaMajorMinor) {
    Write-Host 'Phase E: FAIL - Guest Additions version does not match host VirtualBox line.' -ForegroundColor Red
    Write-Host "  Host line: $hostMajorMinor.x  Guest GA: $gaVer"
    Write-Host '  Fix: In Ubuntu remove virtualbox-guest-* packages, then Insert Guest Additions CD from host, run VBoxLinuxAdditions.run, reboot. See guide Phase E.'
  }
  else {
    Write-Host 'Phase E: Guest Additions version matches host line OK' -ForegroundColor Green
  }
}
else {
  Write-Host 'Phase E: Could not read Additions version from guest.' -ForegroundColor Yellow
}

if ($info -match 'Additions run level:\s+(\d+)') {
  Write-Host "Additions run level: $($Matches[1])"
}

if ($info -match 'Clipboard Mode:\s+(\S+)') {
  $cm = $Matches[1].Trim()
  Write-Host "Clipboard Mode (VM setting): $cm"
  if ($cm -notmatch '^Bidirectional$') {
    Write-Host '  Fix: Shut down VM -> Settings -> General -> Advanced -> Shared Clipboard: Bidirectional' -ForegroundColor Yellow
    Write-Host '  In Ubuntu: run scripts/guest/fix-vbox-ubuntu-clipboard.sh (see guide Phase E.6c)' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Gray
