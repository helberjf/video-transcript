"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchProtectedObjectUrl, getUploadCaptures, renameSpeakers, reprocessRecording, updateCapture } from "@/services/api";
import type { MeetingCapture, UploadItem } from "@/types/api";

const SPEAKER_COLORS = ["text-sky-300", "text-emerald-300", "text-amber-300", "text-fuchsia-300", "text-rose-300", "text-teal-300"];

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

function CaptureImage({ capture }: { capture: MeetingCapture }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    void fetchProtectedObjectUrl(`/captures/${capture.id}/image`)
      .then((value) => {
        url = value;
        setSrc(value);
      })
      .catch(() => setSrc(null));
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [capture.id]);

  if (!src) {
    return <div className="aspect-video w-full animate-pulse rounded bg-white/5" />;
  }
  return (
    <a href={src} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="aspect-video w-full rounded object-cover" />
    </a>
  );
}

/** Visão de reunião gravada: interlocutores editáveis, falas por pessoa, áudio e capturas. */
export function MeetingPanel({ upload, onUploadChange }: { upload: UploadItem; onUploadChange?: (upload: UploadItem) => void }) {
  const speakers = upload.speakers ?? [];
  const segments = upload.transcript_segments ?? [];
  const [names, setNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [captures, setCaptures] = useState<MeetingCapture[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setNames(Object.fromEntries(speakers.map((speaker) => [speaker.label, speaker.name])));
  }, [upload.speakers]);

  useEffect(() => {
    void getUploadCaptures(upload.id)
      .then(setCaptures)
      .catch(() => setCaptures([]));
  }, [upload.id, upload.status]);

  const colorByLabel = useMemo(
    () => Object.fromEntries(speakers.map((speaker, index) => [speaker.label, SPEAKER_COLORS[index % SPEAKER_COLORS.length]])),
    [speakers],
  );
  const nameByLabel = useMemo(() => Object.fromEntries(speakers.map((speaker) => [speaker.label, speaker.name])), [speakers]);

  // Junta falas seguidas da mesma pessoa para a leitura ficar parecida com uma conversa.
  const turns = useMemo(() => {
    const result: { speaker: string; start: number; text: string }[] = [];
    for (const segment of segments) {
      const last = result[result.length - 1];
      if (last && last.speaker === segment.speaker) {
        last.text = `${last.text} ${segment.text}`;
      } else {
        result.push({ speaker: segment.speaker, start: segment.start, text: segment.text });
      }
    }
    return result;
  }, [segments]);

  const loadAudio = async () => {
    if (audioUrl) {
      return audioUrl;
    }
    const url = await fetchProtectedObjectUrl(`/uploads/${upload.id}/media`);
    setAudioUrl(url);
    return url;
  };

  useEffect(
    () => () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    },
    [audioUrl],
  );

  const playAt = async (seconds: number) => {
    await loadAudio();
    window.setTimeout(() => {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = seconds;
        void audio.play();
      }
    }, 50);
  };

  const saveNames = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await renameSpeakers(upload.id, names);
      onUploadChange?.(updated);
      setMessage("Nomes salvos. A transcrição já usa os novos nomes; gere o resumo de novo para atualizá-lo.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao salvar os nomes");
    } finally {
      setSaving(false);
    }
  };

  const toggleCapture = async (capture: MeetingCapture) => {
    const updated = await updateCapture(capture.id, !capture.included);
    setCaptures((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  };

  const reanalyze = async () => {
    setMessage(null);
    await reprocessRecording(upload.id, captures.some((capture) => capture.included) ? "audio_images" : "audio");
    // O acompanhamento da página para quando o processo termina; recarregar volta a acompanhar.
    window.location.reload();
  };

  if (segments.length === 0 && captures.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 space-y-6">
      {speakers.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-midnight/40 p-4">
          <p className="font-medium text-ink">Interlocutores</p>
          <p className="mt-1 text-sm text-slate">
            A IA separou as vozes e sugeriu nomes quando a conversa deixou claro. Corrija o que estiver errado.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {speakers.map((speaker) => (
              <label key={speaker.label} className="block text-sm">
                <span className={`mb-1 block text-xs font-semibold ${colorByLabel[speaker.label]}`}>
                  Voz {speaker.label}
                  {speaker.is_self ? " · identificada como você (microfone)" : ""}
                  {speaker.suggested_name ? " · nome sugerido pela IA" : ""}
                </span>
                <input
                  className="field"
                  value={names[speaker.label] ?? ""}
                  onChange={(event) => setNames((current) => ({ ...current, [speaker.label]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <button className="button-secondary mt-4" type="button" disabled={saving} onClick={() => void saveNames()}>
            {saving ? "Salvando..." : "Salvar nomes"}
          </button>
          {message ? <p className="mt-3 text-sm text-slate">{message}</p> : null}
        </div>
      ) : null}

      {turns.length > 0 ? (
        <details className="group rounded-xl border border-white/10 bg-midnight/40 p-4" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="font-medium text-ink">Conversa por interlocutor</span>
            <button className="button-secondary px-3 py-1 text-xs" type="button" onClick={() => void loadAudio()}>
              Carregar áudio
            </button>
          </summary>
          {audioUrl ? <audio ref={audioRef} src={audioUrl} controls className="mt-4 w-full" /> : null}
          <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto border-t border-white/10 pt-4 text-sm leading-7">
            {turns.map((turn, index) => (
              <p key={`${turn.start}-${index}`}>
                <button
                  type="button"
                  className="mr-2 font-mono text-xs text-slate hover:text-sand"
                  title="Ouvir a partir daqui"
                  onClick={() => void playAt(turn.start)}
                >
                  {formatClock(turn.start)}
                </button>
                <strong className={colorByLabel[turn.speaker] ?? "text-ink"}>{nameByLabel[turn.speaker] ?? turn.speaker}:</strong>{" "}
                <span className="text-ink">{turn.text}</span>
              </p>
            ))}
          </div>
        </details>
      ) : null}

      {captures.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-midnight/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium text-ink">Capturas de tela ({captures.length})</p>
            <button className="button-secondary px-3 py-1 text-xs" type="button" onClick={() => void reanalyze()}>
              Reanalisar com as capturas marcadas
            </button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {captures.map((capture) => (
              <figure
                key={capture.id}
                className={`rounded-lg border p-2 ${capture.included && !capture.is_duplicate ? "border-sand/30" : "border-white/10 opacity-60"}`}
              >
                <CaptureImage capture={capture} />
                <figcaption className="mt-2 space-y-1 text-xs text-slate">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={capture.included} onChange={() => void toggleCapture(capture)} />
                    <button type="button" className="font-mono hover:text-sand" onClick={() => void playAt(capture.offset_seconds)}>
                      {formatClock(capture.offset_seconds)}
                    </button>
                    {capture.is_duplicate ? <span>(repetida)</span> : null}
                  </label>
                  {capture.description ? <p className="line-clamp-4 text-slate">{capture.description}</p> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
