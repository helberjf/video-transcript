@echo off
cd /d %~dp0
start "Backend" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0backend\start_backend_prod.ps1"
start "Frontend" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0frontend\start_frontend_prod.ps1"
start "" http://127.0.0.1:3000
