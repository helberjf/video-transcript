# Gravação de Reuniões com Análise por IA — Plano

**Objetivo:** durante uma videochamada (Meet, Teams, Zoom, Discord…), o usuário aperta "Gravar reunião" no ModeloIA. O app grava o áudio da reunião (a voz dele e a dos outros participantes), opcionalmente guarda capturas de tela feitas durante a gravação e, ao final, a IA analisa **só o áudio** ou **áudio + imagens**, com a transcrição separada por interlocutor.

**Princípio de arquitetura:** a gravação vira um `Upload` comum (`source_type="meeting"`). Assim histórico, créditos, resumo, "Ver resumo detalhado", modelos de relatório e exportação DOCX/PDF continuam funcionando sem mudança. O que é novo entra como camadas por cima: captura no cliente, upload em pedaços, transcrição com diarização, tabela de capturas de tela e uma linha do tempo para o prompt.

**Stack envolvida:** Electron 37 (captura de áudio do sistema no Windows), Next.js 15 / React 19 (gravador no navegador), FastAPI + SQLAlchemy (sessão de gravação, worker), ffmpeg, OpenAI `gpt-4o-transcribe-diarize`, Gemini (áudio + imagens), Whisper local (reserva).

---

## 1. Como a captura funciona

### 1.1 Duas fontes de áudio, dois canais

| Fonte | Como é capturada | O que contém |
| --- | --- | --- |
| Microfone | `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })` | a voz do usuário |
| Áudio do sistema | Desktop: `getDisplayMedia` + `setDisplayMediaRequestHandler(..., { audio: "loopback" })` no Electron. Web: `getDisplayMedia({ audio: true, systemAudio: "include" })` no Chrome/Edge | a voz dos outros participantes |

As duas fontes são combinadas com Web Audio num **stream estéreo**: canal esquerdo = microfone, canal direito = sistema (`ChannelMergerNode`). O `MediaRecorder` grava esse único stream em `audio/webm;codecs=opus`.

Por que separar em canais: o `MediaRecorder` só grava uma faixa de áudio, e manter as fontes em canais distintos dá de graça a identificação de **"Você"**. Em cada trecho transcrito, se a energia do canal esquerdo domina, quem falou foi o usuário. Isso funciona até no Whisper local, que não faz diarização.

Cuidados:
- **Fone de ouvido recomendado.** Com caixa de som, o microfone capta os outros participantes e a separação por canal piora. A tela de gravação mostra esse aviso.
- **Botão "silenciar meu microfone"** no gravador. O usuário pode estar mudo na chamada, mas o gravador continuaria captando o que ele fala.
- **Medidores de nível dos dois canais** na tela de gravação. É a única forma de o usuário perceber na hora que o áudio do sistema não está chegando, por exemplo quando esqueceu de marcar "compartilhar áudio da guia" no navegador.
- Não gravamos vídeo, só áudio e quadros avulsos. Isso economiza disco e upload.

### 1.2 Desktop (Electron) × Web

| | Desktop (Windows) | Web |
| --- | --- | --- |
| Áudio do sistema | loopback do Windows: pega qualquer app (Teams, Zoom, Meet no navegador) | só Chrome/Edge. Compartilhando **a guia** da reunião com "compartilhar áudio da guia", ou a tela inteira com áudio do sistema (Windows). Firefox e Safari não entregam áudio do sistema: gravação só com o microfone e aviso claro ao usuário |
| Reunião no app nativo (Teams/Zoom desktop) | funciona | só compartilhando a tela inteira com áudio do sistema |
| Atalho global para capturar tela | sim (`globalShortcut`) | não. Só o botão ou atalho com a aba do ModeloIA em foco |
| Prints do Windows (Win+Shift+S) | importados automaticamente (ver 1.3) | colar (Ctrl+V) ou arrastar para a página de gravação |
| Créditos | sem limite (chave do usuário) | 1 crédito/min. Uma reunião de 1 h consome 60 créditos, acima do plano gratuito atual (20) |

**Recomendação:** entregar primeiro no desktop, onde a captura é confiável, e liberar a web na mesma base de código com detecção de recursos e avisos.

