param(
    [switch]$Dev
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$packagedExeCandidates = @(
    (Join-Path $root "dist-electron\win-unpacked\FormReport Studio.exe"),
    (Join-Path $root "dist-electron\win-unpacked\Media Transcript Studio.exe")
)
$packagedExe = $packagedExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $packagedExe) {
    $packagedExe = $packagedExeCandidates[0]
}
$packagedFrontendNext = Join-Path $root "dist-electron\win-unpacked\resources\frontend\node_modules\next"
$rootNodeModules = Join-Path $root "node_modules"
$electronModule = Join-Path $root "node_modules\electron"
$venvPython = Join-Path $root "venv\Scripts\python.exe"
$frontendNodeModules = Join-Path $root "frontend\node_modules"
$electronFrontendNext = Join-Path $root "electron\resources\frontend\node_modules\next"
$electronFrontendPackage = Join-Path $root "electron\resources\frontend\package.json"

$frontendSourcePaths = @(
    "frontend\app",
    "frontend\components",
    "frontend\hooks",
    "frontend\lib",
    "frontend\services",
    "frontend\types",
    "frontend\prisma",
    "frontend\package.json",
    "frontend\package-lock.json",
    "frontend\next.config.ts",
    "frontend\tailwind.config.ts",
    "frontend\postcss.config.js",
    "frontend\tsconfig.json"
)

$desktopPackageSourcePaths = $frontendSourcePaths + @(
    "electron\main.cjs",
    "package.json",
    "package-lock.json"
)

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

function Get-LatestWriteTimeUtc {
    param([Parameter(Mandatory = $true)][string[]]$RelativePaths)

    $latest = [DateTime]::MinValue

    foreach ($relativePath in $RelativePaths) {
        $fullPath = Join-Path $root $relativePath
        if (-not (Test-Path $fullPath)) {
            continue
        }

        $item = Get-Item $fullPath
        if ($item.PSIsContainer) {
            $child = Get-ChildItem $fullPath -Recurse -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTimeUtc -Descending |
                Select-Object -First 1
            if ($null -ne $child -and $child.LastWriteTimeUtc -gt $latest) {
                $latest = $child.LastWriteTimeUtc
            }
        }
        elseif ($item.LastWriteTimeUtc -gt $latest) {
            $latest = $item.LastWriteTimeUtc
        }
    }

    return $latest
}

function Test-FrontendResourcesCurrent {
    if (-not (Test-Path $electronFrontendNext) -or -not (Test-Path $electronFrontendPackage)) {
        return $false
    }

    $sourceTime = Get-LatestWriteTimeUtc -RelativePaths $frontendSourcePaths
    $resourceTime = (Get-Item $electronFrontendPackage).LastWriteTimeUtc

    return $resourceTime -ge $sourceTime
}

function Test-PackagedAppCurrent {
    if (-not (Test-Path $packagedExe) -or -not (Test-Path $packagedFrontendNext)) {
        return $false
    }

    $sourceTime = Get-LatestWriteTimeUtc -RelativePaths $desktopPackageSourcePaths
    $packageTime = (Get-Item $packagedExe).LastWriteTimeUtc

    return $packageTime -ge $sourceTime
}

function Ensure-ElectronResources {
    if (Test-FrontendResourcesCurrent) {
        return
    }

    Write-Host "Preparando a interface local do desktop..." -ForegroundColor Yellow
    Push-Location $root
    try {
        npm run desktop:prepare:frontend
    }
    finally {
        Pop-Location
    }
}

if (-not $Dev -and (Test-PackagedAppCurrent)) {
    Write-Host "Abrindo a versao desktop empacotada..." -ForegroundColor Green
    Write-Host "(Para rodar a partir do codigo-fonte atual, use: start-desktop.bat dev)" -ForegroundColor DarkGray
    Start-Process -FilePath $packagedExe -WorkingDirectory (Split-Path -Parent $packagedExe)
    exit 0
}
elseif (-not $Dev -and (Test-Path $packagedExe)) {
    Write-Host "Abrindo a versao local atual pelo codigo-fonte." -ForegroundColor Yellow
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
