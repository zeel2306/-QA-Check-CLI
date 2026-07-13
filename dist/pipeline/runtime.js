import { discoverRoutes } from "../crawler.js";
import { LighthouseCheck } from "../checks/lighthouse.js";
import { runBrowserAudit } from "../core/browser.js";
import { startLocalServer } from "../core/runner.js";
export class PipelineRuntime {
    projectPath;
    reportDir;
    routesPromise;
    serverPromise;
    browserAuditPromise;
    constructor(projectPath, reportDir) {
        this.projectPath = projectPath;
        this.reportDir = reportDir;
    }
    async routes() {
        this.routesPromise ??= discoverRoutes(this.projectPath).then((result) => result.routes);
        return this.routesPromise;
    }
    async server() {
        this.serverPromise ??= startLocalServer(this.projectPath);
        return this.serverPromise;
    }
    async browserAudit() {
        this.browserAuditPromise ??= (async () => {
            const [server, routes] = await Promise.all([this.server(), this.routes()]);
            return runBrowserAudit(server.url, routes, this.reportDir);
        })();
        return this.browserAuditPromise;
    }
    async baseUrl() {
        try {
            return (await this.server()).url;
        }
        catch {
            return undefined;
        }
    }
    async stop() {
        if (!this.serverPromise)
            return;
        try {
            await (await this.serverPromise).stop();
        }
        catch {
            // Cleanup should never hide check results.
        }
    }
}
export class RouteDiscoveryCheck {
    runtime;
    name = "Route Discovery";
    constructor(runtime) {
        this.runtime = runtime;
    }
    async run(_projectPath) {
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
export class LazyLighthouseCheck {
    runtime;
    name = "Lighthouse";
    constructor(runtime) {
        this.runtime = runtime;
    }
    async run(projectPath) {
        const started = performance.now();
        try {
            const [server, routes] = await Promise.all([this.runtime.server(), this.runtime.routes()]);
            return new LighthouseCheck(server.url, routes).run(projectPath);
        }
        catch (error) {
            return {
                name: this.name,
                status: "SKIPPED",
                message: error instanceof Error ? error.message : String(error),
                duration: performance.now() - started,
            };
        }
    }
}
