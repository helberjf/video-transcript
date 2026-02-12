#!/bin/bash

# Instagram Downloader + MP3 + Transcrição
# Script de inicialização

echo "🚀 Instagram Downloader + MP3 + Transcrição"
echo "=========================================="
echo ""

# Verificar Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não encontrado!"
    echo "Por favor, instale o Python 3.8 ou superior."
    exit 1
fi

echo "✅ Python encontrado: $(python3 --version)"

# Verificar FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg não encontrado!"
    echo "A conversão para MP3 não funcionará."
    echo ""
    echo "Para instalar:"
    echo "  - Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  - macOS: brew install ffmpeg"
    echo "  - Windows: choco install ffmpeg"
    echo ""
else
    echo "✅ FFmpeg encontrado: $(ffmpeg -version | head -n 1)"
fi

# Verificar ambiente virtual
if [ -d "venv" ]; then
    echo "✅ Ambiente virtual encontrado"
    source venv/bin/activate
else
    echo "📦 Criando ambiente virtual..."
    python3 -m venv venv
    source venv/bin/activate
    echo "📥 Instalando dependências..."
    pip install -r requirements.txt
fi

# Criar pasta temp se não existir
if [ ! -d "temp" ]; then
    mkdir temp
    echo "📁 Pasta temp criada"
fi

# Verificar Whisper
echo ""
echo "🔍 Verificando Whisper..."
if python3 -c "import whisper" 2>/dev/null; then
    echo "✅ Whisper instalado - Transcrição habilitada"
else
    echo "⚠️  Whisper não instalado"
    echo "   Para habilitar transcrição, execute: pip install openai-whisper"
fi

echo ""
echo "🌐 Iniciando servidor..."
echo "   Acesse: http://localhost:5000"
echo ""
echo "Pressione Ctrl+C para parar"
echo "=========================================="
echo ""

python3 app.py
