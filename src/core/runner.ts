import fs from "fs/promises";
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
  void process.then((result) => { exited = { exitCode: result.exitCode, stderr: result.stderr === undefined ? undefined : String(result.stderr) }; });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Local server exited with code ${exited.exitCode}: ${exited.stderr ?? ""}`);
    for (const url of urls) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (response.status < 500) return url;
      } catch { /* Server is still starting. */ }
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

/** Starts the best available production-like server and waits for HTTP readiness. */
export async function startLocalServer(projectPath: string): Promise<LocalServer> {
  const script = await availableScript(projectPath);
  const port = 4173;
  const candidates = [port, 3000, 5173, 4200, 8080].map((candidate) => `http://127.0.0.1:${candidate}`);

  if (!script && await fileExists(path.join(projectPath, "artisan"))) {
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

  if (!script) throw new Error("No start, preview, dev, or artisan server is available");

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
