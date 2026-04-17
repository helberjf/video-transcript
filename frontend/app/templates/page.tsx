"use client";

import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { createTemplate, deleteTemplate, duplicateTemplate, getTemplates, updateTemplate } from "@/services/api";
import type { ReportTemplate } from "@/types/api";

const emptyForm = {
  name: "",
  description: "",
  category: "",
  base_prompt: "",
  example_output: "",
  complementary_instructions: "",
  output_format: "markdown",
  is_favorite: false,
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
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
  };

  const submit = async () => {
    const payload = {
      ...form,
      example_output: form.example_output || null,
      complementary_instructions: form.complementary_instructions || null,
    };

    try {
      if (editingId) {
        await updateTemplate(editingId, payload);
      } else {
        await createTemplate(payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar modelo");
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Modelos"
        title="Modelos que a IA analisa e preenche"
        description="Crie um prompt com o objetivo do relatório e cole um modelo-exemplo. Na geração, a IA vai analisar essa estrutura e preencher cada seção com base na transcrição do áudio."
      />

      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="panel p-6">
          <h3 className="text-xl font-semibold">{editingId ? "Editar modelo" : "Novo modelo"}</h3>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <select className="field" value={form.output_format} onChange={(event) => setForm((current) => ({ ...current, output_format: event.target.value }))}>
                <option value="markdown">Markdown</option>
                <option value="text">Texto</option>
              </select>
              <label className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm">
                <input type="checkbox" checked={form.is_favorite} onChange={(event) => setForm((current) => ({ ...current, is_favorite: event.target.checked }))} />
                Marcar como favorito
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="button-primary" type="button" onClick={() => void submit()}>{editingId ? "Salvar alterações" : "Criar modelo"}</button>
              <button className="button-secondary" type="button" onClick={resetForm}>Limpar</button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {templates.map((template) => (
            <article key={template.id} className="panel p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-semibold">{template.name}</h3>
                    {template.is_favorite ? <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ink">favorito</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate">{template.description}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate">{template.category} • {template.output_format}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setEditingId(template.id);
                      setForm({
                        name: template.name,
                        description: template.description,
                        category: template.category,
                        base_prompt: template.base_prompt,
                        example_output: template.example_output ?? "",
                        complementary_instructions: template.complementary_instructions ?? "",
                        output_format: template.output_format,
                        is_favorite: template.is_favorite,
                      });
                    }}
                  >
                    Editar
                  </button>
                  <button type="button" className="button-secondary" onClick={() => void duplicateTemplate(template.id).then(load)}>
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

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl bg-canvas/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Objetivo para a IA</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-ink">{template.base_prompt}</pre>
                </div>
                <div className="rounded-2xl bg-canvas/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Modelo-exemplo</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-ink">
                    {template.example_output ?? "Sem modelo-exemplo salvo. A IA usará apenas o prompt."}
                  </pre>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
