<#
  Install VirtualBox reliably: Oracle MSI to DEFAULT location (C:\Program Files\Oracle\VirtualBox).
  Your ISOs/installers stay on D:\downloads; default VM folder is D:\VMs\VirtualBox (bulk data on D:).
  Extension pack from D:\downloads. Registers UbuntuDev if the .vbox file exists.

  Oracle's installer often fails custom INSTALLDIR on D:\ (CheckTargetDir). Default path is supported.

  Drivers always land under C:\Windows\System32\drivers (Windows requirement).

  If MSI fails with VBoxUSBMon / 1058: reboot once, run this script again (no need to uninstall).

  Full flow (downloads + UAC install): powershell -ExecutionPolicy Bypass -File .\scripts\virtualbox-end-to-end.ps1
  Elevated only: powershell -ExecutionPolicy Bypass -File D:\Scripts\install-virtualbox-d-drive.ps1
  Repo copy: scripts/install-virtualbox-d-drive.ps1 (virtualbox-end-to-end.ps1 syncs to D:\Scripts).

  After install, follow docs/virtualbox-linux-cursor-flutter-android-guide.html (Canonical plan). Windows Cursor-on-D: see C_DRIVE_MIGRATION_REPORT.md.
#>
$ErrorActionPreference = 'Stop'

$DownloadDir = 'D:\downloads'
$LogDir = 'D:\VBoxApp\logs'
$MachineFolder = 'D:\VMs\VirtualBox'
$UbuntuVbox = Join-Path $MachineFolder 'UbuntuDev\UbuntuDev.vbox'
$MsiStage = 'D:\Scripts\vbox-msi-stage'
$ExtPackLicense = 'eb31505e56e9b4d0fbca139104da41ac6f6b98f8e78968bdf01b1f3da3c4f9ae'

function Write-Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }

# Self-elevate
$who = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $who.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $path = $MyInvocation.MyCommand.Path
  if (-not $path) { $path = $PSCommandPath }
  $p = Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $path
  ) -Wait -PassThru
  exit $p.ExitCode
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$log = Join-Path $LogDir 'install-transcript.log'
Start-Transcript -Path $log -Force | Out-Null
try {

Write-Step "Cleanup: old VHD scheduled task"
Unregister-ScheduledTask -TaskName 'VBoxAttachHostVhd' -Confirm:$false -ErrorAction SilentlyContinue

Write-Step "Locate installers under $DownloadDir"
$exe = Get-ChildItem -LiteralPath $DownloadDir -Filter 'VirtualBox-*-Win.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$ext = Get-ChildItem -LiteralPath $DownloadDir -Filter 'Oracle_VirtualBox_Extension_Pack*.vbox-extpack' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { throw "No VirtualBox-*-Win.exe in $DownloadDir" }
if (-not $ext) { throw "No Oracle_VirtualBox_Extension_Pack*.vbox-extpack in $DownloadDir" }
Write-Host "EXE: $($exe.FullName)"
Write-Host "ExtPack: $($ext.FullName)"

Write-Step "Uninstall existing VirtualBox (quiet) if registered"
$uninstallRoots = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
foreach ($root in $uninstallRoots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PsPath -ErrorAction SilentlyContinue
    if ($p.DisplayName -match 'Oracle VM VirtualBox|VirtualBox') {
      $cmd = $p.UninstallString
      if ($cmd -and ($cmd -match '(?i)msiexec\.exe\s+/I\s*(\{[A-F0-9-]+\})')) {
        $g = $Matches[1]
        Write-Host "Removing: $($p.DisplayName) (msiexec /X$g)"
        cmd.exe /c "msiexec.exe /X$g /qn REBOOT=ReallySuppress" | Out-Host
      }
    }
  }
}
Start-Sleep -Seconds 5

Write-Step "Stop/delete VirtualBox services (stale driver state)"
foreach ($svc in @('VBoxUSBMon', 'VBoxUSB', 'VBoxDrv', 'VBoxNetAdp', 'VBoxNetLwf')) {
  cmd.exe /c "sc.exe stop `"$svc`" 2>nul" | Out-Null
  cmd.exe /c "sc.exe delete `"$svc`" 2>nul" | Out-Null
}
Start-Sleep -Seconds 3

Write-Step "Extract MSI from EXE"
Remove-Item -LiteralPath $MsiStage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $MsiStage | Out-Null
Start-Process -FilePath $exe.FullName -ArgumentList @('--extract', '--path', $MsiStage) -Wait | Out-Null
$msi = Get-ChildItem -LiteralPath $MsiStage -Filter '*.msi' | Sort-Object Length -Descending | Select-Object -First 1
if (-not $msi) { throw "No MSI extracted to $MsiStage" }

$msiLog = Join-Path $LogDir 'msi-install.log'
$installDirDefault = Join-Path $env:ProgramFiles 'Oracle\VirtualBox'
Write-Step "Install VirtualBox to default location: $installDirDefault"
Write-Host "Not passing INSTALLDIR - Oracle uses supported default on C:."
cmd.exe /c "msiexec.exe /i `"$($msi.FullName)`" /qn /norestart REBOOT=ReallySuppress ALLUSERS=1 /l*v `"$msiLog`""
$msiExit = $LASTEXITCODE
Write-Host "msiexec exit code: $msiExit"

$VBoxManage = Join-Path $installDirDefault 'VBoxManage.exe'
if (-not (Test-Path -LiteralPath $VBoxManage)) {
  $tail = ''
  if (Test-Path $msiLog) { $tail = (Get-Content $msiLog -Tail 80 -ErrorAction SilentlyContinue) -join "`n" }
  throw @"
MSI did not complete. Common fix: reboot once (clears VBoxUSBMon 1058 / marked-for-deletion), then run this script again.

Log: $msiLog

Log tail:
$tail
"@
}

Write-Step "VBoxManage"
& $VBoxManage --version

Write-Step "Extension Pack"
& $VBoxManage extpack uninstall "Oracle VM VirtualBox Extension Pack" 2>$null | Out-Null
& $VBoxManage extpack install --replace --accept-license=$ExtPackLicense $ext.FullName

New-Item -ItemType Directory -Force -Path $MachineFolder | Out-Null
Write-Step "Default VM folder -> $MachineFolder (on D:)"
& $VBoxManage setproperty machinefolder $MachineFolder

Write-Step "Register UbuntuDev if .vbox exists"
$listed = & $VBoxManage list vms 2>$null
if ($listed -notmatch 'UbuntuDev' -and (Test-Path -LiteralPath $UbuntuVbox)) {
  & $VBoxManage registervm $UbuntuVbox
  Write-Host "Registered $UbuntuVbox"
} elseif ($listed -match 'UbuntuDev') {
  Write-Host "UbuntuDev already listed."
} else {
  Write-Warning "No $UbuntuVbox - add VM manually in VirtualBox."
}

Write-Step "Unregister one-shot installer task (if present)"
Unregister-ScheduledTask -TaskName 'VBoxInstallOneShot' -Confirm:$false -ErrorAction SilentlyContinue

Write-Step "Success"
Write-Host "Program: $installDirDefault" -ForegroundColor Green
Write-Host "VMs/disks: $MachineFolder" -ForegroundColor Green
Write-Host "Transcript: $log" -ForegroundColor Gray

} finally {
  try { Stop-Transcript } catch {}
}
