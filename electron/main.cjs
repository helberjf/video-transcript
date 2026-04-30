const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BACKEND_PORT = Number(process.env.ELECTRON_BACKEND_PORT || 38500);
const FRONTEND_PORT = Number(process.env.ELECTRON_FRONTEND_PORT || 38501);
const STARTUP_TIMEOUT_MS = 120000;

let mainWindow = null;
let backendProcess = null;
let frontendProcess = null;
let isShuttingDown = false;

const bootstrapLogPath = path.join(os.tmpdir(), "formreport-studio-electron.log");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(bootstrapLogPath, line, "utf-8");
  } catch {
    // Ignora falhas de log para não bloquear o app.
  }
}

function projectPath(...segments) {
  return path.join(__dirname, "..", ...segments);
}

function resourcePath(...segments) {
  return app.isPackaged ? path.join(process.resourcesPath, ...segments) : projectPath(...segments);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function toSqliteUrl(filePath) {
  return `sqlite:///${filePath.replace(/\\/g, "/")}`;
}

function runtimePaths() {
  const rootDir = app.getPath("userData");
  const configDir = path.join(rootDir, "config");
  const dataDir = path.join(rootDir, "data");
  const storageDir = path.join(rootDir, "storage");
  const uploadsDir = path.join(storageDir, "uploads");
  const processedDir = path.join(storageDir, "processed");
  const exportsDir = path.join(storageDir, "exports");
  const tempDir = path.join(storageDir, "temp");
  const logsDir = path.join(rootDir, "logs");

  [rootDir, configDir, dataDir, storageDir, uploadsDir, processedDir, exportsDir, tempDir, logsDir].forEach(ensureDir);

  return {
    rootDir,
    configDir,
    dataDir,
    storageDir,
    uploadsDir,
    processedDir,
    exportsDir,
    tempDir,
    logsDir,
  };
}

function desktopShellHtml({ title, description, status, activeStep = 0, failed = false, detail = "" }) {
  const steps = ["Backend", "API local", "Frontend", "Interface"];
  const stepItems = steps
    .map((step, index) => {
      const state = failed && index === activeStep ? "failed" : index < activeStep ? "done" : index === activeStep ? "active" : "";
      return `<li class="${state}"><span>${index + 1}</span><strong>${step}</strong></li>`;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          :root { color-scheme: dark; --text:#f4f2e8; --muted:#aeb5a6; --accent:#f5c542; --danger:#fb7185; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Segoe UI", system-ui, sans-serif;
            background:
              linear-gradient(180deg, #151915 0%, #101310 48%, #171a18 100%),
              linear-gradient(rgba(244,242,232,0.035) 1px, transparent 1px),
              linear-gradient(90deg, rgba(244,242,232,0.035) 1px, transparent 1px);
            background-size: auto, 44px 44px, 44px 44px;
            color: var(--text);
          }
          .shell {
            width: min(980px, calc(100vw - 48px));
            display: grid;
            grid-template-columns: 280px 1fr;
            overflow: hidden;
            border: 1px solid rgba(244,242,232,0.1);
            border-radius: 16px;
            background: rgba(23, 26, 24, 0.94);
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          }
          aside { padding: 28px; border-right: 1px solid rgba(244,242,232,0.1); background: rgba(10,12,11,0.36); }
          main { padding: 32px; }
          .eyebrow { margin: 0; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; }
          h1 { margin: 12px 0 0; font-size: 28px; line-height: 1.08; letter-spacing: -0.02em; }
          .desktop-note, .description { color: var(--muted); font-size: 14px; line-height: 1.65; }
          .desktop-note { margin: 12px 0 0; }
          .card { border: 1px solid rgba(244,242,232,0.1); border-radius: 12px; background: rgba(244,242,232,0.055); padding: 24px; }
          .title { margin: 0; font-size: 24px; letter-spacing: -0.01em; }
          .description { margin: 12px 0 0; max-width: 620px; }
          .status {
            margin-top: 22px;
            border-radius: 10px;
            border: 1px solid ${failed ? "rgba(251,113,133,0.28)" : "rgba(245,197,66,0.24)"};
            background: ${failed ? "rgba(251,113,133,0.09)" : "rgba(245,197,66,0.09)"};
            color: ${failed ? "var(--danger)" : "var(--accent)"};
            padding: 12px 14px;
            font-size: 14px;
            line-height: 1.5;
          }
          .steps { display: grid; gap: 10px; margin: 24px 0 0; padding: 0; list-style: none; }
          .steps li { display: flex; align-items: center; gap: 12px; border: 1px solid rgba(244,242,232,0.09); border-radius: 10px; padding: 12px; color: var(--muted); }
          .steps span { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 8px; background: rgba(244,242,232,0.08); color: var(--text); font-weight: 700; font-size: 12px; }
          .steps li.done span, .steps li.active span { background: var(--accent); color: #171a18; }
          .steps li.active { border-color: rgba(245,197,66,0.4); color: var(--text); }
          .steps li.failed { border-color: rgba(251,113,133,0.36); color: var(--danger); }
          .steps li.failed span { background: var(--danger); color: #171a18; }
          pre { overflow: auto; max-height: 180px; margin: 16px 0 0; border-radius: 10px; background: rgba(0,0,0,0.28); padding: 14px; color: var(--muted); font-size: 12px; white-space: pre-wrap; }
          @media (max-width: 760px) {
            .shell { grid-template-columns: 1fr; }
            aside { border-right: 0; border-bottom: 1px solid rgba(244,242,232,0.1); }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <aside>
            <p class="eyebrow">Local AI Desk</p>
            <h1>FormReport Studio</h1>
            <p class="desktop-note">Aplicativo desktop para transformar imagem, documento, audio ou video em formulario e relatorio com IA.</p>
          </aside>
          <main>
            <div class="card">
              <p class="eyebrow">${failed ? "Falha ao iniciar" : "Inicializacao"}</p>
              <h2 class="title">${title}</h2>
              <p class="description">${description}</p>
              <div class="status">${status}</div>
              <ul class="steps">${stepItems}</ul>
              ${detail ? `<pre>${detail}</pre>` : ""}
            </div>
          </main>
        </div>
      </body>
    </html>
  `;
}

function loadDesktopShell(options) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(desktopShellHtml(options))}`);
}

function createLoadingWindow() {
  log("Criando janela de carregamento.");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "FormReport Studio",
    backgroundColor: "#111412",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const html = `
    <html lang="pt-BR">
      <body style="margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#f5f0e8;color:#1f2937;display:flex;align-items:center;justify-content:center;">
        <div style="max-width:560px;padding:32px 36px;border:1px solid rgba(15,23,42,0.08);border-radius:24px;background:white;box-shadow:0 20px 60px rgba(15,23,42,0.08);">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Media Transcript Studio</p>
          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.15;">Iniciando aplicativo desktop</h1>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">Estamos iniciando o backend FastAPI, o frontend Next.js e preparando a área local do aplicativo em seu perfil do Windows.</p>
        </div>
      </body>
    </html>
  `;

  loadDesktopShell({
    title: "Preparando aplicativo desktop",
    description: "Estamos subindo os servicos locais e carregando a interface do app.",
    status: "Criando diretorios locais...",
    activeStep: 0,
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
}

function attachLogs(child, name, logsDir) {
  const logFile = path.join(logsDir, `${name}.log`);
  const write = (chunk, stream) => {
    const line = `[${new Date().toISOString()}] [${stream}] ${chunk.toString()}`;
    fs.appendFileSync(logFile, line);
  };

  child.stdout?.on("data", (chunk) => write(chunk, "stdout"));
  child.stderr?.on("data", (chunk) => write(chunk, "stderr"));
}

function startBackend(paths) {
  log("Iniciando backend.");
  const ffmpegDir = app.isPackaged ? resourcePath("ffmpeg") : projectPath("electron", "resources", "ffmpeg");
  const env = {
    ...process.env,
    APP_HOST: "127.0.0.1",
    APP_PORT: String(BACKEND_PORT),
    APP_CONFIG_DIR: paths.configDir,
    DATABASE_URL: toSqliteUrl(path.join(paths.dataDir, "app.db")),
    STORAGE_DIR: paths.storageDir,
    UPLOADS_DIR: paths.uploadsDir,
    PROCESSED_DIR: paths.processedDir,
    EXPORTS_DIR: paths.exportsDir,
    TEMP_DIR: paths.tempDir,
    FFMPEG_BINARY_DIR: ffmpegDir,
    PATH: `${ffmpegDir}${path.delimiter}${process.env.PATH || ""}`,
  };

  if (app.isPackaged) {
    const backendDir = resourcePath("backend", "MediaTranscriptBackend");
    const backendExe = path.join(backendDir, "MediaTranscriptBackend.exe");
    if (!fs.existsSync(backendExe)) {
      throw new Error(`Executável do backend não encontrado em ${backendExe}`);
    }
    log(`Executando backend empacotado em ${backendExe}`);
    backendProcess = spawn(backendExe, [], { cwd: backendDir, env, stdio: ["ignore", "pipe", "pipe"] });
  } else {
    const venvPython = projectPath("venv", "Scripts", "python.exe");
    const pythonCommand = fs.existsSync(venvPython) ? venvPython : "python";
    backendProcess = spawn(pythonCommand, [path.join(projectPath("backend"), "run_backend.py")], {
      cwd: projectPath("backend"),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  attachLogs(backendProcess, "backend", paths.logsDir);
  backendProcess.once("exit", (code) => {
    log(`Backend encerrado com código ${code ?? "desconhecido"}.`);
    if (!isShuttingDown) {
      dialog.showErrorBox("Backend encerrado", `O backend foi encerrado inesperadamente com código ${code ?? "desconhecido"}.`);
      app.quit();
    }
  });
}

function startFrontend(paths) {
  log("Iniciando frontend.");
  const frontendEnv = {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: String(FRONTEND_PORT),
    NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}/api`,
    NEXT_PUBLIC_DESKTOP_MODE: "1",
  };

  if (app.isPackaged) {
    const frontendDir = resourcePath("frontend");
    const serverScript = path.join(frontendDir, "server.js");
    if (!fs.existsSync(serverScript)) {
      throw new Error(`Servidor do frontend não encontrado em ${serverScript}`);
    }
    log(`Executando frontend empacotado em ${serverScript}`);

    frontendProcess = spawn(process.execPath, [serverScript], {
      cwd: frontendDir,
      env: {
        ...frontendEnv,
        NODE_ENV: "production",
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    frontendProcess = spawn(npmCommand(), ["run", "dev"], {
      cwd: projectPath("frontend"),
      env: {
        ...frontendEnv,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  attachLogs(frontendProcess, "frontend", paths.logsDir);
  frontendProcess.once("exit", (code) => {
    log(`Frontend encerrado com código ${code ?? "desconhecido"}.`);
    if (!isShuttingDown) {
      dialog.showErrorBox("Frontend encerrado", `O frontend foi encerrado inesperadamente com código ${code ?? "desconhecido"}.`);
      app.quit();
    }
  });
}

function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Tempo esgotado ao aguardar ${url}`));
          return;
        }

        setTimeout(check, 1000);
      });

      request.on("error", () => {
        request.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Tempo esgotado ao aguardar ${url}`));
          return;
        }
        setTimeout(check, 1000);
      });

      request.setTimeout(5000, () => request.destroy());
    };

    check();
  });
}

async function bootApplication() {
  const paths = runtimePaths();
  log(`Bootstrap iniciado. userData=${paths.rootDir}`);
  createLoadingWindow();
  loadDesktopShell({
    title: "Iniciando backend local",
    description: "O desktop usa os mesmos servicos do webapp, so que empacotados para rodar no Windows.",
    status: "Subindo FastAPI e preparando armazenamento local...",
    activeStep: 0,
  });
  startBackend(paths);
  await waitForUrl(`http://127.0.0.1:${BACKEND_PORT}/api/health`, STARTUP_TIMEOUT_MS);
  log("Backend disponível.");
  loadDesktopShell({
    title: "Backend pronto",
    description: "A API local respondeu. Agora vamos iniciar a interface Next.js.",
    status: "Carregando frontend desktop...",
    activeStep: 2,
  });
  startFrontend(paths);
  await waitForUrl(`http://127.0.0.1:${FRONTEND_PORT}`, STARTUP_TIMEOUT_MS);
  log("Frontend disponível.");
  loadDesktopShell({
    title: "Interface pronta",
    description: "Tudo certo. Abrindo o aplicativo.",
    status: "Abrindo workspace...",
    activeStep: 3,
  });
  await mainWindow?.loadURL(`http://127.0.0.1:${FRONTEND_PORT}`);
  if (!app.isPackaged && process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
    mainWindow?.webContents.openDevTools({ mode: "detach" });
  }
}

function showStartupError(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  log(`Falha no bootstrap: ${message}`);
  if (!mainWindow || mainWindow.isDestroyed()) {
    createLoadingWindow();
  }
  loadDesktopShell({
    title: "Nao foi possivel abrir o app",
    description: "A interface desktop esta disponivel, mas algum servico local nao iniciou corretamente.",
    status: "Verifique os logs em AppData ou reinicie o aplicativo.",
    activeStep: 2,
    failed: true,
    detail: message,
  });
  mainWindow?.show();
}

function stopChild(child) {
  if (!child || child.killed) {
    return;
  }
  try {
    child.kill();
  } catch {
    // Ignora erro de encerramento durante o desligamento.
  }
}

function shutdownProcesses() {
  log("Encerrando processos filhos.");
  isShuttingDown = true;
  stopChild(frontendProcess);
  stopChild(backendProcess);
}

app.on("before-quit", shutdownProcesses);
app.on("window-all-closed", () => {
  app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void bootApplication().catch((error) => {
      showStartupError(error);
    });
  }
});

app.whenReady().then(() => {
  log("Electron pronto.");
  void bootApplication().catch((error) => {
    showStartupError(error);
  });
});
