param(
    [switch]$Dev
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$packagedExe = Join-Path $root "dist-electron\win-unpacked\Media Transcript Studio.exe"
$packagedFrontendNext = Join-Path $root "dist-electron\win-unpacked\resources\frontend\node_modules\next"
$rootNodeModules = Join-Path $root "node_modules"
$electronModule = Join-Path $root "node_modules\electron"
$venvPython = Join-Path $root "venv\Scripts\python.exe"
$frontendNodeModules = Join-Path $root "frontend\node_modules"
$electronFrontendNext = Join-Path $root "electron\resources\frontend\node_modules\next"

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)

    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-DesktopDependencies {
    if (-not (Test-Path $rootNodeModules) -or -not (Test-Path $electronModule)) {
        if (-not (Test-CommandExists "npm")) {
            throw "Node.js/npm nao foi encontrado. Execute .\install-windows.ps1 primeiro."
        }

        Write-Host "Instalando dependencias do Electron na raiz do projeto..." -ForegroundColor Cyan
        Push-Location $root
        try {
            npm ci
        }
        finally {
            Pop-Location
        }
    }

    if (-not (Test-Path $venvPython)) {
        throw "Ambiente virtual do backend nao encontrado em venv\Scripts\python.exe. Execute .\install-windows.ps1 primeiro."
    }

    if (-not (Test-Path $frontendNodeModules)) {
        throw "Dependencias do frontend nao encontradas em frontend\node_modules. Execute .\install-windows.ps1 primeiro."
    }
}

function Ensure-ElectronResources {
    if (Test-Path $electronFrontendNext) {
        return
    }

    Write-Host "Recursos do frontend desktop incompletos. Preparando Electron..." -ForegroundColor Yellow
    Push-Location $root
    try {
        npm run desktop:prepare:frontend
    }
    finally {
        Pop-Location
    }
}

if (-not $Dev -and (Test-Path $packagedExe) -and (Test-Path $packagedFrontendNext)) {
    Write-Host "Abrindo a versao desktop empacotada..." -ForegroundColor Green
    Write-Host "(Para rodar a partir do codigo-fonte atual, use: start-desktop.bat dev)" -ForegroundColor DarkGray
    Start-Process -FilePath $packagedExe -WorkingDirectory (Split-Path -Parent $packagedExe)
    exit 0
}

Ensure-DesktopDependencies
Ensure-ElectronResources

Write-Host "Executando o app Electron em modo desktop de desenvolvimento..." -ForegroundColor Green
Push-Location $root
try {
    npm run desktop:dev
}
finally {
    Pop-Location
}
