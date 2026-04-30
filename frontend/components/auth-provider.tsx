"use client";

import { SessionProvider, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import {
  appendWorkspaceActivity,
  loadWorkspaceProfile,
  normalizeWorkspaceId,
  saveWorkspaceProfile,
} from "@/lib/workspace-store";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

function WorkspaceFromGoogleSession() {
  const { data: session, status } = useSession();

  useEffect(() => {
    const user = session?.user;
    if (isDesktopMode || status !== "authenticated" || !user?.email) {
      return;
    }

    const current = loadWorkspaceProfile();
    if (current.ownerEmail === user.email && current.clientName !== "Cliente demo") {
      return;
    }

    const workspaceId = user.workspaceId || normalizeWorkspaceId(user.email);
    const saved = saveWorkspaceProfile({
      ...current,
      id: workspaceId,
      clientName: user.name || user.email,
      ownerName: user.name || user.email,
      ownerEmail: user.email,
      segment: current.segment || "Workspace Google",
      plan: current.plan || "trial",
      createdAt: current.createdAt || new Date().toISOString(),
    });

    appendWorkspaceActivity({
      type: "workspace",
      title: "Login Google conectado",
      description: `${saved.ownerEmail} entrou no workspace ${saved.clientName}.`,
      href: "/",
    });
  }, [session?.user?.email, session?.user?.name, session?.user?.workspaceId, status]);

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <WorkspaceFromGoogleSession />
      {children}
    </SessionProvider>
  );
}
