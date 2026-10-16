$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Gera o instalador e publica uma Release no GitHub. Os apps ja instalados
# encontram a nova versao sozinhos na proxima vez que abrirem.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $env:GH_TOKEN) {
    throw "Defina GH_TOKEN com um token do GitHub (permissao 'contents: write' no repositorio video-transcript) antes de publicar."
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
