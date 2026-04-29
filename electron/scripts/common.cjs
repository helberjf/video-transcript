const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    stdio: "inherit",
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
  });

  if (result.status !== 0) {
    throw new Error(`Falha ao executar: ${command} ${args.join(" ")}`);
  }
}

function removeDir(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyDir(sourcePath, targetPath) {
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function findPython() {
  const candidates = [
    path.join(repoRoot, "venv", "Scripts", "python.exe"),
    path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "python";
}

function findCommandOnPath(commandName) {
  const result = spawnSync("where.exe", [commandName], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf-8",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`Não foi possível localizar '${commandName}' no PATH.`);
  }

  const match = (result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!match) {
    throw new Error(`Nenhum executável encontrado para '${commandName}'.`);
  }

  return match;
}

module.exports = {
  copyDir,
  ensureDir,
  findCommandOnPath,
  findPython,
  npmCommand,
  removeDir,
  repoRoot,
  run,
};
