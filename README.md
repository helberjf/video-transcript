# Media Transcript Studio

Aplicação local, dividida em frontend e backend, para upload de áudio/vídeo, conversão para MP3, transcrição com fallback OpenAI → Gemini → Whisper e geração de relatórios com modelos reutilizáveis.

Os arquivos legados na raiz, como `app.py`, permanecem como protótipo anterior. A implementação ativa desta entrega está em `frontend/` e `backend/`.

## Visão geral

- Frontend: Next.js App Router, TypeScript estrito, Tailwind CSS.
- Backend: FastAPI, Pydantic, SQLAlchemy, SQLite, Uvicorn, ffmpeg.
- Transcrição: OpenAI primeiro, Gemini em fallback e Whisper local por último.
- Relatórios: geração a partir da transcrição, com CRUD de templates e exportação em `.md` ou `.txt`.
- Persistência: SQLite para uploads, transcrições, relatórios, templates e configurações.
- Banco local pronto para uso pessoal: o app já sobe com SQLite em `data/app.db`, sem instalar servidor de banco.

## Estrutura principal

```text
frontend/
  app/
  components/
  hooks/
  lib/
  services/
  types/

backend/
  app/
    api/
    core/
    models/
    repositories/
    schemas/
    services/
    utils/
    workers/
  tests/
```

## Funcionalidades entregues

- Upload de vídeo e áudio com validação de extensão, MIME type e limite de tamanho.
- Conversão de vídeo para MP3 em 320 kbps, 44.1 kHz, estéreo.
- Normalização de áudio antes da transcrição.
- Pipeline de transcrição com fallback e retorno da engine utilizada.
- Histórico com status por etapa: `uploaded`, `converting`, `transcribing`, `generating_report`, `completed`, `error`.
- Dashboard com cards e últimos processamentos.
- CRUD de modelos de relatório com duplicação e favoritos.
- Configurações locais para chaves, Whisper, idioma, template padrão e pasta de exportação.
- Testes mínimos cobrindo utilidades de mídia, fallback de transcrição e templates/relatórios.
- Scripts de inicialização para Windows e shell script compatível com Linux/macOS.
- Docker Compose para subir frontend e backend juntos.

## Pré-requisitos

### Windows

1. Instale Python 3.10 ou superior.
2. Instale Node.js 20 ou superior.
3. Instale ffmpeg.

Opções para ffmpeg no Windows:

```powershell
choco install ffmpeg
```

Ou faça o download manual em https://ffmpeg.org/download.html e adicione a pasta `bin` ao `PATH`.

### macOS

```bash
brew install python node ffmpeg
```

### Linux

```bash
sudo apt update
sudo apt install python3 python3-venv nodejs npm ffmpeg
```

## Configuração sem Docker

### 1. Clone e entre no projeto

```bash
git clone <repo>
cd 2.0-video-mp3-transcript
```

### 2. Crie o ambiente virtual Python

```bash
python -m venv venv
```

Ativação no Windows:

```powershell
venv\Scripts\Activate.ps1
```

Ativação no macOS/Linux:

```bash
source venv/bin/activate
```

### 3. Instale o backend

```bash
cd backend
pip install -r requirements.txt
copy .env.example .env
cd ..
```

No macOS/Linux, troque `copy` por `cp`.

### 4. Instale o frontend

```bash
cd frontend
npm install
copy .env.example .env.local
cd ..
```

### 5. Configure as variáveis de ambiente do backend

Arquivo: `backend/.env`

Campos mais importantes:

- `OPENAI_API_KEY=`
- `GEMINI_API_KEY=`
- `WHISPER_MODEL=medium`
- `MAX_UPLOAD_MB=500`
- `DATABASE_URL=sqlite:///./data/app.db`

### 6. Inicie o backend

Windows PowerShell:

```powershell
cd backend
./start_backend.ps1
```

Windows CMD:

```cmd
cd backend
start_backend.bat
```

macOS/Linux:

```bash
cd backend
./start_backend.sh
```

Backend disponível em `http://127.0.0.1:8000`.

### 7. Inicie o frontend

Windows PowerShell:

```powershell
cd frontend
./start_frontend.ps1
```

Windows CMD:

```cmd
cd frontend
start_frontend.bat
```

macOS/Linux:

```bash
cd frontend
./start_frontend.sh
```

Frontend disponível em `http://localhost:3000`.

### 8. Inicialização rápida no Windows

Na raiz do projeto:

```powershell
./start-local.ps1
```

Ou:

```cmd
start-local.bat
```

## Instalação automática no Windows

Se você for entregar o projeto para outra pessoa em um PC Windows, use estes scripts na raiz do projeto:

```powershell
./install-windows.ps1
```

Ou com duplo clique:

```cmd
install-windows.bat
```

O instalador faz o seguinte:

- instala Python 3.10, Node.js LTS e ffmpeg via `winget` quando estiverem ausentes;
- cria `venv` local;
- instala as dependências do backend;
- instala as dependências do frontend com `npm ci`;
- copia `backend/.env.example` para `backend/.env` se necessário;
- copia `frontend/.env.example` para `frontend/.env.local` se necessário.

Depois da instalação, rode a validação completa:

```powershell
./build-release.ps1
```

Ou:

```cmd
build-release.bat
```

Esse script executa:

- testes do backend com `pytest`;
- build de produção do frontend com `next build`.

Para abrir a aplicação já em modo de produção no computador do usuário:

```powershell
./run-local-prod.ps1
```

Ou:

```cmd
run-local-prod.bat
```

Esse comando abre backend e frontend em janelas separadas e tenta abrir o navegador em `http://127.0.0.1:3000`.

## Uso desktop com Electron

Para abrir a versao desktop no Windows:

