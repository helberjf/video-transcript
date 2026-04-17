$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $root "venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "Ambiente virtual não encontrado. Execute .\install-windows.ps1 primeiro."
}

if (-not (Test-Path (Join-Path $root "frontend\.next\BUILD_ID"))) {
    Write-Host "Build de produção não encontrado. Executando .\build-release.ps1..." -ForegroundColor Yellow
    & (Join-Path $root "build-release.ps1")
}

Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "backend\start_backend_prod.ps1")
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "frontend\start_frontend_prod.ps1")

Start-Sleep -Seconds 2
Start-Process "http://127.0.0.1:3000"