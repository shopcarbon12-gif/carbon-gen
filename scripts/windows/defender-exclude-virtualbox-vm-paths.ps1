#requires -Version 5.1
<#
.SYNOPSIS
  Add Windows Defender exclusions for VirtualBox VM disks (reduces read/write scan overhead).

.DESCRIPTION
  Excludes default and common VM locations from real-time scanning. Run in an elevated
  (Run as administrator) PowerShell window.

  Security: Excluded paths are not scanned by Defender; only exclude directories you trust.

.PARAMETER ExtraPaths
  Additional folder paths to exclude (e.g. D:\VirtualBox VMs if you store VMs on D:).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\defender-exclude-virtualbox-vm-paths.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\defender-exclude-virtualbox-vm-paths.ps1 -ExtraPaths @('D:\VirtualBox VMs')
#>

param(
    [string[]]$ExtraPaths = @()
)

$ErrorActionPreference = "Stop"

function Test-Administrator {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
    Write-Error "Run this script as Administrator (right-click PowerShell -> Run as administrator)."
}

$candidates = [System.Collections.Generic.List[string]]::new()

# Default VirtualBox VM folder (per-user)
$defaultVm = Join-Path $env:USERPROFILE "VirtualBox VMs"
[void]$candidates.Add($defaultVm)

# Optional: VirtualBox config (small; optional exclusion — usually unnecessary)
# [void]$candidates.Add((Join-Path $env:USERPROFILE ".VirtualBox"))

foreach ($e in $ExtraPaths) {
    if ($e -and $e.Trim()) {
        $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($e)
        if (-not $candidates.Contains($full)) { [void]$candidates.Add($full) }
    }
}

$module = Get-Module -ListAvailable -Name ConfigDefender
if (-not $module) {
    Write-Warning "ConfigDefender module not found. Trying Add-MpPreference (Windows Defender cmdlet)."
}

foreach ($dir in $candidates) {
    if (-not (Test-Path -LiteralPath $dir)) {
        Write-Host "SKIP (path missing): $dir"
        continue
    }
    try {
        Add-MpPreference -ExclusionPath $dir
        Write-Host "OK  Exclusion added: $dir"
    }
    catch {
        Write-Warning "Failed for $dir : $_"
    }
}

Write-Host ""
Write-Host "Current Defender exclusion paths (folder-type):"
(Get-MpPreference).ExclusionPath | Where-Object { $_ } | ForEach-Object { Write-Host "  $_" }
