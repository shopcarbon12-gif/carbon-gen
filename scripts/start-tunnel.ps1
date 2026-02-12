$ErrorActionPreference = "Stop"

$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$config = "C:\Windows\System32\config\systemprofile\.cloudflared\config.yml"
$tunnelName = "carbon-gen"

if (!(Test-Path $cloudflared)) {
  throw "cloudflared not found at: $cloudflared"
}

if (!(Test-Path $config)) {
  throw "cloudflared config not found at: $config"
}

Write-Host "Starting tunnel '$tunnelName' with config '$config'..."
& $cloudflared tunnel --config $config run $tunnelName
