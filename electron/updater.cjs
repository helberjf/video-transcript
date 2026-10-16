const { app, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

const { confirmCloseWhileRecording } = require("./recording-bridge.cjs");

// Espera a interface abrir antes de consultar o GitHub, para nao atrasar o inicio do app.
const STARTUP_CHECK_DELAY_MS = 8000;

let getWindow = () => null;
let log = () => {};
let checking = false;
let downloading = false;
let downloadedVersion = null;
// Quando a verificacao foi pedida pelo usuario, avisamos tambem "sem atualizacao" e erros.
let manualCheck = false;

function parentWindow() {
  const window = getWindow();
  return window && !window.isDestroyed() ? window : undefined;
}

function showMessage(options) {
  const window = parentWindow();
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
}

function setProgress(value) {
  parentWindow()?.setProgressBar(value);
}

function releaseNotesText(releaseNotes) {
  if (!releaseNotes) {
    return "";
  }
  const text = Array.isArray(releaseNotes) ? releaseNotes.map((item) => item.note || "").join("\n") : String(releaseNotes);
  const plain = text
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return plain.length > 600 ? `${plain.slice(0, 600)}...` : plain;
}

async function promptDownload(info) {
  const notes = releaseNotesText(info.releaseNotes);
  const { response } = await showMessage({
    type: "info",
    buttons: ["Baixar e instalar", "Agora nao"],
    defaultId: 0,
    cancelId: 1,
    title: "Atualizacao disponivel",
    message: `Uma nova versao do ModeloIA esta disponivel (${info.version}).`,
    detail: [`Voce esta usando a versao ${app.getVersion()}.`, notes ? `\nNovidades:\n${notes}` : ""].join("\n").trim(),
  });
  if (response !== 0) {
    log(`Atualizacao ${info.version} adiada pelo usuario.`);
    return;
  }
  downloading = true;
  setProgress(0.01);
  autoUpdater.downloadUpdate().catch((error) => {
    downloading = false;
    setProgress(-1);
    log(`Falha ao baixar atualizacao: ${error?.message || error}`);
    void showMessage({
      type: "error",
      title: "Falha na atualizacao",
      message: "Nao foi possivel baixar a atualizacao.",
      detail: "Verifique sua conexao com a internet. Vamos tentar de novo na proxima vez que o app abrir.",
    });
  });
}

async function promptInstall(info) {
  const { response } = await showMessage({
    type: "info",
    buttons: ["Reiniciar e atualizar", "Atualizar ao fechar"],
    defaultId: 0,
    cancelId: 1,
    title: "Atualizacao pronta",
    message: `A versao ${info.version} foi baixada.`,
    detail: "Reinicie agora para usar a nova versao, ou ela sera instalada automaticamente quando voce fechar o app.",
  });
  if (response !== 0) {
    return;
  }
  // O instalador fecha o app: protege uma gravacao em andamento, como no botao de fechar.
  if (!confirmCloseWhileRecording(parentWindow())) {
    return;
  }
  log(`Reiniciando para instalar a versao ${info.version}.`);
  // Silencioso e reabrindo o app ao final, para a pessoa nao precisar passar pelo assistente de novo.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

function checkForUpdates({ manual = false } = {}) {
  if (!app.isPackaged) {
    if (manual) {
      void showMessage({ type: "info", title: "Atualizacoes", message: "Atualizacoes so funcionam no app instalado." });
    }
    return;
  }
  if (downloadedVersion) {
    void promptInstall({ version: downloadedVersion });
    return;
  }
  if (checking || downloading) {
    return;
  }
  checking = true;
  manualCheck = manual;
  log(`Verificando atualizacoes (versao atual ${app.getVersion()}).`);
  autoUpdater.checkForUpdates().catch(() => {
    // O evento "error" ja registra e avisa a falha.
  });
}

function setupAutoUpdater(options) {
  getWindow = options.getWindow;
  log = options.log;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (message) => log(`[updater] ${message}`),
    warn: (message) => log(`[updater] AVISO ${message}`),
    error: (message) => log(`[updater] ERRO ${message}`),
    debug: () => {},
  };

  autoUpdater.on("update-available", (info) => {
    checking = false;
    log(`Atualizacao disponivel: ${info.version}.`);
    void promptDownload(info);
  });

  autoUpdater.on("update-not-available", () => {
    checking = false;
    log("Nenhuma atualizacao disponivel.");
    if (manualCheck) {
      void showMessage({
        type: "info",
        title: "Atualizacoes",
        message: "Voce ja esta usando a versao mais recente.",
        detail: `Versao ${app.getVersion()}.`,
      });
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    setProgress(Math.max(0.01, Math.min(1, progress.percent / 100)));
  });

  autoUpdater.on("update-downloaded", (info) => {
    downloading = false;
    downloadedVersion = info.version;
    setProgress(-1);
    log(`Atualizacao ${info.version} baixada.`);
    void promptInstall(info);
  });

  autoUpdater.on("error", (error) => {
    const wasManual = manualCheck;
    checking = false;
    log(`Erro no atualizador: ${error?.message || error}`);
    // Sem internet ao abrir o app nao e motivo para incomodar a pessoa.
    if (wasManual) {
      void showMessage({
        type: "error",
        title: "Atualizacoes",
        message: "Nao foi possivel verificar atualizacoes.",
        detail: "Verifique sua conexao com a internet e tente de novo.",
      });
    }
  });

  ipcMain.handle("updates:check", () => {
    checkForUpdates({ manual: true });
  });
  ipcMain.handle("updates:get-version", () => app.getVersion());
}

function scheduleStartupUpdateCheck() {
  if (!app.isPackaged || process.env.MODELOIA_DISABLE_UPDATES === "1") {
    return;
  }
  setTimeout(() => checkForUpdates(), STARTUP_CHECK_DELAY_MS);
}

module.exports = { setupAutoUpdater, scheduleStartupUpdateCheck, checkForUpdates };
