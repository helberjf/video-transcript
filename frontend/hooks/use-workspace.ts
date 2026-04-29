"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_WORKSPACE,
  WORKSPACE_CHANGE_EVENT,
  clearWorkspaceProfile,
  loadWorkspaceProfile,
  saveWorkspaceProfile,
  type WorkspaceProfile,
} from "@/lib/workspace-store";

export function useWorkspace() {
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

  const saveWorkspace = (profile: WorkspaceProfile) => {
    const saved = saveWorkspaceProfile(profile);
    setWorkspace(saved);
    return saved;
  };

  const resetWorkspace = () => {
    clearWorkspaceProfile();
    setWorkspace(DEFAULT_WORKSPACE);
  };

  return { workspace, loaded, saveWorkspace, resetWorkspace };
}
