"use client";

import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { TemplateVariableSelector, type ManualTemplateDraft } from "@/components/template-variable-selector";
import { appendWorkspaceActivity } from "@/lib/workspace-store";
import {
  analyzeTemplateReference,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  extractTemplateReferenceText,
  getTemplates,
  updateTemplate,
} from "@/services/api";
import type { FormFieldSpec, FormFieldType, ReportTemplate } from "@/types/api";

interface TemplateFormState {
  name: string;
  description: string;
  category: string;
  base_prompt: string;
  example_output: string;
  complementary_instructions: string;
  output_format: string;
  is_favorite: boolean;
  form_fields: FormFieldSpec[];
}

type FieldReviewStatus = "correct" | "needs_adjustment";

const emptyForm: TemplateFormState = {
  name: "",
  description: "",
  category: "",
  base_prompt: "",
  example_output: "",
  complementary_instructions: "",
  output_format: "markdown",
  is_favorite: false,
  form_fields: [],
};

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "date", label: "Data" },
  { value: "number", label: "Numero" },
];

function slugifyKey(raw: string): string {
  const normalized = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");
  return normalized.slice(0, 80) || "campo";
}

function downloadBase64File(base64: string, filename: string): void {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [manualEditorOpen, setManualEditorOpen] = useState(false);
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Record<string, boolean>>({});
  const [readingTemplateId, setReadingTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceName, setReferenceName] = useState("");
  const [referenceDescription, setReferenceDescription] = useState("");
  const [referenceCategory, setReferenceCategory] = useState("Formulario");
  const [referenceDraft, setReferenceDraft] = useState<TemplateFormState | null>(null);
  const [referenceSource, setReferenceSource] = useState<{
    filename: string;
    format: string;
    convertedDocxFilename: string | null;
    convertedDocxBase64: string | null;
  } | null>(null);
  const [referenceFieldReview, setReferenceFieldReview] = useState<Record<string, FieldReviewStatus>>({});
  const [referenceText, setReferenceText] = useState("");
  const [referenceTextSource, setReferenceTextSource] = useState<{ filename: string; format: string } | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualTemplateDraft>({
    exampleOutput: "",
    formFields: [],
    selectedCount: 0,
  });
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setTemplates(await getTemplates());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar modelos");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setManualEditorOpen(false);
  };

  const startEditingTemplate = (template: ReportTemplate) => {
    setEditingId(template.id);
    setManualEditorOpen(true);
    setForm({
      name: template.name,
      description: template.description,
      category: template.category,
      base_prompt: template.base_prompt,
      example_output: template.example_output ?? "",
      complementary_instructions: template.complementary_instructions ?? "",
      output_format: template.output_format,
      is_favorite: template.is_favorite,
      form_fields: template.form_fields ?? [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleTemplateExpanded = (templateId: string) => {
    setExpandedTemplateIds((current) => ({ ...current, [templateId]: !current[templateId] }));
  };

  const updateField = (index: number, patch: Partial<FormFieldSpec>) => {
    setForm((current) => ({
      ...current,
      form_fields: current.form_fields.map((field, position) => (position === index ? { ...field, ...patch } : field)),
    }));
  };

  const removeField = (index: number) => {
    setForm((current) => ({
      ...current,
      form_fields: current.form_fields.filter((_, position) => position !== index),
    }));
  };

  const addField = () => {
    setForm((current) => ({
      ...current,
      form_fields: [
        ...current.form_fields,
        { key: `campo_${current.form_fields.length + 1}`, label: "Novo campo", type: "text", placeholder: null, required: false, help: null },
      ],
    }));
  };

  const submit = async () => {
    const payload = {
      ...form,
      example_output: form.example_output || null,
      complementary_instructions: form.complementary_instructions || null,
      form_fields: form.form_fields.length > 0 ? form.form_fields : null,
    };

    try {
      const action = editingId ? "Modelo atualizado" : "Modelo criado";
      if (editingId) {
        const updated = await updateTemplate(editingId, payload);
        appendWorkspaceActivity({
          type: "template",
          title: action,
          description: `${updated.name} foi salvo no workspace.`,
          href: "/templates",
        });
      } else {
        const created = await createTemplate(payload);
        appendWorkspaceActivity({
          type: "template",
          title: action,
          description: `${created.name} foi criado manualmente.`,
          href: "/templates",
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar modelo");
    }
  };

  const submitReference = async () => {
    if (!referenceFile) {
      setReferenceError("Escolha um documento ou imagem para a IA analisar.");
      return;
    }

    setReferenceBusy(true);
    setReferenceError(null);
    setReferenceMessage(null);
    setReferenceDraft(null);
    setReferenceSource(null);
    setReferenceText("");
    setReferenceTextSource(null);
    setManualDraft({ exampleOutput: "", formFields: [], selectedCount: 0 });

    try {
      const analysis = await analyzeTemplateReference(referenceFile, {
        name: referenceName,
        description: referenceDescription,
        category: referenceCategory,
      });
      setReferenceDraft({
        name: analysis.name,
        description: analysis.description,
        category: analysis.category,
        base_prompt: analysis.base_prompt,
        example_output: analysis.example_output ?? "",
        complementary_instructions: analysis.complementary_instructions ?? "",
        output_format: analysis.output_format,
        is_favorite: false,
        form_fields: analysis.form_fields ?? [],
      });
      setReferenceName(analysis.name);
      setReferenceDescription(analysis.description);
      setReferenceCategory(analysis.category);
      setReferenceSource({
        filename: analysis.source_filename,
        format: analysis.source_format,
        convertedDocxFilename: analysis.converted_docx_filename,
        convertedDocxBase64: analysis.converted_docx_base64,
      });
      setReferenceFieldReview(
        Object.fromEntries((analysis.form_fields ?? []).map((field) => [field.key, "correct" as FieldReviewStatus])),
      );
      setReferenceMessage(`A IA detectou ${analysis.form_fields?.length ?? 0} campo(s). Revise e confirme antes de criar o modelo.`);
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : "Falha ao analisar modelo por IA.");
    } finally {
      setReferenceBusy(false);
    }
  };

  const openReferenceAsText = async () => {
    if (!referenceFile) {
      setReferenceError("Escolha um documento para abrir como texto.");
      return;
    }

    setReferenceBusy(true);
    setReferenceError(null);
    setReferenceMessage(null);

    try {
      const extracted = await extractTemplateReferenceText(referenceFile);
      setReferenceText(extracted.content);
      setReferenceTextSource({
        filename: extracted.source_filename,
        format: extracted.source_format,
      });
      setManualDraft({ exampleOutput: extracted.content, formFields: [], selectedCount: 0 });
      setReferenceMessage("Documento aberto como texto. Clique nas palavras que devem virar campos alteraveis.");
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : "Falha ao abrir arquivo como texto.");
    } finally {
      setReferenceBusy(false);
    }
  };

  const applyManualDraftToReference = () => {
    if (!referenceText.trim()) {
      setReferenceError("Abra um arquivo como texto antes de aplicar a selecao.");
      return;
    }
    if (!manualDraft.selectedCount) {
      setReferenceError("Selecione pelo menos uma palavra alteravel no texto.");
      return;
    }

    const filename = referenceTextSource?.filename ?? referenceFile?.name ?? "documento";
    const baseName = filename.replace(/\.[^.]+$/, "").trim() || "Documento";
    const draft: TemplateFormState = {
      name: referenceName || `Modelo ${baseName}`,
      description: referenceDescription || "Modelo criado com selecao manual de palavras alteraveis.",
      category: referenceCategory || "Formulario",
      base_prompt:
        "Preencha o documento preservando a estrutura original. " +
        "Substitua somente os placeholders selecionados manualmente e use 'Nao informado' quando faltar dado.",
      example_output: manualDraft.exampleOutput,
      complementary_instructions: "Os campos foram marcados manualmente no texto original.",
      output_format: "markdown",
      is_favorite: false,
      form_fields: manualDraft.formFields,
    };
    setReferenceDraft(draft);
    setReferenceSource({
      filename,
      format: referenceTextSource?.format ?? "texto",
      convertedDocxFilename: null,
      convertedDocxBase64: null,
    });
    setReferenceFieldReview(Object.fromEntries(draft.form_fields.map((field) => [field.key, "correct" as FieldReviewStatus])));
    setReferenceMessage(`${draft.form_fields.length} palavra(s) aplicada(s) como campo(s) alteravel(is). Revise e crie o modelo.`);
    setReferenceError(null);
  };

  const updateReferenceDraft = (patch: Partial<TemplateFormState>) => {
    setReferenceDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updateReferenceDraftField = (index: number, patch: Partial<FormFieldSpec>) => {
    setReferenceDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        form_fields: current.form_fields.map((field, position) => (position === index ? { ...field, ...patch } : field)),
      };
    });
  };

  const addReferenceDraftField = () => {
    setReferenceDraft((current) => {
      if (!current) {
        return current;
      }
      const key = `campo_${current.form_fields.length + 1}`;
      setReferenceFieldReview((reviews) => ({ ...reviews, [key]: "needs_adjustment" }));
      return {
        ...current,
        form_fields: [...current.form_fields, { key, label: "Novo campo", type: "text", placeholder: null, required: false, help: null }],
      };
    });
  };

  const removeReferenceDraftField = (index: number) => {
    setReferenceDraft((current) => {
      if (!current) {
        return current;
      }
      const removed = current.form_fields[index];
      if (removed) {
        setReferenceFieldReview((reviews) => {
          const next = { ...reviews };
          delete next[removed.key];
          return next;
        });
      }
      return { ...current, form_fields: current.form_fields.filter((_, position) => position !== index) };
    });
  };

  const createReferenceTemplate = async () => {
    if (!referenceDraft) {
      setReferenceError("Analise um arquivo antes de criar o modelo.");
      return;
    }

    setReferenceBusy(true);
    setReferenceError(null);
    setReferenceMessage(null);

    try {
      const created = await createTemplate({
        ...referenceDraft,
        example_output: referenceDraft.example_output || null,
        complementary_instructions: referenceDraft.complementary_instructions || null,
        form_fields: referenceDraft.form_fields.length > 0 ? referenceDraft.form_fields : null,
      });
      setTemplates((current) => [created, ...current.filter((template) => template.id !== created.id)]);
      setReferenceFile(null);
      setReferenceDraft(null);
      setReferenceSource(null);
      setReferenceName("");
      setReferenceDescription("");
      setReferenceCategory("Formulario");
      setReferenceFieldReview({});
      appendWorkspaceActivity({
        type: "template",
        title: "Modelo revisado criado",
        description: `${created.name} foi aprovado apos revisao humana.`,
        href: "/templates",
      });
      setReferenceMessage(`Modelo "${created.name}" criado com os campos revisados.`);
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : "Falha ao criar modelo revisado.");
    } finally {
      setReferenceBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Modelos"
        title="Modelos que a IA analisa e preenche"
        description="Envie um documento modelo. A IA extrai a estrutura e uma lista de campos variaveis que podem virar um formulario rapido na pagina Formularios."
      />

      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      <section className="panel p-6">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sand">Criacao assistida</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">Gerar modelo por documento ou imagem</h3>
            <p className="mt-2 text-sm leading-6 text-slate">
              Envie um contrato, ficha, formulario, PDF, DOCX ou imagem. A IA analisa a estrutura, cria os placeholders e sugere os campos variaveis para o formulario rapido.
            </p>
          </div>

          <div className="space-y-4">
            <input
              className="field"
              type="file"
              accept=".txt,.md,.markdown,.csv,.odt,.docx,.pdf,.png,.jpg,.jpeg,.webp,image/*"
              onChange={(event) => {
                setReferenceFile(event.target.files?.[0] ?? null);
                setReferenceError(null);
                setReferenceMessage(null);
                setReferenceDraft(null);
                setReferenceSource(null);
                setReferenceText("");
                setReferenceTextSource(null);
                setManualDraft({ exampleOutput: "", formFields: [], selectedCount: 0 });
              }}
            />
            {referenceFile ? <p className="text-sm text-slate">Referencia selecionada: {referenceFile.name}</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <input
                className="field"
                value={referenceName}
                onChange={(event) => setReferenceName(event.target.value)}
                placeholder="Nome opcional do modelo"
              />
              <input
                className="field"
                value={referenceCategory}
                onChange={(event) => setReferenceCategory(event.target.value)}
                placeholder="Categoria"
              />
            </div>
            <input
              className="field"
              value={referenceDescription}
              onChange={(event) => setReferenceDescription(event.target.value)}
              placeholder="Descricao opcional"
            />
            <div className="flex flex-wrap gap-3">
              <button className="button-primary" type="button" disabled={referenceBusy} onClick={() => void submitReference()}>
                {referenceBusy ? "Analisando referencia..." : "Analisar campos com IA"}
              </button>
              <button className="button-secondary" type="button" disabled={referenceBusy || !referenceFile} onClick={() => void openReferenceAsText()}>
                Abrir arquivo como texto
              </button>
            </div>
            {referenceMessage ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{referenceMessage}</p> : null}
            {referenceError ? <p className="rounded-2xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">{referenceError}</p> : null}
          </div>
        </div>

        {referenceText ? (
          <div className="mt-6 border-t border-white/10 pt-6">
            <TemplateVariableSelector
              sourceText={referenceText}
              sourceLabel={
                referenceTextSource
                  ? `Arquivo aberto: ${referenceTextSource.filename} (${referenceTextSource.format.toUpperCase()})`
                  : "Arquivo aberto como texto"
              }
              keyPrefix="templates-reference-text"
              onDraftChange={setManualDraft}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="button-primary" type="button" disabled={!manualDraft.selectedCount} onClick={applyManualDraftToReference}>
                Usar palavras selecionadas no modelo
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => {
                  setReferenceText("");
                  setReferenceTextSource(null);
                  setManualDraft({ exampleOutput: "", formFields: [], selectedCount: 0 });
                }}
              >
                Fechar texto
              </button>
            </div>
          </div>
        ) : null}

        {referenceDraft ? (
          <div className="mt-6 border-t border-white/10 pt-6">
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Revisao da IA</p>
                {referenceSource ? (
                  <p className="text-sm leading-6 text-slate">
                    Arquivo: {referenceSource.filename} ({referenceSource.format.toUpperCase()})
                  </p>
                ) : null}
                {referenceSource?.convertedDocxBase64 && referenceSource.convertedDocxFilename ? (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => downloadBase64File(referenceSource.convertedDocxBase64 ?? "", referenceSource.convertedDocxFilename ?? "documento-convertido.docx")}
                  >
                    Baixar DOCX convertido
                  </button>
                ) : null}
                <input
                  className="field"
                  value={referenceDraft.name}
                  onChange={(event) => updateReferenceDraft({ name: event.target.value })}
                  placeholder="Nome do modelo"
                />
                <input
                  className="field"
                  value={referenceDraft.description}
                  onChange={(event) => updateReferenceDraft({ description: event.target.value })}
                  placeholder="Descricao"
                />
                <input
                  className="field"
                  value={referenceDraft.category}
                  onChange={(event) => updateReferenceDraft({ category: event.target.value })}
                  placeholder="Categoria"
                />
                <textarea
                  className="field min-h-32"
                  value={referenceDraft.example_output}
                  onChange={(event) => updateReferenceDraft({ example_output: event.target.value })}
                  placeholder="Modelo com placeholders"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Campos detectados</p>
                  <button className="button-secondary" type="button" onClick={addReferenceDraftField}>
                    Adicionar campo
                  </button>
                </div>

                {referenceDraft.form_fields.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate">
                    A IA nao encontrou campos. Voce pode adicionar manualmente antes de criar o modelo.
                  </p>
                ) : (
                  referenceDraft.form_fields.map((field, index) => (
                    <div key={`${field.key}-${index}`} className="rounded-xl border border-white/10 bg-midnight/30 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <select
                          className="field max-w-[220px]"
                          value={referenceFieldReview[field.key] ?? "correct"}
                          onChange={(event) =>
                            setReferenceFieldReview((current) => ({
                              ...current,
                              [field.key]: event.target.value as FieldReviewStatus,
                            }))
                          }
                        >
                          <option value="correct" className="text-midnight">Campo correto</option>
                          <option value="needs_adjustment" className="text-midnight">Precisa ajustar</option>
                        </select>
                        <button className="text-xs text-ember" type="button" onClick={() => removeReferenceDraftField(index)}>
                          Remover
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_0.8fr]">
                        <input
                          className="field"
                          value={field.label}
                          placeholder="Rotulo"
                          onChange={(event) => {
                            const label = event.target.value;
                            updateReferenceDraftField(index, { label, key: field.key || slugifyKey(label) });
                          }}
                        />
                        <input
                          className="field"
                          value={field.key}
                          placeholder="chave_interna"
                          onChange={(event) => updateReferenceDraftField(index, { key: slugifyKey(event.target.value) })}
                        />
                        <select
                          className="field"
                          value={field.type}
                          onChange={(event) => updateReferenceDraftField(index, { type: event.target.value as FormFieldType })}
                        >
                          {FIELD_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value} className="text-midnight">
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        className="field mt-2"
                        value={field.placeholder ?? ""}
                        placeholder="Dica de preenchimento"
                        onChange={(event) => updateReferenceDraftField(index, { placeholder: event.target.value || null })}
                      />
                      <input
                        className="field mt-2"
                        value={field.help ?? ""}
                        placeholder="Explicacao auxiliar"
                        onChange={(event) => updateReferenceDraftField(index, { help: event.target.value || null })}
                      />
                      <label className="mt-2 flex items-center gap-2 text-xs text-slate">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) => updateReferenceDraftField(index, { required: event.target.checked })}
                        />
                        Obrigatorio
                      </label>
                    </div>
                  ))
                )}

                <div className="flex flex-wrap gap-3">
                  <button className="button-primary" type="button" disabled={referenceBusy} onClick={() => void createReferenceTemplate()}>
                    Criar modelo revisado
                  </button>
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={referenceBusy}
                    onClick={() => {
                      setReferenceDraft(null);
                      setReferenceSource(null);
                      setReferenceFieldReview({});
                    }}
                  >
                    Descartar analise
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="panel p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold">{editingId ? "Editar modelo" : "Editor manual"}</h3>
              <p className="mt-2 text-sm leading-6 text-slate">
                Abra somente quando precisar criar ou ajustar um modelo manualmente.
              </p>
            </div>
            <button
              className="button-secondary"
              type="button"
              onClick={() => {
                if (manualEditorOpen) {
                  resetForm();
                  return;
                }
                setManualEditorOpen(true);
              }}
            >
              {manualEditorOpen ? "Minimizar editor" : "Novo modelo manual"}
            </button>
          </div>

          {manualEditorOpen ? (
          <div className="mt-5 space-y-4">
            <input className="field" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do modelo" />
            <input className="field" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição curta do uso desse modelo" />
            <input className="field" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Categoria" />
            <textarea
              className="field min-h-28"
              value={form.base_prompt}
              onChange={(event) => setForm((current) => ({ ...current, base_prompt: event.target.value }))}
              placeholder="Explique para a IA o objetivo do relatório e o que ela deve extrair da transcrição."
            />
            <textarea
              className="field min-h-40"
              value={form.example_output}
              onChange={(event) => setForm((current) => ({ ...current, example_output: event.target.value }))}
              placeholder="Cole aqui um modelo pronto, com a estrutura que a IA deve seguir ao preencher o relatório."
            />
            <textarea
              className="field min-h-24"
              value={form.complementary_instructions}
              onChange={(event) => setForm((current) => ({ ...current, complementary_instructions: event.target.value }))}
              placeholder="Instruções complementares, por exemplo: marque campos ausentes como 'Não informado na transcrição'."
            />

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Campos do formulario</p>
                  <p className="mt-1 text-xs text-slate">Cada item aparece como um input individual na pagina Formularios.</p>
                </div>
                <button className="button-secondary" type="button" onClick={addField}>
                  Adicionar campo
                </button>
              </div>

              {form.form_fields.length === 0 ? (
                <p className="mt-4 text-sm text-slate">
                  Nenhum campo definido. A IA tenta preencher automaticamente ao analisar um documento de referencia, ou voce pode adicionar manualmente.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {form.form_fields.map((field, index) => (
                    <div key={index} className="rounded-xl border border-white/10 bg-midnight/30 p-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_0.8fr]">
                        <input
                          className="field"
                          value={field.label}
                          placeholder="Rotulo"
                          onChange={(event) => {
                            const label = event.target.value;
                            updateField(index, { label, key: field.key || slugifyKey(label) });
                          }}
                        />
                        <input
                          className="field"
                          value={field.key}
                          placeholder="chave_interna"
                          onChange={(event) => updateField(index, { key: slugifyKey(event.target.value) })}
                        />
                        <select
                          className="field"
                          value={field.type}
                          onChange={(event) => updateField(index, { type: event.target.value as FormFieldType })}
                        >
                          {FIELD_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value} className="text-midnight">
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        className="field mt-2"
                        value={field.placeholder ?? ""}
                        placeholder="Dica de preenchimento (placeholder)"
                        onChange={(event) => updateField(index, { placeholder: event.target.value || null })}
                      />
                      <input
                        className="field mt-2"
                        value={field.help ?? ""}
                        placeholder="Explicacao auxiliar (aparece abaixo do campo)"
                        onChange={(event) => updateField(index, { help: event.target.value || null })}
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs text-slate">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(event) => updateField(index, { required: event.target.checked })}
                          />
                          Obrigatorio
                        </label>
                        <button className="text-xs text-ember" type="button" onClick={() => removeField(index)}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <select className="field" value={form.output_format} onChange={(event) => setForm((current) => ({ ...current, output_format: event.target.value }))}>
                <option value="markdown">Markdown</option>
                <option value="text">Texto</option>
              </select>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                <input type="checkbox" checked={form.is_favorite} onChange={(event) => setForm((current) => ({ ...current, is_favorite: event.target.checked }))} />
                Marcar como favorito
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="button-primary" type="button" onClick={() => void submit()}>{editingId ? "Salvar alterações" : "Criar modelo"}</button>
              <button className="button-secondary" type="button" onClick={resetForm}>Limpar</button>
            </div>
          </div>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-slate">
              O editor manual esta minimizado. Use "Novo modelo manual" ou o botao "Editar" de um modelo para abrir os dados.
            </div>
          )}
        </section>

        <section className="space-y-4">
          {templates.map((template) => (
            <article key={template.id} className="panel p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-semibold">{template.name}</h3>
                    {template.is_favorite ? <span className="rounded-full border border-sand/20 bg-sand/10 px-3 py-1 text-xs font-semibold text-sand">favorito</span> : null}
                    {template.form_fields && template.form_fields.length > 0 ? (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {template.form_fields.length} campo(s)
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate">{template.description}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate">{template.category} • {template.output_format}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => startEditingTemplate(template)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() =>
                      void duplicateTemplate(template.id).then((created) => {
                        appendWorkspaceActivity({
                          type: "template",
                          title: "Modelo duplicado",
                          description: `${created.name} foi criado a partir de ${template.name}.`,
                          href: "/templates",
                        });
                        return load();
                      })
                    }
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void updateTemplate(template.id, { is_favorite: !template.is_favorite }).then(load)}
                  >
                    {template.is_favorite ? "Desfavoritar" : "Favoritar"}
                  </button>
                  <button type="button" className="button-danger" onClick={() => void deleteTemplate(template.id).then(load)}>
                    Excluir
                  </button>
                </div>
              </div>

              <details className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-sand">
                  Maximizar / minimizar dados do modelo
                </summary>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Objetivo para a IA</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-ink">{template.base_prompt}</pre>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Modelo-exemplo</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-ink">
                      {template.example_output ?? "Sem modelo-exemplo salvo. A IA usara apenas o prompt."}
                    </pre>
                  </div>
                </div>

                {template.form_fields && template.form_fields.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Campos do formulario</p>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {template.form_fields.map((field) => (
                        <li key={field.key} className="rounded-lg border border-white/5 bg-midnight/30 px-3 py-2 text-xs leading-5 text-ink">
                          <span className="font-semibold">{field.label}</span>
                          <span className="ml-2 text-slate">({field.type}{field.required ? " - obrigatorio" : ""})</span>
                          <div className="text-slate">chave: {field.key}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </details>

              <details className="mt-3 rounded-lg border border-sand/20 bg-sand/[0.07] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-sand">Modo leitura</summary>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-lg font-semibold">{template.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate">{template.description}</p>
                  </div>
                  <button className="button-primary" type="button" onClick={() => startEditingTemplate(template)}>
                    Editar este modelo
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-midnight/45 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate">Categoria</p>
                    <p className="mt-2 text-sm font-semibold">{template.category}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-midnight/45 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate">Campos</p>
                    <p className="mt-2 text-sm font-semibold">{template.form_fields?.length ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-midnight/45 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate">Saida</p>
                    <p className="mt-2 text-sm font-semibold">{template.output_format}</p>
                  </div>
                </div>
              </details>

              {readingTemplateId === template.id ? (
                <div className="mt-4 rounded-lg border border-sand/20 bg-sand/[0.07] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sand">Modo leitura</p>
                      <h4 className="mt-2 text-lg font-semibold">{template.name}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate">{template.description}</p>
                    </div>
                    <button className="button-primary" type="button" onClick={() => startEditingTemplate(template)}>
                      Editar este modelo
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-white/10 bg-midnight/45 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate">Categoria</p>
                      <p className="mt-2 text-sm font-semibold">{template.category}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-midnight/45 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate">Campos</p>
                      <p className="mt-2 text-sm font-semibold">{template.form_fields?.length ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-midnight/45 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate">Saida</p>
                      <p className="mt-2 text-sm font-semibold">{template.output_format}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {expandedTemplateIds[template.id] ? (
                <>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Objetivo para a IA</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-ink">{template.base_prompt}</pre>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Modelo-exemplo</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-ink">
                    {template.example_output ?? "Sem modelo-exemplo salvo. A IA usará apenas o prompt."}
                  </pre>
                </div>
              </div>

              {template.form_fields && template.form_fields.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Campos do formulario</p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {template.form_fields.map((field) => (
                      <li key={field.key} className="rounded-xl border border-white/5 bg-midnight/30 px-3 py-2 text-xs leading-5 text-ink">
                        <span className="font-semibold">{field.label}</span>
                        <span className="ml-2 text-slate">({field.type}{field.required ? " • obrigatorio" : ""})</span>
                        <div className="text-slate">chave: {field.key}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
                </>
              ) : null}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
