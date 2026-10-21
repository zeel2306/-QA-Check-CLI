import path from "path";
import fs from "fs/promises";
import fg from "../utils/sourceGlob.js";
import { discoverRoutes } from "../crawler.js";
import { LighthouseCheck } from "../checks/lighthouse.js";
import { ApiTestingCheck, verifyApiTarget } from "../checks/api.js";
import { runBrowserAudit, type BrowserAudit } from "../core/browser.js";
import { startLocalServer, type LocalServer } from "../core/runner.js";
import type { QaEngineOptions } from "../core/engine.js";
import type { Check, CheckResult } from "../types/result.js";
import { chromium } from "playwright";
import { runtimeSettings, awaitReadiness, navigateReady, throwIfCancelled, type RuntimeDiagnostics, type RuntimeSettings, type ReadinessState } from "../core/readiness.js";
import { discoverExistingServer, verifyIdentity } from "../core/serverDiscovery.js";

export const BROWSER_CHECK_NAMES = new Set(["SEO", "Accessibility", "Responsive", "Performance", "Broken Links", "Broken Images", "Console Errors", "Network Errors", "Lighthouse Performance"]);

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";

  const methodMatch = trimmed.match(/^([A-Z]+)\s+(.+)$/);
  if (methodMatch) {
    const method = methodMatch[1];
    let pathPart = methodMatch[2].replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || "/";
    if (!pathPart.startsWith("/")) pathPart = `/${pathPart}`;
    return `${method} ${pathPart}`;
  }

  const pathOnly = trimmed.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || "/";
  return pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
}

function uniqueRoutes(routes: string[]): string[] {
  return [...new Set(routes.map(normalizeRoute))];
}

function matchesRoutePattern(route: string, pattern: string): boolean {
  const normalizedPattern = normalizeRoute(pattern);

  if (normalizedPattern.endsWith("*")) {
    return route.startsWith(normalizedPattern.slice(0, -1));
  }

  return route === normalizedPattern || route.startsWith(`${normalizedPattern}/`);
}

function applyRouteOptions(routes: string[], options: QaEngineOptions): string[] {
  const included = options.includeRoutes?.length
    ? uniqueRoutes(options.includeRoutes)
    : uniqueRoutes(routes);
  const ignored = uniqueRoutes(options.ignoreRoutes ?? []);
  const filtered = ignored.length
    ? included.filter((route) => !ignored.some((pattern) => matchesRoutePattern(route, pattern)))
    : included;

  return typeof options.maxRoutes === "number" && options.maxRoutes > 0
    ? filtered.slice(0, options.maxRoutes)
    : filtered;
}

export class PipelineRuntime {
  private routesPromise?: Promise<string[]>;
  private discoveredRoutesPromise?: Promise<string[]>;
  private fallbackRoutes: string[] = [];
  async discoveredFallbackRoutes(): Promise<string[]> { await this.discoveredRoutes(); return this.fallbackRoutes; }
  private serverPromise?: Promise<LocalServer>;
  private browserAuditPromise?: Promise<BrowserAudit>;
  private browserRoutesPromise?: Promise<string[]>;
  private authSession?: import("../core/auth.js").AuthSession;
  private checkSignal?: AbortSignal;
  setCheckSignal(signal?: AbortSignal): void { this.checkSignal = signal; }
  scannerSignal(): AbortSignal | undefined { return this.checkSignal || this.options.signal; }
  readonly settings: RuntimeSettings;
  readonly diagnostics: RuntimeDiagnostics = { state: "PROJECT_DETECTED", transitions: [], startupDurationMs: 0, readinessDurationMs: 0, rejectedCandidates: [] };
  private readonly createdAt = performance.now();

  constructor(
    private readonly projectPath: string,
    private readonly reportDir: string,
    private readonly options: QaEngineOptions = {},
  ) { this.settings = runtimeSettings(options.runtime, options.ci); this.transition("PROJECT_DETECTED"); }

