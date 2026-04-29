@echo off
set ROOT=%~dp0
if /i "%1"=="dev" (
    powershell -NoExit -ExecutionPolicy Bypass -File "%ROOT%start-desktop.ps1" -Dev
) else (
    powershell -NoExit -ExecutionPolicy Bypass -File "%ROOT%start-desktop.ps1"
)
