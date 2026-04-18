#requires -Version 5.1
<#
.SYNOPSIS
  Dev-related disk inventory for Windows: L1 canonical paths, L2 full D:\ top-level + heuristic deep scan,
  L3 C:\Users + ProgramData dev subtrees, L5 optional git triage. Writes CSV under D:\backup c\inventory\.

.DESCRIPTION
  Maps to docs/migration plan layers L1-L5. L4 (WinDirStat/WizTree full-drive) is manual — see
  docs/dev-inventory-wiztree-windirstat.md.

  Outputs:
    - dev-inventory-<timestamp>.csv  (master rows)
    - git-triage-<timestamp>.csv     (per .git work tree, unless -SkipGitTriage)

  Optional extra roots: place one path per line in:
    <BackupRoot>\inventory\extra-scan-roots.txt

.NOTES
  Recursive size scans can take a long time on large drives. Use -WhatIf to list actions only.
  All report output goes under BackupRoot (default D:\backup c), not C:\.

  Phase Outlook emails (L1, L2, L3, extra roots, L5, complete) are ON by default to the addresses in
  -OutlookNotifyTo / -OutlookSendAsSmtp. Use -SkipOutlookPhaseNotify for a silent run, or clear
  -OutlookNotifyTo to skip sends without Outlook.

  L1/L2 and huge backups: by default, backup_mirror (BackupRoot) and backup_tree (carbon-gen-backups-outside)
  skip full recursive byte counting (can take many hours). Rows get SizeGB 0 and a Notes hint; use WizTree L4
  or pass -FullSizeBackupRoots for a full deep size (overnight-style) run.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-disk-inventory.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-disk-inventory.ps1 -SkipGitTriage -WhatIf

.EXAMPLE
  Email when L1 finishes (Gmail: use app password; set -SmtpCredential (Get-Credential)):
  powershell -ExecutionPolicy Bypass -File scripts\dev-disk-inventory.ps1 `
    -NotifyL1CompleteEmailTo "you@gmail.com" -SmtpServer "smtp.gmail.com" -SmtpPort 587 `
    -SmtpFrom "you@gmail.com" -SmtpCredential (Get-Credential)

.EXAMPLE
  Send L1 notification through installed Outlook (uses your Outlook profile; no SMTP flags):
  powershell -ExecutionPolicy Bypass -File scripts\dev-disk-inventory.ps1 `
    -NotifyL1CompleteEmailTo "you@company.com" -NotifyL1CompleteViaOutlook

.EXAMPLE
  No phase emails (long run, no Outlook prompts):
  powershell -ExecutionPolicy Bypass -File scripts\dev-disk-inventory.ps1 -SkipOutlookPhaseNotify

.EXAMPLE
  Include full recursive sizing for backup_mirror / backup_tree and D:\ top-level matches (very slow if huge):
  powershell -ExecutionPolicy Bypass -File scripts\dev-disk-inventory.ps1 -FullSizeBackupRoots
#>

param(
    [string]$BackupRoot = "D:\backup c",
    [string]$OutputSubdir = "inventory",
    [switch]$SkipGitTriage,
    [switch]$WhatIf,
    [int]$GitTriageMaxRepos = 200,
    [double]$DDeepScanMinSizeGb = 2.0,
    [int]$DeepScanMaxZipDepth = 8,
    [string]$NotifyL1CompleteEmailTo = "",
    [string]$SmtpServer = "",
    [int]$SmtpPort = 587,
    [string]$SmtpFrom = "",
    [switch]$SmtpNoSsl,
    [pscredential]$SmtpCredential = $null,
    [switch]$NotifyL1CompleteViaOutlook,
    [switch]$SkipOutlookPhaseNotify,
    [string]$OutlookNotifyTo = "elior@carbonjeanscompany.com",
    [string]$OutlookSendAsSmtp = "elior@carbonjeanscompany.com",
    [switch]$FullSizeBackupRoots
)

# Phase Outlook notifications after L1/L2/L3/extra/L5/complete — on unless -SkipOutlookPhaseNotify.
$phaseOutlookEnabled = (-not $SkipOutlookPhaseNotify)

$ErrorActionPreference = "Stop"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$script:rows = [System.Collections.Generic.List[object]]::new()
$script:gitRootsSeen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$script:__olApp = $null

function Get-SharedOutlookApplication {
    if ($null -eq $script:__olApp) {
        $script:__olApp = New-Object -ComObject Outlook.Application
    }
    return $script:__olApp
}

function Dispose-SharedOutlookApplication {
    if ($null -ne $script:__olApp) {
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:__olApp)
        $script:__olApp = $null
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

function Send-OutlookInventoryMail {
    param(
        [Parameter(Mandatory)][string]$To,
        [Parameter(Mandatory)][string]$SendUsingSmtp,
        [Parameter(Mandatory)][string]$Subject,
        [Parameter(Mandatory)][string]$Body
    )
    $ol = Get-SharedOutlookApplication
    $mail = $null
    try {
        $mail = $ol.CreateItem(0)
        $mail.To = $To
        foreach ($a in @($ol.Session.Accounts)) {
            if ($a.SmtpAddress -eq $SendUsingSmtp) {
                $mail.SendUsingAccount = $a
                break
            }
        }
        $mail.Subject = $Subject
        $mail.Body = $Body
        $mail.Send()
    }
    finally {
        if ($null -ne $mail) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($mail) }
    }
}

function Send-DevInventoryPhaseOutlook {
    param(
        [Parameter(Mandatory)][string]$Phase,
        [string[]]$DetailLines = @()
    )
    if (-not $phaseOutlookEnabled) { return }
    if ([string]::IsNullOrWhiteSpace($OutlookNotifyTo)) {
        Write-Warning "Phase Outlook notify skipped: -OutlookNotifyTo is empty."
        return
    }
    $detailBlock = if ($DetailLines.Count -gt 0) { ($DetailLines -join "`r`n") } else { "(no extra detail)" }
    $body = @"
dev-disk-inventory phase: $Phase

Time: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Run id: $ts
BackupRoot: $BackupRoot
Inventory dir: $script:invDirForNotify

$detailBlock
"@
    try {
        Send-OutlookInventoryMail -To $OutlookNotifyTo -SendUsingSmtp $OutlookSendAsSmtp `
            -Subject "dev-disk-inventory [$Phase] ($ts)" -Body $body
        Write-Host "Outlook phase notification: $Phase" -ForegroundColor Green
    }
    catch {
        Write-Warning "Outlook phase notify failed ($Phase): $($_.Exception.Message)"
    }
}

