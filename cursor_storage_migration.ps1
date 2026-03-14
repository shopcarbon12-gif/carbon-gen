$ErrorActionPreference = "Stop"

$UserName = "Elior"
$PhaseNames = @(
    $null,
    "Preflight",
    "Inspect + backup metadata",
    "Ensure targets",
    "Copy data to final targets",
    "Recreate correct junctions",
    "Repair corrupted local storage db",
    "Launch and verify",
    "Recovery ladder",
    "Clean C safely",
    "Final validation block"
)

$CursorHome = "C:\Users\$UserName\.cursor"
$CursorRoaming = "C:\Users\$UserName\AppData\Roaming\Cursor"
$TargetRoot = "D:\CursorData"
$CursorHomeTarget = Join-Path $TargetRoot ".cursor-home"
$CursorRoamingTarget = Join-Path $TargetRoot "Cursor-Roaming"
$MigrationRoot = Join-Path $TargetRoot "migration-backups"
$StatusFile = Join-Path $MigrationRoot "last-run-status.txt"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$script:CurrentPhaseNumber = 0
$script:CurrentPhaseName = ""
$script:BackupDir = $null
$script:RunLogFile = $null
$script:ActionSummary = [ordered]@{
    Copied = New-Object System.Collections.Generic.List[string]
    Moved = New-Object System.Collections.Generic.List[string]
    Renamed = New-Object System.Collections.Generic.List[string]
    Removed = New-Object System.Collections.Generic.List[string]
    Notes = New-Object System.Collections.Generic.List[string]
}
$script:LaunchSummary = [ordered]@{
    CursorExe = $null
    Attempt = "not-started"
    Success = $false
    Message = $null
}
$script:ValidationRows = New-Object System.Collections.Generic.List[object]
$script:JunctionRows = New-Object System.Collections.Generic.List[object]

function Get-PhaseName {
    param([int]$PhaseNumber)

    if ($PhaseNumber -ge 1 -and $PhaseNumber -lt $PhaseNames.Count) {
        return $PhaseNames[$PhaseNumber]
    }

    return "Unknown phase"
}

function Add-Action {
    param(
        [ValidateSet("Copied", "Moved", "Renamed", "Removed", "Notes")]
        [string]$Bucket,
        [string]$Message
    )

    $script:ActionSummary[$Bucket].Add($Message)
}

function Normalize-Path {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    try {
        return ([System.IO.Path]::GetFullPath($Path)).TrimEnd("\").ToLowerInvariant()
    } catch {
        return $Path.TrimEnd("\").ToLowerInvariant()
    }
}

function New-UniquePath {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $Path
    }

    $parent = Split-Path -Path $Path -Parent
    $leaf = Split-Path -Path $Path -Leaf
    $i = 1
    do {
        $candidate = Join-Path $parent ("{0}-{1}" -f $leaf, $i)
        $i++
    } while (Test-Path -LiteralPath $candidate)

    return $candidate
}

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Read-StatusFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    try {
        return $raw | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{
            Timestamp = Get-Date
            PhaseNumber = 1
            PhaseName = (Get-PhaseName -PhaseNumber 1)
            Status = "failed"
            NextStep = "Phase 1: Preflight"
            BackupDir = $null
            Note = "Status file could not be parsed as JSON."
        }
    }
}

function Write-StatusFile {
    param(
        [int]$PhaseNumber,
        [string]$Status,
        [string]$NextStep,
        [string]$Note
    )

    $payload = [ordered]@{
        Timestamp = (Get-Date).ToString("o")
        PhaseNumber = $PhaseNumber
        PhaseName = (Get-PhaseName -PhaseNumber $PhaseNumber)
        Status = $Status
        NextStep = $NextStep
        BackupDir = $script:BackupDir
        IsAdmin = $IsAdmin
        Note = $Note
    }

    $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatusFile -Encoding UTF8
    Write-RunLog ("STATUS Phase {0} {1}: {2}. Next: {3}. Note: {4}" -f $PhaseNumber, (Get-PhaseName -PhaseNumber $PhaseNumber), $Status, $NextStep, $Note)
}

