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

## Trocar a senha única por contas (login por usuário)

A web também funciona com contas: cadastro aberto, login com email/senha (e Google, se configurado),
cada pessoa no próprio workspace e usando a **própria chave de IA**, guardada criptografada.

Como funciona a chave de IA de cada conta:

- `admin` (emails em `ADMIN_EMAILS`): usa e configura a chave global em Ajustes.
- Conta liberada pelo admin em `/admin/usuarios`: processa com a chave do admin, sem vê-la. O limite de créditos do plano continua valendo.
- Demais contas: cadastram a própria chave em `/chave-ia` (passo 2 do cadastro). O backend cifra com AES-256-GCM
  (`AI_KEYS_ENCRYPTION_KEY`) e guarda só o texto cifrado na tabela `workspace_ai_keys`. A tela mostra apenas o começo e o fim da chave.
  Essas contas não têm limite de créditos, porque pagam o provedor direto.
- Sem workspace identificado, nenhuma chave é usada (a do admin nunca entra por engano).
- A chave do admin também fica cifrada: o que for salvo em Ajustes vai para a linha `__owner__` de `workspace_ai_keys`.
  Chaves antigas em texto puro no `system_config` são movidas para lá e apagadas na primeira leitura.
  As variáveis de ambiente (`OPENAI_API_KEY` etc.) continuam valendo como reserva.
- Cookies (`cookies.txt` do YouTube/Instagram) são por conta, cifrados na tabela `workspace_cookies`. Só viram arquivo,
  num temporário apagado em seguida, durante um download daquela conta. Na web não existe o login em navegador
  controlado (ele abriria uma janela no servidor); o envio é pelo arquivo exportado.

Passo a passo:

1. **Backend (`modeloia-api`)**: adicione `AI_KEYS_ENCRYPTION_KEY` (gere com `python -c "import secrets;print(secrets.token_urlsafe(48))"`).
   Guarde uma cópia: trocar esse valor deixa ilegíveis as chaves já salvas.
2. **Frontend (`modeloia`)**:
   - `DATABASE_URL` e `DIRECT_URL` apontando para o **mesmo** Neon do backend (as tabelas `workspaces` e `usage_events` são compartilhadas).
   - `NEXTAUTH_SECRET`/`AUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAILS=seu@email.com` e `ADMIN_WORKSPACE_ID=pessoal`
     (o admin continua vendo os dados criados no modo de senha única).
   - Opcional: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` e `RESEND_API_KEY` (email de "esqueci a senha").
   - Remova `SITE_PASSWORD_HASH`, `SITE_SESSION_SECRET` e `NEXT_PUBLIC_PERSONAL_MODE`: com o hash presente, a senha única continua valendo.
3. Rode as migrações do Prisma no Neon: `npx prisma migrate deploy` dentro de `frontend/` com o `DATABASE_URL` de produção.
4. Publique o backend e o frontend (abaixo) e crie a sua conta em `/cadastro` com o email de `ADMIN_EMAILS`.

### Rate limit

Os contadores ficam no Postgres (`rate_limit_buckets` no frontend, `api_rate_limits` no backend), então valem
entre todas as instâncias da Vercel. Email e IP entram só como hash. Resposta acima do limite: `429` com `Retry-After`.

| Onde | Limite |
| --- | --- |
| Login | 10 por email e 30 por IP a cada 15 min (login certo zera o do email) |
| Cadastro | 5 por IP por hora |
| Esqueci a senha | 5 por IP e 3 por email por hora (acima do limite por email a resposta não muda, para não revelar contas) |
| Redefinir senha | 10 por IP a cada 15 min |
| Token do backend | 60 por conta a cada 5 min |
| Admin (liberar chave) / Stripe | 60 por minuto / 10 a cada 10 min |
| Backend, por workspace | troca de chave 10/10 min; IA (relatório, formulário, perguntas) 60/10 min; ao vivo 60 transcrições e 20 sugestões por minuto; upload/processamento 30/10 min; cookies 10/10 min |

No desktop o backend não limita nada (um usuário só, com a própria chave). Os valores ficam em `frontend/lib/rate-limit.ts`
e `backend/app/core/rate_limit.py`.

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

## Builds automáticos pelo GitHub desligados

O `vercel.json` da raiz tem `git.deploymentEnabled: false`. Os projetos antigos da conta helberjf (`video-transcript` e `video-transcript-ggix`) estavam ligados ao repositório com configuração errada: framework "Services" ou Flask, sem Root Directory. Por isso falhavam a cada push desde agosto. Com esse arquivo, um push não dispara mais build neles.

A web pessoal é publicada pela CLI, a partir de `frontend/` e de `.vercel-build/backend`, e não depende do GitHub. Para voltar a usar o deploy automático, apague o arquivo ou troque para `true`. Antes, configure o projeto com Root Directory = `frontend` e framework Next.js.
