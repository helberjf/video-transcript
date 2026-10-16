import { SignJWT } from "jose";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAiKeyAccess } from "@/lib/ai-key-access";
import { authOptions } from "@/lib/auth";
import { getPlanCreditLimit } from "@/lib/billing-plans";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { GATE_COOKIE, isGateEnabled, isGateSessionValid, isSameOriginRequest } from "@/lib/site-gate";
import { ensureWorkspaceForUser, getCurrentMonthCredits } from "@/lib/workspace-db";

export const runtime = "nodejs";

function getBackendAuthSecret() {
  const secret =
    process.env.BACKEND_AUTH_SECRET ??
    (process.env.NODE_ENV === "development" ? "modeloia-dev-backend-secret" : undefined);

  if (!secret) {
    throw new Error("BACKEND_AUTH_SECRET nao configurado.");
  }

  return new TextEncoder().encode(secret);
}

/** Modo pessoal: sem contas nem Prisma. Quem passou pela senha recebe o token do workspace único. */
async function personalToken(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Requisição recusada." }, { status: 403 });
  }
  const cookieStore = await cookies();
  if (!(await isGateSessionValid(cookieStore.get(GATE_COOKIE)?.value))) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
  }
  const workspaceId = "pessoal";
  const token = await new SignJWT({ workspaceId, plan: "enterprise", aiKeyAccess: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(workspaceId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getBackendAuthSecret());
  return NextResponse.json({ token, workspaceId, plan: "enterprise", aiKeyAccess: "admin", creditsLimit: null, creditsUsed: 0 });
}

export async function GET(request: Request) {
  if (isGateEnabled()) {
    return personalToken(request);
  }
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Login necessario." }, { status: 401 });
  }

  const limit = await consumeRateLimit("backend-token", userId, RATE_LIMITS.backendTokenPerUser);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfterSeconds);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 401 });
  }

  const workspace = await ensureWorkspaceForUser(user);
  // Lido do banco a cada token (5 min): liberar ou tirar a chave do admin vale logo.
  const aiKeyAccess = getAiKeyAccess(user);
  // Quem usa a propria chave paga o provedor direto, entao o plano nao limita.
  const creditsLimit = aiKeyAccess === "own" ? null : getPlanCreditLimit(workspace.plan);
  const creditsUsed = await getCurrentMonthCredits(workspace.id);
  const token = await new SignJWT({
    email: user.email,
    workspaceId: workspace.id,
    plan: workspace.plan,
    aiKeyAccess,
    creditsLimit,
    creditsUsed,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getBackendAuthSecret());

  return NextResponse.json({
    token,
    workspaceId: workspace.id,
    plan: workspace.plan,
    aiKeyAccess,
    creditsLimit,
    creditsUsed,
  });
}
