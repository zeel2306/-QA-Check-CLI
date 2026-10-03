import fs from "fs/promises";
import http from "http";
import path from "path";
import { execa, type ResultPromise } from "execa";

export interface LocalServer {
  url: string;
  stop(): Promise<void>;
}

function npmExecutable(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
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

async function waitUntilReady(urls: string[], process: ResultPromise, timeout = 90_000): Promise<string> {
  const deadline = Date.now() + timeout;
  let exited: { exitCode?: number; stderr?: string } | undefined;
  void process.then((result) => {
    exited = { exitCode: result.exitCode, stderr: result.stderr === undefined ? undefined : String(result.stderr) };
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Local server exited with code ${exited.exitCode}: ${exited.stderr ?? ""}`);
    for (const url of urls) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (response.status < 500) return url;
      } catch {
        /* Server is still starting. */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Local server was not ready within ${timeout / 1000} seconds`);
}

async function stopProcessTree(process: ResultPromise): Promise<void> {
  if (!process.pid || process.exitCode != null) return;
  if (globalThis.process.platform === "win32") {
    await execa("taskkill", ["/pid", String(process.pid), "/T", "/F"], { reject: false });
  } else {
    process.kill("SIGTERM");
  }
}

function createStaticServer(projectPath: string, port = 4173): Promise<LocalServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);
        let reqPath = decodeURIComponent(parsedUrl.pathname);
        if (reqPath === "/") reqPath = "/index.html";

        let filePath = path.join(projectPath, reqPath);
        let stat = await fs.stat(filePath).catch(() => undefined);

        if (stat && stat.isDirectory()) {
          filePath = path.join(filePath, "index.html");
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
      throw new Error(`Could not connect to ${customUrl}`);
    }
  }

  const script = await availableScript(projectPath);
  const port = 4173;
  const candidates = [port, 3000, 5173, 4200, 8080].map((candidate) => `http://127.0.0.1:${candidate}`);

  if (!script && (await fileExists(path.join(projectPath, "artisan")))) {
    const child = execa(process.platform === "win32" ? "php.exe" : "php", ["artisan", "serve", "--host=127.0.0.1", `--port=${port}`], {
      cwd: projectPath,
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    const url = await waitUntilReady(candidates, child);
    return { url, stop: () => stopProcessTree(child) };
  }

  if (script) {
    const child = execa(npmExecutable(), ["run", script], {
      cwd: projectPath,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
      reject: false,
      shell: false,
      stdout: "pipe",
      stderr: "pipe",
    });
    const url = await waitUntilReady(candidates, child);
    return { url, stop: () => stopProcessTree(child) };
  }

  // Fallback for static HTML/CSS/JS projects without package.json scripts
  const indexExists = (await fileExists(path.join(projectPath, "index.html"))) || (await fileExists(path.join(projectPath, "public", "index.html")));
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