function Get-InventoryDir {
    param([switch]$Create)
    $inv = Join-Path $BackupRoot $OutputSubdir
    if ($Create) {
        New-Item -ItemType Directory -Path $inv -Force | Out-Null
    }
    return $inv
}

function Add-Row {
    param(
        [string]$RootPath,
        [string]$Layer,
        [string]$Category,
        [string]$SuggestedProject,
        [double]$SizeGb,
        [Nullable[datetime]]$OldestMtime,
        [Nullable[datetime]]$NewestMtime,
        [string]$HasGit = "",
        [string]$Remote = "",
        [string]$Dirty = "",
        [string]$UnpushedHint = "",
        [string]$Notes = ""
    )
    $script:rows.Add([pscustomobject]@{
        RootPath         = $RootPath
        Layer            = $Layer
        Category         = $Category
        SuggestedProject = $SuggestedProject
        SizeGB           = [math]::Round($SizeGb, 3)
        OldestMtime      = if ($OldestMtime) { $OldestMtime.ToString("o") } else { "" }
        NewestMtime      = if ($NewestMtime) { $NewestMtime.ToString("o") } else { "" }
        HasGit           = $HasGit
        Remote           = $Remote
        Dirty            = $Dirty
        UnpushedHint     = $UnpushedHint
        Notes            = $Notes
    })
}

function Get-SubtreeStats {
    param(
        [string]$Path,
        [int]$MaxDepth = -1,
        [int]$CurrentDepth = 0
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        return @{ Bytes = [long]0; Oldest = $null; Newest = $null; Error = "missing" }
    }
    $bytes = [long]0
    $oldest = $null
    $newest = $null
    try {
        if ($MaxDepth -ge 0 -and $CurrentDepth -ge $MaxDepth) {
            return @{ Bytes = 0; Oldest = $null; Newest = $null; Error = "" }
        }
        $items = Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        foreach ($it in $items) {
            if ($it.PSIsContainer) {
                $sub = Get-SubtreeStats -Path $it.FullName -MaxDepth $MaxDepth -CurrentDepth ($CurrentDepth + 1)
                $bytes += $sub.Bytes
                if ($sub.Oldest -and (-not $oldest -or $sub.Oldest -lt $oldest)) { $oldest = $sub.Oldest }
                if ($sub.Newest -and (-not $newest -or $sub.Newest -gt $newest)) { $newest = $sub.Newest }
            }
            else {
                try {
                    $bytes += $it.Length
                    if (-not $oldest -or $it.LastWriteTime -lt $oldest) { $oldest = $it.LastWriteTime }
                    if (-not $newest -or $it.LastWriteTime -gt $newest) { $newest = $it.LastWriteTime }
                }
                catch {}
            }
        }
    }
    catch {
        return @{ Bytes = $bytes; Oldest = $oldest; Newest = $newest; Error = $_.Exception.Message }
    }
    return @{ Bytes = $bytes; Oldest = $oldest; Newest = $newest; Error = "" }
}

