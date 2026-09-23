import path from "path";
import { discoverRoutes } from "../crawler.js";
import { LighthouseCheck } from "../checks/lighthouse.js";
import { runBrowserAudit, type BrowserAudit } from "../core/browser.js";
import { startLocalServer, type LocalServer } from "../core/runner.js";
import type { QaEngineOptions } from "../core/engine.js";
import type { Check, CheckResult } from "../types/result.js";

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";

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

  async routes(): Promise<string[]> {
    this.routesPromise ??= discoverRoutes(this.projectPath).then((result) =>
      applyRouteOptions(result.routes, this.options),
    );
    return this.routesPromise;
  }

  async server(): Promise<LocalServer> {
    this.serverPromise ??= startLocalServer(this.projectPath);
    return this.serverPromise;
  }

  async browserAudit(): Promise<BrowserAudit> {
    this.browserAuditPromise ??= (async () => {
      const [server, routes] = await Promise.all([this.server(), this.routes()]);
      return runBrowserAudit(server.url, routes, this.reportDir);
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

export class RouteDiscoveryCheck implements Check<{ routes: string[] }> {
  readonly name = "Route Discovery";

  constructor(private readonly runtime: PipelineRuntime) {}

  async run(_projectPath: string): Promise<CheckResult<{ routes: string[] }>> {
    const started = performance.now();
    const routes = await this.runtime.routes();

    return {
      name: this.name,
      status: routes.length ? "PASS" : "WARNING",
      message: `${routes.length} routes`,
      duration: performance.now() - started,
      data: { routes },
    };
  }
}

export class LazyLighthouseCheck implements Check {
  readonly name = "Lighthouse";

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
