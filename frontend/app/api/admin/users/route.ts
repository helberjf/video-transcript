import { NextResponse } from "next/server";

import { getAiKeyAccess } from "@/lib/ai-key-access";
import { getAdminSession } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/site-gate";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: "Nao encontrado." }, { status: 404 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, name: true, email: true, useOwnerAiKey: true, createdAt: true, accounts: { select: { provider: true } } },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      providers: Array.from(new Set(["credentials", ...user.accounts.map((account) => account.provider)])),
      aiKeyAccess: getAiKeyAccess(user),
    })),
  });
}

/** Libera ou tira de uma conta o uso da chave de IA do admin. */
export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Requisição recusada." }, { status: 403 });
  }
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Nao encontrado." }, { status: 404 });
  }

  const limit = await consumeRateLimit("admin-write", session.user.email, RATE_LIMITS.adminWritePerUser);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfterSeconds);
  }

  const body = (await request.json().catch(() => null)) as { userId?: unknown; useOwnerAiKey?: unknown } | null;
  if (typeof body?.userId !== "string" || typeof body.useOwnerAiKey !== "boolean") {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const user = await prisma.user
    .update({ where: { id: body.userId }, data: { useOwnerAiKey: body.useOwnerAiKey } })
    .catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, aiKeyAccess: getAiKeyAccess(user) });
}
