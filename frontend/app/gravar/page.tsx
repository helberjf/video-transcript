"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { LiveFeed } from "@/components/live-feed";
import { SectionHeader } from "@/components/section-header";
import { getDesktopRecordingBridge, type DesktopCaptureSource } from "@/lib/recording/desktop-bridge";
import { LiveAssistant, type LiveState } from "@/lib/recording/live-assistant";
import { MeetingRecorder } from "@/lib/recording/meeting-recorder";
import { LANGUAGE_OPTIONS } from "@/lib/transcription-options";
import {
  deleteCapture,
  finishRecording,
  getInterruptedRecordings,
  startRecording,
  updateCapture,
} from "@/services/api";
import type { MeetingAnalysisMode, MeetingCapture, UploadItem } from "@/types/api";

const LIVE_CONTEXT_STORAGE_KEY = "modeloia-live-context";
const EMPTY_LIVE_STATE: LiveState = { lines: [], suggestions: [], active: false, error: null };

type Phase = "setup" | "recording" | "review" | "sending";

interface LocalCapture {
  capture: MeetingCapture;
  previewUrl: string;
}

const CONSENT_NOTICE =
  "Aviso: esta reunião está sendo gravada para gerar a ata e os próximos passos. Se alguém preferir não ser gravado, me avise.";

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

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export default function GravarPage() {
  const router = useRouter();
  const bridge = getDesktopRecordingBridge();

  const [phase, setPhase] = useState<Phase>("setup");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [microphone, setMicrophone] = useState(true);
  const [captureScreens, setCaptureScreens] = useState(true);
  const [sceneChange, setSceneChange] = useState(true);
  const [intervalSeconds, setIntervalSeconds] = useState(0);
  const [consent, setConsent] = useState(false);
  const [sources, setSources] = useState<DesktopCaptureSource[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState<UploadItem[]>([]);

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
  const [analysisMode, setAnalysisMode] = useState<MeetingAnalysisMode>("audio_images");
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<MeetingRecorder["stop"]>> | null>(null);

  const [liveEnabled, setLiveEnabled] = useState(true);
  const [autoSuggest, setAutoSuggest] = useState(true);
  const [liveContext, setLiveContext] = useState("");
  const [liveState, setLiveState] = useState<LiveState>(EMPTY_LIVE_STATE);

  const recorderRef = useRef<MeetingRecorder | null>(null);
  const liveRef = useRef<LiveAssistant | null>(null);

  useEffect(() => {
    try {
      setLiveContext(window.localStorage.getItem(LIVE_CONTEXT_STORAGE_KEY) ?? "");
    } catch {
      // Sem localStorage o contexto só não fica salvo entre reuniões.
    }
  }, []);

  const updateLiveContext = (value: string) => {
    setLiveContext(value);
    liveRef.current?.setContext(value);
    try {
      window.localStorage.setItem(LIVE_CONTEXT_STORAGE_KEY, value);
    } catch {
      // Ignora: o contexto continua valendo para esta reunião.
    }
  };
  const silentSystemSince = useRef<number | null>(null);

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

  // Atalhos globais e prints do Windows chegam pelo Electron mesmo com a reuniao em primeiro plano.
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
      if (recorder && captureScreens) {
        void dataUrlToBlob(dataUrl).then((blob) => recorder.sendCapture(blob, "os_screenshot"));
      }
    });
    return () => {
      offHotkey();
      offScreenshot();
    };
  }, [bridge, phase, captureScreens]);

  // No navegador, Ctrl+V de uma imagem durante a gravacao vira captura.
  useEffect(() => {
    if (phase !== "recording" || !captureScreens) {
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
  }, [phase, captureScreens]);

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

  const systemWarning = (() => {
    if (phase !== "recording") {
      return null;
    }
    if (!hasSystemAudio) {
      return "sem áudio da reunião";
    }
    return null;
  })();

  const begin = async () => {
    setError(null);
    setNotice(null);
    if (!consent) {
      setError("Confirme que os participantes foram avisados da gravação.");
      return;
    }

    let display: MediaStream | null = null;
    try {
      if (bridge) {
        await bridge.selectSource(sourceId);
      }
      display = await MeetingRecorder.requestDisplay();
      const created = await startRecording({ title: title || undefined, language, capture_screens: captureScreens });
      const recorder = new MeetingRecorder({
        uploadId: created.id,
        microphone,
        captureScreens,
        sceneChangeCaptures: sceneChange,
        intervalSeconds,
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
      setLiveState(EMPTY_LIVE_STATE);
      if (liveEnabled) {
        const live = new LiveAssistant({ recorder, language, context: liveContext, autoSuggest, onChange: setLiveState });
        live.start();
        liveRef.current = live;
      }
      setHasSystemAudio(recorder.hasSystemAudio);
      setUploadId(created.id);
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

  const stop = async () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }
    liveRef.current?.stop();
    liveRef.current = null;
    setNotice("Enviando o final do áudio...");
    const stopped = await recorder.stop();
    await bridge?.setActive(false);
    recorderRef.current = null;
    setResult(stopped);
    setAnalysisMode(captures.length > 0 ? "audio_images" : "audio");
    setNotice(null);
    setPhase("review");
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

  const submit = async (id: string, mode: MeetingAnalysisMode, stopped: typeof result) => {
    setPhase("sending");
    setError(null);
    try {
      await finishRecording(id, {
        analysis_mode: mode,
        duration_seconds: stopped?.durationSeconds ?? 0,
        energy: stopped?.energy ?? [],
        markers: stopped?.markers ?? [],
        has_system_audio: stopped?.hasSystemAudio ?? false,
      });
      captures.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      router.push(`/uploads/${id}?resumo=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar a gravação");
      setPhase(stopped ? "review" : "setup");
    }
  };

  const toggleCapture = async (item: LocalCapture) => {
    const updated = await updateCapture(item.capture.id, !item.capture.included);
    setCaptures((current) => current.map((entry) => (entry.capture.id === updated.id ? { ...entry, capture: updated } : entry)));
  };

  const removeCapture = async (item: LocalCapture) => {
    await deleteCapture(item.capture.id);
    URL.revokeObjectURL(item.previewUrl);
    setCaptures((current) => current.filter((entry) => entry.capture.id !== item.capture.id));
  };

  const copyNotice = async () => {
    await navigator.clipboard.writeText(CONSENT_NOTICE);
    setNotice("Aviso copiado. Cole no chat da reunião.");
  };

  const systemSilent =
    phase === "recording" && hasSystemAudio && silentSystemSince.current !== null && performance.now() - silentSystemSince.current > 20_000;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Reuniões"
        title="Gravar reunião"
        description="Grava a sua voz e a dos participantes da videochamada, guarda capturas de tela e, no fim, a IA transcreve separando quem falou e gera a ata."
      />

      {error ? <p className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
      {notice ? <p className="rounded-lg border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">{notice}</p> : null}

      {phase === "setup" ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="panel space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-ink">Título</span>
                <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Daily do time de produto" />
              </label>
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-ink">Idioma</span>
                <select className="field" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {bridge ? (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">O que capturar</p>
                  <button className="text-xs text-sand hover:underline" type="button" onClick={() => void refreshSources()}>
                    Atualizar lista
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate">
                  O áudio da reunião vem do sistema inteiro (Teams, Zoom, Meet...). A escolha abaixo define só a imagem das capturas de tela.
                </p>
                <div className="mt-3 grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-3">
                  {sources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => setSourceId(source.id)}
                      className={`rounded-lg border p-2 text-left text-xs transition ${
                        source.id === sourceId ? "border-sand bg-sand/10 text-ink" : "border-white/10 text-slate hover:border-sand/40"
                      }`}
                    >
                      {source.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={source.thumbnail} alt="" className="mb-2 aspect-video w-full rounded object-cover" />
                      ) : null}
                      <span className="line-clamp-2">{source.isScreen ? `Tela: ${source.name}` : source.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate">
                Ao iniciar, o navegador vai perguntar o que compartilhar. Escolha a <strong className="text-ink">aba da reunião</strong> e marque{" "}
                <strong className="text-ink">&quot;Compartilhar áudio da guia&quot;</strong>, ou a tela inteira com áudio do sistema. Funciona no Chrome e no Edge.
              </p>
            )}

            <div className="space-y-3 text-sm text-ink">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={microphone} onChange={(event) => setMicrophone(event.target.checked)} />
                Gravar meu microfone (a minha voz)
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={captureScreens} onChange={(event) => setCaptureScreens(event.target.checked)} />
                Salvar capturas de tela durante a gravação
              </label>
              {captureScreens ? (
                <div className="ml-7 space-y-3 text-slate">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={sceneChange} onChange={(event) => setSceneChange(event.target.checked)} />
                    Capturar automaticamente quando a tela mudar (troca de slide)
                  </label>
                  <label className="flex items-center gap-3">
                    Capturar também a cada
                    <select className="field w-auto py-1" value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.target.value))}>
                      <option value={0}>nunca</option>
                      <option value={30}>30 s</option>
                      <option value={60}>1 min</option>
                      <option value={120}>2 min</option>
                    </select>
                  </label>
                  <p className="text-xs">
                    {bridge
                      ? "Durante a gravação: Ctrl+Shift+S captura a tela e Ctrl+Shift+M marca um momento, mesmo com a reunião em primeiro plano. Prints do Windows (Win+Shift+S) entram automaticamente."
                      : "Durante a gravação: use o botão Capturar ou cole uma imagem (Ctrl+V) nesta página."}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-6">
            <div className="panel space-y-3 p-6 text-sm">
              <label className="flex items-center gap-3 font-medium text-ink">
                <input type="checkbox" checked={liveEnabled} onChange={(event) => setLiveEnabled(event.target.checked)} />
                Modo ao vivo: transcrição em tempo real e sugestões da IA
              </label>
              {liveEnabled ? (
                <>
                  <label className="flex items-center gap-3 text-slate">
                    <input type="checkbox" checked={autoSuggest} onChange={(event) => setAutoSuggest(event.target.checked)} />
                    Sugerir resposta sozinho quando perguntarem algo
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-slate">Contexto para as sugestões (fica salvo neste computador)</span>
                    <textarea
                      className="field min-h-28 text-sm"
                      value={liveContext}
                      onChange={(event) => updateLiveContext(event.target.value)}
                      placeholder="Quem você é, o objetivo da reunião, números e argumentos que quer ter à mão. Ex.: Sou PM do app X; meta da reunião é aprovar o roadmap do Q4; prazo da API é 30/11."
                    />
                  </label>
                  <p className="text-xs text-slate">
                    Usa a chave da OpenAI ou do Gemini (uma transcrição a cada ~6 s de fala).
                    {bridge ? " Ctrl+Shift+A pede uma sugestão sem sair da reunião." : ""}
                  </p>
                </>
              ) : null}
            </div>

            <div className="panel space-y-4 p-6 text-sm">
              <p className="font-medium text-ink">Antes de começar</p>
              <ul className="list-disc space-y-1 pl-5 text-slate">
                <li>Use fone de ouvido: com caixa de som o microfone capta os outros e a separação de quem falou piora.</li>
                <li>Avise os participantes que a reunião está sendo gravada.</li>
              </ul>
              <button className="button-secondary w-full" type="button" onClick={() => void copyNotice()}>
                Copiar aviso para o chat da reunião
              </button>
              <label className="flex items-start gap-3 text-ink">
                <input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                Avisei os participantes que esta reunião está sendo gravada.
              </label>
              <button className="button-primary w-full" type="button" onClick={() => void begin()}>
                Iniciar gravação
              </button>
            </div>

            {interrupted.length > 0 ? (
              <div className="panel space-y-3 p-6 text-sm">
                <p className="font-medium text-ink">Gravações interrompidas</p>
                <p className="text-xs text-slate">O app fechou durante estas gravações. O áudio enviado até ali pode ser processado.</p>
                {interrupted.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                    <span className="truncate text-ink">{item.original_filename.replace(/\.webm$/, "")}</span>
                    <button className="button-secondary px-3 py-1 text-xs" type="button" onClick={() => void submit(item.id, "audio_images", null)}>
                      Processar
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === "recording" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="panel space-y-5 p-6">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${paused ? "bg-amber-300" : "animate-pulse bg-rose-400"}`} />
              <span className="font-[family-name:var(--font-display)] text-4xl font-semibold tabular-nums text-ink">{formatClock(elapsed)}</span>
              <span className="text-sm text-slate">{paused ? "pausado" : "gravando"}</span>
            </div>
            <LevelMeter label={micMuted ? "Microfone (silenciado)" : "Microfone (você)"} value={micMuted ? 0 : levels.mic} />
            <LevelMeter
              label="Áudio da reunião (participantes)"
              value={levels.system}
              warn={systemWarning ?? (systemSilent ? "sem som há 20 s" : null)}
            />
            <div className="flex flex-wrap gap-3">
              <button className="button-secondary" type="button" onClick={togglePause}>
                {paused ? "Retomar" : "Pausar"}
              </button>
              <button className="button-secondary" type="button" onClick={toggleMic}>
                {micMuted ? "Ativar microfone" : "Silenciar microfone"}
              </button>
              {captureScreens ? (
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => void recorderRef.current?.capture("manual")}
                  disabled={!recorderRef.current?.canCaptureScreen()}
                >
                  Capturar tela
                </button>
              ) : null}
              <button
                className="button-secondary"
                type="button"
                onClick={() => {
                  recorderRef.current?.addMarker();
                  setMarkerCount((count) => count + 1);
                }}
              >
                Marcar momento{markerCount ? ` (${markerCount})` : ""}
              </button>
              <button className="button-danger" type="button" onClick={() => void stop()}>
                Parar e revisar
              </button>
            </div>
            <p className="text-xs text-slate">{pending > 0 ? `Enviando ${pending} trecho(s) de áudio...` : "Áudio salvo até agora."}</p>
          </div>

          {liveRef.current ? (
            <div className="panel p-6 lg:row-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-ink">Ao vivo</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={autoSuggest}
                      onChange={(event) => {
                        setAutoSuggest(event.target.checked);
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

          <div className="panel p-6">
            <p className="text-sm font-medium text-ink">Capturas ({captures.length})</p>
            {captures.length === 0 ? (
              <p className="mt-3 text-sm text-slate">Nenhuma captura ainda.</p>
            ) : (
              <div className="mt-3 grid max-h-[28rem] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                {[...captures].reverse().map((item) => (
                  <figure key={item.capture.id} className="rounded-lg border border-white/10 p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt="" className="aspect-video w-full rounded object-cover" />
                    <figcaption className="mt-1 text-[11px] text-slate">{formatClock(item.capture.offset_seconds)}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {phase === "review" || phase === "sending" ? (
        <div className="space-y-6">
          <div className="panel space-y-4 p-6">
            <p className="text-sm text-slate">
              Gravação de <strong className="text-ink">{formatClock(result?.durationSeconds ?? 0)}</strong>
              {result && !result.hasSystemAudio ? " (só microfone)" : ""} com {captures.length} captura(s) de tela.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-lg border p-4 text-sm ${analysisMode === "audio" ? "border-sand bg-sand/10" : "border-white/10"}`}
              >
                <input type="radio" className="mr-2" checked={analysisMode === "audio"} onChange={() => setAnalysisMode("audio")} />
                <strong className="text-ink">Analisar só o áudio</strong>
                <span className="mt-1 block text-slate">As capturas ficam salvas, mas não entram na análise.</span>
              </label>
              <label
                className={`cursor-pointer rounded-lg border p-4 text-sm ${
                  analysisMode === "audio_images" ? "border-sand bg-sand/10" : "border-white/10"
                } ${captures.length === 0 ? "opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  className="mr-2"
                  disabled={captures.length === 0}
                  checked={analysisMode === "audio_images"}
                  onChange={() => setAnalysisMode("audio_images")}
                />
                <strong className="text-ink">Áudio + capturas de tela</strong>
                <span className="mt-1 block text-slate">A IA descreve cada tela e encaixa na linha do tempo da conversa.</span>
              </label>
            </div>
            <button
              className="button-primary"
              type="button"
              disabled={phase === "sending" || !uploadId}
              onClick={() => uploadId && void submit(uploadId, analysisMode, result)}
            >
              {phase === "sending" ? "Enviando..." : "Transcrever e gerar resumo"}
            </button>
          </div>

          {captures.length > 0 ? (
            <div className="panel p-6">
              <p className="text-sm font-medium text-ink">Capturas: desmarque as que não devem entrar na análise</p>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {captures.map((item) => (
                  <figure
                    key={item.capture.id}
                    className={`rounded-lg border p-2 ${item.capture.included ? "border-sand/40" : "border-white/10 opacity-50"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.previewUrl} alt="" className="aspect-video w-full rounded object-cover" />
                    <figcaption className="mt-2 flex items-center justify-between text-xs text-slate">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={item.capture.included} onChange={() => void toggleCapture(item)} />
                        {formatClock(item.capture.offset_seconds)}
                      </label>
                      <button className="text-rose-300 hover:underline" type="button" onClick={() => void removeCapture(item)}>
                        Excluir
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
