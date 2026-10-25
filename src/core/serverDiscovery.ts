import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { isPortOccupied } from "./runner.js";
import type { RuntimeSettings } from "./readiness.js";

export interface ServerIdentity { verified: boolean; evidence?: string; reason?: "UNAVAILABLE" | "MISMATCH"; httpStatus?: number }
function localHost(host: string): boolean { return host === "localhost" || host === "[::1]" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host); }
export async function verifyIdentity(projectPath: string, url: string, settings: RuntimeSettings): Promise<ServerIdentity> {
  const target = new URL(url);
  if (settings.identity) {
    try {
      const response = await fetch(new URL(settings.identity.path, target.origin), { redirect: "manual", signal: AbortSignal.timeout(3000) });
      if (!response.ok) { await response.body?.cancel(); return { verified: false, reason: response.status >= 500 ? "UNAVAILABLE" : "MISMATCH", httpStatus: response.status }; }
      // Bound markers; do not log response bodies or sensitive values.
      const reader = response.body?.getReader();
      let text = "";
      if (reader) { try { while (text.length < 65536) { const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value); } } finally { await reader.cancel(); } }
      const marker = settings.identity;
      if (marker.text && !text.includes(marker.text)) return { verified: false, reason: "MISMATCH" };
      if (marker.json) { let json; try { json = JSON.parse(text); } catch { return { verified: false, reason: "MISMATCH" }; } if (Object.entries(marker.json).some(([key, value]) => key.split('.').reduce((data: any, part) => data?.[part], json) !== value)) return { verified: false, reason: "MISMATCH" }; }
      return { verified: true, evidence: "Configured application identity marker" };
    } catch { return { verified: false, reason: "UNAVAILABLE" }; }
  }
  if (!localHost(target.hostname)) return { verified: false };
  const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
  const realProject = (await fs.realpath(projectPath)).replaceAll("\\", "/").toLowerCase();
  try {
    if (process.platform === "win32") {
      const command = `$owners = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; @($owners | ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId = $_" | Select-Object ProcessId,CommandLine }) | ConvertTo-Json -Compress`;
      const result = await execa("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { timeout: 8000, reject: false });
      const entries = JSON.parse(result.stdout || "[]");
      for (const entry of Array.isArray(entries) ? entries : [entries]) {
        const line = String(entry.CommandLine || "").replaceAll("\\", "/").toLowerCase();
        if (line.includes(`${realProject}/`)) return { verified: true, evidence: `Listening PID ${entry.ProcessId} references the project's absolute directory` };
      }
    } else {
      const result = await execa("lsof", ["-t", `-iTCP:${port}`, "-sTCP:LISTEN"], { timeout: 3000, reject: false });
      for (const pid of result.stdout.trim().split(/\s+/).filter(value => /^\d+$/.test(value))) {
        const cwd = await fs.realpath(`/proc/${pid}/cwd`).catch(() => "");
        if (cwd.replaceAll("\\", "/").toLowerCase() === realProject) return { verified: true, evidence: `Listening PID ${pid} working directory matches project` };
      }
    }
  } catch { /* Insufficient OS evidence: use isolated startup, never guess. */ }
  return { verified: false };
}

export async function candidateServerUrls(projectPath: string, settings: RuntimeSettings): Promise<string[]> {
  const candidates = [...settings.candidateUrls];
  const ports = new Set<number>();
  const hosts = new Set<string>(["127.0.0.1"]);
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(projectPath, "package.json"), "utf8"));
    for (const script of Object.values(pkg.scripts || {}) as string[]) {
      for (const match of script.matchAll(/(?:--port[=\s]+|-p\s+|PORT\s*=\s*)(\d+)/g)) ports.add(Number(match[1]));
      for (const match of script.matchAll(/--host(?:name)?[=\s]+["']?([\w.:]+)/g)) if (localHost(match[1]!)) hosts.add(match[1]!);
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) ports.add(3000);
    if (deps["@angular/core"]) ports.add(4200);
    if (deps.vite) ports.add(5173);
    if (deps.nuxt) ports.add(3000);
    if (deps.express) ports.add(3000);
  } catch { /* Static or PHP project. */ }
  for (const filename of ["angular.json", "vite.config.ts", "vite.config.js", "nuxt.config.ts", ".env", ".env.local"]) {
    const text = await fs.readFile(path.join(projectPath, filename), "utf8").catch(() => "");
    for (const match of text.matchAll(/(?:["']?port["']?\s*:\s*|(?:^|\n)(?:PORT|APP_PORT)\s*=\s*)(\d+)/g)) ports.add(Number(match[1]));
    for (const match of text.matchAll(/(?:["']?host["']?\s*:\s*["']|(?:^|\n)HOST\s*=\s*["']?)([\w.:]+)/g)) if (localHost(match[1]!)) hosts.add(match[1]!);
    const appUrl = text.match(/(?:^|\n)APP_URL\s*=\s*["']?(https?:\/\/[^\s"']+)/)?.[1];
    if (appUrl) candidates.push(appUrl);
  }
  if (await fs.access(path.join(projectPath, "artisan")).then(() => true, () => false)) ports.add(8000);
  for (const port of ports) if (port > 0 && port <= 65535) for (const host of hosts) candidates.push(`http://${host.includes(":") ? `[${host}]` : host}:${port}`);
  return [...new Set(candidates)].slice(0, 20);
}

export async function discoverExistingServer(projectPath: string, settings: RuntimeSettings, rejected: { url: string; reason: string }[], verify = verifyIdentity): Promise<{ url: string; evidence: string } | undefined> {
  for (const url of await candidateServerUrls(projectPath, settings)) {
    const target = new URL(url);
    if (!localHost(target.hostname)) { rejected.push({ url: target.origin, reason: "Implicit remote targets require an explicit URL" }); continue; }
    if (!await isPortOccupied(Number(target.port || 80), target.hostname === "localhost" ? "127.0.0.1" : target.hostname.replace(/[\[\]]/g, ""))) continue;
    const identity = await verify(projectPath, url, settings);
    if (identity.verified) return { url, evidence: identity.evidence || "Verified project process" };
    rejected.push({ url: target.origin, reason: "Project identity cannot be verified; target was not scanned" });
  }
  return undefined;
}