function Write-RunLog {
    param([string]$Message)

    $line = "{0} | {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    if ($script:RunLogFile) {
        Add-Content -LiteralPath $script:RunLogFile -Value $line
    }
}

function Start-Phase {
    param([int]$PhaseNumber)

    $script:CurrentPhaseNumber = $PhaseNumber
    $script:CurrentPhaseName = Get-PhaseName -PhaseNumber $PhaseNumber
    $nextStep = if ($PhaseNumber -lt ($PhaseNames.Count - 1)) { "Phase {0}: {1}" -f ($PhaseNumber + 1), (Get-PhaseName -PhaseNumber ($PhaseNumber + 1)) } else { "None" }
    Write-StatusFile -PhaseNumber $PhaseNumber -Status "in_progress" -NextStep $nextStep -Note "Phase started."
}

function Complete-Phase {
    param(
        [int]$PhaseNumber,
        [string]$Note = "Phase completed."
    )

    $nextStep = if ($PhaseNumber -lt ($PhaseNames.Count - 1)) { "Phase {0}: {1}" -f ($PhaseNumber + 1), (Get-PhaseName -PhaseNumber ($PhaseNumber + 1)) } else { "None" }
    Write-StatusFile -PhaseNumber $PhaseNumber -Status "completed" -NextStep $nextStep -Note $Note
}

function Fail-Phase {
    param([string]$Note)

    $nextStep = "Phase {0}: {1}" -f $script:CurrentPhaseNumber, $script:CurrentPhaseName
    Write-StatusFile -PhaseNumber $script:CurrentPhaseNumber -Status "failed" -NextStep $nextStep -Note $Note
}

function Get-ReparseTarget {
    param([string]$Path)

    try {
        $item = Get-Item -LiteralPath $Path -Force
        if ($item.PSObject.Properties.Match("Target").Count -gt 0 -and $item.Target) {
            if ($item.Target -is [System.Array]) {
                return ($item.Target -join "; ")
            }
            return [string]$item.Target
        }
    } catch {
    }

    try {
        $query = & cmd.exe /c "fsutil reparsepoint query ""$Path""" 2>&1
        $printName = $query | Select-String -Pattern "Print Name:"
        if ($printName) {
            return (($printName | Select-Object -First 1).ToString() -replace '.*Print Name:\s*', '').Trim()
        }

        $substitute = $query | Select-String -Pattern "Substitute Name:"
        if ($substitute) {
            $value = (($substitute | Select-Object -First 1).ToString() -replace '.*Substitute Name:\s*', '').Trim()
            if ($value.StartsWith("\??\")) {
                return $value.Substring(4)
            }
            return $value
        }
    } catch {
    }

    return $null
}

function Get-PathInfo {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{
            FullName = $Path
            Exists = $false
            Attributes = $null
            LinkType = $null
            Target = $null
            Length = $null
            LastWriteTime = $null
        }
    }

    $item = Get-Item -LiteralPath $Path -Force
    $linkType = $null
    $target = $null
    if ($item.PSObject.Properties.Match("LinkType").Count -gt 0) {
        $linkType = $item.LinkType
    }

    if ($item.PSObject.Properties.Match("Target").Count -gt 0 -and $item.Target) {
        $target = if ($item.Target -is [System.Array]) { $item.Target -join "; " } else { [string]$item.Target }
    }

    if (-not $target -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        $target = Get-ReparseTarget -Path $Path
    }

    $length = if ($item.PSIsContainer) { $null } else { $item.Length }
    return [pscustomobject]@{
        FullName = $item.FullName
        Exists = $true
        Attributes = [string]$item.Attributes
        LinkType = $linkType
        Target = $target
        Length = $length
        LastWriteTime = $item.LastWriteTime
    }
}

