# Checklist de Deploy Comercial

## Supabase PostgreSQL
- Crie o projeto no Supabase e copie a connection string Postgres.
- Configure no Vercel:
  - `DATABASE_URL` com pooler/pgbouncer quando disponivel.
  - `DIRECT_URL` com conexao direta para migracoes.
- Rode, a partir de `frontend/`: `npm run prisma:migrate`.

## Auth.js e Google
- Configure:
  - `NEXTAUTH_URL=https://seu-dominio.com`
  - `NEXTAUTH_SECRET=<segredo longo>`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- No Google Cloud OAuth, cadastre:
  - `https://seu-dominio.com/api/auth/callback/google`
  - `http://127.0.0.1:3000/api/auth/callback/google` para desenvolvimento local.

## Stripe
- Crie os produtos/precos recorrentes:
  - Pro: R$49/mes -> `STRIPE_PRICE_PRO_MONTHLY`
  - Business: R$149/mes -> `STRIPE_PRICE_BUSINESS_MONTHLY`
- Configure:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- Webhook publico:
  - `https://seu-dominio.com/api/stripe/webhook`
  - Eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`.

## Backend FastAPI
- Em VPS ou computador exposto por tunel/reverso, configure:
  - `DATABASE_URL` apontando para o mesmo Supabase Postgres.
  - `BACKEND_AUTH_SECRET` igual ao Vercel.
  - `BACKEND_AUTH_REQUIRED=true` em producao.
  - `CORS_ORIGINS=https://seu-dominio.com`
- No Vercel, configure:
  - `NEXT_PUBLIC_API_BASE_URL=https://api.seu-dominio.com/api`

## Desktop/local
- Para desktop ou computador local sem login:
  - `BACKEND_AUTH_REQUIRED=false`
  - `NEXT_PUBLIC_DESKTOP_MODE=1`
- O app continua aceitando `X-Workspace-Id` local.

## Validacao antes de vender
- `npm run build` em `frontend/`.
- `pytest` em `backend/`.
- `npm run test:e2e` em `frontend/`.
- Confirmar webhook Stripe atualizando plano no banco.
- Confirmar limite de creditos retornando erro `402` no backend.