### 1.3 Capturas de tela durante a gravação

Fontes de captura, todas com `offset_seconds` (tempo desde o início da gravação, descontando pausas):

1. **Botão "Capturar tela"** e atalho (`Ctrl+Shift+S` global no desktop). Pega um quadro do stream de vídeo do `getDisplayMedia` (`ImageCapture.grabFrame()`, com `<video>` + `<canvas>` como alternativa).
2. **Automática por intervalo** (ex.: a cada 30 s), desligada por padrão.
3. **Automática por mudança de tela:** a cada 2 s o quadro é reduzido para 32×32 em tons de cinza e comparado ao anterior. Se a diferença passa do limiar (troca de slide, nova planilha), a tela é capturada. É o modo mais útil para apresentações.
4. **Prints feitos pelo próprio usuário** (desktop): enquanto grava, o Electron observa a pasta `Imagens\Capturas de Tela` (`fs.watch`) e a área de transferência (`clipboard.readImage()` a cada 1 s, comparando hash). Cada print novo entra na reunião com o timestamp do momento.

A opção **"Salvar capturas de tela"** liga e desliga tudo isso. As capturas salvas podem ou não entrar na análise: a escolha "só áudio" ou "áudio + imagens" é feita no fim, e cada imagem tem uma caixa "incluir na análise".

Privacidade: o seletor de fonte sugere a **janela da reunião** em vez da tela inteira, para não capturar notificações e outros apps.

### 1.4 Robustez da gravação

- `MediaRecorder.start(10_000)`: a cada 10 s sai um pedaço (`dataavailable`), enviado para o backend com número de sequência (`PUT /chunks/{seq}`, idempotente).
- Na web, os pedaços ficam no IndexedDB até o backend confirmar, para sobreviver a uma queda de rede. No desktop o backend é local e o risco é baixo.
- Se o app fecha no meio da gravação, o `Upload` fica com status `recording` e os pedaços continuam no disco. Ao reabrir, o app mostra "Gravação interrompida: finalizar com o que foi salvo?".
- Electron: `backgroundThrottling: false` (timers de captura automática não podem ser estrangulados com a janela minimizada), `powerSaveBlocker.start("prevent-app-suspension")` durante a gravação e confirmação ao fechar o app gravando.

---

## 2. Pipeline de processamento (backend)

```
pedaços .webm ──► finalizar ──► recording.webm (estéreo: L=mic, R=sistema)
                                   │
                                   ├─► mono 16 kHz opus 24 kbps (~11 MB/h) ──► transcrição com diarização
                                   │                                              │
                                   └─► energia por canal em cada segmento ◄───────┘
                                                     │
                                       segmentos [{início, fim, falante, texto}]
                                                     │
                       sugestão de nomes (contexto da fala + capturas da tela)
                                                     │
capturas ──► dedupe (dHash) ──► descrição + OCR por imagem (se "áudio + imagens")
                                                     │
                                     linha do tempo intercalada ──► relatório / ata
```

### 2.1 Finalização
- Concatena os pedaços em ordem. Pedaços do mesmo `MediaRecorder` formam um webm contínuo, porque só o primeiro tem cabeçalho.
- Faz remux com `ffmpeg -c copy`, porque o webm do `MediaRecorder` sai sem duração e sem índice, e mede a duração com `ffprobe`.

### 2.2 Áudio leve para transcrição
Hoje `normalize_audio` / `extract_audio_to_mp3` geram **MP3 estéreo a 320 kbps**. Nessa taxa, os 25 MB que a OpenAI aceita equivalem a ~10 min de áudio, então qualquer arquivo maior já falha na OpenAI e cai em silêncio para o Gemini. Para reuniões (e, de quebra, para o fluxo atual) o worker passa a gerar **opus mono 16 kHz a 24 kbps** (~11 MB por hora).

### 2.3 Transcrição com diarização (nova cadeia de provedores)

