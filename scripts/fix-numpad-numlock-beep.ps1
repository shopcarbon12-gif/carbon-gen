# Fixes common causes of: Num Lock beep + numpad not typing digits (current user).
# - Turns off Toggle Keys sound (registry classic off value).
# - Turns off Mouse Keys (numpad was moving the mouse instead of typing numbers).
# - Sets Num Lock ON at logon for this Windows user (InitialKeyboardIndicators = 2).
#
# After running: sign out and back in (or reboot). Then press Num Lock once if needed.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Projects\My project\carbon-gen\scripts\fix-numpad-numlock-beep.ps1"

$ErrorActionPreference = 'Stop'

$ToggleKeys = 'HKCU:\Control Panel\Accessibility\ToggleKeys'
$MouseKeys = 'HKCU:\Control Panel\Accessibility\MouseKeys'
$Keyboard = 'HKCU:\Control Panel\Keyboard'

if (-not (Test-Path $ToggleKeys)) { New-Item -Path $ToggleKeys -Force | Out-Null }
if (-not (Test-Path $MouseKeys)) { New-Item -Path $MouseKeys -Force | Out-Null }

# REG_SZ: 58 = Toggle Keys off (classic); stops caps/num/scroll lock sounds from this feature.
Set-ItemProperty -Path $ToggleKeys -Name Flags -Value '58' -Type String

# REG_SZ: 0 = Mouse Keys off — frees the numeric keypad for typing digits.
Set-ItemProperty -Path $MouseKeys -Name Flags -Value '0' -Type String

# REG_SZ: 2 = Num Lock on at logon for this user profile.
Set-ItemProperty -Path $Keyboard -Name InitialKeyboardIndicators -Value '2' -Type String

Write-Host 'Applied (current user): ToggleKeys off (58), MouseKeys off (0), NumLock on at logon (2).'
Write-Host 'Sign out and sign in (or reboot). Open Notepad and test the numpad with Num Lock on.'
