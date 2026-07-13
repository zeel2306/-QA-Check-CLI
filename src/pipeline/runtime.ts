import path from "path";
import { discoverRoutes } from "../crawler.js";
import { LighthouseCheck } from "../checks/lighthouse.js";
import { runBrowserAudit, type BrowserAudit } from "../core/browser.js";
import { startLocalServer, type LocalServer } from "../core/runner.js";
import type { Check, CheckResult } from "../types/result.js";

export class PipelineRuntime {
  private routesPromise?: Promise<string[]>;
  private serverPromise?: Promise<LocalServer>;
  private browserAuditPromise?: Promise<BrowserAudit>;

  constructor(
    private readonly projectPath: string,
    private readonly reportDir: string,
  ) {}

  async routes(): Promise<string[]> {
    this.routesPromise ??= discoverRoutes(this.projectPath).then((result) => result.routes);
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
