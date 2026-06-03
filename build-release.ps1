$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $root "venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "Ambiente virtual nao encontrado. Execute .\install-windows.ps1 primeiro."
}

Write-Host "Executando testes do backend..." -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
try {
    & $venvPython -m pytest
}
finally {
    Pop-Location
}

Write-Host "Gerando instalador desktop do ModeloIA..." -ForegroundColor Cyan
Push-Location $root
try {
    npm run desktop:build
}
finally {
    Pop-Location
}

Write-Host "Build, testes e instalador concluidos com sucesso." -ForegroundColor Green