function Save-Metadata {
    param(
        [string]$Path,
        [string]$FileName
    )

    $info = Get-PathInfo -Path $Path
    $content = @(
        "Path: $Path"
        "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        "Exists: $($info.Exists)"
        "FullName: $($info.FullName)"
        "Attributes: $($info.Attributes)"
        "LinkType: $($info.LinkType)"
        "Target: $($info.Target)"
        "Length: $($info.Length)"
        "LastWriteTime: $($info.LastWriteTime)"
    )

    if ($info.Exists) {
        try {
            $content += ""
            $content += "Get-Item:"
            $content += (Get-Item -LiteralPath $Path -Force | Format-List * | Out-String).TrimEnd()
        } catch {
        }

        try {
            $content += ""
            $content += "fsutil reparsepoint query:"
            $content += ((& cmd.exe /c "fsutil reparsepoint query ""$Path""" 2>&1) | Out-String).TrimEnd()
        } catch {
        }
    }

    Set-Content -LiteralPath (Join-Path $script:BackupDir $FileName) -Value $content -Encoding UTF8
}

function Stop-CursorProcesses {
    $procs = Get-Process | Where-Object { $_.ProcessName -like "Cursor*" -or $_.ProcessName -like "cursor*" }
    foreach ($proc in $procs) {
        try {
            Stop-Process -Id $proc.Id -Force
            Add-Action -Bucket "Removed" -Message ("Stopped process {0} ({1})" -f $proc.ProcessName, $proc.Id)
        } catch {
            Add-Action -Bucket "Notes" -Message ("Could not stop process {0} ({1}): {2}" -f $proc.ProcessName, $proc.Id, $_.Exception.Message)
        }
    }
}

function Invoke-Robocopy {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$Label
    )

    Ensure-Directory -Path $Destination
    $sourceNormalized = Normalize-Path -Path $Source
    $destinationNormalized = Normalize-Path -Path $Destination
    if ($sourceNormalized -eq $destinationNormalized) {
        Add-Action -Bucket "Notes" -Message ("Skipped robocopy for {0}; source and destination are identical." -f $Label)
        return
    }

    $arguments = @(
        $Source
        $Destination
        "/MIR"
        "/XJ"
        "/R:2"
        "/W:2"
        "/COPY:DAT"
        "/DCOPY:DAT"
        "/NFL"
        "/NDL"
        "/NP"
        "/TEE"
        "/LOG+:$script:RunLogFile"
    )

    & robocopy @arguments | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -gt 7) {
        throw "Robocopy for $Label failed with exit code $exitCode."
    }

    Add-Action -Bucket "Copied" -Message ("Mirrored {0} -> {1} ({2})" -f $Source, $Destination, $Label)
}

function Copy-ItemIntoTarget {
    param(
        [string]$SourcePath,
        [string]$DestinationRoot
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        return
    }

    Ensure-Directory -Path $DestinationRoot
    $leaf = Split-Path -Path $SourcePath -Leaf
    $destination = Join-Path $DestinationRoot $leaf
    if ((Get-Item -LiteralPath $SourcePath -Force).PSIsContainer) {
        Invoke-Robocopy -Source $SourcePath -Destination $destination -Label ("merge-copy $leaf")
    } else {
        Copy-Item -LiteralPath $SourcePath -Destination $destination -Force
        Add-Action -Bucket "Copied" -Message ("Copied file {0} -> {1}" -f $SourcePath, $destination)
    }
}

function Backup-And-RemoveSourcePath {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $info = Get-PathInfo -Path $Path
    if ($info.Attributes -like "*ReparsePoint*") {
        $output = & cmd.exe /c "rmdir ""$Path""" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to remove reparse point $Path. Output: $($output -join ' ')"
        }
        Add-Action -Bucket "Removed" -Message ("Removed junction/reparse point $Path")
        return
    }

    $backupPath = New-UniquePath -Path ("{0}.local-backup-{1}" -f $Path, $ts)
    Rename-Item -LiteralPath $Path -NewName (Split-Path -Path $backupPath -Leaf)
    Add-Action -Bucket "Renamed" -Message ("Renamed $Path -> $backupPath")
}

