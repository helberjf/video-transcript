$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env.local") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env.local"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$postgresBin = "C:\Program Files\PostgreSQL\18\bin"
$postgresData = Join-Path $projectRoot ".codex-run\postgres-modeloia-data"
$postgresLog = Join-Path $projectRoot ".codex-run\postgres-modeloia.log"
$pgCtl = Join-Path $postgresBin "pg_ctl.exe"
$pgReady = Join-Path $postgresBin "pg_isready.exe"

if ((Test-Path $postgresData) -and (Test-Path $pgCtl) -and (Test-Path $pgReady)) {
    & $pgReady -h 127.0.0.1 -p 55432 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & $pgCtl -D $postgresData -l $postgresLog -o "-h 127.0.0.1 -p 55432" start
    }
}

npm run dev
