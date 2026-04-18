"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import {
  getDefaultTranscriptionProvider,
  LANGUAGE_OPTIONS,
  TRANSCRIPTION_PROVIDER_LABELS,
  WHISPER_MODEL_OPTIONS,
} from "@/lib/transcription-options";
import { formatBytes, formatDate } from "@/lib/utils";
import { getDashboardStats, getSettings, startProcessing, uploadFile } from "@/services/api";
import type { DashboardStats, TranscriptionProvider } from "@/types/api";

const ACCEPTED_MEDIA = ".mp4,.mov,.mkv,.avi,.webm,.mp3,.wav,.m4a,.aac,.ogg,.flac";


export default function DashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickFile, setQuickFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("pt-BR");
  const [useApi, setUseApi] = useState(true);
  const [whisperModel, setWhisperModel] = useState("medium");
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider>("openai");
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    void getDashboardStats().then(setStats).catch((err: Error) => setStatsError(err.message));
    void getSettings()
      .then((settings) => {
        setLanguage(settings.preferred_language);
        setWhisperModel(settings.whisper_model);
        setTranscriptionProvider(getDefaultTranscriptionProvider(settings.transcription_provider_order));
      })
      .catch(() => undefined);
  }, []);

  const effectiveTranscriptionProvider: TranscriptionProvider = useApi ? transcriptionProvider : "whisper";
  const transcriptionProviderDescription = !useApi
    ? "Com APIs desligadas, o upload vai direto para o Whisper local."
    : transcriptionProvider === "whisper"
      ? "A transcrição começa direto no Whisper local selecionado."
      : `Primeira tentativa com ${TRANSCRIPTION_PROVIDER_LABELS[transcriptionProvider]}. Se essa API não estiver configurada ou falhar, o app continua com a ordem salva nas configurações.`;

  const handleQuickUpload = async () => {
    if (!quickFile) {
      setQuickError("Escolha um arquivo de áudio ou vídeo para iniciar.");
      return;
    }

    setBusy(true);
    setQuickError(null);
    setProgress(0);

    try {
      const upload = await uploadFile(quickFile, setProgress);
      await startProcessing(upload.id, {
        language,
        use_api: useApi,
        whisper_model: whisperModel,
        transcription_provider: effectiveTranscriptionProvider,
      });
      router.push(`/uploads/${upload.id}`);
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : "Falha ao iniciar o processamento.");
      setBusy(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    setQuickFile(droppedFile);
    setQuickError(null);
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-ink text-white shadow-panel">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(200,218,248,0.12),transparent_34%),radial-gradient(circle_at_75%_18%,rgba(26,58,143,0.40),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
        <div className="absolute -left-20 top-8 h-48 w-48 rounded-full bg-sand/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full bg-tide/20 blur-3xl" />
        <div className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[1.08fr_0.92fr] xl:p-10">
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sand">Pipeline local com IA</p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl xl:text-6xl">
                Transcreva e gere relatórios sem complicação.
              </h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className="inline-flex items-center rounded-full bg-sand px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#a8c8fd]" href="/uploads">
                Abrir fluxo completo
              </Link>
              <Link className="inline-flex items-center rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/5" href="/history">
                Ver histórico
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.6rem] border border-white/12 bg-white/6 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.25em] text-white/50">Processados</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats?.total_uploads ?? 0}</p>
              </div>
              <div className="rounded-[1.6rem] border border-white/12 bg-white/6 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.25em] text-white/50">Relatórios</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats?.total_reports ?? 0}</p>
              </div>
              <div className="rounded-[1.6rem] border border-white/12 bg-white/6 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-[0.25em] text-white/50">Engine</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats?.most_used_engine ?? "-"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/12 bg-white/8 p-5 backdrop-blur md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sand">Upload imediato</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Solte o arquivo e comece agora</h2>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/5"
              >
                Escolher arquivo
              </button>
            </div>

            <div
              className={`mt-5 rounded-[1.75rem] border-2 border-dashed p-6 transition ${
                dragActive ? "border-sand bg-sand/12" : "border-white/18 bg-black/10 hover:border-white/35"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept={ACCEPTED_MEDIA}
                onChange={(event) => {
                  setQuickFile(event.target.files?.[0] ?? null);
                  setQuickError(null);
                }}
              />

              <div className="space-y-3 text-center">
                <p className="text-xl font-semibold text-white">{dragActive ? "Solte o arquivo aqui" : "Arraste um áudio ou vídeo para a aplicação"}</p>
                <p className="text-sm leading-6 text-white/68">Suporte para MP4, MOV, MKV, AVI, WEBM, MP3, WAV, M4A, AAC, OGG e FLAC.</p>
              </div>

              {quickFile ? (
                <div className="mt-5 rounded-[1.4rem] border border-white/12 bg-white/8 p-4 text-sm text-white/78">
                  <p className="font-medium text-white">{quickFile.name}</p>
                  <p className="mt-1">{formatBytes(quickFile.size)}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Idioma preferido</label>
                <select
                  className="w-full rounded-2xl border border-white/15 bg-black/15 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-sand"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="text-ink">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Modelo Whisper</label>
                <select
                  className="w-full rounded-2xl border border-white/15 bg-black/15 px-4 py-3 text-white outline-none transition focus:border-sand"
                  value={whisperModel}
                  onChange={(event) => setWhisperModel(event.target.value)}
                >
                  {WHISPER_MODEL_OPTIONS.map((model) => (
                    <option key={model} value={model} className="text-ink">
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">IA para transcrever</label>
                <select
                  className="w-full rounded-2xl border border-white/15 bg-black/15 px-4 py-3 text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:border-sand"
                  value={transcriptionProvider}
                  onChange={(event) => setTranscriptionProvider(event.target.value as TranscriptionProvider)}
                  disabled={!useApi}
                >
                  {Object.entries(TRANSCRIPTION_PROVIDER_LABELS).map(([provider, label]) => (
                    <option key={provider} value={provider} className="text-ink">
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-6 text-white/62">{transcriptionProviderDescription}</p>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-white/12 bg-black/15 px-4 py-3 text-sm text-white/78">
                <input type="checkbox" checked={useApi} onChange={(event) => setUseApi(event.target.checked)} />
                <span className="font-medium text-white">Usar APIs externas quando disponíveis</span>
              </label>

              <button
                className="w-full rounded-2xl bg-sand px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#a8c8fd] disabled:cursor-not-allowed disabled:opacity-70"
                type="button"
                disabled={busy}
                onClick={() => void handleQuickUpload()}
              >
                {busy ? "Enviando e iniciando processamento..." : "Enviar e abrir acompanhamento"}
              </button>

              {busy ? (
                <div className="space-y-2">
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-sand transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-sm text-white/68">Upload em andamento: {progress}%</p>
                </div>
              ) : null}

              {quickError ? <p className="rounded-2xl bg-[#fff1ed] px-4 py-3 text-sm text-ember">{quickError}</p> : null}
            </div>
          </div>
        </div>
      </section>

      {statsError ? <div className="panel p-6 text-sm text-ember">{statsError}</div> : null}

      <section className="panel p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h3 className="text-xl font-semibold">Últimos processamentos</h3>
          <Link href="/history" className="button-secondary">Ver histórico</Link>
        </div>
        <div className="space-y-4">
          {stats?.recent_uploads.length ? (
            stats.recent_uploads.map((item) => (
              <Link
                key={item.id}
                href={`/uploads/${item.id}`}
                className="block rounded-[1.7rem] border border-black/6 bg-canvas/70 p-4 transition hover:border-tide/35 hover:bg-white"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-base font-semibold text-ink">{item.original_filename}</p>
                      <span className="rounded-full bg-sand/55 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ink/70">
                        {item.transcription_engine}
                      </span>
                    </div>
                    <p className="text-sm text-slate">{formatDate(item.created_at)} • {item.report_count} relatório(s)</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-[1.7rem] border border-dashed border-black/10 bg-canvas/55 p-6 text-sm text-slate">
              Nenhum processamento ainda.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
