# Instagram Downloader + Transcrição (Whisper & Gemini)

API Flask para download de mídia do Instagram, conversão para MP3 e transcrição de áudio usando **Whisper** (local) ou **Google Gemini AI** (cloud).

## ✨ Funcionalidades

- 📥 **Download de vídeos e fotos** do Instagram
- 🎵 **Conversão de vídeo para MP3** (qualidade personalizável)
- 📤 **Upload direto de arquivos** de áudio/vídeo
- 🗣️ **Transcrição de áudio** com:
  - **Whisper** (OpenAI - local, gratuito)
  - **Google Gemini AI** (cloud, mais rápido e preciso)
- 🔄 **Seleção automática** do melhor método de transcrição
- 📝 **Prompts customizáveis** para o Gemini
- ⚡ **Processamento assíncrono** com cleanup automático

---

## 📋 Requisitos

### Sistema

- **Python 3.8+**
- **FFmpeg** (para conversão de áudio/vídeo)

### Instalação do FFmpeg

**Windows:**
```bash
# Via Chocolatey
choco install ffmpeg

# Ou baixe de: https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

---

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/instagram-downloader.git
cd instagram-downloader
```

### 2. Crie um ambiente virtual

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### 3. Instale as dependências

```bash
pip install -r requirements.txt
```

### 4. Configure a API Key do Gemini (Opcional, mas recomendado)

#### Como obter a chave:

