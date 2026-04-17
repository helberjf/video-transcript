"use client";

import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { getSettings, getTemplates, updateSettings } from "@/services/api";
import type { ReportTemplate, SettingsRead } from "@/types/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [form, setForm] = useState({
    openai_api_key: "",
    gemini_api_key: "",
    default_report_template_id: "",
    whisper_model: "medium",
    export_directory: "",
    preferred_language: "pt-BR",
    max_upload_mb: 500,
    auto_cleanup_temp_files: true,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getSettings(), getTemplates()])
      .then(([settingsData, templateData]) => {
        setSettings(settingsData);
        setTemplates(templateData);
        setForm((current) => ({
          ...current,
          default_report_template_id: settingsData.default_report_template_id ?? "",
          whisper_model: settingsData.whisper_model,
          export_directory: settingsData.export_directory ?? "",
          preferred_language: settingsData.preferred_language,
          max_upload_mb: settingsData.max_upload_mb,
          auto_cleanup_temp_files: settingsData.auto_cleanup_temp_files,
        }));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const save = async () => {
    try {
      const payload = {
        ...form,
        default_report_template_id: form.default_report_template_id || null,
        export_directory: form.export_directory || null,
        openai_api_key: form.openai_api_key || null,
        gemini_api_key: form.gemini_api_key || null,
      };
      const updated = await updateSettings(payload);
      setSettings(updated);
      setMessage("Configurações salvas com sucesso.");
      setError(null);
      setForm((current) => ({ ...current, openai_api_key: "", gemini_api_key: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações");
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Configurações"
        title="Credenciais, limites e comportamento local"
        description="As chaves de API ficam apenas no backend. Também é possível ajustar idioma padrão, modelo Whisper, template padrão, pasta de exportação e limpeza automática."
      />

      {message ? <div className="panel p-6 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="panel p-6 text-sm text-ember">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="panel p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">OpenAI API key</label>
              <input className="field" value={form.openai_api_key} onChange={(event) => setForm((current) => ({ ...current, openai_api_key: event.target.value }))} placeholder={settings?.openai_api_key_masked ?? "sk-..."} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">Gemini API key</label>
              <input className="field" value={form.gemini_api_key} onChange={(event) => setForm((current) => ({ ...current, gemini_api_key: event.target.value }))} placeholder={settings?.gemini_api_key_masked ?? "AIza..."} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Whisper local</label>
              <input className="field" value={form.whisper_model} onChange={(event) => setForm((current) => ({ ...current, whisper_model: event.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Idioma preferido</label>
              <input className="field" value={form.preferred_language} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Template padrão</label>
              <select className="field" value={form.default_report_template_id} onChange={(event) => setForm((current) => ({ ...current, default_report_template_id: event.target.value }))}>
                <option value="">Sem padrão</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Limite máximo de upload (MB)</label>
              <input className="field" type="number" value={form.max_upload_mb} onChange={(event) => setForm((current) => ({ ...current, max_upload_mb: Number(event.target.value) }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">Pasta padrão para exportação</label>
              <input className="field" value={form.export_directory} onChange={(event) => setForm((current) => ({ ...current, export_directory: event.target.value }))} placeholder="C:\\Relatorios" />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm">
                <input type="checkbox" checked={form.auto_cleanup_temp_files} onChange={(event) => setForm((current) => ({ ...current, auto_cleanup_temp_files: event.target.checked }))} />
                Apagar arquivos temporários automaticamente
              </label>
            </div>
          </div>
          <button className="button-primary mt-6" type="button" onClick={() => void save()}>Salvar configurações</button>
        </div>

        <div className="panel p-6">
          <h3 className="text-xl font-semibold">Estado atual</h3>
          <div className="mt-5 space-y-3 text-sm text-slate">
            <p>OpenAI: {settings?.openai_api_key_masked ?? "não configurada"}</p>
            <p>Gemini: {settings?.gemini_api_key_masked ?? "não configurada"}</p>
            <p>Whisper: {settings?.whisper_model ?? "-"}</p>
            <p>Idioma: {settings?.preferred_language ?? "-"}</p>
            <p>Limite de upload: {settings?.max_upload_mb ?? 0} MB</p>
            <p>Exportação: {settings?.export_directory ?? "-"}</p>
            <p>Limpeza automática: {settings?.auto_cleanup_temp_files ? "ativada" : "desativada"}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
