import type lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import { Worker } from "node:worker_threads";
import type { Check, CheckResult } from "../types/result.js";
import { DEFAULT_LIGHTHOUSE_ROUTE_TIMEOUT_MS, lighthouseRouteTimeout } from "../core/lighthouseSettings.js";
import { launchLighthouseChrome } from "../core/lighthouseChrome.js";
import { lighthouseMetrics } from "../core/lighthouseMetrics.js";

interface LighthousePage {
  route: string;
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  bestPractices: number | null;
  metrics: Record<string, number | undefined>;
  lighthouseVersion?: string;
  metricSources?: Record<string, string>;
}

export interface LighthouseToolingDiagnostic { code: string; message: string; route?: string; origin: string; }
export function classifyLighthouseDiagnostics(messages: string[], route: string): LighthouseToolingDiagnostic[] {
  return [...new Set(messages)].map(message => ({ code: /Failed to parse source map/.test(message) ? "SOURCE_MAP_PARSE_FAILED" : "LIGHTHOUSE_TOOLING_WARNING", message, route, origin: "Lighthouse/Chrome DevTools source-map processing" }));
}

function concreteRoutes(routes: string[]): string[] {
  const filtered = routes
    .map((route) => route.replace(/^[A-Z]+\s+/, ""))
    .filter(
      (route) => !/[\[\]:*]/.test(route) && !route.startsWith("/api/") && !route.startsWith("api/")
    );
  if (filtered.length === 0) return [];
  return filtered;
}

function score(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

function getAuditRoutes(routes: string[], fullAudit = false): string[] {
  const pages = concreteRoutes(routes);
  if (pages.length === 0) return [];

  if (fullAudit) {
    return pages;
  }

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const route of pages) {
    const key = route === "/" ? "/" : route.split("/")[1] || "/";

    if (!seen.has(key)) {
      seen.add(key);
      selected.push(route);
    }
  }

  return selected;
}

export interface RouteDiagnostic {
  route: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "SUCCESS" | "FAILED" | "TIMED_OUT";
  error?: string;
  lastPhase?: string;
  phases?: { phase: string; elapsedMs: number }[];
}

export interface LighthouseRuntime {
  launch: typeof launch;
  audit: typeof lighthouse;
  probe?: (url: string) => Promise<void>;
  cancelAudit?: () => Promise<void>;
  auditProgress?: () => { phase: string; events: { phase: string; elapsedMs: number }[] };
  prepareAudit?: () => Promise<void>;
}

