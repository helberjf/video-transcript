import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureWorkspaceForUser, serializeWorkspace, updateWorkspaceForUser } from "@/lib/workspace-db";

export const runtime = "nodejs";

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: userId } });
}

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Login necessario." }, { status: 401 });
  }

  const workspace = await ensureWorkspaceForUser(user);
  return NextResponse.json({ workspace: await serializeWorkspace(workspace) });
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Login necessario." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    clientName?: string;
    ownerName?: string;
    ownerEmail?: string;
    segment?: string;
    onboardingStep?: number;
  };

  const workspace = await updateWorkspaceForUser(user, payload);
  return NextResponse.json({ workspace: await serializeWorkspace(workspace) });
}
