# Web pessoal na Vercel (senha única)

Dois projetos na conta Vercel `catarinasoaresjf-9232`:

| Projeto | URL | Origem |
| --- | --- | --- |
| `modeloia` (Next.js) | https://modeloia-three.vercel.app | pasta `frontend/` |
| `modeloia-api` (FastAPI, Python) | https://modeloia-api.vercel.app | montada por `deploy/vercel-backend/stage.mjs` |

Banco: Neon (Postgres) `modeloia-db`, ligado ao `modeloia-api` pelo Marketplace. O `DATABASE_URL` vem da integração.

## Como a proteção funciona

1. **Senha única** (64 caracteres aleatórios, ~372 bits). Na Vercel só existe o hash scrypt (`SITE_PASSWORD_HASH`).
   A senha foi salva apenas em `Documentos\ModeloIA-senha-web.txt` no computador onde foi gerada.
2. **Middleware do Next.js** bloqueia todas as páginas e rotas `/api` sem o cookie de sessão
   (`HttpOnly`, `Secure`, `SameSite=Strict`, assinado com `SITE_SESSION_SECRET`, 30 dias).
3. `/api/entrar` só aceita POST vindo do próprio site (`Origin` + `Sec-Fetch-Site`). Também atrasa cada erro e limita tentativas por IP.
4. **Backend**: o `ApiGuardMiddleware` exige, em toda chamada `/api` (menos `/api/health`):
   - `Origin` igual ao site (`CORS_ORIGINS`): Postman e curl não mandam esse cabeçalho, então recebem 403;
   - token HS256 de 5 minutos (`BACKEND_AUTH_SECRET`), que só o frontend emite depois da senha. Sem ele a resposta é 401.

Nenhum servidor consegue distinguir Postman de um navegador com certeza, porque cabeçalhos podem ser forjados. O que impede o uso é a exigência de token, que depende da senha.

## Trocar a senha

```bash
node frontend/scripts/gerar-senha-site.mjs "C:/caminho/fora/do/repo/nova-senha.txt" > hash.txt
```

Depois:
1. Rode `vercel env add SITE_PASSWORD_HASH production --force < hash.txt` dentro de `frontend/`.
2. Apague o `hash.txt`.
3. Rode `vercel deploy --prod` em `frontend/`.

Para derrubar todas as sessões abertas, troque também o `SITE_SESSION_SECRET`.

## Publicar de novo

```bash
node deploy/vercel-backend/stage.mjs
cd .vercel-build/backend && vercel deploy --prod
cd ../../frontend && vercel deploy --prod
```

## Limites da versão web

- **Funcionalidades confiáveis:** gravar reunião, modo ao vivo, resumos/relatórios e capturas de tela. Os arquivos ficam no Postgres (`FILE_STORAGE=database`).
- **Upload e importação:** o upload de arquivo comum e a importação do YouTube/Instagram gravam em `/tmp`, que não persiste entre requisições na Vercel. Além disso, toda requisição é limitada a 4,5 MB. Para esses fluxos, use o desktop.
- **Sem Whisper local nem ffmpeg:** a transcrição usa só as APIs, então as chaves de OpenAI/Gemini precisam estar em Ajustes, na própria web.
- **Tempo de processamento:** cada reunião tem até 300 s para ser processada (plano Hobby), o que costuma cobrir reuniões de até ~1 h.
- **Espaço:** o Neon grátis tem 0,5 GB, o que dá ~30 h de áudio a 32 kbps mais as capturas.
