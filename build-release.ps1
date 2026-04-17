$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $root "venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "Ambiente virtual não encontrado. Execute .\install-windows.ps1 primeiro."
}

Write-Host "Executando testes do backend..." -ForegroundColor Cyan
Push-Location (Join-Path $root "backend")
try {
    & $venvPython -m pytest
}
finally {
    Pop-Location
}

Write-Host "Gerando build do frontend..." -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
try {
    npm run build
}
finally {
    Pop-Location
}

Write-Host "Build e testes concluídos com sucesso." -ForegroundColor Green