function Test-LikelyDevHeuristic {
    param([string]$DirPath)
    if (-not (Test-Path -LiteralPath $DirPath -PathType Container)) { return $false }
    $name = Split-Path $DirPath -Leaf
    $patterns = @(
        "git", "node", "npm", "cursor", "vscode", "flutter", "android", "gradle",
        "backup", "project", "dev", "repo", "carbon", "warehouse", "shopify", "next"
    )
    foreach ($p in $patterns) {
        if ($name -match [regex]::Escape($p)) { return $true }
    }
    $markers = @(".git", "package.json", "pubspec.yaml", "build.gradle", "node_modules", ".gradle", "android")
    foreach ($m in $markers) {
        if (Test-Path -LiteralPath (Join-Path $DirPath $m)) { return $true }
    }
    if (Get-ChildItem -LiteralPath $DirPath -Filter "*.sln" -File -ErrorAction SilentlyContinue | Select-Object -First 1) {
        return $true
    }
    return $false
}

function Get-SuggestedProjectFromRemote {
    param([string]$Remote)
    if (-not $Remote) { return "unknown" }
    $r = $Remote.ToLowerInvariant()
    if ($r -match "carbon-gen|carbon_gen|shopcarbon") { return "carbon-gen" }
    if ($r -match "warehouse|carbon-warehouse|wms") { return "carbon-wms" }
    return "general"
}

function Register-GitRoot {
    param([string]$GitParent)
    if (-not $GitParent) { return }
    $resolved = (Resolve-Path -LiteralPath $GitParent -ErrorAction SilentlyContinue).Path
    if (-not $resolved) { return }
    [void]$script:gitRootsSeen.Add($resolved)
}

function Find-GitWorkTreesUnder {
    param(
        [string]$Root,
        [int]$MaxDepth,
        [int]$Depth = 0
    )
    if ($Depth -gt $MaxDepth) { return }
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return }
    $gitPath = Join-Path $Root ".git"
    if (Test-Path -LiteralPath $gitPath) {
        Register-GitRoot -GitParent $Root
        return
    }
    try {
        Get-ChildItem -LiteralPath $Root -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
            Find-GitWorkTreesUnder -Root $_.FullName -MaxDepth $MaxDepth -Depth ($Depth + 1)
        }
    }
    catch {}
}

