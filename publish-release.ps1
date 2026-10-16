$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Gera o instalador e publica uma Release no GitHub. Os apps ja instalados
# encontram a nova versao sozinhos na proxima vez que abrirem.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Sem GH_TOKEN definido, usa o login do GitHub CLI (gh auth login) desta maquina.
if (-not $env:GH_TOKEN -and (Get-Command gh -ErrorAction SilentlyContinue)) {
    $ghToken = (& gh auth token 2>$null)
    if ($LASTEXITCODE -eq 0 -and $ghToken) {
        $env:GH_TOKEN = $ghToken.Trim()
    }
}

if (-not $env:GH_TOKEN) {
    throw "Faca login no GitHub com 'gh auth login' (ou defina GH_TOKEN com permissao 'contents: write' no repositorio video-transcript) antes de publicar."
}

$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
Write-Host "Publicando ModeloIA $version no GitHub Releases..." -ForegroundColor Cyan
Write-Host "Lembrete: aumente o campo 'version' do package.json a cada nova versao." -ForegroundColor Yellow

Push-Location $root
try {
    npm run desktop:release
}
finally {
    Pop-Location
}

Write-Host "Release $version publicada. Confira em https://github.com/helberjf/video-transcript/releases" -ForegroundColor Green