  private transition(state: ReadinessState): void { this.diagnostics.state = state; this.diagnostics.transitions.push({ state, elapsedMs: Math.round(performance.now() - this.createdAt) }); }

  async prepareCheck(name: string): Promise<void> {
    throwIfCancelled(this.options.signal);
    if (name === "API Testing") {
      if (this.options.apiTestCases?.some(test => !/^https?:\/\//i.test(test.url))) await this.server();
      return;
    }
    if (!BROWSER_CHECK_NAMES.has(name)) return;
    // Shared evidence has its own bounded budget; scanner evaluation starts afterwards.
    if ((await this.browserRoutes()).length) await this.browserAudit();
  }

  auditEvidence(): Promise<BrowserAudit> | undefined { return this.browserAuditPromise; }

  getOptions(): QaEngineOptions {
    return this.options;
  }

  async browserRoutes(): Promise<string[]> {
    this.browserRoutesPromise ??= this.resolveBrowserRoutes();
    return this.browserRoutesPromise;
  }

  private async resolveBrowserRoutes(): Promise<string[]> {
    const routes = await this.routes();
    if (this.options.includeRoutes?.length) return routes;
    const laravel = await fs.access(path.join(this.projectPath, "artisan")).then(() => true, () => false);
    if (laravel) {
      const views = await fg(["resources/views/**/*.blade.php", "public/**/*.html"], { cwd: this.projectPath });
      if (!views.length) return [];
    }
    if (!routes.some((route) => route.endsWith(".html"))) return routes;
    const server = await this.server();
    const resolved: string[] = [];
    for (const route of routes) {
      if (!route.endsWith(".html")) { resolved.push(route); continue; }
      try {
        const response = await fetch(new URL(route, server.url), { method: "HEAD", signal: AbortSignal.timeout(2000) });
        await response.body?.cancel();
        if (response.status === 404) {
          const alternate = route.slice(0, -5);
          const candidate = await fetch(new URL(alternate, server.url), { method: "HEAD", signal: AbortSignal.timeout(2000) });
          await candidate.body?.cancel();
          if (candidate.ok) { resolved.push(alternate); continue; }
        }
      } catch { /* Preserve discovered path when runtime resolution is unavailable. */ }
      resolved.push(route);
    }
    return resolved;
  }

  async routes(): Promise<string[]> {
    this.routesPromise ??= this.discoveredRoutes().then(routes => { const selected = applyRouteOptions(routes, this.options); this.diagnostics.routesDiscovered = routes.length; this.diagnostics.routesSelected = selected.length; return selected; });
    return this.routesPromise;
  }

  async discoveredRoutes(): Promise<string[]> { this.discoveredRoutesPromise ??= discoverRoutes(this.projectPath).then(result => { this.fallbackRoutes = result.fallbackRoutes || []; this.diagnostics.fallbackRoutes = this.fallbackRoutes; return uniqueRoutes(result.routes); }); return this.discoveredRoutesPromise; }

  async server(): Promise<LocalServer> {
    this.serverPromise ??= this.resolveServer();
    return this.serverPromise;
  }

  private async resolveServer(): Promise<LocalServer> {
    this.transition("SERVER_DISCOVERY");
    const started = performance.now();
    let server: LocalServer | undefined;
    try {
      let customUrl = this.options.url || this.options.baseUrl;
      if (customUrl) {
        this.diagnostics.url = customUrl;
        this.diagnostics.ownership = "EXTERNAL";
        this.transition("VERIFY_IDENTITY");
        let consecutive500 = 0;
        if (this.settings.identity) await awaitReadiness(async () => {
          const identity = await verifyIdentity(this.projectPath, customUrl!, this.settings);
          consecutive500 = identity.httpStatus === 500 ? consecutive500 + 1 : 0;
          if (!identity.verified) {
            const identityUrl = new URL(this.settings.identity!.path, customUrl!).href;
            const persistent = consecutive500 >= this.settings.maxReadinessHttp500Responses;
            const error = Object.assign(new Error(`Identity GET ${identityUrl}: ${identity.httpStatus ? `HTTP ${identity.httpStatus}; ` : ""}${identity.reason === "MISMATCH" ? "Explicit target does not match configured application identity" : persistent ? "persistent application runtime failure" : "Application identity endpoint is not ready"}`), { retryable: identity.reason !== "MISMATCH" && !persistent });
            console.log(`[Readiness] ${error.message}`);
            throw error;
          }
        }, this.settings.readinessTimeoutMs, this.settings.pollingIntervalMs, this.options.signal);
        this.diagnostics.identityEvidence = this.settings.identity ? "Explicit URL and configured identity marker" : "Explicit user-configured URL";
      } else {
        this.transition("VERIFY_IDENTITY");
        const existing = await discoverExistingServer(this.projectPath, this.settings, this.diagnostics.rejectedCandidates);
        if (existing) { customUrl = existing.url; this.diagnostics.identityEvidence = existing.evidence; }
      }
      throwIfCancelled(this.options.signal);
      this.transition(customUrl ? "WAIT_FOR_READINESS" : "START_SERVER");
      this.diagnostics.ownership = customUrl ? "EXTERNAL" : "OWNED";
      if (customUrl) this.diagnostics.url = customUrl;
      const serverStarted = performance.now();
      server = await startLocalServer(this.projectPath, customUrl, { settings: this.settings, signal: this.options.signal });
      this.diagnostics.startupDurationMs = customUrl ? 0 : server.diagnostics?.startupElapsedMs ?? Math.round(performance.now() - serverStarted);
      this.diagnostics.url = server.url;
      this.diagnostics.ownership = server.ownedProcess === false ? "EXTERNAL" : "OWNED";
      this.diagnostics.identityEvidence ||= "Isolated CLI-owned server in project directory";
      this.transition("WAIT_FOR_READINESS");
      const readyStarted = performance.now();
      const routes = await this.routes();
      const laravelApiOnly = await fs.access(path.join(this.projectPath, "artisan")).then(async () => !(await fg(["resources/views/**/*.blade.php", "public/**/*.html"], { cwd: this.projectPath })).length, () => false);
      const targets = this.options.includeRoutes?.length ? uniqueRoutes(this.options.includeRoutes) : routes;
      const target = targets.find(route => !/[\[\]{}:*]/.test(route) && !/^(?:[A-Z]+\s+|\/api\/)/.test(route));
      if (target && !laravelApiOnly) {
        const browser = await chromium.launch({ headless: true, timeout: this.settings.browserLaunchTimeoutMs });
        const cancel = () => { void browser.close().catch(() => undefined); };
        this.options.signal?.addEventListener("abort", cancel, { once: true });
        try {
          if (this.options.auth) {
            const { authenticateSession } = await import("../core/auth.js");
            this.authSession = await authenticateSession(this.options.auth, server.url);
          }
          const context = await browser.newContext({ extraHTTPHeaders: this.authSession?.headers });
          if (this.authSession?.cookies?.length) await context.addCookies(this.authSession.cookies);
          const page = await context.newPage();
          await navigateReady(page, new URL(target, server.url).href, this.settings, true, this.options.signal);
        } finally { this.options.signal?.removeEventListener("abort", cancel); await browser.close(); }
      }
      this.diagnostics.readinessDurationMs = Math.round(performance.now() - (customUrl ? started : readyStarted)) + (customUrl ? 0 : server.diagnostics?.readinessElapsedMs ?? 0);
      this.transition("APPLICATION_READY");
      console.log(`Runtime URL: ${server.url}\nServer: ${customUrl ? "EXISTING" : "STARTED"}\nOwnership: ${this.diagnostics.ownership}\n✔ Application ready`);
      return server;
    } catch (error) {
      if (server?.ownedProcess !== false) await server?.stop();
      this.diagnostics.error = error instanceof Error ? error.message : String(error);
      this.diagnostics.readinessDurationMs ||= Math.round(performance.now() - started);
      const startupFailure = error as { diagnostics?: { startupElapsedMs?: number; readinessElapsedMs?: number } };
      if (startupFailure.diagnostics) {
        this.diagnostics.startupDurationMs = startupFailure.diagnostics.startupElapsedMs ?? 0;
        this.diagnostics.readinessDurationMs = startupFailure.diagnostics.readinessElapsedMs ?? this.diagnostics.readinessDurationMs;
      }
      if (this.diagnostics.ownership === "OWNED") this.diagnostics.cleanup = "OWNED_STOPPED";
      if (this.diagnostics.ownership === "EXTERNAL") this.diagnostics.cleanup = "EXTERNAL_PRESERVED";
      this.transition(this.options.signal?.aborted ? "CANCELLED" : "BLOCKED");
      throw error;
    }
  }

  async browserAudit(): Promise<BrowserAudit> {
    this.browserAuditPromise ??= (async () => {
      const routes = await this.browserRoutes();
      if (!routes.length) return runBrowserAudit("", [], this.reportDir);
      const server = await this.server();
      let authSession = this.authSession;
      if (this.options.auth && !authSession) {
        const { authenticateSession } = await import("../core/auth.js");
        authSession = await authenticateSession(this.options.auth, server.url);
      }
      const started = performance.now();
      try { return await runBrowserAudit(server.url, routes, this.reportDir, authSession, this.settings, this.options.signal, this.options.formLabelPolicy); }
      finally { this.diagnostics.browserAuditDurationMs = Math.round(performance.now() - started); }
    })();

    return this.browserAuditPromise;
  }

  async baseUrl(): Promise<string | undefined> {
    try {
      return (await this.server()).url;
    } catch {
      return undefined;
    }
  }

  async stop(): Promise<void> {
    if (!this.serverPromise) return;
    try {
      const server = await this.serverPromise;
      if (server.ownedProcess !== false) {
        await server.stop();
        this.diagnostics.cleanup = "OWNED_STOPPED";
      } else {
        this.diagnostics.cleanup = "EXTERNAL_PRESERVED";
      }
      this.transition("STOPPED");
    } catch {
      // Cleanup should never hide check results.
    }
  }
}

export class RouteDiscoveryCheck implements Check {
  readonly name = "Route Discovery";

  constructor(private readonly runtime: PipelineRuntime) {}

  async run(_projectPath: string): Promise<CheckResult> {
    const started = performance.now();
    const routes = await this.runtime.routes();
    const browserRoutesResolved = routes.filter((r) => {
      const pathOnly = r.replace(/^[A-Z]+\s+/, "");
      return !/[\[\]{}:*]/.test(pathOnly) && !pathOnly.startsWith("/api/") && !pathOnly.startsWith("api/");
    });
    const apiRoutesDiscovered = routes.filter((r) => {
      const pathOnly = r.replace(/^[A-Z]+\s+/, "");
      return pathOnly.startsWith("/api/") || pathOnly.startsWith("api/");
    });
    const dynamicRoutesUnresolved = routes.filter((r) => {
      const pathOnly = r.replace(/^[A-Z]+\s+/, "");
      return /[\[\]{}:*]/.test(pathOnly);
    });

    return {
      name: this.name,
      status: routes.length ? "PASS" : "WARNING",
      message: `${routes.length} route(s) discovered (${browserRoutesResolved.length} browser, ${apiRoutesDiscovered.length} API, ${dynamicRoutesUnresolved.length} dynamic)`,
      duration: Math.round(performance.now() - started),
      data: {
        routes,
        routesDiscovered: routes,
        browserRoutesResolved,
        apiRoutesDiscovered,
        dynamicRoutesUnresolved,
        fallbackRoutes: await this.runtime.discoveredFallbackRoutes(),
      },
    };
  }
}

export class LazyApiTestingCheck implements Check {
  readonly name = "API Testing";

  constructor(private readonly runtime: PipelineRuntime) {}

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();
    const testCases = this.runtime.getOptions().apiTestCases;
    if (!testCases || testCases.length === 0) {
      return {
        name: this.name,
        category: "api",
        status: "SKIPPED",
        score: 100,
        message: "No API test cases configured",
        duration: performance.now() - started,
        data: { total: 0, passed: 0, failed: 0, results: [] },
      };
    }

    let baseUrl = "";
    let ownedTarget = false;
    try {
      if (testCases.some(test => !/^https?:\/\//i.test(test.url))) {
        const server = await this.runtime.server();
        baseUrl = server.url.replace(/\/$/, "");
        ownedTarget = server.ownedProcess !== false;
      }
    } catch (err) {
      return {
        name: this.name,
        category: "api",
        status: "BLOCKED",
        score: null,
        message: `Local server failed to start: ${err instanceof Error ? err.message : String(err)}`,
        duration: performance.now() - started,
      };
    }

    const rebasedCases = testCases.map((tc) => {
      let targetUrl = tc.url;
      try {
        const u = new URL(targetUrl);
        // Absolute URLs are explicit user targets and must never be silently retargeted.
        targetUrl = u.href;
      } catch {
        if (targetUrl.startsWith("/")) {
          targetUrl = `${baseUrl}${targetUrl}`;
        } else {
          targetUrl = `${baseUrl}/${targetUrl}`;
        }
      }
      return { ...tc, url: targetUrl };
    });

    // Explicit external targets need a configured, safe JSON witness before write scenarios.
    const externalOrigins = new Set(rebasedCases.filter((tc) => !ownedTarget || new URL(tc.url).origin !== new URL(baseUrl).origin).map((tc) => new URL(tc.url).origin));
    for (const origin of externalOrigins) {
      const witness = rebasedCases.find((tc) => new URL(tc.url).origin === origin && (!tc.method || tc.method === "GET") && (tc.expect?.status ?? 200) === 200);
      if (!witness) return { name: this.name, category: "api", status: "BLOCKED", message: `External API target ${origin} has no configured successful JSON readiness witness`, duration: performance.now() - started };
      try { await verifyApiTarget(witness); } catch (error) {
        return { name: this.name, category: "api", status: "BLOCKED", message: `API target verification failed: ${error instanceof Error ? error.message : String(error)}`, duration: performance.now() - started };
      }
    }
    return new ApiTestingCheck(rebasedCases, await this.runtime.routes(), this.runtime.scannerSignal()).run(projectPath);
  }
}

export class LazyLighthouseCheck implements Check {
  readonly name = "Lighthouse Performance";
  get timeoutMs() { return (this.runtime.getOptions().lighthouseBudgetMs ?? 90_000) + 15_000; }

  constructor(private readonly runtime: PipelineRuntime) {}

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();

    try {
      const routes = await this.runtime.browserRoutes();
      if (!routes.length) return { name: this.name, status: "NOT_APPLICABLE", score: null, message: "No browser-facing routes available for Lighthouse audit", duration: performance.now() - started, pagesAttempted: 0, pagesCompleted: 0 };
      const server = await this.runtime.server();
      return new LighthouseCheck(server.url, routes, false, this.runtime.getOptions().lighthouseBudgetMs, undefined, this.runtime.scannerSignal(), this.runtime.getOptions().lighthouseRouteTimeoutMs).run(projectPath);
    } catch (error) {
      return {
        name: this.name,
        status: "BLOCKED",
        message: error instanceof Error ? error.message : String(error),
        duration: performance.now() - started,
      };
    }
  }
}
