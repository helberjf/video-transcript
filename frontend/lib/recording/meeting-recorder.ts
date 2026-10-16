import { uploadRecordingCapture, uploadRecordingChunk } from "@/services/api";
import type { CaptureTrigger, MeetingCapture } from "@/types/api";

const CHUNK_INTERVAL_MS = 10_000;
const ENERGY_INTERVAL_MS = 250;
const SCENE_CHECK_INTERVAL_MS = 2_000;
const SCENE_CHANGE_THRESHOLD = 14;
const SCENE_MIN_GAP_MS = 8_000;
const UPLOAD_RETRIES = 4;
const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export interface RecorderOptions {
  uploadId: string;
  microphone: boolean;
  captureScreens: boolean;
  sceneChangeCaptures: boolean;
  intervalSeconds: number;
  onLevels?: (levels: { mic: number; system: number }) => void;
  onCapture?: (capture: { capture: MeetingCapture; previewUrl: string }) => void;
  onError?: (message: string) => void;
  onDisplayEnded?: () => void;
  onPendingChange?: (pending: number) => void;
}

export interface RecorderResult {
  durationSeconds: number;
  energy: number[][];
  markers: { offset_seconds: number; note?: string }[];
  hasSystemAudio: boolean;
}

export function rms(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    sum += buffer[index] * buffer[index];
  }
  return Math.sqrt(sum / buffer.length);
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Grava a reuniao: microfone (voce) + audio do sistema/aba (os outros) misturados num webm/opus
 * enviado em pedacos de 10 s. A energia de cada fonte vai junto para o backend saber quem falou.
 */
export class MeetingRecorder {
  private readonly options: RecorderOptions;
  private displayStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private micGain: GainNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private systemAnalyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private previousScene: Uint8ClampedArray | null = null;
  private lastSceneCaptureAt = 0;
  private timers: number[] = [];
  private sequence = 0;
  private uploadChain: Promise<void> = Promise.resolve();
  private pendingUploads = 0;
  private failedUploads = 0;
  private startedAt = 0;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private energy: number[][] = [];
  private markers: { offset_seconds: number; note?: string }[] = [];
  private micMuted = false;
  hasSystemAudio = false;

  constructor(options: RecorderOptions) {
    this.options = options;
  }

  /** O stream de tela precisa ser pedido no clique do usuario (exigencia do navegador). */
  static async requestDisplay(): Promise<MediaStream> {
    const constraints = {
      video: { frameRate: 5 },
      audio: true,
      systemAudio: "include",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    } as DisplayMediaStreamOptions;
    return navigator.mediaDevices.getDisplayMedia(constraints);
  }

  async start(displayStream: MediaStream): Promise<void> {
    this.displayStream = displayStream;
    const context = new AudioContext();
    this.audioContext = context;
    const destination = context.createMediaStreamDestination();
    destination.channelCount = 1;

    const systemTracks = displayStream.getAudioTracks();
    this.hasSystemAudio = systemTracks.length > 0;
    if (this.hasSystemAudio) {
      const systemSource = context.createMediaStreamSource(new MediaStream(systemTracks));
      this.systemAnalyser = context.createAnalyser();
      this.systemAnalyser.fftSize = 2048;
      systemSource.connect(this.systemAnalyser);
      systemSource.connect(destination);
    }

    if (this.options.microphone) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const micSource = context.createMediaStreamSource(this.micStream);
      this.micGain = context.createGain();
      this.micAnalyser = context.createAnalyser();
      this.micAnalyser.fftSize = 2048;
      micSource.connect(this.micGain);
      this.micGain.connect(this.micAnalyser);
      this.micGain.connect(destination);
    }

    if (!this.hasSystemAudio && !this.micStream) {
      throw new Error("Nenhuma fonte de audio disponivel: ative o microfone ou compartilhe o audio da reuniao.");
    }

    displayStream.getVideoTracks()[0]?.addEventListener("ended", () => this.options.onDisplayEnded?.());