function Create-Junction {
    param(
        [string]$LinkPath,
        [string]$TargetPath
    )

    $linkParent = Split-Path -Path $LinkPath -Parent
    Ensure-Directory -Path $linkParent
    Ensure-Directory -Path $TargetPath
    $output = & cmd.exe /c "mklink /J ""$LinkPath"" ""$TargetPath""" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "mklink failed for $LinkPath -> $TargetPath. Output: $($output -join ' ')"
    }

    $info = Get-PathInfo -Path $LinkPath
    if (($info.LinkType -and $info.LinkType -ne "Junction") -or -not ($info.Attributes -like "*ReparsePoint*")) {
        throw "Verification failed for $LinkPath. LinkType=$($info.LinkType), Attributes=$($info.Attributes)"
    }

    $actualTarget = Normalize-Path -Path $info.Target
    $expectedTarget = Normalize-Path -Path $TargetPath
    if ($actualTarget -ne $expectedTarget) {
        throw "Verification failed for $LinkPath. Expected target $TargetPath but found $($info.Target)."
    }

    Add-Action -Bucket "Notes" -Message ("Created junction $LinkPath -> $TargetPath")
}

function Rename-IfExists {
    param(
        [string]$Path,
        [string]$NewLeaf
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $parent = Split-Path -Path $Path -Parent
    $destination = New-UniquePath -Path (Join-Path $parent $NewLeaf)
    Rename-Item -LiteralPath $Path -NewName (Split-Path -Path $destination -Leaf)
    Add-Action -Bucket "Renamed" -Message ("Renamed $Path -> $destination")
}

function Find-CursorExecutable {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Cursor\Cursor.exe"
        "$env:LOCALAPPDATA\cursor\Cursor.exe"
        "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    try {
        $command = Get-Command Cursor -ErrorAction SilentlyContinue
        if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source)) {
            return $command.Source
        }
    } catch {
    }

    return $null
}

function Wait-ForStateDb {
    param(
        [datetime]$LaunchTime,
        [int]$TimeoutSeconds = 30
    )

    $stateDb = Join-Path $CursorRoamingTarget "User\globalStorage\state.vscdb"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $stateDb) {
            $item = Get-Item -LiteralPath $stateDb -Force
            if ($item.LastWriteTime -ge $LaunchTime.AddSeconds(-2)) {
                return $item
            }
        }

        Start-Sleep -Seconds 3
    }

    return $null
}

function Test-CursorLaunch {
    param([string[]]$Arguments)

    $cursorExe = Find-CursorExecutable
    if (-not $cursorExe) {
        throw "Cursor executable was not found."
    }

    $script:LaunchSummary.CursorExe = $cursorExe
    Stop-CursorProcesses
    $launchTime = Get-Date
    $joinedArgs = if ($Arguments) { $Arguments -join " " } else { "" }
    if ($Arguments -and $Arguments.Count -gt 0) {
        Start-Process -FilePath $cursorExe -ArgumentList $Arguments | Out-Null
    } else {
        Start-Process -FilePath $cursorExe | Out-Null
    }
    Start-Sleep -Seconds 6

    $stateItem = Wait-ForStateDb -LaunchTime $launchTime -TimeoutSeconds 36
    $cursorRunning = @(Get-Process | Where-Object { $_.ProcessName -like "Cursor*" -or $_.ProcessName -like "cursor*" }).Count -gt 0
    if ($stateItem -and $cursorRunning) {
        $script:LaunchSummary.Attempt = if ($joinedArgs) { $joinedArgs } else { "normal launch" }
        $script:LaunchSummary.Success = $true
        $script:LaunchSummary.Message = "Cursor launched and regenerated state.vscdb."
        return [pscustomobject]@{
            Success = $true
            StateItem = $stateItem
            CursorExe = $cursorExe
            Arguments = $joinedArgs
        }
    }

    $script:LaunchSummary.Attempt = if ($joinedArgs) { $joinedArgs } else { "normal launch" }
    $script:LaunchSummary.Success = $false
    $script:LaunchSummary.Message = "Cursor did not produce a fresh state.vscdb during verification."
    return [pscustomobject]@{
        Success = $false
        StateItem = $stateItem
        CursorExe = $cursorExe
        Arguments = $joinedArgs
    }
}

