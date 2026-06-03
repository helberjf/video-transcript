/**
 * Seed de demonstração — cria dois usuários de teste (admin e cliente)
 * com senhas definidas pelas variáveis de ambiente:
 *   DEMO_ADMIN_PASSWORD  (padrão: Admin@2026)
 *   DEMO_CLIENT_PASSWORD (padrão: Cliente@2026)
 *
 * Executar:
 *   cd frontend && npx tsx prisma/seed.ts
 */

import "dotenv/config";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: "../.env.vercel" });

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/modeloia",
});
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = "admin@modeloia.com";
const CLIENT_EMAIL = "cliente@modeloia.com";
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? "Admin@2026";
const CLIENT_PASSWORD = process.env.DEMO_CLIENT_PASSWORD ?? "Cliente@2026";

async function upsertUser(email: string, name: string, password: string) {
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, password: hashed },
    update: { password: hashed, name },
  });

  await prisma.workspace.upsert({
    where: { id: `seed-${user.id}` },
    create: {
      id: `seed-${user.id}`,
      clientName: name,
      ownerName: name,
      ownerEmail: email,
      segment: "Demo",
      plan: "trial",
      billingStatus: "trialing",
      ownerId: user.id,
    },
    update: {},
  });

  return user;
}

async function main() {
  console.log("🌱 Criando usuários de demonstração...");

  const admin = await upsertUser(ADMIN_EMAIL, "Admin ModeloIA", ADMIN_PASSWORD);
  const client = await upsertUser(CLIENT_EMAIL, "Cliente Demo", CLIENT_PASSWORD);

  console.log("\n✅ Usuários criados com sucesso!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ACESSO ADMINISTRADOR");
  console.log(`  Email  : ${admin.email}`);
  console.log(`  Senha  : ${ADMIN_PASSWORD}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ACESSO CLIENTE");
  console.log(`  Email  : ${client.email}`);
  console.log(`  Senha  : ${CLIENT_PASSWORD}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n  Use /acesso para fazer login com essas credenciais.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
