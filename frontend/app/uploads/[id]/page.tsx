"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { usePollUpload } from "@/hooks/use-poll-upload";
import { formatDate, formatDuration } from "@/lib/utils";
import { generateReport, getTemplates, updateReport } from "@/services/api";
import type { ReportRead, ReportTemplate } from "@/types/api";

type ReadingModePayload = {
  title: string;
  subtitle: string;
  content: string;
  format: "plain" | "markdown";
};

type ReaderBlock =
  | { type: "heading"; text: string; level: 1 | 2 | 3 | 4 }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered: boolean };

type ExportDocumentPayload = {
  title: string;
  content: string;
};

function buildReaderBlocks(content: string, format: "plain" | "markdown"): ReaderBlock[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  if (format === "plain") {
    return normalized
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => ({
        type: "paragraph" as const,
        text: paragraph,
      }));
  }

  const blocks: ReaderBlock[] = [];
  const paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    if (!paragraphLines.length) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" ").trim(),
    });
    paragraphLines.length = 0;
  };

  const flushList = () => {
    if (!listItems.length) {
      return;
    }

    blocks.push({
      type: "list",
      items: [...listItems],
      ordered: listOrdered,
    });
    listItems = [];
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const unorderedMatch = /^[-*]\s+(.+)$/.exec(line);
    if (unorderedMatch) {
      flushParagraph();
      if (!listItems.length) {
        listOrdered = false;
      } else if (listOrdered) {
        flushList();
        listOrdered = false;
      }
      listItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (orderedMatch) {
      flushParagraph();
      if (!listItems.length) {
        listOrdered = true;
      } else if (!listOrdered) {
        flushList();
        listOrdered = true;
      }
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function ReadableContent({ content, format }: { content: string; format: "plain" | "markdown" }) {
  const blocks = buildReaderBlocks(content, format);

  if (!blocks.length) {
    return <p className="text-base leading-8 text-slate">Nada disponível para leitura.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-[15px] leading-8 text-ink sm:text-base">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const headingClassName = {
            1: "text-3xl font-semibold tracking-tight",
            2: "text-2xl font-semibold tracking-tight",
            3: "text-xl font-semibold",
            4: "text-lg font-semibold uppercase tracking-[0.12em] text-slate",
          }[block.level];

          return (
            <h4 key={`${block.type}-${index}`} className={headingClassName}>
              {block.text}
            </h4>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={`${block.type}-${index}`} className="space-y-3 pl-6 text-base leading-8 marker:text-slate">
              {block.items.map((item, itemIndex) => (
                <li key={`${block.type}-${index}-${itemIndex}`}>{item}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={`${block.type}-${index}`} className="whitespace-pre-wrap text-base leading-8 text-ink/90">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function sanitizeFilename(value: string, extension: string, fallbackBaseName = "arquivo"): string {
  const safeBaseName = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);

  return `${safeBaseName || fallbackBaseName}.${extension}`;
}

function getPlainTextExtension(report: ReportRead): string {
  return report.output_format === "markdown" ? "md" : "txt";
}

function getTranscriptionExportTitle(originalFilename: string | null | undefined): string {
  const normalizedName = (originalFilename ?? "transcrição").replace(/\.[^.]+$/, "").trim();
  return `Transcrição - ${normalizedName || "arquivo"}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadTextDocument(document: ExportDocumentPayload, extension: "txt" | "md"): void {
  const contentType = extension === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
  const blob = new Blob([document.content], { type: contentType });
  downloadBlob(blob, sanitizeFilename(document.title, extension));
}

async function downloadDocxDocument(documentData: ExportDocumentPayload): Promise<void> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");

  const headingLevelMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
  } as const;

  const children = documentData.content.replace(/\r\n/g, "\n").split("\n").map((line) => {
    const normalizedLine = line.trimEnd();
    if (!normalizedLine) {
      return new Paragraph({ text: "" });
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(normalizedLine.trim());
    if (headingMatch) {
      return new Paragraph({
        text: headingMatch[2].trim(),
        heading: headingLevelMap[headingMatch[1].length as keyof typeof headingLevelMap],
      });
    }

    return new Paragraph({
      children: [new TextRun(normalizedLine)],
    });
  });

  const document = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, sanitizeFilename(documentData.title, "docx"));
}

async function downloadPdfDocument(documentData: ExportDocumentPayload): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const topMargin = 56;
  const bottomMargin = 56;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let cursorY = topMargin;

  const ensureSpace = (lineHeight: number) => {
    if (cursorY + lineHeight <= pageHeight - bottomMargin) {
      return;
    }

    pdf.addPage();
    cursorY = topMargin;
  };

  for (const rawLine of documentData.content.replace(/\r\n/g, "\n").split("\n")) {
    const normalizedLine = rawLine.trimEnd();
    if (!normalizedLine) {
      cursorY += 10;
      continue;
    }

    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(normalizedLine.trim());
    const fontSize = headingMatch ? [20, 16, 14, 12][headingMatch[1].length - 1] : 11;
    const text = headingMatch ? headingMatch[2].trim() : normalizedLine;
    const lineHeight = fontSize + (headingMatch ? 8 : 5);

    pdf.setFont("helvetica", headingMatch ? "bold" : "normal");
    pdf.setFontSize(fontSize);

    for (const wrappedLine of pdf.splitTextToSize(text, maxWidth)) {
      ensureSpace(lineHeight);
      pdf.text(wrappedLine, marginX, cursorY);
      cursorY += lineHeight;
    }

    cursorY += headingMatch ? 2 : 4;
  }

  pdf.save(sanitizeFilename(documentData.title, "pdf"));
}

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
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingReportId, setExportingReportId] = useState<string | null>(null);
  const [transcriptionExportError, setTranscriptionExportError] = useState<string | null>(null);
  const [exportingTranscriptionFormat, setExportingTranscriptionFormat] = useState<"txt" | "md" | "docx" | "pdf" | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingModePayload | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingReportId, setSavingReportId] = useState<string | null>(null);

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

  const copyTranscription = async () => {
    if (!upload?.transcription_text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(upload.transcription_text);
      setCopyFeedback("Transcrição copiada.");
    } catch {
      setCopyFeedback("Não foi possível copiar a transcrição.");
    }
  };

  const exportReport = async (report: ReportRead, format: "text" | "docx" | "pdf") => {
    setExportError(null);
    setExportingReportId(`${report.id}:${format}`);

    try {
      const exportDocument = {
        title: report.title,
        content: report.content,
      };

      if (format === "text") {
        downloadTextDocument(exportDocument, getPlainTextExtension(report) as "txt" | "md");
        return;
      }

      if (format === "docx") {
        await downloadDocxDocument(exportDocument);
        return;
      }

      await downloadPdfDocument(exportDocument);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Falha ao exportar relatório");
    } finally {
      setExportingReportId(null);
    }
  };

  const exportTranscription = async (format: "txt" | "md" | "docx" | "pdf") => {
    if (!upload?.transcription_text) {
      return;
    }

    setTranscriptionExportError(null);
    setExportingTranscriptionFormat(format);

    try {
      const exportDocument = {
        title: getTranscriptionExportTitle(upload.original_filename),
        content: upload.transcription_text,
      };

      if (format === "txt" || format === "md") {
        downloadTextDocument(exportDocument, format);
        return;
      }

      if (format === "docx") {
        await downloadDocxDocument(exportDocument);
        return;
      }

      await downloadPdfDocument(exportDocument);
    } catch (err) {
      setTranscriptionExportError(err instanceof Error ? err.message : "Falha ao exportar transcrição");
    } finally {
      setExportingTranscriptionFormat(null);
    }
  };

  const openTranscriptionReadingMode = () => {
    setReadingMode({
      title: "Transcrição",
      subtitle: upload?.original_filename ?? "Arquivo atual",
      content: upload?.transcription_text ?? "",
      format: "plain",
    });
  };

  const openReportReadingMode = (report: ReportRead) => {
    setReadingMode({
      title: report.title,
      subtitle: `${formatDate(report.created_at)} • ${report.generator_engine}`,
      content: report.content,
      format: report.output_format === "markdown" ? "markdown" : "plain",
    });
  };

  const startRenameReport = (report: ReportRead) => {
    setEditingReportId(report.id);
    setRenameDraft(report.title);
    setRenameError(null);
  };

  const saveReportTitle = async (reportId: string) => {
    if (!renameDraft.trim()) {
      setRenameError("Informe um título para o relatório.");
      return;
    }

    setSavingReportId(reportId);
    setRenameError(null);
    try {
      const updated = await updateReport(reportId, { title: renameDraft.trim() });
      setReports((current: ReportRead[]) => current.map((report) => (report.id === reportId ? updated : report)));
      setEditingReportId(null);
      if (readingMode && reports.some((report) => report.id === reportId && readingMode.title === report.title)) {
        setReadingMode({ ...readingMode, title: updated.title });
      }
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Falha ao renomear relatório");
    } finally {
      setSavingReportId(null);
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
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="button-secondary" type="button" disabled={!upload.transcription_text} onClick={openTranscriptionReadingMode}>
                    Modo leitura
                  </button>
                  <button className="button-secondary" type="button" disabled={!upload.transcription_text} onClick={() => void copyTranscription()}>
                    Copiar transcrição
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Exportar transcrição</p>
                <div className="flex flex-wrap gap-2">
                  <button className="button-secondary" type="button" disabled={!upload.transcription_text || exportingTranscriptionFormat === "txt"} onClick={() => void exportTranscription("txt")}>
                    {exportingTranscriptionFormat === "txt" ? "Preparando..." : "TXT"}
                  </button>
                  <button className="button-secondary" type="button" disabled={!upload.transcription_text || exportingTranscriptionFormat === "md"} onClick={() => void exportTranscription("md")}>
                    {exportingTranscriptionFormat === "md" ? "Preparando..." : "MD"}
                  </button>
                  <button className="button-secondary" type="button" disabled={!upload.transcription_text || exportingTranscriptionFormat === "docx"} onClick={() => void exportTranscription("docx")}>
                    {exportingTranscriptionFormat === "docx" ? "Preparando..." : "DOCX"}
                  </button>
                  <button className="button-secondary" type="button" disabled={!upload.transcription_text || exportingTranscriptionFormat === "pdf"} onClick={() => void exportTranscription("pdf")}>
                    {exportingTranscriptionFormat === "pdf" ? "Preparando..." : "PDF"}
                  </button>
                </div>
              </div>
              <div className="mt-6 rounded-3xl bg-canvas/80 p-5 text-sm leading-7 text-ink whitespace-pre-wrap">
                {upload.transcription_text ?? "O processamento ainda está em andamento. Esta área será atualizada automaticamente."}
              </div>
              <p className="mt-4 text-xs leading-6 text-slate">Use o modo leitura para abrir a transcrição em uma visualização mais confortável, com coluna mais estreita e tipografia ampliada.</p>
              {copyFeedback ? <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate">{copyFeedback}</p> : null}
              {transcriptionExportError ? <p className="mt-4 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{transcriptionExportError}</p> : null}
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
                  <p className="text-xs leading-6 text-slate">Depois da geração, o backend salva o relatório na pasta de exportação também em DOCX e PDF.</p>
                  {reportError ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{reportError}</p> : null}
                </div>
              </section>

              <section className="panel p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold">Relatórios gerados</h3>
                    <p className="mt-1 text-sm text-slate">Baixe em markdown ou texto, ou exporte diretamente para DOCX e PDF.</p>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {reports.length ? (
                    reports.map((report) => (
                      <article key={report.id} className="rounded-3xl border border-black/5 bg-canvas/70 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            {editingReportId === report.id ? (
                              <div className="space-y-2">
                                <input className="field" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
                                <div className="flex gap-2">
                                  <button type="button" className="button-primary" disabled={savingReportId === report.id} onClick={() => void saveReportTitle(report.id)}>
                                    {savingReportId === report.id ? "Salvando..." : "Salvar nome"}
                                  </button>
                                  <button type="button" className="button-secondary" onClick={() => setEditingReportId(null)}>
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="font-medium">{report.title}</p>
                            )}
                            <p className="mt-1 text-sm text-slate">{formatDate(report.created_at)} • {report.generator_engine}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="button-secondary" onClick={() => startRenameReport(report)}>
                              Renomear
                            </button>
                            <button type="button" className="button-secondary" onClick={() => openReportReadingMode(report)}>
                              Modo leitura
                            </button>
                            <button type="button" className="button-secondary" disabled={exportingReportId === `${report.id}:text`} onClick={() => void exportReport(report, "text")}>
                              {exportingReportId === `${report.id}:text` ? "Preparando..." : getPlainTextExtension(report).toUpperCase()}
                            </button>
                            <button type="button" className="button-secondary" disabled={exportingReportId === `${report.id}:docx`} onClick={() => void exportReport(report, "docx")}>
                              {exportingReportId === `${report.id}:docx` ? "Preparando..." : "DOCX"}
                            </button>
                            <button type="button" className="button-secondary" disabled={exportingReportId === `${report.id}:pdf`} onClick={() => void exportReport(report, "pdf")}>
                              {exportingReportId === `${report.id}:pdf` ? "Preparando..." : "PDF"}
                            </button>
                          </div>
                        </div>
                        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-xs leading-6 text-ink">{report.content}</pre>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-black/10 p-5 text-sm text-slate">Nenhum relatório gerado para esta transcrição.</div>
                  )}
                  {renameError ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{renameError}</p> : null}
                  {exportError ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{exportError}</p> : null}
                </div>
              </section>
            </div>
          </section>
        </>
      ) : null}

      {readingMode ? (
        <div className="fixed inset-0 z-50 bg-ink/45 p-4 backdrop-blur-sm sm:p-6" onClick={() => setReadingMode(null)}>
          <div
            className="mx-auto flex h-full max-w-5xl items-end sm:items-center"
          >
            <div
              className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[2rem] border border-black/10 bg-[#fffdf8] shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 sm:px-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate">Leitura confortável</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{readingMode.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate">{readingMode.subtitle}</p>
                </div>
                <button className="button-secondary" type="button" onClick={() => setReadingMode(null)}>
                  Fechar
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-8 sm:px-10 sm:py-10">
                <ReadableContent content={readingMode.content} format={readingMode.format} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

