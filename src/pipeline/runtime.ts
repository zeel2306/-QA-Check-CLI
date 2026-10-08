import path from "path";
import { discoverRoutes } from "../crawler.js";
import { LighthouseCheck } from "../checks/lighthouse.js";
import { ApiTestingCheck } from "../checks/api.js";
import { runBrowserAudit, type BrowserAudit } from "../core/browser.js";
import { startLocalServer, type LocalServer } from "../core/runner.js";
import type { QaEngineOptions } from "../core/engine.js";
import type { Check, CheckResult } from "../types/result.js";

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
  private serverPromise?: Promise<LocalServer>;
  private browserAuditPromise?: Promise<BrowserAudit>;

  constructor(
    private readonly projectPath: string,
    private readonly reportDir: string,
    private readonly options: QaEngineOptions = {},
  ) {}

  getOptions(): QaEngineOptions {
    return this.options;
  }

  async routes(): Promise<string[]> {
    this.routesPromise ??= discoverRoutes(this.projectPath).then((result) =>
      applyRouteOptions(result.routes, this.options),
    );
    return this.routesPromise;
  }

  async server(): Promise<LocalServer> {
    const customUrl = this.options.url || this.options.baseUrl;
    this.serverPromise ??= startLocalServer(this.projectPath, customUrl);
    return this.serverPromise;
  }

  async browserAudit(): Promise<BrowserAudit> {
    this.browserAuditPromise ??= (async () => {
      const [server, routes] = await Promise.all([this.server(), this.routes()]);
      let authSession: import("../core/auth.js").AuthSession | undefined;
      if (this.options.auth) {
        const { authenticateSession } = await import("../core/auth.js");
        authSession = await authenticateSession(this.options.auth, server.url);
      }
      return runBrowserAudit(server.url, routes, this.reportDir, authSession);
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
      await (await this.serverPromise).stop();
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
      return !/[\[\]:*]/.test(pathOnly) && !pathOnly.startsWith("/api/") && !pathOnly.startsWith("api/");
    });
    const apiRoutesDiscovered = routes.filter((r) => {
      const pathOnly = r.replace(/^[A-Z]+\s+/, "");
      return pathOnly.startsWith("/api/") || pathOnly.startsWith("api/");
    });
    const dynamicRoutesUnresolved = routes.filter((r) => {
      const pathOnly = r.replace(/^[A-Z]+\s+/, "");
      return /[\[\]:*]/.test(pathOnly);
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
    try {
      const server = await this.runtime.server();
      baseUrl = server.url.replace(/\/$/, "");
    } catch (err) {
      return {
        name: this.name,
        category: "api",
        status: "ERROR",
        score: 0,
        message: `Local server failed to start: ${err instanceof Error ? err.message : String(err)}`,
        duration: performance.now() - started,
      };
    }

    const rebasedCases = testCases.map((tc) => {
      let targetUrl = tc.url;
      try {
        const u = new URL(targetUrl);
        if (
          u.hostname === "127.0.0.1" ||
          u.hostname === "localhost" ||
          u.hostname === "0.0.0.0"
        ) {
          targetUrl = `${baseUrl}${u.pathname}${u.search}`;
        }
      } catch {
        if (targetUrl.startsWith("/")) {
          targetUrl = `${baseUrl}${targetUrl}`;
        } else {
          targetUrl = `${baseUrl}/${targetUrl}`;
        }
      }
      return { ...tc, url: targetUrl };
    });

    return new ApiTestingCheck(rebasedCases).run(projectPath);
  }
}

export class LazyLighthouseCheck implements Check {
  readonly name = "Lighthouse Performance";
  readonly timeoutMs = 180_000;

  constructor(private readonly runtime: PipelineRuntime) {}

  async run(projectPath: string): Promise<CheckResult> {
    const started = performance.now();

    try {
      const [server, routes] = await Promise.all([this.runtime.server(), this.runtime.routes()]);
      return new LighthouseCheck(server.url, routes).run(projectPath);
    } catch (error) {
      return {
        name: this.name,
        status: "SKIPPED",
        message: error instanceof Error ? error.message : String(error),
        duration: performance.now() - started,
      };
    }
  }
}
