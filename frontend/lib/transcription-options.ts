import type { TranscriptionProvider } from "@/types/api";

export const WHISPER_MODEL_OPTIONS = ["tiny", "base", "small", "medium", "large"] as const;

export const LANGUAGE_OPTIONS = [
  { value: "pt-BR", label: "Portugues (Brasil)" },
  { value: "pt-PT", label: "Portugues (Portugal)" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Espanol" },
  { value: "fr-FR", label: "Francais" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
] as const;

export const TRANSCRIPTION_PROVIDER_LABELS: Record<TranscriptionProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  whisper: "Whisper local",
};

export function getDefaultTranscriptionProvider(order?: TranscriptionProvider[]): TranscriptionProvider {
  return order?.[0] ?? "openai";
}
