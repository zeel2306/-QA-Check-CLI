import type { Page } from "playwright";

export interface RuntimeSettings {
  startupTimeoutMs: number;
  readinessTimeoutMs: number;
  pollingIntervalMs: number;
  browserLaunchTimeoutMs: number;
  initialNavigationTimeoutMs: number;
  navigationTimeoutMs: number;
  routeTimeoutMs: number;
  compilationRetries: number;
  browserConcurrency: number;
  browserAuditTimeoutMs: number;
  scanTimeoutMs: number;
  scannerTimeoutMs: number;
  minimumRouteCoveragePercent: number;
  maxReadinessHttp500Responses: number;
  scannerTimeouts: Record<string, number>;
  candidateUrls: string[];
  healthPath: string;
  expectedStatuses: number[];
  identity?: { path: string; text?: string; json?: Record<string, string | number | boolean> };
}

export type ReadinessState = "PROJECT_DETECTED" | "SERVER_DISCOVERY" | "VERIFY_IDENTITY" | "START_SERVER" | "WAIT_FOR_READINESS" | "APPLICATION_READY" | "BLOCKED" | "CANCELLED" | "STOPPED";
export interface RuntimeDiagnostics {
  fallbackRoutes?: string[];
  state: ReadinessState;
  transitions: { state: ReadinessState; elapsedMs: number }[];
  url?: string;
  ownership?: "EXTERNAL" | "OWNED";
  identityEvidence?: string;
  startupDurationMs: number;
  readinessDurationMs: number;
  browserAuditDurationMs?: number;
  rejectedCandidates: { url: string; reason: string }[];
  routesDiscovered?: number;
  routesSelected?: number;
  cleanup?: "EXTERNAL_PRESERVED" | "OWNED_STOPPED";
  error?: string;
}

