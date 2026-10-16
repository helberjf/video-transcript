"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

import { getSettings } from "@/services/api";
import type { SettingsRead } from "@/types/api";

export const AI_KEY_CHANGE_EVENT = "modeloia:ai-key-change";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";
const isPersonalMode = process.env.NEXT_PUBLIC_PERSONAL_MODE === "1";

export function hasAnyAiKey(settings: SettingsRead | null): boolean {
  return Boolean(settings?.openai_api_key_masked || settings?.gemini_api_key_masked || settings?.claude_api_key_masked);
}

/** Configuração de IA da conta logada na web. Fica parado no desktop e no modo de senha única. */
export function useAiKeyStatus() {
  const { status } = useSession();
  const enabled = !isDesktopMode && !isPersonalMode && status === "authenticated";
  const [settings, setSettings] = useState<SettingsRead | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSettings(await getSettings());
    } catch {
      setSettings(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(AI_KEY_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(AI_KEY_CHANGE_EVENT, onChange);
  }, [enabled, refresh]);

  const access = settings?.ai_key_access ?? null;
  return {
    enabled,
    loaded,
    settings,
    access,
    /** Conta que precisa da própria chave e ainda não cadastrou nenhuma. */
    missingKey: enabled && loaded && access === "own" && !hasAnyAiKey(settings),
    refresh,
  };
}
