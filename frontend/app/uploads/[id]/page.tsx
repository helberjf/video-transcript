"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { usePollUpload } from "@/hooks/use-poll-upload";
import { formatDate, formatDuration } from "@/lib/utils";
import { generateReport, getTemplates } from "@/services/api";
import type { ReportRead, ReportTemplate } from "@/types/api";

export default function UploadDetailPage() {
  const params = useParams<{ id: string }>();
  const uploadId = useMemo(() => String(params.id), [params.id]);
  const { upload, reports, setReports, loading, error } = usePollUpload(uploadId);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [customRequest, setCustomRequest] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [reportTitle, setReportTitle] = useState("Relatório gerado");
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    void getTemplates()
      .then((items) => {
        setTemplates(items);
        if (!templateId) {
          const favorite = items.find((template) => template.is_favorite);
          if (favorite) {
            setTemplateId(favorite.id);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates],
  );

  const createReport = async () => {
    setSubmitting(true);
    setReportError(null);
    try {
      const report = await generateReport({
        upload_id: uploadId,
        template_id: templateId || null,
        custom_request: customRequest || null,
        additional_instructions: additionalInstructions || null,
        title: reportTitle,
      });
      setReports((current: ReportRead[]) => [report, ...current]);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Falha ao gerar relatório");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Detalhe do processo"
        title={upload?.original_filename ?? "Carregando processo"}
        description="A página acompanha o estado do pipeline, mostra a transcrição pronta e permite gerar relatórios com um modelo salvo ou com instruções livres."
        action={upload ? <StatusBadge status={upload.status} /> : null}
      />

      {loading ? <div className="panel p-6 text-sm text-slate">Carregando processo...</div> : null}
      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      {upload ? (
        <>
          <div className="grid gap-5 md:grid-cols-4">
            <div className="panel p-5"><p className="text-sm text-slate">Criado em</p><p className="mt-2 text-lg font-semibold">{formatDate(upload.created_at)}</p></div>
            <div className="panel p-5"><p className="text-sm text-slate">Tipo</p><p className="mt-2 text-lg font-semibold uppercase">{upload.file_type}</p></div>
            <div className="panel p-5"><p className="text-sm text-slate">Duração</p><p className="mt-2 text-lg font-semibold">{formatDuration(upload.duration_seconds)}</p></div>
            <div className="panel p-5"><p className="text-sm text-slate">Engine</p><p className="mt-2 text-lg font-semibold uppercase">{upload.transcription_engine}</p></div>
          </div>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="panel p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">Transcrição</h3>
                  <p className="mt-1 text-sm text-slate">Idioma detectado: {upload.language_detected ?? "-"}</p>
                </div>
              </div>
              <div className="mt-6 rounded-3xl bg-canvas/80 p-5 text-sm leading-7 text-ink">
                {upload.transcription_text ?? "O processamento ainda está em andamento. Esta área será atualizada automaticamente."}
              </div>
              {upload.error_message ? <p className="mt-4 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{upload.error_message}</p> : null}
            </div>

            <div className="space-y-6">
              <section className="panel p-6">
                <h3 className="text-xl font-semibold">Gerar relatório</h3>
                <div className="mt-5 space-y-4">
                  <input className="field" value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} placeholder="Título do relatório" />
                  <select className="field" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                    <option value="">Sem modelo</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>

                  {selectedTemplate ? (
                    <div className="rounded-3xl bg-canvas/80 p-4 text-sm text-ink">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Modelo aplicado</p>
                      <p className="mt-2 font-medium">{selectedTemplate.name}</p>
                      <p className="mt-2 text-slate">{selectedTemplate.description}</p>
                      <div className="mt-4 grid gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Objetivo</p>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs leading-6 text-ink">{selectedTemplate.base_prompt}</pre>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Estrutura que a IA vai preencher</p>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-white p-3 text-xs leading-6 text-ink">
                            {selectedTemplate.example_output ?? "Esse modelo não tem exemplo salvo. A IA vai usar apenas o prompt."}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <textarea className="field min-h-28" value={customRequest} onChange={(event) => setCustomRequest(event.target.value)} placeholder="Ex.: mantenha o modelo, destaque riscos e próximos passos." />
                  <textarea className="field min-h-24" value={additionalInstructions} onChange={(event) => setAdditionalInstructions(event.target.value)} placeholder="Instruções adicionais opcionais" />
                  <button className="button-primary w-full" type="button" disabled={submitting || !upload.transcription_text} onClick={() => void createReport()}>
                    {submitting ? "Gerando relatório..." : "Gerar relatório"}
                  </button>
                  {reportError ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{reportError}</p> : null}
                </div>
              </section>

              <section className="panel p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold">Relatórios gerados</h3>
                    <p className="mt-1 text-sm text-slate">Baixe em texto ou markdown a partir do conteúdo já salvo.</p>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {reports.length ? (
                    reports.map((report) => (
                      <article key={report.id} className="rounded-3xl border border-black/5 bg-canvas/70 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium">{report.title}</p>
                            <p className="mt-1 text-sm text-slate">{formatDate(report.created_at)} • {report.generator_engine}</p>
                          </div>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => {
                              const blob = new Blob([report.content], { type: "text/plain;charset=utf-8" });
                              const url = URL.createObjectURL(blob);
                              const anchor = document.createElement("a");
                              anchor.href = url;
                              anchor.download = `${report.title}.${report.output_format === "markdown" ? "md" : "txt"}`;
                              anchor.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            Baixar
                          </button>
                        </div>
                        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-xs leading-6 text-ink">{report.content}</pre>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-black/10 p-5 text-sm text-slate">Nenhum relatório gerado para esta transcrição.</div>
                  )}
                </div>
              </section>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