export function runtimeSettings(value: Partial<RuntimeSettings> = {}, ci = false): RuntimeSettings {
  const defaults: RuntimeSettings = {
    startupTimeoutMs: ci ? 90000 : 300000, readinessTimeoutMs: ci ? 90000 : 300000,
    pollingIntervalMs: 2000, browserLaunchTimeoutMs: 30000,
    initialNavigationTimeoutMs: 60000, navigationTimeoutMs: 30000,
    routeTimeoutMs: 240000, compilationRetries: 2, browserConcurrency: 2,
    browserAuditTimeoutMs: ci ? 300000 : 1200000, scanTimeoutMs: ci ? 900000 : 3600000,
    scannerTimeoutMs: 120000, minimumRouteCoveragePercent: 0, maxReadinessHttp500Responses: 3, scannerTimeouts: {}, candidateUrls: [], healthPath: "/", expectedStatuses: [200],
  };
  const merged = { ...defaults, ...value };
  if (!merged.scannerTimeouts || typeof merged.scannerTimeouts !== "object" || Array.isArray(merged.scannerTimeouts)) throw new Error("runtime.scannerTimeouts must be a timeout mapping");
  for (const key of Object.keys(defaults) as (keyof RuntimeSettings)[]) {
    if (typeof defaults[key] !== "number") continue;
    const number = merged[key] as number;
    const maximum = key === "minimumRouteCoveragePercent" ? 100 : key === "maxReadinessHttp500Responses" ? 20 : key === "browserConcurrency" ? 8 : key === "compilationRetries" ? 5 : 3600000;
    const minimum = key === "compilationRetries" || key === "minimumRouteCoveragePercent" ? 0 : 1;
    if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`runtime.${key} must be an integer between ${minimum} and ${maximum}`);
  }
  for (const [name, timeout] of Object.entries(merged.scannerTimeouts)) if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600000) throw new Error(`Invalid runtime.scannerTimeouts.${name}`);
  if (!Array.isArray(merged.expectedStatuses) || !merged.expectedStatuses.length || merged.expectedStatuses.some(status => !Number.isInteger(status) || status < 100 || status > 599)) throw new Error("runtime.expectedStatuses must contain valid HTTP statuses");
  if (!Array.isArray(merged.candidateUrls) || merged.candidateUrls.some(url => typeof url !== "string" || !/^https?:\/\//.test(url))) throw new Error("runtime.candidateUrls must contain HTTP URLs");
  if (typeof merged.healthPath !== "string" || !merged.healthPath.startsWith("/") || merged.healthPath.startsWith("//")) throw new Error("runtime.healthPath must be an origin-relative path");
  if (merged.identity && (typeof merged.identity.path !== "string" || !merged.identity.path.startsWith("/") || merged.identity.path.startsWith("//") || (!merged.identity.text && !merged.identity.json))) throw new Error("runtime.identity needs an origin-relative path and text or JSON marker");
  return merged;
}

export function throwIfCancelled(signal?: AbortSignal): void { signal?.throwIfAborted(); }

export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfCancelled(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason || new Error("Scan cancelled")); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export interface ReadinessClock { now(): number; sleep(ms: number, signal?: AbortSignal): Promise<void> }
export async function awaitReadiness(
  probe: (remainingMs: number) => Promise<void>, timeoutMs: number, intervalMs: number,
  signal?: AbortSignal, alive?: () => boolean,
  clock: ReadinessClock = { now: Date.now, sleep: pause },
): Promise<number> {
  const started = clock.now();
  let reason = "No response";
  while (clock.now() - started < timeoutMs) {
    throwIfCancelled(signal);
    if (alive && !alive()) throw new Error("Server process exited during startup");
    try { await probe(timeoutMs - (clock.now() - started)); return clock.now() - started; }
    catch (error) { throwIfCancelled(signal); if ((error as { retryable?: boolean })?.retryable === false) throw error; reason = error instanceof Error ? error.message : String(error); }
    await clock.sleep(Math.min(intervalMs, Math.max(0, timeoutMs - (clock.now() - started))), signal);
  }
  throw new Error(`Application readiness timed out after ${timeoutMs}ms: ${reason}`);
}

export async function probeHttp(url: string, settings: RuntimeSettings, remainingMs: number, signal?: AbortSignal, state?: { consecutive500: number }): Promise<void> {
  const target = new URL(settings.healthPath, url);
  const response = await fetch(target, { redirect: "manual", signal: AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.min(5000, remainingMs))), ...(signal ? [signal] : [])]) });
  await response.body?.cancel();
  if (state) state.consecutive500 = response.status === 500 ? state.consecutive500 + 1 : 0;
  if (!settings.expectedStatuses.includes(response.status)) {
    const persistent = response.status === 500 && (state?.consecutive500 ?? 0) >= settings.maxReadinessHttp500Responses;
    const blocked = [401,403,404].includes(response.status);
    const message = `Readiness GET ${target.href} returned HTTP ${response.status}${persistent ? ` repeatedly (${state!.consecutive500} consecutive responses); application runtime failure` : blocked ? "; configured readiness route is missing or inaccessible" : ""}`;
    console.log(`[Readiness] ${message}`);
    throw Object.assign(new Error(message), { retryable: !persistent && !blocked });
  }
}

export function isCompilationState(body: string): boolean {
  return /(?:failed to compile|compilation (?:failed|in progress)|webpack compilation error|nextjs-container-errors|vite-error-overlay|ng-error|__next_error__)/i.test(body);
}

export async function navigateReady(page: Page, url: string, settings: RuntimeSettings, initial: boolean, signal?: AbortSignal): Promise<number | undefined> {
  for (let attempt = 0; attempt <= settings.compilationRetries; attempt++) {
    throwIfCancelled(signal);
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: initial ? settings.initialNavigationTimeoutMs : settings.navigationTimeoutMs });
      if (response && [502, 503, 504].includes(response.status())) throw new Error(`Transient route compilation HTTP ${response.status()}`);
      if (await page.locator('nextjs-portal [data-nextjs-error-message], vite-error-overlay').count() || isCompilationState(await page.locator("body").innerText({ timeout: 2000 }).catch(() => ""))) throw new Error("Route compilation in progress or failed");
      if (response && [401, 403].includes(response.status())) throw new Error(`Route blocked by authentication (HTTP ${response.status()})`);
      return response?.status();
    } catch (error) {
      throwIfCancelled(signal);
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === settings.compilationRetries || !/(timeout|timed out|compil|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_REFUSED)/i.test(message)) throw error;
      await pause(settings.pollingIntervalMs, signal);
    }
  }
}
