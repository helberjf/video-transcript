"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import {
  getDefaultTranscriptionProvider,
  LANGUAGE_OPTIONS,
  TRANSCRIPTION_PROVIDER_LABELS,
  WHISPER_MODEL_OPTIONS,
} from "@/lib/transcription-options";
import { formatBytes, formatDuration } from "@/lib/utils";
import { getSettings, importRemoteMedia, startProcessing, uploadFile } from "@/services/api";
import type { RemoteMediaSource, TranscriptionProvider } from "@/types/api";
import { appendWorkspaceActivity } from "@/lib/workspace-store";

const TAB_CONTENT = {
  upload: {
    label: "Arquivo local",
    title: "Envie audio ou video do computador",
    description: "Ideal para arquivos ja salvos no disco.",
  },
  record: {
    label: "Gravar audio",
    title: "Grave pelo microfone e transcreva",
    description: "Perfeito para reunioes, ideias e ditados rapidos.",
  },
  youtube: {
    label: "YouTube",
    title: "Baixe um video do YouTube para processar",
    description: "Cole um link de video, short ou live.",
  },
  instagram: {
    label: "Instagram",
    title: "Baixe um video do Instagram para processar",
    description: "Cole um link de reel, post ou story.",
  },
} as const;

type UploadEntryMode = keyof typeof TAB_CONTENT;
type RecordingState = "idle" | "recording" | "ready";

const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function getRemoteSourceLabel(source: RemoteMediaSource): string {
  return source === "youtube" ? "YouTube" : "Instagram";
}

function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return RECORDING_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function getRecordingExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  return "webm";
}

