"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { AiKeyNotice, SharedAiKeyNotice } from "@/components/ai-key-notice";
import { AuthCard, FormError } from "@/components/auth-card";
import { AI_KEY_CHANGE_EVENT, hasAnyAiKey, useAiKeyStatus } from "@/hooks/use-ai-key-status";
import { updateSettings } from "@/services/api";
import type { SettingsRead } from "@/types/api";

type Provider = "gemini" | "openai" | "claude";

const PROVIDERS: Record<
  Provider,
  {
    label: string;
    field: "gemini_api_key" | "openai_api_key" | "claude_api_key";
    masked: keyof Pick<SettingsRead, "gemini_api_key_masked" | "openai_api_key_masked" | "claude_api_key_masked">;
    url: string;
    hint: string;
  }
> = {
  gemini: {
    label: "Google Gemini",
    field: "gemini_api_key",
    masked: "gemini_api_key_masked",
    url: "https://aistudio.google.com/app/apikey",
    hint: "Tem uso gratuito com limite diário. Começa com AIza.",
  },
  openai: {
    label: "OpenAI",
    field: "openai_api_key",
    masked: "openai_api_key_masked",
    url: "https://platform.openai.com/api-keys",
    hint: "Cobrança por uso na conta da OpenAI. Começa com sk-.",
  },
  claude: {
    label: "Anthropic Claude",
    field: "claude_api_key",
    masked: "claude_api_key_masked",
    url: "https://platform.claude.com/settings/keys",
    hint: "Usada em relatórios e resumos (não transcreve áudio). Começa com sk-ant-.",
  },
};

const PROVIDER_IDS = Object.keys(PROVIDERS) as Provider[];

export default function ChaveIaPage() {
  const { loaded, settings, access, refresh } = useAiKeyStatus();
  const [provider, setProvider] = useState<Provider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isNewAccount, setIsNewAccount] = useState(false);

  useEffect(() => {
    setIsNewAccount(new URLSearchParams(window.location.search).get("novo") === "1");
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = apiKey.trim();
    if (value.length < 20) {
      setError("Cole a chave completa, como aparece no site do provedor.");
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateSettings({ [PROVIDERS[provider].field]: value });
      setApiKey("");
      setSaved(true);
      await refresh();
      window.dispatchEvent(new Event(AI_KEY_CHANGE_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a chave.");
    } finally {
      setSaving(false);
    }
  };

  const configured = PROVIDER_IDS.filter((item) => settings?.[PROVIDERS[item].masked]);
  const ready = loaded && Boolean(settings) && (access !== "own" || hasAnyAiKey(settings));

  return (
    <AuthCard
      eyebrow={isNewAccount ? "Passo 2 de 2" : "Chave de IA"}
      title="Conecte a sua chave de IA"
      description="Transcrições, resumos e relatórios usam a chave de IA da sua conta. Cadastre pelo menos uma."
      footer={
        <>
          <Link href="/tutorial" className="text-aqua hover:underline">
            Como criar uma chave
          </Link>
          {ready ? (
            <Link href="/" className="text-slate hover:underline">
              Ir para o início
            </Link>
          ) : null}
        </>
      }
    >
      {!loaded ? <p className="text-sm text-slate">Carregando...</p> : null}

      {loaded && !settings ? (
        <FormError message="Não foi possível falar com o servidor agora. Recarregue a página em instantes." />
      ) : null}

      {loaded && access === "shared" ? <SharedAiKeyNotice /> : null}

      {loaded && (access === "admin" || access === "local") ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate">
          Esta conta usa a chave do sistema, configurada em{" "}
          <Link href="/settings" className="text-aqua hover:underline">
            Ajustes
          </Link>
          .
        </p>
      ) : null}

      {loaded && access === "own" ? (
        <div className="space-y-5">
          {configured.length ? (
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">
              {configured.map((item) => (
                <p key={item}>
                  {PROVIDERS[item].label}: {settings?.[PROVIDERS[item].masked]}
                </p>
              ))}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <div>
              <label htmlFor="provider" className="mb-2 block text-sm font-medium text-ink">
                Provedor
              </label>
              <select id="provider" className="field" value={provider} onChange={(event) => setProvider(event.target.value as Provider)}>
                {PROVIDER_IDS.map((item) => (
                  <option key={item} value={item}>
                    {PROVIDERS[item].label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-slate">
                {PROVIDERS[provider].hint}{" "}
                <a className="text-aqua hover:underline" href={PROVIDERS[provider].url} target="_blank" rel="noreferrer">
                  Criar chave
                </a>
              </p>
            </div>
            <div>
              <label htmlFor="api-key" className="mb-2 block text-sm font-medium text-ink">
                Chave de API
              </label>
              <input
                id="api-key"
                className="field font-mono"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={settings?.[PROVIDERS[provider].masked] ?? "Cole a chave aqui"}
              />
            </div>

            <AiKeyNotice />

            <FormError message={error} />
            {saved ? (
              <p className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">
                Chave salva com criptografia.
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="button-primary flex-1" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar chave"}
              </button>
              {ready ? (
                <Link className="button-secondary flex-1" href="/">
                  Continuar
                </Link>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </AuthCard>
  );
}
