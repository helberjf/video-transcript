"use client";

import { useEffect, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { LANGUAGE_OPTIONS, TRANSCRIPTION_PROVIDER_LABELS, WHISPER_MODEL_OPTIONS } from "@/lib/transcription-options";
import { getSettings, getTemplates, updateSettings } from "@/services/api";
import type { ReportProvider, ReportTemplate, SettingsRead, TranscriptionProvider } from "@/types/api";

const REPORT_PROVIDER_LABELS: Record<ReportProvider, string> = {
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  local: "Fallback local",
};

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(targetIndex, 0, item);
  return next;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [form, setForm] = useState({
    openai_api_key: "",
    gemini_api_key: "",
    claude_api_key: "",
    default_report_template_id: "",
    whisper_model: "medium",
    transcription_provider_order: ["openai", "gemini", "whisper"] as TranscriptionProvider[],
    report_provider_order: ["openai", "claude", "gemini", "local"] as ReportProvider[],
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
          transcription_provider_order: settingsData.transcription_provider_order,
          report_provider_order: settingsData.report_provider_order,
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
        claude_api_key: form.claude_api_key || null,
        transcription_provider_order: form.transcription_provider_order,
        report_provider_order: form.report_provider_order,
      };
      const updated = await updateSettings(payload);
      setSettings(updated);
      setMessage("Configurações salvas com sucesso.");
      setError(null);
      setForm((current) => ({ ...current, openai_api_key: "", gemini_api_key: "", claude_api_key: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações");
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Configurações"
        title="Credenciais e preferências"
        description="As chaves de API ficam apenas no backend."
      />

      {message ? <div className="panel p-6 text-sm text-emerald-200">{message}</div> : null}
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
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium">Claude API key</label>
              <input className="field" value={form.claude_api_key} onChange={(event) => setForm((current) => ({ ...current, claude_api_key: event.target.value }))} placeholder={settings?.claude_api_key_masked ?? "sk-ant-..."} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Whisper local</label>
              <select className="field" value={form.whisper_model} onChange={(event) => setForm((current) => ({ ...current, whisper_model: event.target.value }))}>
                {WHISPER_MODEL_OPTIONS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Idioma preferido</label>
              <select className="field" value={form.preferred_language} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))}>
                {LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </select>
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
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                <input type="checkbox" checked={form.auto_cleanup_temp_files} onChange={(event) => setForm((current) => ({ ...current, auto_cleanup_temp_files: event.target.checked }))} />
                Apagar arquivos temporários automaticamente
              </label>
            </div>
            <div className="md:col-span-2 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-ink">Ordem de transcrição</p>
              <div className="mt-4 space-y-3">
                {form.transcription_provider_order.map((provider, index) => (
                  <div key={provider} className="flex items-center justify-between rounded-2xl border border-white/10 bg-midnight/35 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">{index + 1}. {TRANSCRIPTION_PROVIDER_LABELS[provider]}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="button-secondary" onClick={() => setForm((current) => ({ ...current, transcription_provider_order: moveItem(current.transcription_provider_order, index, -1) }))} disabled={index === 0}>Subir</button>
                      <button type="button" className="button-secondary" onClick={() => setForm((current) => ({ ...current, transcription_provider_order: moveItem(current.transcription_provider_order, index, 1) }))} disabled={index === form.transcription_provider_order.length - 1}>Descer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-ink">Ordem de geração de relatórios</p>
              <div className="mt-4 space-y-3">
                {form.report_provider_order.map((provider, index) => (
                  <div key={provider} className="flex items-center justify-between rounded-2xl border border-white/10 bg-midnight/35 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">{index + 1}. {REPORT_PROVIDER_LABELS[provider]}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="button-secondary" onClick={() => setForm((current) => ({ ...current, report_provider_order: moveItem(current.report_provider_order, index, -1) }))} disabled={index === 0}>Subir</button>
                      <button type="button" className="button-secondary" onClick={() => setForm((current) => ({ ...current, report_provider_order: moveItem(current.report_provider_order, index, 1) }))} disabled={index === form.report_provider_order.length - 1}>Descer</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button className="button-primary mt-6" type="button" onClick={() => void save()}>Salvar configurações</button>
        </div>

        <div className="panel p-6">
          <h3 className="text-xl font-semibold">Estado atual</h3>
          <div className="mt-5 space-y-3 text-sm text-slate">
            <p>OpenAI: {settings?.openai_api_key_masked ?? "não configurada"}</p>
            <p>Gemini: {settings?.gemini_api_key_masked ?? "não configurada"}</p>
            <p>Claude: {settings?.claude_api_key_masked ?? "não configurada"}</p>
            <p>Whisper: {settings?.whisper_model ?? "-"}</p>
            <p>Ordem da transcrição: {settings?.transcription_provider_order.map((provider) => TRANSCRIPTION_PROVIDER_LABELS[provider]).join(" → ") ?? "-"}</p>
            <p>Ordem do relatório: {settings?.report_provider_order.map((provider) => REPORT_PROVIDER_LABELS[provider]).join(" → ") ?? "-"}</p>
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
