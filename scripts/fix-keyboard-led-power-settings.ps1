# Disables Fast Startup and USB selective suspend (helps some USB keyboard LED sync issues).
# Run elevated: Right-click PowerShell -> Run as administrator, then:
#   Set-Location 'D:\Projects\My project\carbon-gen\scripts'
#   .\fix-keyboard-led-power-settings.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

# Fast Startup off
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' `
    -Name HiberbootEnabled -Value 0 -Type DWord -Force

# USB selective suspend: resolve GUID (differs slightly on some Windows builds; docs often typo the last segment)
$usbSubgroup = '2a737441-1930-4402-8d77-b2bebba308a3'
$fallback = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
$query = powercfg /query SCHEME_CURRENT $usbSubgroup 2>&1 | Out-String
$m = [regex]::Match($query, '48e6b7a6-50f5-4782-a5d4-53bb8[a-f0-9]{8}')
if ($m.Success) { $usbSetting = $m.Value } else { $usbSetting = $fallback }
powercfg /setacvalueindex SCHEME_CURRENT $usbSubgroup $usbSetting 0 | Out-Null
powercfg /setdcvalueindex SCHEME_CURRENT $usbSubgroup $usbSetting 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null

Write-Host 'Fast Startup disabled (HiberbootEnabled=0).'
Write-Host "USB selective suspend disabled (setting $usbSetting)."
Write-Host 'Shut down fully (not Restart from hybrid state) once, then power on and test Caps Lock LED.'
