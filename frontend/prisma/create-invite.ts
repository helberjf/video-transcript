/**
 * Gera codigos de convite para distribuir.
 *
 *   npm run invite:create                          # 1 codigo, 1 uso
 *   npm run invite:create -- --uses 10             # 1 codigo para 10 pessoas
 *   npm run invite:create -- --count 5 --dias 30   # 5 codigos, expiram em 30 dias
 *   npm run invite:create -- --listar              # mostra os codigos existentes
 */
import "dotenv/config";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: "../.env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { generateInviteCode } from "../lib/invite-codes";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/modeloia",
});
const prisma = new PrismaClient({ adapter });

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readNumber(name: string, fallback: number): number {
  const raw = readOption(name);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function list() {
  const invites = await prisma.inviteCode.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  if (invites.length === 0) {
    console.log("Nenhum convite criado ainda.");
    return;
  }

  for (const invite of invites) {
    const status = invite.disabledAt
      ? "desativado"
      : invite.expiresAt && invite.expiresAt.getTime() < Date.now()
        ? "expirado"
        : invite.uses >= invite.maxUses
          ? "esgotado"
          : "ativo";
    const validade = invite.expiresAt ? invite.expiresAt.toISOString().slice(0, 10) : "sem prazo";
    console.log(`${invite.code}  ${invite.uses}/${invite.maxUses}  ${status.padEnd(11)} ${validade}  ${invite.note ?? ""}`);
  }
}

async function main() {
  if (process.argv.includes("--listar")) {
    await list();
    return;
  }

  const count = readNumber("count", 1);
  const maxUses = readNumber("uses", 1);
  const days = Number(readOption("dias"));
  const note = readOption("nota");
  const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  for (let index = 0; index < count; index += 1) {
    const invite = await prisma.inviteCode.create({
      data: { code: generateInviteCode(), maxUses, expiresAt, note: note ?? null },
    });
    console.log(invite.code);
  }

  console.log(
    `\n${count} convite(s) criado(s) | ${maxUses} uso(s) cada | ${
      expiresAt ? `valido ate ${expiresAt.toISOString().slice(0, 10)}` : "sem prazo de validade"
    }`,
  );
  console.log("Envie o codigo e peca para a pessoa criar a conta em /cadastro.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
