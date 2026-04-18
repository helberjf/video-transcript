$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
}

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)

    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-BackendDependencies {
    param([Parameter(Mandatory = $true)][string]$PythonPath)

    Write-Host "Dependencias do backend ausentes. Instalando requirements..." -ForegroundColor Yellow
    & $PythonPath -m pip install --no-build-isolation -r "requirements.txt"
}

$pythonPath = "..\venv\Scripts\python.exe"
if (-not (Test-Path $pythonPath)) {
    throw "Ambiente virtual nao encontrado em '..\venv'. Execute '.\2-preparar-aplicacao.bat' antes de iniciar."
}

foreach ($commandName in @("ffmpeg", "ffprobe")) {
    if (-not (Test-CommandExists $commandName)) {
        throw "'$commandName' nao foi encontrado no PATH. Execute '.\1-instalar-programas-base.bat' para instalar as dependencias."
    }
}

$dependencyCheck = @'
import importlib
required = ("fastapi", "uvicorn", "whisper")
missing = [name for name in required if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit(",".join(missing))
'@

& $pythonPath -c $dependencyCheck
if ($LASTEXITCODE -ne 0) {
    Install-BackendDependencies -PythonPath $pythonPath
    & $pythonPath -c $dependencyCheck
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel preparar as dependencias do backend automaticamente."
    }
}

& $pythonPath -m uvicorn app.main:app --host 127.0.0.1 --port 8000
