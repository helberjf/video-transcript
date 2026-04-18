param(
    [switch]$SkipToolInstallation,
    [switch]$SkipProjectSetup
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)

    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$DisplayName,
        [Parameter(Mandatory = $true)][string]$PackageId
    )

    Write-Host "Instalando $DisplayName via winget..." -ForegroundColor Cyan
    winget install --id $PackageId --exact --accept-package-agreements --accept-source-agreements --silent
    Refresh-ProcessPath
}

function Test-PythonCandidate {
    param(
        [Parameter(Mandatory = $true)][string]$File,
        [string[]]$Args = @()
    )

    try {
        $output = & $File @($Args + @("-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")) 2>$null
        if (-not $output) {
            return $false
        }

        $version = [version]($output | Select-Object -First 1)
        return $version -ge [version]"3.10"
    }
    catch {
        return $false
    }
}

function Resolve-PythonCommand {
    if (Test-CommandExists "py") {
        foreach ($candidateArgs in @(@("-3.10"), @("-3"), @())) {
            if (Test-PythonCandidate -File "py" -Args $candidateArgs) {
                return @{ File = "py"; Args = $candidateArgs }
            }
        }
    }

    if ((Test-CommandExists "python") -and (Test-PythonCandidate -File "python")) {
        return @{ File = "python"; Args = @() }
    }

    throw "Python não foi encontrado após a instalação. Feche e abra o PowerShell novamente, ou valide o PATH."
}

if (-not $SkipToolInstallation) {
    if (-not (Test-CommandExists "winget")) {
        throw "winget não está disponível. Instale o App Installer da Microsoft Store e execute novamente."
    }

    if (-not (Test-PythonCandidate -File "python") -and -not (Test-PythonCandidate -File "py" -Args @("-3.10")) -and -not (Test-PythonCandidate -File "py" -Args @("-3")) -and -not (Test-PythonCandidate -File "py")) {
        Install-WingetPackage -DisplayName "Python 3.10" -PackageId "Python.Python.3.10"
    }

    if (-not (Test-CommandExists "node")) {
        Install-WingetPackage -DisplayName "Node.js LTS" -PackageId "OpenJS.NodeJS.LTS"
    }

    if (-not (Test-CommandExists "ffmpeg")) {
        Install-WingetPackage -DisplayName "FFmpeg" -PackageId "Gyan.FFmpeg"
    }
}

$python = Resolve-PythonCommand

Set-Location $root

if ($SkipProjectSetup) {
    Write-Host "Programas base verificados/instalados. Agora execute .\2-preparar-aplicacao.bat" -ForegroundColor Green
    return
}

if (-not (Test-Path (Join-Path $root "venv\Scripts\python.exe"))) {
    Write-Host "Criando ambiente virtual..." -ForegroundColor Cyan
    & $python.File @($python.Args + @("-m", "venv", "venv"))
}

$venvPython = Join-Path $root "venv\Scripts\python.exe"

Write-Host "Atualizando pip/wheel e alinhando setuptools para o Whisper..." -ForegroundColor Cyan
& $venvPython -m pip install --upgrade pip wheel "setuptools<81"

if (-not (Test-Path (Join-Path $root "backend\.env")) -and (Test-Path (Join-Path $root "backend\.env.example"))) {
    Copy-Item (Join-Path $root "backend\.env.example") (Join-Path $root "backend\.env")
}

if (-not (Test-Path (Join-Path $root "frontend\.env.local")) -and (Test-Path (Join-Path $root "frontend\.env.example"))) {
    Copy-Item (Join-Path $root "frontend\.env.example") (Join-Path $root "frontend\.env.local")
}

Write-Host "Instalando dependências do backend..." -ForegroundColor Cyan
& $venvPython -m pip install --no-build-isolation -r (Join-Path $root "backend\requirements.txt")

Write-Host "Instalando dependências do frontend..." -ForegroundColor Cyan
Push-Location (Join-Path $root "frontend")
try {
    npm ci
}
finally {
    Pop-Location
}

if ($SkipToolInstallation) {
    Write-Host "Dependências do projeto prontas. Agora execute .\3-iniciar-aplicacao.bat" -ForegroundColor Green
}
else {
    Write-Host "Instalação concluída. Execute .\build-release.ps1 para validar e .\run-local-prod.ps1 para abrir a aplicação." -ForegroundColor Green
}