function Invoke-GitTriage {
    param([string]$GitRoot)
    $remote = ""
    $branch = ""
    $dirty = "UNKNOWN"
    $unpushed = "UNKNOWN"
    $untrackedBucket = "N_A"
    try {
        $remote = (& git -C $GitRoot remote get-url origin 2>$null)
        if (-not $remote) { $remote = "" }
        $branch = (& git -C $GitRoot branch --show-current 2>$null)
        if (-not $branch) { $branch = "" }
        $porcelain = & git -C $GitRoot status --porcelain 2>$null
        if ($null -eq $porcelain) {
            $dirty = "NO_GIT"
        }
        elseif ([string]::IsNullOrWhiteSpace(($porcelain -join ""))) {
            $dirty = "clean"
            $untrackedBucket = "0"
        }
        else {
            $lines = @($porcelain | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            $n = $lines.Count
            if ($n -eq 0) { $dirty = "clean"; $untrackedBucket = "0" }
            elseif ($n -lt 10) { $dirty = "dirty_few" }
            else { $dirty = "dirty_many" }
            $ut = 0
            foreach ($ln in $lines) {
                if ($ln -match '^\?\?') { $ut++ }
            }
            if ($dirty -ne "NO_GIT") {
                if ($ut -eq 0) { $untrackedBucket = "0" }
                elseif ($ut -lt 10) { $untrackedBucket = "few" }
                else { $untrackedBucket = "many" }
            }
        }
        $ahead = & git -C $GitRoot rev-list --count "@{u}..HEAD" 2>$null
        if ($LASTEXITCODE -eq 0 -and $ahead -match '^\d+$') {
            if ([int]$ahead -gt 0) { $unpushed = "ahead_$ahead" } else { $unpushed = "none" }
        }
        else {
            $unpushed = "no_upstream_or_error"
        }
    }
    catch {
        $dirty = "ERROR"
    }
    [pscustomobject]@{
        GitRoot           = $GitRoot
        Remote            = $remote
        Branch            = $branch
        Dirty             = $dirty
        UntrackedBucket   = $untrackedBucket
        UnpushedHint      = $unpushed
        SuggestedProject  = (Get-SuggestedProjectFromRemote -Remote $remote)
        SuggestedAction   = ""
    }
}

function Add-L1CanonicalPaths {
    $u = $env:USERPROFILE
    $pairs = @(
        @{ P = Join-Path $env:APPDATA "Cursor"; C = "cursor" },
        @{ P = Join-Path $u ".cursor"; C = "cursor" },
        @{ P = Join-Path $env:LOCALAPPDATA "Cursor"; C = "cursor" },
        @{ P = Join-Path $env:APPDATA "Code"; C = "vscode" },
        @{ P = Join-Path $u ".vscode"; C = "vscode" },
        @{ P = Join-Path $env:APPDATA "npm"; C = "node" },
        @{ P = Join-Path $env:LOCALAPPDATA "npm-cache"; C = "node" },
        @{ P = Join-Path $u ".npm"; C = "node" },
        @{ P = Join-Path $env:LOCALAPPDATA "pnpm"; C = "node" },
        @{ P = Join-Path $u ".nuget\packages"; C = "nuget" },
        @{ P = Join-Path $u ".gradle"; C = "gradle" },
        @{ P = Join-Path $env:LOCALAPPDATA "Android"; C = "android" },
        @{ P = Join-Path $u ".android"; C = "android" },
        @{ P = Join-Path $u ".docker"; C = "docker" },
        @{ P = "C:\ProgramData\Docker"; C = "docker" },
        @{ P = Join-Path $u ".dotnet"; C = "dotnet" },
        @{ P = Join-Path $env:APPDATA "JetBrains"; C = "jetbrains" },
        @{ P = Join-Path $env:LOCALAPPDATA "JetBrains"; C = "jetbrains" },
        @{ P = Join-Path $env:LOCALAPPDATA "Yarn"; C = "node" },
        @{ P = Join-Path $env:LOCALAPPDATA "node\corepack"; C = "node" }
    )
    if ($env:GRADLE_USER_HOME) {
        $pairs += @{ P = $env:GRADLE_USER_HOME; C = "gradle" }
    }
    if ($env:PUB_CACHE) {
        $pairs += @{ P = $env:PUB_CACHE; C = "flutter_pub" }
    }
    if ($env:FLUTTER_ROOT) {
        $pairs += @{ P = $env:FLUTTER_ROOT; C = "flutter_sdk" }
    }
    $pairs += @{ P = "D:\flutter"; C = "flutter_sdk" }
    $pairs += @{ P = "D:\CarbonWmsTooling"; C = "tooling" }
    $pairs += @{ P = "D:\Projects\My project\carbon-gen"; C = "live_repo" }
    $pairs += @{ P = "D:\Projects\My project\carbon-warehouse-management"; C = "live_repo" }
    $pairs += @{ P = "D:\Projects\carbon-gen-backups-outside"; C = "backup_tree" }
    $pairs += @{ P = $BackupRoot; C = "backup_mirror" }

    $l1FastCats = @("backup_mirror", "backup_tree")
    foreach ($x in $pairs) {
        if (-not (Test-Path -LiteralPath $x.P)) {
            Write-Host ('L1: {0} ({1}) - missing (row only)' -f $x.P, $x.C) -ForegroundColor DarkGray
            Add-Row -RootPath $x.P -Layer "L1" -Category $x.C -SuggestedProject "general" -SizeGb 0 -OldestMtime $null -NewestMtime $null -Notes "missing"
            continue
        }
        if (-not $FullSizeBackupRoots -and $x.C -in $l1FastCats) {
            Write-Host ('L1: {0} ({1}) - fast mode (no recursive size; hours avoided)' -f $x.P, $x.C) -ForegroundColor Yellow
            $proj = "general"
            if ($x.P -match "carbon-gen" -and $x.P -notmatch "warehouse") { $proj = "carbon-gen" }
            if ($x.P -match "warehouse-management|carbon-warehouse") { $proj = "carbon-wms" }
            $fastNote = "fast mode: skipped L1 recursive byte count; use -FullSizeBackupRoots or WizTree L4 (docs/dev-inventory-wiztree-windirstat.md)"
            Add-Row -RootPath $x.P -Layer "L1" -Category $x.C -SuggestedProject $proj -SizeGb 0 -OldestMtime $null -NewestMtime $null -HasGit "" -Notes $fastNote
            if ((Test-Path -LiteralPath (Join-Path $x.P ".git"))) {
                Register-GitRoot -GitParent $x.P
            }
            continue
        }
        Write-Host "L1: scanning $($x.P) ($($x.C)) ..." -ForegroundColor Cyan
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $st = Get-SubtreeStats -Path $x.P
        $sw.Stop()
        $gb = $st.Bytes / 1GB
        $errPart = $st.Error
        if ([string]::IsNullOrWhiteSpace($errPart)) {
            $note = "elapsed $($sw.Elapsed.ToString())"
        }
        else {
            $note = "$errPart; elapsed $($sw.Elapsed.ToString())"
        }
        $proj = "general"
        if ($x.P -match "carbon-gen" -and $x.P -notmatch "warehouse") { $proj = "carbon-gen" }
        if ($x.P -match "warehouse-management|carbon-warehouse") { $proj = "carbon-wms" }
        Write-Host ("L1: finished {0:N3} GB in {1}" -f $gb, $sw.Elapsed) -ForegroundColor Green
        Add-Row -RootPath $x.P -Layer "L1" -Category $x.C -SuggestedProject $proj -SizeGb $gb -OldestMtime $st.Oldest -NewestMtime $st.Newest -HasGit "" -Notes $note
        if ((Test-Path -LiteralPath (Join-Path $x.P ".git"))) {
            Register-GitRoot -GitParent $x.P
        }
    }

    # SSH / gitconfig: metadata only (no key contents)
    Write-Host "L1: ancillary (gitconfig, .ssh, WSL vhdx)..." -ForegroundColor DarkGray
    $gitconfig = Join-Path $u ".gitconfig"
    if (Test-Path -LiteralPath $gitconfig) {
        $fi = Get-Item -LiteralPath $gitconfig
        Add-Row -RootPath $gitconfig -Layer "L1" -Category "git_config" -SuggestedProject "general" -SizeGb ($fi.Length / 1GB) -OldestMtime $fi.LastWriteTime -NewestMtime $fi.LastWriteTime
    }
    $sshDir = Join-Path $u ".ssh"
    if (Test-Path -LiteralPath $sshDir -PathType Container) {
        $st = Get-SubtreeStats -Path $sshDir -MaxDepth 2
        Add-Row -RootPath $sshDir -Layer "L1" -Category "ssh_dir_meta" -SuggestedProject "general" -SizeGb ($st.Bytes / 1GB) -OldestMtime $st.Oldest -NewestMtime $st.Newest -Notes "filenames only in inventory; do not log key material"
    }

    # WSL ext4.vhdx (size-only; deep use is on Linux)
    $pkgRoot = Join-Path $env:LOCALAPPDATA "Packages"
    if (Test-Path -LiteralPath $pkgRoot) {
        Get-ChildItem -LiteralPath $pkgRoot -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
            $vhd = Join-Path $_.FullName "LocalState\ext4.vhdx"
            if (Test-Path -LiteralPath $vhd) {
                try {
                    $fi = Get-Item -LiteralPath $vhd -Force
                    Add-Row -RootPath $vhd -Layer "L1" -Category "wsl_vhd" -SuggestedProject "general" -SizeGb ($fi.Length / 1GB) -OldestMtime $fi.LastWriteTime -NewestMtime $fi.LastWriteTime -Notes "WSL disk; list only"
                }
                catch { }
            }
        }
    }
}

