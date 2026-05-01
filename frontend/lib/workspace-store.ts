export type WorkspacePlan = "trial" | "pro" | "business" | "enterprise";

export interface WorkspaceProfile {
  id: string;
  clientName: string;
  ownerName: string;
  ownerEmail: string;
  segment: string;
  plan: WorkspacePlan;
  billingStatus?: string;
  creditsUsed?: number;
  creditsLimit?: number | null;
  onboardingStep?: number;
  createdAt: string;
}

export interface WorkspaceActivity {
  id: string;
  workspaceId: string;
  type: "upload" | "template" | "form" | "report" | "export" | "workspace";
  title: string;
  description: string;
  href?: string;
  createdAt: string;
}

export const DEFAULT_WORKSPACE: WorkspaceProfile = {
  id: "local-workspace",
  clientName: "Cliente demo",
  ownerName: "Operador local",
  ownerEmail: "demo@formreport.local",
  segment: "Operacoes documentais",
  plan: "trial",
  billingStatus: "trialing",
  creditsUsed: 0,
  creditsLimit: 20,
  onboardingStep: 0,
  createdAt: new Date(0).toISOString(),
};

const WORKSPACE_KEY = "formreport.workspace.profile";
const ACTIVITY_PREFIX = "formreport.workspace.activity.";
export const WORKSPACE_CHANGE_EVENT = "formreport:workspace-changed";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function normalizeWorkspaceId(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80);
  return normalized || DEFAULT_WORKSPACE.id;
}

export function loadWorkspaceProfile(): WorkspaceProfile {
  if (!canUseStorage()) {
    return DEFAULT_WORKSPACE;
  }

  const raw = window.localStorage.getItem(WORKSPACE_KEY);
  if (!raw) {
    return DEFAULT_WORKSPACE;
  }

  try {
    return { ...DEFAULT_WORKSPACE, ...(JSON.parse(raw) as Partial<WorkspaceProfile>) };
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

export function saveWorkspaceProfile(profile: WorkspaceProfile): WorkspaceProfile {
  const normalized: WorkspaceProfile = {
    ...profile,
    id: normalizeWorkspaceId(profile.id || profile.clientName),
    clientName: profile.clientName.trim() || DEFAULT_WORKSPACE.clientName,
    ownerName: profile.ownerName.trim() || DEFAULT_WORKSPACE.ownerName,
    ownerEmail: profile.ownerEmail.trim() || DEFAULT_WORKSPACE.ownerEmail,
    segment: profile.segment.trim() || DEFAULT_WORKSPACE.segment,
    createdAt: profile.createdAt || new Date().toISOString(),
  };

  if (canUseStorage()) {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(WORKSPACE_CHANGE_EVENT));
  }

  return normalized;
}

export function clearWorkspaceProfile(): void {
  if (canUseStorage()) {
    window.localStorage.removeItem(WORKSPACE_KEY);
    window.dispatchEvent(new Event(WORKSPACE_CHANGE_EVENT));
  }
}

export function getWorkspaceRequestHeader(): string {
  return loadWorkspaceProfile().id;
}

export function getWorkspaceActivity(workspaceId = loadWorkspaceProfile().id): WorkspaceActivity[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(`${ACTIVITY_PREFIX}${workspaceId}`);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as WorkspaceActivity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendWorkspaceActivity(activity: Omit<WorkspaceActivity, "id" | "workspaceId" | "createdAt">): void {
  if (!canUseStorage()) {
    return;
  }

  const workspace = loadWorkspaceProfile();
  const nextActivity: WorkspaceActivity = {
    ...activity,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: workspace.id,
    createdAt: new Date().toISOString(),
  };
  const current = getWorkspaceActivity(workspace.id);
  window.localStorage.setItem(`${ACTIVITY_PREFIX}${workspace.id}`, JSON.stringify([nextActivity, ...current].slice(0, 60)));
}