| Ordem | Provedor | Como | Observações |
| --- | --- | --- | --- |
| 1 | OpenAI `gpt-4o-transcribe-diarize` | `response_format="diarized_json"`, `chunking_strategy="auto"` | segmentos com `speaker`, `start`, `end`, `text`. Aceita até 4 falantes conhecidos (`known_speaker_names[]` + `known_speaker_references[]`, trechos de 2–10 s). Não aceita `prompt` |
| 2 | Gemini (modelo configurado) | áudio + prompt pedindo JSON estruturado `{start, end, speaker, text}` | aguenta horas de áudio numa chamada só (rótulos consistentes do início ao fim) e pode receber as capturas junto. Timestamps menos precisos |
| 3 | Whisper local + canais | transcrição atual com segmentos do Whisper | sem diarização real: separa só **"Você" × "Outros participantes"** pela energia dos canais |
| 4 (opcional, Fase 5) | Whisper + pyannote local | diarização offline | pesado para empacotar e exige token do Hugging Face |

**Risco técnico principal (validar no spike da Fase 0):** áudios longos. Se o modelo da OpenAI tiver limite de duração por requisição (há relatos de ~1.400–1.500 s nos modelos `gpt-4o-transcribe`), será preciso dividir em partes de ~20 min nos silêncios. Os rótulos A/B/C mudam entre partes. A solução é extrair da parte 1 um trecho limpo de 2–10 s de cada falante e passá-lo como `known_speaker_references` nas partes seguintes. Isso cobre até 4 falantes; acima disso, usar o Gemini no arquivo inteiro.

### 2.4 Reconhecimento de interlocutores
1. **"Você"**: o rótulo cujos segmentos são majoritariamente dominados pelo canal do microfone vira `is_self=true`, com o nome configurado em Ajustes.
2. **Sugestão de nomes pelo contexto**: uma chamada barata ao LLM com a transcrição rotulada pergunta quais nomes são citados e a quem se referem ("Obrigado, Marina", "João, e o prazo?"). A resposta vem com confiança e com o trecho que serve de evidência.
3. **Sugestão pelas capturas**: Meet, Teams e Zoom mostram o nome no quadro de quem está falando. Para capturas feitas enquanto um único rótulo fala, o modelo de visão responde quem está destacado como falante.
4. **Confirmação do usuário**: as sugestões aparecem como pré-preenchimento do painel "Interlocutores" (A → Marina). Ao salvar, `transcription_text` é regravado no formato `[00:12:03] Marina: …`, que todo o fluxo de relatório já entende.
5. **(Fase 5) Perfis de voz**: guardar um trecho de referência por pessoa recorrente e enviá-lo como falante conhecido nas próximas reuniões. É dado biométrico (dado pessoal sensível pela LGPD), então só com opt-in explícito e exclusão fácil.

### 2.5 Análise de imagens ("áudio + imagens")
- **Dedupe:** dHash com Pillow, que já é dependência. Capturas quase idênticas e seguidas são marcadas como duplicadas e saem da análise.
- **Descrição por imagem:** a cadeia de visão de `instagram_ocr_service` (Gemini → OpenAI → Tesseract) vira um `vision_service` genérico. Para cada captura incluída, ele gera descrição + texto visível, guardados no banco. Rodar uma vez por imagem barateia reanálises e escala para dezenas de capturas.
- **Linha do tempo:** fala e imagens são intercaladas por timestamp:
  ```
  [00:12:03] Marina: o roadmap do Q4 tem três entregas…
  [00:12:10] [Captura 4] Slide "Roadmap Q4": lista com Login social, Exportação PDF e API pública.
  [00:12:31] Você: a API pública cabe nesse prazo?
  ```
- **Imagens anexadas:** em provedores multimodais (Claude, GPT, Gemini), além da linha do tempo em texto, vão anexadas as N capturas mais relevantes (limite configurável, ex.: 15).
- **Só áudio:** a mesma linha do tempo sem as capturas, igual ao fluxo de hoje com falantes.

### 2.6 Modelos de relatório novos (seed)
- **Ata de reunião:** participantes, resumo executivo, decisões, itens de ação (responsável, prazo, minuto em que foi dito), pendências e riscos, tópicos com timestamps e "o que foi mostrado na tela" (quando houver imagens).
- **Itens de ação:** lista copiável por responsável.
- **Resumo por participante:** posição e contribuições de cada pessoa.

