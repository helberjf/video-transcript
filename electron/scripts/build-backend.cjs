const path = require("path");

const { ensureDir, findPython, removeDir, repoRoot, run } = require("./common.cjs");

const python = findPython();
const backendDir = path.join(repoRoot, "backend");
const resourcesDir = path.join(repoRoot, "electron", "resources", "backend");
const pyInstallerDir = path.join(repoRoot, "electron", ".pyinstaller");

removeDir(resourcesDir);
removeDir(pyInstallerDir);
ensureDir(resourcesDir);
ensureDir(pyInstallerDir);

run(python, ["-m", "pip", "install", "pyinstaller"]);

run(python, [
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--name",
  "MediaTranscriptBackend",
  "--distpath",
  resourcesDir,
  "--workpath",
  path.join(pyInstallerDir, "work"),
  "--specpath",
  path.join(pyInstallerDir, "spec"),
  "--paths",
  backendDir,
  "--collect-all",
  "whisper",
  "--collect-all",
  "tiktoken",
  "--collect-all",
  "numba",
  "--collect-all",
  "llvmlite",
  "--collect-all",
  "torch",
  "--hidden-import",
  "tiktoken_ext.openai_public",
  "--hidden-import",
  "uvicorn.logging",
  "--hidden-import",
  "uvicorn.loops.auto",
  "--hidden-import",
  "uvicorn.protocols.http.auto",
  "--hidden-import",
  "uvicorn.protocols.http.h11_impl",
  "--hidden-import",
  "uvicorn.protocols.http.httptools_impl",
  "--hidden-import",
  "uvicorn.protocols.websockets.auto",
  "--hidden-import",
  "uvicorn.protocols.websockets.websockets_impl",
  "--hidden-import",
  "uvicorn.lifespan.on",
  "--hidden-import",
  "uvicorn.lifespan.off",
  path.join(backendDir, "run_backend.py"),
]);

console.log(`Backend desktop preparado em ${resourcesDir}`);