function Move-Safely {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    if (-not (Test-Path -LiteralPath $SourcePath)) {
        return
    }

    $destination = New-UniquePath -Path $DestinationPath
    Move-Item -LiteralPath $SourcePath -Destination $destination
    Add-Action -Bucket "Moved" -Message ("Moved $SourcePath -> $destination")
}

function Get-InstalledCursorPackageId {
    $ids = @("Cursor.Cursor", "Anysphere.Cursor")
    foreach ($id in $ids) {
        try {
            & winget show --id $id --accept-source-agreements | Out-Null
            if ($LASTEXITCODE -eq 0) {
                return $id
            }
        } catch {
        }
    }

    return $null
}

function Invoke-RecoveryLadder {
    $result = Test-CursorLaunch -Arguments @()
    if ($result.Success) {
        return $result
    }

    $disableExtensionsResult = Test-CursorLaunch -Arguments @("--disable-extensions")
    if ($disableExtensionsResult.Success) {
        return $disableExtensionsResult
    }

    Stop-CursorProcesses
    $cacheBackupDir = Join-Path $script:BackupDir "recovery-cache-$ts"
    Ensure-Directory -Path $cacheBackupDir
    foreach ($cacheName in @("GPUCache", "Code Cache", "CachedData")) {
        $cachePath = Join-Path $CursorRoamingTarget $cacheName
        if (Test-Path -LiteralPath $cachePath) {
            Move-Safely -SourcePath $cachePath -DestinationPath (Join-Path $cacheBackupDir $cacheName)
        }
    }

    $afterCacheClear = Test-CursorLaunch -Arguments @()
    if ($afterCacheClear.Success) {
        return $afterCacheClear
    }

    Stop-CursorProcesses
    foreach ($userFolder in @(
            (Join-Path $CursorRoamingTarget "User\globalStorage"),
            (Join-Path $CursorRoamingTarget "User\workspaceStorage"),
            (Join-Path $CursorRoamingTarget "User\History")
        )) {
        if (Test-Path -LiteralPath $userFolder) {
            $leaf = Split-Path -Path $userFolder -Leaf
            Rename-IfExists -Path $userFolder -NewLeaf ("{0}.bad-{1}" -f $leaf, $ts)
        }
    }

    $afterIsolation = Test-CursorLaunch -Arguments @()
    if ($afterIsolation.Success) {
        return $afterIsolation
    }

    Stop-CursorProcesses
    $packageId = $null
    try {
        $packageId = Get-InstalledCursorPackageId
    } catch {
        Add-Action -Bucket "Notes" -Message ("Unable to determine Cursor package id: {0}" -f $_.Exception.Message)
    }

    if ($packageId) {
        try {
            & winget install --id $packageId -e --force --accept-source-agreements --accept-package-agreements
            if ($LASTEXITCODE -eq 0) {
                Add-Action -Bucket "Notes" -Message ("Reinstalled Cursor binaries via winget package $packageId")
            } else {
                Add-Action -Bucket "Notes" -Message ("winget reinstall for $packageId exited with code $LASTEXITCODE")
            }
        } catch {
            Add-Action -Bucket "Notes" -Message ("winget reinstall for $packageId failed: {0}" -f $_.Exception.Message)
        }
    } else {
        Add-Action -Bucket "Notes" -Message "Cursor package id not found; skipped binary reinstall."
    }

    return (Test-CursorLaunch -Arguments @())
}

function Record-Validation {
    param([string]$Path)

    $script:ValidationRows.Add((Get-PathInfo -Path $Path))
}

function Record-Junction {
    param(
        [string]$Path,
        [string]$ExpectedTarget
    )

    $info = Get-PathInfo -Path $Path
    $script:JunctionRows.Add([pscustomobject]@{
            Path = $Path
            Attributes = $info.Attributes
            LinkType = $info.LinkType
            Target = $info.Target
            ExpectedTarget = $ExpectedTarget
            TargetMatches = (Normalize-Path -Path $info.Target) -eq (Normalize-Path -Path $ExpectedTarget)
        })
}