---

## 3. Modelo de dados

**`uploads`** (colunas novas):
- `transcript_segments` (Text/JSON): `[{start, end, speaker, text, self_ratio}]`
- `speakers` (Text/JSON): `[{label: "A", name: "Marina", is_self: false, suggested_name, confidence}]`
- `analysis_mode` (`audio` | `audio_images`)
- `recording_meta` (Text/JSON): pausas, marcadores ("marcar momento" com nota), fonte capturada, se teve áudio do sistema

**`ProcessingStatus`**: novos `recording`, `diarizing` e `analyzing_images`. O `status-badge.tsx` precisa conhecer os três.

**Nova tabela `meeting_captures`:**
`id, workspace_id, upload_id (FK), stored_path, offset_seconds, captured_at, trigger (manual|hotkey|interval|scene_change|os_screenshot|paste), width, height, dhash, is_duplicate, included, description, ocr_text, vision_engine, created_at`

**Arquivos em disco:** `storage/recordings/{upload_id}/chunks/000001.webm…`, `recording.webm`, `transcribe.ogg`, `captures/{capture_id}.png`. `delete_upload` passa a apagar a pasta inteira.

**Migrações:** seguir o padrão atual nos dois lugares. `run_startup_migrations` cobre o SQLite (desktop) com `ALTER TABLE` e a tabela nova sai do `create_all`. Uma revisão Alembic cobre o Postgres (web).

---

## 4. API (FastAPI) — `backend/app/api/routes/recordings.py`

| Método | Rota | Função |
| --- | --- | --- |
| POST | `/api/recordings` | cria o `Upload` em `recording` (título, idioma, opções) e devolve o `id` |
| PUT | `/api/recordings/{id}/chunks/{seq}` | grava um pedaço (idempotente por `seq`) |
| POST | `/api/recordings/{id}/captures` | multipart: imagem + `offset_seconds` + `trigger` |
| POST | `/api/recordings/{id}/markers` | marcador com nota ("decisão importante aqui") |
| POST | `/api/recordings/{id}/finish` | `{analysis_mode, template_id?, auto_summary}`: finaliza e enfileira o worker |
| GET | `/api/recordings/interrupted` | gravações que ficaram em `recording` (recuperação) |
| GET | `/api/uploads/{id}/captures` | lista as capturas com descrição |
| GET | `/api/captures/{id}/image` | imagem |
| PATCH / DELETE | `/api/captures/{id}` | `included`, excluir |
| GET | `/api/uploads/{id}/media` | áudio da reunião com suporte a `Range` (player sincronizado) |
| PATCH | `/api/uploads/{id}/speakers` | `{ "A": "Marina" }`: renomeia e regrava `transcription_text` |
| POST | `/api/uploads/{id}/speakers/suggest` | roda (de novo) a sugestão de nomes |

Créditos (web): igual ao fluxo atual (`audio_video_credits` pela duração) mais um item novo, `meeting_image_analysis`, cobrado por lote de imagens. No desktop continua sem limite.

---

## 5. Frontend

**Nova página `/gravar`** (item "Gravar reunião" no `app-shell`), em três estados:
1. **Preparar:** título, idioma, escolha da fonte (janela da reunião ou tela), microfone liga/desliga, "salvar capturas de tela" (manual / intervalo / mudança de tela / prints do Windows), aviso de fone de ouvido e caixa de consentimento (ver seção 7).
2. **Gravando:** cronômetro, medidores de nível do microfone e do sistema, Pausar, Silenciar microfone, Capturar tela, Marcar momento, Parar, e a faixa de miniaturas das capturas.
3. **Revisar:** galeria de capturas (incluir/excluir, apagar), escolha **"Analisar só o áudio"** ou **"Áudio + capturas"**, modelo (padrão "Ata de reunião") e Processar, que leva a `/uploads/{id}?resumo=1`.

