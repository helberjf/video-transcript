import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureWorkspaceForUser } from "@/lib/workspace-db";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { name, email, password } = body as Record<string, unknown>;

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 8 caracteres." }, { status: 400 });
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Este email já está cadastrado." }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email,
      password: hashed,
      emailVerified: null,
    },
  });

  await ensureWorkspaceForUser({ id: user.id, email: user.email ?? null, name: user.name ?? null });

  return NextResponse.json({ ok: true }, { status: 201 });
}
