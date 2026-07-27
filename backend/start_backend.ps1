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

function Get-PortOwnerProcess {
    param([Parameter(Mandatory = $true)][int]$Port)

    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) {
        return $null
    }

    return Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
}

function Stop-ExistingBackendIfNeeded {
    param([Parameter(Mandatory = $true)][int]$Port)

    $existing = Get-PortOwnerProcess -Port $Port
    if (-not $existing) {
        return
    }

    $commandLine = ""
    if ($null -ne $existing.CommandLine) {
        $commandLine = [string]$existing.CommandLine
    }
    $parentCommandLine = ""
    if ($existing.ParentProcessId) {
        $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($existing.ParentProcessId)" -ErrorAction SilentlyContinue
        if ($parentProcess -and $null -ne $parentProcess.CommandLine) {
            $parentCommandLine = [string]$parentProcess.CommandLine
        }
    }

    $projectRoot = Split-Path -Parent $PSScriptRoot
    $hasBackendCommand = (
        $commandLine -like "*uvicorn app.main:app*" -or
        $parentCommandLine -like "*uvicorn app.main:app*" -or
        $commandLine -like "*run_backend.py*" -or
        $parentCommandLine -like "*run_backend.py*"
    )
    $matchesProjectPath = (
        $commandLine -like "*$projectRoot*" -or
        $parentCommandLine -like "*$projectRoot*" -or
        $commandLine -like "*$PSScriptRoot*" -or
        $parentCommandLine -like "*$PSScriptRoot*"
    )
    $isProjectBackend = $hasBackendCommand -and $matchesProjectPath
    if (-not $isProjectBackend) {
        throw "A porta $Port ja esta em uso por outro processo (PID $($existing.ProcessId)). Feche esse processo ou altere a porta do backend."
    }

    Write-Host "Encerrando backend anterior na porta $Port (PID $($existing.ProcessId))..." -ForegroundColor Yellow
    taskkill.exe /PID $existing.ProcessId /F /T | Out-Null
    Start-Sleep -Seconds 1
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
import importlib.util
required = ("fastapi", "uvicorn", "whisper", "yt_dlp", "docx", "reportlab", "pypdf")
missing = [name for name in required if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit(",".join(missing))
'@

$dependencyCheck | & $pythonPath -
if ($LASTEXITCODE -ne 0) {
    Install-BackendDependencies -PythonPath $pythonPath
    $dependencyCheck | & $pythonPath -
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel preparar as dependencias do backend automaticamente."
    }
}

$backendPort = [int](& $pythonPath -c "from app.core.config import get_settings; print(get_settings().app_port)")
Stop-ExistingBackendIfNeeded -Port $backendPort
& $pythonPath "run_backend.py"
