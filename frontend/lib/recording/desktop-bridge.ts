export interface DesktopCaptureSource {
  id: string;
  name: string;
  isScreen: boolean;
  thumbnail: string | null;
}

export interface DesktopRecordingBridge {
  listSources: () => Promise<DesktopCaptureSource[]>;
  selectSource: (sourceId: string | null) => Promise<boolean>;
  setActive: (active: boolean) => Promise<boolean>;
  openLiveOverlay?: () => Promise<boolean>;
  onHotkey: (callback: (payload: { action: "capture" | "marker" | "assist" }) => void) => () => void;
  onOsScreenshot: (callback: (payload: { dataUrl: string; source: "folder" | "clipboard" }) => void) => () => void;
}

declare global {
  interface Window {
    modeloiaDesktop?: { isDesktop: boolean; recording?: DesktopRecordingBridge };
  }
}

/** Existe so dentro do Electron (preload); no navegador a gravacao usa o seletor do proprio Chrome/Edge. */
export function getDesktopRecordingBridge(): DesktopRecordingBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.modeloiaDesktop?.recording ?? null;
}