    const mimeType = RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    this.recorder = new MediaRecorder(destination.stream, { mimeType, audioBitsPerSecond: 32_000 });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.enqueueChunk(this.sequence, event.data);
        this.sequence += 1;
      }
    };
    this.startedAt = performance.now();
    this.recorder.start(CHUNK_INTERVAL_MS);

    this.startEnergySampling();
    if (this.options.captureScreens && displayStream.getVideoTracks().length > 0) {
      await this.prepareFrameGrabber(displayStream);
      if (this.options.sceneChangeCaptures) {
        this.timers.push(window.setInterval(() => void this.checkSceneChange(), SCENE_CHECK_INTERVAL_MS));
      }
      if (this.options.intervalSeconds > 0) {
        this.timers.push(window.setInterval(() => void this.capture("interval"), this.options.intervalSeconds * 1000));
      }
    }
  }

  elapsedSeconds(): number {
    if (!this.startedAt) {
      return 0;
    }
    const now = this.pausedAt ?? performance.now();
    return Math.max(0, (now - this.startedAt - this.pausedTotal) / 1000);
  }

  get isPaused() {
    return this.pausedAt !== null;
  }

  pause() {
    if (this.recorder?.state === "recording") {
      this.recorder.pause();
      this.pausedAt = performance.now();
    }
  }

  resume() {
    if (this.recorder?.state === "paused" && this.pausedAt !== null) {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.pausedAt = null;
      this.recorder.resume();
    }
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    if (this.micGain) {
      this.micGain.gain.value = muted ? 0 : 1;
    }
  }

  get isMicMuted() {
    return this.micMuted;
  }

  /** Streams separados para o modo ao vivo: microfone = voce, sistema = participantes. */
  liveStreams(): { mic: MediaStream | null; system: MediaStream | null } {
    const systemTracks = this.displayStream?.getAudioTracks() ?? [];
    return {
      mic: this.micStream,
      system: systemTracks.length > 0 ? new MediaStream(systemTracks) : null,
    };
  }

  /** Energia media de uma fonte nos ultimos segundos (para pular janelas em silencio). */
  recentLevel(source: "mic" | "system", seconds: number): number {
    const since = this.elapsedSeconds() - seconds;
    const column = source === "mic" ? 1 : 2;
    const rows = this.energy.filter((row) => row[0] >= since);
    if (rows.length === 0) {
      return 0;
    }
    return rows.reduce((total, row) => total + row[column], 0) / rows.length;
  }

  addMarker(note?: string) {
    this.markers.push({ offset_seconds: Math.round(this.elapsedSeconds() * 10) / 10, note });
  }

  private startEnergySampling() {
    const micBuffer = new Float32Array(2048);
    const systemBuffer = new Float32Array(2048);
    this.timers.push(
      window.setInterval(() => {
        const mic = this.micAnalyser && !this.micMuted ? rms(this.micAnalyser, micBuffer) : 0;
        const system = this.systemAnalyser ? rms(this.systemAnalyser, systemBuffer) : 0;
        this.options.onLevels?.({ mic, system });
        if (!this.isPaused) {
          this.energy.push([Math.round(this.elapsedSeconds() * 100) / 100, Number(mic.toFixed(4)), Number(system.toFixed(4))]);
        }
      }, ENERGY_INTERVAL_MS),
    );
  }

  private enqueueChunk(sequence: number, blob: Blob) {
    this.pendingUploads += 1;
    this.options.onPendingChange?.(this.pendingUploads);
    this.uploadChain = this.uploadChain.then(async () => {
      for (let attempt = 1; attempt <= UPLOAD_RETRIES; attempt += 1) {
        try {
          await uploadRecordingChunk(this.options.uploadId, sequence, blob);
          break;
        } catch (error) {
          if (attempt === UPLOAD_RETRIES) {
            this.failedUploads += 1;
            this.options.onError?.(
              `Falha ao enviar um trecho do audio: ${error instanceof Error ? error.message : "erro desconhecido"}`,
            );
          } else {
            await wait(1500 * attempt);
          }
        }
      }
      this.pendingUploads -= 1;
      this.options.onPendingChange?.(this.pendingUploads);
    });
  }

  private async prepareFrameGrabber(stream: MediaStream) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream(stream.getVideoTracks());
    await video.play().catch(() => undefined);
    this.video = video;
    this.canvas = document.createElement("canvas");
  }

  private grabFrame(maxWidth = 1920): HTMLCanvasElement | null {
    const video = this.video;
    const canvas = this.canvas;
    if (!video || !canvas || !video.videoWidth) {
      return null;
    }
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /** Compara uma miniatura 32x18 em tons de cinza: troca de slide/tela muda bastante a media dos pixels. */
  private async checkSceneChange() {
    if (this.isPaused || !this.video?.videoWidth) {
      return;
    }
    const small = document.createElement("canvas");
    small.width = 32;
    small.height = 18;
    const context = small.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return;
    }
    context.drawImage(this.video, 0, 0, small.width, small.height);
    const pixels = context.getImageData(0, 0, small.width, small.height).data;
    const gray = new Uint8ClampedArray(small.width * small.height);
    for (let index = 0; index < gray.length; index += 1) {
      gray[index] = (pixels[index * 4] * 0.299 + pixels[index * 4 + 1] * 0.587 + pixels[index * 4 + 2] * 0.114) | 0;
    }
    const previous = this.previousScene;
    this.previousScene = gray;
    if (!previous) {
      return;
    }
    let difference = 0;
    for (let index = 0; index < gray.length; index += 1) {
      difference += Math.abs(gray[index] - previous[index]);
    }
    const meanDifference = difference / gray.length;
    if (meanDifference >= SCENE_CHANGE_THRESHOLD && performance.now() - this.lastSceneCaptureAt > SCENE_MIN_GAP_MS) {
      this.lastSceneCaptureAt = performance.now();
      await this.capture("scene_change");
    }
  }

  canCaptureScreen() {
    return Boolean(this.video?.videoWidth);
  }

  async capture(trigger: CaptureTrigger): Promise<void> {
    const canvas = this.grabFrame();
    if (!canvas) {
      this.options.onError?.("Nenhuma tela compartilhada para capturar.");
      return;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (blob) {
      await this.sendCapture(blob, trigger);
    }
  }

  async sendCapture(blob: Blob, trigger: CaptureTrigger, offsetSeconds = this.elapsedSeconds()): Promise<void> {
    try {
      const capture = await uploadRecordingCapture(this.options.uploadId, blob, offsetSeconds, trigger);
      this.options.onCapture?.({ capture, previewUrl: URL.createObjectURL(blob) });
    } catch (error) {
      this.options.onError?.(`Falha ao salvar a captura: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  }

  async stop(): Promise<RecorderResult> {
    const durationSeconds = this.elapsedSeconds();
    this.timers.forEach((timer) => window.clearInterval(timer));
    this.timers = [];

    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    await this.uploadChain;
    this.release();

    if (this.failedUploads > 0) {
      this.options.onError?.(`${this.failedUploads} trecho(s) de audio nao foram enviados; a transcricao pode ter lacunas.`);
    }
    return {
      durationSeconds,
      energy: this.energy,
      markers: this.markers,
      hasSystemAudio: this.hasSystemAudio,
    };
  }

  release() {
    this.timers.forEach((timer) => window.clearInterval(timer));
    this.timers = [];
    this.displayStream?.getTracks().forEach((track) => track.stop());
    this.micStream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close().catch(() => undefined);
    if (this.video) {
      this.video.srcObject = null;
    }
  }
}
