"use client";

import { useEffect, useRef, useState } from "react";

import { SectionHeader } from "@/components/section-header";
import { LANGUAGE_OPTIONS, TRANSCRIPTION_PROVIDER_LABELS, WHISPER_MODEL_OPTIONS } from "@/lib/transcription-options";
import { formatBytes } from "@/lib/utils";
import {
  cancelInstagramLogin,
  deleteCookies,
  getCookiesStatus,
  getInstagramLoginStatus,
  getSettings,
  getTemplates,
  startInstagramLogin,
  updateSettings,
  uploadCookiesFile,
} from "@/services/api";
import type {
  CookiesStatus,
  InstagramLoginState,
  InstagramLoginStatus,
  ReportProvider,
  ReportTemplate,
  SettingsRead,
  TranscriptionProvider,
} from "@/types/api";

const INSTAGRAM_LOGIN_LABELS: Record<InstagramLoginState, string> = {
  idle: "",
  launching: "Abrindo navegador controlado...",
  waiting_login: "Faca login na janela aberta. O app captura os cookies automaticamente quando voce terminar.",
  extracting: "Capturando cookies da sessao...",
  completed: "Cookies do Instagram salvos com sucesso.",
  error: "Falha no login.",
  canceled: "Login cancelado.",
};

function isLoginInProgress(state: InstagramLoginState): boolean {
  return state === "launching" || state === "waiting_login" || state === "extracting";
}

