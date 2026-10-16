import { isAdminEmail } from "@/lib/admin";

/**
 * Qual chave de IA a conta usa na web. O backend recebe isto no token e decide a chave:
 * - admin: dono do sistema, usa e configura a chave global;
 * - shared: liberado pelo admin para usar a chave dele (sem poder vê-la);
 * - own: usa a própria chave, guardada criptografada no backend.
 */
export type AiKeyAccess = "admin" | "shared" | "own";

export function getAiKeyAccess(user: { email: string | null; useOwnerAiKey: boolean }): AiKeyAccess {
  if (isAdminEmail(user.email)) {
    return "admin";
  }
  return user.useOwnerAiKey ? "shared" : "own";
}