export default function UploadPage() {
  const router = useRouter();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<UploadEntryMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [useApi, setUseApi] = useState(true);
  const [whisperModel, setWhisperModel] = useState("medium");
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider>("openai");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSettings()
      .then((settings) => {
        setLanguage(settings.preferred_language);
        setWhisperModel(settings.whisper_model);
        setTranscriptionProvider(getDefaultTranscriptionProvider(settings.transcription_provider_order));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (recordingState !== "recording") {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [recordingState]);

  useEffect(() => {
    return () => {
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    };
  }, [recordingUrl]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const effectiveTranscriptionProvider: TranscriptionProvider = useApi ? transcriptionProvider : "whisper";
  const transcriptionProviderDescription = !useApi
    ? "Com APIs desligadas, o processamento vai direto para o Whisper local selecionado."
    : transcriptionProvider === "whisper"
      ? "A transcricao comeca direto no Whisper local selecionado."
      : `Primeira tentativa com ${TRANSCRIPTION_PROVIDER_LABELS[transcriptionProvider]}. Se essa API nao estiver configurada ou falhar, o app segue a ordem salva nas configuracoes.`;

  const remoteSource: RemoteMediaSource | null = mode === "youtube" || mode === "instagram" ? mode : null;
  const remoteUrl = mode === "youtube" ? youtubeUrl : instagramUrl;
  const currentTab = TAB_CONTENT[mode];

  const processImportedUpload = async (uploadId: string) => {
    await startProcessing(uploadId, {
      language,
      use_api: useApi,
      whisper_model: whisperModel,
      transcription_provider: effectiveTranscriptionProvider,
    });
    router.push(`/uploads/${uploadId}?next=model`);
  };

  const submitMediaFile = async (mediaFile: File) => {
    setBusy(true);
    setProgress(0);
    setError(null);

    try {
      const upload = await uploadFile(mediaFile, setProgress);
      appendWorkspaceActivity({
        type: "upload",
        title: "Upload criado",
        description: `${mediaFile.name} foi enviado para gerar transcricao e relatorio.`,
        href: `/uploads/${upload.id}`,
      });
      await processImportedUpload(upload.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar processamento");
      setBusy(false);
    }
  };

  const submitLocal = async () => {
    if (!file) {
      setError("Selecione um arquivo de audio ou video.");
      return;
    }

    await submitMediaFile(file);
  };

  const submitRecording = async () => {
    if (!recordedFile) {
      setError("Grave um audio antes de enviar para transcricao.");
      return;
    }

    await submitMediaFile(recordedFile);
  };

  const discardRecording = () => {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }
    setRecordedFile(null);
    setRecordingUrl(null);
    setRecordingSeconds(0);
    setRecordingState("idle");
    setRecordingError(null);
    recordingChunksRef.current = [];
  };

  const startRecording = async () => {
    setError(null);
    setRecordingError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Este navegador nao oferece suporte a gravacao de audio.");
      return;
    }

    try {
      discardRecording();
      const mimeType = getSupportedRecordingMimeType();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalMimeType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: finalMimeType });
        const extension = getRecordingExtension(finalMimeType);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const nextFile = new File([blob], `gravacao-${timestamp}.${extension}`, { type: finalMimeType });
        const nextUrl = URL.createObjectURL(blob);

        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecordedFile(nextFile);
        setRecordingUrl(nextUrl);
        setRecordingState("ready");
      };

      recorder.start();
      setRecordingSeconds(0);
      setRecordingState("recording");
    } catch (err) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      setRecordingState("idle");
      setRecordingError(err instanceof Error ? err.message : "Nao foi possivel acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const submitRemote = async (source: RemoteMediaSource, url: string) => {
    if (!url.trim()) {
      setError(`Cole um link valido do ${getRemoteSourceLabel(source)}.`);
      return;
    }

    setBusy(true);
    setProgress(0);
    setError(null);

    try {
      const upload = await importRemoteMedia({
        source,
        url: url.trim(),
      });
      appendWorkspaceActivity({
        type: "upload",
        title: `Midia importada do ${getRemoteSourceLabel(source)}`,
        description: url.trim(),
        href: `/uploads/${upload.id}`,
      });
      await processImportedUpload(upload.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao baixar e iniciar processamento");
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (mode === "upload") {
      await submitLocal();
      return;
    }

    if (mode === "record") {
      await submitRecording();
      return;
    }

    await submitRemote(mode, remoteUrl);
  };

  const buttonLabel = busy
    ? mode === "upload"
      ? "Enviando e iniciando processamento..."
      : mode === "record"
        ? "Enviando gravacao e iniciando processamento..."
      : `Baixando do ${getRemoteSourceLabel(mode)} e iniciando processamento...`
    : mode === "upload"
      ? "Enviar arquivo"
      : mode === "record"
        ? "Enviar gravacao e transcrever"
      : `Baixar do ${getRemoteSourceLabel(mode)} e processar`;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Upload"
        title="Envie um arquivo ou importe um video por link"
        description="Use a aba de arquivo local ou puxe a midia direto do YouTube e do Instagram para entrar no mesmo pipeline de transcricao."
      />

      <div className="max-w-3xl">
        <section className="panel p-6">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(Object.entries(TAB_CONTENT) as Array<[UploadEntryMode, (typeof TAB_CONTENT)[UploadEntryMode]]>).map(([key, item]) => {
                const active = mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={recordingState === "recording" && key !== "record"}
                    onClick={() => {
                      setMode(key);
                      setError(null);
                    }}
                    className={`rounded-[1.4rem] border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                      active
                        ? "border-sand/40 bg-gradient-to-br from-sand/20 to-tide/20 text-ink shadow-panel"
                        : "border-white/10 bg-white/[0.04] text-slate hover:border-sand/35 hover:bg-white/[0.08] hover:text-ink"
                    }`}
                  >
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="mt-2 text-xs leading-5 text-slate">{item.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate">Origem da midia</p>
              <h3 className="mt-3 text-xl font-semibold text-ink">{currentTab.title}</h3>

              {mode === "upload" ? (
                <div key="upload-input" className="mt-4">
                  <label className="mb-2 block text-sm font-medium">Arquivo de midia</label>
                  <input
                    className="field"
                    type="file"
                    accept=".mp4,.mov,.mkv,.avi,.webm,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  {file ? <p className="mt-2 text-sm text-slate">{file.name} - {formatBytes(file.size)}</p> : null}
                </div>
              ) : mode === "record" ? (
                <div key="record-input" className="mt-4 space-y-4">
                  <div className="rounded-[1.4rem] border border-white/10 bg-midnight/35 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {recordingState === "recording" ? "Gravando agora" : recordedFile ? "Gravacao pronta" : "Microfone pronto"}
                        </p>
                        <p className="mt-1 text-sm text-slate">
                          {recordingState === "recording"
                            ? `Tempo gravado: ${formatDuration(recordingSeconds)}`
                            : recordedFile
                              ? `${recordedFile.name} - ${formatBytes(recordedFile.size)}`
                              : "Clique em iniciar e permita acesso ao microfone."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recordingState === "recording" ? (
                          <button className="button-danger" type="button" onClick={stopRecording}>
                            Parar gravacao
                          </button>
                        ) : (
                          <button className="button-secondary" type="button" disabled={busy} onClick={() => void startRecording()}>
                            {recordedFile ? "Gravar de novo" : "Iniciar gravacao"}
                          </button>
                        )}
                        {recordedFile ? (
                          <button className="button-secondary" type="button" disabled={busy || recordingState === "recording"} onClick={discardRecording}>
                            Descartar
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {recordingUrl ? (
                      <audio className="mt-4 w-full" controls src={recordingUrl} />
                    ) : null}
                  </div>
                  <p className="text-sm text-slate">
                    Ao enviar, a gravacao vira um upload normal: o backend normaliza o audio, transcreve e abre a tela para aplicar um modelo.
                  </p>
                  {recordingError ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{recordingError}</p> : null}
                </div>
              ) : (
                <div key={mode} className="mt-4 space-y-2">
                  <label className="block text-sm font-medium">Link do {getRemoteSourceLabel(remoteSource ?? "youtube")}</label>
                  <input
                    className="field"
                    type="url"
                    inputMode="url"
                    placeholder={
                      mode === "youtube"
                        ? "https://www.youtube.com/watch?v=..."
                        : "https://www.instagram.com/reel/..."
                    }
                    value={remoteUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (mode === "youtube") {
                        setYoutubeUrl(value);
                      } else {
                        setInstagramUrl(value);
                      }
                    }}
                  />
                  <p className="text-sm text-slate">
                    O backend baixa a midia com yt-dlp, cria o upload automaticamente e segue para a transcricao.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Idioma preferido</label>
              <select className="field" value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Modelo Whisper</label>
              <select className="field" value={whisperModel} onChange={(event) => setWhisperModel(event.target.value)}>
                {WHISPER_MODEL_OPTIONS.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">IA para transcrever</label>
              <select
                className="field"
                value={transcriptionProvider}
                onChange={(event) => setTranscriptionProvider(event.target.value as TranscriptionProvider)}
                disabled={!useApi}
              >
                {Object.entries(TRANSCRIPTION_PROVIDER_LABELS).map(([provider, label]) => (
                  <option key={provider} value={provider}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm leading-6 text-slate">{transcriptionProviderDescription}</p>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-ink">
              <input type="checkbox" checked={useApi} onChange={(event) => setUseApi(event.target.checked)} />
              Usar APIs externas quando disponiveis
            </label>

            <button className="button-primary w-full" type="button" disabled={busy || recordingState === "recording"} onClick={() => void handleSubmit()}>
              {buttonLabel}
            </button>

            {busy ? (
              mode === "upload" || mode === "record" ? (
                <div className="space-y-2">
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-tide transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-sm text-slate">Upload em andamento: {progress}%</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">
                  Baixando a midia remota e preparando o processamento. Isso pode levar alguns instantes.
                </div>
              )
            ) : null}

            {error ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate">
              Use apenas conteudo que voce tenha permissao para baixar e processar.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
