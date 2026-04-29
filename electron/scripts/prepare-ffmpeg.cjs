const fs = require("fs");
const path = require("path");

const { ensureDir, findCommandOnPath, removeDir, repoRoot } = require("./common.cjs");

const targetDir = path.join(repoRoot, "electron", "resources", "ffmpeg");

function resolveActualBinary(executable) {
  const resolved = findCommandOnPath(executable);
  const normalized = resolved.toLowerCase();

  if (normalized.startsWith("c:\\programdata\\chocolatey\\bin\\")) {
    const actual = path.join("C:\\ProgramData\\chocolatey\\lib", "ffmpeg", "tools", "ffmpeg", "bin", executable);
    if (fs.existsSync(actual)) {
      return actual;
    }
  }

  return resolved;
}

removeDir(targetDir);
ensureDir(targetDir);

for (const executable of ["ffmpeg.exe", "ffprobe.exe"]) {
  const source = resolveActualBinary(executable);
  const target = path.join(targetDir, executable);
  fs.copyFileSync(source, target);
}

console.log(`FFmpeg preparado em ${targetDir}`);
