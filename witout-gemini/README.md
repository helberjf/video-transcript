<<<<<<< HEAD
# Instagram Downloader + MP3 + Transcrição 🎵📝

⚠️ **IMPORTANTE**: Este projeto é **apenas para fins educacionais**. Baixar conteúdo do Instagram pode violar seus Termos de Serviço.

## 🎯 Funcionalidades

✅ **Download de Mídia do Instagram**
- Posts, Reels, IGTV, Vídeos
- Fotos e vídeos em alta qualidade

✅ **Conversão de Vídeo para MP3**
- Extrair áudio de vídeos do Instagram
- Escolher qualidade (128kbps, 192kbps, 320kbps)
- Metadados automáticos (título, artista)
- Download direto do arquivo MP3

✅ **Transcrição de Áudio**
- Transcrever áudio MP3 para texto
- Suporte a múltiplos idiomas (PT, EN, ES, FR, DE, IT)
- Usa OpenAI Whisper para transcrição precisa

## 📋 Pré-requisitos

### 1. FFmpeg (OBRIGATÓRIO para conversão MP3)

**Windows:**
```bash
# Via Chocolatey
choco install ffmpeg

# OU baixe de: https://ffmpeg.org/download.html
# Adicione ao PATH do sistema
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

**Verificar instalação:**
```bash
ffmpeg -version
```

### 2. Python 3.8+

```bash
python --version
pip --version
```

## 🚀 Instalação

### 1. Clone ou baixe o projeto

```bash
cd instagram-downloader
```

### 2. Crie um ambiente virtual (recomendado)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Instale as dependências

```bash
pip install -r requirements.txt
```

### 4. Instale o Whisper para transcrição (opcional)

```bash
pip install openai-whisper
```

**Nota:** O Whisper requer ffmpeg instalado.

### 5. Crie a pasta temporária

```bash
mkdir temp
```

## 🎵 Como Usar

### 1. Inicie o servidor

```bash
python app.py
```

O servidor estará rodando em: http://localhost:5000

### 2. Acesse a interface web

Abra http://localhost:5000 no seu navegador.

### 3. Baixe e converta

1. **Cole a URL** do Instagram no campo
2. Clique em **"Baixar"**
3. Após carregar, clique em **"Mostrar opções de MP3"**
4. Escolha a qualidade e clique em **"Converter para MP3"**
5. Aguarde a conversão
6. Baixe o MP3 ou clique em **"Transcrever Áudio"**

## 📁 Estrutura do Projeto

```
instagram-downloader/
├── app.py                 # Backend Flask completo
├── index.html            # Frontend com interface completa
├── requirements.txt      # Dependências Python
├── temp/                 # Arquivos temporários (criado automaticamente)
└── README.md            # Este arquivo
```

## 🔌 API Endpoints

### POST /api/download
Baixar mídia do Instagram

**Request:**
```json
{
  "url": "https://www.instagram.com/p/ABC123/"
}
```

**Response:**
```json
{
  "success": true,
  "media": [
    {
      "type": "video",
      "url": "https://...",
      "quality": "HD"
    }
  ],
  "metadata": {
    "author": "username",
    "title": "Post title"
  }
}
```

### POST /api/convert-to-mp3
Converter vídeo para MP3

**Request:**
```json
{
  "video_url": "https://...",
  "quality": "192",
  "title": "Minha Música"
}
```

**Response:**
```json
{
  "success": true,
  "mp3_id": "abc-123",
  "download_url": "/api/download-mp3/abc-123",
  "transcribe_url": "/api/transcribe/abc-123",
  "filename": "instagram_audio_123.mp3",
  "size": "3.2 MB",
  "duration": "2:30",
  "quality": "192 kbps"
}
```

### GET /api/download-mp3/:id
Baixar arquivo MP3 convertido

### POST /api/transcribe/:id
Transcrever áudio MP3 para texto

**Request:**
```json
{
  "language": "pt"
}
```

**Response:**
```json
{
  "success": true,
  "text": "Texto transcrito do áudio...",
  "language": "pt"
}
```

### GET /api/proxy?url=...&filename=...
Proxy para download de arquivos (contorna CORS)

### GET /api/health
Verificar status do servidor

## ⚙️ Configuração Avançada

### Variáveis de Ambiente

Crie um arquivo `.env`:

```env
# Porta do servidor
PORT=5000

