"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import {
  getDefaultTranscriptionProvider,
  LANGUAGE_OPTIONS,
  TRANSCRIPTION_PROVIDER_LABELS,
  WHISPER_MODEL_OPTIONS,
} from "@/lib/transcription-options";
import { formatBytes } from "@/lib/utils";
import { getSettings, startProcessing, uploadFile } from "@/services/api";
import type { TranscriptionProvider } from "@/types/api";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
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

  const effectiveTranscriptionProvider: TranscriptionProvider = useApi ? transcriptionProvider : "whisper";
  const transcriptionProviderDescription = !useApi
    ? "Com APIs desligadas, o processamento vai direto para o Whisper local selecionado."
    : transcriptionProvider === "whisper"
      ? "A transcrição começa direto no Whisper local selecionado."
      : `Primeira tentativa com ${TRANSCRIPTION_PROVIDER_LABELS[transcriptionProvider]}. Se essa API não estiver configurada ou falhar, o app segue a ordem salva nas configurações.`;

  const submit = async () => {
    if (!file) {
      setError("Selecione um arquivo de áudio ou vídeo.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const upload = await uploadFile(file, setProgress);
      await startProcessing(upload.id, {
        language,
        use_api: useApi,
        whisper_model: whisperModel,
        transcription_provider: effectiveTranscriptionProvider,
      });
      router.push(`/uploads/${upload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar processamento");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Upload"
        title="Envie a mídia e dispare o pipeline"
        description="Escolha o arquivo, configure o idioma e o modelo Whisper, e envie."
      />

      <div className="max-w-2xl">
        <section className="panel p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium">Arquivo de mídia</label>
              <input
                className="field"
                type="file"
                accept=".mp4,.mov,.mkv,.avi,.webm,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              {file ? <p className="mt-2 text-sm text-slate">{file.name} • {formatBytes(file.size)}</p> : null}
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
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-ink">
              <input type="checkbox" checked={useApi} onChange={(event) => setUseApi(event.target.checked)} />
              Usar APIs externas quando disponíveis
            </label>
            <button className="button-primary w-full" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? "Enviando e iniciando processamento..." : "Enviar arquivo"}
            </button>
            {busy ? (
              <div className="space-y-2">
                <div className="h-3 overflow-hidden rounded-full bg-black/5">
                  <div className="h-full rounded-full bg-tide transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-sm text-slate">Upload em andamento: {progress}%</p>
              </div>
            ) : null}
            {error ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
