@echo off
set ROOT=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%uninstall-modeloia.ps1"
