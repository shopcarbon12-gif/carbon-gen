#requires -Version 5.1
<#
.SYNOPSIS
  Stops any process listening on TCP port 3000 (Windows).
#>
$ErrorActionPreference = "SilentlyContinue"
$port = 3000
$found = $false
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  $found = $true
  $procId = [int]$_.OwningProcess
  Write-Host "Stopping PID $procId (port $port)"
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}
if (-not $found) {
  Write-Host "Nothing listening on port $port."
} else {
  Write-Host "Port $port should be free. Run: npm run dev"
}