function Add-L2DriveD {
    if (-not (Test-Path -LiteralPath "D:\")) {
        Add-Row -RootPath "D:\" -Layer "L2" -Category "drive" -SuggestedProject "general" -SizeGb 0 -OldestMtime $null -NewestMtime $null -Notes "D: not available"
        return
    }
    Get-ChildItem -LiteralPath "D:\" -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $dir = $_.FullName
        $resolvedDir = $null
        try {
            $resolvedDir = (Resolve-Path -LiteralPath $dir).Path
        }
        catch {
            $resolvedDir = $dir
        }

        $fastBackupL2 = $false
        if (-not $FullSizeBackupRoots) {
            if ($script:resolvedBackupRootPath -and $resolvedDir -eq $script:resolvedBackupRootPath) { $fastBackupL2 = $true }
            if ($script:resolvedBackupOutsidePath -and $resolvedDir -eq $script:resolvedBackupOutsidePath) { $fastBackupL2 = $true }
        }

        if ($fastBackupL2) {
            Write-Host ('L2: {0} - fast mode (no size / git crawl / zip crawl under this root)' -f $dir) -ForegroundColor Yellow
            $nFast = "fast mode: skipped L2 recursive size, Find-GitWorkTreesUnder, zip listing; LikelyDev not evaluated; use -FullSizeBackupRoots or WizTree L4"
            Add-Row -RootPath $dir -Layer "L2" -Category "d_root" -SuggestedProject "unknown" -SizeGb 0 -OldestMtime $null -NewestMtime $null -Notes $nFast
            if ((Test-Path -LiteralPath (Join-Path $dir ".git"))) {
                Register-GitRoot -GitParent $dir
            }
            return
        }

        Write-Host "L2: scanning $dir ..." -ForegroundColor Cyan
        $sw2 = [System.Diagnostics.Stopwatch]::StartNew()
        $st = Get-SubtreeStats -Path $dir
        $sw2.Stop()
        $gb = $st.Bytes / 1GB
        $likely = Test-LikelyDevHeuristic -DirPath $dir
        $notes = if ($likely) { "LikelyDev=Y" } else { "LikelyDev=N" }
        if ($st.Error) { $notes += "; $($st.Error)" }
        $notes += "; subtree elapsed $($sw2.Elapsed.ToString())"
        Write-Host ('L2: finished {0} - {1:N3} GB in {2}' -f (Split-Path $dir -Leaf), $gb, $sw2.Elapsed) -ForegroundColor Green
        Add-Row -RootPath $dir -Layer "L2" -Category "d_root" -SuggestedProject "unknown" -SizeGb $gb -OldestMtime $st.Oldest -NewestMtime $st.Newest -Notes $notes
        if ((Test-Path -LiteralPath (Join-Path $dir ".git"))) {
            Register-GitRoot -GitParent $dir
        }
        if ($likely -or $gb -ge $DDeepScanMinSizeGb) {
            Find-GitWorkTreesUnder -Root $dir -MaxDepth 6
            try {
                Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction SilentlyContinue -Depth $DeepScanMaxZipDepth |
                    Where-Object { $_.Extension -in ".zip", ".7z", ".rar" } |
                    ForEach-Object {
                        Add-Row -RootPath $_.FullName -Layer "L2" -Category "backup_zip" -SuggestedProject "unknown" -SizeGb ($_.Length / 1GB) -OldestMtime $_.LastWriteTime -NewestMtime $_.LastWriteTime -Notes "archive under $(Split-Path $dir -Leaf)"
                    }
            }
            catch { }
        }
    }
}

