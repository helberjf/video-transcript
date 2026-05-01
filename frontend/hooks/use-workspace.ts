"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import {
  DEFAULT_WORKSPACE,
  WORKSPACE_CHANGE_EVENT,
  clearWorkspaceProfile,
  loadWorkspaceProfile,
  saveWorkspaceProfile,
  type WorkspaceProfile,
} from "@/lib/workspace-store";

const isDesktopMode = process.env.NEXT_PUBLIC_DESKTOP_MODE === "1";

export function useWorkspace() {
  const { status } = useSession();
  const [workspace, setWorkspace] = useState<WorkspaceProfile>(DEFAULT_WORKSPACE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const refreshWorkspace = () => setWorkspace(loadWorkspaceProfile());
    refreshWorkspace();
    setLoaded(true);
    window.addEventListener(WORKSPACE_CHANGE_EVENT, refreshWorkspace);
    window.addEventListener("storage", refreshWorkspace);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGE_EVENT, refreshWorkspace);
      window.removeEventListener("storage", refreshWorkspace);
    };
  }, []);

  useEffect(() => {
    if (isDesktopMode || status !== "authenticated") {
      return;
    }

    let canceled = false;
    void fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Workspace remoto indisponivel.");
        }
        return (await response.json()) as { workspace: WorkspaceProfile };
      })
      .then(({ workspace: remoteWorkspace }) => {
        if (canceled) {
          return;
        }
        const saved = saveWorkspaceProfile(remoteWorkspace);
        setWorkspace(saved);
      })
      .catch(() => undefined);

    return () => {
      canceled = true;
    };
  }, [status]);

  const saveWorkspace = (profile: WorkspaceProfile) => {
    const saved = saveWorkspaceProfile(profile);
    setWorkspace(saved);
    if (!isDesktopMode && status === "authenticated") {
      void fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved),
      })
        .then(async (response) => {
          if (!response.ok) {
            return null;
          }
          return (await response.json()) as { workspace: WorkspaceProfile };
        })
        .then((payload) => {
          if (payload?.workspace) {
            const remoteSaved = saveWorkspaceProfile(payload.workspace);
            setWorkspace(remoteSaved);
          }
        })
        .catch(() => undefined);
    }
    return saved;
  };

  const resetWorkspace = () => {
    clearWorkspaceProfile();
    setWorkspace(DEFAULT_WORKSPACE);
  };

  return { workspace, loaded, saveWorkspace, resetWorkspace };
}
