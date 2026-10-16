import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { validatePassword } from "@/lib/auth/validation";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = await consumeRateLimit("reset-ip", clientIp(request.headers), RATE_LIMITS.resetPasswordPerIp);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfterSeconds);
  }

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
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record || record.expires < new Date()) {
    return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password as string, 12);

  await prisma.user.update({
    where: { email: record.email },
    data: { password: hashed },
  });

  await prisma.passwordResetToken.delete({ where: { token } });

  return NextResponse.json({ ok: true });
}
