@echo off
chcp 65001 >nul
cls

echo 🚀 Instagram Downloader + MP3 + Transcrição
echo ==========================================
echo.

REM Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python não encontrado!
    echo Por favor, instale o Python 3.8 ou superior.
    pause
    exit /b 1
)

echo ✅ Python encontrado

REM Verificar FFmpeg
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo ⚠️  FFmpeg não encontrado!
    echo A conversão para MP3 não funcionará.
    echo.
    echo Para instalar:
    echo   - Via Chocolatey: choco install ffmpeg
    echo   - Ou baixe de: https://ffmpeg.org/download.html
    echo.
) else (
    echo ✅ FFmpeg encontrado
)

REM Verificar ambiente virtual
if exist "venv" (
    echo ✅ Ambiente virtual encontrado
    call venv\Scripts\activate.bat
) else (
    echo 📦 Criando ambiente virtual...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo 📥 Instalando dependências...
    pip install -r requirements.txt
)

REM Criar pasta temp se não existir
if not exist "temp" (
    mkdir temp
    echo 📁 Pasta temp criada
)

REM Configurar cookies automaticamente se existir cookies.txt
if exist "cookies.txt" (
    set "INSTAGRAM_COOKIES_FILE=%CD%\cookies.txt"
    echo 🍪 Cookies configurados: %INSTAGRAM_COOKIES_FILE%
) else (
    echo ⚠️  cookies.txt não encontrado. Downloads podem exigir login.
)

REM Verificar Whisper
echo.
echo 🔍 Verificando Whisper...
python -c "import whisper" 2>nul
if errorlevel 1 (
    echo ⚠️  Whisper não instalado
    echo    Para habilitar transcrição, execute: pip install openai-whisper
) else (
    echo ✅ Whisper instalado - Transcrição habilitada
)

echo.
echo 🌐 Iniciando servidor...
echo    Acesse: http://localhost:5000
echo.
echo Pressione Ctrl+C para parar
echo ==========================================
echo.

python app.py

pause
