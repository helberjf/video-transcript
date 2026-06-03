import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { token, password } = body as Record<string, unknown>;

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 8 caracteres." }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record || record.expires < new Date()) {
    return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { email: record.email },
    data: { password: hashed },
  });

  await prisma.passwordResetToken.delete({ where: { token } });

  return NextResponse.json({ ok: true });
}
