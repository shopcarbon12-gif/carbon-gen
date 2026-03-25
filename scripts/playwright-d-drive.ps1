# Playwright browser cache on D: (keeps large binaries off C:).
# Requires: run from repo root, or via npm scripts (they cd to root).
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Passthrough
)

$ErrorActionPreference = "Stop"
$env:PLAYWRIGHT_BROWSERS_PATH = "D:\Users\Elior\DevData\playwright-browsers"
New-Item -ItemType Directory -Force -Path $env:PLAYWRIGHT_BROWSERS_PATH | Out-Null

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if ($Passthrough.Count -eq 0) {
  Write-Host "Usage: pass Playwright CLI args, e.g. install | test | test --headed"
  exit 1
}

npx playwright @Passthrough
