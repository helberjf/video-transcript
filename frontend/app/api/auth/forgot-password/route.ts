import crypto from "node:crypto";
import { Resend } from "resend";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { email } = body as Record<string, unknown>;

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }

  // Always respond with the same message to avoid user enumeration
  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.password) {
    // Delete any existing tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({ data: { email, token, expires } });

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
