const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  powerSaveBlocker,
  session,
} = require("electron");

const HOTKEYS = {
  "CommandOrControl+Shift+S": "capture",
  "CommandOrControl+Shift+M": "marker",
  "CommandOrControl+Shift+A": "assist",
};
const CLIPBOARD_POLL_MS = 1500;
// Win+Shift+S salva o arquivo e copia para a area de transferencia: o segundo aviso e o mesmo print.
const OS_SCREENSHOT_DEDUPE_MS = 4000;

let selectedSourceId = null;
let recordingActive = false;
let powerBlockerId = null;
let screenshotsWatcher = null;
let clipboardTimer = null;
let lastClipboardHash = null;
let lastOsScreenshotAt = 0;
let liveOverlay = null;

function setupRecordingBridge({ getWindow, allowedOrigins, log }) {
  const isAllowedOrigin = (url) => {
    try {
      return allowedOrigins().includes(new URL(url).origin);
    } catch {
      return false;
    }
  };

  const send = (channel, payload) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details?.requestingUrl || webContents.getURL();
    if (["media", "display-capture", "clipboard-read", "clipboard-sanitized-write", "notifications"].includes(permission)) {
      callback(isAllowedOrigin(origin));
      return;
    }
    callback(true);
  });

  // O getDisplayMedia da pagina cai aqui: entregamos a tela/janela escolhida e o audio do
  // sistema por loopback (so existe no Windows). "loopbackWithMute" silenciaria a reuniao.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (!isAllowedOrigin(request.securityOrigin || request.frame?.url || "")) {
        callback({});
        return;
      }
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
      const source =
        sources.find((item) => item.id === selectedSourceId) ||
        sources.find((item) => item.id.startsWith("screen:")) ||
        sources[0];
      if (!source) {
        callback({});
        return;
      }
      const response = { video: source };
      if (process.platform === "win32" && request.audioRequested) {
        response.audio = "loopback";
      }
      callback(response);
    } catch (error) {
      log(`Falha ao entregar a fonte de captura: ${error}`);
      callback({});
    }
  });

  ipcMain.handle("recording:list-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
    const ownTitle = getWindow()?.getTitle();
    return sources
      .filter((source) => source.name && source.name !== ownTitle)
      .map((source) => ({
        id: source.id,
        name: source.name,
        isScreen: source.id.startsWith("screen:"),
        thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
      }));
  });

  ipcMain.handle("recording:select-source", (_event, sourceId) => {
    selectedSourceId = typeof sourceId === "string" ? sourceId : null;
    return true;
  });

  ipcMain.handle("recording:set-active", (_event, active) => {
    if (active) {
      startRecordingHelpers(send, log);
    } else {
      stopRecordingHelpers();
    }
    return recordingActive;
  });

  // Janela pequena por cima da reuniao com as sugestoes. Fica visivel no compartilhamento de tela
  // como qualquer janela: nao usamos setContentProtection para esconder.
  ipcMain.handle("recording:open-live-overlay", () => {
    if (liveOverlay && !liveOverlay.isDestroyed()) {
      liveOverlay.show();
      liveOverlay.focus();
      return true;
    }
    const origin = allowedOrigins()[0];
    liveOverlay = new BrowserWindow({
      width: 440,
      height: 680,
      minWidth: 320,
      minHeight: 360,
      title: "ModeloIA ao vivo",
      alwaysOnTop: true,
      autoHideMenuBar: true,
      backgroundColor: "#111412",
      webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    liveOverlay.setAlwaysOnTop(true, "floating");
    liveOverlay.on("closed", () => {
      liveOverlay = null;
    });
    void liveOverlay.loadURL(`${origin}/ao-vivo`);
    return true;
  });

  app.on("will-quit", stopRecordingHelpers);
}

function startRecordingHelpers(send, log) {
  if (recordingActive) {
    return;
  }
  recordingActive = true;

  for (const [accelerator, action] of Object.entries(HOTKEYS)) {
    try {
      globalShortcut.register(accelerator, () => send("recording:hotkey", { action }));
    } catch (error) {
      log(`Atalho ${accelerator} indisponivel: ${error}`);
    }
  }

  powerBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  watchOsScreenshots(send, log);
}

function stopRecordingHelpers() {
  recordingActive = false;
  for (const accelerator of Object.keys(HOTKEYS)) {
    globalShortcut.unregister(accelerator);
  }
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
  powerBlockerId = null;
  screenshotsWatcher?.close();
  screenshotsWatcher = null;
  if (clipboardTimer) {
    clearInterval(clipboardTimer);
  }
  clipboardTimer = null;
}

function emitOsScreenshot(send, buffer, source) {
  const now = Date.now();
  if (now - lastOsScreenshotAt < OS_SCREENSHOT_DEDUPE_MS) {
    return;
  }
  lastOsScreenshotAt = now;
  send("recording:os-screenshot", { dataUrl: `data:image/png;base64,${buffer.toString("base64")}`, source });
}

function watchOsScreenshots(send, log) {
  // Prints do Windows feitos durante a reuniao (Win+PrtScn, Ferramenta de Captura) entram na gravacao.
  const screenshotsDir = path.join(app.getPath("pictures"), "Screenshots");
  if (fs.existsSync(screenshotsDir)) {
    try {
      screenshotsWatcher = fs.watch(screenshotsDir, (eventType, filename) => {
        if (eventType !== "rename" || !filename || !/\.png$/i.test(filename)) {
          return;
        }
        const filePath = path.join(screenshotsDir, filename);
        // O arquivo aparece antes de terminar de ser escrito.
        setTimeout(() => {
          fs.readFile(filePath, (error, buffer) => {
            if (!error && buffer.length > 0) {
              emitOsScreenshot(send, buffer, "folder");
            }
          });
        }, 600);
      });
    } catch (error) {
      log(`Nao foi possivel observar ${screenshotsDir}: ${error}`);
    }
  }

  lastClipboardHash = clipboardImageHash();
  clipboardTimer = setInterval(() => {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return;
    }
    const png = image.toPNG();
    const hash = crypto.createHash("sha1").update(png).digest("hex");
    if (hash === lastClipboardHash) {
      return;
    }
    lastClipboardHash = hash;
    emitOsScreenshot(send, png, "clipboard");
  }, CLIPBOARD_POLL_MS);
}

function clipboardImageHash() {
  const image = clipboard.readImage();
  return image.isEmpty() ? null : crypto.createHash("sha1").update(image.toPNG()).digest("hex");
}

function confirmCloseWhileRecording(window) {
  if (!recordingActive) {
    return true;
  }
  const choice = dialog.showMessageBoxSync(window, {
    type: "warning",
    buttons: ["Continuar gravando", "Fechar mesmo assim"],
    defaultId: 0,
    cancelId: 0,
    title: "Gravação em andamento",
    message: "Há uma reunião sendo gravada.",
    detail: "O que já foi enviado fica salvo e pode ser finalizado depois, mas o restante da reunião não será gravado.",
  });
  return choice === 1;
}

module.exports = { setupRecordingBridge, confirmCloseWhileRecording };
