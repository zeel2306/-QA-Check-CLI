import fs from "fs/promises";
import fsSync from "fs";
import http from "http";
import net from "net";
import path from "path";
import { execa, type ResultPromise } from "execa";
import { awaitReadiness, probeHttp, runtimeSettings, pause, throwIfCancelled, type RuntimeSettings } from "./readiness.js";

export interface ServerDiagnostics {
  code:
    | "SERVER_READY"
    | "SERVER_COMMAND_NOT_FOUND"
    | "SERVER_PROCESS_EXITED"
    | "SERVER_PORT_CONFLICT"
    | "SERVER_READINESS_TIMEOUT"
    | "SERVER_READINESS_FAILED"
    | "SERVER_HTTP_UNREACHABLE"
    | "SERVER_STARTUP_ERROR";
  command: string;
  cwd: string;
  host: string;
  requestedPort: number;
  resolvedPort?: number;
  exitCode?: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
  startupElapsedMs?: number;
  readinessElapsedMs?: number;
  lastError?: string;
}

export class ServerStartupError extends Error {
  constructor(public readonly diagnostics: ServerDiagnostics) {
    const summary = `Local server failed to start [${diagnostics.code}]: ${diagnostics.lastError || diagnostics.stderr.trim() || `Exit code ${diagnostics.exitCode}`}`;
    super(summary);
    this.name = "ServerStartupError";
  }
}

export interface LocalServer {
  url: string;
  stop(): Promise<void>;
  ownedProcess?: boolean;
  ownership?: "EXTERNAL" | "OWNED";
  diagnostics?: ServerDiagnostics;
}