function Get-RollbackCommands {
    $cursorHomeCopy = Join-Path $CursorHomeTarget "*"
    $cursorRoamingCopy = Join-Path $CursorRoamingTarget "*"
    return @"
cmd /c rmdir ""$CursorHome""
cmd /c rmdir ""$CursorRoaming""
New-Item -ItemType Directory -Path ""$CursorHome"" -Force | Out-Null
robocopy ""$CursorHomeTarget"" ""$CursorHome"" /E /XJ /R:2 /W:2
New-Item -ItemType Directory -Path ""$CursorRoaming"" -Force | Out-Null
robocopy ""$CursorRoamingTarget"" ""$CursorRoaming"" /E /XJ /R:2 /W:2
"@
}

if (-not (Test-Path -LiteralPath $TargetRoot)) {
    throw "Target root $TargetRoot does not exist."
}

Ensure-Directory -Path $MigrationRoot
$priorStatus = Read-StatusFile -Path $StatusFile
$startPhase = 1

if ($priorStatus -and $priorStatus.BackupDir -and (Test-Path -LiteralPath $priorStatus.BackupDir) -and $priorStatus.Status -ne "completed") {
    $script:BackupDir = $priorStatus.BackupDir
    $startPhase = [int]$priorStatus.PhaseNumber
} elseif ($priorStatus -and $priorStatus.BackupDir -and (Test-Path -LiteralPath $priorStatus.BackupDir) -and $priorStatus.Status -eq "completed" -and [int]$priorStatus.PhaseNumber -lt ($PhaseNames.Count - 1)) {
    $script:BackupDir = $priorStatus.BackupDir
    $startPhase = [int]$priorStatus.PhaseNumber + 1
} else {
    $script:BackupDir = Join-Path $MigrationRoot $ts
}

Ensure-Directory -Path $script:BackupDir
$script:RunLogFile = Join-Path $script:BackupDir "run.log"
Write-RunLog ("Run started. IsAdmin={0}. Starting at phase {1}." -f $IsAdmin, $startPhase)

