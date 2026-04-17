import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function clearNextDevCache(cwd = process.cwd()) {
  if (process.platform !== "win32") {
    return;
  }

  const webpackCacheDir = join(cwd, ".next", "cache", "webpack");

  if (!existsSync(webpackCacheDir)) {
    return;
  }

  try {
    rmSync(webpackCacheDir, { recursive: true, force: true });
    console.log("Cleared stale Next.js webpack cache.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Could not clear Next.js webpack cache: ${message}`);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  clearNextDevCache();
}
