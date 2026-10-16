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

export interface DesktopUpdatesBridge {
  /** Abre os avisos nativos do app: nova versao, download e reinicio. */
  check: () => Promise<void>;
  getVersion: () => Promise<string>;
}

declare global {
  interface Window {
    modeloiaDesktop?: { isDesktop: boolean; recording?: DesktopRecordingBridge; updates?: DesktopUpdatesBridge };
  }
}

/** Existe so dentro do Electron (preload); no navegador a gravacao usa o seletor do proprio Chrome/Edge. */
export function getDesktopRecordingBridge(): DesktopRecordingBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.modeloiaDesktop?.recording ?? null;
}
