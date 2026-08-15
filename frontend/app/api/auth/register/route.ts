import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { InviteError, findUsableInvite, redeemInvite } from "@/lib/invite-codes";
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

  const { name, email, password, inviteCode } = body as Record<string, unknown>;

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

  // O admin usa a propria chave de IA e nao precisa de convite.
  const needsInvite = !isAdminEmail(email);
  if (needsInvite) {
    try {
      await findUsableInvite(inviteCode as string);
    } catch (error) {
      if (error instanceof InviteError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
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

  if (needsInvite) {
    try {
      await redeemInvite(inviteCode as string, email, user.id);
    } catch (error) {
      // Sem o convite consumido a conta nao pode existir: desfaz o cadastro.
      await prisma.user.delete({ where: { id: user.id } });
      if (error instanceof InviteError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }

  await ensureWorkspaceForUser({ id: user.id, email: user.email ?? null, name: user.name ?? null });

  return NextResponse.json({ ok: true }, { status: 201 });
}