function Add-L3CUserAndProgramData {
    $u = $env:USERPROFILE
    if (-not (Test-Path -LiteralPath $u)) { return }
    $skipLeaf = @("Application Data", "Cookies", "Local Settings", "My Documents", "NetHood", "PrintHood", "Recent", "SendTo", "Start Menu", "Templates")
    Get-ChildItem -LiteralPath $u -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $leaf = $_.Name
        if ($skipLeaf -contains $leaf) { return }
        $full = $_.FullName
        # AppData: L1 already lists common dev subtrees; skip whole-tree duplicate pass
        if ($leaf -eq "AppData") { return }
        $st2 = Get-SubtreeStats -Path $full
        $gb = $st2.Bytes / 1GB
        if ($gb -lt 0.05) { return }
        Add-Row -RootPath $full -Layer "L3" -Category "profile_subdir" -SuggestedProject "general" -SizeGb $gb -OldestMtime $st2.Oldest -NewestMtime $st2.Newest
        if ((Test-Path -LiteralPath (Join-Path $full ".git"))) {
            Register-GitRoot -GitParent $full
        }
    }

    # Targeted ProgramData dev-related (skip if same path already in L1 rows — Docker is L1 only)
    $pdPaths = @(
        (Join-Path $env:ProgramData "chocolatey"),
        (Join-Path $env:ProgramData "Microsoft\VisualStudio"),
        (Join-Path $env:ProgramData "git")
    )
    foreach ($pd in $pdPaths) {
        if (-not (Test-Path -LiteralPath $pd)) { continue }
        $st = Get-SubtreeStats -Path $pd
        Add-Row -RootPath $pd -Layer "L3" -Category "programdata_dev" -SuggestedProject "general" -SizeGb ($st.Bytes / 1GB) -OldestMtime $st.Oldest -NewestMtime $st.Newest -Notes "ProgramData subtree"
    }
}