try {
    if ($startPhase -le 1) {
        Start-Phase -PhaseNumber 1
        Stop-CursorProcesses

        $driveInfo = Get-PSDrive -Name C, D | Select-Object Name, Used, Free, @{Name = "Root"; Expression = { $_.Root } }
        $preflight = [ordered]@{
            Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            IsAdmin = $IsAdmin
            ErrorActionPreference = $ErrorActionPreference
            BackupDir = $script:BackupDir
            Drives = $driveInfo
        }
        $preflight | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $script:BackupDir "preflight.json") -Encoding UTF8
        if (-not $IsAdmin) {
            Add-Action -Bucket "Notes" -Message "Shell is not elevated. Junction creation and process control were attempted from the current user context."
        }

        Complete-Phase -PhaseNumber 1 -Note "Preflight captured and backup directory prepared."
    }

    if ($startPhase -le 2) {
        Start-Phase -PhaseNumber 2
        Save-Metadata -Path $CursorHome -FileName "metadata-home.txt"
        Save-Metadata -Path $CursorRoaming -FileName "metadata-roaming.txt"
        Save-Metadata -Path $TargetRoot -FileName "metadata-target-root.txt"
        Save-Metadata -Path $CursorHomeTarget -FileName "metadata-target-home.txt"
        Save-Metadata -Path $CursorRoamingTarget -FileName "metadata-target-roaming.txt"
        Complete-Phase -PhaseNumber 2 -Note "Metadata snapshots written to backup directory."
    }

    if ($startPhase -le 3) {
        Start-Phase -PhaseNumber 3
        Ensure-Directory -Path $CursorHomeTarget
        Ensure-Directory -Path $CursorRoamingTarget
        Complete-Phase -PhaseNumber 3 -Note "Final target directories exist."
    }

    if ($startPhase -le 4) {
        Start-Phase -PhaseNumber 4
        $homeInfo = Get-PathInfo -Path $CursorHome
        if ($homeInfo.Exists -and (Normalize-Path -Path $homeInfo.Target) -ne (Normalize-Path -Path $CursorHomeTarget)) {
            Invoke-Robocopy -Source $CursorHome -Destination $CursorHomeTarget -Label "Cursor home"
        } elseif ($homeInfo.Exists -and -not $homeInfo.Target) {
            Invoke-Robocopy -Source $CursorHome -Destination $CursorHomeTarget -Label "Cursor home"
        } else {
            Add-Action -Bucket "Notes" -Message "Skipped Cursor home copy because source already resolves to the final target."
        }

        $roamingInfo = Get-PathInfo -Path $CursorRoaming
        $roamingTargetNormalized = Normalize-Path -Path $roamingInfo.Target
        if ($roamingInfo.Exists -and $roamingTargetNormalized -eq (Normalize-Path -Path $TargetRoot)) {
            $rootItems = @(
                "User",
                "logs",
                "Local Storage",
                "Session Storage",
                "Cache",
                "GPUCache",
                "Code Cache",
                "CachedData",
                "Service Worker",
                "blob_storage",
                "Crashpad",
                "DawnCache",
                "Network",
                "Preferences",
                "Local State",
                "machineid",
                "storage.json",
                "TransportSecurity"
            )
            foreach ($name in $rootItems) {
                Copy-ItemIntoTarget -SourcePath (Join-Path $TargetRoot $name) -DestinationRoot $CursorRoamingTarget
            }

            Add-Action -Bucket "Notes" -Message "Roaming Cursor was junctioned to D:\\CursorData root; merged key data into D:\\CursorData\\Cursor-Roaming."
        } elseif ($roamingInfo.Exists -and $roamingTargetNormalized -ne (Normalize-Path -Path $CursorRoamingTarget)) {
            Invoke-Robocopy -Source $CursorRoaming -Destination $CursorRoamingTarget -Label "Cursor roaming"
        } elseif ($roamingInfo.Exists -and -not $roamingInfo.Target) {
            Invoke-Robocopy -Source $CursorRoaming -Destination $CursorRoamingTarget -Label "Cursor roaming"
        } else {
            Add-Action -Bucket "Notes" -Message "Skipped Cursor roaming copy because source already resolves to the final target."
        }

        Complete-Phase -PhaseNumber 4 -Note "Data copied or merged into final targets."
    }

    if ($startPhase -le 5) {
        Start-Phase -PhaseNumber 5
        Backup-And-RemoveSourcePath -Path $CursorHome
        Backup-And-RemoveSourcePath -Path $CursorRoaming
        Create-Junction -LinkPath $CursorHome -TargetPath $CursorHomeTarget
        Create-Junction -LinkPath $CursorRoaming -TargetPath $CursorRoamingTarget
        Record-Junction -Path $CursorHome -ExpectedTarget $CursorHomeTarget
        Record-Junction -Path $CursorRoaming -ExpectedTarget $CursorRoamingTarget
        Complete-Phase -PhaseNumber 5 -Note "C: Cursor paths now point to D: final targets."
    }

    if ($startPhase -le 6) {
        Start-Phase -PhaseNumber 6
        $globalStorage = Join-Path $CursorRoamingTarget "User\globalStorage"
        Ensure-Directory -Path $globalStorage
        Rename-IfExists -Path (Join-Path $globalStorage "state.vscdb") -NewLeaf ("state.vscdb.corrupt-{0}" -f $ts)
        Rename-IfExists -Path (Join-Path $globalStorage "state.vscdb.backup") -NewLeaf ("state.vscdb.backup.corrupt-{0}" -f $ts)
        Complete-Phase -PhaseNumber 6 -Note "Existing state db files isolated for regeneration."
    }

    $launchResult = $null
    if ($startPhase -le 7) {
        Start-Phase -PhaseNumber 7
        $launchResult = Test-CursorLaunch -Arguments @()
        if (-not $launchResult.Success) {
            Complete-Phase -PhaseNumber 7 -Note "Normal launch did not fully verify; moving to recovery ladder."
            $startPhase = 8
        } else {
            Complete-Phase -PhaseNumber 7 -Note "Cursor launched successfully and created a fresh state db."
        }
    }

    if (($startPhase -le 8) -and (-not $launchResult -or -not $launchResult.Success)) {
        Start-Phase -PhaseNumber 8
        $launchResult = Invoke-RecoveryLadder
        if ($launchResult.Success) {
            Complete-Phase -PhaseNumber 8 -Note "Recovery ladder restored a successful Cursor launch."
        } else {
            Complete-Phase -PhaseNumber 8 -Note "Recovery ladder completed without a verified healthy launch."
        }
    }

    if ($startPhase -le 9) {
        Start-Phase -PhaseNumber 9
        $fromCBackupRoot = Join-Path $MigrationRoot ("from-c-{0}" -f $ts)
        Ensure-Directory -Path $fromCBackupRoot
        Get-ChildItem -LiteralPath "C:\Users\$UserName" -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like ".cursor.local-backup-*" } | ForEach-Object {
            Move-Safely -SourcePath $_.FullName -DestinationPath (Join-Path $fromCBackupRoot $_.Name)
        }
        Get-ChildItem -LiteralPath "C:\Users\$UserName\AppData\Roaming" -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "Cursor.local-backup-*" } | ForEach-Object {
            Move-Safely -SourcePath $_.FullName -DestinationPath (Join-Path $fromCBackupRoot $_.Name)
        }
        Complete-Phase -PhaseNumber 9 -Note "Old Cursor backups were moved off C: where possible."
    }

     if ($startPhase -le 10) {
         Start-Phase -PhaseNumber 10
        if ($script:JunctionRows.Count -eq 0) {
            Record-Junction -Path $CursorHome -ExpectedTarget $CursorHomeTarget
            Record-Junction -Path $CursorRoaming -ExpectedTarget $CursorRoamingTarget
        }
        Record-Validation -Path $CursorHome
        Record-Validation -Path $CursorRoaming
        Record-Validation -Path $CursorHomeTarget
        Record-Validation -Path $CursorRoamingTarget
        Record-Validation -Path (Join-Path $CursorRoamingTarget "User\globalStorage\state.vscdb")

        $summary = [ordered]@{
            JunctionMap = $script:JunctionRows
            Validation = $script:ValidationRows
            Actions = $script:ActionSummary
            Launch = $script:LaunchSummary
            RollbackCommands = Get-RollbackCommands
        }
        $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $script:BackupDir "final-summary.json") -Encoding UTF8

        Complete-Phase -PhaseNumber 10 -Note "Final validation and rollback details recorded."

        "=== Final Junction Map ==="
        if ($script:JunctionRows.Count -gt 0) {
            $script:JunctionRows | Format-Table -AutoSize | Out-String
        } else {
            "No junction records captured."
        }

        "=== Validation Checks ==="
        $script:ValidationRows | Format-Table FullName, Attributes, LinkType, Target, Length, LastWriteTime -AutoSize | Out-String

        "=== Files Moved / Renamed / Deleted ==="
        "Copied:"
        if ($script:ActionSummary.Copied.Count -gt 0) { $script:ActionSummary.Copied } else { "None" }
        "Moved:"
        if ($script:ActionSummary.Moved.Count -gt 0) { $script:ActionSummary.Moved } else { "None" }
        "Renamed:"
        if ($script:ActionSummary.Renamed.Count -gt 0) { $script:ActionSummary.Renamed } else { "None" }
        "Removed:"
        if ($script:ActionSummary.Removed.Count -gt 0) { $script:ActionSummary.Removed } else { "None" }
        "Notes:"
        if ($script:ActionSummary.Notes.Count -gt 0) { $script:ActionSummary.Notes } else { "None" }

        "=== Cursor Launch Result ==="
        [pscustomobject]$script:LaunchSummary | Format-List | Out-String

        "=== Rollback Commands ==="
        Get-RollbackCommands
    }
} catch {
    $message = $_.Exception.Message
    Fail-Phase -Note $message
    Write-RunLog ("ERROR: {0}" -f $message)
    throw
}
