# Prompt Mestre do Projeto

Crie uma aplicação local completa, pronta para rodar no computador de um usuário comum, com dois apps separados:

1. Um frontend em Next.js com App Router, TypeScript estrito e Tailwind CSS.
2. Um backend em Python com FastAPI, Pydantic, Uvicorn, SQLite e ffmpeg.

O sistema deve permitir:

- upload de áudio ou vídeo;
- validação de extensão, MIME type e tamanho;
- conversão de vídeo para MP3 em alta qualidade;
- normalização de áudio;
- transcrição com fallback nesta ordem: OpenAI, Gemini, Whisper local;
- exibição do status por etapas: uploaded, converting, transcribing, generating_report, completed, error;
- geração de relatórios a partir da transcrição;
- CRUD completo de modelos de relatório;
- histórico de processamentos e relatórios;
- tela de configurações com chaves, modelo Whisper, idioma, template padrão, pasta de exportação e limite de upload.

Estruture o backend em camadas com:

backend/
  app/
    api/
    core/
    services/
    repositories/
    models/
    schemas/
    utils/
    workers/
  tests/

Estruture o frontend em:

frontend/
  app/
  components/
  hooks/
  lib/
  services/
  types/

Requisitos adicionais:

- SQLite inicialmente.
- Endpoints REST para uploads, processamento, transcrições, relatórios, templates, histórico e configurações.
- README detalhado com instruções para Windows, macOS e Linux.
- .env.example para frontend e backend.
- scripts de inicialização locais e opção com Docker Compose.
- testes mínimos para upload, detecção de mídia, ffmpeg, fallback de transcrição, CRUD de templates e geração de relatório.
- código modular, limpo, pronto para crescer e preparado para futuras filas, múltiplos usuários e empacotamento desktop.
