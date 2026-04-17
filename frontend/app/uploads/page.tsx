"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { formatBytes } from "@/lib/utils";
import { startProcessing, uploadFile } from "@/services/api";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("pt-BR");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) {
      setError("Selecione um arquivo de áudio ou vídeo.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const upload = await uploadFile(file, setProgress);
      await startProcessing(upload.id, language);
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
        description="Vídeos são convertidos para MP3 de alta qualidade; áudios são normalizados antes da transcrição. O backend executa o fallback OpenAI → Gemini → Whisper automaticamente."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
              <input className="field" value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="pt-BR" />
            </div>
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

        <section className="panel p-6">
          <h3 className="text-xl font-semibold">O que acontece depois</h3>
          <div className="mt-5 space-y-4 text-sm text-slate">
            <div className="rounded-3xl bg-canvas/80 p-4">
              <p className="font-medium text-ink">1. Validação</p>
              <p className="mt-1">O backend valida extensão, MIME type e tamanho antes de persistir o arquivo.</p>
            </div>
            <div className="rounded-3xl bg-canvas/80 p-4">
              <p className="font-medium text-ink">2. Conversão e normalização</p>
              <p className="mt-1">Vídeos viram MP3 em 320 kbps, 44.1 kHz, estéreo. Áudios podem ser normalizados para o mesmo padrão.</p>
            </div>
            <div className="rounded-3xl bg-canvas/80 p-4">
              <p className="font-medium text-ink">3. Transcrição com fallback</p>
              <p className="mt-1">OpenAI primeiro, Gemini se falhar e Whisper local como última opção.</p>
            </div>
            <div className="rounded-3xl bg-canvas/80 p-4">
              <p className="font-medium text-ink">4. Relatórios</p>
              <p className="mt-1">Depois da transcrição, você escolhe um modelo e gera o relatório a partir do texto final.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
