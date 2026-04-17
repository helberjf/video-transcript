@echo off
cd /d %~dp0
if not exist .env.local if exist .env.example copy .env.example .env.local >nul
npm run dev