# Modo de desenvolvimento
DEBUG=true

# Limite de tamanho de arquivo (MB)
MAX_FILE_SIZE=100

# (Opcional) Cookies do Instagram para evitar bloqueios/login
# Use UM dos métodos abaixo
# 1) Cookies exportados para arquivo
INSTAGRAM_COOKIES_FILE=C:\caminho\para\cookies.txt

# 2) Cookies do navegador (edge|chrome|firefox|brave|opera)
# Pode informar perfil: chrome:Profile 1
INSTAGRAM_COOKIES_FROM_BROWSER=chrome
```

### Qualidades de Áudio Disponíveis

- **128 kbps** - Boa qualidade, arquivo pequeno (~3MB para 3 min)
- **192 kbps** - Alta qualidade, tamanho médio (~4.5MB para 3 min)
- **320 kbps** - Qualidade máxima, arquivo maior (~7.5MB para 3 min)

## 🔧 Solução de Problemas

### Erro: "FFmpeg não encontrado"

**Problema:** FFmpeg não está instalado ou não está no PATH.

**Solução:**
```bash
# Verificar instalação
ffmpeg -version

# Instalar:
# Windows: choco install ffmpeg
# macOS: brew install ffmpeg
# Linux: sudo apt install ffmpeg
```

### Erro: "Whisper não instalado"

**Problema:** Biblioteca de transcrição não instalada.

**Solução:**
```bash
pip install openai-whisper
```

### Erro: "Não foi possível obter a mídia"

**Problema:** O Instagram está bloqueando o acesso.

**Possíveis causas:**
- O post é privado
- O Instagram detectou scraping
- A URL está incorreta

**Soluções:**
1. Verifique se o post é público
2. Tente novamente mais tarde
3. Verifique se a URL está correta

### Erro: "rate-limit reached or login required"

**Problema:** O Instagram exige login/cookies para acessar o conteúdo.

**Soluções (recomendado):**
1. Configure cookies via arquivo:
  - Exporte cookies do Instagram em um arquivo `cookies.txt`.
  - Defina `INSTAGRAM_COOKIES_FILE` no ambiente.

2. Use cookies do navegador:
  - Defina `INSTAGRAM_COOKIES_FROM_BROWSER` com o navegador instalado.
  - Exemplo (Windows PowerShell):
    - `setx INSTAGRAM_COOKIES_FROM_BROWSER "chrome"`

Depois reinicie o servidor.

### Erro: "Permission denied" ao usar cookies do navegador

**Problema:** O arquivo de cookies do navegador está bloqueado (Chrome/Edge aberto).

**Soluções:**
1. Feche completamente o navegador (incluindo processos em segundo plano) e tente novamente.
2. Alternativamente, exporte cookies para arquivo e use `INSTAGRAM_COOKIES_FILE`.

### Erro: "Arquivo muito grande"

**Problema:** O vídeo excede o limite de 100MB.

**Solução:** Use um vídeo menor ou aumente o limite em `app.py`:
```python
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB
```

### Erro: "Arquivo não encontrado ou expirado"

**Problema:** Arquivo MP3 foi limpo automaticamente (após 1 hora).

**Solução:** Converta novamente ou ajuste o tempo de limpeza em `app.py`.

## 📊 Performance

### Tempos Médios

- Download do vídeo: 2-10 segundos
- Conversão para MP3: 5-30 segundos
- Transcrição: 30 segundos - 5 minutos (depende do tamanho)

### Requisitos de Sistema

- **RAM:** Mínimo 2GB (4GB+ recomendado para transcrição)
- **Disco:** Espaço temporário para arquivos (até 100MB por vídeo)
- **CPU:** Quanto mais rápida, mais rápida a conversão e transcrição

## 🔐 Segurança

### Implementado

- ✅ Validação de URLs
- ✅ Limite de tamanho de arquivo (100MB)
- ✅ Rate limiting (10 downloads/min, 5 conversões/min)
- ✅ Limpeza automática de arquivos (1 hora)
- ✅ Timeout de conversão (5 minutos)
- ✅ Sanitização de entradas

### Recomendado para Produção

- 🔒 Autenticação de usuários
- 🔒 HTTPS obrigatório
- 🔒 Fila de processamento assíncrona (Celery)
- 🔒 Armazenamento em nuvem (S3)
- 🔒 Logging e monitoramento

## 🚀 Deploy

### Docker

```dockerfile
FROM python:3.11-slim

