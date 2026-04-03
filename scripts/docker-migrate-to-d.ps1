#Requires -Version 5.1
<#
.SYNOPSIS
  Move Docker Desktop WSL2 disks (docker-desktop / docker-desktop-data) from C: to D:\Docker\wsl.
  Run once on YOUR PC in PowerShell — Cursor/agents often cannot see WSL.

.DESCRIPTION
  1) Stops com.docker.service, Docker processes, and WSL.
  2) For Docker Desktop 4.6x "mono distro" layouts (BasePath ...\AppData\Local\Docker\wsl\main),
     moves ext4.vhdx to D: and creates a directory JUNCTION so the path on C: still works.
     Docker Desktop resets registry BasePath to C: on startup, so junctions are more reliable
     than changing Lxss BasePath alone.
  3) For older split distros (docker-desktop-data), falls back to moving the vhdx and updating
     HKCU Lxss BasePath (\\?\D:\... form).
  4) Optionally starts Docker Desktop again.

  Does NOT reinstall Docker binaries (stays under Program Files).

  Run as Administrator (script will self-elevate via UAC).

.PARAMETER DestRoot
  Folder on D: that will contain one subfolder per distro (default: D:\Docker\wsl).

.PARAMETER NoStartDocker
  Do not launch Docker Desktop after migration.
#>
param(
  [string]$DestRoot = 'D:\Docker\wsl',
  [switch]$NoStartDocker
)

$ErrorActionPreference = 'Stop'

function Test-Admin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Host 'Re-launching elevated (UAC)...' -ForegroundColor Yellow
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($NoStartDocker) { $arg += ' -NoStartDocker' }
  if ($DestRoot -ne 'D:\Docker\wsl') { $arg += " -DestRoot `"$DestRoot`"" }
  $p = Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList $arg -Wait -PassThru
  exit $(if ($null -ne $p.ExitCode) { $p.ExitCode } else { 1 })
}

function Stop-DockerDesktop {
  Stop-Service -Name 'com.docker.service' -Force -ErrorAction SilentlyContinue
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -eq 'Docker Desktop' -or $_.ProcessName -like 'com.docker*'
  } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
}

Write-Host '=== Docker WSL -> D: migration ===' -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath 'D:\')) {
  Write-Error 'Drive D: not found. Edit -DestRoot or connect the drive.'
}

Stop-DockerDesktop

Write-Host 'wsl --shutdown' -ForegroundColor Gray
& wsl.exe --shutdown 2>$null
Start-Sleep -Seconds 2

$lxss = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss'
if (-not (Test-Path -LiteralPath $lxss)) {
  Write-Error 'WSL registry path missing. Is WSL installed? Run: wsl --install'
}

$distros = @()
Get-ChildItem -LiteralPath $lxss | ForEach-Object {
  $prop = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
  if ($prop.DistributionName -and $prop.DistributionName -like 'docker-desktop*') {
    $distros += [PSCustomObject]@{
      Key      = $_.PSPath
      PsChild  = $_.PSChildName
      Name     = $prop.DistributionName
      BasePath = $prop.BasePath
    }
  }
}

if ($distros.Count -eq 0) {
  Write-Warning 'No WSL distros named docker-desktop* in registry. Nothing to move.'
  Write-Host 'Check: wsl -l -v' -ForegroundColor Yellow
  Write-Host 'If Docker uses Hyper-V only, use Docker Desktop -> Settings -> Resources -> Disk image location instead.' -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Path $DestRoot -Force | Out-Null
$log = @()

foreach ($d in $distros) {
  $oldBase = $d.BasePath
  if (-not $oldBase) {
    Write-Warning "Skip $($d.Name): empty BasePath"
    continue
  }
  $oldBaseNorm = $oldBase -replace '^\\\\\?\\', ''
  $vhd = Join-Path $oldBaseNorm 'ext4.vhdx'
  if (-not (Test-Path -LiteralPath $vhd)) {
    Write-Warning "Skip $($d.Name): no ext4.vhdx at $vhd"
    continue
  }

  $folderName = ($d.Name -replace '[^\w\-\.]', '_')
  $newBasePhysical = Join-Path $DestRoot $folderName
  $newBaseUnc = '\\?\{0}' -f $newBasePhysical
  $newVhd = Join-Path $newBasePhysical 'ext4.vhdx'
  $monoDockerMain = $oldBaseNorm -match '\\AppData\\Local\\Docker\\wsl\\main\\?$'

  if ($monoDockerMain) {
    $newBasePhysical = Join-Path $DestRoot 'main'
    $newVhd = Join-Path $newBasePhysical 'ext4.vhdx'
  }

  if ($monoDockerMain) {
    $jVhd = Join-Path (Join-Path $DestRoot 'main') 'ext4.vhdx'
    if ((Test-Path -LiteralPath $jVhd) -and (Test-Path -LiteralPath $oldBaseNorm)) {
      $it = Get-Item -LiteralPath $oldBaseNorm -Force -ErrorAction SilentlyContinue
      if ($it -and ($it.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        Write-Host "Already migrated: junction + $jVhd" -ForegroundColor Green
        continue
      }
    }
  }

  if ($oldBaseNorm.TrimEnd('\') -ieq $newBasePhysical.TrimEnd('\')) {
    Write-Host "Already on D: $($d.Name)" -ForegroundColor Green
    continue
  }

  Write-Host "Moving $($d.Name) ..." -ForegroundColor Cyan
  Write-Host "  From: $oldBaseNorm"
  Write-Host "  To:   $newBasePhysical"

  New-Item -ItemType Directory -Path $newBasePhysical -Force | Out-Null
  if (Test-Path -LiteralPath $newVhd) {
    Write-Error "Target already exists: $newVhd — aborting to avoid overwrite."
  }

  Move-Item -LiteralPath $vhd -Destination $newVhd -Force

  if ($monoDockerMain) {
    Remove-Item -LiteralPath $oldBaseNorm -Recurse -Force -ErrorAction SilentlyContinue
    $cmd = "mklink /J `"$oldBaseNorm`" `"$newBasePhysical`""
    cmd /c $cmd | Write-Host
    if (-not (Test-Path -LiteralPath $newVhd)) {
      Write-Error 'Junction created but ext4.vhdx missing on D: — restore from backup.'
    }
    $log += "Junction $oldBaseNorm -> $newBasePhysical (registry unchanged)"
  } else {
    try {
      $left = Get-ChildItem -LiteralPath $oldBaseNorm -Force -ErrorAction SilentlyContinue
      if ($null -eq $left -or $left.Count -eq 0) {
        Remove-Item -LiteralPath $oldBaseNorm -Force -Recurse -ErrorAction SilentlyContinue
      }
    } catch {}

    Set-ItemProperty -LiteralPath $d.Key -Name BasePath -Value $newBaseUnc -Type String
    $log += "Updated $($d.Name) -> $newBaseUnc"
  }
  Write-Host "  OK" -ForegroundColor Green
}

Write-Host ''
Write-Host ($log -join "`n")
Write-Host ''
Write-Host 'Migration finished. Run: wsl -l -v' -ForegroundColor Cyan

if (-not $NoStartDocker) {
  Start-Service -Name 'com.docker.service' -ErrorAction SilentlyContinue
  $dd = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path -LiteralPath $dd) {
    Write-Host 'Starting Docker Desktop...' -ForegroundColor Cyan
    Start-Process -FilePath $dd
  } else {
    Write-Warning "Docker Desktop.exe not found at $dd — start Docker manually."
  }
}
