@echo off
set ROOT=%~dp0
set ELECTRON_RUN_AS_NODE=
if /i "%1"=="dev" (
    powershell -NoExit -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-desktop.ps1" -Dev
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-desktop.ps1"
)
