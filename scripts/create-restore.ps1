$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$projectsRoot = Split-Path -Parent (Split-Path -Parent $repo)
$outRoot = Join-Path $projectsRoot "carbon-gen-backups-outside"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundlePath = Join-Path $outRoot "carbon-gen-restore-$timestamp.bundle"
$notePath = Join-Path $outRoot "RESTORE-$timestamp.txt"

if (!(Test-Path $outRoot)) {
  New-Item -ItemType Directory -Path $outRoot -Force | Out-Null
}

Push-Location $repo
try {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  $commit = (git rev-parse HEAD).Trim()

  git bundle create $bundlePath --all | Out-Null

  @(
    "Repo: $repo"
    "CreatedAt: $([DateTime]::Now.ToString('o'))"
    "Branch: $branch"
    "Commit: $commit"
    "Bundle: $bundlePath"
    ""
    "Restore command:"
    "git clone `"$bundlePath`" carbon-gen-restore"
  ) | Set-Content -Path $notePath -Encoding UTF8

  Write-Host "Restore bundle created:"
  Write-Host "  $bundlePath"
  Write-Host "Restore note created:"
  Write-Host "  $notePath"
} finally {
  Pop-Location
}