// Lighthouse can leave internally detached promises after navigation times out.
// Isolate those jobs so cancelling an audit cannot crash the CLI process.
export function createLighthouseRuntime(workerFactory: (script: string, options: import("node:worker_threads").WorkerOptions) => Worker = (script, options) => new Worker(script, options)): LighthouseRuntime {
  let worker: Worker | undefined;
  let progress = { phase: "NOT_STARTED", events: [] as { phase: string; elapsedMs: number }[] };
  const moduleUrl = import.meta.resolve("lighthouse");
  let ready: Promise<void> | undefined;
  const ensureWorker = () => {
    if (worker) return worker;
    const job = worker = workerFactory(`
        const { parentPort, workerData } = require('node:worker_threads');
        const loaded = Promise.all([import(workerData.moduleUrl), import(workerData.loggerUrl)]);
        let loadedModules;
        loaded.then(modules => { loadedModules = modules; parentPort.postMessage({ ready: true }); }, error => parentPort.postMessage({ error: error.message }));
        const originalError = console.error.bind(console);
        let diagnostics = [];
        console.error = (...args) => {
          if (args[0] === 'Failed to parse source map') diagnostics.push(args.map(arg => arg?.stack || String(arg)).join(' '));
          else originalError(...args);
        };
        parentPort.on('message', ({ url, options }) => {
          diagnostics = [];
          const started = Date.now();
          const phase = text => parentPort.postMessage({ progress: { phase: String(text).slice(0, 180), elapsedMs: Date.now() - started } });
          let logger;
          const status = args => phase(args.slice(1).join(' '));
          const execute = async modules => {
            try {
              phase('MODULE_READY');
              const [{ default: lighthouse }, { default: log }] = modules;
              logger = log;
              logger.events.on('status', status);
              phase('RUNNING_LIGHTHOUSE');
              const result = await lighthouse(url, options);
              const sourceMaps = (result?.artifacts?.SourceMaps || []).map(map => ({ scriptUrl: map.scriptUrl, sourceMapUrl: map.sourceMapUrl, sourcesCount: map.map?.sources?.length, mappingsLength: map.map?.mappings?.length, errorMessage: map.errorMessage }));
              parentPort.postMessage({ lhr: result?.lhr, diagnostics, sourceMaps });
            } catch(error) { parentPort.postMessage({ error: error.message }); }
            finally { logger?.events.removeListener('status', status); }
          };
          if (loadedModules) void execute(loadedModules);
          else { phase('IMPORTING_LIGHTHOUSE'); void loaded.then(execute, error => parentPort.postMessage({ error: error.message })); }
        });
      `, { eval: true, workerData: { moduleUrl, loggerUrl: import.meta.resolve("lighthouse-logger") }, execArgv: [] });
    ready = new Promise<void>((resolve, reject) => {
      const cleanup = () => { job.removeListener('message', message); job.removeListener('error', failure); job.removeListener('exit', exited); };
      const message = (result: any) => { if (result.ready || result.error) { cleanup(); result.error ? reject(new Error(result.error)) : resolve(); } };
      const failure = (error: Error) => { cleanup(); reject(error); };
      const exited = (code: number) => failure(new Error(`Lighthouse worker stopped during initialization (${code})`));
      job.on('message', message); job.once('error', failure); job.once('exit', exited);
    });
    // A route may be cancelled before initialization settles.
    void ready.catch(() => undefined);
    return job;
  };
  return {
    launch: launchLighthouseChrome,
    probe: async (url) => { const response = await fetch(url, { signal: AbortSignal.timeout(5000) }); await response.body?.cancel(); },
    prepareAudit: async () => { ensureWorker(); await ready; },
    audit: ((url, options) => new Promise((resolve, reject) => {
      progress = { phase: "STARTING_WORKER", events: [] };
      const job = ensureWorker();
      const cleanup = () => { job.removeListener('message', onMessage); job.removeListener('error', onError); job.removeListener('exit', onExit); };
      const onMessage = (result: any) => {
        if (result.ready) return;
        if (result.progress) { progress.phase = result.progress.phase; progress.events.push(result.progress); if (progress.events.length > 100) progress.events.splice(10, 1); return; }
        cleanup();
        if (result.error) reject(new Error(result.error));
        else resolve(result);
      };
      const onError = (error: Error) => { cleanup(); worker = undefined; reject(error); };
      const onExit = (code: number) => { cleanup(); worker = undefined; reject(new Error(`Lighthouse worker stopped (${code})`)); };
      job.on('message', onMessage);
      job.once('error', onError);
      job.once('exit', onExit);
      job.postMessage({ url, options });
    })) as typeof lighthouse,
    cancelAudit: async () => { const job = worker; worker = undefined; ready = undefined; if (job) await job.terminate(); },
    auditProgress: () => progress,
  };
}

export class LighthouseCheck implements Check<LighthousePage[]> {
  readonly name = "Lighthouse Performance";
  get timeoutMs() { return this.budgetMs + 15_000; }

  constructor(
    private readonly baseUrl?: string,
    private readonly routes: string[] = [],
    private readonly fullAudit = false,
    private readonly budgetMs = 90_000,
    private readonly runtime: LighthouseRuntime = createLighthouseRuntime(),
    private readonly signal?: AbortSignal,
    private readonly routeBudgetMs = DEFAULT_LIGHTHOUSE_ROUTE_TIMEOUT_MS,
  ) { lighthouseRouteTimeout(routeBudgetMs); }

