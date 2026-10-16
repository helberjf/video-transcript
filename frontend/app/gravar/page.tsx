"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { LiveFeed } from "@/components/live-feed";
import { getDesktopRecordingBridge, type DesktopCaptureSource } from "@/lib/recording/desktop-bridge";
import { LiveAssistant, type LiveState } from "@/lib/recording/live-assistant";
import { MeetingRecorder } from "@/lib/recording/meeting-recorder";
import { LANGUAGE_OPTIONS } from "@/lib/transcription-options";
import { finishRecording, getInterruptedRecordings, startRecording } from "@/services/api";
import type { MeetingCapture, UploadItem } from "@/types/api";

const LIVE_CONTEXT_STORAGE_KEY = "modeloia-live-context";
const OPTIONS_STORAGE_KEY = "modeloia-recording-options";
const EMPTY_LIVE_STATE: LiveState = { lines: [], suggestions: [], active: false, error: null };

type Phase = "setup" | "recording" | "sending";

interface LocalCapture {
  capture: MeetingCapture;
  previewUrl: string;
}

interface RecordingOptions {
  language: string;
  microphone: boolean;
  captureScreens: boolean;
  sceneChange: boolean;
  intervalSeconds: number;
  liveEnabled: boolean;
  autoSuggest: boolean;
}

// Tudo ligado por padrão: o usuário só aperta "Iniciar gravação".
const DEFAULT_OPTIONS: RecordingOptions = {
  language: "pt-BR",
  microphone: true,
  captureScreens: true,
  sceneChange: true,
  intervalSeconds: 0,
  liveEnabled: true,
  autoSuggest: true,
};

const CONSENT_NOTICE =
  "Aviso: esta reunião está sendo gravada para gerar o resumo e o checklist de próximos passos. Se alguém preferir não ser gravado, me avise.";

