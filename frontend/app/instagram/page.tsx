"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { appendWorkspaceActivity } from "@/lib/workspace-store";
import { getCookiesStatus, getInstagramPostAnalyze, readInstagramPost, startInstagramPostAnalyze } from "@/services/api";
import type {
  CookiesStatus,
  InstagramAnalyzeJobStatus,
  InstagramAnalyzeSlideResult,
  InstagramPostInfo,
  InstagramPostReadResponse,
} from "@/types/api";

type ReviewChoice = "approved" | "changes" | null;

function formatCount(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return new Intl.NumberFormat("pt-BR").format(value);
}

function compactText(value: string | null, maxLength = 900): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function buildPrompt(
  post: InstagramPostInfo,
  changes: string,
  suggestions: string[],
  ocrSlides: InstagramAnalyzeSlideResult[],
): string {
  const metrics = [
    post.view_count !== null ? `${formatCount(post.view_count)} visualizacoes` : null,
    post.like_count !== null ? `${formatCount(post.like_count)} curtidas` : null,
    post.comment_count !== null ? `${formatCount(post.comment_count)} comentarios` : null,
  ].filter(Boolean);
  const suggestionText = suggestions.length
    ? suggestions.map((item) => `- ${item}`).join("\n")
    : "- Priorize clareza, revisao humana e um fluxo simples de ponta a ponta.";
  const ocrText = ocrSlides
    .filter((slide) => slide.ocr_text?.trim() && slide.ocr_text.trim().toUpperCase() !== "SEM_TEXTO")
    .map((slide) => `Slide ${slide.index + 1} (${slide.provider || "OCR"}):\n${slide.ocr_text?.trim()}`)
    .join("\n\n");

  return [
    "Voce e uma IA especialista em criar especificacoes tecnicas para gerar software.",
    "",
    "Crie um programa inspirado na solucao apresentada no post do Instagram abaixo.",
    "Reproduza a solucao funcional, o fluxo de uso e o valor entregue. Nao copie marca, identidade visual, textos protegidos, imagens privadas ou elementos que dependam do post original.",
    "",
    "Dados lidos do post:",
    `- URL: ${post.canonical_url || post.url}`,
    `- Tipo: ${post.source_type}`,
    `- Midia: ${post.media_kind}`,
    `- Autor: ${post.author || "nao identificado"}`,
    post.title ? `- Titulo: ${compactText(post.title, 220)}` : "- Titulo: nao identificado",
    post.caption ? `- Legenda: ${compactText(post.caption, 1400)}` : "- Legenda: nao identificada",
    post.hashtags.length ? `- Hashtags: ${post.hashtags.map((tag) => `#${tag}`).join(", ")}` : "- Hashtags: nenhuma identificada",
    post.mentions.length ? `- Mencoes: ${post.mentions.map((mention) => `@${mention}`).join(", ")}` : "- Mencoes: nenhuma identificada",
    metrics.length ? `- Metricas publicas: ${metrics.join(", ")}` : "- Metricas publicas: nao disponiveis",
    post.duration_seconds !== null ? `- Duracao: ${Math.round(post.duration_seconds)} segundos` : "- Duracao: nao aplicavel ou nao disponivel",
    post.slides.length ? `- Slides detectados: ${post.slides.length}` : "- Slides detectados: nao disponiveis",
    "",
    "Texto lido por OCR nos slides:",
    ocrText || "- OCR ainda nao executado ou nenhum texto visivel foi encontrado.",
    "",
    "Alteracoes solicitadas pelo usuario:",
    changes.trim() || "- Nenhuma alteracao adicional. Use o post como referencia principal.",
    "",
    "Melhorias aprovadas:",
    suggestionText,
    "",
    "Crie uma especificacao completa para gerar o programa, contendo:",
    "1. Nome sugerido do produto.",
    "2. Publico-alvo e problema resolvido.",
    "3. Fluxo principal em etapas.",
    "4. Telas, componentes e estados esperados.",
    "5. Entradas, saidas e dados que precisam ser salvos.",
    "6. Regras de negocio e validacoes.",
    "7. Sugestao de stack tecnica simples.",
    "8. Prompt final para uma IA programadora implementar o projeto.",
    "",
    "A resposta deve ser pratica, pronta para copiar em outra IA, e deve pedir aprovacao do usuario antes de assumir qualquer detalhe ausente.",
  ].join("\n");
}

function isAnalyzeRunning(job: InstagramAnalyzeJobStatus | null): boolean {
  return job?.status === "queued" || job?.status === "running";
}