  async run(_projectPath: string): Promise<CheckResult<LighthousePage[]>> {
    const started = performance.now();
    let finalResult: CheckResult<LighthousePage[]> | undefined;

    if (this.baseUrl && !this.routes.length) {
      return { name: this.name, status: "NOT_APPLICABLE", score: null, message: "No browser-facing routes available for Lighthouse audit", duration: 0, pagesAttempted: 0, pagesCompleted: 0 };
    }
    if (!this.baseUrl) {
      return {
        name: this.name,
        status: "SKIPPED",
        score: null,
        message: "No runtime target available for Lighthouse audit",
        skipReason: "No runtime target available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    if (!this.routes || this.routes.length === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        score: null,
        message: "No routes available for Lighthouse audit",
        skipReason: "No routes available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    const auditRoutes = getAuditRoutes(this.routes, this.fullAudit);
    if (!auditRoutes || auditRoutes.length === 0) {
      return {
        name: this.name,
        status: "NOT_APPLICABLE",
        score: null,
        message: "No browser-facing routes available for Lighthouse audit",
        skipReason: "No browser-facing routes available",
        duration: Math.round(performance.now() - started),
        pagesAttempted: 0,
        pagesCompleted: 0,
      };
    }

    let chrome: Awaited<ReturnType<typeof launch>> | undefined;
    let chromeCleanup: Promise<void> | undefined;
    const cleanupErrors: string[] = [];
    const cleanupEvents: { resource: string; status: string; pid?: number; error?: string }[] = [];
    const cancelWorker = async () => {
      if (!this.runtime.cancelAudit) return;
      try { await this.runtime.cancelAudit(); cleanupEvents.push({ resource: "LIGHTHOUSE_WORKER", status: "STOPPED" }); }
      catch (error) { const message = String(error); cleanupErrors.push(message); cleanupEvents.push({ resource: "LIGHTHOUSE_WORKER", status: "FAILED", error: message }); }
    };
    const stopChrome = () => chromeCleanup ??= Promise.resolve().then(async () => {
      if (!chrome) return;
      try { await chrome.kill(); cleanupEvents.push({ resource: "CHROME", status: "STOPPED", pid: chrome.pid }); }
      catch (error) { const message = String(error); cleanupErrors.push(message); cleanupEvents.push({ resource: "CHROME", status: "FAILED", pid: chrome.pid, error: message }); }
    });
    const routeDiagnostics: RouteDiagnostic[] = [];
    let budgetExhausted = false;
    const recoveryErrors: string[] = [];
    const toolingDiagnostics: LighthouseToolingDiagnostic[] = [];
    const sourceMapArtifacts: { route: string; maps: unknown[] }[] = [];
    const scoredRoutes: string[] = [];
    const initializationDiagnostics: { durationMs: number; status: string }[] = [];
    const pages: LighthousePage[] = [];
    const executionMetadata = (completed = 0) => ({
      routeDiagnostics,
      budgetMs: this.budgetMs,
      routeTimeoutMs: this.routeBudgetMs,
      scoreScope: "COMPLETED_ROUTES_ONLY",
      scoredRoutes,
      selectedRoutes: auditRoutes,
      inventoryRoutes: this.routes.length,
      recoveryErrors,
      cleanupEvents,
      cleanupErrors,
      toolingDiagnostics,
      sourceMapArtifacts,
      initializationDiagnostics,
      unattemptedRoutes: auditRoutes.filter(route => !routeDiagnostics.some(item => item.route === route)),
      stopReason: completed === auditRoutes.length ? "COMPLETED" : budgetExhausted || performance.now() - started >= this.budgetMs ? "TOTAL_BUDGET_EXHAUSTED" : recoveryErrors.length ? "RECOVERY_FAILED" : "ROUTE_FAILURE",
    });
    const cancel = () => { void this.runtime.cancelAudit?.().catch(() => undefined); if (chrome) void stopChrome().catch(() => undefined); };
    this.signal?.addEventListener("abort", cancel, { once: true });

    try {
      this.signal?.throwIfAborted();
      await this.runtime.probe?.(new URL(auditRoutes[0]!, this.baseUrl).href);
      try {
        let expired = false;
        const launching = this.runtime.launch({
          chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"],
        });
        void launching.then(async (instance) => { if (expired) { try { await instance.kill(); } catch { /* Preserve startup diagnostics. */ } } }, () => undefined);
        let launchTimer: ReturnType<typeof setTimeout>;
        chrome = await Promise.race([launching, new Promise<never>((_, reject) => {
          launchTimer = setTimeout(() => { expired = true; reject(new Error("Chrome launch timed out")); }, Math.min(15_000, Math.max(1, this.budgetMs - (performance.now() - started))));
        })]).finally(() => clearTimeout(launchTimer));
      } catch (launchError) {
        return finalResult = {
          name: this.name,
          status: launchError instanceof Error && launchError.message.includes("timed out") ? "TIMEOUT" : "ERROR",
          score: null,
          message: `Chrome launch failed: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
          errorReason: launchError instanceof Error ? launchError.message : String(launchError),
          duration: Math.round(performance.now() - started),
          pagesAttempted: routeDiagnostics.length,
          pagesCompleted: 0,
          pagesDiscovered: auditRoutes.length,
          metadata: executionMetadata(),
        };
      }

      const skipped: string[] = [];

      // Load Lighthouse before timing the first route; initialization still uses
      // the overall budget and has a separate bounded startup allowance.
      const prepareWorker = async () => {
        if (!this.runtime.prepareAudit) return;
        const initStarted = performance.now();
        let status = "SUCCESS";
        let timer: ReturnType<typeof setTimeout>;
        try {
          await Promise.race([this.runtime.prepareAudit(), new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Lighthouse worker initialization timed out")), Math.min(DEFAULT_LIGHTHOUSE_ROUTE_TIMEOUT_MS, Math.max(1, this.budgetMs - (performance.now() - started))));
          })]);
        } catch (error) { status = String(error).includes("timed out") ? "TIMED_OUT" : "FAILED"; throw error; }
        finally { clearTimeout(timer!); initializationDiagnostics.push({ durationMs: Math.round(performance.now() - initStarted), status }); }
      };
      await prepareWorker();

      for (const route of auditRoutes) {
        this.signal?.throwIfAborted();
        if (performance.now() - started >= this.budgetMs) break;
        const routeStart = performance.now();
        const startedAtIso = new Date().toISOString();
        let limitedByTotalBudget = false;

        try {
          const targetUrl = new URL(route, this.baseUrl).href;

          // End-to-end route budget, separate from Lighthouse's load wait.
          const runRouteLighthouse = this.runtime.audit(targetUrl, {
            port: chrome.port,
            output: "json",
            logLevel: "error",
            maxWaitForLoad: 20_000,
            onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
          });

          let timer: ReturnType<typeof setTimeout>;
          const routeTimeout = new Promise<never>((_, reject) => {
            const remaining = Math.max(1, this.budgetMs - (performance.now() - started));
            limitedByTotalBudget = remaining <= this.routeBudgetMs;
            const timeoutMs = Math.min(this.routeBudgetMs, remaining);
            timer = setTimeout(() => reject(new Error(`Route ${route} Lighthouse audit timed out after ${timeoutMs}ms (${limitedByTotalBudget ? "total budget" : "per-route budget"}); last phase: ${this.runtime.auditProgress?.().phase ?? "unknown"}`)), timeoutMs);
          });

          const result = await Promise.race([runRouteLighthouse, routeTimeout]).finally(() => clearTimeout(timer));
          const detailed = result as typeof result & { diagnostics?: string[]; sourceMaps?: unknown[] };
          sourceMapArtifacts.push({ route, maps: detailed?.sourceMaps || [] });
          toolingDiagnostics.push(...classifyLighthouseDiagnostics(detailed?.diagnostics || [], route));
          if (detailed?.diagnostics?.length) console.warn(`[Lighthouse] ${route}: ${detailed.diagnostics.length} source-map parsing diagnostic(s); mapping-dependent results are incomplete. See report metadata.`);
          const finishedAtIso = new Date().toISOString();
          const routeDuration = Math.round(performance.now() - routeStart);

          if (!result || !result.lhr) {
            skipped.push(route);
            routeDiagnostics.push({
              route,
              startedAt: startedAtIso,
              finishedAt: finishedAtIso,
              durationMs: routeDuration,
              status: "FAILED",
              error: "Lighthouse returned empty report",
            });
            continue;
          }
          if (result.lhr.runtimeError) throw new Error(`Lighthouse runtime error ${result.lhr.runtimeError.code}: ${result.lhr.runtimeError.message}`);

          const audits = result.lhr.audits;

          pages.push({
            route,
            performance: score(result.lhr.categories.performance?.score),
            accessibility: score(result.lhr.categories.accessibility?.score),
            seo: score(result.lhr.categories.seo?.score),
            bestPractices: score(result.lhr.categories["best-practices"]?.score),
            lighthouseVersion: result.lhr.lighthouseVersion,
            ...lighthouseMetrics(audits),
          });
          if (score(result.lhr.categories.performance?.score) !== null) scoredRoutes.push(route);

          routeDiagnostics.push({
            route,
            startedAt: startedAtIso,
            finishedAt: finishedAtIso,
            durationMs: routeDuration,
            status: "SUCCESS",
            lastPhase: this.runtime.auditProgress?.().phase,
            phases: this.runtime.auditProgress?.().events.slice(),
          });
        } catch (routeErr: any) {
          const finishedAtIso = new Date().toISOString();
          const routeDuration = Math.round(performance.now() - routeStart);
          const errMsg = routeErr instanceof Error ? routeErr.message : String(routeErr);
          skipped.push(route);

          routeDiagnostics.push({
            route,
            startedAt: startedAtIso,
            finishedAt: finishedAtIso,
            durationMs: routeDuration,
            status: errMsg.includes("timed out") ? "TIMED_OUT" : "FAILED",
            error: errMsg,
            lastPhase: this.runtime.auditProgress?.().phase,
            phases: this.runtime.auditProgress?.().events.slice(),
          });
          // A timed-out Lighthouse job still owns its DevTools session. Stop before reuse.
          if (errMsg.includes("timed out")) {
            await cancelWorker();
            // A route timeout must not contaminate the next route's DevTools session.
            await stopChrome();
            if (cleanupErrors.length) break;
            if (limitedByTotalBudget) { budgetExhausted = true; break; }
            if (performance.now() - started >= this.budgetMs) break;
            chromeCleanup = undefined;
            chrome = undefined;
            let expired = false;
            let timer: ReturnType<typeof setTimeout>;
            const restarting = this.runtime.launch({ chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"] });
            void restarting.then(instance => { if (expired) void Promise.resolve().then(() => instance.kill()).catch(() => undefined); }, () => undefined);
            try {
              chrome = await Promise.race([restarting, new Promise<never>((_, reject) => {
                timer = setTimeout(() => { expired = true; reject(new Error("Chrome recovery timed out")); }, Math.min(15_000, Math.max(1, this.budgetMs - (performance.now() - started))));
              })]).finally(() => clearTimeout(timer));
              await prepareWorker();
            } catch (error) { recoveryErrors.push(error instanceof Error ? error.message : String(error)); break; }
          }
        }
      }

      if (pages.length === 0) {
        return finalResult = {
          name: this.name,
          status: routeDiagnostics.some((d) => d.status === "TIMED_OUT") || performance.now() - started >= this.budgetMs ? "TIMEOUT" : skipped.length > 0 ? "ERROR" : "SKIPPED",
          score: null,
          message: `Lighthouse completed 0/${auditRoutes.length} selected page(s); ${skipped.length} attempted page(s) failed`,
          errorReason: `No selected page completed Lighthouse execution`,
          duration: Math.round(performance.now() - started),
          pagesAttempted: routeDiagnostics.length,
          pagesCompleted: 0,
          pagesDiscovered: auditRoutes.length,
          metadata: {
            ...executionMetadata(),
          },
          data: [],
        };
      }

      const validPerf = pages.map((p) => p.performance).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
      const validA11y = pages.map((p) => p.accessibility).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
      const validBp = pages.map((p) => p.bestPractices).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
      const validSeo = pages.map((p) => p.seo).filter((s): s is number => typeof s === "number" && !Number.isNaN(s));

      const accessibilityAvg = validA11y.length ? Math.round(validA11y.reduce((sum, p) => sum + p, 0) / validA11y.length) : null;
      const bestPracticesAvg = validBp.length ? Math.round(validBp.reduce((sum, p) => sum + p, 0) / validBp.length) : null;
      const seoAvg = validSeo.length ? Math.round(validSeo.reduce((sum, p) => sum + p, 0) / validSeo.length) : null;

      if (validPerf.length === 0) {
        return finalResult = {
          name: this.name,
          status: pages.length < auditRoutes.length ? "PARTIAL" : "SKIPPED",
          score: null,
          message: `${pages.length}/${auditRoutes.length} page(s) audited — Performance score unavailable (NO_FCP)`,
          skipReason: "Lighthouse performance score unavailable",
          duration: Math.round(performance.now() - started),
          pagesDiscovered: auditRoutes.length,
          pagesAttempted: routeDiagnostics.length,
          pagesCompleted: pages.length,
          metadata: {
            metric: "Lighthouse Performance",
            categoryScores: {
              performance: null,
              accessibility: accessibilityAvg,
              bestPractices: bestPracticesAvg,
              seo: seoAvg,
            },
            ...executionMetadata(pages.length),
          },
          data: pages,
        };
      }

      const performanceAvg = Math.round(validPerf.reduce((sum, p) => sum + p, 0) / validPerf.length);
      const status = pages.length < auditRoutes.length || validPerf.length < pages.length || toolingDiagnostics.length ? "PARTIAL" : performanceAvg >= 90 ? "PASS" : performanceAvg >= 50 ? "WARNING" : "FAIL";

      return finalResult = {
        name: this.name,
        status,
        score: performanceAvg,
        message: `${pages.length}/${auditRoutes.length} page(s) audited — Performance: ${performanceAvg} (average of ${validPerf.length} scored completed route(s) only) | Accessibility: ${accessibilityAvg} | Best Practices: ${bestPracticesAvg} | SEO: ${seoAvg}${toolingDiagnostics.length ? `; ${toolingDiagnostics.length} source-map diagnostic(s): mapping-dependent evidence is incomplete` : ""}`,
        duration: Math.round(performance.now() - started),
        pagesDiscovered: auditRoutes.length,
        pagesAttempted: routeDiagnostics.length,
        pagesCompleted: pages.length,
        metadata: {
          metric: "Lighthouse Performance",
          categoryScores: {
            performance: performanceAvg,
            accessibility: accessibilityAvg,
            bestPractices: bestPracticesAvg,
            seo: seoAvg,
          },
          ...executionMetadata(pages.length),
        },
        data: pages,
      };
    } catch (error) {
      const scores = pages.map(page => page.performance).filter((value): value is number => typeof value === "number");
      return finalResult = {
        name: this.name,
        status: pages.length ? "PARTIAL" : error instanceof Error && error.message.includes("timed out") ? "TIMEOUT" : "ERROR",
        score: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
        message: error instanceof Error ? error.message : String(error),
        errorReason: error instanceof Error ? error.message : String(error),
        duration: Math.round(performance.now() - started),
        pagesAttempted: routeDiagnostics.length,
        pagesCompleted: pages.length,
        pagesDiscovered: auditRoutes.length,
        metadata: {
          ...executionMetadata(pages.length),
        },
        data: pages,
      };
    } finally {
      this.signal?.removeEventListener("abort", cancel);
      await cancelWorker();
      await stopChrome();
      if (cleanupErrors.length && finalResult) {
        if (["PASS", "WARNING"].includes(finalResult.status)) finalResult.status = "PARTIAL";
        finalResult.message = `${finalResult.message}; cleanup incomplete: ${cleanupErrors.join("; ")}`;
        finalResult.metadata = { ...finalResult.metadata, stopReason: "CLEANUP_FAILED" };
      }
      if (finalResult) {
        finalResult.pageSummary = {
          eligible: auditRoutes.length,
          attempted: routeDiagnostics.length,
          completed: pages.length,
          passed: pages.length,
          failed: routeDiagnostics.filter(route => route.status === "FAILED").length,
          timedOut: routeDiagnostics.filter(route => route.status === "TIMED_OUT").length,
          blocked: 0,
          unverified: auditRoutes.length - routeDiagnostics.length,
        };
        finalResult.routeAudits = auditRoutes.map(route => {
          const diagnostic = routeDiagnostics.find(item => item.route === route);
          return { route, status: diagnostic?.status === "SUCCESS" ? "PASSED" : diagnostic?.status ?? "SKIPPED", durationMs: diagnostic?.durationMs, errorMessage: diagnostic?.error ?? (diagnostic ? undefined : "Not audited; score unavailable") };
        });
      }
    }
  }
}
