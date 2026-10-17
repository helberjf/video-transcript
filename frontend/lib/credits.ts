import type { CreditStatus } from "@/types/api";

export const CREDITS_CHANGE_EVENT = "modeloia:credits-change";

// O modo ao vivo manda uma janela a cada 6 s: junta os avisos para nao consultar o saldo a cada uma.
const NOTIFY_DELAY_MS = 1_500;
let pendingNotify: number | undefined;

/** Avisa o medidor de créditos que uma ação pode ter cobrado (ou faltou saldo). */
export function notifyCreditsChanged(): void {
  if (typeof window === "undefined" || pendingNotify !== undefined) {
    return;
  }
  pendingNotify = window.setTimeout(() => {
    pendingNotify = undefined;
    window.dispatchEvent(new Event(CREDITS_CHANGE_EVENT));
  }, NOTIFY_DELAY_MS);
}

export function isOutOfCredits(status: CreditStatus | null): boolean {
  return Boolean(status && status.limit !== null && (status.remaining ?? 0) <= 0);
}

export function creditUsageRatio(status: CreditStatus): number {
  if (status.limit === null || status.limit <= 0) {
    return status.limit === 0 ? 1 : 0;
  }
  return Math.min(1, status.used / status.limit);
}

export function unlimitedLabel(status: CreditStatus): string {
  if (status.unlimited_reason === "own_key") {
    return "Sua chave de IA: sem limite de créditos";
  }
  if (status.unlimited_reason === "desktop") {
    return "App local: sem limite de créditos";
  }
  return "Plano sem limite de créditos";
}

export function formatResetDate(status: CreditStatus): string {
  return new Date(status.resets_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}