function formatCookiesUpdatedAt(value: string | null): string {
  if (!value) {
    return "-";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const REPORT_PROVIDER_LABELS: Record<ReportProvider, string> = {
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini",
  local: "Fallback local",
};

const API_KEY_CONTROLS = [
  {
    field: "openai_api_key",
    maskedField: "openai_api_key_masked",
    label: "OpenAI API key",
    placeholder: "sk-...",
  },
  {
    field: "gemini_api_key",
    maskedField: "gemini_api_key_masked",
    label: "Gemini API key",
    placeholder: "AIza...",
  },
  {
    field: "claude_api_key",
    maskedField: "claude_api_key_masked",
    label: "Claude API key",
    placeholder: "sk-ant-...",
  },
] as const;

type ApiKeyField = (typeof API_KEY_CONTROLS)[number]["field"];

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
  const [cookiesStatus, setCookiesStatus] = useState<CookiesStatus | null>(null);
  const [cookiesBusy, setCookiesBusy] = useState(false);
  const [cookiesMessage, setCookiesMessage] = useState<string | null>(null);
  const [cookiesError, setCookiesError] = useState<string | null>(null);
  const cookiesInputRef = useRef<HTMLInputElement | null>(null);
  const [instagramLogin, setInstagramLogin] = useState<InstagramLoginStatus>({
    state: "idle",
    message: null,
    cookies: null,
  });
  const instagramPollRef = useRef<number | null>(null);

  useEffect(() => {
    void Promise.all([getSettings(), getTemplates(), getCookiesStatus(), getInstagramLoginStatus()])
      .then(([settingsData, templateData, cookiesData, loginData]) => {
        setSettings(settingsData);
        setTemplates(templateData);
        setCookiesStatus(cookiesData);
        setInstagramLogin(loginData);
        if (isLoginInProgress(loginData.state)) {
          startInstagramPolling();
        }
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (window.location.hash === "#cookies") {
      requestAnimationFrame(() => {
        document.getElementById("cookies")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const handleCookiesUpload = async (file: File) => {
    setCookiesBusy(true);
    setCookiesError(null);
    setCookiesMessage(null);
    try {
      const next = await uploadCookiesFile(file);
      setCookiesStatus(next);
      setCookiesMessage("Cookies salvos. Tente baixar o video agora.");
    } catch (err) {
      setCookiesError(err instanceof Error ? err.message : "Falha ao salvar cookies");
    } finally {
      setCookiesBusy(false);
      if (cookiesInputRef.current) {
        cookiesInputRef.current.value = "";
      }
    }
  };

  const stopInstagramPolling = () => {
    if (instagramPollRef.current !== null) {
      window.clearInterval(instagramPollRef.current);
      instagramPollRef.current = null;
    }
  };

  const startInstagramPolling = () => {
    stopInstagramPolling();
    instagramPollRef.current = window.setInterval(() => {
      void getInstagramLoginStatus()
        .then((next) => {
          setInstagramLogin(next);
          if (next.cookies) {
            setCookiesStatus(next.cookies);
          }
          if (!isLoginInProgress(next.state)) {
            stopInstagramPolling();
            if (next.state === "completed") {
              setCookiesMessage("Cookies do Instagram salvos pelo navegador controlado.");
              void getCookiesStatus().then(setCookiesStatus).catch(() => undefined);
            }
          }
        })
        .catch(() => undefined);
    }, 2000);
  };

  useEffect(() => {
    return () => stopInstagramPolling();
  }, []);

  const handleStartInstagramLogin = async () => {
    setCookiesError(null);
    setCookiesMessage(null);
    try {
      const status = await startInstagramLogin();
      setInstagramLogin(status);
      if (isLoginInProgress(status.state)) {
        startInstagramPolling();
      }
    } catch (err) {
      setCookiesError(err instanceof Error ? err.message : "Falha ao iniciar login");
    }
  };

  const handleCancelInstagramLogin = async () => {
    try {
      const status = await cancelInstagramLogin();
      setInstagramLogin(status);
      if (!isLoginInProgress(status.state)) {
        stopInstagramPolling();
      }
    } catch (err) {
      setCookiesError(err instanceof Error ? err.message : "Falha ao cancelar login");
    }
  };

  const handleCookiesDelete = async () => {
    setCookiesBusy(true);
    setCookiesError(null);
    setCookiesMessage(null);
    try {
      const next = await deleteCookies();
      setCookiesStatus(next);
      setCookiesMessage("Cookies removidos.");
    } catch (err) {
      setCookiesError(err instanceof Error ? err.message : "Falha ao remover cookies");
    } finally {
      setCookiesBusy(false);
    }
  };

  const save = async () => {
    try {
      const apiKeyPayload = API_KEY_CONTROLS.reduce<Record<string, string>>((payload, control) => {
        const value = form[control.field].trim();
        if (value) {
          payload[control.field] = value;
        }
        return payload;
      }, {});

      const payload = {
        default_report_template_id: form.default_report_template_id || null,
        whisper_model: form.whisper_model,
        transcription_provider_order: form.transcription_provider_order,
        report_provider_order: form.report_provider_order,
        export_directory: form.export_directory || null,
        preferred_language: form.preferred_language,
        max_upload_mb: form.max_upload_mb,
        auto_cleanup_temp_files: form.auto_cleanup_temp_files,
        ...apiKeyPayload,
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

  const removeApiKey = async (field: ApiKeyField, label: string) => {
    try {
      const updated = await updateSettings({ [field]: null });
      setSettings(updated);
      setForm((current) => ({ ...current, [field]: "" }));
      setMessage(`${label} removida.`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Falha ao remover ${label}`);
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
            {API_KEY_CONTROLS.map((control) => {
              const maskedValue = settings?.[control.maskedField] ?? null;
              return (
                <div key={control.field} className="md:col-span-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-sm font-medium">{control.label}</label>
                    <span className="text-xs text-slate">
                      {maskedValue ? `Configurada: ${maskedValue}` : "Nao configurada"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="field"
                      value={form[control.field]}
                      onChange={(event) => setForm((current) => ({ ...current, [control.field]: event.target.value }))}
                      placeholder={maskedValue ?? control.placeholder}
                    />
                    {maskedValue ? (
                      <button
                        type="button"
                        className="button-secondary shrink-0"
                        onClick={() => void removeApiKey(control.field, control.label)}
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
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

          <div id="cookies" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Cookies do Instagram / YouTube</p>
                <p className="mt-1 text-xs leading-5 text-slate">
                  O Instagram exige sessao logada para baixar a maioria dos Reels. Exporte um arquivo <code>cookies.txt</code> em formato Netscape (extensao &quot;Get cookies.txt LOCALLY&quot; no Chrome/Edge) com a sessao logada e envie aqui.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  cookiesStatus?.configured
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "bg-ember/15 text-ember"
                }`}
              >
                {cookiesStatus?.configured ? "Configurado" : "Nao configurado"}
              </span>
            </div>

            {cookiesStatus?.configured ? (
              <div className="mt-4 grid gap-2 text-xs text-slate sm:grid-cols-2">
                <p>Atualizado em: {formatCookiesUpdatedAt(cookiesStatus.updated_at)}</p>
                <p>Tamanho: {formatBytes(cookiesStatus.size_bytes)}</p>
                <p>Linhas com cookie: {cookiesStatus.total_lines}</p>
                <p>
                  Inclui Instagram: {cookiesStatus.has_instagram ? "sim" : "nao"} - YouTube:{" "}
                  {cookiesStatus.has_youtube ? "sim" : "nao"}
                </p>
              </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-sand/30 bg-sand/5 p-4">
              <p className="text-sm font-semibold text-ink">Login automatico (recomendado)</p>
              <p className="mt-1 text-xs leading-5 text-slate">
                O app abre uma janela controlada do Chromium em instagram.com. Voce loga normalmente, e os cookies sao capturados sem precisar de extensao no navegador.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  className="button-secondary"
                  href="https://www.instagram.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Acessar Instagram
                </a>
                {!isLoginInProgress(instagramLogin.state) ? (
                  <button
                    type="button"
                    className="button-primary"
                    disabled={cookiesBusy}
                    onClick={() => void handleStartInstagramLogin()}
                  >
                    Logar no Instagram (abre janela)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void handleCancelInstagramLogin()}
                  >
                    Cancelar login
                  </button>
                )}
              </div>
              {instagramLogin.state !== "idle" ? (
                <p
                  className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                    instagramLogin.state === "completed"
                      ? "bg-emerald-500/10 text-emerald-200"
                      : instagramLogin.state === "error"
                        ? "bg-ember/10 text-ember"
                        : "bg-white/[0.04] text-slate"
                  }`}
                >
                  {instagramLogin.message ?? INSTAGRAM_LOGIN_LABELS[instagramLogin.state]}
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-ink">Upload manual (alternativa)</p>
              <p className="mt-1 text-xs leading-5 text-slate">
                Se preferir, exporte um cookies.txt no formato Netscape e envie aqui.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <input
                  ref={cookiesInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="field max-w-md"
                  disabled={cookiesBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleCookiesUpload(file);
                    }
                  }}
                />
                {cookiesStatus?.configured ? (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={cookiesBusy}
                    onClick={() => void handleCookiesDelete()}
                  >
                    Remover cookies
                  </button>
                ) : null}
              </div>
            </div>

            {cookiesMessage ? (
              <p className="mt-3 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{cookiesMessage}</p>
            ) : null}
            {cookiesError ? (
              <p className="mt-3 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{cookiesError}</p>
            ) : null}

            {!cookiesStatus?.configured ? (
              <details className="mt-4 text-xs text-slate">
                <summary className="cursor-pointer font-semibold text-ink">Como exportar cookies do navegador</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 leading-5">
                  <li>
                    Instale a extensao &quot;Get cookies.txt LOCALLY&quot; no Chrome ou Edge (procure pelo nome exato na loja de extensoes).
                  </li>
                  <li>Faca login no instagram.com (e/ou youtube.com) no mesmo navegador.</li>
                  <li>Abra a aba do site, clique no icone da extensao e exporte como Netscape (cookies.txt).</li>
                  <li>Volte aqui e selecione o arquivo no campo acima.</li>
                </ol>
              </details>
            ) : null}
          </div>
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
            <p>
              Cookies do Instagram/YouTube:{" "}
              {cookiesStatus?.configured
                ? `configurados em ${formatCookiesUpdatedAt(cookiesStatus.updated_at)}`
                : "nao configurados"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
