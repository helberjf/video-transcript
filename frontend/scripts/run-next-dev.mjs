import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { normalize, resolve } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

import { clearNextDevCache } from "./clear-next-dev-cache.mjs";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const PORT_SCAN_LIMIT = 10;

const require = createRequire(import.meta.url);

function isPortAvailable(port, host) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();

    server.once("error", () => {
      resolvePromise(false);
    });

    server.once("listening", () => {
      server.close(() => resolvePromise(true));
    });

    server.listen(port, host);
  });
}

function runCommand(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function getWindowsPortOwner(port) {
  const script = [
    `$conn = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1`,
    'if ($conn) {',
    '  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)"',
    '  [PSCustomObject]@{ pid = $conn.OwningProcess; commandLine = $proc.CommandLine } | ConvertTo-Json -Compress',
    '}',
  ].join(" ");

  const result = runCommand("powershell.exe", ["-NoProfile", "-Command", script]);
  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function stopWindowsProcessTree(pid) {
  const result = runCommand("taskkill.exe", ["/PID", String(pid), "/F", "/T"]);
  return result.status === 0;
}

function isCurrentProjectNextProcess(commandLine, cwd) {
  if (!commandLine) {
    return false;
  }

  const expectedPath = normalize(resolve(cwd, "node_modules", "next", "dist", "server", "lib", "start-server.js")).toLowerCase();
  return normalize(commandLine).toLowerCase().includes(expectedPath);
}

async function resolvePort(cwd) {
  if (process.platform === "win32") {
    const owner = getWindowsPortOwner(DEFAULT_PORT);
    if (owner?.pid && isCurrentProjectNextProcess(owner.commandLine, cwd)) {
      console.log(`Stopping previous frontend process on port ${DEFAULT_PORT} (PID ${owner.pid}).`);
      stopWindowsProcessTree(owner.pid);
    }
  }

  if (await isPortAvailable(DEFAULT_PORT, HOST)) {
    return DEFAULT_PORT;
  }

  for (let port = DEFAULT_PORT + 1; port < DEFAULT_PORT + 1 + PORT_SCAN_LIMIT; port += 1) {
    if (await isPortAvailable(port, HOST)) {
      console.log(`Port ${DEFAULT_PORT} is in use by another app. Starting on port ${port} instead.`);
      return port;
    }
  }

  throw new Error(`No free port found between ${DEFAULT_PORT} and ${DEFAULT_PORT + PORT_SCAN_LIMIT}.`);
}

async function main() {
  const cwd = process.cwd();
  clearNextDevCache(cwd);

  const port = await resolvePort(cwd);
  const nextBin = require.resolve("next/dist/bin/next");
  console.log(`Starting Next.js dev server on http://${HOST}:${port}.`);
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", HOST, "--port", String(port)], {
    cwd,
    stdio: "inherit",
  });
  let isShuttingDown = false;

  const stopChild = (signal) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    if (!child.killed) {
      child.kill(signal);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      stopChild(signal);
    });
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