function Add-ExtraScanRoots {
    $inv = Get-InventoryDir -Create:$false
    if (-not (Test-Path -LiteralPath $inv)) { return }
    $extraFile = Join-Path $inv "extra-scan-roots.txt"
    if (-not (Test-Path -LiteralPath $extraFile)) {
        if (-not $WhatIf) {
            @(
                "# One absolute path per line (e.g. D:\OldDev). Lines starting with # are ignored."
            ) | Set-Content -LiteralPath $extraFile -Encoding UTF8
        }
        return
    }
    Get-Content -LiteralPath $extraFile -ErrorAction SilentlyContinue | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        if (-not (Test-Path -LiteralPath $line)) {
            Add-Row -RootPath $line -Layer "L1" -Category "extra_root" -SuggestedProject "unknown" -SizeGb 0 -OldestMtime $null -NewestMtime $null -Notes "extra-scan-roots: missing"
            return
        }
        $st = Get-SubtreeStats -Path $line
        Add-Row -RootPath $line -Layer "L1" -Category "extra_root" -SuggestedProject "unknown" -SizeGb ($st.Bytes / 1GB) -OldestMtime $st.Oldest -NewestMtime $st.Newest
        Find-GitWorkTreesUnder -Root $line -MaxDepth 8
    }
}

function Send-L1CompleteEmail {
    if ($phaseOutlookEnabled) { return }
    if ([string]::IsNullOrWhiteSpace($NotifyL1CompleteEmailTo)) { return }

    $invPath = Join-Path $BackupRoot $OutputSubdir
    $body = @"
dev-disk-inventory: L1 (canonical paths) finished.

Time: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Run id: $ts
Inventory dir: $invPath

L2 (D:\ scan) is starting next in this same run — check the PowerShell window for progress.
"@
    $subject = "dev-disk-inventory: L1 complete ($ts)"

    if ($NotifyL1CompleteViaOutlook) {
        try {
            $sendAs = $OutlookSendAsSmtp
            if ([string]::IsNullOrWhiteSpace($sendAs)) { $sendAs = $NotifyL1CompleteEmailTo }
            Send-OutlookInventoryMail -To $NotifyL1CompleteEmailTo -SendUsingSmtp $sendAs -Subject $subject -Body $body
            Write-Host "L1 notification sent via Outlook to $NotifyL1CompleteEmailTo" -ForegroundColor Green
        }
        catch {
            Write-Warning "L1 Outlook send failed: $($_.Exception.Message). If you use New Outlook only, try classic desktop Outlook or use SMTP parameters instead."
        }
        return
    }

    if ([string]::IsNullOrWhiteSpace($SmtpServer) -or [string]::IsNullOrWhiteSpace($SmtpFrom)) {
        Write-Warning "L1 email skipped: use -NotifyL1CompleteViaOutlook, or set -SmtpServer and -SmtpFrom (and usually -SmtpCredential)."
        return
    }
    $useSsl = -not $SmtpNoSsl
    try {
        $mailParams = @{
            To         = $NotifyL1CompleteEmailTo
            From       = $SmtpFrom
            Subject    = $subject
            Body       = $body
            SmtpServer = $SmtpServer
            Port       = $SmtpPort
            UseSsl     = $useSsl
        }
        if ($null -ne $SmtpCredential) {
            $mailParams['Credential'] = $SmtpCredential
        }
        Send-MailMessage @mailParams
        Write-Host "L1 completion email sent to $NotifyL1CompleteEmailTo (SMTP)." -ForegroundColor Green
    }
    catch {
        Write-Warning "L1 completion email failed: $($_.Exception.Message)"
    }
}

# --- main ---
Write-Host "=== dev-disk-inventory $ts ===" -ForegroundColor Cyan
Write-Host "BackupRoot: $BackupRoot"

if ($WhatIf) {
    $invPreview = Get-InventoryDir -Create:$false
    Write-Host "Inventory dir (would use): $invPreview"
    Write-Host "[WhatIf] Would run L1, L2, L3, extra roots, git triage (unless -SkipGitTriage)."
    exit 0
}

$invDir = Get-InventoryDir -Create
$script:invDirForNotify = $invDir
Write-Host "Inventory dir: $invDir"

$script:resolvedBackupRootPath = $null
if (Test-Path -LiteralPath $BackupRoot) {
    $script:resolvedBackupRootPath = (Resolve-Path -LiteralPath $BackupRoot).Path
}
$script:resolvedBackupOutsidePath = $null
$l1OutsideBackup = "D:\Projects\carbon-gen-backups-outside"
if (Test-Path -LiteralPath $l1OutsideBackup) {
    $script:resolvedBackupOutsidePath = (Resolve-Path -LiteralPath $l1OutsideBackup).Path
}
if (-not $FullSizeBackupRoots) {
    Write-Host "Note: L1/L2 use fast mode for backup_mirror / backup_tree and matching D:\ folders (no recursive sizing). Use -FullSizeBackupRoots for full counts." -ForegroundColor Yellow
}

