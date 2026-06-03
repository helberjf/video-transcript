const fs = require("fs");
const path = require("path");

const { repoRoot } = require("./common.cjs");

const distDir = path.join(repoRoot, "dist-electron");
const rootInstaller = path.join(repoRoot, "Instalar ModeloIA.exe");

if (!fs.existsSync(distDir)) {
  throw new Error(`Pasta de build nao encontrada: ${distDir}`);
}

const installer = fs
  .readdirSync(distDir)
  .filter((file) => /^ModeloIA Setup .*\.exe$/i.test(file))
  .map((file) => path.join(distDir, file))
  .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];

if (!installer) {
  throw new Error("Instalador ModeloIA nao encontrado em dist-electron.");
}

fs.copyFileSync(installer, rootInstaller);
console.log(`Instalador copiado para: ${rootInstaller}`);
