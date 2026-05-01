import type { User, Workspace } from "@prisma/client";

import { getBillingPeriodStart, getPlanCreditLimit, type WorkspacePlan } from "@/lib/billing-plans";
import { prisma } from "@/lib/prisma";

export interface WorkspaceSummary {
  id: string;
  clientName: string;
  ownerName: string;
  ownerEmail: string;
  segment: string;
  plan: WorkspacePlan;
  billingStatus: string;
  creditsUsed: number;
  creditsLimit: number | null;
  onboardingStep: number;
  createdAt: string;
}

function normalizePlan(plan: string | null | undefined): WorkspacePlan {
  return plan === "pro" || plan === "business" || plan === "enterprise" ? plan : "trial";
}

function normalizeWorkspaceSlug(value: string | null | undefined): string {
  const normalized = (value ?? "workspace")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);
  return normalized || "workspace";
}

export async function getCurrentMonthCredits(workspaceId: string): Promise<number> {
  const result = await prisma.usageEvent.aggregate({
    where: {
      workspaceId,
      createdAt: {
        gte: getBillingPeriodStart(),
      },
    },
    _sum: {
      credits: true,
    },
  });

  return result._sum.credits ?? 0;
}

export async function serializeWorkspace(workspace: Workspace): Promise<WorkspaceSummary> {
  const plan = normalizePlan(workspace.plan);
  return {
    id: workspace.id,
    clientName: workspace.clientName,
    ownerName: workspace.ownerName,
    ownerEmail: workspace.ownerEmail,
    segment: workspace.segment,
    plan,
    billingStatus: workspace.billingStatus,
    creditsUsed: await getCurrentMonthCredits(workspace.id),
    creditsLimit: getPlanCreditLimit(plan),
    onboardingStep: workspace.onboardingStep,
    createdAt: workspace.createdAt.toISOString(),
  };
}

export async function ensureWorkspaceForUser(user: Pick<User, "id" | "email" | "name">): Promise<Workspace> {
  const email = user.email || `${user.id}@formreport.local`;
  const workspaceId = normalizeWorkspaceSlug(email);
  const ownerName = user.name || email;

  const workspace = await prisma.workspace.upsert({
    where: { id: workspaceId },
    create: {
      id: workspaceId,
      clientName: ownerName,
      ownerName,
      ownerEmail: email,
      segment: "Operacoes documentais",
      plan: "trial",
      billingStatus: "trialing",
      ownerId: user.id,
    },
    update: {
      ownerId: user.id,
      ownerName,
      ownerEmail: email,
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
    },
    update: {
      role: "owner",
    },
  });

  return workspace;
}

export async function getWorkspaceForUser(userId: string): Promise<Workspace | null> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });

  return membership?.workspace ?? null;
}

export async function updateWorkspaceForUser(
  user: Pick<User, "id" | "email" | "name">,
  payload: Partial<Pick<WorkspaceSummary, "clientName" | "ownerName" | "ownerEmail" | "segment" | "onboardingStep">>,
): Promise<Workspace> {
  const workspace = await ensureWorkspaceForUser(user);

  return prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      clientName: payload.clientName?.trim() || undefined,
      ownerName: payload.ownerName?.trim() || undefined,
      ownerEmail: payload.ownerEmail?.trim() || undefined,
      segment: payload.segment?.trim() || undefined,
      onboardingStep: typeof payload.onboardingStep === "number" ? Math.max(0, Math.min(3, payload.onboardingStep)) : undefined,
    },
  });
}
