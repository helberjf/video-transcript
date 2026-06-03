import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureWorkspaceForUser } from "@/lib/workspace-db";

export const runtime = "nodejs";

const CNPJ_RE = /^\d{14}$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { name, cnpj, propertyName, city } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 3) {
    return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
  }
  if (typeof cnpj !== "string" || !CNPJ_RE.test(cnpj)) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }
  if (typeof propertyName !== "string" || propertyName.trim().length === 0) {
    return NextResponse.json({ error: "Nome do imóvel é obrigatório." }, { status: 400 });
  }
  if (typeof city !== "string" || city.trim().length === 0) {
    return NextResponse.json({ error: "Cidade é obrigatória." }, { status: 400 });
  }

  // Check for duplicate CNPJ
  const existing = await prisma.workspace.findFirst({ where: { cnpj } });
  if (existing) {
    return NextResponse.json({ error: "Este CNPJ já está cadastrado." }, { status: 409 });
  }

  // Create a pending workspace for the owner (linked to user after Google login)
  const workspaceId = `cnpj-${cnpj}`;
  await prisma.workspace.upsert({
    where: { id: workspaceId },
    create: {
      id: workspaceId,
      clientName: propertyName.trim(),
      ownerName: name.trim(),
      ownerEmail: "",
      cnpj,
      segment: `Imóvel - ${city.trim()}`,
      plan: "trial",
      billingStatus: "trialing",
    },
    update: {},
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
