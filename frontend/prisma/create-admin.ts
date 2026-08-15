/**
 * Cria (ou atualiza) a conta de administrador a partir do .env.
 *
 *   ADMIN_EMAIL=voce@email.com
 *   ADMIN_PASSWORD=<a senha que voce escolher>
 *   ADMIN_EMAILS=voce@email.com     # lista de admins sem limite de creditos
 *
 * Uso: npm run admin:create
 *
 * A senha nunca fica no repositorio: e lida do ambiente e gravada como hash.
 */
import "dotenv/config";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: "../.env" });

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { ADMIN_PLAN } from "../lib/admin";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/modeloia",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "Administrador").trim();

  if (!email) {
    throw new Error("Defina ADMIN_EMAIL no .env antes de rodar este script.");
  }
  if (password.length < 8) {
    throw new Error("Defina ADMIN_PASSWORD no .env com pelo menos 8 caracteres.");
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(email)) {
    console.warn(
      `[aviso] ${email} nao esta em ADMIN_EMAILS. A conta sera criada, mas so fica sem limite de creditos depois de adicionar o email nessa variavel.`,
    );
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, password: hashed, emailVerified: new Date() },
    update: { name, password: hashed },
  });

  const workspaceId = email
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);

  const workspace = await prisma.workspace.upsert({
    where: { id: workspaceId },
    create: {
      id: workspaceId,
      clientName: name,
      ownerName: name,
      ownerEmail: email,
      segment: "Administracao",
      plan: ADMIN_PLAN,
      billingStatus: "active",
      ownerId: user.id,
    },
    update: { ownerId: user.id, plan: ADMIN_PLAN, billingStatus: "active" },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: { workspaceId: workspace.id, userId: user.id, role: "owner" },
    update: { role: "owner" },
  });

  console.log(`Admin pronto: ${email}`);
  console.log(`Workspace: ${workspace.id} (plano ${workspace.plan}, sem limite de creditos)`);
  console.log("Entre em /acesso com esse email e a senha do ADMIN_PASSWORD.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
