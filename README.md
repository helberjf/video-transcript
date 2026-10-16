# ModeloIA — AI Media Transcription & Report Studio

A full-stack application that turns audio/video and **video-call meetings** into transcripts, speaker-separated minutes and structured reports using multiple AI providers. It ships as a **Next.js** web app (commercial SaaS or a password-protected personal deployment on Vercel) and an **Electron desktop app** (Windows), backed by a **FastAPI** service.

> Full feature list (in Portuguese): [docs/FUNCIONALIDADES.md](docs/FUNCIONALIDADES.md)

## Overview

Upload audio/video (or a link), or **record a meeting while it happens**, then transcribe it with an AI provider chain and generate documents (minutes, reports, forms) from reusable templates, exported to **DOCX/PDF**. During a call, the **live mode** transcribes in near real time and suggests replies. The web app includes authentication, billing and transactional email; the same core also runs as a local desktop app.

## Architecture (monorepo)

```
frontend/   # Next.js 15 + React 19 web app (SaaS)
backend/    # FastAPI service (transcription, AI, media, OCR, exports)
electron/   # Electron desktop packaging (Windows), system-audio capture and hotkeys
deploy/     # Vercel packaging for the FastAPI backend (personal web mode)
docs/       # additional documentation
```

## Tech stack

### Frontend (`frontend/` — Next.js SaaS)
- **Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS**
- **Prisma 7** with the `pg` adapter → **PostgreSQL**
- **NextAuth v4** with credentials + **Google OAuth**, `bcryptjs` for password hashing, `jose` for JWT
- **Stripe** for billing/subscriptions
- **Resend** for transactional email
- **DOCX/PDF generation** on the client (`docx`, `jspdf`)
- **Playwright** for end-to-end tests

### Backend (`backend/` — FastAPI)
- **FastAPI + Uvicorn**, Pydantic settings, `python-multipart`
- **SQLAlchemy 2.0 + Alembic** migrations on **PostgreSQL** (`psycopg`)
- **JWT auth** (PyJWT)
- **AI / transcription (multi-provider):** OpenAI (incl. `gpt-4o-transcribe-diarize` for speaker separation), Google Gemini (`google-genai`), Anthropic Claude, and local **Whisper** (`openai-whisper`)
- **Media pipeline:** `ffmpeg-python` + `yt-dlp` (download + convert audio/video)
- **OCR:** `pytesseract` + Pillow
- **Document export:** `python-docx` (DOCX) and `reportlab` / `pypdf` (PDF)
- **Browser automation:** Playwright
- **Tests:** `pytest` + `pytest-asyncio`

### Desktop (`electron/`)
- Electron packaging of the app for Windows (bundles the frontend and the FastAPI backend).
- `preload.cjs` + `recording-bridge.cjs`: system-audio loopback for meeting recording, screen/window picker, global hotkeys (`Ctrl+Shift+S` capture, `Ctrl+Shift+M` marker, `Ctrl+Shift+A` AI suggestion), Windows screenshot import and the always-on-top live window.

## Features

- **Meeting recording** (`/gravar`): microphone + meeting audio (Windows loopback on desktop, tab/screen audio in Chrome/Edge), chunked upload every 10 s with crash recovery, and screenshots (button, global hotkey, slide-change detection, interval, Windows screenshots, paste)
- **Speaker separation**: diarized transcript, "you" detected from microphone energy, AI-suggested names you can edit, click-to-play timestamps
- **Audio + screenshots analysis**: the AI describes each screenshot and places it on the conversation timeline; automatic minutes with decisions and action items
- **Live mode**: transcription every ~6 s during the call, automatic reply suggestions when someone asks a question, optional context about you, floating window
- Upload audio/video or provide a link (yt-dlp), with conversion via ffmpeg
- Transcription with a multi-provider chain (OpenAI / Gemini / local Whisper)
- Summaries ("Ver resumo", "Ver resumo detalhado") and report & form generation from reusable templates
- Export to **DOCX** and **PDF**
- OCR to extract text from images/PDFs
- Authentication (credentials + Google OAuth), JWT sessions
- Billing with Stripe and transactional email with Resend
- Available as a web app and as a Windows desktop app

## Running locally

### Backend (FastAPI)

```bash
cd backend
cp .env.example .env          # set DB, AI keys, JWT, etc.
pip install -r requirements.txt
alembic upgrade head          # apply database migrations
python run_backend.py         # or: uvicorn app.main:app --reload
# tests
pytest
```

Backend runs on `http://127.0.0.1:8000`. Requires PostgreSQL and `ffmpeg` installed.

### Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local     # DATABASE_URL, NEXTAUTH, GOOGLE_*, STRIPE_*, RESEND_*
npm install                    # runs prisma generate
npm run prisma:migrate         # apply Prisma migrations
npm run dev                    # http://localhost:3000
# e2e tests
npm run test:e2e
```

### Desktop (Electron, Windows)

The `electron/` package bundles the Next.js frontend and the FastAPI backend into a Windows desktop app. See `docs/` for the build/installer steps.

- `build-release.bat` (or `npm run desktop:build`) generates the installer `Instalar ModeloIA.exe` locally, without publishing.
- **Auto-update:** every time the installed app opens it checks [GitHub Releases](https://github.com/helberjf/video-transcript/releases) and, if there is a newer version, asks the user to download it and restart. Settings → "Verificar atualizacoes" checks on demand.
- **Publishing a new version:** bump `version` in `package.json`, set `GH_TOKEN` (a GitHub token with `contents: write` on this repo) and run `publish-release.bat` (or `npm run desktop:release`). It builds the installer and uploads it plus `latest.yml` to a GitHub Release, which is what installed apps look for.

## Access model: desktop vs web

| | Desktop (Electron) | Web |
| --- | --- | --- |
| Login | none | required (password or Google) |
| Sign-up | n/a | invite code only |
| Credit limit | none — the AI key belongs to the user | free plan, `TRIAL_CREDIT_LIMIT` (default 20 credits ≈ 1 credit per minute of media) |

A third mode, **personal web** (`NEXT_PUBLIC_PERSONAL_MODE=1` + `SITE_PASSWORD_HASH`), replaces accounts and billing with a single long password. See [Personal web deployment](#personal-web-deployment-vercel-single-password).

Desktop mode is detected from `APP_ENV=desktop` (sent by Electron) or `DESKTOP_MODE=true`.

On the web the AI key belongs to the operator, so accounts are gated:

```bash
cd frontend && npm run invite:create -- --uses 5 --dias 30
```

Share the generated code; the person signs up at `/cadastro`. `npm run invite:create -- --listar`
shows how many uses are left. Google sign-in only accepts emails that already
redeemed an invite (or an admin email), so enabling it does not open the door.

Admin accounts listed in `ADMIN_EMAILS` skip both the invite and the credit
limit — the real ceiling is the quota on the operator's own AI key. Create one
with `ADMIN_EMAIL`/`ADMIN_PASSWORD` set in the environment:

```bash
cd frontend && npm run admin:create
```

Deploying the web version requires `BACKEND_AUTH_SECRET` set to the same value
on the frontend and the backend; outside `APP_ENV=development` there is no
fallback secret and authenticated requests fail without it.

## Deploying the web app (Vercel)

Only `frontend/` is deployable to Vercel — the FastAPI backend has to be hosted
elsewhere (VPS, Fly, Render) and pointed at with `NEXT_PUBLIC_API_BASE_URL`.

In the Vercel project settings, set **Root Directory** to `frontend`. Without it
the build fails with `No Next.js version detected`: Vercel looks for Next in the
repository root, which holds the Electron package instead. With the root
directory set, install/build/output are detected automatically — no `vercel.json`
is needed.

Required environment variables:

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Postgres reachable from Vercel (a local instance will not work) |
| `NEXTAUTH_SECRET` | signs the session; no fallback outside development |
| `NEXTAUTH_URL` | public URL of the deployment |
| `BACKEND_AUTH_SECRET` | must be the **same value** on the backend host, or every authenticated request fails |
| `NEXT_PUBLIC_API_BASE_URL` | e.g. `https://api.seudominio.com/api` |
| `ADMIN_EMAILS` | accounts that skip the invite and the credit limit |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | only when enabling Google sign-in |

After the first deploy, apply the migrations against the production database
(`npx prisma migrate deploy` from `frontend/`) and create the invite codes.

## Personal web deployment (Vercel, single password)

Both the Next.js frontend and the FastAPI backend run on Vercel, with Postgres (Neon) for data and recording files (`FILE_STORAGE=database`). Access is locked behind one 64-character password:

- **Vercel side:** only its scrypt hash (`SITE_PASSWORD_HASH`) is stored there.
- **Next.js middleware:** gates every page and `/api` route with a signed `HttpOnly` cookie.
- **Backend `ApiGuardMiddleware`:** requires the site's `Origin` plus a 5-minute signed token on every call. Direct Postman/curl requests get 403/401.

```bash
node frontend/scripts/gerar-senha-site.mjs "C:/outside/the/repo/password.txt" > hash.txt
node deploy/vercel-backend/stage.mjs
cd .vercel-build/backend && vercel deploy --prod
cd ../../frontend && vercel deploy --prod
```

Environment variables, limits (no Whisper/ffmpeg, 4.5 MB request cap, 300 s processing) and password rotation: [docs/deploy-web-pessoal.md](docs/deploy-web-pessoal.md).

## Notes

- The project is structured as a commercial-ready SaaS (auth, billing, email) while still being runnable fully locally.
- Configure provider API keys (OpenAI / Gemini / Anthropic) in the backend `.env` or in **Ajustes**; if cloud providers are unavailable, local Whisper is used (desktop only).
- Speaker separation and the live mode need an OpenAI or Gemini key; with Whisper only, meetings are split into "you" vs. "participants".
