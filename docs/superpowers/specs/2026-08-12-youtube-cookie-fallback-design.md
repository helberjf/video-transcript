# YouTube Anonymous Download Design

## Objetivo

Permitir que links públicos do YouTube sejam importados anonimamente, sem arquivo de cookies e sem leitura do perfil Chrome/Chromium.

## Diagnóstico

O processo desktop herda `INSTAGRAM_COOKIES_FROM_BROWSER` e `YTDLP_COOKIES_FROM_BROWSER`. O serviço de importação aplica essa configuração a qualquer fonte, inclusive YouTube. Assim, o `yt-dlp` tenta abrir o banco de cookies do navegador e pode falhar antes de acessar o vídeo. Abrir uma aba no Chromium controlado não fornece uma sessão ao `yt-dlp` e não deve ser requisito para o download anônimo.

## Arquitetura

`_build_ydl_options` aplicará cookies somente quando a fonte for Instagram. Para YouTube, as opções conterão formato e destino, mas nunca `cookiefile` nem `cookiesfrombrowser`, mesmo que as variáveis de ambiente de cookies estejam configuradas.

Para Instagram, o comportamento atual permanece: um arquivo configurado ou a leitura do navegador continua disponível, pois a sessão pode ser necessária para acessar a mídia.

## Tratamento de erros

- YouTube público: tentativa anônima direta.
- Falha SSL: nova tentativa equivalente com `nocheckcertificate=True`.
- Conteúdo privado, indisponível ou restrito: mensagem amigável correspondente, sem sugerir cookies como etapa padrão do YouTube.
- Instagram: erros de sessão continuam orientando a configuração de cookies do Instagram.

## Testes

Os testes unitários definirão as variáveis de ambiente de cookies e confirmarão que as opções do YouTube não contêm `cookiefile` nem `cookiesfrombrowser`. Um teste equivalente confirmará que Instagram ainda usa o arquivo de cookies quando ele está configurado.

## Escopo

O ajuste fica restrito à montagem das opções do `yt-dlp` no backend e aos seus testes. Não altera a tela de configurações nem os formatos de download.
