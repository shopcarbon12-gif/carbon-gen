$ErrorActionPreference = "Stop"

$tunnelName = "carbon-gen"

function Resolve-CloudflaredExe {
  $fromPath = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($fromPath -and $fromPath.Source -and (Test-Path $fromPath.Source)) {
    return $fromPath.Source
  }

  $candidates = @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

function Resolve-CloudflaredConfig {
  $repo = Split-Path -Parent $PSScriptRoot
  $candidates = @(
    $env:CLOUDFLARED_CONFIG,
    $env:CF_TUNNEL_CONFIG,
    "$repo\.cloudflared\config.yml",
    "$repo\.cloudflare\config.yml",
    "$env:USERPROFILE\.cloudflared\config.yml",
    "$env:USERPROFILE\.cloudflare\config.yml",
    "C:\Windows\System32\config\systemprofile\.cloudflared\config.yml",
    "C:\Windows\System32\config\systemprofile\.cloudflare\config.yml"
  ) | Where-Object { $_ -and $_.Trim() -ne "" }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

$cloudflared = Resolve-CloudflaredExe
if (-not $cloudflared) {
  throw "cloudflared executable not found. Install cloudflared or add it to PATH."
}

$config = Resolve-CloudflaredConfig
if (-not $config) {
  throw "cloudflared config not found. Set CLOUDFLARED_CONFIG or CF_TUNNEL_CONFIG."
}

Write-Host "Starting tunnel '$tunnelName' with config '$config'..."
& $cloudflared tunnel --config $config run $tunnelName
