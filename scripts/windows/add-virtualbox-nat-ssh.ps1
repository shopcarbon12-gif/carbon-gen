<#
  Windows host: NAT port forward so you can SSH / Cursor Remote-SSH to the Ubuntu guest.

  Rule: 127.0.0.1:2222 -> guest port 22 (Adapter 1 NAT).

  If the VM is RUNNING: adds a live rule (works until VM power-off).
  If the VM is STOPPED: adds a permanent rule in the VM config.

  Usage (PowerShell):
    powershell -ExecutionPolicy Bypass -File .\scripts\windows\add-virtualbox-nat-ssh.ps1

  Guest must have OpenSSH server: sudo apt install -y openssh-server

  Test from Windows:
    ssh -p 2222 eliorp1@127.0.0.1
#>
$ErrorActionPreference = 'Stop'
$vm = 'UbuntuDev'
$vb = 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
$rule = 'guestssh,tcp,127.0.0.1,2222,,22'

$state = & $vb showvminfo $vm --machinereadable 2>&1 | Select-String -Pattern '^VMState=' | ForEach-Object { $_ -replace '^VMState="?|"?$', '' }

if ($state -eq 'running') {
  Write-Host "VM is running: adding live NAT rule (lost after full VM power-off unless you also run this with VM stopped)."
  & $vb controlvm $vm natpf1 $rule
} else {
  Write-Host "VM is not running: adding permanent NAT rule to VM config."
  & $vb modifyvm $vm --natpf1 $rule
}

Write-Host "Done. Test: ssh -p 2222 eliorp1@127.0.0.1" -ForegroundColor Green
