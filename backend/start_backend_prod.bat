@echo off
cd /d %~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_backend_prod.ps1"
exit /b %errorlevel%
