# Redirects Cursor's default C: profile paths to D: via directory junctions.
# By default this script stops Cursor-like processes so log files unlock; save work first.
# Use -NoKill if you prefer to quit Cursor yourself (tray + Task Manager: no Cursor.exe).
#
# Default layout (matches typical DevData shortcut):
#   Roaming  -> D:\Users\Elior\DevData\cursor-user-data
#   Local    -> D:\Users\Elior\DevData\cursor-localappdata
#   ~/.cursor -> D:\Users\Elior\DevData\.cursor
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File "d:\Projects\My project\carbon-gen\scripts\cursor-junctions-d-only.ps1"
# Optional:
#   -DevDataRoot "D:\Users\Elior\DevData"
#   -NoKill          Do not stop Cursor processes (you must quit Cursor yourself).
#   -SkipAclRepair   Skip takeown/icacls (faster; use if you know ACLs are fine).
#
# If you still get "Access denied", run the same command from PowerShell opened
# "Run as administrator", close any Explorer window inside the Cursor profile folder, then retry.
#
# If removal fails on files under ...\Cursor\logs\ (e.g. Cursor Agent Exec.log), something still has
# that file open: fully quit Cursor (tray), do not run this script from Cursor's integrated terminal,
# or reboot with Cursor not set to auto-start, then re-run.

param(
    [string]$DevDataRoot = "D:\Users\Elior\DevData",
    [switch]$NoKill,
    [switch]$SkipAclRepair
)

$ErrorActionPreference = "Stop"

function Test-RunningAsAdmin {
    $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Normalize-PathFull {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    return ([System.IO.Path]::GetFullPath($Path)).TrimEnd('\').ToLowerInvariant()
}

function Get-LinkTarget {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        if ($item.Target) {
            return if ($item.Target -is [System.Array]) { $item.Target[0] } else { [string]$item.Target }
        }
    }
    return $null
}

function Get-CursorLikeProcesses {
    Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $n = $_.ProcessName
        $n -eq "Cursor" -or $n -eq "cursor" -or $n -like "Cursor*"
    }
}

