import { liveSuggest, liveTranscribe } from "@/services/api";

import type { MeetingRecorder } from "./meeting-recorder";

const WINDOW_MS = 6_000;
const SILENCE_LEVEL = 0.004;
const AUTO_SUGGEST_GAP_MS = 15_000;
const AUTO_SUGGEST_DELAY_MS = 1_500;
const MAX_LINES_FOR_SUGGESTION = 80;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm"];
export const LIVE_CHANNEL = "modeloia-live";

export type LiveSource = "mic" | "system";

export interface LiveLine {
  id: string;
  source: LiveSource;
  speaker: string;
  text: string;
  at: number;
}

export interface LiveSuggestion {
  id: string;
  at: number;
  text: string;
  status: "loading" | "ready" | "error";
  trigger: string;
}

export interface LiveState {
  lines: LiveLine[];
  suggestions: LiveSuggestion[];
  active: boolean;
  error: string | null;
}

/** Mensagens trocadas com a janela flutuante (mesma origem, via BroadcastChannel). */
export type LiveMessage =
  | { type: "state"; state: LiveState }
  | { type: "request-state" }
  | { type: "suggest"; focus?: string };

const QUESTION_START =
  /^(qual|quais|quando|onde|como|por que|porque|quem|quanto|quantos|quantas|o que|voce|você|pode|poderia|consegue|tem|ja|já|me conta|fala|explica|what|why|how|when|where|who|can|could|do you|did you|tell me)\b/i;

export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith("?") || QUESTION_START.test(trimmed);
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Copiloto ao vivo: grava janelas curtas e independentes de cada fonte (microfone = "Você",
 * sistema = "Participante"), transcreve cada uma e pede sugestões de resposta à IA.
 */
export class LiveAssistant {
  private readonly recorder: MeetingRecorder;
  private readonly language: string;
  private context: string;
  private autoSuggest: boolean;
  private readonly onChange: (state: LiveState) => void;
  private state: LiveState = { lines: [], suggestions: [], active: false, error: null };
  private loops: MediaRecorder[] = [];
  private stopped = false;
  private lastText: Record<LiveSource, string> = { mic: "", system: "" };
  private lastSuggestionAt = 0;
  private autoTimer: number | null = null;
  private channel: BroadcastChannel | null = null;

  constructor(options: {
    recorder: MeetingRecorder;
    language: string;
    context: string;
    autoSuggest: boolean;
    onChange: (state: LiveState) => void;
  }) {
    this.recorder = options.recorder;
    this.language = options.language;
    this.context = options.context;
    this.autoSuggest = options.autoSuggest;
    this.onChange = options.onChange;
  }

  start() {
    this.stopped = false;
    const streams = this.recorder.liveStreams();
    if (streams.mic) {
      this.runLoop("mic", streams.mic);
    }
    if (streams.system) {
      this.runLoop("system", streams.system);
    }
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(LIVE_CHANNEL);
      this.channel.onmessage = (event: MessageEvent<LiveMessage>) => {
        if (event.data.type === "request-state") {
          this.publish();
        } else if (event.data.type === "suggest") {
          void this.suggest(event.data.focus, "janela flutuante");
        }
      };
    }
    this.update({ active: true, error: null });
  }

  stop() {
    this.stopped = true;
    this.loops.forEach((loop) => {
      if (loop.state !== "inactive") {
        loop.stop();
      }
    });
    this.loops = [];
    if (this.autoTimer) {
      window.clearTimeout(this.autoTimer);
    }
    this.update({ active: false });
    this.channel?.close();
    this.channel = null;
  }

  setContext(context: string) {
    this.context = context;
  }

  setAutoSuggest(enabled: boolean) {
    this.autoSuggest = enabled;
  }

  getState() {
    return this.state;
  }

  private update(partial: Partial<LiveState>) {
    this.state = { ...this.state, ...partial };
    this.publish();
  }

  private publish() {
    this.onChange(this.state);
    this.channel?.postMessage({ type: "state", state: this.state } satisfies LiveMessage);
  }

  /** Cada janela é um webm completo (MediaRecorder novo), então pode ser transcrita sozinha. */
  private runLoop(source: LiveSource, stream: MediaStream) {
    if (this.stopped) {
      return;
    }
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
    const parts: Blob[] = [];
    const startedAt = this.recorder.elapsedSeconds();
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        parts.push(event.data);
      }
    };
    recorder.onstop = () => {
      this.loops = this.loops.filter((item) => item !== recorder);
      if (!this.stopped) {
        this.runLoop(source, stream);
      }
      void this.handleWindow(source, new Blob(parts, { type: mimeType ?? "audio/webm" }), startedAt);
    };
    this.loops.push(recorder);
    recorder.start();
    window.setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, WINDOW_MS);
  }

  private async handleWindow(source: LiveSource, blob: Blob, startedAt: number) {
    if (blob.size < 1000 || this.recorder.isPaused) {
      return;
    }
    if (source === "mic" && this.recorder.isMicMuted) {
      return;
    }
    // Pula janelas em silêncio: economiza chamadas e evita frases inventadas pelo modelo.
    if (this.recorder.recentLevel(source, WINDOW_MS / 1000) < SILENCE_LEVEL) {
      return;
    }
    try {
      const { text } = await liveTranscribe(blob, this.language, this.lastText[source]);
      if (!text) {
        return;
      }
      this.lastText[source] = text;
      const line: LiveLine = {
        id: nextId(),
        source,
        speaker: source === "mic" ? "Você" : "Participante",
        text,
        at: startedAt,
      };
      const lines = [...this.state.lines, line].sort((left, right) => left.at - right.at);
      this.update({ lines, error: null });
      if (source === "system" && this.autoSuggest && looksLikeQuestion(text)) {
        this.scheduleAutoSuggest();
      }
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "Falha na transcrição ao vivo" });
    }
  }

  private scheduleAutoSuggest() {
    if (Date.now() - this.lastSuggestionAt < AUTO_SUGGEST_GAP_MS) {
      return;
    }
    if (this.autoTimer) {
      window.clearTimeout(this.autoTimer);
    }
    // Espera um pouco: a pergunta costuma continuar na próxima janela.
    this.autoTimer = window.setTimeout(() => void this.suggest(undefined, "pergunta detectada"), AUTO_SUGGEST_DELAY_MS);
  }

  async suggest(focus?: string, trigger = "pedido manual") {
    this.lastSuggestionAt = Date.now();
    const suggestion: LiveSuggestion = {
      id: nextId(),
      at: this.recorder.elapsedSeconds(),
      text: "",
      status: "loading",
      trigger,
    };
    this.update({ suggestions: [suggestion, ...this.state.suggestions] });
    const replace = (patch: Partial<LiveSuggestion>) =>
      this.update({
        suggestions: this.state.suggestions.map((item) => (item.id === suggestion.id ? { ...item, ...patch } : item)),
      });
    try {
      const lines = this.state.lines.slice(-MAX_LINES_FOR_SUGGESTION).map((line) => ({ speaker: line.speaker, text: line.text }));
      const response = await liveSuggest({ lines, context: this.context || undefined, focus });
      replace({ text: response.suggestion, status: "ready" });
    } catch (error) {
      replace({ text: error instanceof Error ? error.message : "Falha ao gerar sugestão", status: "error" });
    }
  }
}