# Instalar FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["python", "app.py"]
```

Build e run:
```bash
docker build -t instagram-downloader .
docker run -p 5000:5000 -v $(pwd)/temp:/app/temp instagram-downloader
```

### VPS (Ubuntu)

```bash
# Instalar dependências
sudo apt update
sudo apt install -y python3-pip ffmpeg

# Clonar projeto
cd /opt
git clone <repo>
cd instagram-downloader

# Instalar dependências
pip3 install -r requirements.txt

# Criar serviço systemd
sudo nano /etc/systemd/system/instagram-downloader.service
```

Conteúdo do serviço:
```ini
[Unit]
Description=Instagram Downloader
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/instagram-downloader
ExecStart=/usr/bin/python3 app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Ativar serviço:
```bash
sudo systemctl enable instagram-downloader
sudo systemctl start instagram-downloader
```

## ⚖️ Questões Legais

### ⚠️ ATENÇÃO

1. **Instagram ToS**: Web scraping viola os Termos de Serviço do Instagram
2. **Copyright**: Não baixe ou distribua conteúdo protegido por direitos autorais
3. **Privacidade**: Não baixe conteúdo privado sem permissão
4. **Uso Pessoal**: Use apenas para fins educacionais e pessoais

### Alternativas Legais

- Instagram Save Feature (salvar posts no app)
- Instagram Official APIs
- Pedir permissão aos criadores

## 🤝 Contribuindo

Contribuições são bem-vindas para:
- Correção de bugs
- Melhorias de documentação
- Otimizações de performance
- Testes

**NÃO contribua com:**
- Recursos que violem ToS do Instagram
- Bypass de segurança
- Scraping em massa

## 📚 Recursos Úteis

### Documentação
- [FFmpeg Docs](https://ffmpeg.org/documentation.html)
- [Whisper GitHub](https://github.com/openai/whisper)
- [Flask Docs](https://flask.palletsprojects.com/)

### APIs do Instagram
- [Instagram Basic Display API](https://developers.facebook.com/docs/instagram-basic-display-api)
- [Instagram Graph API](https://developers.facebook.com/docs/instagram-api)

## 📝 Changelog

### v2.1.0 (Atual)
- ✅ Adicionada transcrição de áudio com Whisper
- ✅ Suporte a múltiplos idiomas
- ✅ Interface melhorada com status do servidor
- ✅ Backend unificado e otimizado

### v2.0.0
- ✅ Adicionada conversão de vídeo para MP3
- ✅ Seleção de qualidade de áudio
- ✅ Backend Node.js e Python

### v1.0.0
- ✅ Versão inicial com download de mídia

## 📄 Licença

MIT License - Veja LICENSE para detalhes.

**Este software é fornecido "como está" apenas para fins educacionais.**

---

**Lembre-se: Use este conhecimento de forma responsável e ética! 🌟**

setx INSTAGRAM_COOKIES_FILE "C:\Users\default.LAPTOP-K8F2QHAF\projects\2.0-video-mp3-transcript\cookies.txt"


python -m venv venv
venv\Scripts\activate
python app.py
=======
# video-transcript
>>>>>>> 6e4e74209768c8913f249b46b30c571409ed2898
