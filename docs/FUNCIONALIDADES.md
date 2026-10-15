# Funcionalidades do ModeloIA

O ModeloIA transforma áudio, vídeo, reuniões, documentos e posts em transcrições, resumos, atas, relatórios e documentos preenchidos com IA. Roda como **aplicativo desktop (Windows)** e como **web**.

- [Gravar reunião](#gravar-reunião)
- [Modo ao vivo (copiloto na chamada)](#modo-ao-vivo-copiloto-na-chamada)
- [Análise da reunião depois da chamada](#análise-da-reunião-depois-da-chamada)
- [Transcrever áudio e vídeo](#transcrever-áudio-e-vídeo)
- [Resumos e relatórios](#resumos-e-relatórios)
- [Modelos de documento e formulários](#modelos-de-documento-e-formulários)
- [Instagram: post para prompt](#instagram-post-para-prompt)
- [Histórico, ajustes e tutorial](#histórico-ajustes-e-tutorial)
- [Desktop × web](#desktop--web)
- [Segurança da versão web](#segurança-da-versão-web)

---

## Gravar reunião

Menu **Gravar reunião** (`/gravar`). Grava uma videochamada do Teams, Zoom, Meet, Discord etc.

**Áudio**
- Grava duas fontes: o **microfone** (a sua voz) e o **áudio da reunião** (os outros participantes).
  - No desktop, o áudio da reunião vem do sistema inteiro, por loopback do Windows. Funciona com qualquer app de reunião.
  - Na web (Chrome/Edge), compartilhe a aba da reunião marcando "Compartilhar áudio da guia".
- Medidores de nível das duas fontes, para ver na hora se o áudio da reunião está chegando.
- Botões **Pausar**, **Silenciar meu microfone** e **Marcar momento**.
- O áudio é enviado em pedaços de 10 s durante a gravação. Se o app fechar no meio, a gravação aparece em "Gravações interrompidas" e pode ser processada com o que já foi enviado.

**Capturas de tela**
- Escolha da janela ou tela que vai aparecer nas capturas (desktop).
- Formas de capturar:
  - **Manual**: botão *Capturar tela*.
  - **Atalho global** (desktop): `Ctrl+Shift+S` captura a tela e `Ctrl+Shift+M` marca um momento, mesmo com a reunião em primeiro plano.
  - **Automática por mudança de tela**: troca de slide, planilha nova etc.
  - **Por intervalo**: a cada 30 s, 1 min ou 2 min.
  - **Prints do Windows** (`Win+Shift+S`, `Win+PrtScn`): entram sozinhos na reunião com o horário certo.
  - **Colar uma imagem** (`Ctrl+V`) na página, na web.
- Revisão no fim: marque ou desmarque o que entra na análise e exclua o que não quiser guardar.

**Antes de começar**
- Lembrete para usar fone de ouvido, que melhora a separação de quem falou.
- Botão que copia um aviso de gravação para colar no chat da reunião, e confirmação de que os participantes foram avisados.

## Modo ao vivo (copiloto na chamada)

Ligado por padrão em **Gravar reunião**.

- **Transcrição em tempo real**: a cada ~6 s de fala aparece o que foi dito. "Você" (microfone) e "Participante" (áudio da reunião) ficam separados. Trechos em silêncio não são enviados.
- **Sugestões da IA**: quando um participante faz uma pergunta, a IA sugere o que responder, com uma resposta direta e pontos de apoio.
  - Também dá para pedir pelo botão **Sugerir**, com um foco opcional ("responder sobre o prazo"), ou pelo atalho `Ctrl+Shift+A` no desktop.
  - A IA não inventa fatos sobre você: o que depende de informação que ela não tem vira um marcador, como `[confirmar andamento]`.
- **Contexto para as sugestões**: quem você é, o objetivo da reunião, números e argumentos. Fica salvo no computador para as próximas reuniões.
- **Janela flutuante**: uma janela pequena por cima da reunião com as sugestões e a transcrição. Ela aparece no compartilhamento de tela como qualquer janela.

## Análise da reunião depois da chamada

Ao parar, escolha **Analisar só o áudio** ou **Áudio + capturas de tela**. O app abre o processamento e gera o resumo sozinho.

- **Separação por interlocutor (diarização)**:
  - Com OpenAI (`gpt-4o-transcribe-diarize`) ou Gemini, a transcrição sai separada por voz.
  - Só com o Whisper local, separa "Você" de "Participantes".
- **"Você" identificado pela energia do microfone**, sem depender da IA.
- **Nomes sugeridos pela IA** quando a conversa deixa claro quem é quem ("Obrigado, Marina"). Painel **Interlocutores** para corrigir os nomes, que a transcrição passa a usar.
- **Conversa por interlocutor** com cores por pessoa. Clicar no horário toca o áudio daquele ponto.
- **Capturas na linha do tempo**: a IA descreve cada tela (slide, planilha, código) e encaixa a descrição no momento da conversa. Capturas repetidas são detectadas e ficam de fora. **Reanalisar com as capturas marcadas** refaz a análise.
- **Ata automática** no modelo *Reunião: ata e próximos passos*: resumo executivo, participantes e contribuições, decisões, itens de ação (responsável, prazo e minuto), pendências e riscos, tópicos e o que foi mostrado na tela.

## Transcrever áudio e vídeo

Menu **Processamentos/Relatórios** (`/uploads`).

- Envio de arquivo local de áudio ou vídeo.
- Gravação rápida pelo microfone.
- Importação por link do **YouTube** (vídeo, short, live) e do **Instagram** (reel, post, story), com tentativas automáticas quando o YouTube bloqueia e uso de `cookies.txt` como reserva.
- Conversão com ffmpeg e transcrição por uma cadeia de provedores configurável: **OpenAI → Gemini → Whisper local**.
- Escolha do idioma, do provedor e do modelo do Whisper.
- Transcrição com modo leitura, botão de copiar e exportação em TXT, MD, DOCX e PDF.

## Resumos e relatórios

Na página de cada processamento:
- **Ver resumo** (modelo *Resumo objetivo*) e **Ver resumo detalhado** (explica tudo para quem lê conseguir ensinar a outra pessoa).
- **Transcrever + resumir**: o resumo sai sozinho assim que a transcrição fica pronta.
- Relatório a partir de um modelo, com pedido livre, contexto da execução e instruções extras.
- Modelos prontos: Resumo objetivo, Resumo detalhado, Resumo executivo, Ata de reunião, Reunião: ata e próximos passos, Perguntas e respostas.
- Provedores de texto em cadeia: **OpenAI → Claude → Gemini**, com um resumo local de reserva.
- Renomear relatórios e exportar em MD/TXT, DOCX e PDF.

## Modelos de documento e formulários

- **Modelos** (`/templates`): envie um documento de referência (PDF, DOCX, ODT, texto). A IA extrai a estrutura e os campos variáveis, que podem ser editados, duplicados e excluídos.
- **Modelos de documento**: textos-base e instruções reutilizáveis que entram na geração dos relatórios.
- **Formulários** (`/forms`): preencha um modelo pelos campos, colando um texto ou enviando um áudio. A IA monta o documento para revisão e download.

## Instagram: post para prompt

Menu **Instagram**: lê um post, incluindo o texto das imagens por OCR (Gemini → OpenAI → Tesseract). A partir dele você revisa a solução, ajusta melhorias e aprova um prompt para usar em outra IA. Inclui login no Instagram pelo navegador ou envio de `cookies.txt` para posts que exigem sessão.

## Histórico, ajustes e tutorial

- **Histórico**: processamentos, relatórios e atividades. Permite remover registros.
- **Ajustes**: chaves de API (OpenAI, Gemini, Claude), ordem dos provedores de transcrição e de relatório, modelo do Whisper, idioma padrão, pasta de exportação, limite de upload e limpeza de temporários.
- **Tutorial**: como conseguir as chaves de cada IA.

## Desktop × web

| | Desktop (Windows) | Web pessoal (Vercel) | Web comercial |
| --- | --- | --- | --- |
| Acesso | sem login | uma senha gigante | contas por convite, Google, planos (Stripe) |
| Áudio da reunião | sistema inteiro (loopback) | aba ou tela do Chrome/Edge | aba ou tela do Chrome/Edge |
| Atalhos globais, prints do Windows e janela sempre por cima | sim | não | não |
| Whisper local e ffmpeg | sim | não (só APIs) | depende do servidor |
| Upload de arquivo grande e importação de links | sim | não (limite de 4,5 MB da Vercel) | sim |
| Onde ficam os dados | SQLite e disco do computador | Postgres (Neon) | Postgres |
| Créditos | sem limite | sem limite | por plano |

## Segurança da versão web

- **Senha**: senha única de 64 caracteres. Na Vercel só fica o hash scrypt dela.
- **Sessão**: cookie `HttpOnly`/`Secure`/`SameSite=Strict` assinado, válido por 30 dias.
- **Páginas**: todas as páginas e rotas internas exigem essa sessão.
- **Login**: só aceita pedidos vindos do próprio site, atrasa cada erro e limita tentativas por IP.
- **API**: toda chamada exige que a origem seja o próprio site e um token assinado de 5 minutos, emitido só depois da senha. Uma chamada direta pelo Postman ou curl recebe 403 (sem origem) ou 401 (sem token válido).

Detalhes de deploy e de troca da senha estão em [deploy-web-pessoal.md](deploy-web-pessoal.md).
