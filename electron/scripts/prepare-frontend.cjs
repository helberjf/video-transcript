const fs = require("fs");
const path = require("path");

const { copyDir, ensureDir, npmCommand, removeDir, repoRoot, run } = require("./common.cjs");

const frontendDir = path.join(repoRoot, "frontend");
const targetDir = path.join(repoRoot, "electron", "resources", "frontend");
const backendApiBaseUrl = process.env.DESKTOP_API_BASE_URL || "http://127.0.0.1:38500/api";

removeDir(targetDir);
ensureDir(targetDir);

run(npmCommand(), ["run", "build"], {
  cwd: frontendDir,
  env: {
    ...process.env,
    NEXT_PUBLIC_API_BASE_URL: backendApiBaseUrl,
  },
});

const standaloneDir = path.join(frontendDir, ".next", "standalone");
if (!fs.existsSync(standaloneDir)) {
  throw new Error("Build standalone do Next.js não foi gerado.");
}

copyDir(standaloneDir, targetDir);

const staticSource = path.join(frontendDir, ".next", "static");
if (fs.existsSync(staticSource)) {
  ensureDir(path.join(targetDir, "frontend", ".next"));
  copyDir(staticSource, path.join(targetDir, "frontend", ".next", "static"));
}

const publicDir = path.join(frontendDir, "public");
if (fs.existsSync(publicDir)) {
  copyDir(publicDir, path.join(targetDir, "frontend", "public"));
}

console.log(`Frontend desktop preparado em ${targetDir}`);