function PostPreview({ post }: { post: InstagramPostInfo }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        {post.thumbnail_url ? (
          <img
            className="aspect-video w-full rounded-lg border border-white/10 object-cover"
            src={post.thumbnail_url}
            alt={post.title || "Post do Instagram"}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/10 bg-midnight/55 text-sm text-slate">
            Sem imagem publica
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/10 bg-midnight/55 p-3">
            <p className="text-xs text-slate">Views</p>
            <p className="mt-1 text-lg font-semibold">{formatCount(post.view_count)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-midnight/55 p-3">
            <p className="text-xs text-slate">Curtidas</p>
            <p className="mt-1 text-lg font-semibold">{formatCount(post.like_count)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-midnight/55 p-3">
            <p className="text-xs text-slate">Comentarios</p>
            <p className="mt-1 text-lg font-semibold">{formatCount(post.comment_count)}</p>
          </div>
        </div>

        {post.slides.length > 1 ? (
          <div className="rounded-lg border border-white/10 bg-midnight/45 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sand">
              Carrossel com {post.slides.length} slides
            </p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {post.slides.slice(0, 8).map((slide) => (
                <div key={`${slide.index}-${slide.display_id ?? "slide"}`} className="overflow-hidden rounded-md border border-white/10 bg-white/[0.03]">
                  {slide.thumbnail_url ? (
                    <img className="aspect-square w-full object-cover" src={slide.thumbnail_url} alt={`Slide ${slide.index + 1}`} />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-xs text-slate">{slide.index + 1}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">{post.source_type}</p>
          <h3 className="mt-2 text-2xl font-semibold">{post.title || "Post do Instagram"}</h3>
          <p className="mt-1 text-sm text-slate">
            {post.author || "Autor nao identificado"} {post.upload_date ? `- ${post.upload_date}` : ""}
          </p>
        </div>

        <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-midnight/45 p-4 text-sm leading-6 text-slate">
          {post.caption || post.raw_summary}
        </div>

        <div className="flex flex-wrap gap-2">
          {post.hashtags.slice(0, 16).map((tag) => (
            <span key={tag} className="rounded-full border border-sand/20 bg-sand/10 px-3 py-1 text-xs text-sand">
              #{tag}
            </span>
          ))}
          {post.mentions.slice(0, 10).map((mention) => (
            <span key={mention} className="rounded-full border border-tide/20 bg-tide/10 px-3 py-1 text-xs text-aqua">
              @{mention}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function InstagramPage() {
  const [url, setUrl] = useState("");
  const [response, setResponse] = useState<InstagramPostReadResponse | null>(null);
  const [analyzeJob, setAnalyzeJob] = useState<InstagramAnalyzeJobStatus | null>(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [cookiesStatus, setCookiesStatus] = useState<CookiesStatus | null>(null);
  const [reviewChoice, setReviewChoice] = useState<ReviewChoice>(null);
  const [changes, setChanges] = useState("");
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(() => new Set());
  const [prompt, setPrompt] = useState("");
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSuggestions = useMemo(() => {
    if (!response) {
      return [];
    }
    return response.suggestions.filter((_, index) => selectedSuggestions.has(index));
  }, [response, selectedSuggestions]);

  const canGeneratePrompt = Boolean(response && reviewChoice);
  const showCookieHelp = Boolean(error && /(cookie|cookies|dpapi|login|sessao|sessão)/i.test(error));

  useEffect(() => {
    void getCookiesStatus().then(setCookiesStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!analyzeJob || !isAnalyzeRunning(analyzeJob)) {
      return;
    }

    const jobId = analyzeJob.job_id;
    const timer = window.setInterval(() => {
      void getInstagramPostAnalyze(jobId)
        .then((next) => {
          setAnalyzeJob(next);
          if (next.status === "done") {
            setApproved(false);
            setStatusMessage("OCR concluido. Gere o prompt novamente para incluir o texto dos slides.");
          }
          if (next.status === "failed") {
            setError(next.error || "Falha ao ler os slides com OCR.");
          }
        })
        .catch((err) => {
          setAnalyzeJob((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  error: err instanceof Error ? err.message : "Falha ao acompanhar OCR.",
                }
              : current,
          );
        });
    }, 2000);

    return () => window.clearInterval(timer);
  }, [analyzeJob?.job_id, analyzeJob?.status]);

  const loadPost = async () => {
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    setResponse(null);
    setAnalyzeJob(null);
    setAnalyzeBusy(false);
    setPrompt("");
    setApproved(false);
    setCopied(false);
    setReviewChoice(null);
    setChanges("");
    setSelectedSuggestions(new Set());

    try {
      const [postResponse, cookies] = await Promise.all([
        readInstagramPost({ url }),
        getCookiesStatus().catch(() => null),
      ]);
      setResponse(postResponse);
      setCookiesStatus(cookies);
      setSelectedSuggestions(new Set(postResponse.suggestions.map((_, index) => index)));
      setPrompt("");
      setStatusMessage("Post lido. Revise as informacoes antes de aprovar o prompt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel ler o post.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSuggestion = (index: number) => {
    setApproved(false);
    setSelectedSuggestions((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const startOcrAnalyze = async () => {
    if (!response) {
      return;
    }
    setAnalyzeBusy(true);
    setError(null);
    try {
      const job = await startInstagramPostAnalyze({ url: response.post.canonical_url || response.post.url });
      setAnalyzeJob(job);
      setApproved(false);
      setStatusMessage("OCR iniciado. O texto dos slides sera incluido no prompt quando terminar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel iniciar o OCR do Instagram.");
    } finally {
      setAnalyzeBusy(false);
    }
  };

  const generatePrompt = () => {
    if (!response) {
      return;
    }
    setPrompt(buildPrompt(response.post, changes, activeSuggestions, analyzeJob?.slides ?? []));
    setApproved(false);
    setCopied(false);
    setStatusMessage("Prompt gerado. Edite se precisar e aprove quando estiver pronto.");
  };

  const approvePrompt = () => {
    if (!response || !prompt.trim()) {
      return;
    }
    setApproved(true);
    setStatusMessage("Prompt aprovado e pronto para usar em outra IA.");
    appendWorkspaceActivity({
      type: "template",
      title: "Prompt de Instagram aprovado",
      description: response.post.title || response.post.caption?.slice(0, 120) || response.post.canonical_url,
      href: "/instagram",
    });
  };

  const copyPrompt = async () => {
    if (!prompt.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setStatusMessage("Prompt copiado.");
    } catch {
      setError("Nao foi possivel copiar automaticamente. Selecione o texto do prompt manualmente.");
    }
  };

  return (
    <>
      <SectionHeader
        eyebrow="Instagram"
        title="Post para prompt de programa"
        description="Leia um post, revise a solucao, ajuste melhorias e aprove um prompt para usar em outra IA."
        action={
          <div className="flex flex-wrap gap-2">
            <a className="button-secondary px-4 py-2" href="https://www.instagram.com/" target="_blank" rel="noreferrer">
              Abrir Instagram
            </a>
            <Link className="button-secondary px-4 py-2" href="/settings#cookies">
              Ativar cookies
            </Link>
          </div>
        }
      />

      <section className="panel p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate">URL do post, Reel ou Story</span>
            <input
              className="field"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              type="url"
            />
          </label>
          <button className="button-primary" type="button" disabled={busy || !url.trim()} onClick={() => void loadPost()}>
            {busy ? "Lendo..." : "Ler post"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
            Cookies: {cookiesStatus?.configured ? "configurados" : response?.used_cookies ? "usados" : "nao confirmados"}
          </span>
          {response ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
              Lido em {new Date(response.inspected_at).toLocaleString("pt-BR")}
            </span>
          ) : null}
        </div>

        {statusMessage ? (
          <p className="mt-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </p>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
            <p>{error}</p>
            {showCookieHelp ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="button-secondary px-4 py-2" href="https://www.instagram.com/" target="_blank" rel="noreferrer">
                  Acessar Instagram
                </a>
                <Link className="button-primary px-4 py-2" href="/settings#cookies">
                  Ativar cookies no app
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {response ? (
        <>
          <section className="panel p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Post lido</p>
                <h2 className="mt-2 text-2xl font-semibold">E isso que voce quer transformar em programa?</h2>
              </div>
              <a className="button-secondary" href={response.post.canonical_url} target="_blank" rel="noreferrer">
                Abrir post
              </a>
            </div>
            <PostPreview post={response.post} />

            {response.post.slides.length ? (
              <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">OCR dos slides</p>
                    <p className="mt-2 text-sm leading-6 text-slate">
                      Use OCR para ler textos dentro de imagens e carrosseis. O resultado entra no prompt final.
                    </p>
                  </div>
                  <button
                    className="button-secondary px-4 py-2"
                    type="button"
                    disabled={analyzeBusy || isAnalyzeRunning(analyzeJob)}
                    onClick={() => void startOcrAnalyze()}
                  >
                    {isAnalyzeRunning(analyzeJob) ? "Lendo..." : analyzeBusy ? "Iniciando..." : "Ler com OCR"}
                  </button>
                </div>

                {analyzeJob ? (
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="mb-2 flex justify-between text-xs text-slate">
                        <span>
                          {analyzeJob.status === "done"
                            ? "Concluido"
                            : analyzeJob.status === "failed"
                              ? "Falhou"
                              : `Slide ${analyzeJob.current_slide || 1} de ${analyzeJob.total_slides || response.post.slides.length}`}
                        </span>
                        <span>{Math.round((analyzeJob.progress || 0) * 100)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-midnight/70">
                        <div
                          className="h-full rounded-full bg-sand transition-all"
                          style={{ width: `${Math.max(3, Math.round((analyzeJob.progress || 0) * 100))}%` }}
                        />
                      </div>
                    </div>

                    {analyzeJob.error ? (
                      <p className="rounded-lg border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
                        {analyzeJob.error}
                      </p>
                    ) : null}

                    {analyzeJob.slides.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {analyzeJob.slides.map((slide) => (
                          <div key={`${slide.index}-${slide.display_id ?? "ocr"}`} className="rounded-lg border border-white/10 bg-midnight/45 p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-ink">Slide {slide.index + 1}</p>
                              <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-slate">
                                {slide.provider || slide.media_kind}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap text-xs leading-5 text-slate">
                              {slide.ocr_text || slide.error || "Sem texto identificado ainda."}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate">
                <input
                  className="mt-1"
                  type="radio"
                  name="review-choice"
                  checked={reviewChoice === "approved"}
                  onChange={() => {
                    setReviewChoice("approved");
                    setApproved(false);
                  }}
                />
                <span>Sim, usar este post como referencia principal.</span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate">
                <input
                  className="mt-1"
                  type="radio"
                  name="review-choice"
                  checked={reviewChoice === "changes"}
                  onChange={() => {
                    setReviewChoice("changes");
                    setApproved(false);
                  }}
                />
                <span>Quero alterar ou complementar a solucao antes do prompt.</span>
              </label>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="panel p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Ajustes</p>
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium text-slate">O que deve mudar</span>
                <textarea
                  className="field min-h-36 resize-y"
                  value={changes}
                  onChange={(event) => {
                    setChanges(event.target.value);
                    setApproved(false);
                  }}
                  placeholder="Ex.: trocar publico-alvo, adicionar painel administrativo, simplificar fluxo, usar WhatsApp em vez de Instagram..."
                />
              </label>

              <div className="mt-5">
                <p className="text-sm font-semibold text-ink">Sugestoes de melhoria</p>
                <div className="mt-3 space-y-2">
                  {response.suggestions.map((suggestion, index) => (
                    <label key={`${index}-${suggestion}`} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm leading-6 text-slate">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={selectedSuggestions.has(index)}
                        onChange={() => toggleSuggestion(index)}
                      />
                      <span>{suggestion}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button className="button-primary mt-5 w-full" type="button" disabled={!canGeneratePrompt} onClick={generatePrompt}>
                Gerar prompt
              </button>
            </div>

            <div className="panel p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Prompt final</p>
                  <h2 className="mt-2 text-2xl font-semibold">{approved ? "Aprovado" : "Em revisao"}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="button-secondary px-4 py-2" type="button" disabled={!prompt.trim()} onClick={() => void copyPrompt()}>
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                  <button className="button-primary px-4 py-2" type="button" disabled={!prompt.trim()} onClick={approvePrompt}>
                    Aprovar
                  </button>
                </div>
              </div>

              <textarea
                className="field mt-4 min-h-[520px] resize-y font-mono text-xs leading-5"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  setApproved(false);
                  setCopied(false);
                }}
              />
            </div>
          </section>
        </>
      ) : (
        <section className="grid gap-5 lg:grid-cols-3">
          {[
            ["1", "Ler", "URL do Instagram com cookies quando necessario."],
            ["2", "Revisar", "Confirmacao, ajustes e melhorias escolhidas."],
            ["3", "Aprovar", "Prompt editavel para usar em outra IA."],
          ].map(([step, title, description]) => (
            <div key={step} className="panel p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sand">Etapa {step}</p>
              <h3 className="mt-3 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate">{description}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