1. Acesse [Google AI Studio](https://aistudio.google.com/)
2. Faça login com sua conta Google
3. Clique em **"Get API key"**
4. Clique em **"Create API key in new project"**
5. Copie a chave gerada

#### Configure a variável de ambiente:

**Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY="sua_chave_aqui"
```

**Windows (CMD):**
```cmd
set GEMINI_API_KEY=sua_chave_aqui
```

**macOS/Linux:**
```bash
export GEMINI_API_KEY="sua_chave_aqui"

# Para tornar permanente, adicione ao ~/.bashrc ou ~/.zshrc:
echo 'export GEMINI_API_KEY="sua_chave_aqui"' >> ~/.bashrc
source ~/.bashrc
```

---

## 🎯 Uso

### Iniciar o servidor

```bash
python app.py
```

O servidor estará disponível em `http://localhost:5000`

---

## 📡 Endpoints da API

### 1. Download de mídia do Instagram

```bash
POST /api/download
Content-Type: application/json

{
  "url": "https://www.instagram.com/p/ABC123/"
}
```

**Resposta:**
```json
{
  "success": true,
  "media": [
    {
      "type": "video",
      "url": "https://...",
      "quality": "1080p"
    }
  ],
  "metadata": {
    "title": "...",
    "author": "..."
  }
}
```

---

### 2. Upload de arquivo para transcrição

```bash
POST /api/upload-file
Content-Type: multipart/form-data

file: <arquivo de áudio ou vídeo>
```

**Formatos suportados:**
- **Áudio:** MP3, WAV, AAC, OGG, M4A, FLAC, WMA
- **Vídeo:** MP4, AVI, MOV, MKV, FLV, WEBM, WMV

**Resposta:**
```json
{
  "success": true,
  "file_id": "uuid-do-arquivo",
  "transcribe_url": "/api/transcribe/uuid-do-arquivo",
  "download_url": "/api/download-mp3/uuid-do-arquivo",
  "filename": "transcription_123456789.mp3",
  "size": "5.2 MB",
  "duration": "3:25"
}
```

---

### 3. Transcrição de áudio

```bash
POST /api/transcribe/<file_id>
Content-Type: application/json

{
  "method": "auto",    // "auto", "whisper", ou "gemini"
  "language": "pt",    // Código do idioma (pt, en, es, etc.)
  "prompt": "Transcreva este áudio com pontuação adequada"  // Opcional, apenas para Gemini
}
```

**Parâmetros:**

- `method`:
  - `auto` (padrão): Tenta Gemini primeiro, depois Whisper
  - `whisper`: Usa apenas Whisper (local, sem API key)
  - `gemini`: Usa apenas Gemini (requer API key)

- `language`: Código ISO do idioma (pt, en, es, fr, etc.)

- `prompt`: (Opcional) Instrução customizada para o Gemini
  - Exemplo: "Transcreva este áudio e identifique os falantes"
  - Exemplo: "Faça um resumo detalhado deste áudio"

**Resposta (sucesso):**
```json
{
  "success": true,
  "text": "Transcrição completa do áudio...",
  "method": "gemini",
  "model": "gemini-2.0-flash-exp",
  "language": "pt"
}
```

**Resposta (erro):**
```json
{
  "success": false,
  "error": "GEMINI_API_KEY não configurada",
  "method": "gemini"
}
```

---

### 4. Transcrição direta (sem salvar)

Para transcrição rápida sem salvar o arquivo permanentemente:

```bash
POST /api/transcribe-direct
Content-Type: multipart/form-data

file: <arquivo>
method: auto
language: pt
prompt: Transcreva este áudio  (opcional)
```

---

### 5. Conversão de vídeo para MP3

```bash
POST /api/convert-to-mp3
Content-Type: application/json

{
  "video_url": "https://...",
  "quality": "192",  // 128, 192, ou 320 kbps
  "title": "Nome do Áudio"
}
```

---

### 6. Status do sistema

```bash
GET /api/health
```

**Resposta:**
```json
{
  "status": "ok",
  "version": "3.0.0",
  "ffmpeg": "disponível",
  "whisper": "disponível",
  "yt-dlp": "disponível",
  "gemini": {
    "status": "biblioteca instalada",
    "api_key": "configurada"
  },
  "temp_files": 5,
  "stored_mp3s": 2
}
```

---

## 🧪 Exemplos de Uso

### Exemplo 1: Upload e transcrição com Gemini

```python
import requests

# Upload do arquivo
files = {'file': open('meu_audio.mp3', 'rb')}
response = requests.post('http://localhost:5000/api/upload-file', files=files)
file_id = response.json()['file_id']

# Transcrever com Gemini
data = {
    'method': 'gemini',
    'prompt': 'Transcreva este áudio e identifique os tópicos principais'
}
response = requests.post(
    f'http://localhost:5000/api/transcribe/{file_id}',
    json=data
)
print(response.json()['text'])
```

### Exemplo 2: Download do Instagram e transcrição

```python
import requests

# 1. Download do Instagram
data = {'url': 'https://www.instagram.com/reel/ABC123/'}
response = requests.post('http://localhost:5000/api/download', json=data)
video_url = response.json()['media'][0]['url']

# 2. Converter para MP3
data = {'video_url': video_url, 'quality': '192'}
response = requests.post('http://localhost:5000/api/convert-to-mp3', json=data)
file_id = response.json()['mp3_id']

# 3. Transcrever
data = {'method': 'auto'}
response = requests.post(f'http://localhost:5000/api/transcribe/{file_id}', json=data)
print(response.json()['text'])
```

### Exemplo 3: Transcrição direta com cURL

```bash
curl -X POST http://localhost:5000/api/transcribe-direct \
  -F "file=@meu_audio.mp3" \
  -F "method=gemini" \
  -F "prompt=Faça um resumo detalhado deste áudio"
```

---

## 🔧 Configurações Avançadas

### Variáveis de Ambiente

```bash
# API Key do Gemini (obrigatório para usar Gemini)
export GEMINI_API_KEY="sua_chave_aqui"

# Porta do servidor (padrão: 5000)
export PORT=5000

# Modo debug (padrão: False)
export DEBUG=True

# Cookies para Instagram (opcional)
export INSTAGRAM_COOKIES_FILE="/caminho/para/cookies.txt"
export INSTAGRAM_COOKIES_FROM_BROWSER="firefox:default"
```

### Limites e Quotas

- **Tamanho máximo de upload:** 500MB
- **Rate limiting:** 
  - Download: 10 req/min
  - Upload: 5 req/min
  - Transcrição: 5 req/min
- **Limpeza automática:** Arquivos são deletados após 1 hora
- **Duração máxima de áudio (Gemini):** 9.5 horas

### Custos do Gemini

O Gemini 2.0 Flash tem limite gratuito generoso:
- **Gratuito:** 10 requisições/minuto, 1500 req/dia
- **Custo de tokens:** ~32 tokens/segundo de áudio
- Para mais informações: [Google AI Pricing](https://ai.google.dev/pricing)

---

## 🆚 Whisper vs Gemini

| Característica | Whisper | Gemini |
|----------------|---------|--------|
| **Velocidade** | Lento (local) | Rápido (cloud) |
| **Qualidade** | Boa | Excelente |
| **Custo** | Gratuito | Gratuito (limite) |
| **Internet** | Não precisa | Precisa |
| **Setup** | Complexo | Simples (apenas API key) |
| **Idiomas** | 90+ | 100+ |
| **Pontuação** | Básica | Avançada |
| **Prompts** | Não | Sim |

**Recomendação:** Use `method: "auto"` para ter o melhor dos dois mundos!

---

## 🛠️ Troubleshooting

### Erro: "FFmpeg não encontrado"

Instale o FFmpeg conforme as instruções na seção **Requisitos**.

### Erro: "GEMINI_API_KEY não configurada"

Configure a variável de ambiente conforme a seção **Instalação**.

### Erro: "Whisper não instalado"

```bash
pip install openai-whisper
```

### Erro: "Rate limit exceeded"

Aguarde alguns minutos. O sistema tem rate limiting para proteção.

### Erro no download do Instagram

- Verifique se a URL é válida
- Alguns posts privados não podem ser baixados
- Configure cookies se necessário (veja seção de Configurações)

---

## ⚠️ Avisos Legais

- **Uso Educacional:** Este projeto é apenas para fins educacionais
- **Termos de Serviço:** Baixar conteúdo pode violar os Termos de Serviço do Instagram
- **Privacidade:** Não use para baixar conteúdo privado sem permissão
- **Copyright:** Respeite os direitos autorais dos criadores

---

## 📝 Licença

MIT License - veja o arquivo LICENSE para detalhes.

---

## 🤝 Contribuições

Contribuições são bem-vindas! Abra uma issue ou pull request.

---

## 📧 Suporte

Para dúvidas e suporte:
- Abra uma issue no GitHub
- Email: seu-email@exemplo.com

---

## 🎯 Roadmap

- [ ] Suporte a transcrição com timestamps
- [ ] Interface web melhorada
- [ ] Suporte a mais idiomas
- [ ] Tradução automática
- [ ] Integração com mais plataformas
- [ ] Docker support
- [ ] API de batch processing

---

Desenvolvido com ❤️ para fins educacionais
