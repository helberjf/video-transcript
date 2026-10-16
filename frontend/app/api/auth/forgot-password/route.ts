import crypto from "node:crypto";
import { Resend } from "resend";
import { NextResponse } from "next/server";

import { normalizeEmail } from "@/lib/auth/validation";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, clientIp, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function POST(request: Request) {
  const byIp = await consumeRateLimit("forgot-ip", clientIp(request.headers), RATE_LIMITS.forgotPasswordPerIp);
  if (!byIp.allowed) {
    return tooManyRequests(byIp.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email = normalizeEmail((body as Record<string, unknown>).email);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  // Limite por email evita encher a caixa de alguem com links. A resposta e a mesma para nao
  // revelar se o email tem conta.
  const byEmail = await consumeRateLimit("forgot-email", email, RATE_LIMITS.forgotPasswordPerEmail);
  if (!byEmail.allowed) {
    return NextResponse.json({ ok: true });
  }

  // Always respond with the same message to avoid user enumeration
  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });

  if (user?.password && user.email) {
    // Delete any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email: user.email } });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({ data: { email: user.email, token, expires } });

    const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    const resend = getResend();

    if (resend) {
      const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";
      await resend.emails.send({
        from,
        to: email,
        subject: "Redefinição de senha — ModeloIA",
        html: `<p>Clique no link abaixo para redefinir sua senha (válido por 1 hora):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Se você não solicitou isso, ignore este email.</p>`,
        text: `Clique no link abaixo para redefinir sua senha (válido por 1 hora):\n\n${resetUrl}\n\nSe você não solicitou isso, ignore este email.`,
      });
    } else if (process.env.NODE_ENV === "development") {
      // Log reset URL in development when no Resend key is configured
      console.info(`[RESET PASSWORD DEV] ${resetUrl}`);
    }
  }

  return NextResponse.json({ ok: true });
}
