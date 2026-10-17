"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

import { CREDITS_CHANGE_EVENT } from "@/lib/credits";
import { getCredits } from "@/services/api";
import type { CreditStatus } from "@/types/api";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";
// Web pessoal: senha única, sem planos nem cobrança.
const isPersonalMode = process.env.NEXT_PUBLIC_PERSONAL_MODE === "1";

/** Saldo de créditos do mês da conta logada na web. Atualiza depois de cada ação que cobra. */
export function useCredits() {
  const { status } = useSession();
  const enabled = !isDesktopMode && !isPersonalMode && status === "authenticated";
  const [credits, setCredits] = useState<CreditStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCredits(await getCredits());
    } catch {
      // Mantém o último saldo conhecido: um erro de rede não deve sumir com o medidor.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(CREDITS_CHANGE_EVENT, onChange);
    // Processamentos em segundo plano cobram a duração depois: confere ao voltar para a aba.
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(CREDITS_CHANGE_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [enabled, refresh]);

  return { enabled, credits: enabled ? credits : null, refresh };
}
