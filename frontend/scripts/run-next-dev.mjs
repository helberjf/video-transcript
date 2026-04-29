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

function getWindowsProcessInfo(pid) {
  const result = runCommand("wmic.exe", [
    "process",
    "where",
    `ProcessId=${pid}`,
    "get",
    "CommandLine,ParentProcessId",
    "/FORMAT:LIST",
  ]);
  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  const info = {};
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    info[key] = value;
  }

  return {
    commandLine: info.CommandLine ?? "",
    parentPid: Number(info.ParentProcessId) || null,
  };
}

function getWindowsPortOwner(port) {
  const result = runCommand("netstat.exe", ["-ano", "-p", "tcp"]);
  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const columns = rawLine.trim().split(/\s+/);
    const [protocol, localAddress, , state, pid] = columns;
    if (protocol?.toUpperCase() !== "TCP" || state?.toUpperCase() !== "LISTENING") {
      continue;
    }
    if (!localAddress?.endsWith(`:${port}`) || !pid) {
      continue;
    }

    const processInfo = getWindowsProcessInfo(pid);
    const parentInfo = processInfo?.parentPid ? getWindowsProcessInfo(processInfo.parentPid) : null;
    return {
      pid: Number(pid),
      commandLine: processInfo?.commandLine ?? "",
      parentPid: processInfo?.parentPid ?? null,
      parentCommandLine: parentInfo?.commandLine ?? "",
    };
  }

  return null;
}

function stopWindowsProcessTree(pid) {
  const result = runCommand("taskkill.exe", ["/PID", String(pid), "/F", "/T"]);
  return result.status === 0;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function normalizeCommandText(value) {
  return value.replaceAll("/", "\\").toLowerCase();
}

function isCurrentProjectNextProcess(commandLine, cwd) {
  if (!commandLine) {
    return false;
  }

  const normalizedCommand = normalizeCommandText(commandLine);
  const expectedPaths = [
    resolve(cwd, "node_modules", "next", "dist", "bin", "next"),
    resolve(cwd, "node_modules", "next", "dist", "server", "lib", "start-server.js"),
  ].map((path) => normalizeCommandText(normalize(path)));

  return expectedPaths.some((expectedPath) => normalizedCommand.includes(expectedPath));
}

async function resolvePort(cwd) {
  if (process.platform === "win32") {
    const owner = getWindowsPortOwner(DEFAULT_PORT);
    if (owner?.pid && isCurrentProjectNextProcess(owner.commandLine, cwd)) {
      const parentBelongsToProject = owner.parentPid && isCurrentProjectNextProcess(owner.parentCommandLine, cwd);
      const pidToStop = parentBelongsToProject ? owner.parentPid : owner.pid;
      console.log(`Stopping previous frontend process on port ${DEFAULT_PORT} (PID ${pidToStop}).`);
      stopWindowsProcessTree(pidToStop);
      await sleep(1000);
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
  const port = await resolvePort(cwd);
  clearNextDevCache(cwd);

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
