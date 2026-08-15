import type { WorkspacePlan } from "@/lib/billing-plans";

/**
 * Admin usa a chave de IA do proprio dono do sistema, entao nao passa pelo
 * limite de creditos: o teto real e a cota configurada no Google AI Studio.
 */
export const ADMIN_PLAN: WorkspacePlan = "enterprise";

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return getAdminEmails().includes(email.trim().toLowerCase());
}