function formatClock(totalSeconds: number) {
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function LevelMeter({ label, value, warn }: { label: string; value: number; warn?: string | null }) {
  const percent = Math.min(100, Math.round(Math.sqrt(value) * 220));
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate">
        <span>{label}</span>
        {warn ? <span className="text-amber-200">{warn}</span> : null}
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-sand transition-[width] duration-150" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StepPill({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        active ? "border-sand/50 bg-sand/15 text-sand" : done ? "border-emerald-300/30 text-emerald-200" : "border-white/10 text-slate"
      }`}
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10">{done ? "✓" : number}</span>
      {label}
    </li>
  );
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export default function GravarPage() {
  const router = useRouter();
  const bridge = getDesktopRecordingBridge();

  const [phase, setPhase] = useState<Phase>("setup");
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<RecordingOptions>(DEFAULT_OPTIONS);
  const [sources, setSources] = useState<DesktopCaptureSource[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState<UploadItem[]>([]);
  const [liveContext, setLiveContext] = useState("");

  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState({ mic: 0, system: 0 });
  const [paused, setPaused] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [pending, setPending] = useState(0);
  const [hasSystemAudio, setHasSystemAudio] = useState(true);
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [markerCount, setMarkerCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveState>(EMPTY_LIVE_STATE);

  const recorderRef = useRef<MeetingRecorder | null>(null);
  const liveRef = useRef<LiveAssistant | null>(null);
  const uploadIdRef = useRef<string | null>(null);
  const silentSystemSince = useRef<number | null>(null);

  useEffect(() => {
    setOptions(readStored(OPTIONS_STORAGE_KEY, DEFAULT_OPTIONS));
    try {
      setLiveContext(window.localStorage.getItem(LIVE_CONTEXT_STORAGE_KEY) ?? "");
    } catch {
      // Sem localStorage as preferências só não ficam salvas entre reuniões.
    }
  }, []);

  const updateOptions = (patch: Partial<RecordingOptions>) => {
    setOptions((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignora: as opções continuam valendo para esta reunião.
      }
      return next;
    });
  };

  const updateLiveContext = (value: string) => {
    setLiveContext(value);
    liveRef.current?.setContext(value);
    try {
      window.localStorage.setItem(LIVE_CONTEXT_STORAGE_KEY, value);
    } catch {
      // Ignora: o contexto continua valendo para esta reunião.
    }
  };

  const refreshSources = useCallback(async () => {
    if (!bridge) {
      return;
    }
    const list = await bridge.listSources();
    setSources(list);
    setSourceId((current) => current ?? list.find((source) => source.isScreen)?.id ?? list[0]?.id ?? null);
  }, [bridge]);

  useEffect(() => {
    void refreshSources();
    void getInterruptedRecordings()
      .then(setInterrupted)
      .catch(() => setInterrupted([]));
  }, [refreshSources]);

  useEffect(() => {
    if (phase !== "recording") {
      return;
    }
    const timer = window.setInterval(() => setElapsed(recorderRef.current?.elapsedSeconds() ?? 0), 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Atalhos globais e prints do Windows chegam pelo Electron mesmo com a reunião em primeiro plano.
  useEffect(() => {
    if (!bridge || phase !== "recording") {
      return;
    }
    const offHotkey = bridge.onHotkey(({ action }) => {
      if (action === "capture") {
        void recorderRef.current?.capture("hotkey");
      } else if (action === "assist") {
        void liveRef.current?.suggest(undefined, "atalho");
      } else {
        recorderRef.current?.addMarker();
        setMarkerCount((count) => count + 1);
        setNotice("Momento marcado.");
      }
    });
    const offScreenshot = bridge.onOsScreenshot(({ dataUrl }) => {
      const recorder = recorderRef.current;
      if (recorder && options.captureScreens) {
        void dataUrlToBlob(dataUrl).then((blob) => recorder.sendCapture(blob, "os_screenshot"));
      }
    });
    return () => {
      offHotkey();
      offScreenshot();
    };
  }, [bridge, phase, options.captureScreens]);

  // No navegador, Ctrl+V de uma imagem durante a gravação vira captura.
  useEffect(() => {
    if (phase !== "recording" || !options.captureScreens) {
      return;
    }
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (file) {
        void recorderRef.current?.sendCapture(file, "paste");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [phase, options.captureScreens]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (phase === "recording") {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);

  useEffect(
    () => () => {
      liveRef.current?.stop();
      recorderRef.current?.release();
    },
    [],
  );

  // Clique 2: começa a gravar com as opções salvas.
  const begin = async () => {
    setError(null);
    setNotice(null);
    let display: MediaStream | null = null;
    try {
      if (bridge) {
        await bridge.selectSource(sourceId);
      }
      display = await MeetingRecorder.requestDisplay();
      const created = await startRecording({
        title: title || undefined,
        language: options.language,
        capture_screens: options.captureScreens,
      });
      const recorder = new MeetingRecorder({
        uploadId: created.id,
        microphone: options.microphone,
        captureScreens: options.captureScreens,
        sceneChangeCaptures: options.sceneChange,
        intervalSeconds: options.intervalSeconds,
        onLevels: (value) => {
          setLevels(value);
          if (value.system > 0.002) {
            silentSystemSince.current = null;
          } else if (silentSystemSince.current === null) {
            silentSystemSince.current = performance.now();
          }
        },
        onCapture: (item) => setCaptures((current) => [...current, item]),
        onError: (message) => setError(message),
        onPendingChange: setPending,
        onDisplayEnded: () =>
          setNotice("O compartilhamento de tela foi encerrado. O microfone continua gravando; pare quando terminar."),
      });
      await recorder.start(display);
      recorderRef.current = recorder;
      uploadIdRef.current = created.id;
      setLiveState(EMPTY_LIVE_STATE);
      if (options.liveEnabled) {
        const live = new LiveAssistant({
          recorder,
          language: options.language,
          context: liveContext,
          autoSuggest: options.autoSuggest,
          onChange: setLiveState,
        });
        live.start();
        liveRef.current = live;
      }
      setHasSystemAudio(recorder.hasSystemAudio);
      setCaptures([]);
      setMarkerCount(0);
      setElapsed(0);
      setPaused(false);
      setMicMuted(false);
      setPhase("recording");
      await bridge?.setActive(true);
      if (!recorder.hasSystemAudio) {
        setNotice(
          bridge
            ? "O áudio do sistema não foi capturado. Só o microfone está sendo gravado."
            : 'O áudio da reunião não veio junto. No Chrome/Edge, compartilhe a aba da reunião marcando "Compartilhar áudio da guia".',
        );
      }
    } catch (err) {
      display?.getTracks().forEach((track) => track.stop());
      recorderRef.current?.release();
      recorderRef.current = null;
      const message = err instanceof Error ? err.message : "Falha ao iniciar a gravação";
      setError(message.includes("Permission denied") ? "Permissão negada para capturar a tela ou o microfone." : message);
    }
  };

  const processMeeting = async (id: string, stopped: Awaited<ReturnType<MeetingRecorder["stop"]>> | null, hasCaptures: boolean) => {
    setPhase("sending");
    setError(null);
    try {
      await finishRecording(id, {
        analysis_mode: hasCaptures ? "audio_images" : "audio",
        duration_seconds: stopped?.durationSeconds ?? 0,
        energy: stopped?.energy ?? [],
        markers: stopped?.markers ?? [],
        has_system_audio: stopped?.hasSystemAudio ?? false,
      });
      captures.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      router.push(`/uploads/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar a gravação");
      setPhase("setup");
    }
  };

  // Clique 3: para, envia o fim do áudio e já manda a IA resumir e montar o checklist.
  const stopAndSummarize = async () => {
    const recorder = recorderRef.current;
    const id = uploadIdRef.current;
    if (!recorder || !id) {
      return;
    }
    liveRef.current?.stop();
    liveRef.current = null;
    setPhase("sending");
    setNotice("Enviando o final do áudio...");
    const stopped = await recorder.stop();
    await bridge?.setActive(false);
    recorderRef.current = null;
    await processMeeting(id, stopped, captures.some((item) => item.capture.included));
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }
    if (recorder.isPaused) {
      recorder.resume();
      setPaused(false);
    } else {
      recorder.pause();
      setPaused(true);
    }
  };

  const toggleMic = () => {
    const next = !micMuted;
    recorderRef.current?.setMicMuted(next);
    setMicMuted(next);
  };

  const copyNotice = async () => {
    await navigator.clipboard.writeText(CONSENT_NOTICE);
    setNotice("Aviso copiado. Cole no chat da reunião.");
  };

  const systemSilent =
    phase === "recording" && hasSystemAudio && silentSystemSince.current !== null && performance.now() - silentSystemSince.current > 20_000;

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        <StepPill number={1} label="Gravar reunião" active={false} done />
        <StepPill number={2} label="Iniciar gravação" active={phase === "setup"} done={phase !== "setup"} />
        <StepPill number={3} label="Parar e resumir" active={phase === "recording"} done={phase === "sending"} />
        <StepPill number={4} label="Resumo + checklist prontos" active={phase === "sending"} done={false} />
      </ol>

      {error ? <p className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">{notice}</p> : null}

      {phase === "setup" ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="panel space-y-6 p-6 sm:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sand">Reunião</p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink">
                Grave a reunião. A IA resume e monta o checklist.
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate">
                {bridge
                  ? "Grava a sua voz e a dos participantes (Teams, Zoom, Meet...). Ao parar, você recebe o resumo, as decisões e as tarefas com responsável e prazo, e pode tirar dúvidas sobre o que foi dito."
                  : 'Ao iniciar, escolha a aba da reunião e marque "Compartilhar áudio da guia" (Chrome/Edge). Ao parar, você recebe o resumo, as decisões e as tarefas, e pode tirar dúvidas sobre o que foi dito.'}
              </p>
            </div>

            <input
              className="field"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título (opcional): a IA dá um nome se ficar em branco"
            />

            <button className="button-primary w-full py-4 text-lg" type="button" onClick={() => void begin()}>
              ● Iniciar gravação
            </button>

            <p className="text-xs leading-5 text-slate">
              Avise os participantes que a reunião está sendo gravada.{" "}
              <button className="text-sand hover:underline" type="button" onClick={() => void copyNotice()}>
                Copiar aviso para o chat
              </button>
              . Use fone de ouvido para a IA separar melhor quem falou.
            </p>
          </div>

          <div className="space-y-6">
            <details className="panel group p-6 text-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-ink">
                Opções
                <span className="text-xs text-slate group-open:hidden">
                  {[
                    options.microphone ? "microfone" : null,
                    options.captureScreens ? "capturas de tela" : null,
                    options.liveEnabled ? "ao vivo" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </summary>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-slate">Idioma</span>
                  <select className="field" value={options.language} onChange={(event) => updateOptions({ language: event.target.value })}>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-3 text-ink">
                  <input type="checkbox" checked={options.microphone} onChange={(event) => updateOptions({ microphone: event.target.checked })} />
                  Gravar meu microfone (a minha voz)
                </label>
                <label className="flex items-center gap-3 text-ink">
                  <input
                    type="checkbox"
                    checked={options.captureScreens}
                    onChange={(event) => updateOptions({ captureScreens: event.target.checked })}
                  />
                  Salvar capturas de tela
                </label>
                {options.captureScreens ? (
                  <div className="ml-7 space-y-3 text-slate">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={options.sceneChange} onChange={(event) => updateOptions({ sceneChange: event.target.checked })} />
                      Capturar sozinho quando a tela mudar (troca de slide)
                    </label>
                    <label className="flex items-center gap-3">
                      Também a cada
                      <select
                        className="field w-auto py-1"
                        value={options.intervalSeconds}
                        onChange={(event) => updateOptions({ intervalSeconds: Number(event.target.value) })}
                      >
                        <option value={0}>nunca</option>
                        <option value={30}>30 s</option>
                        <option value={60}>1 min</option>
                        <option value={120}>2 min</option>
                      </select>
                    </label>
                    <p className="text-xs">
                      {bridge
                        ? "Ctrl+Shift+S captura a tela e Ctrl+Shift+M marca um momento, mesmo com a reunião em primeiro plano. Prints do Windows entram sozinhos."
                        : "Durante a gravação: botão Capturar ou cole uma imagem (Ctrl+V) nesta página."}
                    </p>
                  </div>
                ) : null}
                <label className="flex items-center gap-3 text-ink">
                  <input type="checkbox" checked={options.liveEnabled} onChange={(event) => updateOptions({ liveEnabled: event.target.checked })} />
                  Modo ao vivo: transcrição em tempo real e sugestões de resposta
                </label>
                {options.liveEnabled ? (
                  <div className="ml-7 space-y-3 text-slate">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={options.autoSuggest} onChange={(event) => updateOptions({ autoSuggest: event.target.checked })} />
                      Sugerir resposta sozinho quando perguntarem algo
                    </label>
                    <textarea
                      className="field min-h-24 text-sm"
                      value={liveContext}
                      onChange={(event) => updateLiveContext(event.target.value)}
                      placeholder="Contexto para as sugestões (fica salvo): quem você é, objetivo da reunião, números à mão."
                    />
                    {bridge ? <p className="text-xs">Ctrl+Shift+A pede uma sugestão sem sair da reunião.</p> : null}
                  </div>
                ) : null}
                {bridge ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-slate">Tela das capturas</p>
                      <button className="text-xs text-sand hover:underline" type="button" onClick={() => void refreshSources()}>
                        Atualizar lista
                      </button>
                    </div>
                    <div className="mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                      {sources.map((source) => (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => setSourceId(source.id)}
                          className={`rounded-lg border p-1.5 text-left text-[11px] transition ${
                            source.id === sourceId ? "border-sand bg-sand/10 text-ink" : "border-white/10 text-slate hover:border-sand/40"
                          }`}
                        >
                          {source.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={source.thumbnail} alt="" className="mb-1 aspect-video w-full rounded object-cover" />
                          ) : null}
                          <span className="line-clamp-1">{source.isScreen ? `Tela: ${source.name}` : source.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>

            {interrupted.length > 0 ? (
              <div className="panel space-y-3 p-6 text-sm">
                <p className="font-medium text-ink">Gravações interrompidas</p>
                <p className="text-xs text-slate">O app fechou durante estas gravações. Dá para resumir o que foi gravado até ali.</p>
                {interrupted.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                    <span className="truncate text-ink">{item.original_filename.replace(/\.webm$/, "")}</span>
                    <button className="button-secondary px-3 py-1 text-xs" type="button" onClick={() => void processMeeting(item.id, null, true)}>
                      Resumir
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === "recording" || phase === "sending" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="panel space-y-5 p-6">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${paused ? "bg-amber-300" : "animate-pulse bg-rose-400"}`} />
              <span className="font-[family-name:var(--font-display)] text-4xl font-semibold tabular-nums text-ink">{formatClock(elapsed)}</span>
              <span className="text-sm text-slate">{phase === "sending" ? "finalizando" : paused ? "pausado" : "gravando"}</span>
            </div>
            <LevelMeter label={micMuted ? "Microfone (silenciado)" : "Microfone (você)"} value={micMuted ? 0 : levels.mic} />
            <LevelMeter
              label="Áudio da reunião (participantes)"
              value={levels.system}
              warn={!hasSystemAudio ? "sem áudio da reunião" : systemSilent ? "sem som há 20 s" : null}
            />

            <button
              className="button-primary w-full py-4 text-lg"
              type="button"
              disabled={phase === "sending"}
              onClick={() => void stopAndSummarize()}
            >
              {phase === "sending" ? "Enviando para a IA..." : "■ Parar e resumir"}
            </button>

            <div className="flex flex-wrap gap-2">
              <button className="button-secondary px-3 py-1.5 text-sm" type="button" disabled={phase === "sending"} onClick={togglePause}>
                {paused ? "Retomar" : "Pausar"}
              </button>
              <button className="button-secondary px-3 py-1.5 text-sm" type="button" disabled={phase === "sending"} onClick={toggleMic}>
                {micMuted ? "Ativar microfone" : "Silenciar microfone"}
              </button>
              {options.captureScreens ? (
                <button
                  className="button-secondary px-3 py-1.5 text-sm"
                  type="button"
                  onClick={() => void recorderRef.current?.capture("manual")}
                  disabled={phase === "sending" || !recorderRef.current?.canCaptureScreen()}
                >
                  Capturar tela
                </button>
              ) : null}
              <button
                className="button-secondary px-3 py-1.5 text-sm"
                type="button"
                disabled={phase === "sending"}
                onClick={() => {
                  recorderRef.current?.addMarker();
                  setMarkerCount((count) => count + 1);
                }}
              >
                Marcar momento{markerCount ? ` (${markerCount})` : ""}
              </button>
            </div>
            <p className="text-xs text-slate">
              {pending > 0 ? `Enviando ${pending} trecho(s) de áudio...` : "Áudio salvo até agora."}
              {captures.length > 0 ? ` ${captures.length} captura(s) de tela.` : ""}
            </p>
            {captures.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {captures.slice(-8).map((item) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={item.capture.id} src={item.previewUrl} alt="" className="aspect-video w-full rounded object-cover" />
                ))}
              </div>
            ) : null}
          </div>

          {options.liveEnabled ? (
            <div className="panel p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">Ao vivo</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={options.autoSuggest}
                      onChange={(event) => {
                        updateOptions({ autoSuggest: event.target.checked });
                        liveRef.current?.setAutoSuggest(event.target.checked);
                      }}
                    />
                    sugerir sozinho
                  </label>
                  <button
                    className="button-secondary px-3 py-1 text-xs"
                    type="button"
                    onClick={() => {
                      if (bridge?.openLiveOverlay) {
                        void bridge.openLiveOverlay();
                      } else {
                        window.open("/ao-vivo", "modeloia-ao-vivo", "width=440,height=680");
                      }
                    }}
                  >
                    Abrir janela flutuante
                  </button>
                </div>
              </div>
              <LiveFeed state={liveState} onSuggest={(focus) => void liveRef.current?.suggest(focus)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