**`/uploads/[id]` em modo reunião:**
- transcrição por falante (cor por pessoa, rótulo "Você")
- clicar no timestamp toca o áudio naquele ponto
- painel "Interlocutores" com as sugestões pré-preenchidas e o botão salvar
- linha do tempo com as capturas intercaladas
- os botões de resumo e exportação atuais continuam iguais

**Código novo:**
- `hooks/use-meeting-recorder.ts`: estado da gravação, streams, `MediaRecorder`, pausas e offsets
- `lib/recording/audio-mixer.ts`: microfone e sistema para estéreo L/R, mais analisadores de nível
- `lib/recording/chunk-uploader.ts`: fila com retry e IndexedDB na web
- `lib/recording/frame-capture.ts`: `grabFrame` e detecção de mudança de cena
- `lib/recording/desktop-bridge.ts`: detecta `window.modeloiaDesktop` e cai para o comportamento web quando não existe
- `components/recording/*`: `LevelMeter`, `CaptureStrip`, `SpeakerTranscript`, `SpeakerEditor`
- `services/api.ts` e `types/api.ts`: chamadas e tipos novos

---

## 6. Electron

Hoje a janela não tem preload nem IPC. É preciso criar:

- **`electron/preload.cjs`** com `contextBridge.exposeInMainWorld("modeloiaDesktop", { recording: {...} })`: listar fontes (`desktopCapturer.getSources` com miniaturas), escolher a fonte, eventos de atalho, mini-janela e prints do sistema. Incluir o arquivo em `build.files` no `package.json`.
- **`main.cjs`:**
  - `session.defaultSession.setDisplayMediaRequestHandler`: entrega a fonte escolhida com `audio: "loopback"`, nunca `loopbackWithMute`, que silenciaria a reunião para o usuário.
  - `setPermissionRequestHandler`: libera `media` só para a origem local `http://127.0.0.1:38501`.
  - `webPreferences.backgroundThrottling = false` e `preload`.
  - `globalShortcut` (capturar, marcar, pausar) registrado só enquanto grava.
  - `powerSaveBlocker` durante a gravação.
  - **mini-janela flutuante** (`alwaysOnTop`, sem moldura) com cronômetro, Capturar, Marcar e Parar, para usar por cima do Teams/Zoom. Ela conversa com a janela principal via IPC; a gravação continua na janela principal.
  - ícone na bandeja ("Gravando…") e confirmação ao sair durante a gravação.
  - observador da pasta de prints e da área de transferência (seção 1.3).

---

## 7. Privacidade e LGPD

- Antes de gravar: caixa "Avisei os participantes que esta reunião está sendo gravada" e um botão que copia um aviso pronto para colar no chat da reunião.
- Indicador de gravação sempre visível (página, mini-janela e bandeja).
- Retenção configurável em Ajustes: apagar áudio bruto e capturas após N dias, mantendo transcrição e ata.
- Perfis de voz (Fase 5) só com opt-in; tudo local no desktop.
- Na web, áudio e imagens vão para o backend do operador: deixar isso claro nos termos.

---

## 8. Fases de entrega

### Fase 0 — Pré-requisitos e spike (pequena)
- [ ] **Corrigir o `.gitignore`:** a regra `models/` (pensada para modelos do Whisper) ignora `backend/app/models/`. Os modelos SQLAlchemy **não estão versionados**: este worktree nem tem a pasta e o backend não sobe nele. Trocar por `/models/` + `*.pt`/`*.bin` e versionar `backend/app/models/`.
- [ ] Atualizar o SDK `openai` (fixado em 1.58.1, anterior ao modelo de diarização).
- [ ] Áudio de transcrição em opus mono 16 kHz/24 kbps (corrige também o limite de 25 MB no fluxo atual).
- [ ] Atualizar `claude_report_model` (`claude-3-5-sonnet-latest` foi descontinuado; hoje o provedor Claude falha e cai no próximo em silêncio).
- [ ] **Spike:** gravar uma reunião real de ~1 h e comparar OpenAI diarize × Gemini (precisão dos falantes, limite de duração, custo, tempo). A decisão define a ordem padrão da cadeia.

