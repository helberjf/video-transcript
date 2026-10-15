const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Ponte minima para o gravador de reunioes: a pagina continua sendo o Next.js comum.
contextBridge.exposeInMainWorld("modeloiaDesktop", {
  isDesktop: true,
  recording: {
    listSources: () => ipcRenderer.invoke("recording:list-sources"),
    selectSource: (sourceId) => ipcRenderer.invoke("recording:select-source", sourceId),
    setActive: (active) => ipcRenderer.invoke("recording:set-active", Boolean(active)),
    openLiveOverlay: () => ipcRenderer.invoke("recording:open-live-overlay"),
    onHotkey: (callback) => subscribe("recording:hotkey", callback),
    onOsScreenshot: (callback) => subscribe("recording:os-screenshot", callback),
  },
});
