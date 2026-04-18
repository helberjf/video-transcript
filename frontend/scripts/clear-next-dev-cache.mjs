import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function clearNextDevCache(cwd = process.cwd()) {
  if (process.platform !== "win32") {
    return;
  }

  const nextDir = join(cwd, ".next");

  if (!existsSync(nextDir)) {
    return;
  }

  try {
    rmSync(nextDir, { recursive: true, force: true });
    console.log("Cleared stale Next.js .next build artifacts.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Could not clear Next.js .next build artifacts: ${message}`);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  clearNextDevCache();
}
