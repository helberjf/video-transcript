"use client";

import { useEffect, useState } from "react";

import type { DesktopUpdatesBridge } from "@/lib/recording/desktop-bridge";

/** So aparece no app desktop: mostra a versao instalada e procura atualizacoes sob demanda. */
export function DesktopUpdatesCard() {
  const [updates, setUpdates] = useState<DesktopUpdatesBridge | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const bridge = window.modeloiaDesktop?.updates ?? null;
    setUpdates(bridge);
    void bridge?.getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  if (!updates) {
    return null;
  }

  async function check() {
    setChecking(true);
    try {
      await updates?.check();
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h4 className="font-semibold">Aplicativo desktop</h4>
      <p className="mt-2 text-sm text-slate">
        Versao instalada: {version ?? "-"}. O app procura atualizacoes sozinho sempre que abre.
      </p>
      <button type="button" className="button-secondary mt-4" onClick={() => void check()} disabled={checking}>
        {checking ? "Verificando..." : "Verificar atualizacoes"}
      </button>
    </div>
  );
}
