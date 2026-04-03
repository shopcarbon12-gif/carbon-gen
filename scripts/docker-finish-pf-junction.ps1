#Requires -Version 5.1
<#
  FINISH moving Docker "Program Files" to D: after a failed/partial delete left ~111 MB on C:
  with locked docker-agent.exe / docker-sandbox.exe.

  PRE: Full copy must exist at D:\Docker\ProgramFiles-Docker (from robocopy).
  Run this script ONCE AS ADMINISTRATOR.

  1) Schedules deletion of the two locked files on next reboot (if still present).
  2) If C:\Program Files\Docker is already gone or empty, creates junction to D: immediately.

  After a reboot, run this script again as Admin to complete the junction.
#>
$ErrorActionPreference = 'Stop'
function Test-Admin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not (Test-Admin)) {
  Write-Error 'Run PowerShell as Administrator (right-click -> Run as administrator).'
}

Add-Type @'
public class WinMove {
  [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError=true, CharSet=System.Runtime.InteropServices.CharSet.Unicode)]
  public static extern bool MoveFileEx(string existing, string newFile, int flags);
}
'@
$DEL = 4
$locked = @(
  'C:\Program Files\Docker\Docker\resources\cli-plugins\docker-agent.exe',
  'C:\Program Files\Docker\Docker\resources\cli-plugins\docker-sandbox.exe'
)
foreach ($f in $locked) {
  if (Test-Path -LiteralPath $f) {
    $ok = [WinMove]::MoveFileEx($f, $null, $DEL)
    Write-Host "Scheduled delete on reboot: $f -> $ok"
  }
}

Stop-Service -Name 'com.docker.service' -Force -ErrorAction SilentlyContinue
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'com.docker*' -or $_.ProcessName -eq 'Docker Desktop' } | Stop-Process -Force -ErrorAction SilentlyContinue
wsl.exe --shutdown 2>$null
Start-Sleep -Seconds 3

$c = 'C:\Program Files\Docker'
$d = 'D:\Docker\ProgramFiles-Docker'
if (-not (Test-Path -LiteralPath "$d\Docker\Docker Desktop.exe")) {
  Write-Error "Missing Docker on D: at $d — cannot create junction."
}

if (-not (Test-Path -LiteralPath $c)) {
  Write-Host "C:\Program Files\Docker absent — creating junction..."
  cmd /c "mklink /J `"$c`" `"$d`""
  Write-Host "Done. Start Docker Desktop."
  exit 0
}

takeown /f $c /r /d y | Out-Null
icacls $c /grant *S-1-5-32-544:F /t /c /q | Out-Null
Remove-Item -LiteralPath $c -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $c) {
  Write-Warning 'Could not remove C:\Program Files\Docker yet. REBOOT Windows, then run this script again as Admin.'
  exit 1
}

cmd /c "mklink /J `"$c`" `"$d`""
if ($LASTEXITCODE -ne 0) { throw 'mklink failed' }
Write-Host 'Junction OK: C:\Program Files\Docker -> D:\Docker\ProgramFiles-Docker'
Write-Host 'Start Docker Desktop from the Start menu.'
