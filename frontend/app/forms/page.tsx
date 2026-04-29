"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import {
  SelectableWords,
  normalizeSelectableWord,
  tokenizeSelectableWords,
  type SelectableWordToken,
} from "@/components/selectable-words";
import { formatBytes } from "@/lib/utils";
import { appendWorkspaceActivity } from "@/lib/workspace-store";
import {
  detectFormFields,
  exportForm,
  fillForm,
  fillFormByFields,
  getSettings,
  getTemplates,
  getUpload,
  startProcessing,
  uploadFile,
} from "@/services/api";
import type {
  FormFieldSpec,
  FormFillResponse,
  ReportExportExtension,
  ReportTemplate,
  SettingsRead,
} from "@/types/api";

const ACCEPTED_AUDIO = ".mp3,.wav,.m4a,.aac,.ogg,.flac,.webm";
const SOURCE_WORD_KEY_PREFIX = "form-source";
const EXPORT_OPTIONS: { extension: ReportExportExtension; label: string }[] = [
  { extension: "md", label: "Markdown" },
  { extension: "txt", label: "TXT" },
  { extension: "docx", label: "Word (.docx)" },
  { extension: "pdf", label: "PDF" },
];

type Mode = "fields" | "text" | "audio";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function extensionForAudioMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function htmlInputTypeFor(fieldType: FormFieldSpec["type"]): string {
  if (fieldType === "date") return "date";
  if (fieldType === "number") return "number";
  return "text";
}

function composeValueFromSelectedWords(tokens: SelectableWordToken[], selectedKeys: string[]): string {
  const selected = new Set(selectedKeys);
  return tokens
    .filter((token) => selected.has(token.key))
    .map((token) => token.value)
    .join(" ");
}

function sortSelectedWordKeys(tokens: SelectableWordToken[], keys: Iterable<string>): string[] {
  const order = new Map(tokens.map((token) => [token.key, token.index]));
  return [...keys].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}

function normalizedWordsFromText(text: string): string[] {
  return tokenizeSelectableWords(text, "detected-value")
    .map((token) => normalizeSelectableWord(token.value))
    .filter(Boolean);
}

function findTokenKeysForValue(tokens: SelectableWordToken[], value: string): string[] {
  const targetWords = normalizedWordsFromText(value);
  if (!targetWords.length) {
    return [];
  }

  const normalizedTokens = tokens.map((token) => normalizeSelectableWord(token.value));
  for (let start = 0; start <= normalizedTokens.length - targetWords.length; start += 1) {
    const matches = targetWords.every((word, offset) => normalizedTokens[start + offset] === word);
    if (matches) {
      return tokens.slice(start, start + targetWords.length).map((token) => token.key);
    }
  }

  const fallbackKeys: string[] = [];
  let cursor = 0;
  for (const word of targetWords) {
    const matchIndex = normalizedTokens.findIndex((candidate, index) => index >= cursor && candidate === word);
    if (matchIndex === -1) {
      continue;
    }
    fallbackKeys.push(tokens[matchIndex].key);
    cursor = matchIndex + 1;
  }
  return fallbackKeys;
}

function buildDetectedSelections(
  tokens: SelectableWordToken[],
  fields: FormFieldSpec[],
  values: Record<string, string>,
): Record<string, string[]> {
  const selections: Record<string, string[]> = {};
  for (const field of fields) {
    const value = values[field.key]?.trim();
    if (!value) {
      continue;
    }
    const keys = findTokenKeysForValue(tokens, value);
    if (keys.length) {
      selections[field.key] = keys;
    }
  }
  return selections;
}