function npmExecutable(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxExecutable(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

export async function isPortOccupied(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

export async function checkServerHealth(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function findAvailablePort(startPort = 4173): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, "127.0.0.1", () => {
      const address = server.address() as net.AddressInfo;
      const port = address.port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

export async function isViteProject(projectPath: string): Promise<boolean> {
  const viteConfigs = ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"];
  for (const conf of viteConfigs) {
    if (await fileExists(path.join(projectPath, conf))) return true;
  }
  try {
    const pkgRaw = await fs.readFile(path.join(projectPath, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    if (pkg.dependencies?.vite || pkg.devDependencies?.vite) return true;
  } catch {
    // Ignore
  }
  return false;
}

export async function isNextProject(projectPath: string): Promise<boolean> {
  const nextConfigs = ["next.config.js", "next.config.mjs", "next.config.ts"];
  for (const conf of nextConfigs) {
    if (await fileExists(path.join(projectPath, conf))) return true;
  }
  try {
    const pkgRaw = await fs.readFile(path.join(projectPath, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    if (pkg.dependencies?.next || pkg.devDependencies?.next) return true;
  } catch {
    // Ignore
  }
  return false;
}

export async function isNuxtProject(projectPath: string): Promise<boolean> {
  const nuxtConfigs = ["nuxt.config.ts", "nuxt.config.js"];
  for (const conf of nuxtConfigs) {
    if (await fileExists(path.join(projectPath, conf))) return true;
  }
  try {
    const pkgRaw = await fs.readFile(path.join(projectPath, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    if (pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt) return true;
  } catch {
    // Ignore
  }
  return false;
}

export async function isAngularProject(projectPath: string): Promise<boolean> {
  if (await fileExists(path.join(projectPath, "angular.json"))) return true;
  try {
    const pkgRaw = await fs.readFile(path.join(projectPath, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    if (pkg.dependencies?.["@angular/core"] || pkg.devDependencies?.["@angular/core"]) return true;
  } catch {
    // Ignore
  }
  return false;
}

async function availableScript(projectPath: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return ["start", "preview", "dev"].find((name) => pkg.scripts?.[name]);
  } catch {
    return undefined;
  }
}

async function scriptCommand(projectPath: string, script: string, extra: string[] = []): Promise<{ executable: string; args: string[] }> {
  const pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf8").catch(() => "{}"));
  let manager = String(pkg.packageManager || "").split("@")[0];
  if (!["npm", "pnpm", "yarn", "bun"].includes(manager)) {
    manager = await fileExists(path.join(projectPath, "pnpm-lock.yaml")) ? "pnpm" : await fileExists(path.join(projectPath, "yarn.lock")) ? "yarn" : await fileExists(path.join(projectPath, "bun.lock")) || await fileExists(path.join(projectPath, "bun.lockb")) ? "bun" : "npm";
  }
  return { executable: process.platform === "win32" && manager !== "bun" ? `${manager}.cmd` : manager, args: ["run", script, ...(extra.length && manager === "npm" ? ["--"] : []), ...extra] };
}

async function waitForHttpReadiness(
  targetUrl: string,
  childProcess: ResultPromise,
  context: { command: string; cwd: string; host: string; port: number; settings?: RuntimeSettings; signal?: AbortSignal },
  timeoutMs = 30_000,
): Promise<{ url: string; diagnostics: ServerDiagnostics }> {
  const startTime = Date.now();
  let deadline = startTime + timeoutMs;
  let networkReadyAt: number | undefined;
  let stdoutAccumulator = "";
  let stderrAccumulator = "";

  if (childProcess.stdout) {
    childProcess.stdout.on("data", (chunk) => {
      stdoutAccumulator = (stdoutAccumulator + chunk.toString()).slice(-65536);
    });
  }
  if (childProcess.stderr) {
    childProcess.stderr.on("data", (chunk) => {
      stderrAccumulator = (stderrAccumulator + chunk.toString()).slice(-65536);
    });
  }

  let exitedState: { exitCode?: number; error?: Error } | undefined;
  void childProcess
    .then((res) => {
      exitedState = { exitCode: res.exitCode };
    })
    .catch((err) => {
      exitedState = { exitCode: err.exitCode ?? 1, error: err };
    });

  let lastErr = "";
  let lastProgress = startTime;
  const probeState = { consecutive500: 0 };

  while (Date.now() < deadline) {
    if (context.settings && networkReadyAt === undefined && await isPortOccupied(context.port, context.host)) {
      networkReadyAt = Date.now();
      deadline = networkReadyAt + context.settings.readinessTimeoutMs;
    }
    if (Date.now() - lastProgress >= 5000) { const phaseStart = networkReadyAt ?? startTime; console.log(`[Readiness] ${networkReadyAt ? "Application readiness" : "Server startup"}: ${Date.now() - phaseStart}ms / ${deadline - phaseStart}ms`); lastProgress = Date.now(); }
    throwIfCancelled(context.signal);
    if (exitedState) {
      const elapsedMs = Date.now() - startTime;
      const combined = `${stdoutAccumulator}\n${stderrAccumulator}`;
      let code: ServerDiagnostics["code"] = "SERVER_PROCESS_EXITED";
      if (
        combined.includes("EADDRINUSE") ||
        combined.includes("address already in use") ||
        (combined.includes("Port") && combined.includes("is in use"))
      ) {
        code = "SERVER_PORT_CONFLICT";
      } else if (combined.includes("ENOENT") || combined.includes("is not recognized")) {
        code = "SERVER_COMMAND_NOT_FOUND";
      }

      throw new ServerStartupError({
        code,
        command: context.command,
        cwd: context.cwd,
        host: context.host,
        requestedPort: context.port,
        exitCode: exitedState.exitCode,
        stdout: stdoutAccumulator,
        stderr: stderrAccumulator,
        elapsedMs,
        lastError: exitedState.error?.message || stderrAccumulator.trim() || `Process exited with code ${exitedState.exitCode}`,
      });
    }

    try {
      const settings = context.settings || runtimeSettings({ expectedStatuses: [200, 201, 204, 301, 302, 401, 403, 404] });
      await probeHttp(targetUrl, settings, deadline - Date.now(), context.signal, probeState);
      if (exitedState || childProcess.exitCode != null) throw new Error("Server process exited during readiness");
      {
        return {
          url: targetUrl,
          diagnostics: {
            code: "SERVER_READY",
            command: context.command,
            cwd: context.cwd,
            host: context.host,
            requestedPort: context.port,
            resolvedPort: context.port,
            stdout: stdoutAccumulator,
            stderr: stderrAccumulator,
            elapsedMs: Date.now() - startTime,
            startupElapsedMs: (networkReadyAt ?? Date.now()) - startTime,
            readinessElapsedMs: networkReadyAt === undefined ? 0 : Date.now() - networkReadyAt,
          },
        };
      }
    } catch (e: any) {
      throwIfCancelled(context.signal);
      if (e?.retryable === false) throw new ServerStartupError({
        code: "SERVER_READINESS_FAILED", command: context.command, cwd: context.cwd,
        host: context.host, requestedPort: context.port, stdout: stdoutAccumulator, stderr: stderrAccumulator,
        elapsedMs: Date.now()-startTime, startupElapsedMs: (networkReadyAt ?? Date.now())-startTime,
        readinessElapsedMs: networkReadyAt === undefined ? 0 : Date.now()-networkReadyAt, lastError: e.message,
      });
      lastErr = e?.message || String(e);
    }

    await pause(Math.min(context.settings?.pollingIntervalMs ?? 300, Math.max(1, deadline - Date.now())), context.signal);
  }

  throw new ServerStartupError({
    code: "SERVER_READINESS_TIMEOUT",
    command: context.command,
    cwd: context.cwd,
    host: context.host,
    requestedPort: context.port,
    stdout: stdoutAccumulator,
    stderr: stderrAccumulator,
    elapsedMs: Date.now() - startTime,
    startupElapsedMs: (networkReadyAt ?? Date.now()) - startTime,
    readinessElapsedMs: networkReadyAt === undefined ? 0 : Date.now() - networkReadyAt,
    lastError: `Server at ${targetUrl} did not respond within ${Math.round((deadline - (networkReadyAt ?? startTime)) / 1000)}s: ${lastErr}`,
  });
}

async function waitUntilReady(
  targetUrl: string,
  childProcess: ResultPromise,
  context: { command: string; cwd: string; host: string; port: number; settings?: RuntimeSettings; signal?: AbortSignal },
  timeoutMs = 30_000,
): Promise<{ url: string; diagnostics: ServerDiagnostics }> {
  try { return await waitForHttpReadiness(targetUrl, childProcess, context, timeoutMs); }
  catch (error) { await stopProcessTree(childProcess); throw error; }
}

async function stopProcessTree(process: ResultPromise): Promise<void> {
  if (!process.pid || process.exitCode != null) return;
  if (globalThis.process.platform === "win32") {
    await execa("taskkill", ["/pid", String(process.pid), "/T", "/F"], { reject: false });
  } else {
    try { globalThis.process.kill(-process.pid, "SIGTERM"); } catch { process.kill("SIGTERM"); }
  }
}

export function findStaticRootDir(projectPath: string): string {
  const distPath = path.join(projectPath, "dist");
  if (fsSync.existsSync(distPath)) {
    try {
      const entries = fsSync.readdirSync(distPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const browserSub = path.join(distPath, entry.name, "browser");
          if (fsSync.existsSync(path.join(browserSub, "index.html"))) {
            return browserSub;
          }
          const subDir = path.join(distPath, entry.name);
          if (fsSync.existsSync(path.join(subDir, "index.html"))) {
            return subDir;
          }
        }
      }
    } catch {
      // Ignore read error
    }
    if (fsSync.existsSync(path.join(distPath, "index.html"))) {
      return distPath;
    }
  }

  const buildPath = path.join(projectPath, "build");
  if (fsSync.existsSync(path.join(buildPath, "index.html"))) {
    return buildPath;
  }

  const outPath = path.join(projectPath, "out");
  if (fsSync.existsSync(path.join(outPath, "index.html"))) {
    return outPath;
  }

  const publicPath = path.join(projectPath, "public");
  if (fsSync.existsSync(path.join(publicPath, "index.html"))) {
    return publicPath;
  }

  if (fsSync.existsSync(path.join(projectPath, "index.html"))) {
    return projectPath;
  }

  if (fsSync.existsSync(distPath)) {
    return distPath;
  }

  return projectPath;
}

export function hasBuiltStaticOutput(projectPath: string): boolean {
  const root = findStaticRootDir(projectPath);
  return fsSync.existsSync(path.join(root, "index.html"));
}

export function hasBuiltViteOutput(projectPath: string): boolean {
  // Vite's source index.html needs module transformation; it is not a build.
  return ["dist", "build", "out"].some(directory => fsSync.existsSync(path.join(projectPath, directory, "index.html")));
}

function createStaticServer(projectPath: string, port = 4173): Promise<LocalServer> {
  return new Promise((resolve, reject) => {
    const rootDir = findStaticRootDir(projectPath);

    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);
        let reqPath = decodeURIComponent(parsedUrl.pathname);
        if (reqPath === "/") reqPath = "/index.html";

        let filePath = path.join(rootDir, reqPath);
        let stat = await fs.stat(filePath).catch(() => undefined);

        if (stat && stat.isDirectory()) {
          filePath = path.join(filePath, "index.html");
          stat = await fs.stat(filePath).catch(() => undefined);
        }

        // SPA Fallback for client side routes (non-API, non-file extension)
        if ((!stat || !stat.isFile()) && !reqPath.startsWith("/api/") && !path.extname(reqPath)) {
          filePath = path.join(rootDir, "index.html");
          stat = await fs.stat(filePath).catch(() => undefined);
        }

        if (!stat || !stat.isFile()) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("404 Not Found");
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
          ".ico": "image/x-icon",
        };

        const contentType = mimeTypes[ext] || "application/octet-stream";
        const content = await fs.readFile(filePath);
        res.statusCode = 200;
        res.setHeader("Content-Type", contentType);
        res.end(content);
      } catch {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });

    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        stop: () => new Promise<void>((res) => server.close(() => res())),
      });
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}

/** Starts the best available server or connects to a custom URL. */
export async function startLocalServer(projectPath: string, customUrl?: string, options?: { settings: RuntimeSettings; signal?: AbortSignal }): Promise<LocalServer> {
  throwIfCancelled(options?.signal);
  const waitOwned = (url: string, child: ResultPromise, context: { command: string; cwd: string; host: string; port: number }, legacyTimeout?: number) => waitUntilReady(url, child, { ...context, ...options }, options?.settings.startupTimeoutMs ?? legacyTimeout);
  if (customUrl) {
    if (options) {
      const probeState = { consecutive500: 0 };
      await awaitReadiness(remaining => probeHttp(customUrl, options.settings, remaining, options.signal, probeState), options.settings.readinessTimeoutMs, options.settings.pollingIntervalMs, options.signal);
      return { url: customUrl.replace(/\/$/, ""), ownedProcess: false, ownership: "EXTERNAL", stop: async () => {} };
    }
    try {
      const res = await fetch(customUrl, { signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) {
        return {
          url: customUrl.replace(/\/$/, ""),
          ownedProcess: false,
          stop: async () => {},
        };
      }
      throw new Error(`Custom URL returned HTTP ${res.status}: ${customUrl}`);
    } catch {
      throw new Error(`Could not connect to custom URL: ${customUrl}`);
    }
  }

  // OS-assigned ephemeral ports avoid concurrent audits selecting the same default port.
  const port = await findAvailablePort(0);

  // Laravel must be served through its front controller, never a static public root.
  if (await fileExists(path.join(projectPath, "artisan"))) {
    const phpCmd = process.platform === "win32" ? "php.exe" : "php";
    const command = `${phpCmd} artisan serve --host=127.0.0.1 --port=${port}`;
    const child = execa(phpCmd, ["artisan", "serve", "--host=127.0.0.1", `--port=${port}`, "--tries=1"], {
      cwd: projectPath, cleanup: false, detached: process.platform !== "win32", reject: false, stdout: "pipe", stderr: "pipe",
    });
    try {
      const ready = await waitOwned(`http://127.0.0.1:${port}`, child, {
        command, cwd: projectPath, host: "127.0.0.1", port,
      });
      return { url: ready.url, ownedProcess: true, stop: () => stopProcessTree(child), diagnostics: ready.diagnostics };
    } catch (error) {
      await stopProcessTree(child);
      throw error;
    }
  }

  const nitroServerPath = path.join(projectPath, ".output", "server", "index.mjs");
  if (fsSync.existsSync(nitroServerPath)) {
    const nodeCmd = process.platform === "win32" ? "node.exe" : "node";
    const command = `${nodeCmd} .output/server/index.mjs`;
    const child = execa(nodeCmd, [nitroServerPath], {
      cwd: projectPath,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        NITRO_PORT: String(port),
        NITRO_HOST: "127.0.0.1",
      },
      cleanup: false, detached: process.platform !== "win32",
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    const ready = await waitOwned(`http://127.0.0.1:${port}`, child, {
      command,
      cwd: projectPath,
      host: "127.0.0.1",
      port,
    });

    return {
      url: ready.url,
      ownedProcess: true,
      stop: () => stopProcessTree(child),
      diagnostics: ready.diagnostics,
    };
  }

  const isNext = await isNextProject(projectPath);
  if (isNext) {
    const pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf8").catch(() => "{}"));
    const invocation = pkg.scripts?.dev ? await scriptCommand(projectPath, "dev", ["-p", String(port), "--hostname", "127.0.0.1"]) : { executable: npxExecutable(), args: ["--no-install", "next", "dev", "-p", String(port), "--hostname", "127.0.0.1"] };
    const command = `${invocation.executable} ${invocation.args.join(" ")}`;
    const child = execa(invocation.executable, invocation.args, {
      cwd: projectPath,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      cleanup: false, detached: process.platform !== "win32",
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const ready = await waitOwned(`http://127.0.0.1:${port}`, child, {
        command,
        cwd: projectPath,
        host: "127.0.0.1",
        port,
      }, 45_000);

      return {
        url: ready.url,
        ownedProcess: true,
        stop: () => stopProcessTree(child),
        diagnostics: ready.diagnostics,
      };
    } catch (error) {
      await stopProcessTree(child);
      if (hasBuiltStaticOutput(projectPath)) {
        return createStaticServer(projectPath, port);
      }
      throw error;
    }
  }

  const isVite = await isViteProject(projectPath);

  if (isVite) {
    const built = hasBuiltViteOutput(projectPath);
    const pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf8").catch(() => "{}"));
    const script = built && pkg.scripts?.preview ? "preview" : pkg.scripts?.dev ? "dev" : undefined;
    const extra = ["--host", "127.0.0.1", "--port", String(port), "--strictPort"];
    const invocation = script ? await scriptCommand(projectPath, script, extra) : { executable: npxExecutable(), args: ["--no-install", "vite", ...(built ? ["preview"] : []), ...extra] };
    const command = `${invocation.executable} ${invocation.args.join(" ")}`;
    const child = execa(invocation.executable, invocation.args, {
      cwd: projectPath,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      cleanup: false, detached: process.platform !== "win32",
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const ready = await waitOwned(`http://127.0.0.1:${port}`, child, {
        command,
        cwd: projectPath,
        host: "127.0.0.1",
        port,
      });

      return {
        url: ready.url,
        ownedProcess: true,
        stop: () => stopProcessTree(child),
        diagnostics: ready.diagnostics,
      };
    } catch (error) {
      await stopProcessTree(child);
      if (hasBuiltViteOutput(projectPath)) {
        return createStaticServer(projectPath, port);
      }
      throw error;
    }
  }

  let script = await availableScript(projectPath);
  const developmentFramework = await isAngularProject(projectPath) || await isNuxtProject(projectPath);
  if (developmentFramework) {
    const pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf8").catch(() => "{}"));
    script = pkg.scripts?.dev ? "dev" : pkg.scripts?.start ? "start" : script;
  }
  let nodeServerScript = false;
  if (script) {
    const pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf8"));
    nodeServerScript = /^node\s+/.test(pkg.scripts?.[script] || "");
  }
  if (hasBuiltStaticOutput(projectPath) && !nodeServerScript && !developmentFramework) {
    const staticServer = await createStaticServer(projectPath, port);
    return { ...staticServer, ownedProcess: true };
  }

  if (!script && (await fileExists(path.join(projectPath, "artisan")))) {
    const phpCmd = process.platform === "win32" ? "php.exe" : "php";
    const command = `${phpCmd} artisan serve --host=127.0.0.1 --port=${port}`;
    const child = execa(phpCmd, ["artisan", "serve", "--host=127.0.0.1", `--port=${port}`], {
      cwd: projectPath,
      cleanup: false, detached: process.platform !== "win32",
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    const ready = await waitOwned(`http://127.0.0.1:${port}`, child, {
      command,
      cwd: projectPath,
      host: "127.0.0.1",
      port,
    });
    return { url: ready.url, ownedProcess: true, stop: () => stopProcessTree(child), diagnostics: ready.diagnostics };
  }

  if (script) {
    const invocation = await scriptCommand(projectPath, script, developmentFramework ? ["--port", String(port), "--host", "127.0.0.1"] : []);
    const command = `${invocation.executable} ${invocation.args.join(" ")}`;
    const child = execa(invocation.executable, invocation.args, {
      cwd: projectPath,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      cleanup: false, detached: process.platform !== "win32",
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    const ready = await waitOwned(`http://127.0.0.1:${port}`, child, {
      command,
      cwd: projectPath,
      host: "127.0.0.1",
      port,
    });
    return { url: ready.url, ownedProcess: true, stop: () => stopProcessTree(child), diagnostics: ready.diagnostics };
  }

  const indexExists =
    (await fileExists(path.join(projectPath, "index.html"))) ||
    (await fileExists(path.join(projectPath, "dist", "index.html"))) ||
    (await fileExists(path.join(projectPath, "public", "index.html")));

  if (indexExists) {
    const staticServer = await createStaticServer(projectPath, port);
    return { ...staticServer, ownedProcess: true };
  }

  throw new Error("No start, preview, dev, artisan, or static HTML entry point available");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