### Fase 1 — MVP: gravar e resumir (só áudio, sem diarização)
- [ ] Electron: preload, `setDisplayMediaRequestHandler` com loopback, permissões, `backgroundThrottling`.
- [ ] `use-meeting-recorder` + mixer estéreo + medidores + upload em pedaços.
- [ ] Rotas `recordings` (criar, chunk, finish, interrupted) e finalização com ffmpeg.
- [ ] Worker de reunião usando a transcrição atual e status `recording`.
- [ ] Página `/gravar` (preparar, gravando, parar) e item no menu.
- [ ] Testes: concatenação/remux, idempotência de chunk, recuperação de gravação interrompida.

**Pronto quando:** dá para gravar uma chamada do Teams/Meet no desktop e, ao parar, cair na tela atual com "Ver resumo".

### Fase 2 — Interlocutores
- [ ] `diarization_service` com a cadeia OpenAI diarize → Gemini → Whisper + canais.
- [ ] Detecção de "Você" por energia de canal (teste com estéreo sintético: tom no L, ruído no R).
- [ ] `transcript_segments`, `speakers`, `PATCH /speakers` e o formato `[hh:mm:ss] Nome:` em `transcription_text`.
- [ ] Sugestão de nomes pelo contexto.
- [ ] UI: transcrição por falante, editor de interlocutores, player sincronizado (`/media` com Range).
- [ ] Divisão de áudios longos com `known_speaker_references`, se o spike mostrar que é preciso.

### Fase 3 — Capturas de tela e análise "áudio + imagens"
- [ ] Captura manual, por intervalo e por mudança de tela; colar/arrastar na web.
- [ ] Tabela `meeting_captures`, rotas e galeria de revisão (incluir/excluir).
- [ ] `vision_service` extraído do `instagram_ocr_service`, mais o dedupe dHash.
- [ ] Linha do tempo intercalada, imagens anexadas a provedores multimodais e sugestão de nome pelas capturas.
- [ ] Seeds: "Ata de reunião", "Itens de ação", "Resumo por participante".
- [ ] Escolha "só áudio" × "áudio + capturas" na revisão.

### Fase 4 — Acabamento do desktop
- [ ] Mini-janela flutuante, atalhos globais, bandeja e `powerSaveBlocker`.
- [ ] Importação automática dos prints do Windows (pasta + área de transferência).
- [ ] Marcadores com nota, retenção configurável e confirmação ao fechar gravando.

### Fase 5 — Opcional
- [ ] Perfis de voz entre reuniões (falantes conhecidos), com opt-in.
- [ ] Diarização offline (Whisper + pyannote).
- [ ] Web: liberar com aviso de navegador e revisar créditos e planos para reuniões longas.

---

## 9. Testes

- **Backend (pytest, no estilo atual com monkeypatch dos provedores):** sequência e idempotência de chunks, concatenação e remux com webm gerado pelo ffmpeg, energia por canal, formatação dos segmentos, renomeação de falantes, dedupe dHash, montagem da linha do tempo, cadeia de diarização com falhas simuladas e créditos.
- **Frontend (Playwright):** Chromium com `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --auto-select-desktop-capture-source=Entire screen`. O teste grava 5 s, captura uma tela, para, processa (provedor mockado) e confere a tela de revisão.
- **Matriz manual:** Teams desktop, Zoom desktop e Meet no Chrome; fone × caixa de som; reunião de 1 h; pausar e retomar; matar o app no meio (recuperação); dois monitores; 5+ participantes.

---

## 10. Decisões em aberto

1. **Desktop primeiro?** Recomendado. Na web a captura depende do navegador e de o usuário marcar "compartilhar áudio".
2. **Provedor padrão de diarização:** OpenAI (timestamps melhores) × Gemini (uma chamada só, áudio + imagens, áudios longos). Decidir depois do spike.
3. **Guardar vídeo da reunião?** Este plano grava só áudio + quadros avulsos. Gravar vídeo multiplica disco e upload e não muda a análise.
4. **Perfis de voz entre reuniões:** vale a complexidade de LGPD agora ou fica para a Fase 5?