try {
    Write-Host "L1 canonical paths..."
    Add-L1CanonicalPaths
    Write-Host "L1 done." -ForegroundColor Green
    Send-DevInventoryPhaseOutlook -Phase "L1" -DetailLines @(
        "Canonical path scan finished.",
        "Inventory rows so far: $($script:rows.Count)",
        "Next: L2 (D:\ top-level + deep heuristics)."
    )
    Send-L1CompleteEmail

    Write-Host "L2 D:\ top-level + deep heuristics (may take a while)..."
    Add-L2DriveD
    Write-Host "L2 done." -ForegroundColor Green
    Send-DevInventoryPhaseOutlook -Phase "L2" -DetailLines @(
        "D:\ scan finished.",
        "Inventory rows so far: $($script:rows.Count)",
        "Next: L3 (user profile + ProgramData dev)."
    )

    Write-Host "L3 user profile + ProgramData dev..."
    Add-L3CUserAndProgramData
    Write-Host "L3 done." -ForegroundColor Green
    Send-DevInventoryPhaseOutlook -Phase "L3" -DetailLines @(
        "Profile / ProgramData dev subtrees finished.",
        "Inventory rows so far: $($script:rows.Count)",
        "Next: extra scan roots (extra-scan-roots.txt)."
    )

    Write-Host "Extra scan roots..."
    Add-ExtraScanRoots
    Write-Host "Extra scan roots done." -ForegroundColor Green
    Send-DevInventoryPhaseOutlook -Phase "Extra roots" -DetailLines @(
        "extra-scan-roots.txt pass finished.",
        "Inventory rows so far: $($script:rows.Count)",
        "Next: write master CSV, then git triage (L5) if enabled."
    )

    $masterCsv = Join-Path $invDir "dev-inventory-$ts.csv"
    $script:rows | Sort-Object OldestMtime | Export-Csv -LiteralPath $masterCsv -NoTypeInformation -Encoding UTF8
    Write-Host "Wrote $masterCsv ($($script:rows.Count) rows)"

    $gitCsv = Join-Path $invDir "git-triage-$ts.csv"
    $gitWrote = $false
    $gitRepoCount = 0
    $gitRowCount = 0
    if (-not $SkipGitTriage -and $script:gitRootsSeen.Count -gt 0) {
        $gitList = @($script:gitRootsSeen)
        if ($gitList.Count -gt $GitTriageMaxRepos) {
            Write-Warning "Git roots $($gitList.Count) exceeds GitTriageMaxRepos=$GitTriageMaxRepos; triaging first $GitTriageMaxRepos only."
            $gitList = $gitList[0..($GitTriageMaxRepos - 1)]
        }
        $gitRepoCount = $gitList.Count
        $gitRows = [System.Collections.Generic.List[object]]::new()
        $n = 0
        foreach ($g in $gitList) {
            $n++
            Write-Host "  git triage ($n/$($gitList.Count)): $g"
            $gitRows.Add((Invoke-GitTriage -GitRoot $g))
        }
        $gitRows | Export-Csv -LiteralPath $gitCsv -NoTypeInformation -Encoding UTF8
        $gitRowCount = $gitRows.Count
        $gitWrote = $true
        Write-Host "Wrote $gitCsv"
    }
    else {
        Write-Host "Skip git triage (no repos or -SkipGitTriage)."
    }

    $skipReason = $null
    if (-not $gitWrote) {
        if ($SkipGitTriage) { $skipReason = "Skipped: -SkipGitTriage" }
        elseif ($script:gitRootsSeen.Count -eq 0) { $skipReason = "Skipped: no git roots collected" }
        else { $skipReason = "Skipped: git CSV not written" }
    }

    if ($gitWrote) {
        $l5Lines = @(
            "Git triage finished.",
            "Repos triaged: $gitRepoCount",
            "Git CSV rows: $gitRowCount",
            "Git CSV: $gitCsv"
        )
    }
    else {
        $l5Lines = @($skipReason)
    }
    Send-DevInventoryPhaseOutlook -Phase "L5 (git triage)" -DetailLines $l5Lines

    $completeLines = [System.Collections.Generic.List[string]]::new()
    $completeLines.Add("Full run finished.")
    $completeLines.Add("Master CSV: $masterCsv ($($script:rows.Count) rows)")
    if ($gitWrote) {
        $completeLines.Add("Git CSV: $gitCsv ($gitRepoCount repos, $gitRowCount rows)")
    }
    else {
        $completeLines.Add("Git CSV: not written ($skipReason)")
    }
    Send-DevInventoryPhaseOutlook -Phase "Complete" -DetailLines @($completeLines.ToArray())

    Write-Host "Done." -ForegroundColor Green
}
finally {
    Dispose-SharedOutlookApplication
}