```powershell
.\start-desktop.ps1
```

Ou com duplo clique:

```cmd
start-desktop.bat
```

O iniciador usa primeiro a build pronta em `dist-electron/win-unpacked/Media Transcript Studio.exe`. Se ela ainda nao existir, ele cai para `npm run desktop:dev`.

Se quiser registrar a abertura automatica todos os dias no Agendador de Tarefas do Windows:

```powershell
.\schedule-desktop-daily.ps1 -Time "09:00"
```

## Compartilhar com um amigo no Windows

Se você enviar a pasta do projeto para outra pessoa, ela pode seguir só estes três arquivos da raiz, na ordem:

1. `1-instalar-programas-base.bat`
  Instala ou verifica Python 3.10, Node.js LTS e ffmpeg via `winget`.
2. `2-preparar-aplicacao.bat`
  Cria a `venv`, instala dependências Python e Node e copia os arquivos de ambiente padrão.
3. `3-iniciar-aplicacao.bat`
  Sobe backend e frontend em modo local de produção e abre o navegador.

Esse fluxo foi pensado para uso pessoal/local com SQLite. Não exige PostgreSQL, MySQL ou outro banco externo.

## Configuração com Docker Compose

1. Copie `backend/.env.example` para `backend/.env`.
2. Ajuste as chaves e parâmetros necessários.
3. Suba os serviços:

```bash
docker compose up --build
```

Endpoints:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## Como usar a aplicação

1. Abra `http://localhost:3000`.
2. Vá para `Upload e processamento`.
3. Envie um arquivo de áudio ou vídeo.
4. Aguarde a evolução do status na tela de detalhe.
5. Quando a transcrição concluir, selecione um modelo ou escreva um pedido livre.
6. Gere o relatório e baixe em `.txt` ou `.md`.

## Ordem de fallback da transcrição

1. OpenAI.
2. Gemini.
3. Whisper local.

O backend grava a engine usada no processo e retorna essa informação para o frontend.

## Endpoints principais

- `POST /api/uploads`
- `GET /api/uploads`
- `GET /api/uploads/{id}`
- `DELETE /api/uploads/{id}`
- `POST /api/process/{id}`
- `GET /api/transcriptions/{id}`
- `POST /api/reports/generate`
- `GET /api/uploads/{id}/reports`
- `GET /api/report-templates`
- `POST /api/report-templates`
- `PUT /api/report-templates/{id}`
- `DELETE /api/report-templates/{id}`
- `POST /api/report-templates/{id}/duplicate`
- `GET /api/history`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/health`

## Como testar OpenAI

1. Defina `OPENAI_API_KEY` em `backend/.env` ou pela tela de configurações.
2. Inicie backend e frontend.
3. Faça upload de um arquivo curto.
4. No detalhe do processo, confirme que a engine exibida foi `openai`.

## Como testar Gemini

1. Deixe `OPENAI_API_KEY` vazia.
2. Defina `GEMINI_API_KEY`.
3. Reprocesse um arquivo novo.
4. Verifique que a engine exibida foi `gemini`.

## Como testar Whisper local

1. Deixe `OPENAI_API_KEY` e `GEMINI_API_KEY` vazias.
2. Defina `WHISPER_MODEL=medium` ou outro modelo suportado.
3. Faça upload de um arquivo.
4. Confirme que a engine exibida foi `whisper`.

## Testes automatizados

Na raiz do backend:

```bash
pytest
```

Cobertura mínima implementada:

- validação e detecção de mídia;
- utilitário de ffmpeg;
- fallback de transcrição;
- CRUD de templates;
- geração de relatório.

## App Desktop Electron para Windows

O projeto agora também pode ser empacotado como aplicativo Windows com Electron.

### O que o build desktop inclui

- frontend Next.js em modo `standalone`;
- backend FastAPI empacotado com PyInstaller;
- `ffmpeg` e `ffprobe` incluídos nos recursos do aplicativo;
- persistência em pasta de usuário do Windows, fora da pasta instalada do programa.

### Como gerar o app desktop

Na raiz do projeto:

```powershell
npm install
npm run desktop:build
```

Artefatos gerados:

- app desembrulhado: `dist-electron/win-unpacked/`
- instalador Windows: `dist-electron/Media Transcript Studio Setup 1.0.0.exe`

### Como testar o app desktop sem instalador

```powershell
npx electron-builder --dir
```

Depois abra:

```powershell
dist-electron\win-unpacked\Media Transcript Studio.exe
```

### Persistência no Windows

No modo desktop, o Electron cria a área local do app na pasta de usuário do Windows e o backend recebe esses caminhos automaticamente para banco, uploads, temporários e exports.

## Limitações conhecidas

- O processamento assíncrono atual roda em background no mesmo processo do FastAPI. Para alto volume, o próximo passo é migrar para uma fila dedicada.
- O relatório usa fallback local simples quando nenhuma API de IA está disponível.
- Exportação para DOCX/PDF ainda não está implementada.
- Não há autenticação nem multiusuário nesta etapa.

## Evolução futura já preparada

- login local simples;
- múltiplos usuários;
- fila de processamento;
- exportação DOCX/PDF;
- refinamento visual e distribuição assinada do app desktop.

## Comandos exatos para rodar localmente

### Backend

```powershell
cd backend
..\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend

```powershell
cd frontend
npm run dev
```

### Testes do backend

```powershell
cd backend
..\venv\Scripts\python.exe -m pytest
```

## Fluxo recomendado para entregar a outro usuário no Windows

1. Envie a pasta do projeto.
2. Peça para a pessoa executar `install-windows.bat` uma vez.
3. Depois execute `build-release.bat` para validar a instalação.
4. Para uso diário, execute `run-local-prod.bat`.

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
