# 🚀 Guia Rápido de Início

## Instalação em 5 minutos

### 1. Instale o Python 3.8+ e FFmpeg

**Windows:**
```bash
# Via Chocolatey
choco install python ffmpeg
```

**macOS:**
```bash
brew install python ffmpeg
```

**Linux:**
```bash
sudo apt install python3 python3-pip ffmpeg
```

### 2. Clone e configure

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/instagram-downloader.git
cd instagram-downloader

# Crie ambiente virtual
python -m venv venv

# Ative o ambiente
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Instale dependências
pip install -r requirements.txt
```

### 3. Configure a API Key do Gemini

**Obtenha a chave:**
1. Acesse: https://aistudio.google.com/
2. Login → "Get API key" → "Create API key"
3. Copie a chave

**Configure:**

**Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY="sua_chave_aqui"
```

**macOS/Linux:**
```bash
export GEMINI_API_KEY="sua_chave_aqui"
```

### 4. Inicie o servidor

```bash
python app.py
```

Servidor disponível em: `http://localhost:5000`

---

## ⚡ Uso Rápido

### Opção 1: Via Python

```python
# exemplos.py
python exemplos.py
```

Escolha uma das opções no menu interativo!

### Opção 2: Via cURL

**Upload e transcrição:**
```bash
curl -X POST http://localhost:5000/api/transcribe-direct \
  -F "file=@meu_audio.mp3" \
  -F "method=gemini"
```

### Opção 3: Via código Python

```python
import requests

# Upload
files = {'file': open('audio.mp3', 'rb')}
r = requests.post('http://localhost:5000/api/upload-file', files=files)
file_id = r.json()['file_id']

# Transcrever
data = {'method': 'gemini'}
r = requests.post(f'http://localhost:5000/api/transcribe/{file_id}', json=data)
print(r.json()['text'])
```

---

## 🎯 Funcionalidades Principais

### 1. Upload de arquivo → Transcrição

```bash
POST /api/upload-file
```

Suporta: MP3, WAV, MP4, AVI, MOV, MKV, etc.

### 2. Instagram → Transcrição

```bash
POST /api/download        # Download do Instagram
POST /api/convert-to-mp3  # Converter para MP3
POST /api/transcribe/{id} # Transcrever
```

### 3. Transcrição Direta (mais rápido)

```bash
POST /api/transcribe-direct
```

---

## 🔧 Métodos de Transcrição

### Auto (Recomendado)
```json
{"method": "auto"}
```
Tenta Gemini primeiro, depois Whisper como fallback.

### Gemini (Mais rápido e preciso)
```json
{"method": "gemini"}
```
Requer: `GEMINI_API_KEY`

### Whisper (Local, sem internet)
```json
{"method": "whisper"}
```
Mais lento, mas não precisa de API key.

---

## 💡 Dicas

1. **Use `method: "auto"`** para ter o melhor dos dois mundos

2. **Prompts customizados** (apenas Gemini):
   ```json
   {
     "method": "gemini",
     "prompt": "Faça um resumo executivo deste áudio"
   }
   ```

3. **Verifique o status** antes de começar:
   ```bash
   curl http://localhost:5000/api/health
   ```

4. **Arquivos grandes** (>100MB): Use upload direto, não Instagram

5. **Erros?** Veja o [README.md](README.md) completo

---

## 🆘 Problemas Comuns

### "FFmpeg não encontrado"
```bash
# Instale o FFmpeg
# Windows: choco install ffmpeg
# macOS: brew install ffmpeg
# Linux: sudo apt install ffmpeg
```

### "GEMINI_API_KEY não configurada"
```bash
export GEMINI_API_KEY="sua_chave_aqui"
```

### "Whisper não instalado"
```bash
pip install openai-whisper
```

### "API não está rodando"
```bash
python app.py
```

---

## 📚 Próximos Passos

1. ✅ Instalou e rodou? Parabéns!
2. 📖 Leia o [README.md](README.md) completo
3. 🧪 Execute os exemplos: `python exemplos.py`
4. 🎨 Integre na sua aplicação!

---

## 🔗 Links Úteis

- **Google AI Studio:** https://aistudio.google.com/
- **Documentação Gemini:** https://ai.google.dev/docs
- **FFmpeg Download:** https://ffmpeg.org/download.html
- **Whisper GitHub:** https://github.com/openai/whisper

---

**Dúvidas?** Abra uma issue no GitHub ou consulte a documentação completa!
