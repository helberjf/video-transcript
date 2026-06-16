# ModeloIA — AI Media Transcription & Report Studio

A full-stack application that turns audio/video into transcripts and structured reports using multiple AI providers. It ships as a **Next.js SaaS** (web) and an **Electron desktop app** (Windows), backed by a **FastAPI** service.

## Overview

Upload audio/video (or a link), convert and transcribe it with an AI provider chain, then generate documents (reports/forms) from reusable templates and export them to **DOCX/PDF**. The web app includes authentication, billing and transactional email; the same core also runs as a local desktop app.

## Architecture (monorepo)

```
frontend/   # Next.js 15 + React 19 web app (SaaS)
backend/    # FastAPI service (transcription, AI, media, OCR, exports)
electron/   # Electron desktop packaging (Windows)
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
- **AI / transcription (multi-provider):** OpenAI, Google Gemini (`google-genai`), Anthropic, and local **Whisper** (`openai-whisper`)
- **Media pipeline:** `ffmpeg-python` + `yt-dlp` (download + convert audio/video)
- **OCR:** `pytesseract` + Pillow
- **Document export:** `python-docx` (DOCX) and `reportlab` / `pypdf` (PDF)
- **Browser automation:** Playwright
- **Tests:** `pytest` + `pytest-asyncio`

### Desktop (`electron/`)
- Electron packaging of the app for Windows (bundles the frontend and the FastAPI backend).

## Features

- Upload audio/video or provide a link (yt-dlp), with conversion via ffmpeg
- Transcription with a multi-provider chain (OpenAI / Gemini / Anthropic / local Whisper)
- Report & form generation from reusable templates
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

## Notes

- The project is structured as a commercial-ready SaaS (auth, billing, email) while still being runnable fully locally.
- Configure provider API keys (OpenAI / Gemini / Anthropic) in the backend `.env`; if cloud providers are unavailable, local Whisper is used.
