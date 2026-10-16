import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { normalizeEmail, validateEmail, validateName, validatePassword } from "@/lib/auth/validation";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { ensureWorkspaceForUser } from "@/lib/workspace-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Cadastro aberto: o limite por IP corta a criacao de contas em massa por script.
  const limit = await consumeRateLimit("register-ip", clientIp(request.headers), RATE_LIMITS.registerPerIp);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfterSeconds, "Muitos cadastros deste endereço. Tente de novo mais tarde.");
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const error = validateName(body.name) ?? validateEmail(email) ?? validatePassword(body.password);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existing) {
    return NextResponse.json({ error: "Este email já tem conta. Entre ou recupere a senha." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name: (body.name as string).trim(),
      email,
      password: await bcrypt.hash(body.password as string, 12),
      emailVerified: null,
    },
  });

  await ensureWorkspaceForUser({ id: user.id, email: user.email, name: user.name });

  return NextResponse.json({ ok: true }, { status: 201 });
}
