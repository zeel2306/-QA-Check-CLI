import fs from "fs/promises";
import fsSync from "fs";
import http from "http";
import net from "net";
import path from "path";
import { execa, type ResultPromise } from "execa";

export interface ServerDiagnostics {
  code:
    | "SERVER_COMMAND_NOT_FOUND"
    | "SERVER_PROCESS_EXITED"
    | "SERVER_PORT_CONFLICT"
    | "SERVER_READINESS_TIMEOUT"
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
  diagnostics?: ServerDiagnostics;
}

function npmExecutable(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
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

async function waitUntilReady(
  targetUrl: string,
  childProcess: ResultPromise,
  context: { command: string; cwd: string; host: string; port: number },
  timeoutMs = 30_000,
): Promise<{ url: string; diagnostics: ServerDiagnostics }> {
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  let stdoutAccumulator = "";
  let stderrAccumulator = "";

  if (childProcess.stdout) {
    childProcess.stdout.on("data", (chunk) => {
      stdoutAccumulator += chunk.toString();
    });
  }
  if (childProcess.stderr) {
    childProcess.stderr.on("data", (chunk) => {
      stderrAccumulator += chunk.toString();
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

  while (Date.now() < deadline) {
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
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(1_500) });
      if (res.status < 500) {
        return {
          url: targetUrl,
          diagnostics: {
            code: "SERVER_HTTP_UNREACHABLE",
            command: context.command,
            cwd: context.cwd,
            host: context.host,
            requestedPort: context.port,
            resolvedPort: context.port,
            stdout: stdoutAccumulator,
            stderr: stderrAccumulator,
            elapsedMs: Date.now() - startTime,
          },
        };
      }
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
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
    lastError: `Server at ${targetUrl} did not respond within ${Math.round(timeoutMs / 1000)}s: ${lastErr}`,
  });
}

async function stopProcessTree(process: ResultPromise): Promise<void> {
  if (!process.pid || process.exitCode != null) return;
  if (globalThis.process.platform === "win32") {
    await execa("taskkill", ["/pid", String(process.pid), "/T", "/F"], { reject: false });
  } else {
    process.kill("SIGTERM");
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
export async function startLocalServer(projectPath: string, customUrl?: string): Promise<LocalServer> {
  if (customUrl) {
    try {
      const res = await fetch(customUrl, { signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) {
        return {
          url: customUrl.replace(/\/$/, ""),
          stop: async () => {},
        };
      }
    } catch {
      throw new Error(`Could not connect to custom URL: ${customUrl}`);
    }
  }

  const port = await findAvailablePort(4173);

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
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    const ready = await waitUntilReady(`http://127.0.0.1:${port}`, child, {
      command,
      cwd: projectPath,
      host: "127.0.0.1",
      port,
    });

    return {
      url: ready.url,
      stop: () => stopProcessTree(child),
      diagnostics: ready.diagnostics,
    };
  }

  const isVite = await isViteProject(projectPath);

  if (isVite) {
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    const command = `${npxCmd} vite preview --host 127.0.0.1 --port ${port} --strictPort`;
    const child = execa(npxCmd, ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
      cwd: projectPath,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    try {
      const ready = await waitUntilReady(`http://127.0.0.1:${port}`, child, {
        command,
        cwd: projectPath,
        host: "127.0.0.1",
        port,
      });

      return {
        url: ready.url,
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

  if (hasBuiltStaticOutput(projectPath)) {
    return createStaticServer(projectPath, port);
  }

  const script = await availableScript(projectPath);

  if (!script && (await fileExists(path.join(projectPath, "artisan")))) {
    const phpCmd = process.platform === "win32" ? "php.exe" : "php";
    const command = `${phpCmd} artisan serve --host=127.0.0.1 --port=${port}`;
    const child = execa(phpCmd, ["artisan", "serve", "--host=127.0.0.1", `--port=${port}`], {
      cwd: projectPath,
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    const ready = await waitUntilReady(`http://127.0.0.1:${port}`, child, {
      command,
      cwd: projectPath,
      host: "127.0.0.1",
      port,
    });
    return { url: ready.url, stop: () => stopProcessTree(child), diagnostics: ready.diagnostics };
  }

  if (script) {
    const npmCmd = npmExecutable();
    const command = `${npmCmd} run ${script}`;
    const child = execa(npmCmd, ["run", script], {
      cwd: projectPath,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    const ready = await waitUntilReady(`http://127.0.0.1:${port}`, child, {
      command,
      cwd: projectPath,
      host: "127.0.0.1",
      port,
    });
    return { url: ready.url, stop: () => stopProcessTree(child), diagnostics: ready.diagnostics };
  }

  const indexExists =
    (await fileExists(path.join(projectPath, "index.html"))) ||
    (await fileExists(path.join(projectPath, "dist", "index.html"))) ||
    (await fileExists(path.join(projectPath, "public", "index.html")));

  if (indexExists) {
    return createStaticServer(projectPath, port);
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