function Stop-CursorFamilyProcesses {
    $round = 0
    while ($round -lt 3) {
        $procs = @(Get-CursorLikeProcesses)
        if ($procs.Count -eq 0) { break }
        foreach ($p in $procs) {
            Write-Host "Stopping $($p.ProcessName) PID $($p.Id)..."
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        $round++
    }
}

function Assert-CursorClosed {
    $procs = @(Get-CursorLikeProcesses)
    if ($procs.Count -gt 0) {
        $ids = ($procs | ForEach-Object { $_.Id }) -join ", "
        throw "Cursor (or related) still running. PIDs: $ids. Close Cursor fully or re-run without -NoKill."
    }
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Test-PathExists {
    param([string]$Path)
    return [bool](Test-Path -LiteralPath $Path)
}

function Try-RemovePathRecursive {
    param([string]$Path)
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Invoke-StripReadOnlyRecursive {
    param([string]$Path)
    cmd.exe /c "attrib -R ""$Path"" /S /D" 2>&1 | Out-Null
}

function Invoke-RepairOwnershipAndAcl {
    param([string]$Path)

    if ($SkipAclRepair) {
        Write-Host "Skipping takeown/icacls (-SkipAclRepair)."
        return
    }

    Write-Host "Repairing ownership and ACLs (large trees can take several minutes)..."
    $takeown = Join-Path $env:SystemRoot "System32\takeown.exe"
    $icacls = Join-Path $env:SystemRoot "System32\icacls.exe"
    if (-not (Test-Path -LiteralPath $takeown)) { return }

    Start-Process -FilePath $takeown -ArgumentList @("/F", $Path, "/R", "/D", "Y") -Wait -NoNewWindow
    $grantUser = "$($env:USERNAME):(OI)(CI)F"
    Start-Process -FilePath $icacls -ArgumentList @($Path, "/grant", $grantUser, "/T", "/C") -Wait -NoNewWindow
    Start-Process -FilePath $icacls -ArgumentList @($Path, "/grant", "Administrators:(OI)(CI)F", "/T", "/C") -Wait -NoNewWindow
}

function Invoke-RobocopyMirrorEmpty {
    param([string]$TargetPath)

    $empty = Join-Path $env:TEMP ("cursor-junct-empty-{0}" -f ([guid]::NewGuid().ToString("N")))
    New-Item -ItemType Directory -Path $empty -Force | Out-Null
    try {
        & robocopy $empty $TargetPath /MIR /R:2 /W:2 /NFL /NDL /NP | Out-Null
    } finally {
        Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-CmdRdSlashS {
    param([string]$Path)
    # Redirect inside cmd so rd's "file in use" goes to nul; PowerShell still treats native stderr as errors if we only use 2>&1 | Out-Null.
    cmd.exe /c "rd /s /q ""$Path"" 2>nul" | Out-Null
}

function Remove-FolderForJunction {
    param([string]$Path)

    if (-not $NoKill) {
        Stop-CursorFamilyProcesses
    }
    Assert-CursorClosed

    if (-not (Test-PathExists -Path $Path)) {
        return
    }

    if (Try-RemovePathRecursive -Path $Path) {
        return
    }

    Write-Host "Stripping read-only attributes..."
    Invoke-StripReadOnlyRecursive -Path $Path
    if (Try-RemovePathRecursive -Path $Path) {
        return
    }

    Invoke-RepairOwnershipAndAcl -Path $Path
    if (Try-RemovePathRecursive -Path $Path) {
        return
    }

    Write-Host "Deleting contents via robocopy /MIR (empty source)..."
    Invoke-RobocopyMirrorEmpty -TargetPath $Path
    Invoke-StripReadOnlyRecursive -Path $Path
    if (Try-RemovePathRecursive -Path $Path) {
        return
    }

    Write-Host "Trying cmd rd /s /q ..."
    Invoke-CmdRdSlashS -Path $Path
    if (-not (Test-PathExists -Path $Path)) {
        return
    }

    for ($i = 0; $i -lt 5; $i++) {
        if (-not $NoKill) {
            Stop-CursorFamilyProcesses
        }
        Assert-CursorClosed
        Invoke-StripReadOnlyRecursive -Path $Path
        Invoke-RobocopyMirrorEmpty -TargetPath $Path
        if (Try-RemovePathRecursive -Path $Path) {
            return
        }
        Invoke-CmdRdSlashS -Path $Path
        if (-not (Test-PathExists -Path $Path)) {
            return
        }
        Write-Host "Retry $($i + 1)/5 after short wait..."
        Start-Sleep -Seconds 4
    }

    $parent = Split-Path -Parent $Path
    $leaf = Split-Path -Leaf $Path
    $suffix = Get-Date -Format "yyyyMMdd-HHmmss"
    $staleName = "{0}.stale-delete-{1}" -f $leaf, $suffix
    $stalePath = Join-Path $parent $staleName
    while (Test-Path -LiteralPath $stalePath) {
        $suffix = $suffix + "x"
        $staleName = "{0}.stale-delete-{1}" -f $leaf, $suffix
        $stalePath = Join-Path $parent $staleName
    }

    try {
        Rename-Item -LiteralPath $Path -NewName $staleName -ErrorAction Stop
    } catch {
        $elevated = Test-RunningAsAdmin
        $hint = if (-not $elevated) {
            " Open PowerShell **Run as administrator**, close any Explorer window showing this folder, ensure Windows Security 'Controlled folder access' is not blocking PowerShell, reboot if needed, then re-run."
        } else {
            " Reboot (do not start Cursor), run this script again elevated. If it persists, delete the folder from Safe Mode or use Sysinternals Handle to find the locking process."
        }
        throw "Cannot remove or rename '$Path'. Access denied or files in use.$hint Original error: $($_.Exception.Message)"
    }

    Write-Warning "Renamed blocked folder to '$stalePath'. After reboot (Cursor still closed), delete that folder to free space; the junction at '$Path' is now in use."
}

function Merge-DirectoryInto {
    param(
        [string]$Source,
        [string]$Destination
    )
    if (-not (Test-Path -LiteralPath $Source)) { return }
    Ensure-Directory -Path $Destination
    $src = Normalize-PathFull $Source
    $dst = Normalize-PathFull $Destination
    if ($src -eq $dst) { return }
    & robocopy $Source $Destination /E /XO /R:2 /W:2 /NFL /NDL /NP | Out-Null
    $code = $LASTEXITCODE
    if ($code -gt 8) {
        throw "robocopy failed ($code) merging $Source -> $Destination"
    }
}

function New-JunctionOrReplace {
    param(
        [string]$LinkPath,
        [string]$TargetPath
    )

    $expected = Normalize-PathFull $TargetPath
    Ensure-Directory -Path $TargetPath

    if (-not (Test-Path -LiteralPath $LinkPath)) {
        $parent = Split-Path -Parent $LinkPath
        Ensure-Directory -Path $parent
        $out = & cmd.exe /c "mklink /J ""$LinkPath"" ""$TargetPath""" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "mklink failed: $out" }
        Write-Host "Created junction: $LinkPath -> $TargetPath"
        return
    }

    $item = Get-Item -LiteralPath $LinkPath -Force
    $isReparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)

    if ($isReparse) {
        $current = Normalize-PathFull (Get-LinkTarget -Path $LinkPath)
        if ($current -eq $expected) {
            Write-Host "OK (already junction): $LinkPath -> $TargetPath"
            return
        }
        throw "Path exists as a reparse point with unexpected target: $LinkPath -> $(Get-LinkTarget -Path $LinkPath). Remove it manually, then re-run."
    }

    if (-not $NoKill) {
        Stop-CursorFamilyProcesses
    }
    Assert-CursorClosed

    Merge-DirectoryInto -Source $LinkPath -Destination $TargetPath
    Remove-FolderForJunction -Path $LinkPath
    $out = & cmd.exe /c "mklink /J ""$LinkPath"" ""$TargetPath""" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "mklink failed after merge: $out" }
    Write-Host "Merged into D:, replaced folder with junction: $LinkPath -> $TargetPath"
}

if (-not $NoKill) {
    Stop-CursorFamilyProcesses
}
Assert-CursorClosed

if (-not (Test-Path -LiteralPath "D:\")) {
    throw "D: drive not available; fix DevDataRoot or connect drive."
}

Ensure-Directory -Path $DevDataRoot

$roamingLink = Join-Path $env:APPDATA "Cursor"
$roamingTarget = Join-Path $DevDataRoot "cursor-user-data"
$localLink = Join-Path $env:LOCALAPPDATA "Cursor"
$localTarget = Join-Path $DevDataRoot "cursor-localappdata"
$homeLink = Join-Path $env:USERPROFILE ".cursor"
$homeTarget = Join-Path $DevDataRoot ".cursor"

Write-Host "DevDataRoot: $DevDataRoot"
if (-not (Test-RunningAsAdmin)) {
    Write-Host "Note: Not elevated. If removal fails with Access denied, run this script from an Administrator PowerShell."
}

New-JunctionOrReplace -LinkPath $roamingLink -TargetPath $roamingTarget
New-JunctionOrReplace -LinkPath $localLink -TargetPath $localTarget
New-JunctionOrReplace -LinkPath $homeLink -TargetPath $homeTarget

Write-Host ""
Write-Host "Done. Cursor profile data under these C: paths now resolves to D:."
Write-Host "Keep launching with your shortcut (user-data-dir / extensions-dir) or rely on these junctions for default launches."
Write-Host "Note: Cursor binaries may still live under Local\Programs on C: unless installed on D:; temp files may still use %TEMP% on C:."
