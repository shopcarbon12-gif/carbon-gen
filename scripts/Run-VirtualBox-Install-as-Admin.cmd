@echo off
title VirtualBox install (elevated)
cd /d D:\Scripts
echo This window will ask for Administrator permission (UAC).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','D:\Scripts\install-virtualbox-d-drive.ps1'); exit $LASTEXITCODE"
echo.
echo Finished with exit code %ERRORLEVEL%.
pause
