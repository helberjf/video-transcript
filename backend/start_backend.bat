@echo off
cd /d %~dp0
if not exist .env if exist .env.example copy .env.example .env >nul
..\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
