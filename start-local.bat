@echo off
start "Backend" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0backend\start_backend.ps1"
start "Frontend" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0frontend\start_frontend.ps1"
