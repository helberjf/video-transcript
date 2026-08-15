import { randomBytes } from "crypto";

import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// Sem I, O, 0 e 1 para o codigo continuar legivel quando ditado por telefone.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class InviteError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InviteError";
    this.status = status;
  }
}

export function normalizeInviteCode(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateInviteCode(groups = 3, groupSize = 4): string {
  const bytes = randomBytes(groups * groupSize);
  const chars = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  const parts: string[] = [];
  for (let index = 0; index < groups; index += 1) {
    parts.push(chars.slice(index * groupSize, (index + 1) * groupSize).join(""));
  }
  return parts.join("-");
}

/** Convite valido, ainda dentro do prazo e com uso disponivel. */
export async function findUsableInvite(code: string) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) {
    throw new InviteError("Informe o codigo de convite.");
  }

  const invite = await prisma.inviteCode.findUnique({ where: { code: normalized } });
  if (!invite || invite.disabledAt) {
    throw new InviteError("Codigo de convite invalido.");
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new InviteError("Este convite expirou.");
  }
  if (invite.uses >= invite.maxUses) {
    throw new InviteError("Este convite ja atingiu o limite de usos.");
  }

  return invite;
}

/**
 * Consome um uso do convite de forma atomica: a condicao `uses < maxUses` faz
 * parte do UPDATE, entao dois cadastros simultaneos nao furam o limite.
 */
export async function redeemInvite(code: string, email: string, userId?: string) {
  const invite = await findUsableInvite(code);
  const normalizedEmail = email.trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    const consumed = await tx.inviteCode.updateMany({
      where: { id: invite.id, uses: { lt: invite.maxUses } },
      data: { uses: { increment: 1 } },
    });

    if (consumed.count === 0) {
      throw new InviteError("Este convite ja atingiu o limite de usos.");
    }

    await tx.inviteRedemption.create({
      data: { inviteCodeId: invite.id, email: normalizedEmail, userId: userId ?? null },
    });

    return invite;
  });
}

/** Emails que ja entraram por convite (ou o admin) podem usar login social. */
export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) {
    return false;
  }
  if (isAdminEmail(email)) {
    return true;
  }

  const normalized = email.trim().toLowerCase();
  const [user, redemption] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalized } }),
    prisma.inviteRedemption.findFirst({ where: { email: normalized } }),
  ]);

  return Boolean(user || redemption);
}
