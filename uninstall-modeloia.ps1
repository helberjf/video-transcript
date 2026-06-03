$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$productName = "ModeloIA"
$uninstallerFile = "Uninstall ModeloIA.exe"

$candidatePaths = @(
    (Join-Path $env:LOCALAPPDATA "Programs\$productName\$uninstallerFile"),
    (Join-Path $env:ProgramFiles "$productName\$uninstallerFile")
)

if (${env:ProgramFiles(x86)}) {
    $candidatePaths += Join-Path ${env:ProgramFiles(x86)} "$productName\$uninstallerFile"
}

$uninstaller = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $uninstaller) {
    $registryRoots = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )

    foreach ($root in $registryRoots) {
        if (-not (Test-Path $root)) {
            continue
        }

        $entry = Get-ChildItem $root -ErrorAction SilentlyContinue |
            ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } |
            Where-Object { $_.DisplayName -eq $productName -and $_.UninstallString } |
            Select-Object -First 1

        if ($entry) {
            $uninstallString = [string]$entry.UninstallString
            if ($uninstallString -match '^"([^"]+)"') {
                $uninstaller = $Matches[1]
            }
            else {
                $uninstaller = ($uninstallString -split "\s+", 2)[0]
            }
            break
        }
    }
}

if (-not $uninstaller -or -not (Test-Path $uninstaller)) {
    throw "Desinstalador do ModeloIA nao encontrado. Se o app estiver instalado, remova por Configuracoes > Aplicativos > ModeloIA."
}

Write-Host "Abrindo desinstalador: $uninstaller" -ForegroundColor Cyan
Start-Process -FilePath $uninstaller -Wait
