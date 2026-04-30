"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { TemplateVariableSelector, type ManualTemplateDraft } from "@/components/template-variable-selector";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  getDefaultTranscriptionProvider,
  LANGUAGE_OPTIONS,
  TRANSCRIPTION_PROVIDER_LABELS,
  WHISPER_MODEL_OPTIONS,
} from "@/lib/transcription-options";
import { formatBytes, formatDate } from "@/lib/utils";
import {
  analyzeTemplateReference,
  createTemplate,
  extractTemplateReferenceText,
  getDashboardStats,
  getSettings,
  getTemplates,
  startProcessing,
  uploadFile,
} from "@/services/api";
import type { DashboardStats, SettingsRead, TranscriptionProvider } from "@/types/api";
import { appendWorkspaceActivity } from "@/lib/workspace-store";

const ACCEPTED_MEDIA = ".mp4,.mov,.mkv,.avi,.webm,.mp3,.wav,.m4a,.aac,.ogg,.flac";
const ACCEPTED_MODEL_DOCUMENTS = ".txt,.md,.markdown,.csv,.odt,.docx,.pdf,.png,.jpg,.jpeg,.webp,image/*";
const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";


export default function DashboardPage() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { status } = useSession();
  const showDashboard = isDesktopMode || status === "authenticated";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelFileInputRef = useRef<HTMLInputElement | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickFile, setQuickFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("pt-BR");
  const [useApi, setUseApi] = useState(true);
  const [whisperModel, setWhisperModel] = useState("medium");
  const [transcriptionProvider, setTranscriptionProvider] = useState<TranscriptionProvider>("openai");
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelSource, setModelSource] = useState<{ filename: string; format: string; content: string } | null>(null);
  const [modelDraft, setModelDraft] = useState<ManualTemplateDraft>({ exampleOutput: "", formFields: [], selectedCount: 0 });
  const [modelBusy, setModelBusy] = useState(false);
  const [modelAiBusy, setModelAiBusy] = useState(false);
  const [modelMessage, setModelMessage] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [settingsSummary, setSettingsSummary] = useState<SettingsRead | null>(null);
  const [templateCount, setTemplateCount] = useState(0);
  const [formTemplateCount, setFormTemplateCount] = useState(0);

  useEffect(() => {
    if (!showDashboard) {
      return;
    }

    void getDashboardStats().then(setStats).catch((err: Error) => setStatsError(err.message));
    void getSettings()
      .then((settings) => {
        setSettingsSummary(settings);
        setLanguage(settings.preferred_language);
        setWhisperModel(settings.whisper_model);
        setTranscriptionProvider(getDefaultTranscriptionProvider(settings.transcription_provider_order));
      })
      .catch(() => undefined);
    void getTemplates()
      .then((templates) => {
        setTemplateCount(templates.length);
        setFormTemplateCount(templates.filter((template) => (template.form_fields?.length ?? 0) > 0).length);
      })
      .catch(() => undefined);
  }, [showDashboard]);

  const effectiveTranscriptionProvider: TranscriptionProvider = useApi ? transcriptionProvider : "whisper";
  const transcriptionProviderDescription = !useApi
    ? "Com APIs desligadas, o upload vai direto para o Whisper local."
    : transcriptionProvider === "whisper"
      ? "A transcrição começa direto no Whisper local selecionado."
      : `Primeira tentativa com ${TRANSCRIPTION_PROVIDER_LABELS[transcriptionProvider]}. Se essa API não estiver configurada ou falhar, o app continua com a ordem salva nas configurações.`;

  const handleQuickUpload = async () => {
    if (!quickFile) {
      setQuickError("Escolha um arquivo de audio ou video para iniciar.");
      return;
    }

    setBusy(true);
    setQuickError(null);
    setProgress(0);

    try {
      const upload = await uploadFile(quickFile, setProgress);
      appendWorkspaceActivity({
        type: "upload",
        title: "Midia enviada para relatorio",
        description: `${quickFile.name} entrou no pipeline de transcricao e relatorio.`,
        href: `/uploads/${upload.id}`,
      });
      await startProcessing(upload.id, {
        language,
        use_api: useApi,
        whisper_model: whisperModel,
        transcription_provider: effectiveTranscriptionProvider,
      });
      router.push(`/uploads/${upload.id}`);
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : "Falha ao iniciar o processamento.");
      setBusy(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    setQuickFile(droppedFile);
    setQuickError(null);
  };

  const openModelFileAsText = async () => {
    if (!modelFile) {
      setModelError("Escolha um documento modelo para abrir como texto.");
      return;
    }

    setModelBusy(true);
    setModelError(null);
    setModelMessage(null);

    try {
      const extracted = await extractTemplateReferenceText(modelFile);
      setModelSource({
        filename: extracted.source_filename,
        format: extracted.source_format,
        content: extracted.content,
      });
      setModelDraft({ exampleOutput: extracted.content, formFields: [], selectedCount: 0 });
      setModelMessage("Documento aberto. Clique nas palavras que devem virar campos alteraveis.");
    } catch (err) {
      setModelError(err instanceof Error ? err.message : "Falha ao abrir documento como texto.");
    } finally {
      setModelBusy(false);
    }
  };

  const createModelFromSelection = async () => {
    if (!modelSource) {
      setModelError("Abra um documento como texto antes de criar o modelo.");
      return;
    }
    if (!modelDraft.selectedCount) {
      setModelError("Selecione pelo menos uma palavra alteravel.");
      return;
    }

    setModelBusy(true);
    setModelError(null);
    setModelMessage(null);

    try {
      const baseName = modelSource.filename.replace(/\.[^.]+$/, "").trim() || "Documento";
      const created = await createTemplate({
        name: `Modelo ${baseName}`.slice(0, 120),
        description: "Modelo criado na pagina inicial com palavras alteraveis selecionadas manualmente.",
        category: "Formulario",
        base_prompt:
          "Preencha o documento preservando a estrutura original. " +
          "Substitua os placeholders marcados manualmente usando as respostas do formulario.",
        example_output: modelDraft.exampleOutput,
        complementary_instructions: "Campos criados a partir das palavras selecionadas no documento original.",
        form_fields: modelDraft.formFields,
        output_format: "markdown",
        is_favorite: false,
      });
      appendWorkspaceActivity({
        type: "template",
        title: "Modelo manual criado",
        description: `${created.name} foi criado com palavras selecionadas no documento.`,
        href: "/templates",
      });
      setModelMessage(`Modelo "${created.name}" criado. Ele ja aparece na pagina Formularios.`);
    } catch (err) {
      setModelError(err instanceof Error ? err.message : "Falha ao criar modelo.");
    } finally {
      setModelBusy(false);
    }
  };

  const createModelWithAi = async () => {
    if (!modelFile) {
      setModelError("Escolha uma imagem ou documento para a IA transformar em formulario.");
      return;
    }

    setModelAiBusy(true);
    setModelError(null);
    setModelMessage(null);

    try {
      const analysis = await analyzeTemplateReference(modelFile, {
        name: "",
        description: "",
        category: "Formulario",
      });
      const created = await createTemplate({
        name: analysis.name,
        description: analysis.description,
        category: analysis.category,
        base_prompt: analysis.base_prompt,
        example_output: analysis.example_output,
        complementary_instructions: analysis.complementary_instructions,
        form_fields: analysis.form_fields,
        output_format: analysis.output_format,
        is_favorite: false,
      });
      setTemplateCount((current) => current + 1);
      if ((created.form_fields?.length ?? 0) > 0) {
        setFormTemplateCount((current) => current + 1);
      }
      appendWorkspaceActivity({
        type: "template",
        title: "Formulario criado com IA",
        description: `${created.name} foi criado a partir de imagem ou documento.`,
        href: "/templates",
      });
      setModelMessage(`Modelo "${created.name}" criado com IA. Ele ja pode ser preenchido em Formularios.`);
    } catch (err) {
      setModelError(err instanceof Error ? err.message : "Falha ao criar formulario com IA.");
    } finally {
      setModelAiBusy(false);
    }
  };

  if (!showDashboard) {
    return <PublicLanding onGoogleLogin={() => void signIn("google", { callbackUrl: "/" })} />;
  }

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-6 border-b border-white/10 p-6 sm:p-7 xl:border-b-0 xl:border-r">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sand">Formularios e relatorios por IA</p>
              <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Suba um documento, imagem, audio ou video. A IA cria o formulario e entrega o documento pronto para revisar.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate">
                Workspace de cliente, modelos reutilizaveis, revisao humana e exportacao Word/PDF no mesmo fluxo comercial.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link className="button-primary" href="/templates">
                Criar formulario
              </Link>
              <Link className="button-secondary" href="/forms">
                Preencher documento
              </Link>
              <Link className="button-secondary" href="/uploads">
                Gerar relatorio
              </Link>
            </div>

            <div className="rounded-lg border border-tide/20 bg-tide/[0.08] p-4 text-sm leading-6 text-slate">
              <span className="font-semibold text-ink">Cliente ativo:</span> {workspace.clientName} - {workspace.segment}.{" "}
              <Link className="font-semibold text-sand" href="/login">Trocar workspace</Link>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate">Processados</p>
                <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">{stats?.total_uploads ?? 0}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate">Relatorios</p>
                <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">{stats?.total_reports ?? 0}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate">Modelos</p>
                <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-ink">{templateCount}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Link className="rounded-lg border border-white/10 bg-midnight/50 p-4 text-sm transition hover:border-sand/40 hover:bg-white/[0.06]" href="/forms">
                <span className="font-semibold text-ink">Formulario pronto</span>
                <span className="mt-1 block text-slate">Digite ou grave respostas para preencher o documento.</span>
              </Link>
              <Link className="rounded-lg border border-white/10 bg-midnight/50 p-4 text-sm transition hover:border-sand/40 hover:bg-white/[0.06]" href="/templates">
                <span className="font-semibold text-ink">Imagem ou documento</span>
                <span className="mt-1 block text-slate">A IA detecta os campos e monta um modelo reutilizavel.</span>
              </Link>
            </div>
          </div>

          <div className="bg-midnight/45 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sand">Acao rapida</p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Video ou audio para relatorio</h2>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="button-secondary px-4 py-2"
              >
                Escolher arquivo
              </button>
            </div>

            <div
              className={`mt-5 rounded-lg border border-dashed p-6 transition ${
                dragActive ? "border-sand bg-sand/10" : "border-white/15 bg-midnight/55 hover:border-sand/35"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept={ACCEPTED_MEDIA}
                onChange={(event) => {
                  setQuickFile(event.target.files?.[0] ?? null);
                  setQuickError(null);
                }}
              />

              <div className="space-y-3 text-center">
                <p className="text-xl font-semibold text-white">{dragActive ? "Solte o arquivo aqui" : "Arraste audio ou video para gerar relatorio"}</p>
                <p className="text-sm leading-6 text-slate">MP4, MOV, MKV, AVI, WEBM, MP3, WAV, M4A, AAC, OGG e FLAC.</p>
              </div>

              {quickFile ? (
                <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.07] p-4 text-sm text-slate">
                  <p className="font-medium text-white">{quickFile.name}</p>
                  <p className="mt-1">{formatBytes(quickFile.size)}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Idioma preferido</label>
                <select
                  className="field"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="text-midnight">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Modelo Whisper</label>
                <select
                  className="field"
                  value={whisperModel}
                  onChange={(event) => setWhisperModel(event.target.value)}
                >
                  {WHISPER_MODEL_OPTIONS.map((model) => (
                    <option key={model} value={model} className="text-midnight">
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">IA para transcrever</label>
                <select
                  className="field"
                  value={transcriptionProvider}
                  onChange={(event) => setTranscriptionProvider(event.target.value as TranscriptionProvider)}
                  disabled={!useApi}
                >
                  {Object.entries(TRANSCRIPTION_PROVIDER_LABELS).map(([provider, label]) => (
                    <option key={provider} value={provider} className="text-midnight">
                      {label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-6 text-slate">{transcriptionProviderDescription}</p>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-midnight/55 px-4 py-3 text-sm text-slate">
                <input type="checkbox" checked={useApi} onChange={(event) => setUseApi(event.target.checked)} />
                <span className="font-medium text-white">Usar APIs externas quando disponíveis</span>
              </label>

              <button
                className="button-primary w-full"
                type="button"
                disabled={busy}
                onClick={() => void handleQuickUpload()}
              >
                {busy ? "Enviando e iniciando processamento..." : "Enviar e gerar relatorio"}
              </button>

              {busy ? (
                <div className="space-y-2">
                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-sand transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-sm text-slate">Upload em andamento: {progress}%</p>
                </div>
              ) : null}

              {quickError ? <p className="rounded-lg border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">{quickError}</p> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sand">Acao rapida</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Imagem ou documento para formulario</h2>
              <p className="mt-2 text-sm leading-6 text-slate">
                Envie uma imagem, PDF, DOCX ou ficha. A IA cria os campos automaticamente, ou voce pode abrir como texto e marcar cada palavra.
              </p>
            </div>

            <input
              ref={modelFileInputRef}
              className="hidden"
              type="file"
              accept={ACCEPTED_MODEL_DOCUMENTS}
              onChange={(event) => {
                setModelFile(event.target.files?.[0] ?? null);
                setModelSource(null);
                setModelDraft({ exampleOutput: "", formFields: [], selectedCount: 0 });
                setModelError(null);
                setModelMessage(null);
              }}
            />

            <div className="flex flex-wrap gap-3">
              <button className="button-secondary" type="button" onClick={() => modelFileInputRef.current?.click()}>
                Escolher arquivo
              </button>
              <button className="button-primary" type="button" disabled={modelAiBusy || modelBusy || !modelFile} onClick={() => void createModelWithAi()}>
                {modelAiBusy ? "Criando com IA..." : "Criar formulario com IA"}
              </button>
              <button className="button-secondary" type="button" disabled={modelBusy || modelAiBusy || !modelFile} onClick={() => void openModelFileAsText()}>
                {modelBusy ? "Abrindo..." : "Abrir arquivo como texto"}
              </button>
            </div>

            {modelFile ? (
              <p className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate">
                Selecionado: <span className="text-ink">{modelFile.name}</span> ({formatBytes(modelFile.size)})
              </p>
            ) : null}

            {modelMessage ? <p className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{modelMessage}</p> : null}
            {modelError ? <p className="rounded-lg border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">{modelError}</p> : null}
          </div>

          <div className="space-y-4">
            {modelSource ? (
              <>
                <TemplateVariableSelector
                  sourceText={modelSource.content}
                  sourceLabel={`Arquivo aberto: ${modelSource.filename} (${modelSource.format.toUpperCase()})`}
                  keyPrefix="dashboard-model-text"
                  onDraftChange={setModelDraft}
                />
                <div className="flex flex-wrap gap-3">
                  <button className="button-primary" type="button" disabled={modelBusy || !modelDraft.selectedCount} onClick={() => void createModelFromSelection()}>
                    Criar modelo com palavras selecionadas
                  </button>
                  <Link className="button-secondary" href="/templates">
                    Revisar em Modelos
                  </Link>
                  <Link className="button-secondary" href="/forms">
                    Preencher em Formularios
                  </Link>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.04] p-6 text-sm leading-6 text-slate">
                O texto do documento aparece aqui para selecao manual depois que voce escolher um arquivo.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Cliente</p>
          <h3 className="mt-3 text-xl font-semibold">{workspace.clientName}</h3>
          <p className="mt-2 text-sm leading-6 text-slate">{workspace.ownerEmail}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Formularios</p>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold">{formTemplateCount}</p>
          <p className="mt-2 text-sm text-slate">Modelos com campos editaveis.</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Preferencia</p>
          <p className="mt-3 text-xl font-semibold">{settingsSummary?.preferred_language ?? language}</p>
          <p className="mt-2 text-sm text-slate">Idioma usado nas transcricoes e relatorios.</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate">Plano</p>
          <p className="mt-3 text-xl font-semibold">{workspace.plan === "enterprise" ? "Enterprise" : workspace.plan === "pro" ? "Pro" : "Teste"}</p>
          <p className="mt-2 text-sm text-slate">{settingsSummary?.export_directory ? "Exportacao configurada" : "Word/PDF via exportacao local"}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          ["Criar formulario", "A IA detecta campos preenchiveis em documentos e imagens.", "/templates"],
          ["Preencher documento", "O cliente digita, cola texto ou grava audio e revisa antes de exportar.", "/forms"],
          ["Gerar relatorio", "Audio e video viram transcricao, relatorio e arquivos Word/PDF.", "/uploads"],
        ].map(([title, description, href]) => (
          <Link key={title} href={href} className="panel p-5 transition hover:border-sand/40 hover:bg-white/[0.06]">
            <p className="text-lg font-semibold text-ink">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate">{description}</p>
          </Link>
        ))}
      </section>

      {statsError ? <div className="panel p-6 text-sm text-ember">{statsError}</div> : null}

      <section className="panel p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h3 className="text-xl font-semibold">Últimos processamentos</h3>
          <Link href="/history" className="button-secondary">Ver histórico</Link>
        </div>
        <div className="space-y-4">
          {stats?.recent_uploads.length ? (
            stats.recent_uploads.map((item) => (
              <Link
                key={item.id}
                href={`/uploads/${item.id}`}
                className="block rounded-lg border border-white/10 bg-white/[0.04] p-4 transition hover:border-sand/35 hover:bg-white/[0.08]"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-base font-semibold text-ink">{item.original_filename}</p>
                      <span className="rounded-full border border-sand/20 bg-sand/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sand">
                        {item.transcription_engine}
                      </span>
                    </div>
                    <p className="text-sm text-slate">{formatDate(item.created_at)} • {item.report_count} relatório(s)</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.04] p-6 text-sm text-slate">
              Nenhum processamento ainda.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PublicLanding({ onGoogleLogin }: { onGoogleLogin: () => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-7xl flex-col">
      <header className="flex items-center justify-between gap-4 py-3">
        <Link href="/" className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-ink">
          FormReport AI
        </Link>
        <div className="flex items-center gap-2">
          <Link className="button-secondary px-4 py-2" href="/billing">
            Planos
          </Link>
          <button className="button-primary px-4 py-2" type="button" onClick={onGoogleLogin}>
            Entrar com Google
          </button>
        </div>
      </header>

      <section className="grid flex-1 gap-8 py-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:py-12">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-tide/25 bg-tide/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-aqua">
            Documento, imagem, audio ou video
          </div>
          <div className="space-y-4">
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl lg:text-6xl">
              FormReport AI
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate">
              Suba um arquivo, deixe a IA encontrar o que e preenchivel, revise os campos e gere o documento ou relatorio final para exportar.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link className="button-primary w-full" href="/login">
              Criar formulario
            </Link>
            <Link className="button-secondary w-full" href="/login">
              Preencher documento
            </Link>
            <Link className="button-secondary w-full" href="/login">
              Gerar relatorio
            </Link>
          </div>
          <div className="grid gap-3 text-sm text-slate sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-ink">1. Detecta campos</p>
              <p className="mt-1 leading-6">A IA transforma contratos, fichas e imagens em formularios revisaveis.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-ink">2. Preenche com audio</p>
              <p className="mt-1 leading-6">O cliente digita ou grava respostas para completar cada campo.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="font-semibold text-ink">3. Exporta pronto</p>
              <p className="mt-1 leading-6">Revisao humana antes de gerar Word, PDF ou relatorio final.</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-navy/80 p-4 shadow-panel sm:p-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sand via-tide to-aqua" />
          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-lg border border-white/10 bg-midnight/70 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sand">Modelo detectado</p>
                <span className="rounded-full bg-tide/15 px-3 py-1 text-xs font-semibold text-aqua">IA</span>
              </div>
              <div className="space-y-3 text-sm leading-7 text-slate">
                <p className="rounded border border-white/10 bg-white/[0.04] p-3">
                  Contrato de prestacao para <span className="underline decoration-sand decoration-2 underline-offset-4">cliente</span>
                </p>
                <p className="rounded border border-white/10 bg-white/[0.04] p-3">
                  Vigencia de <span className="underline decoration-sand decoration-2 underline-offset-4">data inicial</span> ate{" "}
                  <span className="underline decoration-sand decoration-2 underline-offset-4">data final</span>
                </p>
                <p className="rounded border border-white/10 bg-white/[0.04] p-3">
                  Valor mensal: <span className="underline decoration-sand decoration-2 underline-offset-4">valor</span>
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Formulario criado</p>
              <div className="mt-4 space-y-3">
                {["Nome do cliente", "Data inicial", "Data final", "Valor mensal"].map((label, index) => (
                  <div key={label}>
                    <label className="mb-1 block text-xs font-semibold text-slate">{label}</label>
                    <div className="h-10 rounded-lg border border-white/10 bg-midnight/70 px-3 py-2 text-sm text-ink">
                      {index === 0 ? "Cliente Exemplo Ltda." : index === 3 ? "R$ 4.900,00" : "__/__/____"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-sand/20 bg-sand/10 px-4 py-3 text-sm text-sand">
                Documento pronto para revisar e exportar.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 pb-8 md:grid-cols-3">
        <Link className="rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:border-sand/35" href="/billing">
          <p className="text-lg font-semibold text-ink">Assinatura Stripe</p>
          <p className="mt-2 text-sm leading-6 text-slate">Planos Pro e Enterprise com checkout seguro.</p>
        </Link>
        <Link className="rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:border-sand/35" href="/login">
          <p className="text-lg font-semibold text-ink">Login Google gratuito</p>
          <p className="mt-2 text-sm leading-6 text-slate">Auth.js sem custo por usuario para clientes do webapp.</p>
        </Link>
        <Link className="rounded-lg border border-white/10 bg-white/[0.04] p-5 transition hover:border-sand/35" href="/login">
          <p className="text-lg font-semibold text-ink">Workspace por cliente</p>
          <p className="mt-2 text-sm leading-6 text-slate">Historico, modelos e relatorios separados por conta.</p>
        </Link>
      </section>
    </div>
  );
}