export default function FormsPage() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const skipSourceTextResetRef = useRef(false);
  const skipModeResetRef = useRef(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [mode, setMode] = useState<Mode>("fields");
  const [sourceText, setSourceText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [recordedAudioFile, setRecordedAudioFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [title, setTitle] = useState("Documento preenchido");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const [sourceSelections, setSourceSelections] = useState<Record<string, string[]>>({});
  const [aiPolish, setAiPolish] = useState(true);
  const [detectingFields, setDetectingFields] = useState(false);
  const [detectingAudioFields, setDetectingAudioFields] = useState(false);
  const [detectMessage, setDetectMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<FormFillResponse | null>(null);
  const [reviewedContent, setReviewedContent] = useState("");
  const [reviewApproved, setReviewApproved] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<ReportExportExtension | null>(null);

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const stopRecordingStream = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  useEffect(() => {
    void Promise.all([getTemplates(), getSettings()])
      .then(([templateData, settingsData]) => {
        setTemplates(templateData);
        setSettings(settingsData);
        const preferredTemplateId = settingsData.default_report_template_id ?? templateData[0]?.id ?? "";
        setTemplateId(preferredTemplateId);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    return () => {
      stopRecordingTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }
      stopRecordingStream();
    };
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templates, templateId],
  );

  const templateFields = selectedTemplate?.form_fields ?? [];
  const templateFieldKeys = templateFields.map((field) => field.key).join("|");
  const sourceWordTokens = useMemo(() => tokenizeSelectableWords(sourceText, SOURCE_WORD_KEY_PREFIX), [sourceText]);
  const selectedSourceKeys = useMemo(
    () => new Set(Object.values(sourceSelections).flat()),
    [sourceSelections],
  );
  const fieldDetectionBusy = detectingFields || detectingAudioFields;

  useEffect(() => {
    if (skipModeResetRef.current) {
      skipModeResetRef.current = false;
      return;
    }

    setFieldValues((current) => {
      const next: Record<string, string> = {};
      for (const field of templateFields) {
        next[field.key] = current[field.key] ?? "";
      }
      return next;
    });
    setActiveFieldKey((current) =>
      templateFields.some((field) => field.key === current) ? current : templateFields[0]?.key ?? null,
    );
    setSourceSelections({});
    setDetectMessage(null);
    if (templateFields.length === 0 && mode === "fields") {
      setMode("text");
    }
  }, [templateId, templateFieldKeys, templateFields.length, mode]);

  useEffect(() => {
    if (skipSourceTextResetRef.current) {
      skipSourceTextResetRef.current = false;
      return;
    }

    setSourceSelections({});
    setDetectMessage(null);
  }, [sourceText]);

  const waitForTranscription = async (uploadId: string): Promise<string> => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const upload = await getUpload(uploadId);
      if (upload.transcription_text?.trim()) {
        return upload.transcription_text;
      }
      if (upload.status === "error") {
        throw new Error(upload.error_message ?? "Falha ao transcrever o audio.");
      }
      setStatusMessage(`Transcrevendo audio... tentativa ${attempt + 1}`);
      await wait(2000);
    }

    throw new Error("A transcricao demorou mais que o esperado. Abra o historico para acompanhar o processamento.");
  };

  const transcribeAudioFile = async (file: File): Promise<string> => {
    setStatusMessage("Enviando audio...");
    setProgress(0);
    const upload = await uploadFile(file, setProgress);
    setStatusMessage("Audio enviado. Iniciando transcricao...");
    await startProcessing(upload.id, {
      language: settings?.preferred_language ?? "pt-BR",
      use_api: true,
      whisper_model: settings?.whisper_model ?? "medium",
    });
    return waitForTranscription(upload.id);
  };

  const startRecording = async () => {
    setError(null);
    setDetectMessage(null);
    setStatusMessage(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Este navegador nao permite gravar audio direto nesta pagina.");
      return;
    }

    try {
      stopRecordingTimer();
      stopRecordingStream();
      recordingChunksRef.current = [];
      setRecordedAudioFile(null);
      setAudioFile(null);
      setProgress(0);
      setRecordingSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopRecordingTimer();
        setIsRecording(false);
        stopRecordingStream();

        if (!recordingChunksRef.current.length) {
          setError("A gravacao terminou sem audio capturado.");
          return;
        }

        const type = recorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(recordingChunksRef.current, { type });
        const extension = extensionForAudioMimeType(type);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = new File([audioBlob], `gravacao-formulario-${timestamp}.${extension}`, { type });
        setRecordedAudioFile(file);
        setAudioFile(file);
        setStatusMessage("Gravacao pronta. A IA ja pode reconhecer os campos desse audio.");
      };

      recorder.start();
      setIsRecording(true);
      setStatusMessage("Gravando audio...");
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (err) {
      stopRecordingTimer();
      stopRecordingStream();
      setIsRecording(false);
      setError(err instanceof Error ? err.message : "Nao foi possivel acessar o microfone.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    setStatusMessage("Finalizando gravacao...");
    recorder.stop();
  };

  const resolveSourceText = async (): Promise<string> => {
    if (mode === "text") {
      if (!sourceText.trim()) {
        throw new Error("Digite ou cole um texto para preencher o formulario.");
      }
      return sourceText.trim();
    }

    if (!audioFile) {
      throw new Error("Escolha um arquivo de audio para preencher o formulario.");
    }

    return transcribeAudioFile(audioFile);
  };

  const toggleSourceWord = (token: SelectableWordToken) => {
    if (!activeFieldKey) {
      setError("Escolha um campo do formulario antes de selecionar palavras.");
      return;
    }

    setError(null);
    const currentKeys = new Set(sourceSelections[activeFieldKey] ?? []);
    if (currentKeys.has(token.key)) {
      currentKeys.delete(token.key);
    } else {
      currentKeys.add(token.key);
    }
    const nextKeys = sortSelectedWordKeys(sourceWordTokens, currentKeys);
    setSourceSelections((current) => ({ ...current, [activeFieldKey]: nextKeys }));
    setFieldValues((current) => ({
      ...current,
      [activeFieldKey]: composeValueFromSelectedWords(sourceWordTokens, nextKeys),
    }));
  };

  const applyDetectedFields = (
    detectedFields: Record<string, string>,
    tokens: SelectableWordToken[],
  ): number => {
    setFieldValues((current) => {
      const next = { ...current };
      for (const field of templateFields) {
        const value = detectedFields[field.key]?.trim();
        if (value) {
          next[field.key] = value;
        }
      }
      return next;
    });
    setSourceSelections(buildDetectedSelections(tokens, templateFields, detectedFields));
    return templateFields.filter((field) => detectedFields[field.key]?.trim()).length;
  };

  const detectFieldsFromDocument = async () => {
    if (!templateId) {
      setError("Escolha um modelo antes de detectar campos.");
      return;
    }
    if (!sourceText.trim()) {
      setError("Cole um documento ou texto base para detectar os campos.");
      return;
    }
    if (templateFields.length === 0) {
      setError("Este modelo ainda nao tem campos definidos.");
      return;
    }

    setDetectingFields(true);
    setError(null);
    setDetectMessage(null);
    try {
      const detected = await detectFormFields({
        template_id: templateId,
        source_text: sourceText.trim(),
        additional_instructions: additionalInstructions || null,
      });
      const filledCount = applyDetectedFields(detected.fields, sourceWordTokens);
      const source = detected.generator_engine === "none" ? "leitura local" : "IA";
      setDetectMessage(`${filledCount} campo(s) sugerido(s) por ${source}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao detectar campos.");
    } finally {
      setDetectingFields(false);
    }
  };

  const detectFieldsFromAudio = async (file: File | null) => {
    if (!templateId) {
      setError("Escolha um modelo antes de reconhecer campos pelo audio.");
      return;
    }
    if (!file) {
      setError("Grave ou escolha um arquivo de audio antes de reconhecer os campos.");
      return;
    }
    if (templateFields.length === 0) {
      setError("Este modelo ainda nao tem campos definidos.");
      return;
    }

    setDetectingAudioFields(true);
    setError(null);
    setResult(null);
    setDetectMessage(null);
    try {
      const transcription = (await transcribeAudioFile(file)).trim();
      if (!transcription) {
        throw new Error("A transcricao do audio ficou vazia.");
      }

      setStatusMessage("Audio transcrito. A IA esta reconhecendo os campos...");
      const detected = await detectFormFields({
        template_id: templateId,
        source_text: transcription,
        additional_instructions: additionalInstructions || null,
      });
      const transcriptionTokens = tokenizeSelectableWords(transcription, SOURCE_WORD_KEY_PREFIX);

      if (mode !== "fields") {
        skipModeResetRef.current = true;
        setMode("fields");
      }
      if (transcription !== sourceText) {
        skipSourceTextResetRef.current = true;
        setSourceText(transcription);
      }

      const filledCount = applyDetectedFields(detected.fields, transcriptionTokens);
      const source = detected.generator_engine === "none" ? "leitura local" : "IA";
      setDetectMessage(`${filledCount} campo(s) preenchido(s) pelo audio por ${source}.`);
      setStatusMessage("Campos preenchidos pelo audio. Revise e gere o documento pronto.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao reconhecer campos pelo audio.");
      setStatusMessage(null);
    } finally {
      setDetectingAudioFields(false);
    }
  };

  const submit = async () => {
    if (!templateId) {
      setError("Escolha um modelo antes de preencher.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    setReviewedContent("");
    setReviewApproved(false);
    setCopyMessage(null);

    try {
      if (mode === "fields") {
        if (templateFields.length === 0) {
          throw new Error("Este modelo ainda nao tem campos definidos. Edite o modelo na pagina Modelos ou use o modo Texto.");
        }
        const missing = templateFields
          .filter((field) => field.required && !(fieldValues[field.key] ?? "").trim())
          .map((field) => field.label);
        if (missing.length > 0) {
          throw new Error(`Preencha os campos obrigatorios: ${missing.join(", ")}`);
        }
        setStatusMessage(aiPolish ? "Gerando sugestao com IA..." : "Montando documento...");
        const filled = await fillFormByFields({
          template_id: templateId,
          title,
          fields: fieldValues,
          additional_instructions: additionalInstructions || null,
          ai_polish: aiPolish,
        });
        setResult(filled);
        setReviewedContent(filled.content);
        setReviewApproved(false);
        appendWorkspaceActivity({
          type: "form",
          title: "Documento preenchido",
          description: `${filled.title} foi gerado e aguarda revisao humana.`,
          href: "/forms",
        });
        setStatusMessage("Documento pronto para revisar.");
        return;
      }

      const resolvedText = await resolveSourceText();
      setStatusMessage("Gerando sugestao de preenchimento...");
      const filled = await fillForm({
        template_id: templateId,
        source_text: resolvedText,
        title,
        additional_instructions: additionalInstructions || null,
      });
      setResult(filled);
      setReviewedContent(filled.content);
      setReviewApproved(false);
      appendWorkspaceActivity({
        type: "form",
        title: "Sugestao de documento gerada",
        description: `${filled.title} foi criada a partir de texto ou audio.`,
        href: "/forms",
      });
      setStatusMessage("Sugestao pronta para revisar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao preencher formulario.");
      setStatusMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const copyResult = async () => {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(reviewedContent || result.content);
    setCopyMessage("Conteudo copiado.");
  };

  const download = async (extension: ReportExportExtension) => {
    if (!result) {
      return;
    }
    if (!reviewApproved) {
      setError("Revise e aprove o documento antes de exportar.");
      return;
    }
    setDownloading(extension);
    try {
      const { blob, filename } = await exportForm({
        title: result.title,
        content: reviewedContent || result.content,
        extension,
      });
      appendWorkspaceActivity({
        type: "export",
        title: "Documento exportado",
        description: `${result.title} foi exportado em ${extension.toUpperCase()} apos revisao.`,
        href: "/forms",
      });
      triggerDownload(blob, filename ?? `${result.title || "formulario"}.${extension}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao baixar documento.");
    } finally {
      setDownloading(null);
    }
  };

  const availableModes: { id: Mode; label: string; description: string; disabled?: boolean }[] = [
    {
      id: "fields",
      label: "Campos",
      description: "Preencha so o que muda.",
      disabled: templateFields.length === 0,
    },
    { id: "text", label: "Texto", description: "Cole as informacoes do formulario." },
    { id: "audio", label: "Audio", description: "Grave ou envie para transcrever." },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Formularios"
        title="Preencha documentos por campos, texto ou audio"
        description="Escolha um modelo, preencha os campos variaveis (ou envie texto/audio), e a IA sugere um documento pronto para revisao e download."
      />

      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="panel p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium">Modelo de documento</label>
              <select className="field" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="" className="text-midnight">
                  Escolha um modelo
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id} className="text-midnight">
                    {template.name}
                  </option>
                ))}
              </select>
              {selectedTemplate ? (
                <p className="mt-2 text-sm leading-6 text-slate">
                  {selectedTemplate.description} - {selectedTemplate.category}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Titulo do documento</label>
              <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {availableModes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    mode === item.id
                      ? "border-sand/40 bg-sand/10 text-ink"
                      : "border-white/10 bg-white/[0.04] text-slate hover:border-sand/35 hover:text-ink"
                  } ${item.disabled ? "cursor-not-allowed opacity-40 hover:border-white/10 hover:text-slate" : ""}`}
                  onClick={() => {
                    if (item.disabled) return;
                    setMode(item.id);
                    setError(null);
                  }}
                >
                  <span className="font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs text-slate">{item.description}</span>
                </button>
              ))}
            </div>

            {mode === "fields" ? (
              <div className="space-y-4">
                {templateFields.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate">
                    Este modelo nao tem campos variaveis definidos. Edite-o na pagina Modelos para incluir um formulario, ou use o modo Texto/Audio.
                  </p>
                ) : (
                  <>
                    <div className="rounded-3xl border border-sand/20 bg-sand/[0.06] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Audio para campos</p>
                          <p className="mt-2 text-sm leading-6 text-slate">
                            Grave ou envie um audio; a IA transcreve e coloca cada resposta no campo certo.
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-midnight/45 px-3 py-1 text-xs font-medium text-sand">
                          {isRecording ? `Gravando ${formatDuration(recordingSeconds)}` : audioFile ? "Audio pronto" : "Sem audio"}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          className="button-secondary"
                          type="button"
                          disabled={isRecording || fieldDetectionBusy || busy}
                          onClick={() => void startRecording()}
                        >
                          Iniciar gravacao
                        </button>
                        <button
                          className="button-secondary"
                          type="button"
                          disabled={!isRecording}
                          onClick={stopRecording}
                        >
                          Parar gravacao
                        </button>
                        <button
                          className="button-secondary"
                          type="button"
                          disabled={!audioFile || isRecording || fieldDetectionBusy || busy}
                          onClick={() => void detectFieldsFromAudio(audioFile)}
                        >
                          {detectingAudioFields ? "Reconhecendo..." : "IA reconhecer e preencher"}
                        </button>
                      </div>
                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-medium">Enviar audio</label>
                        <input
                          className="field"
                          type="file"
                          accept={ACCEPTED_AUDIO}
                          disabled={isRecording || fieldDetectionBusy || busy}
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setAudioFile(file);
                            setRecordedAudioFile(null);
                            setProgress(0);
                          }}
                        />
                        {audioFile ? (
                          <p className="mt-2 text-sm text-slate">
                            {audioFile.name} - {formatBytes(audioFile.size)}
                            {recordedAudioFile?.name === audioFile.name ? " (gravado agora)" : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Documento de apoio</p>
                          <p className="mt-2 text-sm text-slate">Campo ativo: {templateFields.find((field) => field.key === activeFieldKey)?.label ?? "-"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="button-secondary"
                            type="button"
                            disabled={fieldDetectionBusy || !sourceText.trim()}
                            onClick={() => void detectFieldsFromDocument()}
                          >
                            {detectingFields ? "Detectando..." : "Detectar com IA"}
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="field mt-4 min-h-28"
                        value={sourceText}
                        onChange={(event) => setSourceText(event.target.value)}
                        placeholder="Cole aqui o texto do documento, contrato, atendimento ou transcricao."
                      />
                      {sourceText.trim() ? (
                        <div className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-midnight/45 p-4 text-sm leading-7 text-ink">
                          <SelectableWords
                            text={sourceText}
                            keyPrefix={SOURCE_WORD_KEY_PREFIX}
                            selectedKeys={selectedSourceKeys}
                            onWordToggle={toggleSourceWord}
                          />
                        </div>
                      ) : null}
                      {detectMessage ? (
                        <p className="mt-3 rounded-2xl border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">{detectMessage}</p>
                      ) : null}
                    </div>

                    {templateFields.map((field) => (
                      <div key={field.key}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <label className="text-sm font-medium">
                            {field.label}
                            {field.required ? <span className="ml-1 text-ember">*</span> : null}
                          </label>
                          <button
                            className={`rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                              activeFieldKey === field.key
                                ? "border-sand/40 bg-sand/10 text-sand"
                                : "border-white/10 bg-white/[0.04] text-slate hover:border-sand/35 hover:text-ink"
                            }`}
                            type="button"
                            onClick={() => setActiveFieldKey(field.key)}
                          >
                            Selecionar palavras
                          </button>
                        </div>
                        {field.type === "textarea" ? (
                          <textarea
                            className="field min-h-24"
                            value={fieldValues[field.key] ?? ""}
                            placeholder={field.placeholder ?? ""}
                            onChange={(event) =>
                              setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                          />
                        ) : (
                          <input
                            className="field"
                            type={htmlInputTypeFor(field.type)}
                            value={fieldValues[field.key] ?? ""}
                            placeholder={field.placeholder ?? ""}
                            onChange={(event) =>
                              setFieldValues((current) => ({ ...current, [field.key]: event.target.value }))
                            }
                          />
                        )}
                        {field.help ? <p className="mt-1 text-xs text-slate">{field.help}</p> : null}
                        {sourceSelections[field.key]?.length ? (
                          <p className="mt-2 text-xs leading-6 text-slate">
                            Palavras marcadas:{" "}
                            <span className="text-sand">
                              {composeValueFromSelectedWords(sourceWordTokens, sourceSelections[field.key])}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    ))}
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={aiPolish}
                        onChange={(event) => setAiPolish(event.target.checked)}
                      />
                      Usar IA para polir a redacao (desmarque para substituicao literal dos placeholders)
                    </label>
                  </>
                )}
              </div>
            ) : null}

            {mode === "text" ? (
              <div>
                <label className="mb-2 block text-sm font-medium">Texto base</label>
                <textarea
                  className="field min-h-44"
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder="Ex.: dados do cliente, resumo da reuniao, respostas do paciente, observacoes do atendimento..."
                />
              </div>
            ) : null}

            {mode === "audio" ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Gravacao</p>
                      <p className="mt-2 text-sm text-slate">Use o microfone ou envie um arquivo de audio.</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-midnight/45 px-3 py-1 text-xs font-medium text-sand">
                      {isRecording ? `Gravando ${formatDuration(recordingSeconds)}` : audioFile ? "Audio pronto" : "Sem audio"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={isRecording || fieldDetectionBusy || busy}
                      onClick={() => void startRecording()}
                    >
                      Iniciar gravacao
                    </button>
                    <button className="button-secondary" type="button" disabled={!isRecording} onClick={stopRecording}>
                      Parar gravacao
                    </button>
                    {templateFields.length > 0 ? (
                      <button
                        className="button-secondary"
                        type="button"
                        disabled={!audioFile || isRecording || fieldDetectionBusy || busy}
                        onClick={() => void detectFieldsFromAudio(audioFile)}
                      >
                        {detectingAudioFields ? "Reconhecendo..." : "Reconhecer campos"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Arquivo de audio</label>
                  <input
                    className="field"
                    type="file"
                    accept={ACCEPTED_AUDIO}
                    disabled={isRecording || fieldDetectionBusy || busy}
                    onChange={(event) => {
                      setAudioFile(event.target.files?.[0] ?? null);
                      setRecordedAudioFile(null);
                      setProgress(0);
                    }}
                  />
                  {audioFile ? (
                    <p className="mt-2 text-sm text-slate">
                      {audioFile.name} - {formatBytes(audioFile.size)}
                      {recordedAudioFile?.name === audioFile.name ? " (gravado agora)" : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-medium">Instrucoes extras</label>
              <textarea
                className="field min-h-24"
                value={additionalInstructions}
                onChange={(event) => setAdditionalInstructions(event.target.value)}
                placeholder="Ex.: manter tom formal, destacar campos incertos, usar linguagem juridica..."
              />
            </div>

            <button
              className="button-primary w-full"
              type="button"
              disabled={busy || fieldDetectionBusy || isRecording || !templates.length}
              onClick={() => void submit()}
            >
              {busy ? "Gerando documento..." : mode === "fields" ? "Gerar documento pronto" : "Gerar sugestao preenchida"}
            </button>

            {statusMessage ? <p className="rounded-2xl border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">{statusMessage}</p> : null}

            {(detectingAudioFields || (busy && mode === "audio")) ? (
              <div className="space-y-2">
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-sand transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-sm text-slate">Upload do audio: {progress}%</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sand">Resultado</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">Documento pronto para revisar</h3>
              <p className="mt-2 text-sm text-slate">Depois da revisao, exporte em Markdown, TXT, Word ou PDF.</p>
            </div>
            {result ? (
              <div className="flex flex-wrap gap-2">
                <button className="button-secondary" type="button" onClick={() => void copyResult()}>
                  Copiar
                </button>
                {EXPORT_OPTIONS.map((option) => (
                  <button
                    key={option.extension}
                    className="button-secondary"
                    type="button"
                    disabled={downloading !== null || !reviewApproved}
                    onClick={() => void download(option.extension)}
                  >
                    {downloading === option.extension ? "Preparando..." : option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {copyMessage ? <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{copyMessage}</p> : null}

          {result ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-sand/20 bg-sand/10 px-4 py-3 text-sm leading-6 text-sand">
                Revise o texto abaixo. A exportacao Word/PDF fica bloqueada ate a aprovacao humana.
              </div>
              <textarea
                className="field min-h-[52vh] whitespace-pre-wrap text-sm leading-7"
                value={reviewedContent}
                onChange={(event) => {
                  setReviewedContent(event.target.value);
                  setReviewApproved(false);
                }}
              />
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={reviewApproved}
                  onChange={(event) => setReviewApproved(event.target.checked)}
                />
                <span>
                  <span className="font-semibold text-ink">Revisei e aprovo exportar.</span>{" "}
                  Confirmo que os dados foram conferidos antes de gerar o documento final.
                </span>
              </label>
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-white/[0.04] p-8 text-sm leading-6 text-slate">
              O documento preenchido aparece aqui depois que voce escolher um modelo e enviar campos, texto ou audio.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
