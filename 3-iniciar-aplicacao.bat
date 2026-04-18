@echo off
cd /d %~dp0
powershell -ExecutionPolicy Bypass -File "%~dp0run-local-prod.ps1"
