import { SignJWT } from "jose";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getPlanCreditLimit } from "@/lib/billing-plans";
import { prisma } from "@/lib/prisma";
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
  const token = await new SignJWT({ workspaceId, plan: "enterprise" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(workspaceId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getBackendAuthSecret());
  return NextResponse.json({ token, workspaceId, plan: "enterprise", creditsLimit: null, creditsUsed: 0 });
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

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 401 });
  }

  const workspace = await ensureWorkspaceForUser(user);
  const creditsLimit = getPlanCreditLimit(workspace.plan);
  const creditsUsed = await getCurrentMonthCredits(workspace.id);
  const token = await new SignJWT({
    email: user.email,
    workspaceId: workspace.id,
    plan: workspace.plan,
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
    creditsLimit,
    creditsUsed,
  });
}
